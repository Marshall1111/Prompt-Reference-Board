@echo off
setlocal
cd /d "%~dp0"

echo ========================================
echo  Stop Prompt Gallery Local Tool
echo ========================================
echo.
echo Stopping local server processes...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\stop-local-server.ps1"

echo.
echo Done.
pause
endlocal
