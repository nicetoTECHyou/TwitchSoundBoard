@echo off
chcp 65001 >nul 2>&1
title TwitchSoundBoard

echo.
echo ================================================
echo   TwitchSoundBoard
echo ================================================
echo.

if not exist ".env" (
    copy ".env.example" ".env" >nul 2>&1
    echo [OK] .env erstellt.
    echo.
    echo  Twitch ist optional - der Server laeuft auch ohne.
    echo  Bearbeite .env nur wenn du Chat-Commands willst.
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

echo [START] Server startet...
echo.
echo   Admin Panel:  http://localhost:3000/admin
echo   OBS Overlay:  http://localhost:3000/overlay
echo.
echo ================================================
echo.

node server.js

echo.
pause
