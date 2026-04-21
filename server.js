// =============================================
// TwitchSoundBoard – Server v0.0.8
// Lokal, kein HTTPS, kein Crash
// =============================================

const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// ---- .env (falls vorhanden, kein crash wenn nicht) ----
try { require('dotenv').config(); } catch (e) {}

// ---- Pfade ----
const SOUNDS_DIR = path.join(__dirname, 'sounds');
const VIDEOS_DIR = path.join(__dirname, 'videos');
const CONFIG_PATH = path.join(__dirname, 'config.json');
const CRED_PATH = path.join(__dirname, 'credentials.enc');

[SOUNDS_DIR, VIDEOS_DIR].forEach(d => {
  try { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); } catch (e) {}
});

// ---- Logging ----
function log(lvl, msg) {
  console.log('[' + new Date().toISOString() + '] [' + lvl + '] ' + msg);
}

// ---- Config ----
let config = {};
function loadConfig() {
  try {
    config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
  } catch (e) {
    config = {
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
    saveConfig();
  }
}
function saveConfig() {
  try { fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2)); } catch (e) { log('ERROR', 'Config speichern: ' + e.message); }
}
loadConfig();

// ---- Verschlüsselung (AES-256-CBC) ----
// Key basiert auf fester Zeichenkette – verschlüsselt die .enc Datei auf dem Rechner
let ENC_KEY = null;
try {
  ENC_KEY = crypto.scryptSync('TwitchSoundBoard_v1', 'local_salt', 32);
} catch (e) {
  log('WARN', 'scrypt fehlgeschlagen, nutze Fallback-Key');
  ENC_KEY = crypto.createHash('sha256').update('TwitchSoundBoard_fallback_key').digest();
}

function encrypt(text) {
  try {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', ENC_KEY, iv);
    let enc = cipher.update(text, 'utf8', 'hex');
    enc += cipher.final('hex');
    return iv.toString('hex') + ':' + enc;
  } catch (e) { return text; }
}

function decrypt(raw) {
  try {
    const parts = raw.split(':');
    if (parts.length < 2) return raw;
    const iv = Buffer.from(parts[0], 'hex');
    const enc = parts.slice(1).join(':');
    const decipher = crypto.createDecipheriv('aes-256-cbc', ENC_KEY, iv);
    let dec = decipher.update(enc, 'hex', 'utf8');
    dec += decipher.final('utf8');
    return dec;
  } catch (e) { return raw; }
}

function loadCredentials() {
  try {
    const raw = fs.readFileSync(CRED_PATH, 'utf-8');
    const data = JSON.parse(raw);
    const out = {};
    for (const k in data) {
      try {
        out[k] = (data[k] && typeof data[k] === 'string' && data[k].startsWith('enc:'))
          ? decrypt(data[k].slice(4)) : data[k];
      } catch (e) { out[k] = data[k]; }
    }
    return out;
  } catch (e) { return {}; }
}

function saveCredentials(creds) {
  try {
    const data = {};
    for (const k in creds) {
      data[k] = creds[k] ? 'enc:' + encrypt(String(creds[k])) : '';
    }
    fs.writeFileSync(CRED_PATH, JSON.stringify(data, null, 2));
  } catch (e) { log('ERROR', 'Credentials speichern: ' + e.message); }
}

// ---- Multer ----
let upload = null;
try {
  const multer = require('multer');
  const storage = multer.diskStorage({
    destination: function(req, file, cb) {
      var isVid = /\.(mp4|webm|avi|mov)$/i.test(file.originalname);
      cb(null, isVid ? VIDEOS_DIR : SOUNDS_DIR);
    },
    filename: function(req, file, cb) {
      var safe = file.originalname.replace(/[^a-zA-Z0-9._\- ]/g, '_');
      cb(null, Date.now() + '_' + safe);
    }
  });
  upload = multer({
    storage: storage,
    limits: { fileSize: 25 * 1024 * 1024 },
    fileFilter: function(req, file, cb) {
      /\.(mp3|wav|ogg|mp4|webm|avi|mov)$/i.test(file.originalname)
        ? cb(null, true) : cb(new Error('Erlaubt: mp3, wav, ogg, mp4, webm'));
    }
  });
} catch (e) {
  log('ERROR', 'Multer konnte nicht geladen werden: ' + e.message);
}

// ---- Port ----
var PORT = 3000;
var WS_PORT = 3001;
try {
  PORT = parseInt(process.env.PORT) || 3000;
  WS_PORT = parseInt(process.env.WS_PORT) || 3001;
} catch (e) {}

// =============================================
// Express Server
// =============================================
const app = express();
const server = http.createServer(app);

