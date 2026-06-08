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
call npm.cmd start
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
call npm.cmd install
if errorlevel 1 (
  echo Dependency installation failed.
  exit /b 1
)
echo.
exit /b 0

:ensure_build
if not exist dist\index.html goto build_now

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $root = (Resolve-Path '.').Path; $sources = @(); foreach ($relativePath in @('src','public')) { $fullPath = Join-Path $root $relativePath; if (Test-Path $fullPath) { $sources += Get-ChildItem -Path $fullPath -Recurse -File } }; foreach ($relativePath in @('index.html','package.json','package-lock.json','vite.config.js')) { $fullPath = Join-Path $root $relativePath; if (Test-Path $fullPath) { $sources += Get-Item $fullPath } }; $latestSource = $sources | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1; $latestDist = Get-ChildItem -Path (Join-Path $root 'dist') -Recurse -File | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1; if (-not $latestSource -or -not $latestDist -or $latestSource.LastWriteTimeUtc -gt $latestDist.LastWriteTimeUtc) { exit 1 }; exit 0 } catch { exit 2 }"
if errorlevel 2 (
  echo Unable to compare build timestamps. Rebuilding to be safe...
  goto build_now
)
if errorlevel 1 (
  echo Source files changed since the last build.
  goto build_now
)

echo Built page is up to date.
echo.
exit /b 0

:build_now
echo Building local page...
call :run_build
if errorlevel 1 (
  echo Build failed. Trying to repair the output folder and retry once...
  call :repair_dist
  call :run_build
  if errorlevel 1 (
    echo Build failed.
    exit /b 1
  )
)
echo.
exit /b 0

:run_build
call npm.cmd run build
exit /b %errorlevel%

:repair_dist
if not exist dist (
  exit /b 0
)

echo Resetting dist folder attributes...
attrib -R "dist" /S /D >nul 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $dist = Join-Path (Resolve-Path '.').Path 'dist'; if (Test-Path $dist) { Get-ChildItem -LiteralPath $dist -Force -Recurse -ErrorAction SilentlyContinue | ForEach-Object { try { $_.IsReadOnly = $false } catch {} }; Remove-Item -LiteralPath $dist -Recurse -Force -ErrorAction Stop }; exit 0 } catch { Write-Host $_.Exception.Message; exit 1 }"
if errorlevel 1 (
  echo Unable to fully clear dist. Retrying the build anyway...
)
exit /b 0

:failed
echo.
echo Startup failed. See the message above.
pause
exit /b 1

:end
endlocal
