import { useEffect, useState } from 'react';
import { projects, type ProjectRecord } from '../../persistence/db';
import { importJson, validateStoredGame } from '../../persistence/schema';
import { createEmptyCenter, createSampleCenter } from '../../data/sampleCenter';
import { store } from '../../store/gameStore';
import { newId } from '../../model/ids';
import { confirmDialog, fmtDateTime, Modal, readFile } from '../components/common';

const SAMPLE = createSampleCenter();

export function StartScreen() {
  const [list, setList] = useState<ProjectRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState<string | null>(null);
  const [report, setReport] = useState<{ title: string; lines: string[] } | null>(null);

  const refresh = () =>
    projects
      .list()
      .then(setList)
      .catch((e) => setError(`Lokaler Speicher nicht verfügbar: ${(e as Error).message}. Spielstände können dann nicht gespeichert werden.`));
  useEffect(() => {
    void refresh();
  }, []);

  const open = (p: ProjectRecord) => {
    const { game, issues } = validateStoredGame(p.state);
    if (!game) return setReport({ title: 'Spielstand beschädigt', lines: issues.map((i) => `${i.path}: ${i.message}`) });
    if (issues.length) store.toast('info', `${issues.length} Datenproblem(e) beim Laden repariert.`);
    store.load({ ...p, state: game });
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

  return (
    <div className="start" data-testid="start-screen">
      <div className="hero">
        <h1>LEITWARTE</h1>
        <div className="muted">Leitstellen-Simulation für Feuerwehr, Rettungsdienst und Partnerorganisationen – Einzelspieler im Browser, Daten bleiben lokal.</div>
      </div>
      {error && <div className="errbox">{error}</div>}
      <div className="cards" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
        <div className="card col">
          <h3>Beispielleitstelle</h3>
          <div className="small muted grow">
            ILS Hessenwald (fiktiv): {SAMPLE.areas.length} Gemeinden, {SAMPLE.stations.length} Standorte, {SAMPLE.vehicles.length} Fahrzeuge, {SAMPLE.hospitals.length} Kliniken. Sofort spielbar.
          </div>
          <button className="btn primary" onClick={() => store.newProject(createSampleCenter())} data-testid="new-sample">Beispielleitstelle starten</button>
        </div>
        <div className="card col">
          <h3>Eigene Leitstelle</h3>
          <div className="small muted grow">Leere Leitstelle mit Standardkatalogen (Fahrzeugtypen, Stichwörter, AAO, Status). Wachen und Fahrzeuge legst du im Editor an.</div>
          <button className="btn" onClick={() => setNewName('')} data-testid="new-empty">Neue Leitstelle erstellen</button>
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
                    <button className="btn small primary" onClick={() => open(p)}>Laden</button>{' '}
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

      {newName !== null && (
        <Modal
          title="Neue Leitstelle"
          onClose={() => setNewName(null)}
          footer={
            <>
              <button className="btn" onClick={() => setNewName(null)}>Abbrechen</button>
              <button
                className="btn primary"
                disabled={!newName.trim()}
                onClick={() => {
                  const c = createEmptyCenter(newName.trim());
                  setNewName(null);
                  void store.newProject(c);
                }}
              >
                Erstellen
              </button>
            </>
          }
        >
          <label className="field">
            <span className="req">Name der Leitstelle</span>
            <input type="text" autoFocus value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="z. B. ILS Musterstadt" />
          </label>
          <div className="small muted">Nach dem Erstellen öffnest du den Leitstellen-Editor, legst Gebiete, Wachen und Fahrzeuge an und kannst sofort spielen.</div>
        </Modal>
      )}
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
