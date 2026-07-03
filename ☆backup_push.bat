@echo off
chcp 65001 >nul
setlocal

set "ROOT=%~dp0"
set "PWSH=C:\Program Files\PowerShell\7\pwsh.exe"
set "PS_ARGS=%*"
if /i "%~1"=="--no-pause" set "PS_ARGS=-NoPause"

if not exist "%PWSH%" (
  echo [backup] ERROR: PowerShell 7 was not found: %PWSH%
  echo [backup] Install PowerShell 7 or update this launcher.
  pause
  exit /b 1
)

"%PWSH%" -NoProfile -ExecutionPolicy Bypass -File "%ROOT%backup_push.ps1" %PS_ARGS%
set "EXIT_CODE=%ERRORLEVEL%"

if /i not "%~1"=="--no-pause" pause
exit /b %EXIT_CODE%
