/**
 * End-to-End-Test im echten Browser (Chromium über Playwright).
 *
 * Externe Dienste:
 *  - Overpass (OSM-Daten) und Nominatim (Kreisgrenze) werden mit echten, gespeicherten OSM-Daten
 *    beantwortet (e2e/fixtures), damit der Test offline und reproduzierbar läuft.
 *  - Routing: Läuft unter OSRM_URL (Standard http://localhost:5000) ein OSRM-Server, wird er genutzt
 *    und geprüft, dass Fahrzeuge echte Straßenrouten fahren. Sonst wird das übersprungen und gemeldet.
 *
 * Aufruf: npm run build && npm run test:e2e
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync, readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
function loadPlaywright() {
  for (const p of [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright'].filter(Boolean)) {
    try {
      return require(p);
    } catch {
      /* nächster Kandidat */
    }
  }
  throw new Error('Playwright nicht gefunden. Installieren mit: npm i -D playwright');
}
const { chromium } = loadPlaywright();

const PORT = 4173;
const BASE = `http://localhost:${PORT}/`;
const OSRM = process.env.OSRM_URL ?? 'http://localhost:5000';
const shots = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(shots, { recursive: true });
const overpassFixture = readFileSync(new URL('./fixtures/overpass-ostholstein-sued.json', import.meta.url), 'utf8');
const boundary = JSON.parse(readFileSync(new URL('../src/data/ostholstein/boundary.json', import.meta.url), 'utf8'));

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
const stop = () => server.kill('SIGTERM');
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      /* noch nicht bereit */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Server startet nicht');
}

async function osrmAvailable() {
  try {
    const r = await fetch(`${OSRM}/route/v1/driving/10.68,53.92;10.70,53.93?overview=false`);
    return r.ok && (await r.json()).code === 'Ok';
  } catch {
    return false;
  }
}

const nav = (page, name) => page.getByRole('navigation', { name: 'Bereiche' }).getByRole('button', { name, exact: true }).click();
let step = 0;
const log = (m) => console.log(`✓ ${++step}. ${m}`);
function assert(c, m) {
  if (!c) throw new Error(`Prüfung fehlgeschlagen: ${m}`);
}

