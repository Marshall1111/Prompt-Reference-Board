[CmdletBinding()]
param(
  [string]$RemoteUser = "ubuntu",
  [string]$RemoteHost = "118.25.188.55",
  [string]$RemoteAppPath = "/srv/prompt-gallery",
  [string]$RemoteArchivePath = "/home/ubuntu/prompt-gallery-deploy.tgz"
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
    & scp $archivePath "${RemoteUser}@${RemoteHost}:$RemoteArchivePath"
    if ($LASTEXITCODE -ne 0) {
      throw "scp failed with exit code $LASTEXITCODE"
    }
  }

  Run-Step "Applying update on server" {
    & ssh -tt "${RemoteUser}@${RemoteHost}" $remoteCommand
    if ($LASTEXITCODE -ne 0) {
      throw "ssh failed with exit code $LASTEXITCODE"
    }
  }

  Write-Host ""
  Write-Host "Deployment finished successfully." -ForegroundColor Green
  Write-Host "Server: ${RemoteUser}@${RemoteHost}" -ForegroundColor Green
  Write-Host "App path: $RemoteAppPath" -ForegroundColor Green
} finally {
  if (Test-Path $archivePath) {
    Remove-Item $archivePath -Force
  }
}
