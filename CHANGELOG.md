
## [0.6.2] – 2026-04-24

### Fixed
- **Vote Overlay zeigt nichts** – vote.html war komplett transparent/leer wenn kein Vote aktiv. Jetzt: Gruener "Vote Overlay Ready" Indicator unten in der Mitte wenn verbunden. Verschwindet automatisch wenn ein Vote startet und kommt nach dem Vote zurueck.

### Added
- **Debug-Modus fuer Vote Overlay** – `/vote?debug` zeigt Debug-Informationen (WebSocket Status, Vote Events, Logs).

## [0.6.1] – 2026-04-24

### Added
- **Eigenstaendige Vote Overlay (vote.html)** – Vote-Anzeige ist jetzt eine separate OBS-Browser-Quelle. Einfach eine zweite Browserquelle in OBS hinzufuegen mit der `/vote` URL.
- **Animierte Vote-Balken** – Hot/Not Balken mit Glow-Effekt, Shimmer-Animation, Leading-Indikator und Count-Bump bei neuen Stimmen.
- **Live Voting im Admin** – Queue-Tab zeigt jetzt Live-Vote-Status mit Trackname, Stimmenanzahl und Voter-Liste.
- **Vote Overlay URL im OBS-Tab** – Neue URL-Box fuer das Vote-Overlay.
- **Connection-Indicator auf dem Overlay** – Gruener/Roter Punkt oben links zeigt immer den WebSocket-Verbindungsstatus (nicht mehr nur im Debug-Modus).

### Changed
- Vote UI komplett aus overlay.html entfernt (jetzt in vote.html)

## [0.6.0] – 2026-04-24

### Added
- **Hot or Not Voting System** – Viewer koennen waehrend ein YouTube Track laeuft mit !Hot oder !Not abstimmen. Erreicht eine Seite das Threshold (standardmaessig 5), wird der Track behalten (Hot) oder geloescht + geskippt (Not). Jeder User hat 1 Stimme pro Track.
- **Animierte Vote-Bar im Overlay** – Unten am Bildschirmrand: animierte Fortschrittsbalken fuer Hot/Not mit Slide-In/Out Animationen und Ergebnis-Overlay.
- **Bot Vote-Prompt** – Bei aktiviertem Voting postet der Bot automatisch: "TRACKNAME - Votet !Hot oder !Not um ueber die Zukunft des Liedes zu entscheiden"
- **Voting Threshold einstellbar** – Beliebig viele Stimmen (1-50) im Admin einstellbar.
- **Export / Import fuer Embed Links** – Alle Embed Links + zugehoerige Commands als JSON exportieren und importieren. Nuetzlich bei Versionswechsel.

### Changed
- Chat-Benachrichtigungen aufgeteilt in eigene Settings-Karten

## [0.5.0] – 2026-04-24

### Added
- **Artist + Titel Anzeige** – Queue und Chat-Commands zeigen jetzt Artist - Titel statt YouTube-IDs. Sounds zeigen weiterhin Dateiname, Videos den Display-Namen.
- **Artist-Feld fuer Embed Links** – Neues Feld "Artist / Kuenstler" im Link-Bearbeiten-Modal. Kann individuell pro Link gesetzt werden.
- **Artist Whitelist** – Im Queue-Tab koennen Artists freigegeben werden. Nur freigegebene Artists werden per !ytlink aus Chat abgespielt. Ohne Eintraege sind alle erlaubt. Admin-Trigger sind immer freigeschaltet.
- **Song-Info bei Wechsel** – Bot postet automatisch Artist + Titel in den Chat wenn sich das laufende Lied aendert (togglebar in Einstellungen).
- **!queue Command** – Viewer koennen die aktuelle Warteschlange im Chat abfragen (max 5 Eintraege, togglebar).
- **Bot Account Name** – Eigenes Feld im Twitch-Tab fuer den Bot-Account-Namen (getrennt vom Kanalnamen).

### Changed
- Commands-Liste zeigt fuer Links: Artist - Titel, fuer Videos: Display-Name, fuer Sounds: Dateiname

## [0.4.4] – 2026-04-22

### Fixed
- **Queue Stop/Skip/Clear funktioniert nicht** – `currentCleanup` wurde nur innerhalb der cleanup-Funktion selbst zugewiesen. Beim ersten Skip/Stop war `currentCleanup` immer `null`, sodass die Aktion ignoriert wurde. Fix: `currentCleanup = cleanup` wird jetzt direkt nach Definition der Funktion zugewiesen, bevor das Abspielen startet.
- **Fallback fuer Queue-Stop** – Falls cleanup nicht registriert ist, wird `isPlaying`/`currentItem` jetzt direkt zurueckgesetzt.

