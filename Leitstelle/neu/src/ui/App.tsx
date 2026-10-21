import { useVehicleImagesLoader } from './vehicleImages';
import { useEffect, useRef, useState } from 'react';
import { store, useStore } from '../store/gameStore';
import { ConfirmHost, fmtClock, fmtDate, Modal, Toasts } from './components/common';
import { StartScreen } from './views/StartScreen';
import { Desk } from './views/desk/Desk';
import { StationsView, VehiclesView } from './views/StationsVehicles';
import { KeywordsView } from './views/KeywordsView';
import { HospitalsView } from './views/HospitalsView';
import { StatsView } from './views/StatsView';
import { EditorView } from './views/EditorView';
import { SimulationView } from './views/SimulationView';
import { MultiplayerView } from './views/MultiplayerView';
import { DataView } from './views/DataView';
import { VoiceTestView } from './views/VoiceTestView';
import { VehicleSetup } from './views/VehicleSetup';
import { installAudio } from './audio';
import { openPopout, POPOUTS } from './PopoutApp';
import { installRouting } from './routingService';
import { FunkController } from './funk';
import { CallVoiceController } from './callVoice';
import { JoinScreen, PlayerChips, usePlayerHeartbeat } from './players';
import { MenuBar, StatusBar } from './MenuBar';

export type ViewId = 'leitstand' | 'einrichten' | 'wachen' | 'fahrzeuge' | 'aao' | 'kliniken' | 'statistik' | 'editor' | 'simulation' | 'mehrspieler' | 'daten' | 'sprachtest';

/** Mitspieler: nur spielen */
const NAV_PLAYER: [ViewId, string][] = [
  ['leitstand', 'Leitstand'],
  ['statistik', 'Archiv & Statistik'],
  ['sprachtest', 'Sprachtest'],
];

/** Im Spiel: nur Leitstand und Spielfunktionen – bearbeitet wird im Bearbeitungsmodus */
const NAV_PLAY: [ViewId, string][] = [
  ['leitstand', 'Leitstand'],
  ['statistik', 'Archiv & Statistik'],
  ['sprachtest', 'Sprachtest'],
  ['daten', 'Daten & Einstellungen'],
];
const NAV_EDIT: [ViewId, string][] = [
  ['einrichten', 'Fahrzeuge an Wachen'],
  ['wachen', 'Wachen'],
  ['fahrzeuge', 'Fahrzeuge'],
  ['aao', 'Stichwörter & AAO'],
  ['kliniken', 'Kliniken & Extern'],
  ['editor', 'Leitstellen-Editor'],
  ['simulation', 'Simulation'],
  ['mehrspieler', 'Mehrspieler'],
  ['daten', 'Daten & Einstellungen'],
];

export const SPEEDS = [1, 2, 5, 10, 30, 60];

export function App() {
  useVehicleImagesLoader();
  const game = useStore((s) => s.state);
  const [view, setView] = useState<ViewId>('leitstand');
  const mode = useStore((s) => s.mode);
  const NAV = store.isPlayerClient ? NAV_PLAYER : mode === 'bearbeiten' ? NAV_EDIT : NAV_PLAY;
  usePlayerHeartbeat();
  // Moduswechsel: passende Startansicht
  useEffect(() => setView(mode === 'bearbeiten' ? 'einrichten' : 'leitstand'), [mode]);
  const [help, setHelp] = useState(false);
  const projectId = useStore((s) => s.project?.id);
  // Beim Laden einer anderen Leitstelle immer im Leitstand beginnen
  useEffect(() => setView(store.mode === 'bearbeiten' ? 'einrichten' : 'leitstand'), [projectId]);

  useEffect(() => installRouting(), []);
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
        const nav = store.mode === 'bearbeiten' ? NAV_EDIT : NAV_PLAY;
        if (nav[idx]) {
          e.preventDefault();
          setView(nav[idx][0]);
        }
        return;
      }
      if (e.altKey) return;
      // im Bearbeitungsmodus läuft keine Simulation
      if (store.mode === 'bearbeiten' || store.isPlayerClient) return;
      if (e.key === ' ') {
        e.preventDefault();
        store.cmdQuiet('toggleRunning');
      } else if (/^[1-6]$/.test(e.key)) {
        store.cmdQuiet('setSpeed', SPEEDS[Number(e.key) - 1]);
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

  // Mitspieler: warten, bis der Gastgeber spielt (nicht während er bearbeitet)
  if (store.isPlayerClient && (!game || !store.player || mode === 'bearbeiten')) {
    return (
      <>
        <JoinScreen />
        <Toasts />
      </>
    );
  }

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
      <MenuBar nav={NAV} view={view} setView={setView} onHelp={() => setHelp(true)} />
      {mode === 'bearbeiten' ? <EditBar /> : <TopBar />}
      <nav className="nav" style={{ padding: '0 8px', background: 'var(--bg-2)', borderBottom: '1px solid var(--line)' }} aria-label="Bereiche">
        {NAV.map(([id, label], i) => (
          <button key={id} className={view === id ? 'active' : ''} onClick={() => setView(id)} title={i < 10 ? `Alt+${(i + 1) % 10}` : undefined}>
            {label}
          </button>
        ))}
      </nav>
      <main className="main">
        {view === 'leitstand' && mode === 'spielen' && <Desk game={game} />}
        {view === 'einrichten' && <VehicleSetup game={game} />}
        {view === 'wachen' && <StationsView game={game} />}
        {view === 'fahrzeuge' && <VehiclesView game={game} />}
        {view === 'aao' && <KeywordsView game={game} />}
        {view === 'kliniken' && <HospitalsView game={game} />}
        {view === 'statistik' && <StatsView game={game} />}
        {view === 'editor' && <EditorView game={game} />}
        {view === 'simulation' && <SimulationView game={game} />}
        {view === 'mehrspieler' && <MultiplayerView />}
        {view === 'daten' && <DataView game={game} />}
        {view === 'sprachtest' && <VoiceTestView game={game} />}
      </main>
      <StatusBar />
      {help && <HelpModal onClose={() => setHelp(false)} />}
      <FunkController />
      <CallVoiceController />
      <Toasts />
      <ConfirmHost />
    </div>
  );
}

