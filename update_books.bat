@echo off
setlocal
cd /d "%~dp0"

echo [books] changed files:
git status --porcelain books

echo.
set /p ANS="[books] Commit and push books only? (Y/N) > "
if /i not "%ANS%"=="Y" exit /b

git add books
git commit -m "books update %date% %time%"
git push origin main

echo [books] done.
pause
endlocal
