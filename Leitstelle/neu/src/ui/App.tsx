import { useEffect, useState } from 'react';
import { store, useStore } from '../store/gameStore';
import { setRunning, setSpeed, WEATHER_LABEL } from '../sim/engine';
import { DIFFICULTY } from '../sim/difficulty';
import { ConfirmHost, fmtClock, fmtDate, Modal, Toasts } from './components/common';
import { StartScreen } from './views/StartScreen';
import { Desk } from './views/desk/Desk';
import { StationsView, VehiclesView } from './views/StationsVehicles';
import { KeywordsView } from './views/KeywordsView';
import { PersonnelView } from './views/PersonnelView';
import { HospitalsView } from './views/HospitalsView';
import { StatsView } from './views/StatsView';
import { EditorView } from './views/EditorView';
import { SimulationView } from './views/SimulationView';
import { MultiplayerView } from './views/MultiplayerView';
import { DataView } from './views/DataView';
import { installAudio } from './audio';

export type ViewId = 'leitstand' | 'wachen' | 'fahrzeuge' | 'aao' | 'personal' | 'kliniken' | 'statistik' | 'editor' | 'simulation' | 'mehrspieler' | 'daten';

const NAV: [ViewId, string][] = [
  ['leitstand', 'Leitstand'],
  ['wachen', 'Wachen'],
  ['fahrzeuge', 'Fahrzeuge'],
  ['aao', 'Stichwörter & AAO'],
  ['personal', 'Personal & Dienst'],
  ['kliniken', 'Kliniken & Extern'],
  ['statistik', 'Archiv & Statistik'],
  ['editor', 'Leitstellen-Editor'],
  ['simulation', 'Simulation'],
  ['mehrspieler', 'Mehrspieler'],
  ['daten', 'Daten & Einstellungen'],
];

export const SPEEDS = [1, 2, 5, 10, 30, 60];

export function App() {
  const game = useStore((s) => s.state);
  const [view, setView] = useState<ViewId>('leitstand');
  const [help, setHelp] = useState(false);
  const projectId = useStore((s) => s.project?.id);
  // Beim Laden einer anderen Leitstelle immer im Leitstand beginnen
  useEffect(() => setView('leitstand'), [projectId]);

  useEffect(() => {
    const off = installAudio();
    return () => {
      off();
    };
  }, []);

  // Globale Tastaturkürzel
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!store.state) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void store.save().then((ok) => ok && store.toast('ok', 'Gespeichert.'));
        return;
      }
      if (e.ctrlKey || e.metaKey) return;
      if (e.altKey && /^[0-9]$/.test(e.key)) {
        const idx = e.key === '0' ? 9 : Number(e.key) - 1;
        if (NAV[idx]) {
          e.preventDefault();
          setView(NAV[idx][0]);
        }
        return;
      }
      if (e.altKey) return;
      if (e.key === ' ') {
        e.preventDefault();
        store.run((s) => setRunning(s, !s.runtime.clock.running), { toast: false });
      } else if (/^[1-6]$/.test(e.key)) {
        store.run((s) => setSpeed(s, SPEEDS[Number(e.key) - 1]), { toast: false });
      } else if (e.key === '?' || e.key === 'F1') {
        e.preventDefault();
        setHelp(true);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Schutz vor Datenverlust beim Schließen des Tabs
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => {
      if (store.state && store.isDirty) {
        void store.save();
        e.preventDefault();
      }
    };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, []);

  if (!game) {
    return (
      <>
        <StartScreen />
        <Toasts />
        <ConfirmHost />
      </>
    );
  }

  return (
    <div className="shell">
      <TopBar onHelp={() => setHelp(true)} />
      <nav className="nav" style={{ padding: '0 8px', background: 'var(--bg-2)', borderBottom: '1px solid var(--line)' }} aria-label="Bereiche">
        {NAV.map(([id, label], i) => (
          <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)} title={`Alt+${(i + 1) % 10}`}>
            {label}
          </button>
        ))}
      </nav>
      <main className="main">
        {view === 'leitstand' && <Desk game={game} />}
        {view === 'wachen' && <StationsView game={game} />}
        {view === 'fahrzeuge' && <VehiclesView game={game} />}
        {view === 'aao' && <KeywordsView game={game} />}
        {view === 'personal' && <PersonnelView game={game} />}
        {view === 'kliniken' && <HospitalsView game={game} />}
        {view === 'statistik' && <StatsView game={game} />}
        {view === 'editor' && <EditorView game={game} />}
        {view === 'simulation' && <SimulationView game={game} />}
        {view === 'mehrspieler' && <MultiplayerView />}
        {view === 'daten' && <DataView game={game} />}
      </main>
      {help && <HelpModal onClose={() => setHelp(false)} />}
      <Toasts />
      <ConfirmHost />
    </div>
  );
}

