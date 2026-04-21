// =============================================
// TwitchSoundBoard – Server v0.3.0
// Lokal, kein HTTPS, kein Crash
// =============================================

const express = require('express');
const http = require('http');
const https = require('https');
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
    let dec = decipher.update(enc, 'hex', 'utf-8');
    dec += decipher.final('utf-8');
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
    limits: { fileSize: 50 * 1024 * 1024 },
    fileFilter: function(req, file, cb) {
      /\.(mp3|wav|ogg|m4a|mp4|webm|avi|mov)$/i.test(file.originalname)
        ? cb(null, true) : cb(new Error('Erlaubt: mp3, wav, ogg, m4a, mp4, webm'));
    }
  });
} catch (e) {
  log('ERROR', 'Multer konnte nicht geladen werden: ' + e.message);
}

// ---- YouTube/Spotify Import – Download-Engines ----
var ytdl = null;
try {
  ytdl = require('@distube/ytdl-core');
  log('INFO', 'ytdl-core geladen');
} catch (e) {
  log('WARN', '@distube/ytdl-core nicht installiert');
}

var playdl = null;
try {
  playdl = require('play-dl');
  log('INFO', 'play-dl geladen');
} catch (e) {
  log('WARN', 'play-dl nicht installiert – Alternative Download-Engine nicht verfuegbar');
}

function isYtUrl(url) {
  return /(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)[a-zA-Z0-9_-]{6,}/i.test(url);
}

function isSpotifyUrl(url) {
  return /spotify\.com\/track\//i.test(url);
}

function extractYtVideoId(url) {
  var m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{6,})/i);
  return m ? m[1] : null;
}

function saveStreamToFile(stream, filePath) {
  return new Promise(function(resolve, reject) {
    var file = fs.createWriteStream(filePath);
    stream.pipe(file);
    file.on('finish', function() {
      file.close();
      resolve();
    });
    file.on('error', function(err) {
      try { fs.unlinkSync(filePath); } catch(e) {}
      reject(err);
    });
    stream.on('error', function(err) {
      try { fs.unlinkSync(filePath); } catch(e) {}
      reject(err);
    });
  });
}

// =============================================
// TIER 1: ytdl-core (direkt, schnellste Qualitaet)
// =============================================
async function downloadViaYtdl(url, filePath) {
  if (!ytdl) throw new Error('ytdl-core nicht installiert');

  var info = await ytdl.getInfo(url);
  var title = info.videoDetails.title;
  var durationSec = parseInt(info.videoDetails.lengthSeconds) || 0;

  // Strategie 1: ytdl interne Format-Wahl (am zuverlaessigsten)
  // ytdl waehlt automatisch das beste kombinierte Format (video+audio)
  try {
    var format = ytdl.chooseFormat(info.formats, { quality: 'highest', filter: 'videoandaudio' });
    if (format) {
      log('INFO', 'ytdl Tier1a: kombiniertes Format ' + (format.qualityLabel || format.quality));
      var stream = ytdl(url, { format: format });
      await saveStreamToFile(stream, filePath);
      return { filePath: filePath, title: title, durationSeconds: durationSec, quality: format.qualityLabel || format.quality };
    }
  } catch (e) {
    log('WARN', 'ytdl chooseFormat fehlgeschlagen: ' + e.message);
  }

  // Strategie 2: itag 18 (360p combined MP4 – fast IMMER verfuegbar)
  try {
    var itag18 = info.formats.find(function(f) { return f.itag === 18; });
    if (itag18) {
      log('INFO', 'ytdl Tier1b: itag 18 Fallback (360p combined)');
      var stream2 = ytdl(url, { format: itag18 });
      await saveStreamToFile(stream2, filePath);
      return { filePath: filePath, title: title, durationSeconds: durationSec, quality: '360p' };
    }
  } catch (e) {
    log('WARN', 'ytdl itag 18 fehlgeschlagen: ' + e.message);
  }

  // Strategie 3: Manuell nach combined MP4 suchen (beliebige Qualitaet)
  var combined = info.formats.filter(function(f) {
    return f.hasVideo && f.hasAudio && f.container === 'mp4' && !f.isLive;
  });
  if (combined.length > 0) {
    // Hoechste Qualitaet zuerst
    combined.sort(function(a, b) { return (b.bitrate || 0) - (a.bitrate || 0); });
    var pick = combined[0];
    log('INFO', 'ytdl Tier1c: manuell ' + (pick.qualityLabel || pick.quality));
    var stream3 = ytdl(url, { format: pick });
    await saveStreamToFile(stream3, filePath);
    return { filePath: filePath, title: title, durationSeconds: durationSec, quality: pick.qualityLabel || pick.quality };
  }

  // Strategie 4: irgendein combined Format (auch webm)
  var anyCombined = info.formats.filter(function(f) {
    return f.hasVideo && f.hasAudio && !f.isLive;
  });
  if (anyCombined.length > 0) {
    anyCombined.sort(function(a, b) { return (b.bitrate || 0) - (a.bitrate || 0); });
    var pick2 = anyCombined[0];
    var ext = pick2.container || 'mp4';
    var finalPath = filePath.replace(/\.[^.]+$/, '.' + ext);
    log('INFO', 'ytdl Tier1d: any combined ' + ext + ' ' + (pick2.qualityLabel || pick2.quality));
    var stream4 = ytdl(url, { format: pick2 });
    await saveStreamToFile(stream4, finalPath);
    return { filePath: finalPath, title: title, durationSeconds: durationSec, quality: pick2.qualityLabel || pick2.quality };
  }

  throw new Error('ytdl: kein kombiniertes Format gefunden (nur adaptive verfuegbar)');
}

