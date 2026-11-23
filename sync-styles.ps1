[CmdletBinding()]
param(
  [string]$RemoteUser = "ubuntu",
  [string]$RemoteHost = "118.25.188.55",
  [int]$RemotePort = 2222,
  [string]$RemoteAppPath = "/srv/prompt-gallery",
  [string]$RemoteTempTar = "/tmp/prompt-gallery-sync-styles.tgz",
  [string]$IdentityFile = "",
  [switch]$SetupKey
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSCommandPath
$dataDir = Join-Path $repoRoot "data"
$publicDir = Join-Path $repoRoot "public"
$localTempTar = Join-Path $env:TEMP "prompt-gallery-sync-styles.tgz"

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

function Run-Step {
  param(
    [string]$Title,
    [scriptblock]$Action
  )

  Write-Host ""
  Write-Host "==> $Title" -ForegroundColor Cyan
  & $Action
  if ($LASTEXITCODE -ne 0) {
    throw "$Title failed with exit code $LASTEXITCODE"
  }
}

function Get-UnixEpochSeconds {
  param([datetime]$Dt)
  return [DateTimeOffset]::new($Dt.ToUniversalTime()).ToUnixTimeSeconds()
}

function Get-RemoteSha256Map {
  param([string]$RemoteDir)

  # 一次取回整个目录的哈希，避免逐文件 ssh 往返。
  $raw = & ssh @sshArgs "${RemoteUser}@${RemoteHost}" "cd '${RemoteAppPath}/public' && find '${RemoteDir}' -type f -exec sha256sum {} +" 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "获取远程 ${RemoteDir} 文件哈希失败"
  }

  $prefix = "${RemoteDir}/"
  $map = @{}
  foreach ($line in $raw) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $idx = $line.IndexOf(' ')
    if ($idx -lt 0) { continue }
    $hash = $line.Substring(0, $idx).ToLowerInvariant()
    $rel = $line.Substring($idx + 1).TrimStart(' ')
    if ($rel.StartsWith("./")) { $rel = $rel.Substring(2) }
    if ($rel.StartsWith($prefix)) { $rel = $rel.Substring($prefix.Length) }
    $map[$rel] = $hash
  }
  return $map
}

