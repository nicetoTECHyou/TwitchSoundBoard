// =============================================
// TwitchSoundBoard – Server v0.0.3
// Lokaler Server: Admin Panel + OBS Overlay
// Twitch Chat (optional, nur Bot-Token noetig)
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

[SOUNDS_DIR, VIDEOS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ---- Multer Upload ----
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, /\.(mp4|webm|avi|mov)$/i.test(file.originalname) ? VIDEOS_DIR : SOUNDS_DIR);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '_' + file.originalname.replace(/[^a-zA-Z0-9._\-aeiouAEIOU ]/g, '_'));
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    /\.(mp3|wav|ogg|mp4|webm|avi|mov)$/i.test(file.originalname)
      ? cb(null, true)
      : cb(new Error('Erlaubt: mp3, wav, ogg, mp4, webm'));
  }
});

// ---- Config ----
const DEFAULT_CONFIG = {
  chat_commands: {},
  settings: {
    allow_overlap: false,
    max_queue_size: 10,
    sound_volume: 0.8,
    video_volume: 0.5,
    command_prefix: '!',
    video_duration_override_ms: 5000
  }
};

let config = {};
function loadConfig() {
  try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); }
  catch { config = JSON.parse(JSON.stringify(DEFAULT_CONFIG)); saveConfig(); }
}
function saveConfig() {
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}
loadConfig();

// ---- Logging ----
function log(lvl, msg) {
  console.log(`[${new Date().toISOString()}] [${lvl}] ${msg}`);
}

// ---- ENV ----
const {
  PORT = 3000,
  WS_PORT = 3001,
  TWITCH_CHANNEL,
  TWITCH_BOT_TOKEN,
  TWITCH_CLIENT_ID,
  TWITCH_CLIENT_SECRET
} = process.env;

// =============================================
// Express
// =============================================
const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '10mb' }));
app.use('/media/sounds', express.static(SOUNDS_DIR));
app.use('/media/videos', express.static(VIDEOS_DIR));

// ---- Media API ----
app.get('/api/sounds', (req, res) => {
  res.json(fs.readdirSync(SOUNDS_DIR)
    .filter(f => /\.(mp3|wav|ogg)$/i.test(f))
    .map(f => ({ name: f, path: `/media/sounds/${f}`, size: fs.statSync(path.join(SOUNDS_DIR, f)).size })));
});
app.get('/api/videos', (req, res) => {
  res.json(fs.readdirSync(VIDEOS_DIR)
    .filter(f => /\.(mp4|webm|avi|mov)$/i.test(f))
    .map(f => ({ name: f, path: `/media/videos/${f}`, size: fs.statSync(path.join(VIDEOS_DIR, f)).size })));
});
app.post('/api/upload', upload.array('files', 20), (req, res) => {
  if (!req.files || !req.files.length) return res.status(400).json({ error: 'Keine Dateien' });
  const out = req.files.map(f => ({
    name: f.filename, originalName: f.originalname,
    path: f.path.includes('/videos/') ? `/media/videos/${f.filename}` : `/media/sounds/${f.filename}`,
    type: f.path.includes('/videos/') ? 'video' : 'sound', size: f.size
  }));
  log('INFO', `${out.length} Datei(en) hochgeladen`);
  res.json({ uploaded: out });
});
app.delete('/api/media/:type/:filename', (req, res) => {
  const { type, filename } = req.params;
  const dir = type === 'video' ? VIDEOS_DIR : SOUNDS_DIR;
  const fp = path.join(dir, filename);
  if (!fp.startsWith(dir)) return res.status(403).json({ error: 'Nein.' });
  if (!fs.existsSync(fp)) return res.status(404).json({ error: 'Nicht gefunden' });
  fs.unlinkSync(fp);
  removeFromConfig(filename);
  log('INFO', `Geloescht: ${filename}`);
  res.json({ success: true });
});
function removeFromConfig(filename) {
  for (const section of ['chat_commands']) {
    for (const [k, v] of Object.entries(config[section] || {})) {
      if (v.file === filename) delete config[section][k];
    }
  }
  saveConfig();
}

// ---- Config API ----
app.get('/api/config', (req, res) => res.json(config));
app.put('/api/config', (req, res) => {
  config = req.body; saveConfig(); broadcast({ type: 'config_reloaded', config });
  log('INFO', 'Config aktualisiert'); res.json({ ok: true });
});
app.post('/api/config/commands', (req, res) => {
  const { command, file, type } = req.body;
  if (!command || !file || !type) return res.status(400).json({ error: 'Felder fehlen' });
  if (!config.chat_commands) config.chat_commands = {};
  config.chat_commands[command] = { file, type }; saveConfig();
  broadcast({ type: 'config_reloaded', config });
  log('INFO', `Command "${command}" -> "${file}"`);
  res.json({ ok: true });
});
app.delete('/api/config/commands/:command', (req, res) => {
  const cmd = decodeURIComponent(req.params.command);
  if (config.chat_commands && config.chat_commands[cmd]) {
    delete config.chat_commands[cmd]; saveConfig();
    broadcast({ type: 'config_reloaded', config });
  }
  res.json({ ok: true });
});
app.put('/api/config/settings', (req, res) => {
  config.settings = { ...config.settings, ...req.body }; saveConfig();
  broadcast({ type: 'config_reloaded', config });
  log('INFO', 'Settings gespeichert'); res.json({ ok: true });
});

