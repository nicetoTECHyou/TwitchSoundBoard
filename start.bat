@echo off
chcp 65001 >nul 2>&1
title TwitchSoundBoard

echo.
echo ╔══════════════════════════════════════════════╗
echo ║       TwitchSoundBoard                       ║
echo ║       Twitch Sound Alert System              ║
echo ╚══════════════════════════════════════════════╝
echo.

:: Prüfe ob .env existiert
if not exist ".env" (
    echo [FEHLER] Keine .env Datei gefunden!
    echo.
    echo Bitte kopiere .env.example als .env und trage deine Twitch-Daten ein:
    echo   copy .env.example .env
    echo.
    pause
    exit /b 1
)

:: Prüfe ob node_modules existiert
if not exist "node_modules" (
    echo [INFO] Dependencies werden installiert...
    call npm install
    if errorlevel 1 (
        echo [FEHLER] npm install fehlgeschlagen!
        pause
        exit /b 1
    )
    echo.
)

:: Prüfe ob sounds/ und videos/ existieren
if not exist "sounds" mkdir sounds
if not exist "videos" mkdir videos

:: Server starten
echo [INFO] Starte TwitchSoundBoard...
echo.
echo ════════════════════════════════════════════════
echo   OBS Browser-Quelle URL:
echo   http://localhost:3000/index.html
echo.
echo   Debug-Modus:
echo   http://localhost:3000/index.html?debug
echo ════════════════════════════════════════════════
echo.

node server.js

if errorlevel 1 (
    echo.
    echo [FEHLER] Server wurde beendet mit Fehlercode.
    pause
)
