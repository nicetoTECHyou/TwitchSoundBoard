# TwitchSoundBoard 🔊

Lokales Twitch Sound-Alert System mit Web-Admin und OBS Overlay.

## Was brauche ich?

- **Nur** Node.js (https://nodejs.org) und OBS Studio
- Alles andere wird im Admin Panel eingerichtet

## Schnellstart

1. `start.bat` doppelklicken
2. Browser: **http://localhost:3000/admin**
3. **Twitch Tab**: Daten eingeben, **Soundbot Starten** klicken
4. **Sounds Tab**: Upload, Command anlegen
5. OBS Browserquelle: **http://localhost:3000/overlay**

## Twitch einrichten

Alles passiert im Admin Panel:

1. **Twitch Tab** oeffnen
2. Kanalname und Bot-Token eingeben (maskiert!)
3. **Speichern** klicken (AES-256 verschluesselt)
4. **Soundbot Starten** klicken

Bot-Token erstellen: https://twitchtokengenerator.com/

## Sicherheit

- Alle Credentials werden mit AES-256 verschluesselt
- Gespeichert in `credentials.enc` (lokal, wird nie committet)
- Sensitive Felder sind im UI maskiert
- Sichtbar-Button zum Pruefen der Eingabe

## Features

- Drag & Drop Upload
- Chat-Command Manager
- Test/Trigger Button
- Twitch Start/Stop on-demand
- OBS Overlay mit Queue

## URLs

| Was | URL |
|-----|-----|
| Admin Panel | http://localhost:3000/admin |
| OBS Overlay | http://localhost:3000/overlay |
| Overlay Debug | http://localhost:3000/overlay?debug |

## Build

```bash
npm run build
npm run version:bump
```

## Lizenz

MIT
