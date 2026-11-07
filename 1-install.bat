@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  ==== Hysteria Restaurant - install ====
echo.
where py >nul 2>nul && (set PY=py -3) || (set PY=python)
%PY% --version >nul 2>nul || (
  echo  Python is not installed. Get it from https://www.python.org/downloads/
  echo  IMPORTANT: tick "Add python.exe to PATH" during setup, then run this file again.
  pause & exit /b 1
)
if not exist .venv (
  echo  Creating virtual environment...
  %PY% -m venv .venv || (echo  Could not create venv & pause & exit /b 1)
)
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip -q
python -m pip install -r requirements.txt -q || (echo  Install failed. Check your internet. & pause & exit /b 1)
echo.
echo  Installed OK.
echo  Saving food photos for offline use...
python fetch_images.py
if not exist .env call "%~dp03-change-key.bat"
echo  Now run 2-start.bat
pause