// ytdl audio-only download
async function downloadAudioViaYtdl(url, filePath) {
  if (!ytdl) throw new Error('ytdl-core nicht installiert');

  var info = await ytdl.getInfo(url);

  // Audio-only Formate, hoechste Bitrate zuerst
  var audioFormats = info.formats
    .filter(function(f) { return f.hasAudio && !f.hasVideo; })
    .sort(function(a, b) { return (b.bitrate || 0) - (a.bitrate || 0); });

  if (audioFormats.length === 0) {
    // Fallback: kombiniertes Format und nur Audio extrahieren ist nicht moeglich ohne ffmpeg
    // Also irgendein Format mit Audio nehmen
    audioFormats = info.formats
      .filter(function(f) { return f.hasAudio; })
      .sort(function(a, b) { return (b.bitrate || 0) - (a.bitrate || 0); });
  }

  if (audioFormats.length === 0) throw new Error('ytdl: kein Audio-Format gefunden');

  var format = audioFormats[0];
  var ext = format.container || 'm4a';
  var finalPath = filePath.replace(/\.[^.]+$/, '.' + ext);

  log('INFO', 'ytdl Audio: ' + ext + ' ' + Math.round((format.bitrate || 0) / 1000) + 'kbps');
  var stream = ytdl(url, { format: format });
  await saveStreamToFile(stream, finalPath);
  return { filePath: finalPath, durationSeconds: parseInt(info.videoDetails.lengthSeconds) || 0 };
}

