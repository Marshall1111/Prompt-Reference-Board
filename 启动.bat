@echo off
setlocal
cd /d "%~dp0"

set "APP_URL=http://127.0.0.1:3000"

echo ========================================
echo  Prompt Gallery Local Tool
echo ========================================
echo.

call :ensure_node
if errorlevel 1 goto failed

call :ensure_dependencies
if errorlevel 1 goto failed

call :ensure_build
if errorlevel 1 goto failed

echo Starting local server...
echo Browser will open automatically: %APP_URL%
echo Close this window or press Ctrl+C to stop the tool.
echo.

start "" powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 2; Start-Process '%APP_URL%'"
npm start
goto end

:ensure_node
where node >nul 2>nul
if not errorlevel 1 (
  echo Node.js found.
  node --version
  echo.
  exit /b 0
)

echo Node.js was not found. Trying to install Node.js LTS automatically...
where winget >nul 2>nul
if errorlevel 1 (
  echo.
  echo Automatic install needs winget, but winget was not found.
  echo Please install Node.js once from https://nodejs.org/ and double-click start.bat again.
  exit /b 1
)

winget install --id OpenJS.NodeJS.LTS --exact --silent --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo.
  echo Node.js automatic install failed.
  echo Please install Node.js once from https://nodejs.org/ and double-click start.bat again.
  exit /b 1
)

set "PATH=%ProgramFiles%\nodejs;%LocalAppData%\Programs\nodejs;%PATH%"
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo Node.js installed, but this window cannot find it yet.
  echo Close this window and double-click start.bat again.
  exit /b 1
)

echo Node.js installed successfully.
node --version
echo.
exit /b 0

:ensure_dependencies
if exist node_modules (
  echo Dependencies found.
  echo.
  exit /b 0
)

echo Installing dependencies...
call npm install
if errorlevel 1 (
  echo Dependency installation failed.
  exit /b 1
)
echo.
exit /b 0

:ensure_build
if exist dist (
  echo Built page found.
  echo.
  exit /b 0
)

echo Building local page...
call npm run build
if errorlevel 1 (
  echo Build failed.
  exit /b 1
)
echo.
exit /b 0

:failed
echo.
echo Startup failed. See the message above.
pause
exit /b 1

:end
endlocal
