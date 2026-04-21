# Changelog

Alle wichtigen Änderungen am TwitchSoundBoard-Projekt.

## [0.0.2] – 2026-04-21

### Changed
- **Komplett-Redesign**: Admin Web-Panel hinzugefuegt
- Server startet OHNE Twitch-Credentials (Admin funktioniert sofort)
- Twitch-Integration ist optional und non-blocking
- OBS Overlay URL: `/overlay` statt `/index.html`
- Admin Panel URL: `/admin`

### Added
- **Admin Panel** (`/admin`): Vollstaendiges Web-Interface
  - Drag & Drop Sound/Video Upload
  - Chat-Command Manager (CRUD)
  - Bits-Trigger Manager
  - Kanalpunkte Reward Manager
  - Einstellungen (Lautstaerke, Queue, Prefix, etc.)
  - Sound Vorschau/Play-Button
  - Twitch-Verbindungsstatus
  - OBS Setup-Anleitung direkt im Panel
- Upload API (`/api/upload` mit Multer)
- Config CRUD API (Commands, Bits, Rewards, Settings)
- Media Management API (Liste, Upload, Delete)
- Health API mit Twitch-Status
- `.env` wird automatisch aus `.env.example` erstellt wenn fehlend

### Fixed
- start.bat crasht nicht mehr bei fehlender .env
- Server laeuft auch komplett ohne Twitch-Konfiguration

## [0.0.1] – 2026-04-21

### Added
- Initiales Release
- Chat-Command Sound/Video Trigger (`!command`)
- Bits Cheer Sound-Trigger (stufenbasiert)
- Kanalpunkte Reward Sound/Video Trigger
- WebSocket Echtzeit-Kommunikation (Backend → Overlay)
- Queue-System mit konfigurierbarem Overlap
- Auto-Reconnect bei Verbindungsabbruch
- Video-Overlay-Support (MP4, WebM)
- Debug-Modus (`?debug` Parameter)
- `start.bat` für Windows
- `build.js` für automatische Zip-Erstellung
- `.env` basierte Konfiguration (`.env.example` als Vorlage)
- Pre-commit Hook zum Schutz vor versehentlichem Commit von Keys
