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

## Features

- **Sounds & Videos** — Drag & Drop Upload (MP3, WAV, OGG, M4A, MP4, WebM)
- **YouTube Embed** — YouTube Links als Video Embed hinzufuegen (kein Download!)
- **Chat-Commands** — Eigene Befehle anlegen (z.B. `!airhorn`, `!bruh`)
- **!ytlink** — YouTube Video direkt aus dem Chat abspielen (`!ytlink https://youtube.com/watch?v=...`)
- **Queue-Management** — Warteschlange live einsehen, Skip/Stop/Clear
- **Test/Trigger** — Sounds & Videos direkt im Admin testen
- **Twitch Start/Stop** — Bot on-demand starten/stoppen
- **OBS Overlay** — Transparentes Overlay mit Queue, Auto-Reconnect

## Chat-Commands

| Command | Beschreibung |
|---------|-------------|
| `!command` | Sound/Video abspielen (individuell konfigurierbar) |
| `!ytlink <url>` | YouTube Video direkt aus dem Chat abspielen |

## Sicherheit

- Alle Credentials werden mit AES-256 verschluesselt
- Gespeichert in `credentials.enc` (lokal, wird nie committet)
- Sensitive Felder sind im UI maskiert
- Sichtbar-Button zum Pruefen der Eingabe

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
