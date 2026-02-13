@echo off
chcp 65001 >nul
setlocal

REM ===== move to this .bat directory (repo root) =====
cd /d "%~dp0"

set "LOG=%~dp0backup_push.log"
set "NOW=%date% %time%"

echo.>> "%LOG%"
echo ===== [%NOW%] backup_push start (%cd%) =====>> "%LOG%"

REM --- repo check ---
git rev-parse --is-inside-work-tree >nul 2>&1
if errorlevel 1 (
  echo [backup] ERROR: not a git repository: %cd%
  echo [backup] ERROR: not a git repository: %cd%>> "%LOG%"
  pause
  exit /b 1
)

REM --- show status (log) ---
echo [backup] status:>> "%LOG%"
git status -sb >> "%LOG%" 2>&1

REM --- changed files? ---
for /f "delims=" %%l in ('git status --porcelain') do set CHANGED=1
if not defined CHANGED (
  echo [backup] No changes. Nothing to do.
  echo [backup] No changes. Nothing to do.>> "%LOG%"
  exit /b 0
)

echo.
echo [backup] Changed files:
git status --porcelain
echo.
set /p "ANS=[backup] Commit & Push? (Y/N) > "
if /i not "%ANS%"=="Y" (
  echo [backup] Cancelled.
  echo [backup] Cancelled.>> "%LOG%"
  exit /b 0
)

REM --- add/commit ---
git add -A >> "%LOG%" 2>&1

set "MSG=backup %date% %time%"
git commit -m "%MSG%" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo [backup] Commit failed. See log: %LOG%
  echo [backup] Commit failed.>> "%LOG%"
  pause
  exit /b 1
)

REM --- push (set upstream) ---
git push -u origin main >> "%LOG%" 2>&1
if errorlevel 1 (
  echo [backup] Push failed. See log: %LOG%
  echo [backup] Hint: try "git pull --rebase origin main" then run again.
  echo [backup] Push failed.>> "%LOG%"
  pause
  exit /b 1
)

echo [backup] pushed.
echo [backup] pushed.>> "%LOG%"
echo ===== [%NOW%] backup_push end =====>> "%LOG%"
endlocal
