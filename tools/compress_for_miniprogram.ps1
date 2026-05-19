param(
  [Parameter(Mandatory = $true)][string]$Source,
  [Parameter(Mandatory = $true)][string]$Target,
  [int]$MaxWidth = 480,
  [int]$Quality = 56
)

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName PresentationCore
Add-Type -AssemblyName WindowsBase

$stream = [System.IO.File]::OpenRead($Source)
try {
  $decoder = [System.Windows.Media.Imaging.BitmapDecoder]::Create(
    $stream,
    [System.Windows.Media.Imaging.BitmapCreateOptions]::PreservePixelFormat,
    [System.Windows.Media.Imaging.BitmapCacheOption]::OnLoad
  )
  $frame = $decoder.Frames[0]
} finally {
  $stream.Dispose()
}

$scale = [Math]::Min(1.0, [double]$MaxWidth / [double]$frame.PixelWidth)
$transform = New-Object System.Windows.Media.ScaleTransform -ArgumentList $scale, $scale
$bitmap = New-Object System.Windows.Media.Imaging.TransformedBitmap -ArgumentList $frame, $transform

$encoder = New-Object System.Windows.Media.Imaging.JpegBitmapEncoder
$encoder.QualityLevel = $Quality
$encoder.Frames.Add([System.Windows.Media.Imaging.BitmapFrame]::Create($bitmap))

$targetDir = Split-Path -Parent $Target
New-Item -ItemType Directory -Force $targetDir | Out-Null

$out = [System.IO.File]::Create($Target)
try {
  $encoder.Save($out)
} finally {
  $out.Dispose()
}
