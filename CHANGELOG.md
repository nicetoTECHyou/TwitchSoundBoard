# Changelog

## [0.0.3] – 2026-04-21

### Changed
- **Komplett auf lokalen Betrieb umgebaut** – kein HTTPS/ngrok mehr noetig
- EventSub (Bits & Kanalpunkte) entfernt – braucht zwingend HTTPS
- `@twurple/api` und `@twurple/eventsub-http` aus Dependencies entfernt
- `.env.example` aufgeraeumt – nur noch Channel + Bot-Token

### Added
- **Test-Trigger Button** im Admin Panel – sendet Sound/Video direkt ans Overlay
- **Trigger Button** auf jeder Datei im Sounds/Videos Grid
- Server laeuft komplett ohne Twitch (nur Upload + Overlay)

### Removed
- Bits & Rewards Tab aus Admin Panel (braucht HTTPS, nicht lokal moeglich)
- PUBLIC_URL, EVENTSUB_SECRET aus Konfiguration
- `@twurple/api`, `@twurple/eventsub-http` Dependencies

## [0.0.2] – 2026-04-21

### Added
- Admin Web-Panel mit Upload, Commands, Settings
- start.bat crasht nicht mehr
- Twitch optional

## [0.0.1] – 2026-04-21

### Added
- Initiales Release
