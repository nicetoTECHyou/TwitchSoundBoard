// =============================================
// TwitchSoundBoard – Server (Backend) v0.0.2
// Admin-Interface + Upload + Twitch EventSub
// =============================================

require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

// ---- Pfade ----
const SOUNDS_DIR = path.join(__dirname, 'sounds');
const VIDEOS_DIR = path.join(__dirname, 'videos');
const CONFIG_PATH = path.join(__dirname, 'config.json');
const DATA_PATH = path.join(__dirname, 'data.json');

// Ordner sicherstellen
[SOUNDS_DIR, VIDEOS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ---- Multer (File Upload) ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const isVideo = /\.(mp4|webm|avi|mov)$/i.test(file.originalname);
    cb(null, isVideo ? VIDEOS_DIR : SOUNDS_DIR);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._\-äöüÄÖÜß ]/g, '_');
    cb(null, Date.now() + '_' + safeName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB Max
  fileFilter: (req, file, cb) => {
    const allowed = /\.(mp3|wav|ogg|mp4|webm|avi|mov)$/i;
    if (allowed.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error('Ungueltiger Dateityp. Erlaubt: mp3, wav, ogg, mp4, webm'));
    }
  }
});

// ---- Konfiguration ----
const DEFAULT_CONFIG = {
  channel_points: {},
  bits: {},
  chat_commands: {},
  settings: {
    allow_overlap: false,
    max_queue_size: 10,
    sound_volume: 0.8,
    video_volume: 0.5,
    command_prefix: '!',
    video_duration_override_ms: 5000,
    log_to_console: true
  }
};

let config = {};
function loadConfig() {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch {
    config = JSON.parse(JSON.stringify(DEFAULT_CONFIG));
    saveConfig();
  }
}
function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

loadConfig();

// ---- Logging ----
function log(level, msg) {
  const ts = new Date().toISOString();
  console.log(`[${ts}] [${level}] ${msg}`);
}

// ---- Umgebungsvariablen ----
const {
  PORT = 3000,
  WS_PORT = 3001,
  ADMIN_PASSWORD,
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET,
  TWITCH_CHANNEL,
  TWITCH_BROADCASTER_ID,
  TWITCH_BOT_TOKEN,
  PUBLIC_URL,
  EVENTSUB_SECRET
} = process.env;

// =============================================
// Express Server
// =============================================
const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Statische Dateien
app.use('/media/sounds', express.static(SOUNDS_DIR));
app.use('/media/videos', express.static(VIDEOS_DIR));

// =============================================
// API Routes – Media Management
// =============================================

// Alle Sounds auflisten
app.get('/api/sounds', (req, res) => {
  const files = fs.readdirSync(SOUNDS_DIR)
    .filter(f => /\.(mp3|wav|ogg)$/i.test(f))
    .map(f => ({ name: f, path: `/media/sounds/${f}`, size: fs.statSync(path.join(SOUNDS_DIR, f)).size }));
  res.json(files);
});

// Alle Videos auflisten
app.get('/api/videos', (req, res) => {
  const files = fs.readdirSync(VIDEOS_DIR)
    .filter(f => /\.(mp4|webm|avi|mov)$/i.test(f))
    .map(f => ({ name: f, path: `/media/videos/${f}`, size: fs.statSync(path.join(VIDEOS_DIR, f)).size }));
  res.json(files);
});

// Upload (Sound + Video)
app.post('/api/upload', upload.array('files', 20), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'Keine Dateien empfangen' });
  }
  const uploaded = req.files.map(f => ({
    name: f.filename,
    originalName: f.originalname,
    path: f.path.includes('/videos/') ? `/media/videos/${f.filename}` : `/media/sounds/${f.filename}`,
    type: f.path.includes('/videos/') ? 'video' : 'sound',
    size: f.size
  }));
  log('INFO', `${uploaded.length} Datei(en) hochgeladen`);
  broadcastToClients({ type: 'media_updated' });
  res.json({ uploaded });
});

