// =============================================
// TwitchSoundBoard – Server v0.0.4
// Alles im Admin Panel – kein .env für Keys
// =============================================

require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');

// ---- Pfade ----
const SOUNDS_DIR = path.join(__dirname, 'sounds');
const VIDEOS_DIR = path.join(__dirname, 'videos');
const CONFIG_PATH = path.join(__dirname, 'config.json');
const CRED_PATH = path.join(__dirname, 'credentials.enc');

[SOUNDS_DIR, VIDEOS_DIR].forEach(d => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});

// ---- Verschlüsselung (AES-256-GCM, lokaler Key) ----
const ENC_KEY = crypto.scryptSync('TSB_local_' + require('os').hostname(), 'salt_tsb', 32);
const ENC_IV_LEN = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(ENC_IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-cbc', ENC_KEY, iv);
  let enc = cipher.update(text, 'utf8', 'hex');
  enc += cipher.final('hex');
  return iv.toString('hex') + ':' + enc;
}

function decrypt(raw) {
  const [ivHex, enc] = raw.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', ENC_KEY, iv);
  let dec = decipher.update(enc, 'hex', 'utf8');
  dec += decipher.final('utf8');
  return dec;
}

function loadCredentials() {
  try {
    const raw = fs.readFileSync(CRED_PATH, 'utf-8');
    const data = JSON.parse(raw);
    const out = {};
    for (const [k, v] of Object.entries(data)) {
      try { out[k] = v.startsWith('enc:') ? decrypt(v.slice(4)) : v; }
      catch { out[k] = v; }
    }
    return out;
  } catch { return {}; }
}

function saveCredentials(creds) {
  const data = {};
  for (const [k, v] of Object.entries(creds)) {
    data[k] = v ? 'enc:' + encrypt(v) : '';
  }
  fs.writeFileSync(CRED_PATH, JSON.stringify(data, null, 2));
}

// ---- Multer ----
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
      ? cb(null, true) : cb(new Error('Erlaubt: mp3, wav, ogg, mp4, webm'));
  }
});

// ---- Config ----
let config = {};
function loadConfig() {
  try { config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8')); }
  catch { config = { chat_commands: {}, settings: { allow_overlap: false, max_queue_size: 10, sound_volume: 0.8, video_volume: 0.5, command_prefix: '!', video_duration_override_ms: 5000 } }; saveConfig(); }
}
function saveConfig() { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); }
loadConfig();

function log(lvl, msg) { console.log(`[${new Date().toISOString()}] [${lvl}] ${msg}`); }

const PORT = parseInt(process.env.PORT) || 3000;
const WS_PORT = parseInt(process.env.WS_PORT) || 3001;

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
  res.json(fs.readdirSync(SOUNDS_DIR).filter(f => /\.(mp3|wav|ogg)$/i.test(f))
    .map(f => ({ name: f, path: `/media/sounds/${f}`, size: fs.statSync(path.join(SOUNDS_DIR, f)).size })));
});
app.get('/api/videos', (req, res) => {
  res.json(fs.readdirSync(VIDEOS_DIR).filter(f => /\.(mp4|webm|avi|mov)$/i.test(f))
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
  for (const [k, v] of Object.entries(config.chat_commands || {})) { if (v.file === filename) delete config.chat_commands[k]; }
  saveConfig();
  log('INFO', `Geloescht: ${filename}`);
  res.json({ success: true });
});

// ---- Config API ----
app.get('/api/config', (req, res) => res.json(config));
app.put('/api/config', (req, res) => { config = req.body; saveConfig(); broadcast({ type: 'config_reloaded', config }); res.json({ ok: true }); });
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
  if (config.chat_commands && config.chat_commands[cmd]) { delete config.chat_commands[cmd]; saveConfig(); broadcast({ type: 'config_reloaded', config }); }
  res.json({ ok: true });
});
app.put('/api/config/settings', (req, res) => {
  config.settings = { ...config.settings, ...req.body }; saveConfig();
  broadcast({ type: 'config_reloaded', config });
  res.json({ ok: true });
});

