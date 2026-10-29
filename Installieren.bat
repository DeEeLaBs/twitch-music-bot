@echo off
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Bitte zuerst Node.js 22 oder neuer installieren.
  pause
  exit /b 1
)
call npm ci
if errorlevel 1 goto failed
call npm run clean
if errorlevel 1 goto failed
call npm run build
if errorlevel 1 goto failed
echo Installation erfolgreich. Jetzt Start-Bot.vbs starten.
pause
exit /b 0
:failed
echo Installation fehlgeschlagen. Bitte die Fehlermeldung oben pruefen.
pause
exit /b 1