let pageRef = null;
async function main() {
  await waitForServer();
  const withOsrm = await osrmAvailable();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 } });
  pageRef = page;
  const errors = [];
  page.on('pageerror', (e) => errors.push(`${e.message} @ ${(e.stack || '').split('\n').slice(0, 4).join(' | ')}`));
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()));
  await page.route('**/tile.openstreetmap.org/**', (r) => r.abort());
  let overpassCalls = 0;
  await page.route('**/api/interpreter', (r) => {
    overpassCalls++;
    r.fulfill({ status: 200, contentType: 'application/json', body: overpassFixture });
  });
  // Hauptserver fällt aus ("Failed to fetch" im Browser) – das Spiel muss auf einen anderen Server ausweichen
  let overpassMainFailed = 0;
  await page.route('https://overpass-api.de/**', (r) => {
    overpassMainFailed++;
    return r.abort('failed');
  });
  await page.route('**/nominatim.openstreetmap.org/**', (r) =>
    r.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        osm_type: 'relation',
        osm_id: boundary.osmRelationId,
        category: 'boundary',
        name: boundary.name,
        address: { county: boundary.name, state: boundary.state },
        geojson: { type: 'MultiPolygon', coordinates: boundary.polygons.map((p) => p.map((ring) => ring.map(([lat, lng]) => [lng, lat]))) },
      }),
    }),
  );
  await page.addInitScript((url) => localStorage.setItem('leitwarte.prefs', JSON.stringify({ routingUrl: url, routingEnabled: true, sound: false })), OSRM);
  const game = () => page.evaluate(() => window.leitwarte.state);

  await page.goto(BASE);
  await page.getByTestId('start-screen').waitFor();
  log('Startbildschirm geladen');

  // ------------------------------------------------------------------ Assistent "Leitstelle erstellen"
  await page.getByTestId('new-empty').click();
  await page.getByTestId('create-wizard').waitFor();
  await page.getByPlaceholder('z. B. IRLS Süd').fill('IRLS Test');
  await page.getByTestId('wizard-next').click();
  const map = page.getByTestId('county-map');
  const box = await map.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.getByText('Kreis Ostholstein hinzugefügt.').waitFor({ timeout: 10000 });
  log('Landkreis per Klick gewählt – echte Kreisgrenze Ostholstein angezeigt');
  await page.getByTestId('wizard-next').click();
  assert(await page.getByTestId('wizard-next').isDisabled(), 'Weiter ohne Funkrufgruppen gesperrt');
  const names = page.getByLabel('Name der Funkrufgruppe');
  const codes = page.getByLabel('Kürzel der Funkrufgruppe');
  for (let i = 0; i < (await names.count()); i++) {
    await names.nth(i).fill(`Gruppe ${i + 1}`);
    await codes.nth(i).fill(`GR_${i + 1}`);
  }
  await page.getByTestId('wizard-next').click();
  await page.getByRole('button', { name: 'Kartendaten laden' }).click();
  await page.getByText(/Einsatzorte geladen/).waitFor({ timeout: 30000 });
  await page.getByTestId('wizard-next').click();
  await page.getByTestId('wizard-create').click();
  await page.getByTestId('desk').waitFor();
  let g = await game();
  assert(g.center.areas[0].osmRelationId === 27025, 'Kreis übernommen');
  assert(g.center.stations.length > 10 && g.center.hospitals.length >= 1, 'reale Wachen/Kliniken übernommen');
  assert(g.center.places.places.length > 1000, 'OSM-Einsatzorte gespeichert');
  assert(g.center.organizations.every((o) => o.radioGroup.code), 'Funkrufgruppen gesetzt');
  assert(overpassMainFailed > 0, 'Ausfall des Overpass-Hauptservers simuliert');
  log(`Overpass-Hauptserver nicht erreichbar – Daten über Ausweichserver geladen (${overpassMainFailed} Fehlversuche)`);
  log(`Eigene Leitstelle erstellt: ${g.center.stations.length} reale Standorte, ${g.center.places.places.length} Einsatzorte`);
  await page.getByRole('button', { name: 'Beenden' }).click();
  await page.getByTestId('start-screen').waitFor();

  // ------------------------------------------------------------------ Beispielleitstelle Ostholstein
  await page.getByTestId('new-sample').click();
  await page.getByTestId('desk').waitFor({ timeout: 30000 });
  g = await game();
  assert(g.center.vehicles.length > 30, 'Fahrzeuge verteilt');
  assert(g.center.vehicles.every((v) => g.center.organizations.some((o) => o.id === v.organizationId)), 'Fahrzeuge mit Organisation/Funkrufgruppe');
  log(`Beispielleitstelle Ostholstein: ${g.center.stations.length} Standorte, ${g.center.vehicles.length} Fahrzeuge (Overpass-Abfragen: ${overpassCalls})`);
  assert((await page.getByRole('navigation', { name: 'Bereiche' }).getByRole('button', { name: /Personal/ }).count()) === 0, 'Personal-Menü entfernt');
  log('Personal-Menü ist entfernt');

  // ------------------------------------------------------------------ Notruf → Einsatzmaske
  await nav(page, 'Simulation');
  await page.getByRole('tab', { name: /Szenariokatalog/ }).click();
  await page.getByPlaceholder('Szenarien suchen …').fill('Türöffnung');
  await page.getByRole('row', { name: /Türöffnung/ }).first().getByRole('button', { name: 'Auslösen' }).click();
  await nav(page, 'Leitstand');
  await page.getByTestId('call-item').first().waitFor();
  await page.keyboard.press('n');
  const mask = page.getByTestId('call-window');
  await mask.waitFor();
  log('Notruf angenommen – Einsatzmaske öffnet sich');
  g = await game();
  const call = g.runtime.calls.find((c) => c.state === 'in_abfrage');
  assert(call.location.street && call.location.houseNumber, `Türöffnung an echter Wohnadresse (${call.location.address})`);
  log(`Einsatzort ist eine echte Wohnadresse: ${call.location.address} (${call.location.detail})`);
  await mask.getByRole('button', { name: /Wo genau ist der Notfallort/ }).click();
  await mask.getByRole('button', { name: /Personen in Gefahr/ }).click();
  // Ortung
  await mask.getByTestId('locate').click();
  await page.getByRole('button', { name: '10×' }).click();
  await page.getByTestId('play-pause').click();
  await page.waitForFunction(() => {
    const c = window.leitwarte.state.runtime.calls.find((x) => x.state === 'in_abfrage');
    return c && c.locate && c.locate.status !== 'laeuft';
  });
  await page.getByTestId('play-pause').click();
  g = await game();
  const loc = g.runtime.calls.find((c) => c.state === 'in_abfrage').locate;
  log(`Ortung (${call.phoneType}): ${loc.message}`);
  // Adresse eintippen (wie vom Anrufer genannt) – mit Straßenvorschlag
  await mask.getByTestId('street-input').fill(call.location.street.slice(0, 5));
  await mask.locator('.suggest-item', { hasText: call.location.street }).first().click();
  await mask.getByLabel('Hausnummer').fill(call.location.houseNumber);
  await mask.getByText('✓ Adresse gefunden').waitFor();
  log('Adresse mit Straßenvorschlag eingetragen und gefunden');
  const hint = mask.getByRole('button', { name: 'übernehmen', exact: true });
  if (await hint.count()) await hint.click();
  await page.screenshot({ path: `${shots}01-einsatzmaske-notruf.png` });
  await mask.getByTestId('create-incident').click();
  const im = page.getByTestId('incident-window');
  await im.waitFor();
  g = await game();
  const inc = g.runtime.incidents[0];
  assert(Math.abs(inc.position[0] - inc.truePosition[0]) < 1e-4, 'Einsatz an der richtigen Position');
  log('Einsatz angelegt – Maske zeigt Dispoliste, Maßnahmen, Rückmeldungen');

  // ------------------------------------------------------------------ Alarm + Routing
  await im.getByTestId('group-row').first().waitFor();
  await page.screenshot({ path: `${shots}02a-alarmgruppen.png` });
  await im.getByTestId('alarm-button').click();
  {
    const st = await page.evaluate(() => {
      const s = window.leitwarte.state;
      const i = s.runtime.incidents[0];
      return { groupLog: i.log.some((l) => l.text.startsWith('Alarmgruppe ')), vehicles: i.activeVehicleIds.length };
    });
    assert(st.groupLog && st.vehicles > 0, 'Freiwillige Feuerwehr über Alarmgruppe alarmiert');
    log(`Alarmierung: Freiwillige Feuerwehr über Alarmgruppe, ${st.vehicles} Fahrzeuge gebunden`);
  }
  await page.getByRole('button', { name: '30×' }).click();
  await page.getByTestId('play-pause').click();
  if (withOsrm) {
    await page.waitForFunction(() => window.leitwarte.state.center.vehicles.some((v) => v.rt.move && v.rt.move.routed && v.rt.move.path && v.rt.move.path.length > 5), null, { timeout: 30000 });
    g = await game();
    const mv = g.center.vehicles.find((v) => v.rt.move && v.rt.move.routed).rt.move;
    log(`Fahrzeug fährt echte Straßenroute (OSRM): ${mv.path.length} Stützpunkte`);
  } else {
    log('OSRM nicht erreichbar – Straßenrouting im Browser NICHT geprüft (Fahrzeuge fahren Näherung)');
  }
  await page.screenshot({ path: `${shots}02-einsatz-dispoliste.png` });
  await page.getByRole('button', { name: 'Zur Karte ✕' }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${shots}03-karte-routen.png` });
  await page.getByTestId('incident-item').first().click();
  await im.waitFor();

  let closed = false;
  // schlanke Abfrage statt des kompletten Spielzustands (der enthält tausende OSM-Orte)
  const incState = (id) =>
    page.evaluate((iid) => {
      const s = window.leitwarte.state;
      const i = s.runtime.incidents.find((x) => x.id === iid);
      return i ? { state: i.state, active: i.activeVehicleIds.map((v) => s.center.vehicles.find((x) => x.id === v).rt.status) } : null;
    }, id);
  for (let i = 0; i < 900 && !closed; i++) {
    await page.waitForTimeout(150);
    const cur = await incState(inc.id);
    if (!cur) {
      closed = true;
      break;
    }
    // Sprechwünsche (Status 5) erst ansprechen – dann ist der Inhalt bekannt
    const call = im.getByRole('button', { name: 'Ansprechen' });
    if (await call.count()) await call.first().click();
    const target = im.getByRole('button', { name: 'Ziel zuweisen' });
    if (await target.count()) await target.first().click();
    const ack = im.getByRole('button', { name: 'Quittieren' });
    if (await ack.count()) await ack.first().click();
    // Nachforderungen der Kräfte vor Ort disponieren (Vorschlag übernehmen und alarmieren)
    if (i % 20 === 10 && cur.state !== 'abarbeitung_beendet') {
      await im.getByRole('button', { name: 'Vorschlag', exact: true }).click();
      const alarm = im.getByTestId('alarm-button');
      if (await alarm.isEnabled()) await alarm.click();
    }
    if (cur.state === 'abarbeitung_beendet') {
      const releasable = cur.active.some((st) => !['transport', 'am_ziel'].includes(st));
      if (releasable) await im.getByRole('button', { name: 'Alle entlassen' }).click();
      else if (cur.active.length === 0) await page.getByTestId('close-incident').click();
    }
  }
  if (!closed) console.log('Einsatzzustand:', JSON.stringify(await page.evaluate((iid) => { const s = window.leitwarte.state; const i = s.runtime.incidents.find((x) => x.id === iid); return i && { state: i.state, kw: s.center.keywords.find((k) => k.id === i.keywordId)?.code, needs: i.needs, work: [i.workDoneMs, i.workTotalMs], pats: i.patients.map((p) => p.state), active: i.activeVehicleIds.map((v) => s.center.vehicles.find((x) => x.id === v).rt.status), log: i.log.slice(-5).map((l) => l.text) }; }, inc.id)));
  assert(closed, 'Einsatz abgeschlossen');
  g = await game();
  const arch = g.runtime.archive.find((a) => a.id === inc.id);
  assert(arch, 'Einsatz im Archiv');
  log('Einsatz vollständig abgearbeitet und archiviert');
  await page.getByTestId('play-pause').click();

  // ------------------------------------------------------------------ Speichern/Laden
  await page.getByRole('button', { name: 'Beenden' }).click();
  await page.getByTestId('start-screen').waitFor();
  await page.getByRole('row', { name: /Ostholstein/ }).first().getByRole('button', { name: 'Laden' }).click();
  await page.getByTestId('desk').waitFor();
  g = await game();
  assert(g.runtime.archive.length >= 1 && g.center.places.places.length > 1000, 'Spielstand inkl. OSM-Daten wieder geladen');
  log('Leitstelle gespeichert und aus IndexedDB wieder geladen');

  // ------------------------------------------------------------------ Zweiter Bildschirm (Zweitfenster)
  await page.locator('summary', { hasText: 'Fenster' }).click();
  const [pop] = await Promise.all([page.waitForEvent('popup'), page.getByTestId('popout-fahrzeuge').click()]);
  pop.on('pageerror', (e) => errors.push(`Zweitfenster: ${e.message}`));
  await pop.getByTestId('vehicle-row').first().waitFor({ timeout: 10000 });
  await pop.getByTestId('vehicle-row').first().click();
  const vid = await page.evaluate(() => window.leitwarte.state.center.vehicles.find((v) => v.rt.status === 'frei_wache')?.id);
  await pop.getByRole('button', { name: 'Status 6 – außer Dienst' }).click();
  await page.waitForFunction(() => window.leitwarte.state.center.vehicles.some((v) => v.rt.status === 'ausser_dienst' && v.rt.breakdownUntil === -1), null, { timeout: 5000 });
  log('Zweitfenster „Fahrzeugstatus“: Befehl (Status 6) wird im Hauptfenster ausgeführt');
  const [pop2] = await Promise.all([page.waitForEvent('popup'), (async () => {
    await page.locator('summary', { hasText: 'Fenster' }).click();
    await page.getByTestId('popout-einsaetze').click();
  })()]);
  await nav(page, 'Simulation');
  await page.getByRole('tab', { name: /Szenariokatalog/ }).click();
  await page.getByPlaceholder('Szenarien suchen …').fill('Ölspur');
  await page.getByRole('row', { name: /Ölspur/ }).first().getByRole('button', { name: 'Auslösen' }).click();
  await nav(page, 'Leitstand');
  await pop2.getByTestId('call-item').first().waitFor({ timeout: 10000 });
  await pop2.getByTestId('call-item').first().click();
  await page.getByTestId('call-window').waitFor({ timeout: 5000 });
  await pop.screenshot({ path: `${shots}04-zweitfenster.png` });
  log('Zweitfenster „Notrufe & Einsätze“: Klick öffnet die Einsatzmaske im Hauptfenster');
  void vid;

  // ------------------------------------------------------------------ Sprachtest (ohne Mikrofon: Texteingabe)
  await nav(page, 'Sprachtest');
  const vt = page.getByTestId('voice-test');
  await vt.getByTestId('voice-consent').waitFor();
  assert(await vt.getByTestId('voice-consent-ok').isDisabled(), 'Sprachtest erst nach Einwilligung');
  await vt.getByLabel(/Nur Texteingabe/).check();
  await vt.getByTestId('voice-consent-check').check();
  await vt.getByTestId('voice-consent-ok').click();
  await vt.getByTestId('voice-start').click();
  await vt.getByLabel('Anrufer vorlesen').uncheck();
  const say = async (t) => {
    const before = await vt.locator('.voice-line.anrufer').count();
    await vt.getByTestId('voice-input').fill(t);
    await vt.getByTestId('voice-send').click();
    await vt.locator('.voice-line.anrufer').nth(before).waitFor();
    return vt.locator('.voice-line.anrufer').nth(before).innerText();
  };
  const r1 = await say('Notruf Feuerwehr und Rettungsdienst, wo genau ist der Notfallort?');
  const am = /([^!?.]*?\S) (\S+), (\d{5}) ([^–.]+?)(?: – |\.|$)/.exec(r1.replace(/^Anrufer\s*/, ''));
  assert(am, `Anrufer nennt die Adresse (${r1})`);
  const r2 = await say('Sind noch Personen in der Wohnung?');
  assert(/drin|draußen/.test(r2), `Anrufer antwortet auf Personenfrage (${r2})`);
  await say('In welchem Stockwerk?');
  await say('Ist jemand verletzt?');
  log(`Sprachtest: simulierter Anrufer antwortet aus den Fakten (${am[2] ? `${am[1].split(' ').slice(-3).join(' ')} ${am[2]}` : ''})`);
  // Disponent trägt selbst ein – nichts wird automatisch übernommen
  assert((await vt.getByTestId('street-input').inputValue()) === '', 'Keine automatische Übernahme in die Maske');
  // wie ein Disponent: nur den Straßennamen aus dem Satz nehmen (Füllwörter und Einleitung weglassen)
  let street = am[1].split(/[,–!?.…]\s*/).pop().trim();
  while (/^(das ist|wir sind hier|also|äh|ähm|ja|hier|meine güte|oh gott|ach gott)\s+/i.test(street)) street = street.replace(/^(das ist|wir sind hier|also|äh|ähm|ja|hier|meine güte|oh gott|ach gott)\s+/i, '');
  await vt.getByTestId('street-input').fill(street);
  await vt.getByLabel('Hausnummer').fill(am[2]);
  await vt.getByLabel('Ort', { exact: true }).fill(am[4].trim());
  await vt.getByLabel('Personen in Gefahr').selectOption('ja');
  await vt.getByLabel('Verletzte').fill('1');
  const kwId = await page.evaluate(() => window.leitwarte.state.center.keywords.find((k) => k.code === 'FEU 00 Y').id);
  await vt.getByTestId('keyword-select').selectOption(kwId);
  await vt.getByTestId('voice-end').click();
  const evalText = await vt.getByTestId('voice-evaluation').innerText();
  assert(/Straße\s*\n?\s*\S/.test(evalText) && /Auswertung: \d+ von \d+/.test(evalText), 'Auswertung angezeigt');
  const score = /Auswertung: (\d+) von (\d+)/.exec(evalText);
  await page.screenshot({ path: `${shots}05-sprachtest.png` });
  log(`Sprachtest: Auswertung ${score[1]} von ${score[2]} Punkten, Transkript gespeichert`);
  if (score[1] !== score[2]) console.log(evalText);
  assert(Number(score[1]) >= Number(score[2]) - 1, `Auswertung fast vollständig richtig (${evalText})`);
  await vt.getByTestId('voice-history').waitFor();
  const stored = await page.evaluate(() => localStorage.getItem('leitwarte.sprachtest.transkripte'));
  assert(stored && stored.includes('Notfallort'), 'Transkript liegt im localStorage');
  await vt.getByTestId('voice-delete').first().click();
  await vt.getByText('Keine Transkripte gespeichert.').waitFor();
  await vt.getByTestId('voice-withdraw').click();
  await page.getByRole('button', { name: 'Widerrufen', exact: true }).click();
  await vt.getByTestId('voice-consent').waitFor();
  assert((await page.evaluate(() => localStorage.getItem('leitwarte.sprachtest.einwilligung'))) === null, 'Einwilligung widerrufen');
  log('Sprachtest: Transkript gelöscht, Einwilligung widerrufen');

  // ------------------------------------------------------------------ DIAS-Notrufabfrage (lokal importiert)
  const diasFile = process.env.DIAS_FILE ?? new URL('./fixtures/dias-test.json', import.meta.url).pathname;
  await nav(page, 'Daten & Einstellungen');
  await page.getByTestId('dias-file').setInputFiles(diasFile);
  await page.getByTestId('dias-status').waitFor({ timeout: 30000 });
  log(`DIAS importiert: ${(await page.getByTestId('dias-status').innerText()).split('·')[0].trim()}`);
  await nav(page, 'Simulation');
  await page.getByRole('tab', { name: /Szenariokatalog/ }).click();
  await page.getByPlaceholder('Szenarien suchen …').fill('Küchenbrand');
  await page.getByRole('row', { name: /Küchenbrand/ }).first().getByRole('button', { name: 'Auslösen' }).click();
  await nav(page, 'Leitstand');
  await page.getByTestId('call-item').first().waitFor();
  await page.getByTestId('call-item').first().click();
  const cw = page.getByTestId('call-window');
  await cw.waitFor();
  if (await cw.getByRole('button', { name: /Notruf annehmen/ }).count()) await cw.getByRole('button', { name: /Notruf annehmen/ }).click();
  await cw.getByTestId('dias-question').waitFor();
  if (process.env.DIAS_FILE) {
    // echter Export: Fachrichtung Brand, dann jeweils die erste mögliche Antwort
    await cw.getByTestId('dias-option').filter({ hasText: /Brandschutz/ }).first().click();
    for (let i = 0; i < 40 && !(await cw.getByTestId('dias-result').count()); i++) {
      if (!(await cw.getByTestId('dias-question').count())) break;
      await cw.locator('[data-testid="dias-option"]:not([disabled])').first().click();
    }
  } else {
    await cw.getByTestId('dias-option').filter({ hasText: 'Feuer' }).click();
    // Tastatur: Antwortcode 0 = Wohnung
    await cw.locator('.dias-body').focus();
    await page.keyboard.press('0');
    await cw.getByText('Sind noch Menschen in Gefahr?').waitFor();
    await cw.getByTestId('dias-option').filter({ hasText: 'Ja' }).click();
  }
  const diasRes = cw.getByTestId('dias-result');
  if (await diasRes.count()) {
    await page.screenshot({ path: `${shots}06-dias.png` });
    await cw.getByTestId('dias-apply').click();
    const callState = await page.evaluate(() => {
      const s = window.leitwarte.state;
      const c = s.runtime.calls.find((x) => x.state === 'in_abfrage');
      return { kw: s.center.keywords.find((k) => k.id === c.keywordId)?.code ?? null, info: c.mask.info, remarks: c.mask.remarks };
    });
    if (!process.env.DIAS_FILE) {
      assert(callState.kw === 'FEU 00 Y', `DIAS-Stichwort FEU Y → FEU 00 Y übernommen (${callState.kw})`);
      assert(callState.info === 'Wohnungsbrand mit Menschen in Gefahr' && /Notrufabfrage: Feuer \/ Technische Hilfe, Wohnung, Ja/.test(callState.remarks), 'Meldebild und Infotext übernommen');
    }
    log(`DIAS durchgeklickt: Ergebnis „${callState.info}“ → Stichwort ${callState.kw ?? '(selbst wählen)'}`);
    if (!process.env.DIAS_FILE) {
      // Lücke im Mitschnitt: Freitext-Schritt → LEITWARTE-Folgefragen → LEITWARTE-Ergebnis
      await cw.getByRole('button', { name: 'Neu', exact: true }).click();
      await cw.getByTestId('dias-option').filter({ hasText: 'Medizinischer Notfall' }).click();
      await cw.getByTestId('lw-input').waitFor();
      await cw.getByTestId('lw-text').fill('Sturz von der Leiter');
      await cw.getByTestId('lw-next').click();
      for (let i = 0; i < 10 && !(await cw.getByTestId('lw-result').count()); i++) await cw.getByTestId('lw-option').first().click();
      await cw.getByTestId('lw-apply').click();
      await page.waitForFunction(() => {
        const c = window.leitwarte.state.runtime.calls.find((x) => x.state === 'in_abfrage');
        return c && /LEITWARTE-Ergänzung/.test(c.mask.remarks) && /Sturz von der Leiter/.test(c.mask.remarks);
      });
      // ausgegraute Antwort (ohne aufgezeichnete Folgeseite) ist klickbar
      await cw.getByRole('button', { name: 'Neu', exact: true }).click();
      await cw.getByTestId('dias-option').filter({ hasText: 'Feuer' }).click();
      await cw.getByTestId('dias-option').filter({ hasText: 'Mülltonne' }).click();
      await cw.getByTestId('lw-note').waitFor();
      for (let i = 0; i < 10 && !(await cw.getByTestId('lw-result').count()); i++) await cw.getByTestId('lw-option').first().click();
      const lwKw = (await cw.getByTestId('lw-result').innerText()).match(/Stichwort:\s*(\S+(?: \S+)*?)\s{2,}|Stichwort:\s*([^\n]+)/);
      log(`DIAS-Lücken: Freitext und Antwort ohne Folgeseite → LEITWARTE-Folgefragen und Ergebnis (${(lwKw?.[1] ?? lwKw?.[2] ?? '').trim()})`);
    }
  } else {
    await page.screenshot({ path: `${shots}06-dias.png` });
    log('DIAS durchgeklickt: Pfad endet an einem im Mitschnitt unvollständigen Schritt');
  }

  assert(errors.length === 0, `Keine JavaScript-Fehler im Browser: ${errors.join(' | ')}`);
  log('Keine JavaScript-Fehler in der Konsole');
  await browser.close();
}

main()
  .then(() => {
    console.log('\nE2E: alle Schritte erfolgreich.');
    stop();
    process.exit(0);
  })
  .catch(async (e) => {
    console.error(`\n✗ ${e.message}`);
    if (pageRef) {
      await pageRef.screenshot({ path: `${shots}fehler.png` }).catch(() => {});
      console.error((await pageRef.locator('body').innerText().catch(() => '')).slice(0, 1200));
    }
    stop();
    process.exit(1);
  });
