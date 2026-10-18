/**
 * Nimmt einen kommentierten Testdurchlauf als Video auf:
 * Notruf annehmen → mit dem Anrufer sprechen → DIAS-Notrufabfrage durchklicken → Ergebnis übernehmen
 * → Einsatz anlegen → Freiwillige Feuerwehr über Alarmgruppe alarmieren → Ausrücken verfolgen.
 *
 * Aufruf (nach npm run build):  DIAS_FILE=/pfad/zum/dias-export.json node e2e/video.mjs
 * Ohne DIAS_FILE werden die frei erfundenen Testdaten aus e2e/fixtures/dias-test.json genutzt.
 * Ergebnis: e2e/video/leitwarte-testdurchlauf.mp4 (benötigt ffmpeg, sonst bleibt die .webm-Datei)
 */
import { execFile, spawn, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync, renameSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { chromium } = (() => {
  for (const p of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) {
    try {
      return require(p);
    } catch {
      /* nächster Kandidat */
    }
  }
  throw new Error('Playwright nicht gefunden.');
})();

const ROOT = process.env.APP_ROOT ?? new URL('..', import.meta.url).pathname;
const PORT = 4174;
const BASE = `http://localhost:${PORT}/`;
const OSRM = process.env.OSRM_URL ?? 'http://localhost:5000';
const OUT = new URL('./video/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const overpassFixture = readFileSync(new URL('./fixtures/overpass-ostholstein-sued.json', import.meta.url), 'utf8');
const diasFile = process.env.DIAS_FILE ?? new URL('./fixtures/dias-test.json', import.meta.url).pathname;
const W = 1600;
const H = 900;

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { cwd: ROOT, stdio: 'pipe' });
process.on('exit', () => server.kill('SIGTERM'));
for (let i = 0; i < 60; i++) {
  try {
    if ((await fetch(BASE)).ok) break;
  } catch {
    /* warten */
  }
  await new Promise((r) => setTimeout(r, 250));
}

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const t0 = Date.now();
const context = await browser.newContext({ viewport: { width: W, height: H }, recordVideo: { dir: OUT, size: { width: W, height: H } } });
const page = await context.newPage();
await page.route('**/api/interpreter', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: overpassFixture }));
// Optional: Kartenkacheln über curl laden (Umgebungen, in denen der Browser nicht direkt ins Internet darf)
if (process.env.VIDEO_TILES_VIA_CURL)
  await page.route('**/tile.openstreetmap.org/**', (r) =>
    execFile('curl', ['-sS', '-m', '20', '-A', 'LEITWARTE-Testvideo', r.request().url()], { encoding: 'buffer', maxBuffer: 5e6 }, (err, body) =>
      err ? r.abort() : r.fulfill({ status: 200, contentType: 'image/png', body }),
    ),
  );
await page.addInitScript((url) => {
  localStorage.setItem('leitwarte.prefs', JSON.stringify({ routingUrl: url, routingEnabled: true, sound: false }));
  // Untertitel und sichtbarer Mauszeiger für das Video
  window.addEventListener('DOMContentLoaded', () => {
    const cap = document.createElement('div');
    cap.id = '__cap';
    cap.style.cssText =
      'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);max-width:1100px;z-index:99999;background:rgba(10,14,22,.92);color:#fff;border:2px solid #3d8bfd;border-radius:10px;padding:10px 18px;font:600 19px/1.35 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.5);display:none;text-align:center;pointer-events:none';
    document.body.appendChild(cap);
    const dot = document.createElement('div');
    dot.style.cssText = 'position:fixed;width:22px;height:22px;border-radius:50%;background:rgba(255,200,0,.55);border:2px solid #ffb300;z-index:100000;pointer-events:none;transform:translate(-50%,-50%);left:-50px;top:-50px;transition:transform .08s';
    document.body.appendChild(dot);
    window.addEventListener('mousemove', (e) => {
      dot.style.left = `${e.clientX}px`;
      dot.style.top = `${e.clientY}px`;
    });
    window.addEventListener('mousedown', () => (dot.style.transform = 'translate(-50%,-50%) scale(.6)'));
    window.addEventListener('mouseup', () => (dot.style.transform = 'translate(-50%,-50%)'));
  });
}, OSRM);

const sleep = (ms) => page.waitForTimeout(ms);
async function caption(text, ms = 2600) {
  await page.evaluate((t) => {
    const c = document.getElementById('__cap');
    if (!c) return;
    c.textContent = t;
    c.style.display = t ? 'block' : 'none';
  }, text);
  if (ms) await sleep(ms);
}
async function click(locator, pause = 500) {
  await locator.scrollIntoViewIfNeeded();
  const b = await locator.boundingBox();
  if (b) await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 18 });
  await sleep(250);
  await locator.click();
  await sleep(pause);
}
async function type(locator, text) {
  await click(locator, 150);
  await locator.pressSequentially(text, { delay: 70 });
  await sleep(300);
}
const nav = (name) => click(page.getByRole('navigation', { name: 'Bereiche' }).getByRole('button', { name, exact: true }), 600);
const state = () => page.evaluate(() => window.leitwarte.state);

