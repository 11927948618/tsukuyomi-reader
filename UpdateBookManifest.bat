@echo off
setlocal

set "NO_PAUSE="
if /I "%~1"=="--no-pause" set "NO_PAUSE=1"
if /I "%~1"=="/nopause" set "NO_PAUSE=1"

cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js ^(node^) was not found.
  echo Install Node.js and run this file again.
  echo.
  if not defined NO_PAUSE pause
  exit /b 1
)

echo Updating book\manifest.json...
node "%~dp0scripts\generate-book-manifest.mjs"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
  echo Manifest update failed. Check the message above.
  if not defined NO_PAUSE pause
  exit /b %EXIT_CODE%
)

echo Manifest update completed.
if not defined NO_PAUSE pause
exit /b 0
