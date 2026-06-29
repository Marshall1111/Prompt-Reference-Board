@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo  Stop Prompt Gallery Local Tool
echo ========================================
echo.
echo Stopping local server processes...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$targets = Get-CimInstance Win32_Process | Where-Object { $_.ProcessName -in @('node.exe','cmd.exe') -and ($_.CommandLine -match 'server/index.js' -or $_.CommandLine -match 'npm-cli\.js\" start') }; if (-not $targets) { Write-Host 'No running Prompt Gallery local server was found.'; exit 0 }; $targets | ForEach-Object { try { Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop; Write-Host ('Stopped PID ' + $_.ProcessId + ' (' + $_.ProcessName + ')') } catch { Write-Host ('Failed to stop PID ' + $_.ProcessId + ': ' + $_.Exception.Message) } }"

echo.
echo Done.
pause
endlocal
