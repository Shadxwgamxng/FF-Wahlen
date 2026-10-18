import { useState } from 'react';
import type { Difficulty, GameState, KeywordCategory, SimSettings } from '../../model/types';
import { SCENARIOS } from '../../data/scenarios';
import { CATEGORY_LABELS } from '../../data/keywords';
import { DIFFICULTY } from '../../sim/difficulty';
import { store } from '../../store/gameStore';
import { confirmDialog, Tabs } from '../components/common';

export function SimulationView({ game }: { game: GameState }) {
  const [tab, setTab] = useState<'einst' | 'szen'>('einst');
  return (
    <div className="page">
      <Tabs tabs={[['einst', 'Simulationseinstellungen'], ['szen', `Szenariokatalog (${SCENARIOS.length})`]]} value={tab} onChange={setTab} />
      {tab === 'einst' ? <SettingsForm game={game} /> : <ScenarioList game={game} />}
    </div>
  );
}

function SettingsForm({ game }: { game: GameState }) {
  const [s, setS] = useState<SimSettings>(game.center.settings);
  const dirty = JSON.stringify(s) !== JSON.stringify(game.center.settings);
  const valid = s.callsPerHour >= 0 && s.callsPerHour <= 200 && s.detourFactor >= 1 && s.detourFactor <= 3 && Number.isInteger(s.seed);
  const bool = (k: 'useTimeOfDay' | 'useWeather' | 'randomBreakdowns' | 'autoHospital' | 'autoRelease', label: string, help: string) => (
    <label className="check" title={help}>
      <input type="checkbox" checked={s[k]} onChange={(e) => setS({ ...s, [k]: e.target.checked })} /> {label}
      <span className="dim small">– {help}</span>
    </label>
  );
  return (
    <div className="col" style={{ maxWidth: 900, gap: 14 }}>
      <div className="card col">
        <h3>Einsatzaufkommen & Schwierigkeit</h3>
        <div className="form-grid">
          <label className="field">
            <span>Notrufe pro Stunde (Grundwert)</span>
            <input type="number" min={0} max={200} step={0.5} className={s.callsPerHour < 0 || s.callsPerHour > 200 ? 'invalid' : ''} value={s.callsPerHour} onChange={(e) => setS({ ...s, callsPerHour: Number(e.target.value) })} />
          </label>
          <label className="field">
            <span>Schwierigkeitsgrad</span>
            <select value={s.difficulty} onChange={(e) => setS({ ...s, difficulty: e.target.value as Difficulty })}>
              {Object.entries(DIFFICULTY).map(([k, d]) => (
                <option key={k} value={k}>{d.label}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Zufalls-Seed</span>
            <input type="number" step={1} value={s.seed} onChange={(e) => setS({ ...s, seed: Math.trunc(Number(e.target.value)) })} />
            <span className="dim small">Wirkt beim Neustart der Simulation.</span>
          </label>
          <label className="field">
            <span>Umwegfaktor Fahrzeitnäherung</span>
            <input type="number" min={1} max={3} step={0.05} value={s.detourFactor} onChange={(e) => setS({ ...s, detourFactor: Number(e.target.value) })} />
          </label>
        </div>
        <table className="grid small">
          <thead>
            <tr><th>Stufe</th><th>Aufkommen</th><th>Lageentwicklung</th><th>Anrufer wartet</th><th>Abfragehilfe</th><th>Ausfälle</th><th>Bindungszeit</th></tr>
          </thead>
          <tbody>
            {Object.entries(DIFFICULTY).map(([k, d]) => (
              <tr key={k} className={k === s.difficulty ? 'selected' : ''}>
                <td>{d.label}</td>
                <td>×{d.callRate}</td>
                <td>×{d.escalation}</td>
                <td>{d.hangupSeconds} s</td>
                <td>{d.keywordHint ? 'ja' : 'nein'}</td>
                <td>×{d.breakdown}</td>
                <td>×{d.workTime}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card col">
        <h3>Spielmechanik</h3>
        {bool('useTimeOfDay', 'Tageszeit berücksichtigen', 'Aufkommen und Szenarien schwanken über den Tag')}
        {bool('useWeather', 'Wetter berücksichtigen', 'Wetterlage verändert die Szenariohäufigkeit (simuliertes Wetter, keine echten Daten)')}
        {bool('randomBreakdowns', 'Zufällige Fahrzeugausfälle', 'Fahrzeuge auf der Wache können defekt gehen')}
        {bool('autoHospital', 'Transportziel automatisch wählen', 'statt Sprechwunsch der RTW-Besatzung')}
        {bool('autoRelease', 'Kräfte automatisch entlassen', 'nach Einsatzende inkl. automatischem Abschluss')}
      </div>
      <div className="card col">
        <h3>Einsatzverteilung nach Kategorie</h3>
        <div className="small muted">Gewicht 1 = Standard, 0 = Kategorie tritt nicht auf, 2 = doppelt so häufig.</div>
        <div className="form-grid">
          {(Object.keys(CATEGORY_LABELS) as KeywordCategory[]).map((cat) => (
            <label key={cat} className="field">
              <span>{CATEGORY_LABELS[cat]}: {(s.categoryWeights[cat] ?? 1).toFixed(1)}</span>
              <input type="range" min={0} max={3} step={0.1} value={s.categoryWeights[cat] ?? 1} onChange={(e) => setS({ ...s, categoryWeights: { ...s.categoryWeights, [cat]: Number(e.target.value) } })} />
            </label>
          ))}
        </div>
      </div>
      <div className="row">
        <button className="btn primary" disabled={!dirty || !valid} onClick={() => store.edit((c) => void (c.settings = s), 'Einstellungen übernommen.')}>Übernehmen</button>
        <button className="btn" disabled={!dirty} onClick={() => setS(game.center.settings)}>Verwerfen</button>
        {!valid && <span className="field-error">Ungültige Werte.</span>}
        <span className="spacer" />
        <button
          className="btn danger"
          onClick={async () => {
            if (await confirmDialog('Simulation neu starten? Laufende Notrufe, Einsätze, Archiv und Statistik dieses Spielstands werden gelöscht. Die Leitstellenkonfiguration bleibt erhalten.\n\nTipp: Vorher unter „Daten“ einen Spielstand sichern.', { confirmLabel: 'Neu starten' }))
              store.cmd('restartSimulation');
          }}
        >
          Simulation neu starten
        </button>
      </div>
    </div>
  );
}

function ScenarioList({ game }: { game: GameState }) {
  const [q, setQ] = useState('');
  const disabled = new Set(game.center.settings.disabledScenarioIds);
  const list = SCENARIOS.filter((s) => !q || `${s.name} ${s.keyword} ${CATEGORY_LABELS[s.category]}`.toLowerCase().includes(q.toLowerCase()));
  const toggle = (id: string, on: boolean) =>
    store.edit((c) => {
      c.settings.disabledScenarioIds = on ? c.settings.disabledScenarioIds.filter((x) => x !== id) : [...c.settings.disabledScenarioIds, id];
    });
  return (
    <div className="col">
      <div className="row">
        <input type="search" placeholder="Szenarien suchen …" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 360 }} />
        <span className="small muted grow">{SCENARIOS.length - disabled.size} von {SCENARIOS.length} aktiv. Über „Auslösen“ kann jedes Szenario gezielt geübt werden.</span>
      </div>
      <div className="card" style={{ padding: 0 }}>
        <table className="grid">
          <thead>
            <tr><th>Aktiv</th><th>Szenario</th><th>Kategorie</th><th>Richtiges Stichwort</th><th>Varianten</th><th>Häufigkeit</th><th></th></tr>
          </thead>
          <tbody>
            {list.map((s) => (
              <tr key={s.id} className={disabled.has(s.id) ? 'unavailable' : ''}>
                <td><input type="checkbox" checked={!disabled.has(s.id)} onChange={(e) => toggle(s.id, e.target.checked)} aria-label={`${s.name} aktiv`} /></td>
                <td><b>{s.name}</b><div className="small dim">{s.openings[0]}</div></td>
                <td>{CATEGORY_LABELS[s.category]}</td>
                <td className="mono">{s.keyword === '-' ? 'kein Einsatz' : s.keyword}{s.variants?.some((v) => v.keyword) ? ' (+ Varianten)' : ''}</td>
                <td>{1 + (s.variants?.length ?? 0)}</td>
                <td className="mono">{s.weight}</td>
                <td><button className="btn small" onClick={() => store.cmd('injectScenarioCall', s.id)}>Auslösen</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
