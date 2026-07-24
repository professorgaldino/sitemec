@echo off
title Portal Mecanica Industrial
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo O Node.js nao foi encontrado neste computador.
  echo Instale o Node.js ou publique o portal no GitHub Pages.
  pause
  exit /b 1
)

start "Servidor Portal Mecanica" /min node "%~dp0servidor-local.js"
timeout /t 2 /nobreak >nul
start "" "http://localhost:5500"
exit /b 0
