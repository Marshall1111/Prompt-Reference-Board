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
  "--exclude=node_modules",
  "--exclude=dist",
  "--exclude=.env",
  "--exclude=public/generated-images",
  "--exclude=public/generated-thumbnails",
  "--exclude=public/job-references",
  "--exclude=public/job-reference-thumbnails",
  "--exclude=data/image-jobs",
  "--exclude=data/temp-image-references",
  "--exclude=*.log",
  "-C", $repoRoot,
  "."
)

$remoteCommand = @(
  "set -e",
  "mkdir -p '$RemoteAppPath'",
  "tar -xzf '$RemoteArchivePath' -C '$RemoteAppPath'",
  "cd '$RemoteAppPath'",
  "npm install",
  "if grep -q '""backfill:thumbnails""' package.json; then npm run backfill:thumbnails; fi",
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
