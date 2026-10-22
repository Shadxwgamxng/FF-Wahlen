/**
 * Ende-zu-Ende-Test Mehrspieler: Gastgeber + zwei Mitspieler (eigene Browser) über den LAN-Server.
 *  - Mitspieler treten über /mitspielen bei und sehen den Leitstand des Gastgebers
 *  - Wer annimmt, ist zuständig; der andere sieht "bearbeitet von …" und kann die Übernahme anfragen (Zuständiger genehmigt/lehnt ab)
 *  - Zeitsteuerung nur beim Gastgeber; Datenmenge pro Zustand klein (nur Änderungen)
 * Aufruf: npm run build && npm run test:mehrspieler
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = (() => {
  for (const p of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) {
    try {
      return require(p);
    } catch {
      /* weiter */
    }
  }
  throw new Error('Playwright nicht gefunden.');
})();

const PORT = 4176;
const BASE = `http://localhost:${PORT}`;
const fixture = readFileSync(new URL('./fixtures/overpass-ostholstein-sued.json', import.meta.url), 'utf8');
const server = spawn('node', ['server/lan.mjs'], { cwd: new URL('..', import.meta.url).pathname, env: { ...process.env, PORT: String(PORT) }, stdio: 'pipe' });
process.on('exit', () => server.kill('SIGTERM'));
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(`${BASE}/`)).ok) break;
  } catch {
    /* warten */
  }
  await new Promise((r) => setTimeout(r, 200));
}