// =============================================
// TIER 2: play-dl (alternative Download-Engine)
// =============================================
async function downloadViaPlayDl(url, filePath, type) {
  if (!playdl) throw new Error('play-dl nicht installiert');

  if (type === 'video') {
    var streamInfo = await playdl.stream(url, { quality: 720 });
    var finalPath = filePath;

    // Bestimme Extension
    if (streamInfo.type === 'hls' || streamInfo.type === 'dash') {
      // play-dl liefert bei HLS/DASH einen Stream – wir muessen den type checken
      log('INFO', 'play-dl: Stream-Typ ' + streamInfo.type + ' – versuche direkten Download');
    }

    var stream = streamInfo.stream;
    if (!stream || !stream.pipe) throw new Error('play-dl: kein Stream erhalten');

    await saveStreamToFile(stream, finalPath);
    var info = await playdl.video_info(url);
    return {
      filePath: finalPath,
      title: (info && info.video_details && info.video_details.title) || 'Unknown',
      durationSeconds: (info && info.video_details && parseInt(info.video_details.duration_in_seconds)) || 0,
      quality: 'play-dl'
    };
  } else {
    // Audio-only
    var ytInfo = await playdl.video_info(url);
    if (!ytInfo) throw new Error('play-dl: Video-Info nicht gefunden');

    var audioFormats = ytInfo.format
      ? ytInfo.format.filter(function(f) { return f.mimeType && f.mimeType.startsWith('audio/'); })
      : [];
    audioFormats.sort(function(a, b) { return (b.bitrate || 0) - (a.bitrate || 0); });

    if (audioFormats.length === 0) throw new Error('play-dl: kein Audio-Format gefunden');

    var targetUrl = audioFormats[0].url;
    var ext = (audioFormats[0].mimeType || '').split(';')[0].split('/')[1] || 'm4a';
    var finalPath = filePath.replace(/\.[^.]+$/, '.' + ext);

    log('INFO', 'play-dl Audio: ' + ext + ' ' + Math.round((audioFormats[0].bitrate || 0) / 1000) + 'kbps');

    var file = fs.createWriteStream(finalPath);
    await new Promise(function(resolve, reject) {
      https.get(targetUrl, { headers: { 'User-Agent': 'TwitchSoundBoard/0.3.0' } }, function(resp) {
        if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
          // Redirect folgen
          https.get(resp.headers.location, { headers: { 'User-Agent': 'TwitchSoundBoard/0.3.0' } }, function(redirResp) {
            redirResp.pipe(file);
            file.on('finish', function() { file.close(); resolve(); });
          }).on('error', reject);
        } else if (resp.statusCode === 200) {
          resp.pipe(file);
          file.on('finish', function() { file.close(); resolve(); });
        } else {
          reject(new Error('play-dl Audio DL Status ' + resp.statusCode));
        }
      }).on('error', reject).setTimeout(120000, function() { reject(new Error('play-dl Audio Timeout')); });
    });

    return {
      filePath: finalPath,
      durationSeconds: parseInt(ytInfo.video_details.duration_in_seconds) || 0
    };
  }
}

// =============================================
// TIER 3: Cobalt API (Web-Service, zuverlaessig)
// =============================================
function downloadViaCobalt(url, filePath) {
  return new Promise(function(resolve, reject) {
    var postData = JSON.stringify({
      url: url,
      videoQuality: '720',
      filenameStyle: 'pretty'
    });

    var cobaltInstances = [
      'https://api.cobalt.tools',
      'https://cobalt-api.kwiatekmiki.com',
      'https://cobalt.api.timelessnesses.me'
    ];

    function tryCobalt(idx) {
      if (idx >= cobaltInstances.length) {
        return reject(new Error('Cobalt API fehlgeschlagen – alle Instanzen unerreichbar'));
      }

      var apiUrl = cobaltInstances[idx];
      var parsedUrl = new URL(apiUrl);

      log('INFO', 'Cobalt [' + (idx + 1) + '/' + cobaltInstances.length + ']: ' + apiUrl);

      var reqOptions = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || 443,
        path: parsedUrl.pathname || '/',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'User-Agent': 'TwitchSoundBoard/0.3.0'
        }
      };

      var req = https.request(reqOptions, function(resp) {
        var data = '';
        resp.on('data', function(chunk) { data += chunk; });
        resp.on('end', function() {
          try {
            var json = JSON.parse(data);

            if (resp.statusCode !== 200 || json.status === 'error' || json.status === 'redirect') {
              // Manche Cobalt Instanzen liefern Redirect-URL direkt im JSON
              if (json.url) {
                log('INFO', 'Cobalt: Download-URL erhalten, lade herunter...');
                downloadFromUrl(json.url, filePath)
                  .then(function(result) {
                    // Titel aus URL oder Dateiname
                    resolve({
                      filePath: result,
                      title: json.filename || 'Cobalt Download',
                      durationSeconds: 0,
                      quality: 'cobalt'
                    });
                  })
                  .catch(function() { tryCobalt(idx + 1); });
                return;
              }

              log('WARN', 'Cobalt ' + apiUrl + ': Status ' + resp.statusCode + (json.error ? ' – ' + json.error.code : ''));
              return tryCobalt(idx + 1);
            }

            // Erfolg – download URL
            if (json.url) {
              log('INFO', 'Cobalt: Download start...');
              downloadFromUrl(json.url, filePath)
                .then(function(result) {
                  resolve({
                    filePath: result,
                    title: json.filename || 'Cobalt Download',
                    durationSeconds: 0,
                    quality: 'cobalt'
                  });
                })
                .catch(function(dlErr) {
                  log('WARN', 'Cobalt DL fail: ' + dlErr.message);
                  tryCobalt(idx + 1);
                });
            } else {
              tryCobalt(idx + 1);
            }
          } catch (e) {
            log('WARN', 'Cobalt JSON parse error: ' + e.message);
            tryCobalt(idx + 1);
          }
        });
      });

      req.on('error', function(err) {
        log('WARN', 'Cobalt ' + apiUrl + ': ' + err.message);
        tryCobalt(idx + 1);
      });

      req.setTimeout(20000, function() {
        log('WARN', 'Cobalt ' + apiUrl + ': Timeout');
        req.destroy();
        tryCobalt(idx + 1);
      });

      req.write(postData);
      req.end();
    }

    tryCobalt(0);
  });
}

