// =============================================
// TwitchSoundBoard – Server (Backend)
// Version: 0.0.1
// Twurple v8 API
// =============================================

require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');

// ---- Twurple v8 (Twitch API) ----
const { ApiClient } = require('@twurple/api');
const { StaticAuthProvider } = require('@twurple/auth');
const { ChatClient } = require('@twurple/chat');
const { EventSubMiddleware } = require('@twurple/eventsub-http');

// ---- Konfiguration laden ----
const CONFIG_PATH = path.join(__dirname, 'config.json');
let config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

function reloadConfig() {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    log('INFO', 'config.json neu geladen');
  } catch (e) {
    log('ERROR', `Fehler beim Laden der config.json: ${e.message}`);
  }
}

// ---- Logging ----
function log(level, msg) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}]`;
  console.log(`${prefix} ${msg}`);
}

// ---- Umgebungsvariablen validieren ----
const required = ['TWITCH_CLIENT_ID', 'TWITCH_CLIENT_SECRET', 'TWITCH_CHANNEL'];
for (const key of required) {
  if (!process.env[key]) {
    log('ERROR', `Fehlende Umgebungsvariable: ${key}`);
    log('ERROR', 'Kopiere .env.example als .env und trage deine Daten ein.');
    process.exit(1);
  }
}

const {
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  TWITCH_CHANNEL,
  TWITCH_BROADCASTER_ID,
  TWITCH_BOT_TOKEN,
  PORT = 3000,
  WS_PORT = 3001,
  PUBLIC_URL,
  EVENTSUB_SECRET
} = process.env;

// =============================================
// Express Server (Static Files + EventSub)
// =============================================
const app = express();
const server = http.createServer(app);

app.use(express.json());

// Statische Dateien für das OBS-Overlay
app.use('/sounds', express.static(path.join(__dirname, 'sounds')));
app.use('/videos', express.static(path.join(__dirname, 'videos')));
app.use('/', express.static(path.join(__dirname, 'public')));

// Health-Check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime(), version: getVersion() });
});

// Config-Reload (nur lokal)
app.post('/api/reload-config', (req, res) => {
  reloadConfig();
  broadcastToClients({ type: 'config_reloaded', config });
  res.json({ status: 'ok' });
});

// =============================================
// WebSocket Server (Overlay-Kommunikation)
// =============================================
const wss = new WebSocket.Server({ port: parseInt(WS_PORT) });
const overlayClients = new Set();

wss.on('connection', (ws) => {
  log('INFO', `Overlay verbunden (${overlayClients.size + 1} Clients)`);
  overlayClients.add(ws);

  // Sende aktuelle Config beim Connect
  ws.send(JSON.stringify({ type: 'init', config }));

  ws.on('close', () => {
    overlayClients.delete(ws);
    log('INFO', `Overlay getrennt (${overlayClients.size} verbleibend)`);
  });

  ws.on('error', (err) => {
    log('ERROR', `WebSocket Fehler: ${err.message}`);
  });
});

function broadcastToClients(data) {
  const message = JSON.stringify(data);
  for (const client of overlayClients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  }
}

function triggerOverlay(file, type, source, user) {
  const settings = config.settings || {};
  const volume = type === 'video' ? (settings.video_volume || 0.5) : (settings.sound_volume || 0.8);
  const allowOverlap = settings.allow_overlap || false;
  const maxQueue = settings.max_queue_size || 10;

  const payload = {
    type: 'play',
    file,
    mediaType: type,
    source,
    user: user || 'System',
    volume,
    allowOverlap,
    maxQueue,
    videoDurationOverride: settings.video_duration_override_ms || 5000
  };

  log('INFO', `Trigger: ${type} "${file}" von ${user} (${source})`);
  broadcastToClients(payload);
}

// =============================================
// Twitch Auth (Twurple v8)
// =============================================
let broadcasterId = TWITCH_BROADCASTER_ID;
let apiClient;
let chatClient;
let appAccessToken = '';

async function initTwitch() {
  try {
    // App Access Token über Client Credentials Flow holen
    const tokenResponse = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
      { method: 'POST' }
    );

    if (!tokenResponse.ok) {
      const errBody = await tokenResponse.text();
      throw new Error(`Token-Anfrage fehlgeschlagen (${tokenResponse.status}): ${errBody}`);
    }

    const tokenData = await tokenResponse.json();
    appAccessToken = tokenData.access_token;
    log('INFO', 'App Access Token erhalten');

    // StaticAuthProvider mit App Access Token
    const authProvider = new StaticAuthProvider(TWITCH_CLIENT_ID, appAccessToken, [
      'channel:read:redemptions',
      'bits:read',
      'chat:read'
    ]);

    // API Client erstellen
    apiClient = new ApiClient({ authProvider });

    // Broadcaster-ID ermitteln falls nicht gesetzt
    if (!broadcasterId) {
      const users = await apiClient.users.getUsersByNames([TWITCH_CHANNEL]);
      if (!users || users.length === 0) {
        throw new Error(`Kanal "${TWITCH_CHANNEL}" nicht gefunden!`);
      }
      broadcasterId = users[0].id;
      log('INFO', `Broadcaster-ID: ${broadcasterId} (${TWITCH_CHANNEL})`);
    }

    return authProvider;

  } catch (err) {
    log('ERROR', `Twitch-Auth fehlgeschlagen: ${err.message}`);
    log('ERROR', 'Pruefe deine Client ID/Secret in der .env Datei.');
    process.exit(1);
  }
}

// =============================================
// Twitch Chat (Chat-Commands abhoeren)
// =============================================
async function initChat(authProvider) {
  try {
    let chatAuthProvider;

    if (TWITCH_BOT_TOKEN) {
      // Eigenstaendiger Bot-Token
      chatAuthProvider = new StaticAuthProvider(TWITCH_CLIENT_ID, TWITCH_BOT_TOKEN);
    } else {
      // Ohne Bot-Token: App Access Token fuer Lesezugriff
      chatAuthProvider = authProvider;
    }

    chatClient = new ChatClient({
      authProvider: chatAuthProvider,
      channels: [TWITCH_CHANNEL]
    });

    chatClient.onMessage((channel, user, text, msg) => {
      const settings = config.settings || {};
      const prefix = settings.command_prefix || '!';

      if (text.startsWith(prefix)) {
        const command = text.toLowerCase().split(' ')[0];
        const mapping = config.chat_commands || {};

        if (mapping[command]) {
          triggerOverlay(mapping[command].file, mapping[command].type, 'chat_command', user);
        }
      }
    });

    await chatClient.connect();
    log('INFO', `Chat verbunden mit #${TWITCH_CHANNEL}`);

  } catch (err) {
    log('ERROR', `Chat-Verbindung fehlgeschlagen: ${err.message}`);
    log('WARN', 'Chat-Commands nicht verfuegbar. EventSub funktioniert trotzdem.');
  }
}