// ---- Test Trigger ----
app.post('/api/test-trigger', (req, res) => {
  const { file, type } = req.body;
  if (!file || !type) return res.status(400).json({ error: 'file und type noetig' });
  triggerOverlay(file, type, 'test', 'Admin');
  res.json({ ok: true });
});

// ---- Credentials API (verschlüsselt) ----
app.get('/api/credentials', (req, res) => {
  const creds = loadCredentials();
  // Maskiere Werte für die Anzeige (nur letzte 4 Zeichen)
  const masked = {};
  for (const [k, v] of Object.entries(creds)) {
    if (v && k.toLowerCase().includes('token') || k.toLowerCase().includes('secret')) {
      masked[k] = v.length > 4 ? '****' + v.slice(-4) : '****';
    } else if (v) {
      masked[k] = v;
    } else {
      masked[k] = '';
    }
  }
  res.json({ masked, hasValues: Object.values(creds).filter(v => v).length > 0 });
});

app.put('/api/credentials', (req, res) => {
  const existing = loadCredentials();
  // Nur Werte übernehmen die nicht leer oder '****' sind
  const updated = { ...existing };
  for (const [k, v] of Object.entries(req.body)) {
    if (v && !v.startsWith('****')) {
      updated[k] = v;
    }
  }
  saveCredentials(updated);
  log('INFO', 'Credentials gespeichert (verschluesselt)');
  res.json({ ok: true, saved: Object.keys(req.body).filter(k => req.body[k] && !req.body[k].startsWith('****')) });
});

// ---- Twitch Start / Stop ----
let chatClient = null;
let twitchRunning = false;

app.get('/api/twitch/status', (req, res) => {
  res.json({
    running: twitchRunning,
    channel: (loadCredentials().twitch_channel) || null
  });
});

app.post('/api/twitch/start', async (req, res) => {
  if (twitchRunning) return res.status(400).json({ error: 'Laeuft bereits' });

  const creds = loadCredentials();
  if (!creds.twitch_channel) return res.status(400).json({ error: 'Kanalname fehlt' });
  if (!creds.twitch_bot_token) return res.status(400).json({ error: 'Bot-Token fehlt' });

  try {
    const { StaticAuthProvider } = require('@twurple/auth');
    const { ChatClient } = require('@twurple/chat');

    const authProvider = new StaticAuthProvider(creds.twitch_client_id || 'default', creds.twitch_bot_token);
    chatClient = new ChatClient({ authProvider, channels: [creds.twitch_channel] });

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
    twitchRunning = true;
    log('INFO', `Twitch Chat gestartet: #${creds.twitch_channel}`);
    res.json({ ok: true, channel: creds.twitch_channel });
  } catch (e) {
    log('ERROR', `Twitch Start fehlgeschlagen: ${e.message}`);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/twitch/stop', async (req, res) => {
  if (!twitchRunning) return res.status(400).json({ error: 'Laeft nicht' });
  try {
    if (chatClient) { await chatClient.quit(); chatClient = null; }
    twitchRunning = false;
    log('INFO', 'Twitch Chat gestoppt');
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ---- Health ----
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok', uptime: process.uptime(), version: getVersion(),
    twitch: { running: twitchRunning, channel: (loadCredentials().twitch_channel) || null },
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
// WebSocket
// =============================================
const wss = new WebSocket.Server({ port: WS_PORT });
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
    allowOverlap: s.allow_overlap || false, maxQueue: s.max_queue_size || 10,
    videoDurationOverride: s.video_duration_override_ms || 5000
  });
  log('INFO', `Trigger: ${type} "${file}" von ${user} (${source})`);
}

function getVersion() {
  try { return fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf-8').trim(); }
  catch { return '0.0.0'; }
}

process.on('SIGINT', () => { server.close(); wss.close(); process.exit(0); });

// =============================================
// START – Server startet sofort, Twitch per Button
// =============================================
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
