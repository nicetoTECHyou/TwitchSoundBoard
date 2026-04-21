@echo off
chcp 65001 >nul 2>&1
title TwitchSoundBoard

echo.
echo ================================================
echo   TwitchSoundBoard
echo ================================================
echo.

:: .env erzeugen wenn nicht vorhanden
if not exist ".env" (
    echo [SETUP] Erstelle .env aus Vorlage...
    copy ".env.example" ".env" >nul 2>&1
    echo.
    echo  ! WICHTIG !
    echo  Bearbeite .env und trage deine Twitch-Daten ein.
    echo  Der Server startet trotzdem - Twitch-Features sind erst
    echo  nach Eintrag der Credentials verfuegbar.
    echo.
    echo  Druecke eine beliebige Taste um fortzufahren...
    pause >nul
)

:: node_modules installieren wenn noetig
if not exist "node_modules" (
    echo [SETUP] Installiere Dependencies...
    call npm install
    if errorlevel 1 (
        echo [FEHLER] npm install fehlgeschlagen!
        echo Ist Node.js installiert? https://nodejs.org
        pause
        exit /b 1
    )
    echo.
)

:: Ordner sicherstellen
if not exist "sounds" mkdir sounds
if not exist "videos" mkdir videos

:: Server starten
echo [START] Server wird gestartet...
echo.
echo   Admin Panel: http://localhost:3000/admin
echo   OBS Overlay: http://localhost:3000/overlay
echo.
echo ================================================
echo.

node server.js

echo.
echo Server gestoppt.
pause