function Sync-IncrementalDirectory {
  param(
    [string]$RemoteDir,
    [string]$PublicDir,
    [string]$RemoteTempTar,
    [string]$LocalTempTar
  )

  $localBase = Join-Path $PublicDir $RemoteDir
  New-Item -ItemType Directory -Force -Path $localBase | Out-Null

  # 1. 获取远程文件清单: 大小|修改时间(秒)|相对路径
  Write-Host "  获取远程文件清单 ..." -ForegroundColor Gray
  $remoteRaw = & ssh @sshArgs "${RemoteUser}@${RemoteHost}" "cd '${RemoteAppPath}/public' && find '${RemoteDir}' -type f -exec stat -c '%s|%Y|%n' {} +" 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "获取远程 ${RemoteDir} 文件清单失败"
  }

  $prefix = "${RemoteDir}/"
  $remoteFiles = @{}
  foreach ($line in $remoteRaw) {
    if ([string]::IsNullOrWhiteSpace($line)) { continue }
    $parts = $line.Split('|')
    if ($parts.Count -lt 3) { continue }
    $rel = $parts[2]
    if ($rel.StartsWith($prefix)) { $rel = $rel.Substring($prefix.Length) }
    $remoteFiles[$rel] = @{ size = [int64]$parts[0]; mtime = [int64]$parts[1] }
  }

  # 2. 获取本地文件清单
  $localFiles = @{}
  if (Test-Path $localBase) {
    Get-ChildItem $localBase -Recurse -File | ForEach-Object {
      $rel = $_.FullName.Substring($localBase.Length).TrimStart('\', '/').Replace('\', '/')
      $localFiles[$rel] = @{ size = $_.Length; mtime = Get-UnixEpochSeconds $_.LastWriteTimeUtc }
    }
  }

  # 3. 对比: 本地不存在 / 大小不同 => 必须更新；
  #    大小相同但 mtime 不同 => 用 sha256 复核，内容一致只对齐 mtime，避免服务器批量改过时间戳后整目录重下。
  $changed = @()
  $suspects = @()
  foreach ($rel in $remoteFiles.Keys) {
    $r = $remoteFiles[$rel]
    if (-not $localFiles.ContainsKey($rel)) { $changed += $rel; continue }
    $l = $localFiles[$rel]
    if ($l.size -ne $r.size) { $changed += $rel; continue }
    if ($l.mtime -ne $r.mtime) { $suspects += $rel }
  }

  if ($suspects.Count -gt 0) {
    Write-Host "  大小一致但时间戳不同 $($suspects.Count) 个，校验 sha256 ..." -ForegroundColor Gray
    $remoteHashes = Get-RemoteSha256Map -RemoteDir $RemoteDir
    foreach ($rel in $suspects) {
      $localPath = Join-Path $localBase $rel
      $remoteHash = $remoteHashes[$rel]
      if (-not $remoteHash -or -not (Test-Path -LiteralPath $localPath)) { $changed += $rel; continue }
      $localHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $localPath).Hash.ToLowerInvariant()
      if ($localHash -ne $remoteHash) { $changed += $rel; continue }
      # 内容一致，只把本地 mtime 对齐到服务器，下次同步就不会再判为变更。
      (Get-Item -LiteralPath $localPath).LastWriteTimeUtc = [DateTimeOffset]::FromUnixTimeSeconds([int64]$remoteFiles[$rel].mtime).UtcDateTime
      $localFiles[$rel].mtime = $remoteFiles[$rel].mtime
    }
  }

  if ($changed.Count -eq 0) {
    Write-Host "  无需更新的文件（${RemoteDir} 已是最新）" -ForegroundColor Green
    return
  }

  $changedSize = [int64](($changed | ForEach-Object { [int64]$remoteFiles[$_].size } | Measure-Object -Sum).Sum)
  Write-Host "  需要更新 $($changed.Count) 个文件（约 $([math]::Round($changedSize / 1MB, 1)) MB），开始打包下载 ..." -ForegroundColor Yellow

  if (Test-Path $LocalTempTar) { Remove-Item $LocalTempTar -Force }

  # 4. 只打包需要更新的文件。
  # 文件多时把路径拼进 ssh 命令行会超过 Windows 的命令行长度上限，改为先传清单再用 tar -T。
  $remoteList = "${RemoteTempTar}.list"
  $localList = "${LocalTempTar}.list"
  $lines = $changed | ForEach-Object { "${RemoteDir}/$_" }
  [System.IO.File]::WriteAllText($localList, (($lines -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))

  & scp @scpArgs $localList "${RemoteUser}@${RemoteHost}:${remoteList}"
  if ($LASTEXITCODE -ne 0) { throw "上传 ${RemoteDir} 文件清单失败" }

  & ssh @sshArgs "${RemoteUser}@${RemoteHost}" "cd '${RemoteAppPath}/public' && tar -czf '${RemoteTempTar}' -T '${remoteList}'"
  if ($LASTEXITCODE -ne 0) { throw "在服务器上打包 ${RemoteDir} 失败" }

  & scp @scpArgs "${RemoteUser}@${RemoteHost}:${RemoteTempTar}" $LocalTempTar
  if ($LASTEXITCODE -ne 0) { throw "下载 ${RemoteDir} 失败" }

  & tar -xzf $LocalTempTar -C $PublicDir
  if ($LASTEXITCODE -ne 0) { throw "解压 ${RemoteDir} 失败" }

  # 5. 清理远程临时文件
  & ssh @sshArgs "${RemoteUser}@${RemoteHost}" "rm -f '${RemoteTempTar}' '${remoteList}'"
  if ($LASTEXITCODE -ne 0) { throw "清理远程临时文件失败" }

  if (Test-Path $LocalTempTar) { Remove-Item $LocalTempTar -Force }
  if (Test-Path $localList) { Remove-Item $localList -Force }
}