/** Kopfzeile im Bearbeitungsmodus */
function EditBar() {
  const game = useStore((s) => s.state)!;
  const project = useStore((s) => s.project);
  const noVehicles = game.center.vehicles.length === 0;
  return (
    <header className="topbar edit">
      <span className="brand">LEITWARTE</span>
      <span className="chip warn">Bearbeitungsmodus</span>
      <span className="ellipsis" style={{ maxWidth: 320 }}>{project?.name ?? game.center.name}</span>
      <span className="spacer" />
      <span className="small muted">{game.center.stations.length} Wachen · {game.center.vehicles.length} Fahrzeuge · {game.center.hospitals.length} Kliniken · {game.center.pois?.length ?? 0} POIs</span>
      <button className="btn primary" onClick={() => store.setMode('spielen')} disabled={noVehicles} title={noVehicles ? 'Erst Fahrzeuge anlegen' : 'Bearbeitung beenden und spielen'} data-testid="start-play">
        ▶ Leitstelle starten
      </button>
      <button className="btn small" onClick={() => void store.close()}>Beenden</button>
    </header>
  );
}

function WindowMenu() {
  const ref = useRef<HTMLDetailsElement>(null);
  return (
    <details className="menu" ref={ref}>
      <summary className="btn small" title="Bereiche in eigene Fenster lösen – z. B. Karte auf dem zweiten Bildschirm">Fenster</summary>
      <div className="menu-list">
        {POPOUTS.map(([k, l]) => (
          <button key={k} className="btn small ghost" onClick={() => {
              openPopout(k);
              if (ref.current) ref.current.open = false;
            }} data-testid={`popout-${k}`}>
            {l} in neuem Fenster
          </button>
        ))}
        <span className="dim small" style={{ padding: 4 }}>Fenster auf einen anderen Bildschirm ziehen; alles bleibt synchron.</span>
      </div>
    </details>
  );
}


/** Werkzeugleiste: Uhr, Zeitsteuerung, Lagezähler */
function TopBar() {
  const game = useStore((s) => s.state)!;
  const rt = game.runtime;
  const now = rt.clock.now;
  const ringing = rt.calls.filter((c) => c.state === 'klingelt' && c.receivedAt <= now).length;
  const undisp = rt.incidents.filter((i) => i.state === 'neu').length;
  const radio = rt.radio.filter((r) => !r.handled).length;
  const free = game.center.vehicles.filter((v) => v.rt.status === 'frei_wache' || v.rt.status === 'frei_funk').length;
  return (
    <header className="topbar">
      <span className="clock" data-testid="sim-clock" title={fmtDate(now)}>{fmtClock(now, true)}</span>
      {store.isPlayerClient ? (
        <span className="chip">{rt.clock.running ? `läuft ${rt.clock.speed}×` : 'pausiert'}</span>
      ) : (
      <>
      <button
        className={`btn ${rt.clock.running ? '' : 'primary'}`}
        onClick={() => store.cmdQuiet('toggleRunning')}
        data-testid="play-pause"
        title="Leertaste"
      >
        {rt.clock.running ? 'Pause' : 'Start'}
      </button>
      <div className="row" role="group" aria-label="Simulationsgeschwindigkeit">
        {SPEEDS.map((sp, i) => (
          <button key={sp} className={`btn small ${rt.clock.speed === sp ? 'active' : ''}`} onClick={() => store.cmdQuiet('setSpeed', sp)} title={`Taste ${i + 1}`}>
            {sp}×
          </button>
        ))}
      </div>
      </>
      )}
      <span className="spacer" />
      <PlayerChips game={game} />
      <span className={`tb-field ${ringing ? 'alarm' : ''}`}>Notrufe <b>{ringing}</b></span>
      <span className={`tb-field ${undisp ? 'warn' : ''}`}>Offene Einsätze <b>{undisp}</b></span>
      <span className={`tb-field ${radio ? 'warn' : ''}`}>Sprechwünsche <b>{radio}</b></span>
      <span className="tb-field">Fahrzeuge frei <b>{free}/{game.center.vehicles.length}</b></span>
      {!store.isPlayerClient && <WindowMenu />}
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
