@echo off
title Bullet Door
cd /d "%~dp0"

if not exist "node_modules\" (
  echo Instalando dependencias pela primeira vez...
  call npm install
  if errorlevel 1 (
    echo.
    echo [ERRO] Falha ao instalar. Node.js esta instalado?
    pause
    exit /b 1
  )
)

echo.
echo   BULLET DOOR
echo   Abrindo no navegador... feche esta janela para parar o servidor.
echo.
call npm run dev
pause
