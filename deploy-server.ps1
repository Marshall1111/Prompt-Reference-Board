[CmdletBinding()]
param(
  [string]$RemoteUser = "ubuntu",
  [string]$RemoteHost = "118.25.188.55",
  [int]$RemotePort = 2222,
  [string]$RemoteAppPath = "/srv/prompt-gallery",
  [string]$RemoteArchivePath = "/home/ubuntu/prompt-gallery-deploy.tgz",
  [string]$IdentityFile = "",
  [switch]$SetupKey
)

$ErrorActionPreference = "Stop"

$repoRoot = Split-Path -Parent $PSCommandPath
$archivePath = Join-Path $env:TEMP "prompt-gallery-deploy.tgz"

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
}

Require-Command "tar"
Require-Command "scp"
Require-Command "ssh"

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

function Get-CommonSshArgs {
  $items = @()
  if ($identity) { $items += @("-i", $identity, "-o", "IdentitiesOnly=yes") }
  $items += @("-o", "BatchMode=yes", "-o", "ConnectTimeout=15")
  return $items
}

# scp 用 -P 指定端口，ssh 用 -p，两者参数不能混用。
$commonArgs = Get-CommonSshArgs
$scpArgs = @("-P", $RemotePort) + $commonArgs
$sshArgs = @("-p", $RemotePort) + $commonArgs

# 一次性安装公钥：只剩这一步需要输入服务器密码，之后全部免密。
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
  return
}

if (Test-Path $archivePath) {
  Remove-Item $archivePath -Force
}

$tarArgs = @(
  "-czf", $archivePath,
  "--exclude=.git",
  "--exclude=.env",
  "--exclude=node_modules",
  "--exclude=dist",
  "--exclude=public/generated-images",
  "--exclude=public/generated-thumbnails",
  "--exclude=public/job-references",
  "--exclude=public/job-reference-thumbnails",
  "--exclude=data/image-jobs",
  "--exclude=data/admin-sessions",
  "--exclude=data/body-book-sessions",
  "--exclude=data/body-book-showcases",
  "--exclude=data/draw-card-sessions",
  "--exclude=data/order-original-downloads",
  "--exclude=data/temp-image-references",
  "--exclude=data/tmp-test",
  "--exclude=data/visit-sessions",
  "--exclude=data/visitor-states",
  "--exclude=data/private-generated-images",
  "--exclude=data/private-job-references",
  "--exclude=data/storage-backups",
  "--exclude=data/storage-export-temp",
  "--exclude=data/orders.sqlite",
  "--exclude=data/orders.sqlite-shm",
  "--exclude=data/orders.sqlite-wal",
  "--exclude=data/invite-codes.json",
  "--exclude=*.log",
  "--exclude=.tmp-*",
  "--exclude=deploy-verify*.txt",
  "--exclude=pet_pics",
  "--exclude=tmp",
  "-C", $repoRoot,
  "."
)

$remoteCommand = @(
  "set -e",
  "mkdir -p '$RemoteAppPath'",
  "tar -xzf '$RemoteArchivePath' -C '$RemoteAppPath'",
  "sudo chown -R '$RemoteUser':'$RemoteUser' '$RemoteAppPath'",
  "cd '$RemoteAppPath'",
  "npm install",
  "if grep -q '""backfill:thumbnails""' package.json; then npm run backfill:thumbnails; fi",
  "if grep -q '""backfill:style-previews""' package.json; then npm run backfill:style-previews; fi",
  "npm run build",
  "sudo systemctl restart prompt-gallery",
  "rm -f '$RemoteArchivePath'"
) -join " && "

try {
  Run-Step "Packing workspace" {
    & tar @tarArgs
    if ($LASTEXITCODE -ne 0) {
      throw "tar failed with exit code $LASTEXITCODE"
    }
  }

  Run-Step "Uploading archive to server" {
    & scp @scpArgs $archivePath "${RemoteUser}@${RemoteHost}:$RemoteArchivePath"
    if ($LASTEXITCODE -ne 0) {
      throw "scp failed with exit code $LASTEXITCODE；若提示 Permission denied，请先执行 .\deploy-server.ps1 -SetupKey 安装公钥。"
    }
  }

  Run-Step "Applying update on server" {
    & ssh @sshArgs -tt "${RemoteUser}@${RemoteHost}" $remoteCommand
    if ($LASTEXITCODE -ne 0) {
      throw "ssh failed with exit code $LASTEXITCODE"
    }
  }

  Write-Host ""
  Write-Host "Deployment finished successfully." -ForegroundColor Green
  Write-Host "Server: ${RemoteUser}@${RemoteHost}" -ForegroundColor Green
  Write-Host "App path: $RemoteAppPath" -ForegroundColor Green
} finally {
  # 本地临时包偶尔被 scp/ssh 进程短暂占用，删除失败不影响部署结果。
  if (Test-Path $archivePath) {
    Remove-Item $archivePath -Force -ErrorAction SilentlyContinue
  }
}
