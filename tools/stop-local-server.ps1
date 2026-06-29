$ErrorActionPreference = "Stop"

$targets = Get-CimInstance Win32_Process | Where-Object {
  $_.ProcessName -in @("node.exe", "cmd.exe") -and (
    $_.CommandLine -match "server/index\.js" -or
    $_.CommandLine -match "npm-cli\.js`" start"
  )
}

if (-not $targets) {
  Write-Host "No running Prompt Gallery local server was found."
  exit 0
}

$targets |
  Sort-Object ProcessId -Descending |
  ForEach-Object {
    $pid = $_.ProcessId
    $name = $_.ProcessName
    try {
      Stop-Process -Id $pid -Force -ErrorAction Stop
      Write-Host ("Stopped PID " + $pid + " (" + $name + ")")
    } catch {
      Write-Host ("Failed to stop PID " + $pid + ": " + $_.Exception.Message)
    }
  }