## [0.4.3] – 2026-04-21

### Changed
- Version bump von 0.4.2 auf 0.4.3

## [0.4.2] – 2026-04-21

### Changed
- Version bump von 0.4.1 auf 0.4.2

## [0.4.1] – 2026-04-21

### Changed
- Version bump von 0.4.0 auf 0.4.1
# Changelog

## [0.2.2] – 2026-04-22

### Fixed
- **"Failed to find any playable formats" Error** – ytdl wirft diesen Fehler wenn keine combined formats gefunden werden. Der Code pruefte vorher nur auf "sign in/age/login" und warf alle anderen Fehler direkt weiter. Jetzt: JEDER ytdl-Fehler geht automatisch zum Invidious-Proxy-Fallback.
- **Invidious formatStreams oft leer** – Viele Invidious-Instanzen liefern keine formatStreams mehr. Neue Strategie: Erst formatStreams pruefen, dann `/latest_version` Proxy-Endpoint (itag 18 = 360p combined MP4, IMMER verfuegbar auf YouTube).
- **Redirect-Handling** – Invidious Proxy sendet oft 301/302 Redirects zu Google-CDN. Werden jetzt automatisch gefolgt.
- **Mehr Invidious-Instanzen** – 8 Instanzen statt 6.
- **Timeouts erhoht** – 180s Download-Timeout (fuer lange Videos), 15s Info-Timeout.

## [0.2.1] – 2026-04-22

### Fixed
- **"Sign in to confirm your age" Fehler** – YouTube blockiert den direkten Download bei Altersbeschraenkungen. Jetzt automatisch: Erst Direkt-Download versuchen (schneller), bei age-restricted/private/unavailable Fehlern automatisch ueber Invidious-Proxy laden (braucht kein Login). 6 Invidious-Instanzen als Fallback.
- Spotify-Import hat denselben Invidious-Fallback bekommen.
- Proxy-Download hat 120s Timeout pro Instanz bevor naechste versucht wird.

## [0.2.0] – 2026-04-22

### Added
- **YouTube Import** – YouTube Video-Link einfuegen, wird als MP4-Video heruntergeladen (mit Audio+Video, kein ffmpeg noetig). Erscheint in der Video-Liste, kann als Chat-Command hinterlegt werden.
- **Spotify Import** – Spotify Track-Link einfuegen, Track wird automatisch auf YouTube gesucht und als Audio (M4A) heruntergeladen. Erscheint in der Sound-Liste.
- **Import UI** – Neue Karte im Sounds-Tab: YouTube/Spotify Link eingeben, Import-Button klicken, fertig. Automatisch: Anzeigename = Track-Titel, duration_ms=0 (ganzes Video).
- **M4A/WebM Unterstuetzung** – Sounds in M4A und WebM Format werden jetzt erkannt und abgespielt.
- **Upload-Limit auf 50 MB** erhoeht (fuer groessere Video-Uploads).

### Changed
- Neue Dependency: `@distube/ytdl-core` (YouTube Download, kein ffmpeg noetig)
- YouTube-Suche via Invidious API mit 4 Instanzen als Fallback (keine extra npm Packages)
- Spotify Track-Info via oEmbed API (kein Auth noetig)
- Upload-Zulassung: MP3, WAV, OGG, M4A, MP4, WebM

## [0.1.0] – 2026-04-22

### Fixed
- **Video-Laenge Bug** – Ein 3:52 Video wurde nach 5 Sekunden gestoppt. Ursache: `duration_ms || 5000` in JavaScript behandelt `0` als falsy, also wurde immer der Default (5000ms) genommen. Jetzt: `0` = ganzes Video abspielen, leer = globaler Default, Zahl = Cut nach X ms.
- **Safety-Timeout killt lange Videos** – Safety-Timeout war starr auf 60 Sekunden. Ein 3:52 Video wurde nach 60s hart gekillt. Jetzt: dynamisch berechnet. Mit durationOverride = override + 15s Puffer. Ohne Override = 10 Minuten fuer Videos, 2 Minuten fuer Sounds.
- **Server sendet falsche durationOverride** – triggerOverlay() behandelte `duration_ms = 0` nicht korrekt. Komplett umgeschrieben: explizite Pruefung auf `undefined`/`null` statt falsy-Check.

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
