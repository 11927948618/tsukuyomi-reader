@echo off
setlocal enabledelayedexpansion

REM =========================================================
REM TsukuyomiReader backup push (git add/commit/push)
REM 置き場所: リポジトリ直下（index.html がある場所）
REM ファイル名: backup_push.bat
REM =========================================================

REM ログ（同じフォルダに出す）
set "LOG=backup_push.log"

REM タイムスタンプ（ファイル名安全）
for /f "tokens=1-3 delims=/:. " %%a in ("%date% %time%") do set "TS=%%a%%b%%c"
set "NOW=%date% %time%"

echo.>> "%LOG%"
echo ===== [%NOW%] backup_push start =====>> "%LOG%"

REM リポジトリ確認
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo [backup] ERROR: This folder is not a git repository.
  echo [backup] ERROR: This folder is not a git repository.>> "%LOG%"
  pause
  exit /b 1
)

REM 変更一覧
set "CHANGED="
for /f "delims=" %%l in ('git status --porcelain') do (
  set "CHANGED=1"
  echo [backup] %%l
  echo [backup] %%l>> "%LOG%"
)

if not defined CHANGED (
  echo [backup] No changes. Nothing to do.
  echo [backup] No changes. Nothing to do.>> "%LOG%"
  exit /b 0
)

echo.
echo [backup] Above list will be committed
echo [backup] Continue? (Y/N)
set /p "ANS=> "
if /i not "%ANS%"=="Y" (
  echo [backup] Cancelled.
  echo [backup] Cancelled.>> "%LOG%"
  exit /b 0
)

REM add/commit/push
git add -A >> "%LOG%" 2>&1

set "MSG=backup %date% %time%"
git commit -m "%MSG%" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo [backup] Commit failed (maybe nothing staged). See log: %LOG%
  echo [backup] Commit failed.>> "%LOG%"
  exit /b 1
)

git push origin main >> "%LOG%" 2>&1
if errorlevel 1 (
  echo [backup] Push failed. See log: %LOG%
  echo [backup] Push failed.>> "%LOG%"
  exit /b 1
)

echo [backup] pushed.
echo [backup] pushed.>> "%LOG%"
echo ===== [%NOW%] backup_push end =====>> "%LOG%"
endlocal