// =============================================
// Twitch EventSub (Bits & Kanalpunkte)
// Twurple v8: EventSubMiddleware
// =============================================
async function initEventSub() {
  if (!PUBLIC_URL) {
    log('WARN', 'PUBLIC_URL nicht gesetzt - EventSub (Bits & Kanalpunkte) deaktiviert.');
    log('WARN', 'Setze PUBLIC_URL in .env (z.B. ngrok URL) und restarte.');
    return;
  }

  try {
    const eventSubMiddleware = new EventSubMiddleware({
      apiClient,
      secret: EVENTSUB_SECRET || 'change-me-set-a-real-secret',
      hostName: PUBLIC_URL.replace(/\/$/, '')
    });

    // Middleware an Express anbinden
    eventSubMiddleware.apply(app);

    // ---- Bits / Cheers ----
    eventSubMiddleware.subscribeToChannelCheerEvents(broadcasterId, async (event) => {
      const bitsAmount = event.bits;
      const mapping = config.bits || {};

      // Beste Match-Schwelle finden (hoechste passende Stufe)
      let matched = null;
      const sortedKeys = Object.keys(mapping).sort((a, b) => {
        const aVal = parseInt(a.replace('cheer', '')) || 0;
        const bVal = parseInt(b.replace('cheer', '')) || 0;
        return bVal - aVal; // Absteigend
      });

      for (const key of sortedKeys) {
        const threshold = parseInt(key.replace('cheer', '')) || 0;
        if (bitsAmount >= threshold) {
          matched = mapping[key];
          break;
        }
      }

      if (matched) {
        triggerOverlay(matched.file, matched.type, `cheer_${bitsAmount}bits`, event.userDisplayName);
      }
    });

    // ---- Kanalpunkte Custom Rewards ----
    eventSubMiddleware.subscribeToChannelRedemptionAddEvents(broadcasterId, async (event) => {
      const rewardId = event.rewardId;
      const mapping = config.channel_points || {};

      if (mapping[rewardId]) {
        triggerOverlay(mapping[rewardId].file, mapping[rewardId].type, 'channel_points', event.userDisplayName);
      }
    });

    log('INFO', `EventSub aktiv (Bits + Kanalpunkte) auf ${PUBLIC_URL}`);

  } catch (err) {
    log('ERROR', `EventSub-Init fehlgeschlagen: ${err.message}`);
    log('WARN', 'Bits & Kanalpunkte nicht verfuegbar. Chat-Commands funktionieren trotzdem.');
  }
}

