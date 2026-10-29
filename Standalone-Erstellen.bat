@echo off
cd /d "%~dp0"
call npm run build:standalone
if errorlevel 1 (
 echo Standalone-Build fehlgeschlagen.
 pause
 exit /b 1
)
pause
