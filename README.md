# TwitchSoundBoard 🔊

Lokales Twitch Sound-Alert System mit Web-Admin und OBS Overlay.

## Was brauche ich?

- **Nur** Node.js (https://nodejs.org) und OBS Studio
- **Kein** HTTPS, kein ngrok, kein Cloud-Server
- Twitch Chat ist **optional**

## Schnellstart

1. `start.bat` doppelklicken
2. Browser: **http://localhost:3000/admin**
3. Sound hochladen (Drag & Drop)
4. Command anlegen: `!airhorn` → Sound waehlen → fertig
5. OBS Browserquelle: **http://localhost:3000/overlay**
6. Im Admin auf **Trigger** klicken um zu testen

## Twitch Chat aktivieren (optional)

Wenn Chat-Commands im Twitch-Chat funktionieren sollen:

1. Bot-Token: https://twitchapps.com/tmi/
2. `.env` bearbeiten:
   ```
   TWITCH_CHANNEL=dein_kanalname
   TWITCH_BOT_TOKEN=oauth:dein_token
   ```
3. Server restarten

## Features

- Drag & Drop Upload (MP3, WAV, OGG, MP4, WebM)
- Chat-Command Manager
- Test/Trigger Button fuer jede Datei
- Einstellungen (Lautstaerke, Queue, Prefix)
- OBS Overlay mit Queue-System
- Twitch Chat Integration (optional)

## URLs

| Was | URL |
|-----|-----|
| Admin Panel | http://localhost:3000/admin |
| OBS Overlay | http://localhost:3000/overlay |
| Overlay Debug | http://localhost:3000/overlay?debug |

## Build

```bash
npm run build           # Zip erstellen
npm run version:bump    # Version + Zip
```

## Lizenz

MIT
