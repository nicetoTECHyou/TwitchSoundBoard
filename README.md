# TwitchSoundBoard 🔊

Ein Twitch Sound-Alert-System mit OBS-Overlay, inspiriert von Blerp. Spiele Sounds und Videos über Chat-Commands, Bits oder Kanalpunkte ab – direkt im Stream-OVERLAY.

## Features

- **Chat-Commands** – Trigger Sounds/Videos per `!command` im Twitch-Chat
- **Bits** – Automatische Sound-Ausgabe bei Cheers mit stufenbasierter Zuordnung
- **Kanalpunkte** – Sounds an Custom Rewards binden
- **Video-Support** – MP4/WebM-Videos als Overlay-Animation abspielen
- **Queue-System** – Kein Überschneiden von Sounds (konfigurierbar)
- **WebSocket** – Echtzeit-Kommunikation zwischen Backend und Overlay
- **Auto-Reconnect** – Overlay reconnectet automatisch bei Verbindungsabbruch
- **Debug-Modus** – `?debug` im Overlay-URL zeigt Status-Infos

## Projektstruktur

```
TwitchSoundBoard/
├── server.js          # Backend: Twitch API + WebSocket + EventSub
├── package.json       # Dependencies & Scripts
├── config.json        # Sound/Video Zuordnungen & Einstellungen
├── .env.example       # Vorlage für Twitch-Keys (als .env kopieren)
├── public/
│   └── index.html     # OBS-Overlay (HTML/JS)
├── sounds/            # Sounddateien (.mp3, .wav, .ogg) hier ablegen
├── videos/            # Videodateien (.mp4, .webm) hier ablegen
├── start.bat          # Windows Starter
├── build.js           # Build-Script (Zip-Erstellung)
├── VERSION            # Aktuelle Version
├── CHANGELOG.md       # Versionshistorie
└── README.md          # Diese Datei
```

## Schnellstart

### 1. Twitch Developer Credentials besorgen

1. Gehe zu https://dev.twitch.tv/console
2. Erstelle eine neue Application (Name: `TwitchSoundBoard`)
3. Setze **OAuth Redirect URL**: `http://localhost:3000`
4. Kopiere **Client ID** und **Client Secret**
5. Erstelle einen **Bot-Token** (optional): https://twitchapps.com/tmi/

### 2. Projekt einrichten

```bash
# 1. Dependencies installieren
npm install

# 2. .env Datei erstellen
copy .env.example .env
# Bearbeite .env und trage deine Twitch-Daten ein!

# 3. Sounds ablegen
# Kopiere deine .mp3/.wav/.ogg Dateien in den /sounds Ordner
# Kopiere deine .mp4/.webm Dateien in den /videos Ordner
```

### 3. Config anpassen

Öffne `config.json` und definiere deine Zuordnungen:

```json
{
  "chat_commands": {
    "!airhorn": { "file": "airhorn.mp3", "type": "sound" },
    "!kekw":    { "file": "kekw.mp4",    "type": "video" }
  },
  "bits": {
    "cheer1":  { "file": "ding.mp3",  "type": "sound" },
    "cheer100": { "file": "wow.mp3", "type": "sound" }
  },
  "channel_points": {
    "reward_id_hier": { "file": "horn.mp3", "type": "sound" }
  }
}
```

### 4. Starten

**Windows:** Doppelklick auf `start.bat`

**Oder manuell:**
```bash
npm start
```

### 5. OBS einrichten

1. Öffne OBS Studio
2. Füge eine **Browserquelle** hinzu
3. URL: `http://localhost:3000/index.html`
4. Breite/Höhe: Deiner Wahl (z.B. 1920×1080)
5. Hake "Lokale Datei" AB (brauchen wir nicht)

**Debug-Modus:** `http://localhost:3000/index.html?debug`

## EventSub (Bits & Kanalpunkte) aktivieren

Für Bits und Kanalpunkte-Benachrichtigungen brauchst du eine **öffentliche HTTPS-URL** (Twitch sendet Webhooks):

```bash
# ngrok installieren und starten
ngrok http 3000
```

Kopiere die ngrok-URL in `.env` als `PUBLIC_URL`.

## Konfiguration (config.json)

| Feld | Beschreibung |
|------|-------------|
| `chat_commands` | Chat-Befehle → Sound/Video Zuordnung |
| `bits` | Cheer-Schwellen → Sound/Video Zuordnung |
| `channel_points` | Reward-ID → Sound/Video Zuordnung |
| `settings.allow_overlap` | true = Sounds überschneiden sich |
| `settings.max_queue_size` | Maximale Queue-Länge (Standard: 10) |
| `settings.sound_volume` | Lautstärke für Sounds (0.0 – 1.0) |
| `settings.video_volume` | Lautstärke für Videos (0.0 – 1.0) |
| `settings.command_prefix` | Befehlspräfix (Standard: `!`) |
| `settings.video_duration_override_ms` | Max. Videodauer in ms |

## Build

```bash
npm run build          # Erstellt TwitchSoundBoard-v0.0.1.zip
npm run version:bump   # Bumped Version und erstellt Zip
```

## Lizenz

MIT – frei verwendbar.