app.use(express.json({ limit: '10mb' }));
app.use('/media/sounds', express.static(SOUNDS_DIR));
app.use('/media/videos', express.static(VIDEOS_DIR));

// =============================================
// API – Media
// =============================================
app.get('/api/sounds', function(req, res) {
  try {
    var fs_cfg = config.file_settings || {};
    var files = fs.readdirSync(SOUNDS_DIR)
      .filter(function(f) { return /\.(mp3|wav|ogg)$/i.test(f); })
      .map(function(f) {
        var st = fs_cfg[f] || {};
        return { name: f, path: '/media/sounds/' + f, size: fs.statSync(path.join(SOUNDS_DIR, f)).size, duration_ms: st.duration_ms || null, display_name: st.display_name || null };
      });
    res.json(files);
  } catch (e) { res.json([]); }
});

app.get('/api/videos', function(req, res) {
  try {
    var fs_cfg = config.file_settings || {};
    var files = fs.readdirSync(VIDEOS_DIR)
      .filter(function(f) { return /\.(mp4|webm|avi|mov)$/i.test(f); })
      .map(function(f) {
        var st = fs_cfg[f] || {};
        return { name: f, path: '/media/videos/' + f, size: fs.statSync(path.join(VIDEOS_DIR, f)).size, duration_ms: st.duration_ms || null, display_name: st.display_name || null };
      });
    res.json(files);
  } catch (e) { res.json([]); }
});

app.post('/api/upload', function(req, res) {
  if (!upload) return res.status(500).json({ error: 'Upload nicht verfuegbar' });
  upload.array('files', 20)(req, res, function(err) {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'Keine Dateien' });
    var out = req.files.map(function(f) {
      var isVid = f.path.indexOf('videos') !== -1;
      return {
        name: f.filename, originalName: f.originalname,
        path: isVid ? '/media/videos/' + f.filename : '/media/sounds/' + f.filename,
        type: isVid ? 'video' : 'sound', size: f.size
      };
    });
    log('INFO', out.length + ' Datei(en) hochgeladen');
    res.json({ uploaded: out });
  });
});

app.delete('/api/media/:type/:filename', function(req, res) {
  var type = req.params.type;
  var filename = decodeURIComponent(req.params.filename);
  var dir = type === 'video' ? VIDEOS_DIR : SOUNDS_DIR;
  var fp = path.join(dir, filename);
  if (fp.indexOf(dir) !== 0) return res.status(403).json({ error: 'Blocked' });
  try {
    fs.unlinkSync(fp);
    for (var k in (config.chat_commands || {})) {
      if (config.chat_commands[k].file === filename) delete config.chat_commands[k];
    }
    if (config.file_settings) delete config.file_settings[filename];
    saveConfig();
    log('INFO', 'Geloescht: ' + filename);
    res.json({ success: true });
  } catch (e) { res.status(404).json({ error: 'Nicht gefunden' }); }
});

// =============================================
// API – File Settings (duration, display_name)
// =============================================
app.put('/api/media/settings', function(req, res) {
  var body = req.body;
  if (!body.filename) return res.status(400).json({ error: 'filename noetig' });
  if (!config.file_settings) config.file_settings = {};
  var f = config.file_settings[body.filename] || {};
  if (body.duration_ms !== undefined && body.duration_ms !== null && body.duration_ms !== '') {
    f.duration_ms = parseInt(body.duration_ms);
  } else if (body.duration_ms === null || body.duration_ms === '') {
    delete f.duration_ms;
  }
  if (body.display_name !== undefined && body.display_name !== null && body.display_name !== '') {
    f.display_name = String(body.display_name);
  } else if (body.display_name === null || body.display_name === '') {
    delete f.display_name;
  }
  if (Object.keys(f).length === 0) {
    delete config.file_settings[body.filename];
  } else {
    config.file_settings[body.filename] = f;
  }
  saveConfig();
  log('INFO', 'Datei-Settings: ' + body.filename + ' -> ' + JSON.stringify(f));
  res.json({ ok: true, settings: f });
});

// =============================================
// API – Config
// =============================================
app.get('/api/config', function(req, res) { res.json(config); });

app.put('/api/config', function(req, res) {
  config = req.body; saveConfig(); broadcast({ type: 'config_reloaded', config: config }); res.json({ ok: true });
});

app.post('/api/config/commands', function(req, res) {
  var body = req.body;
  if (!body.command || !body.file || !body.type) return res.status(400).json({ error: 'Felder fehlen' });
  if (!config.chat_commands) config.chat_commands = {};
  config.chat_commands[body.command] = { file: body.file, type: body.type }; saveConfig();
  broadcast({ type: 'config_reloaded', config: config });
  log('INFO', 'Command "' + body.command + '" -> "' + body.file + '"');
  res.json({ ok: true });
});