Require-Command "ssh"
Require-Command "scp"
Require-Command "tar"

function Resolve-IdentityFile {
  if ($IdentityFile) {
    if (-not (Test-Path $IdentityFile)) { throw "IdentityFile not found: $IdentityFile" }
    return (Resolve-Path $IdentityFile).Path
  }
  foreach ($name in @("id_ed25519", "id_rsa")) {
    $path = Join-Path $HOME ".ssh\$name"
    if (Test-Path $path) { return $path }
  }
  return ""
}

$identity = Resolve-IdentityFile

function Get-SshArgs {
  $items = @("-P", $RemotePort)
  if ($identity) { $items += @("-i", $identity, "-o", "IdentitiesOnly=yes") }
  $items += @("-o", "BatchMode=yes", "-o", "ConnectTimeout=15")
  return $items
}

# scp 用 -P 指定端口，ssh 用 -p，两者参数不能混用。
$scpArgs = Get-SshArgs
$sshArgs = @("-p", $RemotePort) + ($scpArgs | Select-Object -Skip 2)

if ($SetupKey) {
  Run-Step "Installing SSH public key" {
    if (-not $identity) {
      $sshDir = Join-Path $HOME ".ssh"
      if (-not (Test-Path $sshDir)) { New-Item -ItemType Directory -Path $sshDir -Force | Out-Null }
      $identity = Join-Path $sshDir "id_ed25519"
      & ssh-keygen -t ed25519 -N '""' -f $identity -C "petpaint-deploy"
      if ($LASTEXITCODE -ne 0) { throw "ssh-keygen failed" }
    }

    $pub = "$identity.pub"
    if (-not (Test-Path $pub)) {
      & ssh-keygen -y -f $identity | Set-Content -Path $pub -Encoding ascii
    }

    $remoteCmd = "mkdir -p ~/.ssh && chmod 700 ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys && echo KEY_INSTALLED"
    $cmdLine = 'type "{0}" | ssh -p {1} -o PubkeyAuthentication=no {2}@{3} "{4}"' -f $pub, $RemotePort, $RemoteUser, $RemoteHost, $remoteCmd
    & cmd /c $cmdLine
    if ($LASTEXITCODE -ne 0) { throw "public key install failed" }

    & ssh @sshArgs "${RemoteUser}@${RemoteHost}" "echo KEY_OK"
    if ($LASTEXITCODE -ne 0) { throw "key auth check failed" }
    Write-Host "Key login ready: $identity" -ForegroundColor Green
  }
  exit 0
}

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path $publicDir | Out-Null

try {
  Run-Step "同步 styles.json" {
    & scp @scpArgs "${RemoteUser}@${RemoteHost}:${RemoteAppPath}/data/styles.json" (Join-Path $dataDir "styles.json")
  }

  Run-Step "同步 style-groups.json" {
    & scp @scpArgs "${RemoteUser}@${RemoteHost}:${RemoteAppPath}/data/style-groups.json" (Join-Path $dataDir "style-groups.json")
  }

  Run-Step "同步风格预览图 style-previews (增量)" {
    Sync-IncrementalDirectory -RemoteDir "style-previews" -PublicDir $publicDir -RemoteTempTar $RemoteTempTar -LocalTempTar $localTempTar
  }

  Write-Host ""
  Write-Host "风格同步完成。已从服务器同步 styles.json、style-groups.json 与风格预览图。" -ForegroundColor Green
  Write-Host "服务器: ${RemoteUser}@${RemoteHost} (${RemoteAppPath})" -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host "同步失败：$($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
