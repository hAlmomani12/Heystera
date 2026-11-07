@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  ==== Push Hysteria to GitHub: hAlmomani12/Heystera ====
echo.
where git >nul 2>nul || (
  echo  Git is not installed. Get it from https://git-scm.com/download/win then run this again.
  pause & exit /b 1
)
if not exist .git git init -q
for /f "delims=" %%i in ('git config user.name') do set GN=%%i
if "%GN%"=="" (
  set /p GN=  Your name for commits: 
  set /p GE=  Your GitHub email: 
)
if not "%GE%"=="" (
  git config user.name "%GN%"
  git config user.email "%GE%"
)
if exist .env echo  .env is ignored, your OpenAI key will NOT be uploaded.
git add -A
git commit -q -m "Hysteria restaurant website with Hasti voice agent" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -m "Claude-Session: https://claude.ai/code/session_01RkWRkTyNTGo8eGSLGUDrQ3" || echo  Nothing new to commit.
git branch -M main
git remote remove origin >nul 2>nul
git remote add origin https://github.com/hAlmomani12/Heystera.git
echo.
echo  Uploading... (a GitHub sign-in window may open the first time)
git push -u origin main
if errorlevel 1 (
  echo  Remote already has commits, merging them first...
  git pull --no-edit --allow-unrelated-histories origin main && git push -u origin main
)
if errorlevel 1 (echo. & echo  Push failed. Send Claude the message above. & pause & exit /b 1)
echo.
echo  Done: https://github.com/hAlmomani12/Heystera
start "" https://github.com/hAlmomani12/Heystera
pause
