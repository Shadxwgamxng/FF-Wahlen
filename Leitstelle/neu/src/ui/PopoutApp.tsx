import { useVehicleImagesLoader } from './vehicleImages';
import { useEffect, useState } from 'react';
import { store, useStore } from '../store/gameStore';
import { WEATHER_LABEL } from '../sim/engine';
import { ConfirmHost, fmtClock, fmtDate, Toasts } from './components/common';
import { MapView } from './components/MapView';
import { CallList, EventLog, IncidentList, VehicleBoard, VehicleDetail } from './views/desk/DeskPanels';
import { RadioPanel } from './views/desk/RadioPanel';

/**
 * Weiteres Browserfenster (z. B. auf dem zweiten Bildschirm). Zeigt einen Teil des Leitstands
 * synchron zum Hauptfenster an; Befehle gehen an das Hauptfenster, das die Simulation führt.
 */

export const POPOUTS: [string, string][] = [
  ['karte', 'Karte'],
  ['fahrzeuge', 'Fahrzeugstatus'],
  ['einsaetze', 'Notrufe & Einsätze'],
  ['funk', 'Funk & Protokoll'],
];

export function openPopout(kind: string) {
  const w = window.open(`${location.pathname}?fenster=${kind}`, `leitwarte-${kind}`, 'width=1280,height=860');
  if (!w) store.toast('fehler', 'Das Fenster wurde vom Browser blockiert – bitte Pop-ups für diese Seite erlauben.');
}

export function PopoutApp({ kind }: { kind: string }) {
  useVehicleImagesLoader();
  const game = useStore((s) => s.state);
  const alive = useStore((s) => s.mainAlive);
  const mode = useStore((s) => s.mode);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const title = POPOUTS.find((p) => p[0] === kind)?.[1] ?? kind;
  useEffect(() => {
    document.title = `LEITWARTE – ${title}`;
  }, [title]);

  if (!game) {
    return (
      <div className="start">
        <h2>LEITWARTE – {title}</h2>
        <div className="infobox">{alive ? 'Warte auf das Hauptfenster … (dort eine Leitstelle öffnen)' : 'Das Hauptfenster ist geschlossen. Bitte LEITWARTE im Hauptfenster öffnen.'}</div>
      </div>
    );
  }
  if (mode === 'bearbeiten')
    return (
      <div className="start">
        <h2>LEITWARTE – {title}</h2>
        <div className="infobox">Die Leitstelle wird gerade bearbeitet. Dieses Fenster ist wieder aktiv, sobald im Hauptfenster „Leitstelle starten“ gewählt wird.</div>
      </div>
    );
  const now = game.runtime.clock.now;
  const openIncident = (id: string) => store.uiAction({ kind: 'openIncident', id });
  return (
    <div className="shell" style={{ gridTemplateRows: 'auto 1fr' }}>
      <header className="topbar">
        <span className="brand">LEITWARTE</span>
        <b>{title}</b>
        <span className="clock">{fmtClock(now, true)}</span>
        <span className="small muted">{fmtDate(now)}</span>
        <span className="chip">{game.runtime.clock.running ? `läuft ${game.runtime.clock.speed}×` : 'pausiert'}</span>
        <span className="chip">{WEATHER_LABEL[game.runtime.weather]}</span>
        <span className="spacer" />
        {!alive && <span className="chip alarm">Hauptfenster getrennt</span>}
        <span className="small dim">Zweitfenster – Simulation läuft im Hauptfenster</span>
      </header>
      <main className="main" style={{ display: 'flex', minHeight: 0 }}>
        {kind === 'karte' && (
          <div style={{ position: 'relative', flex: 1 }}>
            <MapView game={game} selectedIncidentId={null} selectedVehicleId={vehicleId} onSelectIncident={openIncident} onSelectVehicle={setVehicleId} />
            {vehicleId && (
              <div style={{ position: 'absolute', right: 10, top: 10, width: 360, zIndex: 1000 }}>
                <VehicleDetail game={game} vehicleId={vehicleId} onClose={() => setVehicleId(null)} onOpenIncident={openIncident} />
              </div>
            )}
          </div>
        )}
        {kind === 'fahrzeuge' && (
          <div className="col" style={{ flex: 1, minHeight: 0, gap: 0 }}>
            {vehicleId && <VehicleDetail game={game} vehicleId={vehicleId} onClose={() => setVehicleId(null)} onOpenIncident={openIncident} />}
            <VehicleBoard game={game} selectedId={vehicleId} onSelect={setVehicleId} />
          </div>
        )}
        {kind === 'einsaetze' && (
          <div className="col" style={{ flex: 1, minHeight: 0, gap: 0 }}>
            <CallList game={game} selectedId={null} onSelect={(id) => store.uiAction({ kind: 'openCall', id })} />
            <IncidentList game={game} selectedId={null} onSelect={openIncident} onNewManual={() => store.toast('info', 'Manuelle Einsätze bitte im Hauptfenster anlegen.')} />
          </div>
        )}
        {kind === 'funk' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', flex: 1, minHeight: 0 }}>
            <RadioPanel game={game} onOpenIncident={openIncident} />
            <EventLog game={game} />
          </div>
        )}
      </main>
      <Toasts />
      <ConfirmHost />
    </div>
  );
}
