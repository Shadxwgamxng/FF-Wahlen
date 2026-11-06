import { StyleSwitch } from '../components/StyleSwitch';
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
import { neuralAvailable } from '../neuralVoice';
import { speakAs } from '../../voice/speech';
import { testLlm } from '../../voice/llm';
import { currentQuota, EL_MODELS, forgetElevenLabs, onQuota, refreshQuota, testElevenLabs, type Quota } from '../elevenLabs';
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
    if (!(await confirmDialog(`Spielstand "${s.name}" laden? Aktueller Verlauf wird ersetzt.`, { confirmLabel: 'Laden' }))) return;
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
            <span>Projektname</span>
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
              store.toast('ok', 'Kopie angelegt.');
            }}
          >
            Als Kopie speichern
          </button>
          <span className="small muted">Autosave 20 s · Auto-Spielstand 10 min</span>
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
        <div className="small muted">Format: <span className="mono">docs/DATENFORMAT.md</span></div>
        <h4>CSV-Import</h4>
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
        <h3>Arbeitsplatz</h3>
        <label className="check"><input type="checkbox" checked={prefs.sound} onChange={(e) => setPrefs({ sound: e.target.checked })} /> Signaltöne</label>
        <label className="row small">Lautstärke <input type="range" min={0} max={1} step={0.05} value={prefs.volume} onChange={(e) => setPrefs({ volume: Number(e.target.value) })} /> <button className="btn small" onClick={() => sounds.ring()}>Telefon</button> <button className="btn small" onClick={() => sounds.radio()}>Sprechwunsch</button></label>
        <label className="check"><input type="checkbox" checked={prefs.funkHorn} onChange={(e) => setPrefs({ funkHorn: e.target.checked })} /> Martinshorn im Hintergrund, wenn Fahrzeuge auf Einsatzfahrt funken</label>
        <label className="check">
          <input type="checkbox" checked={prefs.tts} disabled={!ttsAvailable()} onChange={(e) => setPrefs({ tts: e.target.checked })} /> Funksprüche vorlesen (TTS)
          {!ttsAvailable() && <span className="dim small">(nicht verfügbar)</span>}
        </label>
        {prefs.tts && <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => speak('Florian Bergstadt eins sechsundvierzig eins, Status vier.')}>Sprachausgabe testen</button>}
        <VoiceSettings />
        <StyleSwitch />
        <label className="check"><input type="checkbox" checked={prefs.mapDark} onChange={(e) => setPrefs({ mapDark: e.target.checked })} /> Karte dunkel (Modern)</label>
        <h4 style={{ marginTop: 8 }}>Straßenrouting (OSRM)</h4>
        <label className="check"><input type="checkbox" checked={prefs.routingEnabled} onChange={(e) => setPrefs({ routingEnabled: e.target.checked })} /> Straßenrouting aktiv</label>
        <div className="row wrap">
          <input type="text" value={prefs.routingUrl} onChange={(e) => setPrefs({ routingUrl: e.target.value.trim() })} style={{ width: 280 }} aria-label="Adresse des OSRM-Servers" />
          <button className="btn small" onClick={async () => setRouteTest(await testRouting(prefs.routingUrl))}>Verbindung testen</button>
          {routeTest && <span className={`small ${routeTest.startsWith('OK') ? '' : 'field-error'}`}>{routeTest}</span>}
        </div>
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
              store.toast('ok', 'Fensteraufteilung zurückgesetzt.');
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
      store.toast('ok', `DIAS importiert: ${t.stats.nodes} Schritte, ${t.stats.results} Ergebnisse.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="card col" data-testid="dias-card">
      <h3>Notrufabfrage (DIAS)</h3>
      {!ready ? (
        <div className="small muted">Lade …</div>
      ) : tree ? (
        <div className="small" data-testid="dias-status">
          Schritte <b>{tree.stats.nodes}</b> · Ergebnisse <b>{tree.stats.results}</b>
          {tree.stats.incomplete > 0 && <> ({tree.stats.incomplete} unvollständig)</>} · Quelle {tree.source} · Stand {tree.capturedAt.slice(0, 10) || 'unbekannt'}
        </div>
      ) : (
        <div className="small muted">Nicht importiert.</div>
      )}
      <div className="row wrap">
        <label className="btn">
          {busy ? 'Importiere …' : tree ? 'Neu importieren …' : 'Importieren …'}
          <input type="file" accept=".json,application/json" hidden disabled={busy} data-testid="dias-file" onChange={(e) => void onFile(e.target.files?.[0])} />
        </label>
        {tree && (
          <button
            className="btn danger"
            onClick={async () => {
              if (await confirmDialog('Notrufabfrage löschen?', { confirmLabel: 'Löschen', danger: true })) await removeDias();
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

/** Stimmen, Geräusche und optionale lokale KI */
function VoiceSettings() {
  const prefs = usePrefs();
  const [neural, setNeural] = useState<boolean | null>(null);
  const [llmTest, setLlmTest] = useState('');
  useEffect(() => {
    void neuralAvailable().then(setNeural);
  }, []);
  const probe = (emotion: 0 | 1 | 2, channel: 'telefon' | 'funk') =>
    void speakAs(
      channel === 'funk' ? 'Florian Ostholstein zweiundvierzig achtundvierzig eins, Status drei.' : ['Ja, guten Tag … hier ist Hahn. Bei uns riecht es so komisch im Keller.', 'Hallo? Ja – bei uns brennt es in der Küche, der Rauch kommt schon raus!', 'Hallo?! Bitte, schnell – mein Mann atmet nicht mehr! Bitte!'][emotion],
      { rate: 1, pitch: 1, emotion, personality: emotion === 0 ? 'aelter' : 'aufgeregt', voiceSeed: `probe-${emotion}-${Date.now() % 7}` },
      undefined,
      channel,
    );
  return (
    <div className="col" style={{ gap: 4, marginTop: 6 }} data-testid="voice-settings">
      <h4>Stimmen</h4>
      <label className="check">
        <input type="checkbox" checked={prefs.neuralVoices} onChange={(e) => setPrefs({ neuralVoices: e.target.checked })} /> Natürliche Stimmen (offline, kostenlos)
        <span className={`small ${neural === false ? 'field-error' : 'dim'}`}>{neural === null ? '' : neural ? '· Stimmdateien gefunden' : '· Stimmdateien fehlen (public/voices) – Browserstimme'}</span>
      </label>
      <label className="check"><input type="checkbox" checked={prefs.callerVoice} onChange={(e) => setPrefs({ callerVoice: e.target.checked })} /> Anrufer antworten hörbar (auch beim Abfragen per Klick)</label>
      <label className="check"><input type="checkbox" checked={prefs.ambience} onChange={(e) => setPrefs({ ambience: e.target.checked })} /> Geräusche beim Anrufer (Rauchmelder, Straße, Wind …)</label>
      <div className="row wrap">
        <span className="small muted">Hörprobe:</span>
        <button className="btn small" onClick={() => probe(0, 'telefon')}>ruhig</button>
        <button className="btn small" onClick={() => probe(1, 'telefon')}>aufgeregt</button>
        <button className="btn small" onClick={() => probe(2, 'telefon')}>Panik</button>
        <button className="btn small" onClick={() => probe(0, 'funk')}>Funk</button>
      </div>
      <ElevenLabsSettings />
      <h4 style={{ marginTop: 6 }}>Lokale KI für Anruferantworten (optional)</h4>
      <label className="check"><input type="checkbox" checked={prefs.llmEnabled} onChange={(e) => setPrefs({ llmEnabled: e.target.checked })} /> Antworten beim Freisprechen frei formulieren lassen (Ollama auf diesem PC)</label>
      <div className="row wrap">
        <input type="text" value={prefs.llmUrl} onChange={(e) => setPrefs({ llmUrl: e.target.value.trim() })} style={{ width: 220 }} aria-label="Adresse von Ollama" />
        <input type="text" value={prefs.llmModel} onChange={(e) => setPrefs({ llmModel: e.target.value.trim() })} style={{ width: 140 }} aria-label="KI-Modell" />
        <button className="btn small" onClick={async () => setLlmTest(await testLlm({ url: prefs.llmUrl, model: prefs.llmModel }))}>Verbindung testen</button>
        {llmTest && <span className={`small ${llmTest.startsWith('OK') ? '' : 'field-error'}`}>{llmTest}</span>}
      </div>
      <span className="dim small">Einmalig: Ollama von ollama.com installieren und „ollama pull {prefs.llmModel}“ ausführen. Ohne Ollama antworten die Anrufer wie bisher.</span>
    </div>
  );
}

/** ElevenLabs: eigener Schlüssel, Modell, Guthaben */
function ElevenLabsSettings() {
  const prefs = usePrefs();
  const [key, setKey] = useState('');
  const [test, setTest] = useState('');
  const [quota, setQuotaState] = useState<Quota | null>(currentQuota());
  useEffect(() => {
    const off = onQuota(setQuotaState);
    if (prefs.elevenKey) void refreshQuota();
    return () => {
      off();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const left = quota ? Math.max(0, quota.limit - quota.used) : null;
  return (
    <div className="col" style={{ gap: 4, marginTop: 6 }} data-testid="elevenlabs-settings">
      <h4>ElevenLabs (optional, eigenes Konto)</h4>
      {prefs.elevenKey ? (
        <div className="row wrap">
          <span className="small">Schlüssel eingetragen ({prefs.elevenKey.slice(0, 4)}…)</span>
          <button className="btn small" onClick={forgetElevenLabs}>Schlüssel entfernen</button>
        </div>
      ) : (
        <form
          className="row wrap"
          onSubmit={(e) => {
            e.preventDefault();
            if (!key.trim()) return;
            setPrefs({ elevenKey: key.trim() });
            setKey('');
            void testElevenLabs().then(setTest);
          }}
        >
          <input type="password" value={key} onChange={(e) => setKey(e.target.value)} placeholder="API-Schlüssel von elevenlabs.io" autoComplete="off" style={{ width: 280 }} aria-label="ElevenLabs-Schlüssel" />
          <button className="btn small" type="submit">Speichern</button>
        </form>
      )}
      <label className="row small">
        Modell
        <select value={prefs.elevenModel} onChange={(e) => setPrefs({ elevenModel: e.target.value })} aria-label="ElevenLabs-Modell">
          {EL_MODELS.map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
      </label>
      <div className="row wrap">
        <button className="btn small" disabled={!prefs.elevenKey} onClick={async () => setTest(await testElevenLabs())}>Verbindung testen</button>
        {test && <span className={`small ${test.startsWith('OK') ? '' : 'field-error'}`}>{test}</span>}
      </div>
      {quota && left !== null && (
        <div className="small" data-testid="elevenlabs-quota">
          Guthaben: <b>{left.toLocaleString('de-DE')}</b> von {quota.limit.toLocaleString('de-DE')} Zeichen
          {quota.resetAt ? ` · neues Guthaben am ${new Date(quota.resetAt).toLocaleDateString('de-DE')}` : ''}
          {left < 500 && <span className="field-error"> · fast aufgebraucht – es sprechen die Piper-Stimmen</span>}
        </div>
      )}
      <span className="dim small">
        Mit Schlüssel sprechen Anrufer und Funk mit ElevenLabs-Stimmen; gesendet wird nur der Text, der gesprochen werden soll. Schon erzeugte Sätze werden gespeichert und nicht erneut berechnet. Ist das Guthaben aufgebraucht oder keine Verbindung da, sprechen automatisch wieder die Piper-Stimmen.
      </span>
    </div>
  );
}

