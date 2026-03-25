@echo off
cd /d "%~dp0"

call "%~dp0UpdateBookManifest.bat" --no-pause
if errorlevel 1 (
  echo.
  echo Manifest update failed. Starting server with existing manifest.json...
  echo.
)

python -m http.server 8000