// =============================================
// Hilfsfunktionen
// =============================================
function getVersion() {
  try {
    return fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf-8').trim();
  } catch {
    return '0.0.0';
  }
}

// Graceful Shutdown
process.on('SIGINT', () => {
  log('INFO', 'Shutting down...');
  if (chatClient) chatClient.quit();
  server.close();
  wss.close();
  process.exit(0);
});

// =============================================
// START
// =============================================
async function main() {
  console.log('');
  console.log('================================================');
  console.log('  TwitchSoundBoard v' + getVersion());
  console.log('  Twitch Sound Alert System');
  console.log('================================================');
  console.log('');

  // Config pruefen
  log('INFO', 'Konfiguration geladen');
  log('INFO', `Kanal: ${TWITCH_CHANNEL}`);
  log('INFO', `HTTP-Port: ${PORT}`);
  log('INFO', `WebSocket-Port: ${WS_PORT}`);

  // Sounds- & Videos-Verzeichnis pruefen/erstellen
  if (!fs.existsSync(path.join(__dirname, 'sounds'))) {
    fs.mkdirSync(path.join(__dirname, 'sounds'), { recursive: true });
    log('WARN', 'sounds/ Ordner erstellt - lege Sounddateien (.mp3, .wav, .ogg) dort ab.');
  }

  if (!fs.existsSync(path.join(__dirname, 'videos'))) {
    fs.mkdirSync(path.join(__dirname, 'videos'), { recursive: true });
    log('WARN', 'videos/ Ordner erstellt - lege Videodateien (.mp4, .webm) dort ab.');
  }

  // Twitch initialisieren (Auth + API)
  const authProvider = await initTwitch();

  // Twitch Chat starten
  await initChat(authProvider);

  // EventSub starten (Bits & Kanalpunkte)
  await initEventSub();

  // HTTP Server starten
  server.listen(PORT, () => {
    console.log('');
    console.log('------------------------------------------------');
    console.log(`  HTTP:     http://localhost:${PORT}`);
    console.log(`  OBS URL:  http://localhost:${PORT}/index.html`);
    console.log(`  Debug:    http://localhost:${PORT}/index.html?debug`);
    console.log(`  WebSocket: ws://localhost:${WS_PORT}`);
    console.log('------------------------------------------------');
    log('INFO', 'Bereit - Warte auf Chat-Commands!');
    console.log('');
  });
}

main().catch((err) => {
  log('ERROR', `Fatal: ${err.message}`);
  console.error(err);
  process.exit(1);
});
