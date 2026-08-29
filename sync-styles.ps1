[CmdletBinding()]
param(
  [string]$RemoteUser = "ubuntu",
  [string]$RemoteHost = "118.25.188.55",
  [string]$RemoteAppPath = "/srv/prompt-gallery",
  [string]$RemoteTempTar = "/tmp/prompt-gallery-sync-styles.tgz"
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

Require-Command "ssh"
Require-Command "scp"
Require-Command "tar"

New-Item -ItemType Directory -Force -Path $dataDir | Out-Null
New-Item -ItemType Directory -Force -Path $publicDir | Out-Null

try {
  Run-Step "同步 styles.json" {
    & scp "${RemoteUser}@${RemoteHost}:${RemoteAppPath}/data/styles.json" (Join-Path $dataDir "styles.json")
  }

  Run-Step "同步 style-groups.json" {
    & scp "${RemoteUser}@${RemoteHost}:${RemoteAppPath}/data/style-groups.json" (Join-Path $dataDir "style-groups.json")
  }

  if (Test-Path $localTempTar) {
    Remove-Item $localTempTar -Force
  }

  Run-Step "同步风格预览图 style-previews" {
    & ssh "${RemoteUser}@${RemoteHost}" "cd '${RemoteAppPath}/public' && tar -czf '${RemoteTempTar}' style-previews"
    if ($LASTEXITCODE -ne 0) {
      throw "在服务器上打包 style-previews 失败"
    }
    & scp "${RemoteUser}@${RemoteHost}:${RemoteTempTar}" $localTempTar
    if ($LASTEXITCODE -ne 0) {
      throw "下载 style-previews 失败"
    }
    & tar -xzf $localTempTar -C $publicDir
    if ($LASTEXITCODE -ne 0) {
      throw "解压 style-previews 失败"
    }
    & ssh "${RemoteUser}@${RemoteHost}" "rm -f '${RemoteTempTar}'"
  }

  if (Test-Path $localTempTar) {
    Remove-Item $localTempTar -Force
  }

  Write-Host ""
  Write-Host "风格同步完成。已从服务器同步 styles.json、style-groups.json 与风格预览图。" -ForegroundColor Green
  Write-Host "服务器: ${RemoteUser}@${RemoteHost} (${RemoteAppPath})" -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host "同步失败：$($_.Exception.Message)" -ForegroundColor Red
  exit 1
}
