# Changelog

## [0.0.5] – 2026-04-21

### Fixed
- **Windows Crash behoben** – Server crasht nicht mehr auf Windows
- Alle `async/await` und Template-Literals durch kompatible Syntax ersetzt
- `crypto.scryptSync` mit Fallback-Key falls scrypt fehlschlaegt
- WebSocket Port-Fehler (EADDRINUSE) wird abgefangen, probiert naechsten Port
- `dotenv.config()` mit try/catch (crasht nicht bei fehlender/fehlerhafter .env)
- `.env.example` hatte eckige Klammern – behoben (dotenv parsed das falsch)
- Multer-Ladung mit try/catch abgesichert
- Graceful Shutdown null-safe fuer wss/chatClient
- Upload-Pfad-Erkennung funktioniert auf Windows (`indexOf` statt `includes`)

## [0.0.4] – 2026-04-21

### Changed
- **Kein .env fuer Twitch Keys mehr** – alles im Admin Panel
- Twitch Tab ist jetzt der Haupt-Tab beim Oeffnen
- Alle sensitiven Felder sind maskiert (`type="password"`) mit Sichtbar-Button

### Added
- **Credentials API** (`/api/credentials`) – AES-256 verschluesselte Speicherung
- Credentials werden in `credentials.enc` gespeichert (niemals committet!)
- **Start/Stop Soundbot Button** direkt im Admin
- Twitch Verbindung Status-Box (gruen/rot)
- `/api/twitch/start` und `/api/twitch/stop` Endpoints
- `/api/twitch/status` fuer Live-Status

### Removed
- `.env` fuer Twitch Credentials nicht mehr noetig
- Twitch startet nicht mehr automatisch beim Server-Start

## [0.0.3] – 2026-04-21

### Changed
- Komplett auf lokalen Betrieb umgebaut, kein HTTPS noetig

## [0.0.2] – 2026-04-21

## [0.0.1] – 2026-04-21
