/**
 * Ende-zu-Ende-Test LAN-Betrieb: Ein PC-Browser (Leitstand) und ein Tablet (eigener Browser-Kontext
 * = eigenes Gerät, eigener Speicher) über den LAN-Server.
 *  - Tablet zeigt ohne Notruf den Funkbedienplatz, mit Notruf die Notrufabfrage (DIAS)
 *  - Klicks auf dem Tablet erscheinen in der Einsatzmaske am PC, "Daten übernehmen" füllt die Maske
 *  - Funkmeldungen der gewählten Rufgruppe lassen sich am Tablet quittieren
 * Aufruf: npm run build && npm run test:lan
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
      /* nächster Kandidat */
    }
  }
  throw new Error('Playwright nicht gefunden.');
})();

const PORT = 4175;
const BASE = `http://localhost:${PORT}`;
const overpassFixture = readFileSync(new URL('./fixtures/overpass-ostholstein-sued.json', import.meta.url), 'utf8');
const diasFile = new URL('./fixtures/dias-test.json', import.meta.url).pathname;

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

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const errors = [];
const watch = (page, who) => {
  page.on('pageerror', (e) => errors.push(`${who}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(`${who}: ${m.text()}`));
};
try {
  const pcCtx = await browser.newContext({ viewport: { width: 1600, height: 950 } });
  const tabCtx = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: false });
  const pc = await pcCtx.newPage();
  const tab = await tabCtx.newPage();
  watch(pc, 'PC');
  watch(tab, 'Tablet');
  await pc.route('**/api/interpreter', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: overpassFixture }));
  await pc.route('**/tile.openstreetmap.org/**', (r) => r.abort());
  await tab.route('**/tile.openstreetmap.org/**', (r) => r.abort());
  await pc.addInitScript(() => {
    localStorage.setItem('leitwarte.prefs', JSON.stringify({ routingEnabled: false, sound: false }));
    // Funk: Einwilligung und eine nachgebildete Spracherkennung (liefert window.__funkSpruch)
    localStorage.setItem('leitwarte.sprachtest.einwilligung', JSON.stringify({ version: 1, at: 1, mode: 'browserdienst' }));
    class FakeRecognition {
      start() {
        window.__srStarts = (window.__srStarts || 0) + 1;
        // Funk (Sendetaste, continuous) hört __funkSpruch, Freisprechen beim Notruf __anruferSpruch (einmalig)
        const text = this.continuous ? window.__funkSpruch || '' : window.__anruferSpruch || '';
        if (!this.continuous) window.__anruferSpruch = '';
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

  await pc.goto(`${BASE}/`);
  await pc.getByTestId('start-screen').waitFor();
  await tab.goto(`${BASE}/tablet`);
  assert(tab.url().includes('fenster=tablet'), '/tablet leitet auf die Tablet-Ansicht');
  await tab.getByTestId('tablet-waiting').waitFor();
  log('PC und Tablet über den LAN-Server geöffnet (Tablet wartet auf den Leitstand)');

  await pc.getByTestId('new-sample').click();
  await pc.getByTestId('desk').waitFor({ timeout: 60000 });
  await pc.getByRole('navigation', { name: 'Bereiche' }).getByRole('button', { name: 'Daten & Einstellungen', exact: true }).click();
  await pc.getByTestId('dias-file').setInputFiles(diasFile);
  await pc.getByTestId('dias-status').waitFor();
  await pc.getByRole('navigation', { name: 'Bereiche' }).getByRole('button', { name: 'Leitstand', exact: true }).click();
  await tab.getByTestId('funkbedienplatz').waitFor({ timeout: 15000 });
  assert((await tab.getByTestId('rufgruppe').count()) >= 3, 'Rufgruppen am Tablet');
  log(`Tablet ohne Notruf: Funkbedienplatz mit ${await tab.getByTestId('rufgruppe').count()} Rufgruppen`);

  // Notruf am PC annehmen
  const callId = await pc.evaluate(() => {
    const s = window.leitwarte;
    s.cmd('injectScenarioCall', 'brand_kueche');
    const c = s.state.runtime.calls[s.state.runtime.calls.length - 1];
    s.cmd('acceptCall', c.id);
    return c.id;
  });
  await pc.getByTestId('call-item').first().click();
  await pc.getByTestId('call-window').getByTestId('dias-question').waitFor();
  await tab.getByTestId('dias-question').waitFor({ timeout: 15000 });
  log('Notruf am PC angenommen → Notrufabfrage erscheint auf dem Tablet (Abfrage vom PC übertragen)');

  // Freisprechen: Mikrofon am PC ist offen, der Anrufer antwortet auf das Gesagte
  await pc.getByTestId('call-window').getByTestId('freisprechen').waitFor({ timeout: 10000 });
  await pc.evaluate(() => (window.__anruferSpruch = 'Notruf Feuerwehr und Rettungsdienst, wo genau ist der Notfallort?'));
  await pc.waitForFunction((id) => window.leitwarte.state.runtime.calls.find((c) => c.id === id).dialog.some((d) => d.covers?.includes('ort')), callId, { timeout: 10000 });
  const spoken = await pc.evaluate((id) => {
    const c = window.leitwarte.state.runtime.calls.find((x) => x.id === id);
    return { answer: c.dialog.find((d) => d.covers?.includes('ort')).answer, street: c.location.street };
  }, callId);
  assert(spoken.answer.includes(spoken.street), `Anrufer nennt den Einsatzort (${spoken.answer})`);
  await pc.getByTestId('call-window').getByText(spoken.answer.slice(0, 30)).first().waitFor({ timeout: 5000 });
  log(`Freisprechen am PC: „Wo genau ist der Notfallort?“ → Anrufer: „${spoken.answer.slice(0, 90)}…“`);

  // Auf dem Tablet durchtippen
  await tab.getByTestId('dias-option').filter({ hasText: 'Feuer' }).tap();
  await tab.getByText('Was genau brennt?').waitFor();
  await tab.getByTestId('dias-option').filter({ hasText: 'Wohnung' }).tap();
  await tab.getByText('Sind noch Menschen in Gefahr?').waitFor();
  // Synchron am PC?
  await pc.getByTestId('call-window').getByText('Sind noch Menschen in Gefahr?').waitFor({ timeout: 10000 });
  log('Tablet-Antworten erscheinen sofort auch in der Einsatzmaske am PC');
  // Letzte Antwort am PC – erscheint am Tablet
  await pc.getByTestId('call-window').getByTestId('dias-option').filter({ hasText: 'Ja' }).click();
  await tab.getByTestId('dias-result').waitFor({ timeout: 10000 });
  log('… und umgekehrt: Antwort am PC → Ergebnis auf dem Tablet');

  await tab.getByTestId('dias-apply').tap();
  await pc.waitForFunction(
    (id) => {
      const s = window.leitwarte.state;
      const c = s.runtime.calls.find((x) => x.id === id);
      return c && s.center.keywords.find((k) => k.id === c.keywordId)?.code === 'FEU 00 Y' && c.mask.info === 'Wohnungsbrand mit Menschen in Gefahr' && /Notrufabfrage: Feuer/.test(c.mask.remarks);
    },
    callId,
    { timeout: 10000 },
  );
  const applyLabel = await tab.getByTestId('dias-apply').innerText();
  log(`Tablet „${applyLabel.split('\n')[0].trim()}“ → Stichwort, Meldebild und Infotext stehen am PC in der Maske`);
  // zweimal übernehmen darf keine doppelten Hinweise erzeugen
  await tab.getByTestId('dias-apply').tap();
  await pc.waitForTimeout(1200);
  const remarks = await pc.evaluate((id) => window.leitwarte.state.runtime.calls.find((x) => x.id === id).mask.remarks, callId);
  assert(remarks.split('\n').filter((l) => l.startsWith('Notrufabfrage:')).length === 1, 'keine doppelten Hinweise');

  // Einsatz anlegen und Feuerwehr alarmieren (am PC)
  const incId = await pc.evaluate((id) => {
    const s = window.leitwarte;
    s.cmd('askQuestion', id, 'ort');
    const r = s.cmd('createIncidentFromCall', id);
    return r.id;
  }, callId);
  assert(incId, 'Einsatz angelegt');
  await tab.getByTestId('funkbedienplatz').waitFor({ timeout: 10000 });
  log('Nach Ende der Abfrage schaltet das Tablet zurück auf den Funkbedienplatz');
  await pc.evaluate((id) => {
    const s = window.leitwarte;
    const st = s.state;
    const inc = st.runtime.incidents.find((i) => i.id === id);
    // Ausrücken meldet nur das Führungsfahrzeug (ELW/KdoW/MZF) der zuständigen Wehr
    const area = st.center.areas.find((a) => a.id === inc.areaId);
    const lead = (x) => st.center.vehicles.some((v) => v.stationId === x.id && /^(ELW|KdoW|MZF)/i.test(st.center.vehicleTypes.find((t) => t.id === v.typeId)?.code ?? ''));
    const isFf = (x) => st.center.organizations.find((o) => o.id === x.organizationId)?.kind === 'freiwillige_feuerwehr';
    const ff = st.center.stations.find((x) => isFf(x) && lead(x) && (!area?.responsibleStationIds.length || area.responsibleStationIds.includes(x.id)));
    s.cmd('alarmGroups', inc.id, [ff.id]);
    // Führungsfahrzeug der Wehr mit alarmieren (rückt sonst bei kleinem Bedarf nicht aus)
    const leadV = st.center.vehicles.find((v) => v.stationId === ff.id && /^(ELW|KdoW|MZF)/i.test(st.center.vehicleTypes.find((t) => t.id === v.typeId)?.code ?? ''));
    if (leadV && !leadV.rt.incidentId) s.cmd('alarmVehicles', inc.id, [leadV.id]);
    s.cmd('setSpeed', 60);
    s.cmd('toggleRunning');
  }, incId);
  await pc.waitForFunction((id) => window.leitwarte.state.runtime.radio.some((r) => r.incidentId === id && !r.handled && r.text.includes('rückt aus mit')), incId, { timeout: 60000 });
  await pc.evaluate(() => window.leitwarte.cmd('toggleRunning'));
  const group = await pc.evaluate((id) => {
    const st = window.leitwarte.state;
    const r = st.runtime.radio.find((x) => x.incidentId === id && x.text.includes('rückt aus mit'));
    const v = st.center.vehicles.find((x) => x.id === r.vehicleId);
    return (v.radioGroup?.code || st.center.organizations.find((o) => o.id === v.organizationId).radioGroup.code);
  }, incId);
  await tab.getByTestId('rufgruppe').filter({ hasText: group }).first().tap();
  const wish = tab.getByTestId('funk-meldung').filter({ hasText: 'Sprechwunsch' });
  await wish.first().waitFor({ timeout: 10000 });
  assert((await tab.getByTestId('funk-meldung').filter({ hasText: 'rückt aus mit' }).count()) === 0, 'Inhalt erst nach dem Ansprechen');
  log(`Rufgruppe ${group} geschaltet: Status 5 (Sprechwunsch) der Wehr erscheint am Tablet – Inhalt noch unbekannt`);

  // Sendetaste am Tablet halten – Erkennung läuft am PC, die Antwort kommt als Funkspruch zurück
  const callsign = await pc.evaluate((id) => {
    const st = window.leitwarte.state;
    const r = st.runtime.radio.find((x) => x.incidentId === id && x.text.includes('rückt aus mit'));
    const v = st.center.vehicles.find((x) => x.id === r.vehicleId);
    window.__funkSpruch = `${v.callsign} von Leitstelle, kommen`;
    return v.callsign;
  }, incId);
  const ptt = tab.getByTestId('ptt');
  const box = await ptt.boundingBox();
  await tab.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await tab.mouse.down();
  await pc.waitForFunction(() => window.leitwarte.funkStatus.sending, null, { timeout: 10000 });
  await tab.waitForTimeout(400);
  await tab.mouse.up();
  const reply = tab.getByTestId('funk-line').filter({ hasText: `Hier ${callsign}` });
  await reply.first().waitFor({ timeout: 10000 });
  const replyText = await reply.first().innerText();
  assert(/rückt aus mit/.test(replyText) && /kommen\.$/.test(replyText.trim()), `Antwort der Besatzung: ${replyText}`);
  log(`Sendetaste am Tablet → PC erkennt „${callsign} von Leitstelle, kommen“ → Besatzung antwortet: „${replyText.replace(/^\S+\s+/, '').trim()}“`);
  const msg = tab.getByTestId('funk-meldung').filter({ hasText: 'rückt aus mit' });
  await msg.first().waitFor({ timeout: 10000 });
  await msg.first().getByRole('button', { name: 'Quittieren' }).tap();
  await pc.waitForFunction((id) => !window.leitwarte.state.runtime.radio.some((r) => r.incidentId === id && !r.handled && r.text.includes('rückt aus mit')), incId, { timeout: 10000 });
  log('Am Tablet quittiert → Meldung ist am PC erledigt');
  await tab.screenshot({ path: new URL('./screenshots/tablet-funk.png', import.meta.url).pathname });

  assert(errors.length === 0, `Keine JavaScript-Fehler: ${errors.join(' | ')}`);
  log('Keine JavaScript-Fehler auf PC und Tablet');
  console.log('\nLAN-Test: alle Schritte erfolgreich.');
} catch (e) {
  console.error(`✗ ${e.message}`);
  if (errors.length) console.error('Konsole:', errors.join(' | '));
  process.exitCode = 1;
} finally {
  await browser.close();
  server.kill('SIGTERM');
}