// Datei loeschen
app.delete('/api/media/:type/:filename', (req, res) => {
  const { type, filename } = req.params;
  const dir = type === 'video' ? VIDEOS_DIR : SOUNDS_DIR;
  const filePath = path.join(dir, filename);

  if (!filePath.startsWith(dir)) {
    return res.status(403).json({ error: 'Zugriff verweigert' });
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Datei nicht gefunden' });
  }

  fs.unlinkSync(filePath);
  log('INFO', `Datei geloescht: ${filename}`);

  // Aus Config entfernen
  removeFromConfig(filename);
  broadcastToClients({ type: 'media_updated' });
  res.json({ success: true });
});

function removeFromConfig(filename) {
  for (const section of ['chat_commands', 'bits', 'channel_points']) {
    for (const [key, val] of Object.entries(config[section] || {})) {
      if (val.file === filename) {
        delete config[section][key];
      }
    }
  }
  saveConfig();
}

// =============================================
// API Routes – Config Management
// =============================================

// Config lesen
app.get('/api/config', (req, res) => {
  res.json(config);
});

// Config speichern (komplett)
app.put('/api/config', (req, res) => {
  config = req.body;
  saveConfig();
  broadcastToClients({ type: 'config_reloaded', config });
  log('INFO', 'Config aktualisiert');
  res.json({ success: true });
});

// Einzelnen Command hinzufuegen/aendern
app.post('/api/config/commands', (req, res) => {
  const { command, file, type } = req.body;
  if (!command || !file || !type) {
    return res.status(400).json({ error: 'command, file und type erforderlich' });
  }
  if (!config.chat_commands) config.chat_commands = {};
  config.chat_commands[command] = { file, type };
  saveConfig();
  broadcastToClients({ type: 'config_reloaded', config });
  log('INFO', `Command "${command}" -> "${file}" (${type})`);
  res.json({ success: true });
});

// Command loeschen
app.delete('/api/config/commands/:command', (req, res) => {
  const cmd = decodeURIComponent(req.params.command);
  if (config.chat_commands && config.chat_commands[cmd]) {
    delete config.chat_commands[cmd];
    saveConfig();
    broadcastToClients({ type: 'config_reloaded', config });
    log('INFO', `Command "${cmd}" geloescht`);
  }
  res.json({ success: true });
});

// Bits-Trigger hinzufuegen
app.post('/api/config/bits', (req, res) => {
  const { key, file, type } = req.body;
  if (!key || !file || !type) {
    return res.status(400).json({ error: 'key, file und type erforderlich' });
  }
  if (!config.bits) config.bits = {};
  config.bits[key] = { file, type };
  saveConfig();
  broadcastToClients({ type: 'config_reloaded', config });
  log('INFO', `Bits-Trigger "${key}" -> "${file}"`);
  res.json({ success: true });
});

// Bits-Trigger loeschen
app.delete('/api/config/bits/:key', (req, res) => {
  const k = decodeURIComponent(req.params.key);
  if (config.bits && config.bits[k]) {
    delete config.bits[k];
    saveConfig();
    broadcastToClients({ type: 'config_reloaded', config });
  }
  res.json({ success: true });
});

// Channel-Points Reward hinzufuegen
app.post('/api/config/rewards', (req, res) => {
  const { rewardId, file, type, label } = req.body;
  if (!rewardId || !file || !type) {
    return res.status(400).json({ error: 'rewardId, file und type erforderlich' });
  }
  if (!config.channel_points) config.channel_points = {};
  config.channel_points[rewardId] = { file, type, label: label || rewardId };
  saveConfig();
  broadcastToClients({ type: 'config_reloaded', config });
  log('INFO', `Reward "${label || rewardId}" -> "${file}"`);
  res.json({ success: true });
});

// Channel-Points Reward loeschen
app.delete('/api/config/rewards/:rewardId', (req, res) => {
  const rid = decodeURIComponent(req.params.rewardId);
  if (config.channel_points && config.channel_points[rid]) {
    delete config.channel_points[rid];
    saveConfig();
    broadcastToClients({ type: 'config_reloaded', config });
  }
  res.json({ success: true });
});

