import { useEffect, useState } from 'react';
import { projects, type ProjectRecord } from '../../persistence/db';
import { importJson, validateStoredGame } from '../../persistence/schema';
import { createOstholsteinCenter, OSTHOLSTEIN } from '../../data/ostholstein';
import { overpassQueries, runOverpass } from '../../geo/osm';
import { poiQuery } from '../../geo/pois';
import type { OverpassElement } from '../../geo/places';
import { CreateWizard } from './CreateWizard';
import { store } from '../../store/gameStore';
import { newId } from '../../model/ids';
import { confirmDialog, fmtDateTime, Modal, readFile } from '../components/common';


export function StartScreen() {
  const [list, setList] = useState<ProjectRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [wizard, setWizard] = useState(false);
  const [sampleState, setSampleState] = useState<string | null>(null);

  const startSample = async () => {
    try {
      const all: OverpassElement[] = [];
      const qs = [...overpassQueries([OSTHOLSTEIN.osmRelationId]), poiQuery([OSTHOLSTEIN.osmRelationId])];
      for (let i = 0; i < qs.length; i++) {
        const label = `Lade OpenStreetMap-Daten: ${qs[i].label} (${i + 1}/${qs.length})`;
        setSampleState(`${label} …`);
        all.push(...(await runOverpass(qs[i].query, { onStatus: (t) => setSampleState(`${label} – ${t}`) })));
      }
      setSampleState('Baue Leitstelle auf …');
      await store.newProject(createOstholsteinCenter(all));
      store.setMode('spielen');
    } catch (e) {
      setSampleState(`Fehler: ${(e as Error).message}`);
    }
  };
  const [report, setReport] = useState<{ title: string; lines: string[] } | null>(null);

  const refresh = () =>
    projects
      .list()
      .then(setList)
      .catch((e) => setError(`Lokaler Speicher nicht verfügbar: ${(e as Error).message}. Spielstände können dann nicht gespeichert werden.`));
  useEffect(() => {
    void refresh();
  }, []);

  const open = (p: ProjectRecord, mode: 'spielen' | 'bearbeiten' = 'spielen') => {
    const { game, issues } = validateStoredGame(p.state);
    if (!game) return setReport({ title: 'Spielstand beschädigt', lines: issues.map((i) => `${i.path}: ${i.message}`) });
    if (issues.length) store.toast('info', `${issues.length} Datenproblem(e) beim Laden repariert.`);
    store.load({ ...p, state: game });
    store.setMode(mode);
  };

  const copy = async (p: ProjectRecord) => {
    const now = Date.now();
    await projects.put({ ...p, id: newId('proj'), name: `${p.name} (Kopie)`, createdAt: now, updatedAt: now });
    store.toast('ok', 'Leitstelle kopiert.');
    void refresh();
  };

  const remove = async (p: ProjectRecord) => {
    if (await confirmDialog(`Leitstelle "${p.name}" mit allen Spielständen endgültig löschen?`, { confirmLabel: 'Endgültig löschen' })) {
      await projects.delete(p.id);
      void refresh();
    }
  };

  const doImport = async () => {
    const text = await readFile('.json,application/json');
    if (text === null) return;
    const r = importJson(text);
    if (!r.ok) return setReport({ title: 'Import fehlgeschlagen – es wurden keine Daten verändert', lines: [r.error, ...r.issues.map((i) => `${i.path}: ${i.message}`)] });
    if (r.kind === 'leitstelle') await store.newProject(r.center);
    else {
      const now = Date.now();
      const rec: ProjectRecord = { id: newId('proj'), name: r.game.center.name, createdAt: now, updatedAt: now, state: r.game };
      await projects.put(rec);
      store.load(rec);
    }
    if (r.issues.length) setReport({ title: `Import mit ${r.issues.length} Korrektur(en)`, lines: r.issues.map((i) => `${i.path}: ${i.message}`) });
  };

  if (wizard) return <CreateWizard onCancel={() => setWizard(false)} />;

  return (
    <div className="start" data-testid="start-screen">
      <div className="hero">
        <h1>LEITWARTE</h1>
        <div className="muted">Leitstellen-Simulation für Feuerwehr, Rettungsdienst und Partnerorganisationen – Einzelspieler im Browser, Daten bleiben lokal.</div>
      </div>
      {error && <div className="errbox">{error}</div>}
      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        <div className="card col">
          <h3>Beispielleitstelle Ostholstein</h3>
          <div className="small muted grow">
            Echter Kreis Ostholstein mit echten Adressen, Feuerwehren, Rettungswachen und Kliniken aus OpenStreetMap. Die Fahrzeuge verteilt LEITWARTE selbst. Beim ersten Start werden die Kartendaten geladen (Internet nötig, ca. 1 Minute).
          </div>
          {sampleState && <div className={sampleState.startsWith('Fehler') ? 'errbox small' : 'infobox small'}>{sampleState}</div>}
          <button className="btn primary" disabled={Boolean(sampleState && !sampleState.startsWith('Fehler'))} onClick={startSample} data-testid="new-sample">
            Beispielleitstelle starten
          </button>
        </div>
        <div className="card col">
          <h3>Eigene Leitstelle</h3>
          <div className="small muted grow">Assistent: echte Landkreise per Klick wählen, Organisationen mit Funkrufgruppen, echte Adressen und reale Wachen/Kliniken aus OpenStreetMap übernehmen.</div>
          <button className="btn" onClick={() => setWizard(true)} data-testid="new-empty">Neue Leitstelle erstellen</button>
        </div>
        <div className="card col">
          <h3>Importieren</h3>
          <div className="small muted grow">Leitstelle oder Spielstand aus einer LEITWARTE-JSON-Datei laden. Beschädigte Einträge werden gemeldet und übersprungen.</div>
          <button className="btn" onClick={doImport}>JSON-Datei importieren …</button>
        </div>
      </div>

      <div className="card col" style={{ padding: 0 }}>
        <div className="panel-head"><h3 className="grow">Gespeicherte Leitstellen</h3></div>
        {list === null ? (
          <div className="empty">Lade …</div>
        ) : list.length === 0 ? (
          <div className="empty">Noch keine Leitstellen gespeichert.</div>
        ) : (
          <table className="grid">
            <thead>
              <tr>
                <th>Name</th>
                <th>Fahrzeuge</th>
                <th>Spielzeit</th>
                <th>Zuletzt gespielt</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.name}</b><div className="small dim">{p.state.center.name}</div></td>
                  <td>{p.state.center.vehicles.length}</td>
                  <td className="mono small">{fmtDateTime(p.state.runtime.clock.now)}</td>
                  <td className="small">{new Date(p.updatedAt).toLocaleString('de-DE')}</td>
                  <td className="right nowrap">
                    <button className="btn small primary" onClick={() => open(p)} data-testid="project-start">Starten</button>{' '}
                    <button className="btn small" onClick={() => open(p, 'bearbeiten')} data-testid="project-edit">Bearbeiten</button>{' '}
                    <button className="btn small" onClick={() => copy(p)}>Kopieren</button>{' '}
                    <button className="btn small danger" onClick={() => remove(p)}>Löschen</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="small dim">
        Kartendaten © OpenStreetMap-Mitwirkende. Fahrzeiten sind Näherungen ohne Verkehrsdaten. Mehrspieler ist in dieser Version noch nicht verfügbar.
      </div>

      {report && (
        <Modal title={report.title} onClose={() => setReport(null)} footer={<button className="btn" onClick={() => setReport(null)}>OK</button>}>
          <ul className="small" style={{ margin: 0, paddingLeft: 18, maxHeight: 400, overflow: 'auto' }}>
            {report.lines.map((l, i) => (
              <li key={i}>{l}</li>
            ))}
          </ul>
        </Modal>
      )}
    </div>
  );
}