function downloadFromUrl(url, filePath) {
  return new Promise(function(resolve, reject) {
    var proto = url.indexOf('https://') === 0 ? https : require('http');

    var file = fs.createWriteStream(filePath);
    proto.get(url, { headers: { 'User-Agent': 'TwitchSoundBoard/0.3.0' } }, function(resp) {
      // Redirects folgen
      if (resp.statusCode >= 300 && resp.statusCode < 400 && resp.headers.location) {
        var redirUrl = resp.headers.location;
        if (redirUrl.indexOf('http') !== 0) redirUrl = url.replace(/\/[^/]*$/, '') + redirUrl;
        file.close();
        try { fs.unlinkSync(filePath); } catch(e) {}
        downloadFromUrl(redirUrl, filePath).then(resolve).catch(reject);
        return;
      }

      if (resp.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(filePath); } catch(e) {}
        resp.resume();
        return reject(new Error('HTTP ' + resp.statusCode));
      }

      resp.pipe(file);
      file.on('finish', function() {
        file.close();
        // Pruefe ob die Datei nicht leer ist
        var stats = fs.statSync(filePath);
        if (stats.size < 1000) {
          try { fs.unlinkSync(filePath); } catch(e) {}
          return reject(new Error('Download zu klein (' + stats.size + ' Bytes)'));
        }
        resolve(filePath);
      });
      file.on('error', function(err) {
        try { fs.unlinkSync(filePath); } catch(e) {}
        reject(err);
      });
    }).on('error', function(err) {
      try { fs.unlinkSync(filePath); } catch(e) {}
      reject(err);
    }).setTimeout(180000, function() {
      try { fs.unlinkSync(filePath); } catch(e) {}
      reject(new Error('Download Timeout'));
    });
  });
}

