'use strict';

const express = require('express');
const { spawn } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Konfiguration (alles per Umgebungsvariable überschreibbar)
// ---------------------------------------------------------------------------
const PORT = Number(process.env.PORT) || 4000;
// Standardmäßig nur lokal erreichbar. Mit HOST=0.0.0.0 im ganzen Netzwerk.
const HOST = process.env.HOST || '127.0.0.1';
const DOWNLOAD_DIR = path.resolve(process.env.DOWNLOAD_DIR || path.join(__dirname, 'downloads'));
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';
const SPOTDL = process.env.SPOTDL_PATH || 'spotdl';
const FFMPEG = process.env.FFMPEG_PATH || ''; // optional: Pfad zur ffmpeg-Binary
const MAX_CONCURRENT = Number(process.env.MAX_CONCURRENT) || 2;
const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const SPOTIFY_CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || '';

const QUALITIES = { best: null, '2160': 2160, '1440': 1440, '1080': 1080, '720': 720, '480': 480, '360': 360 };
const HIDDEN_EXT = ['.part', '.ytdl', '.temp', '.tmp'];

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.static(path.join(__dirname, 'public')));

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------
function hostMatches(host, domain) {
  return host === domain || host.endsWith('.' + domain);
}

function detectPlatform(raw) {
  let u;
  try {
    u = new URL(String(raw).trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  const host = u.hostname.toLowerCase();
  if (['youtube.com', 'youtu.be', 'youtube-nocookie.com'].some((d) => hostMatches(host, d))) return 'youtube';
  if (hostMatches(host, 'soundcloud.com')) return 'soundcloud';
  if (hostMatches(host, 'spotify.com')) return 'spotify';
  return null;
}

/** Löst einen Dateinamen sicher innerhalb von DOWNLOAD_DIR auf (kein Path-Traversal). */
function safeFilePath(name) {
  if (typeof name !== 'string' || !name || name !== path.basename(name) || name.startsWith('.')) return null;
  const full = path.join(DOWNLOAD_DIR, name);
  return path.dirname(full) === DOWNLOAD_DIR ? full : null;
}

function buildYtdlpArgs({ url, platform, format, quality, playlist }) {
  const args = [
    '--newline',
    '--no-colors',
    '--windows-filenames',
    '--progress-template', 'download:[progress] %(progress._percent_str)s|%(progress._speed_str)s|%(progress._eta_str)s',
    '-P', DOWNLOAD_DIR,
    '-o', '%(title)s [%(id)s].%(ext)s',
    playlist ? '--yes-playlist' : '--no-playlist',
  ];
  if (FFMPEG) args.push('--ffmpeg-location', FFMPEG);

  if (format === 'mp4' && platform === 'youtube') {
    const h = QUALITIES[quality] ?? null;
    const selector = h ? `bv*[height<=${h}]+ba/b[height<=${h}]/bv*+ba/b` : 'bv*+ba/b';
    args.push('-f', selector, '-S', 'res,ext:mp4:m4a', '--merge-output-format', 'mp4');
  } else {
    args.push(
      '-x', '--audio-format', 'mp3', '--audio-quality', '0',
      '--embed-metadata', '--embed-thumbnail', '--convert-thumbnails', 'jpg'
    );
  }
  args.push('--', url);
  return args;
}

function buildSpotdlArgs({ url }) {
  const args = [
    'download', url,
    '--output', path.join(DOWNLOAD_DIR, '{artists} - {title}.{output-ext}'),
    '--format', 'mp3',
  ];
  if (FFMPEG) args.push('--ffmpeg', FFMPEG);
  if (SPOTIFY_CLIENT_ID && SPOTIFY_CLIENT_SECRET) {
    args.push('--client-id', SPOTIFY_CLIENT_ID, '--client-secret', SPOTIFY_CLIENT_SECRET);
  }
  return args;
}

// ---------------------------------------------------------------------------
// Job-Verwaltung
// ---------------------------------------------------------------------------
const jobs = new Map();
const queue = [];
let running = 0;

function snapshot(job) {
  const { id, url, platform, format, quality, status, progress, label, error, createdAt, finishedAt } = job;
  return { id, url, platform, format, quality, status, progress, label, error, createdAt, finishedAt };
}

function emit(job, event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of job.clients) res.write(payload);
}

function log(job, line) {
  job.logs.push(line);
  if (job.logs.length > 2000) job.logs.shift();
  emit(job, 'log', { line });
}

function update(job, fields) {
  Object.assign(job, fields);
  emit(job, 'status', snapshot(job));
}

function finish(job, status, error) {
  update(job, {
    status,
    error: error || null,
    progress: status === 'done' ? 100 : job.progress,
    finishedAt: Date.now(),
    child: null,
  });
  emit(job, 'end', snapshot(job));
  for (const res of job.clients) res.end();
  job.clients.clear();
  running--;
  startNext();
}

/** Wertet eine Zeile der Tool-Ausgabe aus und aktualisiert den Fortschritt. */
function parseLine(job, line) {
  if (job.tool === 'yt-dlp') {
    const p = line.match(/^\[progress\]\s*([\d.]+)%\|([^|]*)\|(.*)$/);
    if (p) {
      const item = job.items ? ` (Titel ${job.items.current}/${job.items.total})` : '';
      update(job, { progress: Math.min(100, parseFloat(p[1])), label: `Download ${p[1]}% – ${p[2].trim()} – ETA ${p[3].trim()}${item}` });
      return false; // Fortschrittszeilen nicht ins Log schreiben (zu viele)
    }
    const item = line.match(/Downloading item (\d+) of (\d+)/);
    if (item) job.items = { current: Number(item[1]), total: Number(item[2]) };
    if (/^\[(ExtractAudio|Merger|VideoConvertor|EmbedThumbnail|Metadata)\]/.test(line)) {
      update(job, { label: 'Nachbearbeitung mit ffmpeg …' });
    }
  } else {
    const found = line.match(/Found (\d+) songs?/i);
    if (found) job.items = { current: 0, total: Number(found[1]) };
    if (/^(Downloaded|Skipping)\b/i.test(line)) {
      job.items = job.items || { current: 0, total: 1 };
      job.items.current++;
      const { current, total } = job.items;
      update(job, { progress: Math.round((current / Math.max(total, current)) * 100), label: `${current} von ${total} Titeln fertig` });
    }
  }
  return true;
}

function runJob(job) {
  running++;
  const isSpotify = job.platform === 'spotify';
  const cmd = isSpotify ? SPOTDL : YTDLP;
  const args = isSpotify ? buildSpotdlArgs(job) : buildYtdlpArgs(job);
  job.tool = isSpotify ? 'spotdl' : 'yt-dlp';

  update(job, { status: 'running', label: `${job.tool} wird gestartet …` });
  log(job, `$ ${cmd} ${args.map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ')}`);

  const child = spawn(cmd, args, {
    cwd: DOWNLOAD_DIR,
    env: { ...process.env, PYTHONUNBUFFERED: '1', PYTHONIOENCODING: 'utf-8' },
    windowsHide: true,
  });
  job.child = child;

  const handleChunk = (buffer) => (chunk) => {
    buffer.text += chunk.toString('utf8');
    const lines = buffer.text.split(/\r\n|\r|\n/);
    buffer.text = lines.pop();
    for (const raw of lines) {
      const line = raw.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '').trimEnd();
      if (line && parseLine(job, line)) log(job, line);
    }
  };
  child.stdout.on('data', handleChunk({ text: '' }));
  child.stderr.on('data', handleChunk({ text: '' }));

  child.on('error', (err) => {
    const msg = err.code === 'ENOENT'
      ? `"${cmd}" wurde nicht gefunden. Ist ${job.tool} installiert und im PATH? (siehe README)`
      : err.message;
    log(job, `FEHLER: ${msg}`);
    finish(job, 'error', msg);
  });

  child.on('close', (code, signal) => {
    if (job.status !== 'running') return; // bereits über 'error' beendet
    if (job.cancelled) {
      log(job, 'Download abgebrochen.');
      finish(job, 'cancelled', 'Abgebrochen');
    } else if (code === 0) {
      log(job, 'Fertig.');
      update(job, { label: 'Fertig' });
      finish(job, 'done');
    } else {
      const msg = `${job.tool} beendet mit Code ${code ?? signal}`;
      log(job, `FEHLER: ${msg}`);
      finish(job, 'error', msg);
    }
  });
}

