@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist .venv (echo  Run 1-install.bat first. & pause & exit /b 1)
call .venv\Scripts\activate.bat
set PORT=8000
for /f "usebackq tokens=1,* delims==" %%a in (".env") do if /i "%%a"=="PORT" set PORT=%%b
start "" http://localhost:%PORT%
python server.py
pause
