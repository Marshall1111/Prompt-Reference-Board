[CmdletBinding()]
param(
  [string]$RemoteUser = "ubuntu",
  [string]$RemoteHost = "118.25.188.55",
  [string]$RemoteAppPath = "/srv/prompt-gallery",
  [string]$RemoteTempTar = "/tmp/prompt-gallery-sync-publications.tgz"
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSCommandPath
$dataDir = Join-Path $repoRoot "data"
$publicDir = Join-Path $repoRoot "public"
$localTempTar = Join-Path $env:TEMP "prompt-gallery-sync-publications.tgz"

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
  $remoteRaw = & ssh "${RemoteUser}@${RemoteHost}" "cd '${RemoteAppPath}/public' && find '${RemoteDir}' -type f -exec stat -c '%s|%Y|%n' {} +" 2>$null
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

  # 3. 对比: 本地不存在 / 大小不同 / 修改时间不同 => 需要更新
  $changed = @()
  foreach ($rel in $remoteFiles.Keys) {
    $r = $remoteFiles[$rel]
    if (-not $localFiles.ContainsKey($rel)) { $changed += $rel; continue }
    $l = $localFiles[$rel]
    if ($l.size -ne $r.size -or $l.mtime -ne $r.mtime) { $changed += $rel }
  }

  if ($changed.Count -eq 0) {
    Write-Host "  无需更新的文件（${RemoteDir} 已是最新）" -ForegroundColor Green
    return
  }

  $changedSize = [int64](($changed | ForEach-Object { [int64]$remoteFiles[$_].size } | Measure-Object -Sum).Sum)
  Write-Host "  需要更新 $($changed.Count) 个文件（约 $([math]::Round($changedSize / 1MB, 1)) MB），开始打包下载 ..." -ForegroundColor Yellow

  if (Test-Path $LocalTempTar) { Remove-Item $LocalTempTar -Force }

  # 4. 只打包需要更新的文件
  $tarArgs = ($changed | ForEach-Object { "'${RemoteDir}/$_'" }) -join ' '
  & ssh "${RemoteUser}@${RemoteHost}" "cd '${RemoteAppPath}/public' && tar -czf '${RemoteTempTar}' $tarArgs"
  if ($LASTEXITCODE -ne 0) { throw "在服务器上打包 ${RemoteDir} 失败" }

  & scp "${RemoteUser}@${RemoteHost}:${RemoteTempTar}" $LocalTempTar
  if ($LASTEXITCODE -ne 0) { throw "下载 ${RemoteDir} 失败" }

  & tar -xzf $LocalTempTar -C $PublicDir
  if ($LASTEXITCODE -ne 0) { throw "解压 ${RemoteDir} 失败" }

  # 5. 清理远程临时文件
  & ssh "${RemoteUser}@${RemoteHost}" "rm -f '${RemoteTempTar}'"
  if ($LASTEXITCODE -ne 0) { throw "清理远程临时文件失败" }

  if (Test-Path $LocalTempTar) { Remove-Item $LocalTempTar -Force }
}

Require-Command "ssh"
Require-Command "scp"
Require-Command "tar"

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path $publicDir | Out-Null

try {
  Run-Step "同步 style-publications.json" {
    & scp "${RemoteUser}@${RemoteHost}:${RemoteAppPath}/data/style-publications.json" (Join-Path $dataDir "style-publications.json")
  }

  Run-Step "同步发布图片 style-publications (增量)" {
    Sync-IncrementalDirectory -RemoteDir "style-publications" -PublicDir $publicDir -RemoteTempTar $RemoteTempTar -LocalTempTar $localTempTar
  }

  Write-Host ""
  Write-Host "发布同步完成。已从服务器同步 style-publications.json 与发布图片。" -ForegroundColor Green
  Write-Host "服务器: ${RemoteUser}@${RemoteHost} (${RemoteAppPath})" -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host "同步失败：$($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