// Settings aktualisieren
app.put('/api/config/settings', (req, res) => {
  config.settings = { ...config.settings, ...req.body };
  saveConfig();
  broadcastToClients({ type: 'config_reloaded', config });
  log('INFO', 'Settings aktualisiert');
  res.json({ success: true });
});

// =============================================
// API – Health & Status
// =============================================
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    version: getVersion(),
    twitch: {
      connected: twitchStatus.connected,
      chatConnected: twitchStatus.chatConnected,
      channel: TWITCH_CHANNEL || null,
      eventSub: twitchStatus.eventSubActive
    },
    sounds: fs.readdirSync(SOUNDS_DIR).filter(f => /\.(mp3|wav|ogg)$/i.test(f)).length,
    videos: fs.readdirSync(VIDEOS_DIR).filter(f => /\.(mp4|webm|avi|mov)$/i.test(f)).length,
    overlayClients: overlayClients.size
  });
});

// =============================================
// WebSocket Server (Overlay)
// =============================================
const wss = new WebSocket.Server({ port: parseInt(WS_PORT) });
const overlayClients = new Set();

wss.on('connection', (ws) => {
  log('INFO', `Overlay verbunden (${overlayClients.size + 1} Clients)`);
  overlayClients.add(ws);
  ws.send(JSON.stringify({ type: 'init', config }));

  ws.on('close', () => {
    overlayClients.delete(ws);
  });
  ws.on('error', () => {});
});

function broadcastToClients(data) {
  const msg = JSON.stringify(data);
  for (const c of overlayClients) {
    if (c.readyState === WebSocket.OPEN) c.send(msg);
  }
}

function triggerOverlay(file, type, source, user) {
  const s = config.settings || {};
  broadcastToClients({
    type: 'play',
    file,
    mediaType: type,
    source,
    user: user || 'System',
    volume: type === 'video' ? (s.video_volume || 0.5) : (s.sound_volume || 0.8),
    allowOverlap: s.allow_overlap || false,
    maxQueue: s.max_queue_size || 10,
    videoDurationOverride: s.video_duration_override_ms || 5000
  });
  log('INFO', `Trigger: ${type} "${file}" von ${user} (${source})`);
}

// =============================================
// Admin-Interface (statische HTML)
// =============================================
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// OBS Overlay
app.get('/overlay', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'overlay.html'));
});

// Root -> Admin
app.get('/', (req, res) => {
  res.redirect('/admin');
});

// =============================================
// Twitch Integration (optional!)
// Server startet OHNE Twitch – Admin funktioniert sofort
// =============================================
let twitchStatus = {
  connected: false,
  chatConnected: false,
  eventSubActive: false
};