// ------------------------------------------------------------------ Vorbereitung (wird aus dem Video geschnitten)
await page.goto(BASE);
await page.getByTestId('start-screen').waitFor();
await page.getByTestId('new-sample').click();
await page.getByTestId('desk').waitFor({ timeout: 60000 });
await page.getByRole('navigation', { name: 'Bereiche' }).getByRole('button', { name: 'Daten & Einstellungen', exact: true }).click();
await page.getByTestId('dias-file').setInputFiles(diasFile);
await page.getByTestId('dias-status').waitFor({ timeout: 60000 });
await page.getByRole('navigation', { name: 'Bereiche' }).getByRole('button', { name: 'Leitstand', exact: true }).click();
// passenden Anruf erzeugen: Küchenbrand im Mehrfamilienhaus, Person noch in der Wohnung
let callId = null;
for (let i = 0; i < 40 && !callId; i++) {
  callId = await page.evaluate(() => {
    const s = window.leitwarte;
    s.cmd('injectScenarioCall', 'brand_kueche');
    const c = s.state.runtime.calls[s.state.runtime.calls.length - 1];
    if (c.facts.trapped === true && /Mehrfamilienhaus|Wohnblock|Hinterhaus/.test(c.location.detail) && c.location.houseNumber) return c.id;
    s.cmd('acceptCall', c.id);
    s.cmd('closeCallWithoutIncident', c.id, 'Vorbereitung Video');
    return null;
  });
}
if (!callId) throw new Error('Kein passender Anruf erzeugt');
await sleep(800);
const demoStart = Date.now();

// ------------------------------------------------------------------ Demo
let g = await state();
let call = g.runtime.calls.find((c) => c.id === callId);
await caption('LEITWARTE – Testdurchlauf: Notruf mit standardisierter Notrufabfrage (DIAS)', 3200);
await caption('Ein Notruf geht ein. Ich nehme ihn an …', 1800);
await click(page.getByTestId('call-item').first(), 600);
const cw = page.getByTestId('call-window');
await cw.waitFor();
if (await cw.getByRole('button', { name: /Notruf annehmen/ }).count()) await click(cw.getByRole('button', { name: /Notruf annehmen/ }), 900);
await caption(`Der Anrufer meldet sich: „${call.opening}“`, 3600);
await caption('Rechts öffnet sich DIAS. Ich stelle die Fragen selbst und klicke die Antworten an. Erst der Einsatzort:', 3600);

const ask = async (text, cap) => {
  await caption(cap ?? `Ich frage: „${text}“`, 1500);
  await click(cw.getByRole('button', { name: text, exact: true }), 1200);
  g = await state();
  call = g.runtime.calls.find((c) => c.id === callId);
  const last = call.dialog[call.dialog.length - 1];
  await caption(`Anrufer: „${last.answer}“`, 3200);
};
await ask('Wo genau ist der Notfallort? (Ort, Straße, Hausnummer)');
await caption('Ich trage die Adresse selbst in die Einsatzmaske ein (mit Straßenvorschlag aus OpenStreetMap).', 2000);
await type(cw.getByTestId('street-input'), call.location.street.slice(0, 6));
await click(cw.locator('.suggest-item', { hasText: call.location.street }).first(), 400);
await type(cw.getByLabel('Hausnummer'), call.location.houseNumber);
await cw.getByText('✓ Adresse gefunden').waitFor();
await caption('✓ Adresse gefunden.', 1500);

await ask('Was ist genau passiert?');
const opt = (re) => cw.getByTestId('dias-option').filter({ hasText: re }).first();
await caption('DIAS: „Was ist jetzt der Grund Ihres Anrufes?“ → Brandschutz', 2200);
await click(opt(/Brandschutz/), 900);
await caption('DIAS: „Warum benötigen Sie die Feuerwehr?“ → Feuer / Rauchentwicklung', 2200);
await click(opt(/Feuer \/ Rauchentwicklung/), 900);
await ask('Was brennt genau?');
await caption('DIAS: „Was brennt oder raucht?“ → Privates Gebäude', 2200);
await click(opt(/Privates Gebäude/), 900);
await caption(`DIAS: „Welche Gebäudeart?“ → Mehrfamilienhaus (Anrufer: ${call.location.detail})`, 2600);
await click(opt(/^\s*\S*\s*Mehrfamilienhaus$/), 900);
await caption('DIAS: „Welcher Gebäudeteil?“ → Wohnung', 2000);
await click(opt(/Wohnung/), 900);
await caption('DIAS: „Ist der Treppenraum verraucht?“ – das weiß der Anrufer nicht → Unklar', 2600);
await click(opt(/Unklar/), 900);
await ask('In welchem Stockwerk / Gebäudeteil?');
await caption('DIAS: „In welchem Stockwerk?“ → bis 7. Stockwerk', 2000);
await click(opt(/Bis 7/), 900);
await ask('Sind noch Personen im Gebäude oder im Gefahrenbereich?');
await caption('DIAS: „Wie viele Personen sind verletzt oder in Gefahr?“ → 1', 2200);
await click(cw.getByTestId('dias-option').filter({ hasText: /^\s*1\s*1?\s*$/ }).first(), 900);
await caption('DIAS: „Ist der Betroffene eingeschlossen oder vermisst?“ → Ja', 2200);
await click(opt(/^\s*\S*\s*Ja$/), 900);
await caption('DIAS: „Wo genau befindet sich die Person?“ → Brandwohnung', 2200);
await click(opt(/Brandwohnung/), 1200);