let step = 0;
const log = (m) => console.log(`✓ ${++step}. ${m}`);
const assert = (c, m) => {
  if (!c) throw new Error(`Prüfung fehlgeschlagen: ${m}`);
};
const browser = await chromium.launch();
const errors = [];
const prefs = () => localStorage.setItem('leitwarte.prefs', JSON.stringify({ routingEnabled: false, sound: false, tts: false }));
const frames = [];
async function open(name, url) {
  const ctx = await browser.newContext({ viewport: { width: 1500, height: 900 } });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  await page.addInitScript(prefs);
  if (name === 'Anna')
    await page.addInitScript(() => {
      // Mikrofon-Einwilligung und nachgebildete Spracherkennung (liefert window.__funkSpruch)
      localStorage.setItem('leitwarte.sprachtest.einwilligung', JSON.stringify({ version: 1, at: 1, mode: 'browserdienst' }));
      class FakeRecognition {
        start() {
          const text = this.continuous ? window.__funkSpruch || '' : '';
          setTimeout(() => {
            if (text) this.onresult?.({ resultIndex: 0, results: { length: 1, 0: Object.assign([{ transcript: text, confidence: 1 }], { isFinal: true }) } });
            if (!this.continuous) setTimeout(() => this.onend?.(), 50);
          }, 150);
        }
        stop() {
          setTimeout(() => this.onend?.(), 50);
        }
        abort() {
          this.onend?.();
        }
      }
      window.SpeechRecognition = FakeRecognition;
      window.webkitSpeechRecognition = FakeRecognition;
    });
  await page.route('**/tile.openstreetmap.org/**', (r) => r.abort());
  await page.route('**/api/interpreter', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: fixture }));
  if (name === 'Anna') page.on('websocket', (ws) => ws.on('framereceived', (f) => frames.push(typeof f.payload === 'string' ? f.payload.length : f.payload.byteLength)));
  await page.goto(url);
  return page;
}
try {
  const host = await open('Gastgeber', `${BASE}/`);
  await host.getByTestId('start-screen').waitFor();
  await host.getByTestId('player-name').fill('Gastgeber Lukas');
  await host.getByTestId('player-name').blur();
  await host.getByTestId('new-sample').click();
  await host.getByTestId('desk').waitFor({ timeout: 60000 });

  const anna = await open('Anna', `${BASE}/mitspielen`);
  const ben = await open('Ben', `${BASE}/mitspielen`);
  for (const [p, n] of [[anna, 'Anna'], [ben, 'Ben']]) {
    await p.getByTestId('join-screen').waitFor();
    await p.getByTestId('join-name').fill(n);
    await p.getByTestId('join-ok').click();
    await p.getByTestId('desk').waitFor({ timeout: 20000 });
  }
  await host.waitForFunction(() => (window.leitwarte.state.runtime.players ?? []).length === 3, null, { timeout: 15000 });
  await anna.getByTestId('players').waitFor();
  log('Gastgeber startet Ostholstein; Anna und Ben treten über /mitspielen bei – alle drei in der Spielerliste');

  assert((await anna.getByTestId('play-pause').count()) === 0, 'Mitspieler haben keine Zeitsteuerung');
  log('Zeit und Geschwindigkeit steuert nur der Gastgeber');

  await host.evaluate(() => window.leitwarte.cmd('injectScenarioCall', 'brand_kueche'));
  await anna.getByTestId('call-item').first().waitFor({ timeout: 10000 });
  await anna.getByTestId('call-item').first().click();
  await anna.getByRole('button', { name: /Notruf annehmen/ }).click();
  await host.waitForFunction(() => window.leitwarte.state.runtime.calls.some((c) => c.owner?.name === 'Anna'), null, { timeout: 10000 });
  log('Anna nimmt den Notruf an – sie ist zuständig');

  await ben.getByTestId('call-item').first().click();
  await ben.getByTestId('owner-banner').waitFor({ timeout: 10000 });
  assert((await ben.getByTestId('owner-banner').innerText()).includes('Anna'), 'Ben sieht „bearbeitet von Anna“');
  log('Ben öffnet denselben Notruf: „Wird von Anna bearbeitet“');

  await ben.getByTestId('take-over').click();
  await anna.getByTestId('take-over-request').waitFor({ timeout: 10000 });
  await ben.getByTestId('take-over-cancel').waitFor({ timeout: 10000 });
  assert((await anna.getByTestId('take-over-request').innerText()).includes('Ben'), 'Anna sieht Bens Anfrage');
  await anna.getByTestId('take-over-decline').click();
  await ben.getByTestId('take-over-declined').waitFor({ timeout: 10000 });
  assert(await host.evaluate(() => window.leitwarte.state.runtime.calls.some((c) => c.owner?.name === 'Anna')), 'nach Ablehnung bleibt Anna zuständig');
  log('Ben fragt an, Anna lehnt ab – Ben sieht „Anfrage abgelehnt“, Anna bleibt zuständig');

  await ben.getByTestId('take-over').click();
  await anna.getByTestId('take-over-accept').click();
  await host.waitForFunction(() => window.leitwarte.state.runtime.calls.some((c) => c.owner?.name === 'Ben'), null, { timeout: 10000 });
  await anna.getByTestId('owner-banner').waitFor({ timeout: 10000 });
  log('Ben fragt erneut an, Anna genehmigt – jetzt sieht Anna „Wird von Ben bearbeitet“');

  // Datenmenge: nach dem ersten vollen Zustand nur noch kleine Änderungen
  frames.length = 0;
  await host.evaluate(() => {
    window.leitwarte.cmd('setSpeed', 10);
    if (!window.leitwarte.state.runtime.clock.running) window.leitwarte.cmd('toggleRunning');
  });
  await anna.waitForTimeout(5000);
  // Rohgröße (vor Kompression): voller Zustand ~580 KB, Änderungen ~170 KB; übertragen wird komprimiert (~10 KB)
  const big = frames.filter((n) => n > 400000).length;
  const avg = Math.round(frames.reduce((a, b) => a + b, 0) / Math.max(1, frames.length) / 1024);
  assert(frames.length > 4 && big === 0, `nur kleine Zustandsmeldungen (${frames.length} Meldungen, ${big} große)`);
  log(`Laufende Simulation: ${frames.length} Zustandsmeldungen in 5 s, Ø ${avg} KB unkomprimiert, ohne Leitstellenkonfiguration`);

  // Annas Tablet: gehört zu Anna – Sendetaste löst Annas Mikrofon aus, nicht das des Gastgebers
  const tab = await open('Tablet', `${BASE}/tablet`);
  await tab.getByTestId('funkbedienplatz').waitFor({ timeout: 20000 });
  const annaId = await anna.evaluate(() => window.leitwarte.player.id);
  await tab.getByTestId('tablet-owner').selectOption(annaId);
  const cs = await host.evaluate(() => window.leitwarte.state.center.vehicles.find((v) => v.callsign.startsWith('Florian Ostholstein')).callsign);
  await anna.evaluate((c) => (window.__funkSpruch = `${c} von Leitstelle, kommen`), cs);
  const grp = await host.evaluate((c) => {
    const st = window.leitwarte.state;
    const v = st.center.vehicles.find((x) => x.callsign === c);
    return v.radioGroup?.code || st.center.organizations.find((o) => o.id === v.organizationId).radioGroup.code;
  }, cs);
  await tab.getByTestId('rufgruppe').filter({ hasText: grp }).first().click();
  const box = await tab.getByTestId('ptt').boundingBox();
  await tab.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await tab.mouse.down();
  await anna.waitForFunction(() => window.leitwarte.funkStatus.sending, null, { timeout: 10000 });
  assert(!(await host.evaluate(() => window.leitwarte.funkStatus.sending)), 'Gastgeber-Mikrofon bleibt aus');
  await tab.waitForTimeout(400);
  await tab.mouse.up();
  await host.waitForFunction((c) => (window.leitwarte.state.runtime.funk?.log ?? []).some((l) => l.from === 'fahrzeug' && l.text.startsWith(`Hier ${c}`)), cs, { timeout: 10000 });
  log(`Annas Tablet (gehört zu Anna): Sendetaste → Annas PC erkennt den Funkspruch → ${cs} antwortet; Gastgeber-Mikrofon bleibt aus`);

  // Fahrzeugbilder: Gastgeber lädt hoch, Mitspieler sehen sie (Übertragung über den LAN-Server)
  const png = (rgb) => {
    // kleines einfarbiges PNG ohne Hilfsbibliothek
    const { deflateSync, crc32 } = require('node:zlib');
    const w = 40, h = 20;
    const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.from([0, ...Array.from({ length: w }, () => rgb).flat()])));
    const chunk = (t, d) => {
      const len = Buffer.alloc(4); len.writeUInt32BE(d.length);
      const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([Buffer.from(t), d])) >>> 0);
      return Buffer.concat([len, Buffer.from(t), d, crc]);
    };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr.set([8, 2, 0, 0, 0], 8);
    return { name: 'bild.png', mimeType: 'image/png', buffer: Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]) };
  };
  const rtw = await host.evaluate(() => window.leitwarte.state.center.vehicles.find((v) => v.callsign.startsWith('Rettung')).callsign);
  await host.getByRole('button', { name: 'Datei', exact: true }).click();
  await host.getByRole('menuitem', { name: /bearbeiten/ }).click();
  await host.getByRole('navigation', { name: 'Bereiche' }).getByRole('button', { name: 'Fahrzeuge', exact: true }).click();
  const row = host.locator('tr', { hasText: rtw }).first();
  for (const [k, rgb] of [['normal', [200, 0, 0]], ['blaulicht', [0, 0, 255]]]) {
    const fc = host.waitForEvent('filechooser');
    await row.getByTestId(`veh-img-${k}`).click();
    await (await fc).setFiles(png(rgb));
    await row.getByTestId(`veh-img-${k}`).locator('img').waitFor({ timeout: 10000 });
  }
  await host.getByTestId('start-play').first().click();
  await host.getByTestId('desk').waitFor({ timeout: 20000 });
  await ben.locator('[data-testid="veh-img-inline"] img').first().waitFor({ timeout: 15000 });
  // ein später beitretender Mitspieler bekommt die Bilder beim Verbinden
  const carla = await open('Carla', `${BASE}/mitspielen`);
  await carla.getByTestId('join-name').fill('Carla');
  await carla.getByTestId('join-ok').click();
  await carla.getByTestId('desk').waitFor({ timeout: 20000 });
  await carla.locator('[data-testid="veh-img-inline"] img').first().waitFor({ timeout: 15000 });
  log(`Fahrzeugbilder: Gastgeber lädt Bilder für ${rtw} hoch – Ben sieht sie sofort, Carla nach dem Beitreten`);

  assert(errors.length === 0, `Keine JavaScript-Fehler: ${errors.join(' | ')}`);
  log('Keine JavaScript-Fehler bei Gastgeber und Mitspielern');
  console.log('\nMehrspieler-Test: alle Schritte erfolgreich.');
} catch (e) {
  console.error(`✗ ${e.message}`);
  if (errors.length) console.error('Konsole:', errors.join(' | '));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