app.delete('/api/config/commands/:command', function(req, res) {
  var cmd = decodeURIComponent(req.params.command);
  if (config.chat_commands && config.chat_commands[cmd]) {
    delete config.chat_commands[cmd]; saveConfig();
    broadcast({ type: 'config_reloaded', config: config });
  }
  res.json({ ok: true });
});

app.put('/api/config/settings', function(req, res) {
  config.settings = Object.assign({}, config.settings, req.body); saveConfig();
  broadcast({ type: 'config_reloaded', config: config });
  res.json({ ok: true });
});

// =============================================
// API – Test Trigger
// =============================================
app.post('/api/test-trigger', function(req, res) {
  var body = req.body;
  if (!body.file || !body.type) return res.status(400).json({ error: 'file und type noetig' });
  triggerOverlay(body.file, body.type, 'test', 'Admin');
  res.json({ ok: true });
});

// =============================================
// API – Credentials
// =============================================
app.get('/api/credentials', function(req, res) {
  var creds = loadCredentials();
  var masked = {};
  for (var k in creds) {
    var v = creds[k];
    if (!v) { masked[k] = ''; }
    else if (k.indexOf('token') !== -1 || k.indexOf('secret') !== -1) {
      masked[k] = v.length > 4 ? '****' + v.slice(-4) : '****';
    } else {
      masked[k] = v;
    }
  }
  var hasAny = false;
  for (var kk in creds) { if (creds[kk]) { hasAny = true; break; } }
  res.json({ masked: masked, hasValues: hasAny });
});

app.put('/api/credentials', function(req, res) {
  var existing = loadCredentials();
  var body = req.body;
  for (var k in body) {
    if (body[k] && typeof body[k] === 'string' && body[k].indexOf('****') !== 0) {
      existing[k] = body[k];
    }
  }
  saveCredentials(existing);
  log('INFO', 'Credentials gespeichert');
  res.json({ ok: true });
});

// =============================================
// API – Twitch Start / Stop (tmi.js)
// =============================================
var chatClient = null;
var twitchRunning = false;

app.get('/api/twitch/status', function(req, res) {
  var creds = loadCredentials();
  res.json({ running: twitchRunning, channel: creds.twitch_channel || null });
});

