@echo off
setlocal
cd /d "%~dp0.."

where node >nul 2>&1
if errorlevel 1 (
  echo [tests] Node.js was not found.
  exit /b 1
)

node --test tests\*.test.mjs
exit /b %errorlevel%
