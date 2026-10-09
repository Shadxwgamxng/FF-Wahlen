@echo off
chcp 65001 >nul
title FF Wahlplattform
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js wird installiert ...
  winget install -e --id OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
  echo.
  echo Node.js wurde installiert. Bitte dieses Fenster schliessen und Start.bat ERNEUT oeffnen.
  pause
  exit /b
)
if not exist node_modules (
  echo Erster Start: Abhaengigkeiten werden installiert ^(dauert einige Minuten^) ...
  call npm install
  if errorlevel 1 ( echo Installation fehlgeschlagen. & pause & exit /b 1 )
)
node scripts\local.mjs
pause
