@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
if "%~1"=="" (
    python "%~dp0生成视频.py"
) else (
    python "%~dp0生成视频.py" "%~1"
)
if errorlevel 1 (
    echo.
    echo 生成失败，请检查上面的提示。
    pause
) else (
    start "" "%~dp0输出"
)
