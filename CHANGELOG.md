# Changelog

## [0.0.7] – 2026-04-21

### Changed
- **@twurple durch tmi.js ersetzt** – @twurple/chat v8 braucht RefreshingAuthProvider mit Client ID + Secret + Token-Refresh. Fuer einen einfachen Chat-Bot ist das ueberfluessig. tmi.js braucht nur oauth Token + Kanalname.
- Token-Generator Link auf twitchtokengenerator.com geupdatet
- Client ID und Client Secret Felder entfernt (werden nicht mehr gebraucht)

### Fixed
- **Twitch Bot 500 Error** – @twurple wirft \"InvalidTokenTypeError\" bei StaticAuthToken. tmi.js funktioniert direkt mit dem Token.

## [0.0.6] – 2026-04-21

### Fixed
- **Windows Crash Fix – endlich!** start.bat hatte Unix-Zeilenenden (LF) statt Windows-Zeilenenden (CRLF). Windows cmd.exe konnte die Datei nicht lesen und schloss das Fenster sofort. Alle Versionen davor hatten denselben Bug.
- build.js konvertiert .bat Dateien jetzt automatisch zu CRLF im ZIP-Archiv
- `.gitattributes` hinzugefuegt: git speichert .bat Dateien immer mit CRLF
- start.bat komplett neu geschrieben: robustere Fehlerbehandlung, Node.js-Check vor dem Start, bessere Fehlermeldungen

### Changed
- start.bat zeigt jetzt klaere Fehlermeldung wenn Node.js nicht installiert ist
- start.bat zeigt Fehler wenn der Server crasht (statt sich einfach zu schliessen)

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