async function initTwitch() {
  if (!TWITCH_CLIENT_ID || !TWITCH_CLIENT_SECRET || !TWITCH_CHANNEL) {
    log('WARN', 'Twitch nicht konfiguriert – Admin-Panel funktioniert ohne Twitch.');
    log('INFO', 'Trage TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET und TWITCH_CHANNEL in .env ein.');
    return;
  }

  try {
    const { ApiClient } = require('@twurple/api');
    const { StaticAuthProvider } = require('@twurple/auth');
    const { ChatClient } = require('@twurple/chat');

    // App Access Token
    const tokenRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${TWITCH_CLIENT_ID}&client_secret=${TWITCH_CLIENT_SECRET}&grant_type=client_credentials`,
      { method: 'POST' }
    );

    if (!tokenRes.ok) throw new Error(`Token fehlgeschlagen (${tokenRes.status})`);
    const tokenData = await tokenRes.json();

    const authProvider = new StaticAuthProvider(TWITCH_CLIENT_ID, tokenData.access_token);
    const apiClient = new ApiClient({ authProvider });

    // Broadcaster-ID ermitteln
    let broadcasterId = TWITCH_BROADCASTER_ID;
    if (!broadcasterId) {
      const users = await apiClient.users.getUsersByNames([TWITCH_CHANNEL]);
      if (!users || users.length === 0) throw new Error(`Kanal "${TWITCH_CHANNEL}" nicht gefunden`);
      broadcasterId = users[0].id;
    }

    twitchStatus.connected = true;
    log('INFO', `Twitch verbunden: ${TWITCH_CHANNEL} (${broadcasterId})`);

    // ---- Chat ----
    try {
      let chatAuth = TWITCH_BOT_TOKEN
        ? new StaticAuthProvider(TWITCH_CLIENT_ID, TWITCH_BOT_TOKEN)
        : authProvider;

      const chatClient = new ChatClient({ authProvider: chatAuth, channels: [TWITCH_CHANNEL] });

      chatClient.onMessage((_ch, user, text) => {
        const prefix = (config.settings || {}).command_prefix || '!';
        if (text.startsWith(prefix)) {
          const cmd = text.toLowerCase().split(' ')[0];
          const mapping = (config.chat_commands || {});
          if (mapping[cmd]) {
            triggerOverlay(mapping[cmd].file, mapping[cmd].type, 'chat_command', user);
          }
        }
      });

      await chatClient.connect();
      twitchStatus.chatConnected = true;
      log('INFO', `Chat verbunden: #${TWITCH_CHANNEL}`);
    } catch (e) {
      log('ERROR', `Chat fehlgeschlagen: ${e.message}`);
    }

    // ---- EventSub (optional, braucht PUBLIC_URL) ----
    if (PUBLIC_URL) {
      try {
        const { EventSubMiddleware } = require('@twurple/eventsub-http');
        const es = new EventSubMiddleware({
          apiClient,
          secret: EVENTSUB_SECRET || 'change-me-default-secret',
          hostName: PUBLIC_URL.replace(/\/$/, '')
        });
        es.apply(app);

        es.subscribeToChannelCheerEvents(broadcasterId, async (ev) => {
          const bits = ev.bits;
          const mapping = config.bits || {};
          let matched = null;
          const keys = Object.keys(mapping).sort((a, b) => {
            return (parseInt(b.replace('cheer', '')) || 0) - (parseInt(a.replace('cheer', '')) || 0);
          });
          for (const k of keys) {
            if (bits >= (parseInt(k.replace('cheer', '')) || 0)) { matched = mapping[k]; break; }
          }
          if (matched) triggerOverlay(matched.file, matched.type, `cheer_${bits}bits`, ev.userDisplayName);
        });

        es.subscribeToChannelRedemptionAddEvents(broadcasterId, async (ev) => {
          const mapping = config.channel_points || {};
          if (mapping[ev.rewardId]) {
            triggerOverlay(mapping[ev.rewardId].file, mapping[ev.rewardId].type, 'channel_points', ev.userDisplayName);
          }
        });

        twitchStatus.eventSubActive = true;
        log('INFO', `EventSub aktiv auf ${PUBLIC_URL}`);
      } catch (e) {
        log('ERROR', `EventSub fehlgeschlagen: ${e.message}`);
      }
    } else {
      log('WARN', 'EventSub deaktiviert (PUBLIC_URL nicht gesetzt)');
    }

  } catch (e) {
    log('ERROR', `Twitch-Init fehlgeschlagen: ${e.message}`);
    log('WARN', 'Server laeuft trotzdem – Admin-Panel ist verfuegbar.');
  }
}

// =============================================
// Hilfsfunktionen
// =============================================
function getVersion() {
  try { return fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf-8').trim(); }
  catch { return '0.0.0'; }
}

process.on('SIGINT', () => {
  log('INFO', 'Shutdown...');
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
  console.log('  Sound Alert System + Admin Panel');
  console.log('================================================');
  console.log('');

  server.listen(PORT, () => {
    console.log('  Admin Panel:    http://localhost:' + PORT + '/admin');
    console.log('  OBS Overlay:    http://localhost:' + PORT + '/overlay');
    console.log('  OBS Debug:      http://localhost:' + PORT + '/overlay?debug');
    console.log('  WebSocket:      ws://localhost:' + WS_PORT);
    console.log('================================================');
    log('INFO', 'Server gestartet – Oeffne http://localhost:' + PORT + '/admin');
    console.log('');
  });

  // Twitch asynchron starten (non-blocking!)
  initTwitch();
}

main().catch(e => {
  log('ERROR', `Fatal: ${e.message}`);
  console.error(e);
  process.exit(1);
});
