@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"
set "OLDOAI=" & set "OLDGEM="
if exist .env for /f "usebackq tokens=1,* delims==" %%a in (".env") do (
  if /i "%%a"=="OPENAI_API_KEY" set "OLDOAI=%%b"
  if /i "%%a"=="GEMINI_API_KEY" set "OLDGEM=%%b"
)
echo.
echo  Which AI should power the voice assistant (Hasti)?
echo    1 = Google Gemini   (key starts with AIza... from aistudio.google.com/apikey)
echo    2 = OpenAI          (key starts with sk-...)
choice /c 12 /n /m "  Choose 1 or 2: "
if errorlevel 2 (set "PROV=openai") else (set "PROV=gemini")
echo.
set "KEY="
set /p KEY=  Paste your %PROV% API key and press Enter: 
if "%KEY%"=="" (echo  No key entered. & pause & exit /b 1)
if "%PROV%"=="gemini" (set "OLDGEM=%KEY%") else (set "OLDOAI=%KEY%")
> .env echo VOICE_PROVIDER=%PROV%
if defined OLDGEM >> .env echo GEMINI_API_KEY=%OLDGEM%
if defined OLDOAI >> .env echo OPENAI_API_KEY=%OLDOAI%
>> .env echo GEMINI_MODEL=gemini-3.8-live
>> .env echo GEMINI_VOICE=Puck
>> .env echo REALTIME_MODEL=gpt-realtime-2.1
>> .env echo VOICE=marin
>> .env echo PORT=8000
echo.
echo  Saved to .env  (provider: %PROV%) - this file stays on your computer only.
echo  Restart 2-start.bat to use it.
echo.
pause
