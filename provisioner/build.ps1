param(
  [string]$Python = "python"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSCommandPath
Set-Location $root

& $Python -m pip install --quiet --upgrade pyinstaller paramiko
if ($LASTEXITCODE -ne 0) { throw "安装依赖失败" }

if (Test-Path "build") { Remove-Item "build" -Recurse -Force }
if (Test-Path "dist") { Remove-Item "dist" -Recurse -Force }

& $Python -m PyInstaller --noconfirm --clean --onefile --windowed `
  --name PetpaintProvisioner `
  --collect-submodules paramiko `
  main.py
if ($LASTEXITCODE -ne 0) { throw "打包失败" }

$offlineSource = Join-Path $root "offline"
if (Test-Path $offlineSource) {
  $target = Join-Path $root "dist\offline"
  New-Item -ItemType Directory -Path $target -Force | Out-Null
  Copy-Item "$offlineSource\petpaint-offline-*.tgz" $target -Force
} else {
  Write-Warning "没有找到 offline 目录，EXE 需要手动把离线包放到 dist\offline\"
}

Write-Host "完成：$root\dist\PetpaintProvisioner.exe" -ForegroundColor Green
