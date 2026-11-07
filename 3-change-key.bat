@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo.
echo  Paste your OpenAI API key (starts with sk-) and press Enter:
set /p KEY=  Key: 
if "%KEY%"=="" (echo  No key entered. & pause & exit /b 1)
> .env echo OPENAI_API_KEY=%KEY%
>> .env echo REALTIME_MODEL=gpt-realtime-2.1
>> .env echo VOICE=marin
>> .env echo PORT=8000
echo.
echo  Saved to .env  (this file stays on your computer only)
echo.
