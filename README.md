# TwitchSoundBoard 🔊

Twitch Sound-Alert-System mit Web-Admin-Panel und OBS-Overlay. Inspiriert von Blerp.

## Features

- **Web Admin Panel** – Sounds/Videos per Drag & Drop hochladen, Commands verwalten
- **Chat-Commands** – Trigger per `!command` im Twitch-Chat
- **Bits** – Automatische Sound-Ausgabe bei Cheers (stufenbasiert)
- **Kanalpunkte** – Custom Rewards mit Sounds verknuepfen
- **Video-Support** – MP4/WebM als Overlay-Animation
- **Queue-System** – Kein Ueberschneiden (konfigurierbar)
- **Ready to Run** – `start.bat` doppelklicken, fertig
- **Twitch optional** – Admin funktioniert sofort, Twitch laeuft dazu wenn konfiguriert

## Schnellstart

1. `start.bat` doppelklicken (oder `npm start`)
2. Browser oeffnen: **http://localhost:3000/admin**
3. Sounds hochladen, Commands anlegen
4. OBS Browserquelle: **http://localhost:3000/overlay**

**Twitch aktivieren:** `.env` bearbeiten, Client ID/Secret eintragen, Server restarten.

## Projektstruktur

```
TwitchSoundBoard/
├── server.js           # Backend: Express + WebSocket + Twitch API
├── public/
│   ├── admin.html      # Admin Panel (Web-Interface)
│   └── overlay.html    # OBS Overlay (Ausgabe)
├── sounds/             # Sounds (werden per Upload befuellt)
├── videos/             # Videos (werden per Upload befuellt)
├── config.json         # Automatisch generiert vom Admin Panel
├── start.bat           # Windows Starter
├── build.js            # Zip-Build
├── VERSION / CHANGELOG / README
└── .env                # Twitch Credentials (wird nie committet!)
```

## Admin Panel (http://localhost:3000/admin)

| Tab | Funktion |
|-----|----------|
| Sounds & Videos | Drag & Drop Upload, Vorschau, Loeschen |
| Chat-Commands | `!airhorn` -> `sound.mp3` zuordnen |
| Bits & Rewards | Bits-Schwellen, Kanalpunkte-Rewards |
| Einstellungen | Lautstaerke, Queue, Prefix, Overlap |
| OBS Overlay | URL kopieren, Twitch-Status |

## OBS Einrichtung

1. Browserquelle hinzufuegen
2. URL: `http://localhost:3000/overlay`
3. Groesse: 1920x1080
4. "Lokale Datei" deaktivieren

## Twitch Credentials

1. https://dev.twitch.tv/console → App erstellen
2. `.env` bearbeiten:
```
TWITCH_CLIENT_ID=deine_id
TWITCH_CLIENT_SECRET=dein_secret
TWITCH_CHANNEL=dein_kanalname
```
3. Server restarten

**Bits & Rewards** brauchen zusaetzlich `PUBLIC_URL` (z.B. ngrok).

## Build

```bash
npm run build           # Erstellt Zip
npm run version:bump    # Version hochzaehlen + Zip
```

## Lizenz

MIT