// ---- Test Trigger (lokal, kein Twitch noetig) ----
app.post('/api/test-trigger', (req, res) => {
  const { file, type } = req.body;
  if (!file || !type) return res.status(400).json({ error: 'file und type noetig' });
  triggerOverlay(file, type, 'test', 'Admin');
  res.json({ ok: true });
});

// ---- Health ----
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok', uptime: process.uptime(), version: getVersion(),
    twitch: { chatConnected: twitchStatus.chatConnected, channel: TWITCH_CHANNEL || null },
    sounds: fs.readdirSync(SOUNDS_DIR).filter(f => /\.(mp3|wav|ogg)$/i.test(f)).length,
    videos: fs.readdirSync(VIDEOS_DIR).filter(f => /\.(mp4|webm|avi|mov)$/i.test(f)).length,
    overlayClients: overlayClients.size
  });
});

// ---- Pages ----
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/overlay', (req, res) => res.sendFile(path.join(__dirname, 'public', 'overlay.html')));
app.get('/', (req, res) => res.redirect('/admin'));

// =============================================
// WebSocket (Overlay)
// =============================================
const wss = new WebSocket.Server({ port: parseInt(WS_PORT) });
const overlayClients = new Set();

wss.on('connection', (ws) => {
  log('INFO', `Overlay verbunden (${overlayClients.size + 1})`);
  overlayClients.add(ws);
  ws.send(JSON.stringify({ type: 'init', config }));
  ws.on('close', () => overlayClients.delete(ws));
  ws.on('error', () => {});
});

function broadcast(data) {
  const msg = JSON.stringify(data);
  for (const c of overlayClients) if (c.readyState === WebSocket.OPEN) c.send(msg);
}

function triggerOverlay(file, type, source, user) {
  const s = config.settings || {};
  broadcast({
    type: 'play', file, mediaType: type, source, user: user || 'System',
    volume: type === 'video' ? (s.video_volume || 0.5) : (s.sound_volume || 0.8),
    allowOverlap: s.allow_overlap || false,
    maxQueue: s.max_queue_size || 10,
    videoDurationOverride: s.video_duration_override_ms || 5000
  });
  log('INFO', `Trigger: ${type} "${file}" von ${user} (${source})`);
}

// =============================================
// Twitch Chat (optional, nur Bot-Token)
// Kein HTTPS noetig!
// =============================================
let twitchStatus = { chatConnected: false };

async function initTwitchChat() {
  if (!TWITCH_CHANNEL || !TWITCH_BOT_TOKEN) {
    log('INFO', 'Twitch Chat nicht konfiguriert.');
    log('INFO', 'Trage TWITCH_CHANNEL und TWITCH_BOT_TOKEN in .env ein fuer Chat-Commands.');
    return;
  }

  try {
    const { StaticAuthProvider } = require('@twurple/auth');
    const { ChatClient } = require('@twurple/chat');

    const authProvider = new StaticAuthProvider(TWITCH_CLIENT_ID || 'default', TWITCH_BOT_TOKEN);
    const chatClient = new ChatClient({ authProvider, channels: [TWITCH_CHANNEL] });

    chatClient.onMessage((_ch, user, text) => {
      const prefix = (config.settings || {}).command_prefix || '!';
      if (text.startsWith(prefix)) {
        const cmd = text.toLowerCase().split(' ')[0];
        const mapping = config.chat_commands || {};
        if (mapping[cmd]) {
          triggerOverlay(mapping[cmd].file, mapping[cmd].type, 'chat', user);
        }
      }
    });

    await chatClient.connect();
    twitchStatus.chatConnected = true;
    log('INFO', `Twitch Chat verbunden: #${TWITCH_CHANNEL}`);
  } catch (e) {
    log('ERROR', `Twitch Chat fehlgeschlagen: ${e.message}`);
    log('INFO', 'Server laeuft trotzdem - nutze den Test-Button im Admin.');
  }
}

// =============================================
// Helpers
// =============================================
function getVersion() {
  try { return fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf-8').trim(); }
  catch { return '0.0.0'; }
}

process.on('SIGINT', () => { server.close(); wss.close(); process.exit(0); });

// =============================================
// START
// =============================================
async function main() {
  console.log('');
  console.log('========================================');
  console.log('  TwitchSoundBoard v' + getVersion());
  console.log('========================================');
  console.log('');

  server.listen(PORT, () => {
    console.log('  Admin:    http://localhost:' + PORT + '/admin');
    console.log('  Overlay:  http://localhost:' + PORT + '/overlay');
    console.log('========================================');
    log('INFO', 'Server laeuft - oeffne http://localhost:' + PORT + '/admin');
    console.log('');
  });

  // Twitch Chat (optional, non-blocking)
  initTwitchChat();
}

main().catch(e => { log('ERROR', e.message); process.exit(1); });