app.post('/api/twitch/start', function(req, res) {
  if (twitchRunning) return res.status(400).json({ error: 'Laeuft bereits' });

  var creds = loadCredentials();
  if (!creds.twitch_channel) return res.status(400).json({ error: 'Kanalname fehlt' });
  if (!creds.twitch_bot_token) return res.status(400).json({ error: 'Bot-Token fehlt' });

  try {
    var tmi = require('tmi.js');

    // Token bereinigen: "oauth:" Prefix entfernen falls doppelt
    var token = creds.twitch_bot_token;
    if (token.indexOf('oauth:oauth:') === 0) token = token.slice(6);
    if (token.indexOf('oauth:') !== 0) token = 'oauth:' + token;

    var opts = {
      identity: {
        username: creds.twitch_bot_username || creds.twitch_channel,
        password: token
      },
      channels: [creds.twitch_channel]
    };

    chatClient = new tmi.Client(opts);

    chatClient.on('connected', function(addr, port) {
      twitchRunning = true;
      log('INFO', 'Twitch Chat verbunden: #' + creds.twitch_channel);
      res.json({ ok: true, channel: creds.twitch_channel });
    });

    chatClient.on('disconnected', function(reason) {
      twitchRunning = false;
      log('WARN', 'Twitch Chat getrennt: ' + reason);
    });

    chatClient.on('chat', function(channel, userstate, message, self) {
      if (self) return;
      var prefix = (config.settings || {}).command_prefix || '!';
      if (message.indexOf(prefix) === 0) {
        var cmd = message.toLowerCase().split(' ')[0];
        var mapping = config.chat_commands || {};
        if (mapping[cmd]) {
          triggerOverlay(mapping[cmd].file, mapping[cmd].type, 'chat', userstate['display-name'] || 'Viewer');
        }
      }
    });

    chatClient.on('error', function(err) {
      log('ERROR', 'Twitch Chat Fehler: ' + (err.message || JSON.stringify(err)));
    });

    chatClient.connect().catch(function(e) {
      log('ERROR', 'Twitch Chat Connect: ' + e.message);
      if (!twitchRunning) {
        res.status(500).json({ error: e.message || 'Verbindung fehlgeschlagen' });
      }
    });

  } catch (e) {
    log('ERROR', 'Twitch Start: ' + e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/twitch/stop', function(req, res) {
  if (!twitchRunning) return res.status(400).json({ error: 'Laeuft nicht' });
  try {
    if (chatClient) {
      chatClient.disconnect().then(function() {
        chatClient = null;
        twitchRunning = false;
        log('INFO', 'Twitch Chat gestoppt');
        res.json({ ok: true });
      }).catch(function(e) {
        chatClient = null;
        twitchRunning = false;
        res.json({ ok: true });
      });
    } else {
      twitchRunning = false;
      res.json({ ok: true });
    }
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// =============================================
// API – Health
// =============================================
app.get('/api/health', function(req, res) {
  var creds = loadCredentials();
  var sndCount = 0, vidCount = 0;
  try {
    sndCount = fs.readdirSync(SOUNDS_DIR).filter(function(f) { return /\.(mp3|wav|ogg)$/i.test(f); }).length;
    vidCount = fs.readdirSync(VIDEOS_DIR).filter(function(f) { return /\.(mp4|webm|avi|mov)$/i.test(f); }).length;
  } catch (e) {}
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    version: getVersion(),
    twitch: { running: twitchRunning, channel: creds.twitch_channel || null },
    sounds: sndCount,
    videos: vidCount,
    overlayClients: overlayClients.size
  });
});

// =============================================
// Pages
// =============================================
app.get('/admin', function(req, res) { res.sendFile(path.join(__dirname, 'public', 'admin.html')); });
app.get('/overlay', function(req, res) { res.sendFile(path.join(__dirname, 'public', 'overlay.html')); });
app.get('/', function(req, res) { res.redirect('/admin'); });

// =============================================
// WebSocket (Overlay)
// =============================================
var wss = null;
var overlayClients = new Set();

try {
  wss = new WebSocket.Server({ port: WS_PORT });
  wss.on('error', function(err) {
    if (err.code === 'EADDRINUSE') {
      log('WARN', 'WebSocket-Port ' + WS_PORT + ' belegt, versuche Port ' + (WS_PORT + 1));
      try {
        wss = new WebSocket.Server({ port: WS_PORT + 1 });
        log('INFO', 'WebSocket laeuft auf Port ' + (WS_PORT + 1));
      } catch (e2) {
        log('ERROR', 'WebSocket konnte nicht gestartet werden');
      }
    } else {
      log('ERROR', 'WebSocket: ' + err.message);
    }
  });
} catch (e) {
  log('ERROR', 'WebSocket Init: ' + e.message);
}

if (wss) wss.on('connection', function(ws) {
  log('INFO', 'Overlay verbunden (' + (overlayClients.size + 1) + ')');
  overlayClients.add(ws);
  try { ws.send(JSON.stringify({ type: 'init', config: config })); } catch (e) {}
  ws.on('close', function() { overlayClients.delete(ws); });
  ws.on('error', function() {});
});

function broadcast(data) {
  var msg = JSON.stringify(data);
  overlayClients.forEach(function(c) {
    if (c.readyState === WebSocket.OPEN) {
      try { c.send(msg); } catch (e) {}
    }
  });
}

function triggerOverlay(file, type, source, user) {
  var s = config.settings || {};
  var fs_cfg = (config.file_settings || {})[file] || {};
  var dur = fs_cfg.duration_ms || (type === 'video' ? (s.video_duration_override_ms || 5000) : null);
  broadcast({
    type: 'play', file: file, mediaType: type, source: source, user: user || 'System',
    volume: type === 'video' ? (s.video_volume || 0.5) : (s.sound_volume || 0.8),
    allowOverlap: s.allow_overlap || false, maxQueue: s.max_queue_size || 10,
    durationOverride: dur
  });
  log('INFO', 'Trigger: ' + type + ' "' + file + '" von ' + user + ' (' + source + ')');
}

// =============================================
// Helpers
// =============================================
function getVersion() {
  try { return fs.readFileSync(path.join(__dirname, 'VERSION'), 'utf-8').trim(); }
  catch (e) { return '0.0.0'; }
}

// Graceful Shutdown
process.on('SIGINT', function() {
  log('INFO', 'Shutdown...');
  try { if (chatClient) chatClient.disconnect(); } catch (e) {}
  try { server.close(); } catch (e) {}
  try { if (wss) wss.close(); } catch (e) {}
  process.exit(0);
});

// =============================================
// START
// =============================================
console.log('');
console.log('========================================');
console.log('  TwitchSoundBoard v' + getVersion());
console.log('========================================');

server.listen(PORT, function() {
  console.log('  Admin:    http://localhost:' + PORT + '/admin');
  console.log('  Overlay:  http://localhost:' + PORT + '/overlay');
  console.log('========================================');
  log('INFO', 'Server laeuft - oeffne http://localhost:' + PORT + '/admin');
  console.log('');
});
