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

Require-Command "ssh"
Require-Command "scp"
Require-Command "tar"

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path $publicDir | Out-Null

try {
  Run-Step "同步 style-publications.json" {
    & scp "${RemoteUser}@${RemoteHost}:${RemoteAppPath}/data/style-publications.json" (Join-Path $dataDir "style-publications.json")
  }

  if (Test-Path $localTempTar) {
    Remove-Item $localTempTar -Force
  }

  Run-Step "同步发布图片 style-publications" {
    & ssh "${RemoteUser}@${RemoteHost}" "cd '${RemoteAppPath}/public' && tar -czf '${RemoteTempTar}' style-publications"
    if ($LASTEXITCODE -ne 0) {
      throw "在服务器上打包 style-publications 失败"
    }
    & scp "${RemoteUser}@${RemoteHost}:${RemoteTempTar}" $localTempTar
    if ($LASTEXITCODE -ne 0) {
      throw "下载 style-publications 失败"
    }
    & tar -xzf $localTempTar -C $publicDir
    if ($LASTEXITCODE -ne 0) {
      throw "解压 style-publications 失败"
    }
    & ssh "${RemoteUser}@${RemoteHost}" "rm -f '${RemoteTempTar}'"
  }

  if (Test-Path $localTempTar) {
    Remove-Item $localTempTar -Force
  }

  Write-Host ""
  Write-Host "发布同步完成。已从服务器同步 style-publications.json 与发布图片。" -ForegroundColor Green
  Write-Host "服务器: ${RemoteUser}@${RemoteHost} (${RemoteAppPath})" -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host "同步失败：$($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
