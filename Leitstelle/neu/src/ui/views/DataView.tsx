import { useEffect, useState } from 'react';
import type { GameState } from '../../model/types';
import { projects, snapshots, type SnapshotRecord } from '../../persistence/db';
import { exportCenter, exportGame, validateStoredGame } from '../../persistence/schema';
import { importKeywordsCsv, importStationsCsv, importVehiclesCsv, type CsvResult } from '../../persistence/csv';
import { store, useStore } from '../../store/gameStore';
import { newId } from '../../model/ids';
import { confirmDialog, downloadFile, fmtDateTime, Modal, readFile } from '../components/common';
import { setPrefs, usePrefs } from '../prefs';
import { sounds, speak, ttsAvailable } from '../audio';
import { HelpModal } from '../App';
import { testRouting } from '../routingService';
import { importDias, removeDias, useDias } from '../../dias/store';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]+/gi, '-').replace(/^-|-$/g, '');

export function DataView({ game }: { game: GameState }) {
  const project = useStore((s) => s.project)!;
  const [snaps, setSnaps] = useState<SnapshotRecord[] | null>(null);
  const [snapName, setSnapName] = useState('');
  const [name, setName] = useState(project.name);
  const [csv, setCsv] = useState<{ title: string; r: CsvResult } | null>(null);
  const [help, setHelp] = useState(false);
  const prefs = usePrefs();
  const [routeTest, setRouteTest] = useState<string | null>(null);

  const refresh = () => snapshots.listFor(project.id).then(setSnaps).catch(() => setSnaps([]));
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  const loadSnap = async (s: SnapshotRecord) => {
    if (!(await confirmDialog(`Spielstand "${s.name}" laden? Der aktuelle Spielverlauf wird ersetzt (vorher ggf. selbst sichern).`, { confirmLabel: 'Laden' }))) return;
    const { game: g, issues } = validateStoredGame(s.state);
    if (!g) return store.toast('fehler', `Spielstand beschädigt: ${issues.map((i) => i.message).join('; ')}`);
    store.replaceState(g);
    store.toast('ok', `Spielstand "${s.name}" geladen.`);
  };

  const importCsv = async (kind: 'wachen' | 'fahrzeuge' | 'stichwoerter') => {
    const text = await readFile('.csv,text/csv,text/plain');
    if (text === null) return;
    let result: CsvResult = { added: 0, errors: [] };
    store.edit((c, g) => {
      result = kind === 'wachen' ? importStationsCsv(c, text) : kind === 'fahrzeuge' ? importVehiclesCsv(c, text, g.runtime.clock.now) : importKeywordsCsv(c, text);
    });
    setCsv({ title: `CSV-Import ${kind}`, r: result });
  };

  return (
    <div className="page page-narrow col" style={{ gap: 14 }}>
      <div className="card col">
        <h3>Leitstelle & Speichern</h3>
        <div className="row wrap">
          <label className="field grow">
            <span>Name dieses Spielstands / Projekts</span>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <button className="btn" disabled={!name.trim() || name === project.name} onClick={() => store.rename(name)} style={{ alignSelf: 'flex-end' }}>Umbenennen</button>
        </div>
        <div className="row wrap">
          <button className="btn primary" onClick={() => void store.save().then((ok) => ok && store.toast('ok', 'Gespeichert.'))}>Jetzt speichern</button>
          <button
            className="btn"
            onClick={async () => {
              const now = Date.now();
              await projects.put({ id: newId('proj'), name: `${project.name} (Kopie)`, createdAt: now, updatedAt: now, state: game });
              store.toast('ok', 'Kopie angelegt – sie erscheint in der Leitstellenauswahl.');
            }}
          >
            Als Kopie speichern
          </button>
          <span className="small muted">Automatisches Speichern alle 20 s (Echtzeit) in diesem Browser; automatische Spielstände alle 10 min.</span>
        </div>
      </div>

      <div className="card col">
        <h3>Spielstände</h3>
        <div className="row">
          <input type="text" placeholder="Name des Spielstands" value={snapName} onChange={(e) => setSnapName(e.target.value)} className="grow" />
          <button
            className="btn primary"
            onClick={async () => {
              await store.snapshot(snapName.trim() || `Spielstand ${fmtDateTime(game.runtime.clock.now)}`);
              setSnapName('');
              void refresh();
            }}
          >
            Spielstand anlegen
          </button>
        </div>
        <table className="grid">
          <thead>
            <tr><th>Name</th><th>Art</th><th>Spielzeit</th><th>Gespeichert</th><th></th></tr>
          </thead>
          <tbody>
            {(snaps ?? []).map((s) => (
              <tr key={s.id}>
                <td>{s.name}</td>
                <td>{s.kind}</td>
                <td className="mono small">{fmtDateTime(s.simTime)}</td>
                <td className="small">{new Date(s.createdAt).toLocaleString('de-DE')}</td>
                <td className="right nowrap">
                  <button className="btn small" onClick={() => loadSnap(s)}>Laden</button>{' '}
                  <button className="btn small" onClick={() => downloadFile(`leitwarte-spielstand-${slug(s.name)}.json`, JSON.stringify(exportGame(s.state), null, 1))}>Export</button>{' '}
                  <button
                    className="btn small danger"
                    onClick={async () => {
                      if (await confirmDialog(`Spielstand "${s.name}" löschen?`, { confirmLabel: 'Löschen' })) {
                        await snapshots.delete(s.id);
                        void refresh();
                      }
                    }}
                  >
                    Löschen
                  </button>
                </td>
              </tr>
            ))}
            {snaps && snaps.length === 0 && <tr><td colSpan={5} className="empty">Noch keine Spielstände.</td></tr>}
          </tbody>
        </table>
      </div>

      <div className="card col">
        <h3>Export & Import</h3>
        <div className="row wrap">
          <button className="btn" onClick={() => downloadFile(`leitwarte-leitstelle-${slug(game.center.name)}.json`, JSON.stringify(exportCenter(game.center), null, 1))}>Leitstelle exportieren (JSON)</button>
          <button className="btn" onClick={() => downloadFile(`leitwarte-spielstand-${slug(project.name)}.json`, JSON.stringify(exportGame(game), null, 1))}>Aktuellen Spielstand exportieren (JSON)</button>
        </div>
        <div className="small muted">Das Format ist versioniert und in <span className="mono">docs/DATENFORMAT.md</span> beschrieben. JSON-Dateien importierst du in der Leitstellenauswahl (Menü „Beenden“) als neue Leitstelle.</div>
        <h4>CSV-Import in diese Leitstelle</h4>
        <div className="row wrap">
          <button className="btn" onClick={() => importCsv('wachen')}>Wachen (CSV) …</button>
          <button className="btn" onClick={() => importCsv('fahrzeuge')}>Fahrzeuge (CSV) …</button>
          <button className="btn" onClick={() => importCsv('stichwoerter')}>Stichwörter + AAO (CSV) …</button>
        </div>
        <pre className="small muted" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>
{`Wachen:       name;art;organisation;lat;lng;adresse;ausrueckzeit;stellplaetze
Fahrzeuge:    funkrufname;typ;wache;kennung;ausstattung
Stichwörter:  code;bezeichnung;kategorie;prioritaet;bedarf   (bedarf z. B. loeschen:2|rtw:1)`}
        </pre>
      </div>

      <DiasCard />

      <div className="card col">
        <h3>Persönliche Einstellungen (dieser Browser)</h3>
        <label className="check"><input type="checkbox" checked={prefs.sound} onChange={(e) => setPrefs({ sound: e.target.checked })} /> Signaltöne (Notruf, Alarm, Funk)</label>
        <label className="row small">Lautstärke <input type="range" min={0} max={1} step={0.05} value={prefs.volume} onChange={(e) => setPrefs({ volume: Number(e.target.value) })} /> <button className="btn small" onClick={() => sounds.ring()}>Test</button></label>
        <label className="check">
          <input type="checkbox" checked={prefs.tts} disabled={!ttsAvailable()} onChange={(e) => setPrefs({ tts: e.target.checked })} /> Funkmeldungen vorlesen (Sprachausgabe des Browsers)
          {!ttsAvailable() && <span className="dim small">– in diesem Browser nicht verfügbar</span>}
        </label>
        {prefs.tts && <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => speak('Florian Bergstadt eins sechsundvierzig eins, Status vier.')}>Sprachausgabe testen</button>}
        <label className="check"><input type="checkbox" checked={prefs.mapDark} onChange={(e) => setPrefs({ mapDark: e.target.checked })} /> Dunkle Kartendarstellung</label>
        <h4 style={{ marginTop: 8 }}>Straßenrouting (OSRM)</h4>
        <label className="check"><input type="checkbox" checked={prefs.routingEnabled} onChange={(e) => setPrefs({ routingEnabled: e.target.checked })} /> Echte Straßenrouten verwenden (sonst Luftlinien-Näherung)</label>
        <div className="row wrap">
          <input type="text" value={prefs.routingUrl} onChange={(e) => setPrefs({ routingUrl: e.target.value.trim() })} style={{ width: 280 }} aria-label="Adresse des OSRM-Servers" />
          <button className="btn small" onClick={async () => setRouteTest(await testRouting(prefs.routingUrl))}>Verbindung testen</button>
          {routeTest && <span className={`small ${routeTest.startsWith('OK') ? '' : 'field-error'}`}>{routeTest}</span>}
        </div>
        <span className="dim small">Lokaler, kostenloser OSRM-Server – Einrichtung mit Docker siehe docs/ROUTING.md.</span>
        <div className="row">
          <button className="btn small" onClick={() => setHelp(true)}>Tastaturkürzel anzeigen</button>
          <button
            className="btn small"
            onClick={() => {
              try {
                localStorage.removeItem('leitwarte.layout');
              } catch {
                /* ignorieren */
              }
              store.toast('ok', 'Fensteraufteilung zurückgesetzt (wirkt beim nächsten Öffnen des Leitstands).');
            }}
          >
            Fensteraufteilung zurücksetzen
          </button>
        </div>
      </div>

      {help && <HelpModal onClose={() => setHelp(false)} />}
      {csv && (
        <Modal title={csv.title} onClose={() => setCsv(null)} footer={<button className="btn" onClick={() => setCsv(null)}>OK</button>}>
          <div className={csv.r.added ? 'hint' : 'warnbox'}>{csv.r.added} Einträge importiert.</div>
          {csv.r.errors.length > 0 && (
            <ul className="small" style={{ margin: 0, paddingLeft: 18, maxHeight: 300, overflow: 'auto' }}>
              {csv.r.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </Modal>
      )}
    </div>
  );
}

/** Import der standardisierten Notrufabfrage (DIAS-Export) – bleibt nur in diesem Browser */
function DiasCard() {
  const { tree, ready } = useDias();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    setError(null);
    try {
      const t = await importDias(await f.text());
      store.toast('ok', `Notrufabfrage importiert: ${t.stats.nodes} Schritte, ${t.stats.results} Ergebnisse.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card col" data-testid="dias-card">
      <h3>Notrufabfrage (DIAS)</h3>
      <div className="small muted">
        Lade hier deinen Export der standardisierten Notrufabfrage (JSON). Er wird nur in diesem Browser gespeichert und ist nicht Teil von LEITWARTE. Beim Annehmen eines Notrufs
        zeigt die Einsatzmaske dann die Abfrage: Du stellst die Fragen selbst, klickst die Antworten an und übernimmst am Ende Stichwort, Meldebild und Infotext.
      </div>
      {!ready ? (
        <div className="small muted">Lade …</div>
      ) : tree ? (
        <div className="small" data-testid="dias-status">
          Importiert: <b>{tree.stats.nodes}</b> Abfrageschritte, <b>{tree.stats.results}</b> Ergebnisse
          {tree.stats.incomplete > 0 && <> ({tree.stats.incomplete} Schritte im Mitschnitt unvollständig)</>} · Quelle {tree.source} · Stand {tree.capturedAt.slice(0, 10) || 'unbekannt'}
        </div>
      ) : (
        <div className="small muted">Noch keine Notrufabfrage importiert.</div>
      )}
      <div className="row wrap">
        <label className="btn">
          {busy ? 'Importiere …' : tree ? 'Neue Datei importieren …' : 'DIAS-Datei importieren …'}
          <input type="file" accept=".json,application/json" hidden disabled={busy} data-testid="dias-file" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {tree && (
          <button
            className="btn danger"
            onClick={async () => {
              if (await confirmDialog('Importierte Notrufabfrage aus diesem Browser löschen?', { confirmLabel: 'Löschen', danger: true })) await removeDias();
            }}
          >
            Löschen
          </button>
        )}
      </div>
      {error && <div className="field-error small">{error}</div>}
    </div>
  );
}