const res = cw.getByTestId('dias-result');
if (await res.count()) {
  await res.scrollIntoViewIfNeeded();
  await caption('Das Abfrageergebnis: Meldebild, Alarmstichwort und Info-Bausteine.', 3200);
  if (await cw.getByTestId('dias-mismatch').count()) {
    await caption('Achtung: Diese Ergebnisseite wurde im DIAS-Mitschnitt über einen anderen Weg aufgezeichnet. LEITWARTE warnt deshalb – ich prüfe das Stichwort selbst.', 5200);
  }
  await click(cw.getByTestId('dias-apply'), 1200);
  await caption('Übernommen: Stichwort, Meldebild als Alarmierungstext und der Abfrageweg als Hinweis.', 3000);
}
g = await state();
call = g.runtime.calls.find((c) => c.id === callId);
const kwCode = g.center.keywords.find((k) => k.id === call.keywordId)?.code;
if (kwCode !== 'FEU 00 Y') {
  await caption(`Für einen Wohnungsbrand mit eingeschlossener Person passt „FEU 00 Y“ – ich korrigiere das Stichwort (DIAS lieferte ${kwCode ?? 'keins'}).`, 3600);
  const kw = g.center.keywords.find((k) => k.code === 'FEU 00 Y');
  await click(cw.getByTestId('keyword-select'), 300);
  await cw.getByTestId('keyword-select').selectOption(kw.id);
  await sleep(1200);
}
await ask('Gibt es Verletzte? Wie viele?');
await caption('Alles da – Einsatz anlegen (Strg+Enter).', 1800);
await click(cw.getByTestId('create-incident'), 1500);

const im = page.getByTestId('incident-window');
await im.waitFor();
await im.getByTestId('group-row').first().waitFor();
await caption('Einsatzmittelvorschlag: Freiwillige Feuerwehren stehen als Alarmgruppe drin – die Wehr entscheidet selbst, mit welchen Fahrzeugen sie ausrückt.', 4800);
await im.getByTestId('group-row').first().scrollIntoViewIfNeeded();
await page.mouse.move(1150, 380, { steps: 20 });
await sleep(1800);
await caption('Alarmieren!', 1200);
await click(im.getByTestId('alarm-button'), 1500);
g = await state();
const inc = g.runtime.incidents[g.runtime.incidents.length - 1];
const groupLog = inc.log.filter((l) => l.text.startsWith('Alarmgruppe')).map((l) => l.text);
await caption(groupLog[0] ? groupLog[0] : 'Alarmgruppen alarmiert.', 4200);
await caption('Ich lasse die Zeit schneller laufen (30×) und warte auf die Rückmeldung der Wehr …', 2400);
await click(page.getByRole('button', { name: '30×' }), 300);
await click(page.getByTestId('play-pause'), 300);
await page.waitForFunction((id) => window.leitwarte.state.runtime.radio.some((r) => r.incidentId === id && r.text.includes('rückt aus mit')), inc.id, { timeout: 120000 });
g = await state();
const report = g.runtime.radio.find((r) => r.incidentId === inc.id && r.text.includes('rückt aus mit'));
const v = g.center.vehicles.find((x) => x.id === report.vehicleId);
await caption(`Funk: ${v.callsign} – „${report.text}“`, 4200);
await click(page.getByRole('button', { name: 'Zur Karte ✕' }), 600);
await caption('Auf der Karte: Die Fahrzeuge fahren über echte Straßen (OSRM) zum Einsatzort.', 6000);
await page.waitForFunction((id) => window.leitwarte.state.runtime.incidents.find((i) => i.id === id)?.firstArrivalAt, inc.id, { timeout: 180000 }).catch(() => null);
await caption('Erstes Fahrzeug am Einsatzort (Status 4). Ende des Testdurchlaufs.', 4000);
await caption('', 500);

const video = page.video();
await context.close();
await browser.close();
server.kill('SIGTERM');
const raw = await video.path();
const offset = Math.max(0, (demoStart - t0) / 1000 - 0.3);
const mp4 = `${OUT}leitwarte-testdurchlauf.mp4`;
const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', offset.toFixed(2), '-i', raw, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '24', '-preset', 'veryfast', '-movflags', '+faststart', mp4]);
if (ff.status === 0) console.log(`Video: ${mp4}`);
else {
  renameSync(raw, `${OUT}leitwarte-testdurchlauf.webm`);
  console.log(`ffmpeg fehlgeschlagen – Rohvideo: ${OUT}leitwarte-testdurchlauf.webm`);
}
process.exit(0);
