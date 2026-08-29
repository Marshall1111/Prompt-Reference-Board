@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0sync-publications.ps1"
echo.
pause