function startNext() {
  while (running < MAX_CONCURRENT && queue.length) runJob(queue.shift());
}

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------
app.post('/api/download', (req, res) => {
  const { url, format = 'mp3', quality = 'best', playlist = false } = req.body || {};
  const platform = detectPlatform(url);
  if (!platform) {
    return res.status(400).json({ error: 'Ungültige oder nicht unterstützte URL (YouTube, SoundCloud oder Spotify).' });
  }
  if (!['mp3', 'mp4'].includes(format)) return res.status(400).json({ error: 'Ungültiges Format.' });
  if (!(quality in QUALITIES)) return res.status(400).json({ error: 'Ungültige Qualität.' });

  const job = {
    id: crypto.randomUUID(),
    url: String(url).trim(),
    platform,
    // MP4 gibt es nur bei YouTube, alles andere wird MP3
    format: platform === 'youtube' ? format : 'mp3',
    quality: platform === 'youtube' && format === 'mp4' ? quality : null,
    playlist: Boolean(playlist),
    status: 'queued',
    progress: 0,
    label: 'In der Warteschlange',
    error: null,
    logs: [],
    clients: new Set(),
    child: null,
    createdAt: Date.now(),
    finishedAt: null,
  };
  jobs.set(job.id, job);
  queue.push(job);
  startNext();
  res.status(202).json(snapshot(job));
});

