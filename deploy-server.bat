@echo off
setlocal

set SCRIPT_DIR=%~dp0
set PS_SCRIPT=%SCRIPT_DIR%deploy-server.ps1

if not exist "%PS_SCRIPT%" (
  echo Missing deploy script: "%PS_SCRIPT%"
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%PS_SCRIPT%" %*
set EXIT_CODE=%ERRORLEVEL%

echo.
if %EXIT_CODE% EQU 0 (
  echo Deployment completed successfully.
) else (
  echo Deployment failed with exit code %EXIT_CODE%.
)

pause
exit /b %EXIT_CODE%
