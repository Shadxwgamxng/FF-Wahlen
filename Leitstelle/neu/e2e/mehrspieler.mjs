/**
 * Ende-zu-Ende-Test Mehrspieler: Gastgeber + zwei Mitspieler (eigene Browser) über den LAN-Server.
 *  - Mitspieler treten über /mitspielen bei und sehen den Leitstand des Gastgebers
 *  - Wer annimmt, ist zuständig; der andere sieht "bearbeitet von …" und kann übernehmen
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
  await host.waitForFunction(() => window.leitwarte.state.runtime.calls.some((c) => c.owner?.name === 'Ben'), null, { timeout: 10000 });
  await anna.getByTestId('owner-banner').waitFor({ timeout: 10000 });
  log('Ben übernimmt – jetzt sieht Anna „Wird von Ben bearbeitet“');

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