function TopBar({ onHelp }: { onHelp: () => void }) {
  const game = useStore((s) => s.state)!;
  const project = useStore((s) => s.project);
  const saveStatus = useStore((s) => s.saveStatus);
  const rt = game.runtime;
  const now = rt.clock.now;
  const ringing = rt.calls.filter((c) => c.state === 'klingelt' && c.receivedAt <= now).length;
  const undisp = rt.incidents.filter((i) => i.state === 'neu').length;
  const radio = rt.radio.filter((r) => !r.handled).length;
  const free = game.center.vehicles.filter((v) => v.rt.status === 'frei_wache' || v.rt.status === 'frei_funk').length;
  return (
    <header className="topbar">
      <span className="brand">LEITWARTE</span>
      <span className="ellipsis" style={{ maxWidth: 260 }} title={game.center.name}>{project?.name ?? game.center.name}</span>
      <span className="clock" data-testid="sim-clock" title={fmtDate(now)}>{fmtClock(now, true)}</span>
      <span className="small muted">{fmtDate(now)}</span>
      <button
        className={`btn ${rt.clock.running ? '' : 'primary'}`}
        onClick={() => store.run((s) => setRunning(s, !s.runtime.clock.running), { toast: false })}
        data-testid="play-pause"
        title="Leertaste"
      >
        {rt.clock.running ? '❚❚ Pause' : '▶ Start'}
      </button>
      <div className="row" role="group" aria-label="Simulationsgeschwindigkeit">
        {SPEEDS.map((sp, i) => (
          <button key={sp} className={`btn small ${rt.clock.speed === sp ? 'active' : ''}`} onClick={() => store.run((s) => setSpeed(s, sp), { toast: false })} title={`Taste ${i + 1}`}>
            {sp}×
          </button>
        ))}
      </div>
      <span className="chip" title="Wetterlage">{WEATHER_LABEL[rt.weather]}</span>
      <span className="chip">{DIFFICULTY[game.center.settings.difficulty].label}</span>
      <span className="spacer" />
      <span className={`chip ${ringing ? 'alarm' : ''}`}>☎ {ringing}</span>
      <span className={`chip ${undisp ? 'warn' : ''}`} title="Nicht disponierte Einsätze">⚠ {undisp}</span>
      <span className={`chip ${radio ? 'warn' : ''}`} title="Offene Sprechwünsche">📻 {radio}</span>
      <span className="chip ok" title="Freie Fahrzeuge">🚒 {free}/{game.center.vehicles.length}</span>
      <span className="small dim" title="Automatisches Speichern in diesem Browser (IndexedDB)">
        {saveStatus === 'gespeichert' ? '✓ gespeichert' : saveStatus === 'speichert' ? 'speichert …' : saveStatus === 'fehler' ? '⚠ Speicherfehler' : '● ungespeichert'}
      </span>
      <button className="btn small" onClick={onHelp} title="Hilfe (?)">?</button>
      <button className="btn small" onClick={() => void store.close()} title="Speichern und zur Leitstellenauswahl">Beenden</button>
    </header>
  );
}

export function HelpModal({ onClose }: { onClose: () => void }) {
  const keys: [string, string][] = [
    ['Leertaste', 'Simulation starten / pausieren'],
    ['1 – 6', 'Geschwindigkeit 1×, 2×, 5×, 10×, 30×, 60×'],
    ['N', 'Nächsten wartenden Notruf annehmen'],
    ['Strg + Enter', 'Einsatz aus Notruf anlegen'],
    ['E', 'Ältesten nicht disponierten Einsatz öffnen'],
    ['A', 'Ausgewählte Fahrzeuge im offenen Einsatz alarmieren'],
    ['F', 'Karte auf geöffneten Einsatz zentrieren'],
    ['Esc', 'Fenster schließen'],
    ['Alt + 1 … 0', 'Bereich wechseln'],
    ['Strg + S', 'Sofort speichern'],
    ['?', 'Diese Hilfe'],
  ];
  return (
    <Modal title="Bedienung & Tastaturkürzel" onClose={onClose}>
      <table className="grid">
        <tbody>
          {keys.map(([k, d]) => (
            <tr key={k}>
              <td className="nowrap"><kbd>{k}</kbd></td>
              <td>{d}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h4>Ablauf eines Einsatzes</h4>
      <ol className="small" style={{ margin: 0, paddingLeft: 18 }}>
        <li>Notruf annehmen (N) und abfragen – mindestens den Einsatzort.</li>
        <li>Stichwort wählen und Einsatz anlegen.</li>
        <li>Vorschlag prüfen, ggf. anpassen und alarmieren (A).</li>
        <li>Statusmeldungen verfolgen: 3 Anfahrt → 4 vor Ort. Sprechwünsche (5) im Funkpanel bearbeiten: Transportziele zuweisen, Nachforderungen disponieren.</li>
        <li>Nach „Einsatzstelle abgearbeitet“ die Kräfte entlassen und den Einsatz abschließen.</li>
      </ol>
    </Modal>
  );
}