app.get('/api/jobs', (req, res) => {
  res.json([...jobs.values()].map(snapshot).sort((a, b) => b.createdAt - a.createdAt));
});

// Server-Sent Events: Live-Status und Logs eines Jobs
app.get('/api/jobs/:id/events', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).end();

  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  res.write(`event: init\ndata: ${JSON.stringify({ ...snapshot(job), logs: job.logs })}\n\n`);

  if (['done', 'error', 'cancelled'].includes(job.status)) {
    res.write(`event: end\ndata: ${JSON.stringify(snapshot(job))}\n\n`);
    return res.end();
  }
  job.clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 20000);
  req.on('close', () => {
    clearInterval(ping);
    job.clients.delete(res);
  });
});

app.post('/api/jobs/:id/cancel', (req, res) => {
  const job = jobs.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'Job nicht gefunden.' });
  if (job.status === 'queued') {
    queue.splice(queue.indexOf(job), 1);
    running++; // finish() zählt wieder herunter
    finish(job, 'cancelled', 'Abgebrochen');
  } else if (job.status === 'running' && job.child) {
    job.cancelled = true;
    job.child.kill();
  }
  res.json(snapshot(job));
});

app.delete('/api/jobs', (req, res) => {
  for (const [id, job] of jobs) {
    if (!['queued', 'running'].includes(job.status)) jobs.delete(id);
  }
  res.status(204).end();
});

app.get('/api/files', async (req, res) => {
  try {
    const entries = await fs.promises.readdir(DOWNLOAD_DIR, { withFileTypes: true });
    const files = await Promise.all(
      entries
        .filter((e) => e.isFile() && !e.name.startsWith('.') && !HIDDEN_EXT.some((x) => e.name.endsWith(x)))
        .map(async (e) => {
          const stat = await fs.promises.stat(path.join(DOWNLOAD_DIR, e.name));
          return { name: e.name, size: stat.size, modified: stat.mtimeMs };
        })
    );
    res.json(files.sort((a, b) => b.modified - a.modified));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Direkter Download einer Datei aus dem downloads-Ordner
app.get('/downloads/:name', (req, res) => {
  const file = safeFilePath(req.params.name);
  if (!file || !fs.existsSync(file)) return res.status(404).send('Datei nicht gefunden');
  res.download(file);
});

app.delete('/api/files/:name', async (req, res) => {
  const file = safeFilePath(req.params.name);
  if (!file) return res.status(400).json({ error: 'Ungültiger Dateiname.' });
  try {
    await fs.promises.unlink(file);
    res.status(204).end();
  } catch (err) {
    res.status(err.code === 'ENOENT' ? 404 : 500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// Start / Shutdown
// ---------------------------------------------------------------------------
const server = app.listen(PORT, HOST, () => {
  console.log(`Downloader läuft auf http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`);
  console.log(`Dateien werden gespeichert in: ${DOWNLOAD_DIR}`);
});

function shutdown() {
  for (const job of jobs.values()) job.child?.kill();
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
