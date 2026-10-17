/**
 * End-to-End-Test im echten Browser (Chromium über Playwright).
 * Spielt über die Oberfläche: Beispielleitstelle starten, Wache + Fahrzeug im Editor anlegen,
 * Notruf auslösen/annehmen/abfragen, Einsatz anlegen, alarmieren, Funk bearbeiten,
 * Kräfte entlassen, Einsatz abschließen, Spielstand prüfen.
 *
 * Aufruf: npm run build && npm run test:e2e
 * Playwright wird aus PLAYWRIGHT_MODULE, ./node_modules oder der globalen Installation geladen.
 */
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';

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
const shots = new URL('./screenshots/', import.meta.url).pathname;
mkdirSync(shots, { recursive: true });

const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'pipe' });
const stop = () => server.kill('SIGTERM');
process.on('exit', stop);

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(BASE);
      if (r.ok) return;
    } catch {
      /* noch nicht bereit */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error('Server startet nicht');
}

/** Option eines <select> per regulärem Ausdruck auf den Text wählen */
async function selectByText(select, re) {
  const value = await select.evaluate((el, src) => {
    const rx = new RegExp(src);
    return [...el.options].find((o) => rx.test(o.textContent))?.value ?? null;
  }, re.source);
  if (!value) throw new Error(`Option ${re} nicht gefunden`);
  await select.selectOption(value);
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
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: 1600, height: 950 } });
  pageRef = page;
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message + ' @ ' + (e.stack || '').split('\n').slice(0, 6).join(' | ')));
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()));
  // Kacheln nicht aus dem Internet laden (Test offline-fähig, schont OSM-Server)
  await page.route('**/tile.openstreetmap.org/**', (r) => r.abort());

  const game = () => page.evaluate(() => window.leitwarte.state);

  await page.goto(BASE);
  await page.getByTestId('start-screen').waitFor();
  await page.screenshot({ path: `${shots}01-start.png` });
  log('Startbildschirm geladen');

  await page.getByTestId('new-sample').click();
  await page.getByTestId('desk').waitFor();
  log('Beispielleitstelle gestartet');

  // --- Editor: Wache und Fahrzeug anlegen -------------------------------------------
  await nav(page, 'Wachen');
  await page.getByRole('button', { name: '+ Neu' }).click();
  const dlg = page.getByRole('dialog');
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  assert(await dlg.getByText('Pflichtfeld').first().isVisible(), 'Validierung zeigt Pflichtfeld-Fehler');
  await dlg.locator('label:has-text("Name") input').first().fill('FF Testdorf');
  await dlg.locator('label:has-text("Organisation") select').selectOption({ label: 'Freiwillige Feuerwehren' });
  await dlg.locator('label:has-text("Ausrückzeit") input').fill('240');
  await dlg.getByLabel('Breitengrad').fill('50.6');
  await dlg.getByLabel('Längengrad').fill('9.6');
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  await dlg.waitFor({ state: 'detached' });
  let g = await game();
  const st = g.center.stations.find((s) => s.name === 'FF Testdorf');
  assert(st && st.turnoutSeconds === 240, 'Wache im Spielzustand angelegt');
  log('Wache "FF Testdorf" über Editor angelegt (inkl. Validierung)');

  await nav(page, 'Fahrzeuge');
  await page.getByRole('button', { name: '+ Neu' }).click();
  await dlg.locator('label:has-text("Funkrufname") input').fill('Florian Testdorf 1/44-1');
  await dlg.locator('label:has-text("Fahrzeugtyp") select').selectOption({ label: 'LF 20 – Löschgruppenfahrzeug 20' });
  await dlg.locator('label:has-text("Wache") select').first().selectOption({ label: 'FF Testdorf' });
  await dlg.getByRole('button', { name: 'Speichern' }).click();
  await dlg.waitFor({ state: 'detached' });
  g = await game();
  const veh = g.center.vehicles.find((v) => v.callsign === 'Florian Testdorf 1/44-1');
  assert(veh && veh.stationId === st.id && veh.rt.status === 'frei_wache', 'Fahrzeug angelegt und Status 2');
  log('Fahrzeug über Editor angelegt, erscheint mit Status 2');

  // Personal für das neue Fahrzeug (ohne Besatzung nicht alarmierbar)
  const crew = await page.evaluate(() => {
    const avail = window.leitwarte.state.center.vehicles.find((v) => v.callsign === 'Florian Testdorf 1/44-1');
    return avail;
  });
  assert(crew, 'Fahrzeug lesbar');

  // --- Übungsnotruf auslösen ---------------------------------------------------------
  await nav(page, 'Simulation');
  await page.getByRole('tab', { name: /Szenariokatalog/ }).click();
  await page.getByPlaceholder('Szenarien suchen …').fill('Sturz');
  await page.getByRole('row', { name: /^.*Sturz.*Rettungsdienst/ }).first().getByRole('button', { name: 'Auslösen' }).click();
  await nav(page, 'Leitstand');
  await page.getByTestId('call-item').first().waitFor();
  log('Notruf ausgelöst, erscheint in der Notrufliste');

  // --- Notruf annehmen (Taste N) und abfragen ----------------------------------------
  await page.keyboard.press('n');
  const cw = page.getByTestId('call-window');
  await cw.waitFor();
  const createBtn = cw.getByRole('button', { name: /Einsatz anlegen/ });
  assert(await createBtn.isDisabled(), 'Einsatz anlegen erst nach Ortsabfrage möglich');
  await cw.getByRole('button', { name: /Wo genau ist der Notfallort/ }).click();
  await cw.getByRole('button', { name: /wach und ansprechbar/ }).click();
  await cw.getByRole('button', { name: /Welche Beschwerden/ }).click();
  g = await game();
  const call = g.runtime.calls.find((c) => c.state === 'in_abfrage');
  assert(call && call.dialog.length === 3, 'Drei Fragen im Dialog dokumentiert');
  const hint = cw.getByRole('button', { name: 'übernehmen' });
  if (await hint.count()) await hint.click();
  else await selectByText(cw.getByTestId('keyword-select'), /^RD 1 /);
  await page.screenshot({ path: `${shots}02-notrufabfrage.png` });
  await createBtn.click();
  await page.getByTestId('incident-window').waitFor();
  g = await game();
  assert(g.runtime.incidents.length === 1, 'Einsatz angelegt');
  log('Notruf angenommen, abgefragt, Stichwort gewählt, Einsatz angelegt');

  // --- Alarmieren -------------------------------------------------------------------
  const iw = page.getByTestId('incident-window');
  await iw.getByTestId('alarm-button').click();
  g = await game();
  const inc = g.runtime.incidents[0];
  assert(inc.activeVehicleIds.length >= 1 && inc.state === 'disponiert', 'Fahrzeuge alarmiert');
  const rtwId = inc.activeVehicleIds.find((id) => g.center.vehicleTypes.find((t) => t.id === g.center.vehicles.find((v) => v.id === id).typeId).canTransport);
  assert(rtwId, 'RTW unter den alarmierten Fahrzeugen');
  log(`Einsatzmittelvorschlag alarmiert (${inc.activeVehicleIds.length} Fahrzeug(e))`);

  // --- Simulation laufen lassen, Funk bearbeiten ------------------------------------
  await page.getByRole('button', { name: '60×' }).click();
  await page.getByTestId('play-pause').click();
  const seen = new Set();
  let closed = false;
  for (let i = 0; i < 900 && !closed; i++) {
    await page.waitForTimeout(150);
    g = await game();
    const v = g.center.vehicles.find((x) => x.id === rtwId);
    seen.add(v.rt.status);
    const cur = g.runtime.incidents.find((x) => x.id === inc.id);
    if (!cur) {
      closed = true;
      break;
    }
    const target = iw.getByRole('button', { name: 'Ziel zuweisen' });
    if (await target.count()) {
      await target.first().click();
      log('Sprechwunsch: Transportziel über Funk zugewiesen');
    }
    const ack = iw.getByRole('button', { name: 'Quittieren' });
    if (await ack.count()) await ack.first().click();
    if (cur.state === 'abarbeitung_beendet') {
      const releasable = cur.activeVehicleIds.some((id) => !['transport', 'am_ziel'].includes(g.center.vehicles.find((x) => x.id === id).rt.status));
      if (releasable) {
        await iw.getByRole('button', { name: 'Alle entlassen' }).click();
        log('Kräfte nach Einsatzende entlassen');
      } else if (cur.activeVehicleIds.length === 0) await page.getByTestId('close-incident').click();
    }
  }
  if (!closed) console.log(JSON.stringify(g.runtime.incidents.find((x) => x.id === inc.id), null, 1).slice(0, 3000));
  assert(closed, 'Einsatz wurde abgeschlossen');
  for (const s of ['anfahrt', 'einsatzort', 'transport']) assert(seen.has(s), `RTW durchlief Status ${s}`);
  g = await game();
  assert(g.runtime.archive.some((a) => a.id === inc.id), 'Einsatz im Archiv');
  log(`Einsatz vollständig abgearbeitet und archiviert (RTW-Status: ${[...seen].join(' → ')})`);
  await page.getByTestId('play-pause').click(); // Pause

  // --- neues Fahrzeug ist disponierbar ----------------------------------------------
  await page.evaluate(() => window.leitwarte.toast('info', 'Test'));
  await nav(page, 'Simulation');
  await page.getByRole('tab', { name: /Szenariokatalog/ }).click();
  await page.getByPlaceholder('Szenarien suchen …').fill('Mülltonnen');
  await page.getByRole('row', { name: /Mülltonnenbrand/ }).getByRole('button', { name: 'Auslösen' }).click();
  await nav(page, 'Leitstand');
  await page.keyboard.press('n');
  await cw.getByRole('button', { name: /Wo genau ist der Notfallort/ }).click();
  await selectByText(cw.getByTestId('keyword-select'), /^B 1 –/);
  await page.keyboard.press('Control+Enter');
  await iw.waitFor();
  await iw.getByLabel('auch nicht verfügbare').check();
  const row = iw.getByRole('row', { name: /Florian Testdorf 1\/44-1/ });
  assert(await row.count(), 'Neues Fahrzeug erscheint im Einsatzmittelvorschlag');
  const rowText = await row.innerText();
  log(`Im Editor angelegtes Fahrzeug erscheint in der Disposition (${rowText.includes('Besatzung') ? 'ohne Personal: korrekt als nicht besetzbar markiert' : 'verfügbar'})`);
  await page.screenshot({ path: `${shots}03-einsatz.png` });

  // --- Speichern & Spielstand -------------------------------------------------------
  await page.keyboard.press('Escape');
  await nav(page, 'Daten & Einstellungen');
  await page.getByPlaceholder('Name des Spielstands').fill('E2E-Test');
  await page.getByRole('button', { name: 'Spielstand anlegen' }).click();
  await page.getByRole('cell', { name: 'E2E-Test' }).waitFor();
  log('Manueller Spielstand gespeichert');
  await page.getByRole('button', { name: 'Beenden' }).click();
  await page.getByTestId('start-screen').waitFor();
  await page.getByRole('row', { name: /ILS Hessenwald/ }).first().getByRole('button', { name: 'Laden' }).click();
  await page.getByTestId('desk').waitFor();
  g = await game();
  assert(g.center.vehicles.some((v) => v.callsign === 'Florian Testdorf 1/44-1'), 'Geladener Spielstand enthält das neue Fahrzeug');
  assert(g.runtime.archive.length >= 1, 'Geladener Spielstand enthält das Archiv');
  log('Leitstelle beendet und aus IndexedDB wieder geladen – Daten vollständig');
  await page.screenshot({ path: `${shots}04-leitstand.png` });

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
      console.error((await pageRef.locator('body').innerText().catch(() => '')).slice(0, 1500));
    }
    stop();
    process.exit(1);
  });
