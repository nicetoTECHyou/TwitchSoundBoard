# Changelog

## [0.0.9] – 2026-04-21

### Fixed
- **Overlay Queue Fix** – Nach dem ersten Sound konnte kein zweiter getriggert werden. `isPlaying` blieb permanent auf `true` wenn das Audio-Element nicht korrekt fertig wurde (z.B. stalled, langsame Verbindung, Browser-Autoplay-Block).
- **Queue wurde nicht abgespielt** – Gleicher Root Cause: processQueue wurde nie wieder aufgerufen wenn ein vorheriges Item die Queue im blockierten Zustand hinterliess.
- **Audio Autoplay** – Blockierender "Klick fuer Audio" Screen entfernt. Stattdessen: stummer Test-Autoplay beim Laden (funktioniert in OBS sofort), Klick-Unlock auf beliebige Stelle der Seite fuer Browser-Testing. Kleiner Status-Indikator im Debug-Modus.
- **Safety Timeout** – Jedes Sound/Video hat jetzt einen 60-Sekunden Max-Timeout. Verhindert dass die Queue permanent blockiert wenn ein Media-Element stecken bleibt.
- **Stalled Detection** – Wenn ein Audio/Video-Element "stalled" fuer mehr als 3 Sekunden, wird es abgebrochen und die Queue geht weiter.
- **Multiple Ready Events** – canplaythrough, loadeddata, canplay – das Erste das feuert startet das Abspielen. Verhindert dass Sounds nie starten weil ein bestimmtes Event nicht feuert.
- **playStarted Flag** – Verhindert dass `play()` doppelt aufgerufen wird wenn mehrere Events feuern.
- **Hartes Fallback** – Falls nach 3 Sekunden kein Ready-Event und kein Play gestartet, wird das Item verworfen und die Queue geht weiter.

### Changed
- Overlay komplett neu geschrieben (v3) – robustere Queue-Verarbeitung, bessere Fehlerbehandlung, kein blockierendes UI mehr
- Audio-Unlock ist jetzt transparent: OBS = sofort OK, Browser = beliebiger Klick auf die Seite

## [0.0.8] – 2026-04-21

### Added
- **Datei bearbeiten** – Bearbeiten-Button (Stift-Icon) auf jedem Sound/Video
- **Per-File Spieldauer** – Max. Spieldauer in ms pro Datei einstellbar
- **Anzeigename** – Optionaler Anzeigename fuer Dateien im Admin
- Dauer-Badge wird auf File-Cards angezeigt wenn gesetzt (orange)
- Edit-Modal mit Anzeigename + Spieldauer + Dateiname (readonly)

### Changed
- API: `PUT /api/media/settings` fuer per-File Einstellungen
- API: Sounds/Videos liefern jetzt `duration_ms` und `display_name`
- Overlay nutzt `durationOverride` pro Datei (Sound wird abgeschnitten, Video gestoppt)
- Command-Dropdown zeigt Anzeigename statt internem Dateinamen

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