// =============================================
// TIER 4: Invidious Proxy (letzter Ausweg)
// =============================================
function downloadViaInvidious(videoId, filePath, type) {
  return new Promise(function(resolve, reject) {
    // Aktualisierte Instanzliste – Invidious Instanzen kommen und gehen haeufig
    var instances = [
      'https://inv.nadeko.net',
      'https://invidious.fdn.fr',
      'https://vid.puffyan.us',
      'https://yt.artemislena.eu',
      'https://invidious.nerdvpn.de',
      'https://invidious.jing.rocks',
      'https://invidious.privacyredirect.com',
      'https://invidious.protokolla.fi',
      'https://iv.ggtyler.dev',
      'https://invidious.materialio.us',
      'https://invidious.perennialte.ch',
      'https://yewtu.be'
    ];

    function tryInstance(idx) {
      if (idx >= instances.length) {
        return reject(new Error('Invidious fehlgeschlagen – alle ' + instances.length + ' Instanzen unerreichbar'));
      }

      var inst = instances[idx];
      var infoUrl = inst + '/api/v1/videos/' + videoId + '?fields=title,lengthSeconds,formatStreams,adaptiveFormats';

      log('INFO', 'Invidious [' + (idx+1) + '/' + instances.length + ']: ' + inst);

      var req = https.get(infoUrl, { headers: { 'User-Agent': 'TwitchSoundBoard/0.3.0' } }, function(resp) {
        if (resp.statusCode !== 200) {
          resp.resume();
          log('WARN', 'Invidious ' + inst + ' Status ' + resp.statusCode);
          return tryInstance(idx + 1);
        }
        var data = '';
        resp.on('data', function(chunk) { data += chunk; });
        resp.on('end', function() {
          try {
            var info = JSON.parse(data);
            var title = info.title || 'Unknown';
            var durSec = parseInt(info.lengthSeconds) || 0;
            var dlUrl = null;
            var ext = 'mp4';
            var quality = '';

            if (type === 'video') {
              // formatStreams (combined video+audio)
              if (Array.isArray(info.formatStreams) && info.formatStreams.length) {
                var mp4s = info.formatStreams.filter(function(f) { return (f.type || '').indexOf('video/mp4') === 0; });
                var pick = mp4s.length ? mp4s[0] : info.formatStreams[0];
                dlUrl = pick.url;
                ext = 'mp4';
                quality = pick.qualityLabel || pick.quality || '';
              }
              // /latest_version Proxy (itag 18 = 360p combined, IMMER verfuegbar)
              if (!dlUrl) {
                dlUrl = inst + '/latest_version?id=' + videoId + '&itag=18&local=true';
                ext = 'mp4';
                quality = '360p (proxy)';
              }
            } else {
              // Audio only
              if (Array.isArray(info.adaptiveFormats) && info.adaptiveFormats.length) {
                var audios = info.adaptiveFormats
                  .filter(function(f) { return f.type && f.type.indexOf('audio/') === 0; })
                  .sort(function(a, b) { return (b.bitrate || 0) - (a.bitrate || 0); });
                if (audios.length) {
                  dlUrl = inst + '/latest_version?id=' + videoId + '&itag=' + audios[0].itag + '&local=true';
                  ext = (audios[0].type || 'audio/mp4').split(';')[0].split('/')[1] || 'm4a';
                  quality = Math.round((audios[0].bitrate || 0) / 1000) + 'kbps';
                }
              }
            }

            if (!dlUrl) {
              log('WARN', 'Invidious ' + inst + ': kein Format gefunden');
              return tryInstance(idx + 1);
            }

            // URL relativ -> absolut
            if (dlUrl.indexOf('http') !== 0) dlUrl = inst + dlUrl;

            var baseName = filePath.replace(/\.[^.]+$/, '');
            var finalPath = baseName + '.' + ext;

            log('INFO', 'Invidious Download: ' + inst + ' (' + quality + ', ' + ext + ')');

            downloadFromUrl(dlUrl, finalPath)
              .then(function() {
                resolve({ filePath: finalPath, title: title, durationSeconds: durSec, quality: quality });
              })
              .catch(function() {
                log('WARN', 'Invidious DL fail: ' + inst);
                tryInstance(idx + 1);
              });
          } catch (e) { tryInstance(idx + 1); }
        });
      }).on('error', function() { tryInstance(idx + 1); }).setTimeout(15000, function() { tryInstance(idx + 1); });
    }

    tryInstance(0);
  });
}

// =============================================
// YouTube-Suche fuer Spotify Import
// =============================================
async function searchYouTube(query) {
  // Methode 1: play-dl Suche (schnell, zuverlaessig)
  if (playdl) {
    try {
      var results = await playdl.search(query, { limit: 1, source: { youtube: 'video' } });
      if (results && results.length > 0) {
        log('INFO', 'YT Suche (play-dl): "' + results[0].title + '"');
        return { videoId: results[0].id, title: results[0].title };
      }
    } catch (e) {
      log('WARN', 'play-dl Suche fehlgeschlagen: ' + e.message);
    }
  }

  // Methode 2: Invidious Suche
  try {
    var result = await searchYouTubeOnInvidious(query);
    return result;
  } catch (e) {
    log('WARN', 'Invidious Suche fehlgeschlagen: ' + e.message);
  }

  throw new Error('YouTube-Suche fehlgeschlagen – alle Methoden unerreichbar');
}

