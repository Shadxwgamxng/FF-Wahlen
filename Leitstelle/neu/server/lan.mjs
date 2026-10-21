/**
 * LEITWARTE im lokalen Netz (LAN): liefert das gebaute Spiel aus und verbindet Geräte.
 *
 *   npm run lan            (baut und startet; danach im Browser die angezeigte Adresse öffnen)
 *   PORT=9000 npm run lan  (anderer Port)
 *
 * - PC:     http://<server-ip>:8080/          → Leitstand (Simulation läuft in diesem Browser)
 * - Tablet: http://<server-ip>:8080/tablet    → Notrufabfrage bzw. Funkbedienplatz, synchron zum PC
 *
 * Der Server leitet nur Nachrichten zwischen den verbundenen Browsern weiter (WebSocket /__sync).
 * Er speichert nichts und hat keine Anmeldung – nur im eigenen, vertrauenswürdigen Netz verwenden.
 */
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

const ROOT = resolve(process.env.DIST_DIR ?? fileURLToPath(new URL('../dist', import.meta.url)));
const PORT = Number(process.env.PORT ?? 8080);
const HOST = process.env.HOST ?? '0.0.0.0';
const WS_PATH = '/__sync';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

try {
  await stat(join(ROOT, 'index.html'));
} catch {
  console.error(`Kein gebautes Spiel in ${ROOT} gefunden. Bitte zuerst "npm run build" ausführen (oder "npm run lan").`);
  process.exit(1);
}

async function sendIndex(res) {
  const html = await readFile(join(ROOT, 'index.html'), 'utf8');
  // Kennzeichen für die App: über den LAN-Server ausgeliefert → Geräte über WebSocket verbinden
  const out = html.replace('<head>', '<head><script>window.__LEITWARTE_LAN__ = true;</script>');
  res.writeHead(200, { 'Content-Type': MIME['.html'], 'Cache-Control': 'no-cache' });
  res.end(out);
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://x');
    if (url.pathname === '/mitspielen' || url.pathname === '/mitspielen/') {
      res.writeHead(302, { Location: '/?spieler=1' });
      return res.end();
    }
    if (url.pathname === '/tablet' || url.pathname === '/tablet/') {
      res.writeHead(302, { Location: '/?fenster=tablet' });
      return res.end();
    }
    if (url.pathname === '/' || url.pathname === '/index.html') return await sendIndex(res);
    const file = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (file !== ROOT && !file.startsWith(ROOT + sep)) {
      res.writeHead(403);
      return res.end();
    }
    try {
      const s = await stat(file);
      if (!s.isFile()) throw new Error('kein Datei');
      const body = await readFile(file);
      res.writeHead(200, { 'Content-Type': MIME[extname(file)] ?? 'application/octet-stream', 'Cache-Control': url.pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
      return res.end(body);
    } catch {
      return await sendIndex(res); // unbekannte Pfade → App
    }
  } catch (e) {
    res.writeHead(500);
    res.end(String(e));
  }
});

const wss = new WebSocketServer({ server, path: WS_PATH, perMessageDeflate: { threshold: 1024 }, maxPayload: 64 * 1024 * 1024 });

function announcePeers() {
  const open = [...wss.clients].filter((c) => c.readyState === 1);
  for (const c of open) c.send(JSON.stringify({ __lan: 'peers', count: open.length - 1 }));
}

wss.on('connection', (ws, req) => {
  console.log(`Gerät verbunden: ${req.socket.remoteAddress} (${wss.clients.size} insgesamt)`);
  announcePeers();
  ws.on('message', (data, isBinary) => {
    // an alle anderen weiterleiten – der Server wertet nichts aus
    for (const c of wss.clients) if (c !== ws && c.readyState === 1) c.send(data, { binary: isBinary });
  });
  ws.on('close', () => {
    console.log(`Gerät getrennt (${wss.clients.size} verbunden)`);
    announcePeers();
  });
});

server.listen(PORT, HOST, () => {
  const ips = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  console.log('\nLEITWARTE läuft im LAN:');
  console.log(`  Leitstand (PC):  http://localhost:${PORT}/`);
  for (const ip of ips) {
    console.log(`  Leitstand:       http://${ip}:${PORT}/`);
    console.log(`  Tablet:          http://${ip}:${PORT}/tablet`);
    console.log(`  Mitspieler:      http://${ip}:${PORT}/mitspielen`);
  }
  console.log('\nBeenden mit Strg+C.\n');
});
