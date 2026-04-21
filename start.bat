@echo off
chcp 65001 >nul 2>&1
title TwitchSoundBoard

echo.
echo ================================================
echo   TwitchSoundBoard
echo ================================================
echo.

if not exist ".env" (
    echo [PORT=3000] > .env
    echo [WS_PORT=3001] >> .env
    echo [OK] .env erstellt (nur Ports).
    echo.
)

if not exist "node_modules" (
    echo [SETUP] Installiere Dependencies...
    call npm install
    if errorlevel 1 (
        echo [FEHLER] npm install fehlgeschlagen!
        echo Brauchst du Node.js? https://nodejs.org
        pause
        exit /b 1
    )
)

if not exist "sounds" mkdir sounds
if not exist "videos" mkdir videos

echo [START]
echo.
echo   Admin:    http://localhost:3000/admin
echo   Overlay:  http://localhost:3000/overlay
echo.
echo ================================================
echo   Twitch Keys im Admin Panel eingeben!
echo ================================================
echo.

node server.js

pause