function searchYouTubeOnInvidious(query) {
  return new Promise(function(resolve, reject) {
    var instances = [
      'https://inv.nadeko.net',
      'https://vid.puffyan.us',
      'https://invidious.fdn.fr',
      'https://yt.artemislena.eu',
      'https://invidious.nerdvpn.de',
      'https://invidious.jing.rocks',
      'https://yewtu.be',
      'https://invidious.perennialte.ch'
    ];

    function tryInstance(idx) {
      if (idx >= instances.length) {
        return reject(new Error('YouTube-Suche fehlgeschlagen – keine Instanz erreichbar'));
      }

      var apiUrl = instances[idx] + '/api/v1/search?q=' + encodeURIComponent(query) + '&type=video&sort_by=relevance';

      https.get(apiUrl, { headers: { 'User-Agent': 'TwitchSoundBoard/0.3.0' } }, function(resp) {
        if (resp.statusCode !== 200) { resp.resume(); return tryInstance(idx + 1); }
        var data = '';
        resp.on('data', function(chunk) { data += chunk; });
        resp.on('end', function() {
          try {
            var results = JSON.parse(data);
            if (Array.isArray(results) && results.length > 0) {
              var videos = results.filter(function(r) { return r.type === 'video'; });
              if (videos.length > 0) return resolve({ videoId: videos[0].videoId, title: videos[0].title });
            }
            tryInstance(idx + 1);
          } catch (e) { tryInstance(idx + 1); }
        });
      }).on('error', function() { tryInstance(idx + 1); }).setTimeout(8000, function() { tryInstance(idx + 1); });
    }

    tryInstance(0);
  });
}

// =============================================
// Spotify Track Info (oEmbed)
// =============================================
function getSpotifyTrackInfo(url) {
  return new Promise(function(resolve, reject) {
    var oembedUrl = 'https://open.spotify.com/oembed?url=' + encodeURIComponent(url);
    https.get(oembedUrl, { headers: { 'User-Agent': 'TwitchSoundBoard/0.3.0' } }, function(resp) {
      if (resp.statusCode !== 200) return reject(new Error('Spotify Track nicht gefunden'));
      var data = '';
      resp.on('data', function(chunk) { data += chunk; });
      resp.on('end', function() {
        try {
          var json = JSON.parse(data);
          resolve({ title: json.title || 'Unknown Track' });
        } catch (e) { reject(new Error('Spotify Antwort unlesbar')); }
      });
    }).on('error', function(err) { reject(new Error('Spotify Fehler: ' + err.message)); });
  });
}

// =============================================
// IMPORT: YouTube Video (als MP4 mit Video+Audio)
// 4-Tier System: ytdl → play-dl → Cobalt → Invidious
// =============================================
async function importYouTubeVideo(url) {
  var videoId = extractYtVideoId(url);
  if (!videoId) throw new Error('Ungueltige YouTube URL');

  var filename = Date.now() + '_YT_' + videoId + '.mp4';
  var filePath = path.join(VIDEOS_DIR, filename);

  // ---- TIER 1: ytdl-core (schnell, beste Qualitaet) ----
  try {
    log('INFO', 'YT Import Tier 1: ytdl-core...');
    var result = await downloadViaYtdl(url, filePath);
    var resultBase = path.basename(result.filePath);
    if (!config.file_settings) config.file_settings = {};
    config.file_settings[resultBase] = { display_name: result.title, duration_ms: 0 };
    saveConfig();
    log('INFO', 'YT Import OK (ytdl): ' + resultBase);
    return {
      filename: resultBase, title: result.title, type: 'video',
      duration_seconds: result.durationSeconds, size: fs.statSync(result.filePath).size,
      quality: result.quality || 'ytdl'
    };
  } catch (err) {
    log('WARN', 'Tier 1 ytdl fehlgeschlagen: ' + err.message);
  }

  // ---- TIER 2: play-dl (alternative Engine) ----
  try {
    log('INFO', 'YT Import Tier 2: play-dl...');
    var result2 = await downloadViaPlayDl(url, filePath, 'video');
    var resultBase2 = path.basename(result2.filePath);
    if (!config.file_settings) config.file_settings = {};
    config.file_settings[resultBase2] = { display_name: result2.title, duration_ms: 0 };
    saveConfig();
    log('INFO', 'YT Import OK (play-dl): ' + resultBase2);
    return {
      filename: resultBase2, title: result2.title, type: 'video',
      duration_seconds: result2.durationSeconds, size: fs.statSync(result2.filePath).size,
      quality: result2.quality || 'play-dl'
    };
  } catch (err) {
    log('WARN', 'Tier 2 play-dl fehlgeschlagen: ' + err.message);
  }

  // ---- TIER 3: Cobalt API (Web-Service) ----
  try {
    log('INFO', 'YT Import Tier 3: Cobalt API...');
    var result3 = await downloadViaCobalt(url, filePath);
    var resultBase3 = path.basename(result3.filePath);
    if (!config.file_settings) config.file_settings = {};
    config.file_settings[resultBase3] = { display_name: result3.title, duration_ms: 0 };
    saveConfig();
    log('INFO', 'YT Import OK (Cobalt): ' + resultBase3);
    return {
      filename: resultBase3, title: result3.title, type: 'video',
      duration_seconds: result3.durationSeconds, size: fs.statSync(result3.filePath).size,
      quality: result3.quality || 'cobalt'
    };
  } catch (err) {
    log('WARN', 'Tier 3 Cobalt fehlgeschlagen: ' + err.message);
  }

  // ---- TIER 4: Invidious Proxy (letzter Ausweg) ----
  log('INFO', 'YT Import Tier 4: Invidious-Proxy...');
  var result4 = await downloadViaInvidious(videoId, filePath, 'video');
  var resultBase4 = path.basename(result4.filePath);
  if (!config.file_settings) config.file_settings = {};
  config.file_settings[resultBase4] = { display_name: result4.title, duration_ms: 0 };
  saveConfig();
  log('INFO', 'YT Import OK (Invidious): ' + resultBase4);
  return {
    filename: resultBase4, title: result4.title, type: 'video',
    duration_seconds: result4.durationSeconds, size: fs.statSync(result4.filePath).size,
    quality: result4.quality || 'invidious'
  };
}

