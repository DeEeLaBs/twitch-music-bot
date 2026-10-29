@echo off
setlocal
set "ELECTRON_RUN_AS_NODE="
cd /d "%~dp0"
where node.exe >nul 2>nul
if errorlevel 1 (
  echo Node.js wurde nicht gefunden. Bitte stelle sicher, dass Node.js installiert ist.
  pause
  exit /b 1
)
node scripts\desktop.cjs
if errorlevel 1 (
  echo.
  echo Der Music Bot konnte nicht gestartet werden.
  pause
  exit /b 1
)
exit /b 0
