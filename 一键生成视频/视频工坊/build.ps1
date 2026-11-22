param(
  [string]$Python = "python"
)

# 注意：本脚本保持纯 ASCII，避免 PowerShell 5 以 ANSI 读取中文导致文件名乱码。
$ErrorActionPreference = "Stop"
$here = Split-Path -Parent $PSCommandPath
Set-Location $here

& $Python -c "import PyInstaller, PIL, numpy, imageio_ffmpeg, requests, qrcode" 2>$null
if ($LASTEXITCODE -ne 0) {
  Write-Host "Installing dependencies..."
  & $Python -m pip install -r requirements.txt
}

# 素材目录名：素材
$material = -join ([char[]](0x7D20, 0x6750))
$bgm = Join-Path (Join-Path (Split-Path -Parent $here) $material) "bgm.m4a"
$buildName = "PetpaintVideoMaker"
# 小画视频工坊
$chineseName = -join ([char[]](0x5C0F, 0x753B, 0x89C6, 0x9891, 0x5DE5, 0x574A))

$arguments = @(
  "--noconfirm", "--clean", "--onefile", "--windowed",
  "--name", $buildName,
  "--collect-all", "imageio_ffmpeg",
  "--collect-submodules", "qrcode",
  "--hidden-import", "PIL._tkinter_finder",
  "--hidden-import", "PIL.WebPImagePlugin",
  "--hidden-import", "PIL._webp",
  "--hidden-import", "PIL.JpegImagePlugin",
  "--hidden-import", "PIL.PngImagePlugin"
)
if (Test-Path $bgm) {
  $arguments += @("--add-data", "$bgm;assets")
}
$arguments += "main.py"

& $Python -m PyInstaller @arguments

$distExe = Join-Path $here ("dist\" + $buildName + ".exe")
$finalExe = Join-Path $here ("dist\" + $chineseName + ".exe")
if (Test-Path $finalExe) {
  try {
    Remove-Item -Force $finalExe
  } catch {
    throw ("Close the running " + $chineseName + ".exe before rebuilding.")
  }
}
if (-not (Test-Path $distExe)) {
  throw ("Build output not found: " + $distExe)
}
Move-Item -Force $distExe $finalExe
Write-Host ("Done: " + $finalExe)
