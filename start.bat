@echo off
chcp 65001 >nul 2>&1
title TwitchSoundBoard

echo.
echo ================================================
echo   TwitchSoundBoard
echo ================================================
echo.

where node >nul 2>&1
if errorlevel 1 (
    echo [FEHLER] Node.js nicht gefunden!
    echo Lade es herunter: https://nodejs.org
    echo.
    pause
    exit /b 1
)

if not exist "sounds" mkdir sounds
if not exist "videos" mkdir videos

echo [SETUP] Dependencies installieren...
call npm install
if errorlevel 1 (
    echo.
    echo [FEHLER] npm install fehlgeschlagen!
    echo.
    pause
    exit /b 1
)
echo.

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

if errorlevel 1 (
    echo.
    echo [FEHLER] Server ist abgestuerzt!
    echo.
)

pause