// =============================================
// IMPORT: Spotify Track (als MP3/M4A Audio)
// Spotify oEmbed → YouTube-Suche → Download
// =============================================
async function importSpotifyTrack(url) {
  var trackInfo = await getSpotifyTrackInfo(url);
  var searchQuery = trackInfo.title + ' official audio';
  log('INFO', 'Spotify Import: Suche "' + searchQuery + '"...');

  var ytResult = await searchYouTube(searchQuery);
  var videoId = ytResult.videoId;
  var ytUrl = 'https://www.youtube.com/watch?v=' + videoId;
  log('INFO', 'Spotify Import: YT Treffer "' + ytResult.title + '" (ID: ' + videoId + ')');

  var safeName = trackInfo.title.replace(/[^a-zA-Z0-9._\- ]/g, '_').substring(0, 60);
  var filePath = path.join(SOUNDS_DIR, Date.now() + '_SPOTIFY_' + safeName + '.m4a');

  // ---- TIER 1: ytdl-core Audio ----
  try {
    log('INFO', 'Spotify Import Tier 1: ytdl-core Audio...');
    var result = await downloadAudioViaYtdl(ytUrl, filePath);
    var resultBase = path.basename(result.filePath);
    if (!config.file_settings) config.file_settings = {};
    config.file_settings[resultBase] = { display_name: trackInfo.title, duration_ms: null };
    saveConfig();
    log('INFO', 'Spotify Track OK (ytdl): ' + resultBase);
    return { filename: resultBase, title: trackInfo.title, type: 'sound', source: 'spotify', size: fs.statSync(result.filePath).size };
  } catch (err) {
    log('WARN', 'Spotify Tier 1 ytdl fehlgeschlagen: ' + err.message);
  }

  // ---- TIER 2: play-dl Audio ----
  try {
    log('INFO', 'Spotify Import Tier 2: play-dl Audio...');
    var result2 = await downloadViaPlayDl(ytUrl, filePath, 'audio');
    var resultBase2 = path.basename(result2.filePath);
    if (!config.file_settings) config.file_settings = {};
    config.file_settings[resultBase2] = { display_name: trackInfo.title, duration_ms: null };
    saveConfig();
    log('INFO', 'Spotify Track OK (play-dl): ' + resultBase2);
    return { filename: resultBase2, title: trackInfo.title, type: 'sound', source: 'spotify', size: fs.statSync(result2.filePath).size };
  } catch (err) {
    log('WARN', 'Spotify Tier 2 play-dl fehlgeschlagen: ' + err.message);
  }

  // ---- TIER 3: Cobalt API ----
  try {
    log('INFO', 'Spotify Import Tier 3: Cobalt API...');
    var result3 = await downloadViaCobalt(ytUrl, filePath);
    var resultBase3 = path.basename(result3.filePath);
    if (!config.file_settings) config.file_settings = {};
    config.file_settings[resultBase3] = { display_name: trackInfo.title, duration_ms: null };
    saveConfig();
    log('INFO', 'Spotify Track OK (Cobalt): ' + resultBase3);
    return { filename: resultBase3, title: trackInfo.title, type: 'sound', source: 'spotify', size: fs.statSync(result3.filePath).size };
  } catch (err) {
    log('WARN', 'Spotify Tier 3 Cobalt fehlgeschlagen: ' + err.message);
  }

  // ---- TIER 4: Invidious Audio Proxy ----
  log('INFO', 'Spotify Import Tier 4: Invidious-Proxy...');
  var result4 = await downloadViaInvidious(videoId, filePath, 'audio');
  var resultBase4 = path.basename(result4.filePath);
  if (!config.file_settings) config.file_settings = {};
  config.file_settings[resultBase4] = { display_name: trackInfo.title, duration_ms: null };
  saveConfig();
  log('INFO', 'Spotify Track OK (Invidious): ' + resultBase4);
  return { filename: resultBase4, title: trackInfo.title, type: 'sound', source: 'spotify', size: fs.statSync(result4.filePath).size };
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
      .filter(function(f) { return /\.(mp3|wav|ogg|m4a|webm)$/i.test(f); })
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
// API – YouTube / Spotify Import
// =============================================
app.post('/api/import', function(req, res) {
  if (!ytdl && !playdl) return res.status(503).json({ error: 'YouTube/Spotify Import nicht verfuegbar. Bitte npm install ausfuehren.' });

  var url = (req.body.url || '').trim();
  if (!url) return res.status(400).json({ error: 'URL noetig' });

  if (isYtUrl(url)) {
    importYouTubeVideo(url).then(function(result) {
      broadcast({ type: 'config_reloaded', config: config });
      res.json({ ok: true, 'import': result });
    }).catch(function(err) {
      log('ERROR', 'YT Import Error: ' + err.message);
      res.status(500).json({ error: err.message });
    });
  } else if (isSpotifyUrl(url)) {
    importSpotifyTrack(url).then(function(result) {
      broadcast({ type: 'config_reloaded', config: config });
      res.json({ ok: true, 'import': result });
    }).catch(function(err) {
      log('ERROR', 'Spotify Import Error: ' + err.message);
      res.status(500).json({ error: err.message });
    });
  } else {
    res.status(400).json({ error: 'Nur YouTube oder Spotify Track Links unterstuetzt' });
  }
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
    sndCount = fs.readdirSync(SOUNDS_DIR).filter(function(f) { return /\.(mp3|wav|ogg|m4a|webm)$/i.test(f); }).length;
    vidCount = fs.readdirSync(VIDEOS_DIR).filter(function(f) { return /\.(mp4|webm|avi|mov)$/i.test(f); }).length;
  } catch (e) {}
  res.json({
    status: 'ok',
    uptime: process.uptime(),
    version: getVersion(),
    twitch: { running: twitchRunning, channel: creds.twitch_channel || null },
    sounds: sndCount,
    videos: vidCount,
    overlayClients: overlayClients.size,
    engines: {
      ytdl: !!ytdl,
      playdl: !!playdl
    }
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
  var dur;
  if (type === 'video') {
    // duration_ms explizit gesetzt? 0 = ganzes Video, >0 = cut nach X ms
    if (fs_cfg.duration_ms !== undefined && fs_cfg.duration_ms !== null) {
      dur = fs_cfg.duration_ms;
    } else {
      // Nicht pro File gesetzt → globale Video-Default nutzen
      dur = s.video_duration_override_ms || 5000;
    }
  } else {
    // Sound: duration_ms = cut nach X ms, null/undefined = ganzes Audio
    dur = (fs_cfg.duration_ms != null && fs_cfg.duration_ms > 0) ? fs_cfg.duration_ms : null;
  }
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
