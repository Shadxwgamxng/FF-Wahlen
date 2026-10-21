import { useCallback, useEffect, useState } from 'react';
import type { GameState, LatLng } from '../../../model/types';
import { areaAt } from '../../../sim/callgen';
import { store, useStore } from '../../../store/gameStore';
import { Modal, Splitter } from '../../components/common';
import { MapView } from '../../components/MapView';
import { CallList, EventLog, IncidentList, VehicleBoard, VehicleDetail } from './DeskPanels';
import { Maske } from './Maske';
import { KeywordSelect } from './KeywordSelect';
import { RadioPanel } from './RadioPanel';

type Sel = { kind: 'call' | 'incident'; id: string } | null;

export function Desk({ game }: { game: GameState }) {
  const popouts = useStore((s) => s.popouts);
  const [sel, setSel] = useState<Sel>(null);
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const [focus, setFocus] = useState<{ pos: LatLng; key: number } | null>(null);
  const [manual, setManual] = useState<{ pos: LatLng | null; keywordId: string | null; address: string; description: string } | null>(null);
  const [alarmReq, setAlarmReq] = useState(0);

  const showOnMap = useCallback((pos: LatLng) => setFocus({ pos, key: Date.now() }), []);
  const openIncident = useCallback(
    (id: string) => {
      setSel({ kind: 'incident', id });
      const inc = store.state?.runtime.incidents.find((i) => i.id === id);
      if (inc) showOnMap(inc.position);
    },
    [showOnMap],
  );

  const call = sel?.kind === 'call' ? game.runtime.calls.find((c) => c.id === sel.id) : undefined;
  const incident = sel?.kind === 'incident' ? game.runtime.incidents.find((i) => i.id === sel.id) : undefined;

  // Aktionen aus weiteren Fenstern (zweiter Bildschirm): Einsatz/Notruf in der Maske öffnen
  useEffect(
    () =>
      store.onUiAction((a) => {
        if (a.kind === 'openIncident' && a.id) openIncident(a.id);
        else if (a.kind === 'openCall' && a.id) setSel({ kind: 'call', id: a.id });
        window.focus();
      }),
    [openIncident],
  );

  // Geschlossene/archivierte Auswahl automatisch aufheben
  useEffect(() => {
    if (sel?.kind === 'incident' && !incident) setSel(null);
    if (sel?.kind === 'call' && call && (call.state === 'abgeschlossen' || call.state === 'aufgelegt') && !call.incidentId) {
      const t = setTimeout(() => setSel(null), 1500);
      return () => clearTimeout(t);
    }
  }, [sel, incident, call]);

  // Tastaturkürzel des Leitstands
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      const typing = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
      if (e.key === 'Escape') {
        if (manual) return;
        setSel(null);
        setVehicleId(null);
        return;
      }
      // Funktionstasten wie im Einsatzleitsystem: F2 Notruf annehmen, F3 nächster offener Einsatz
      if (e.key === 'F2' || e.key === 'F3') e.preventDefault();
      const key = e.key === 'F2' ? 'n' : e.key === 'F3' ? 'e' : e.key;
      if ((typing && !e.key.startsWith('F')) || e.ctrlKey || e.metaKey || e.altKey) return;
      const now = store.state!.runtime.clock.now;
      if (key === 'n' || key === 'N') {
        const next = store.state!.runtime.calls.filter((c) => c.state === 'klingelt' && c.receivedAt <= now).sort((a, b) => a.receivedAt - b.receivedAt)[0];
        if (next) {
          store.cmd('acceptCall', next.id);
          setSel({ kind: 'call', id: next.id });
        } else store.toast('info', 'Kein wartender Notruf.');
      } else if ((e.key === 'a' || e.key === 'A') && incident) {
        setAlarmReq((x) => x + 1);
      } else if ((e.key === 'f' || e.key === 'F') && incident) {
        showOnMap(incident.position);
      } else if (key === 'e' || key === 'E') {
        const first = [...store.state!.runtime.incidents].sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt).find((i) => i.state === 'neu');
        if (first) openIncident(first.id);
      }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [call, incident, manual, openIncident, showOnMap]);

  const createManual = () => {
    if (!manual?.pos) return store.toast('fehler', 'Bitte den Einsatzort in der Karte anklicken.');
    if (!manual.keywordId) return store.toast('fehler', 'Bitte ein Stichwort wählen.');
    void store.cmdAsync('createManualIncident', manual.keywordId!, manual.pos!, manual.address, manual.description).then(async (r) => {
      if (r.ok && r.id) await store.nextState();
      if (r.ok && r.id) {
        setManual(null);
        openIncident(r.id);
      }
    });
  };

  // In eigene Fenster gelöste Bereiche erscheinen hier nicht doppelt
  const showLeft = !popouts.includes('einsaetze');
  const showMap = !popouts.includes('karte');
  const showRight = !popouts.includes('fahrzeuge');
  const showBottom = !popouts.includes('funk');
  const deskStyle = {
    gridTemplateColumns: `${showLeft ? 'var(--left-w) 5px' : '0 0'} 1fr ${showRight ? '5px var(--right-w)' : '0 0'}`,
    gridTemplateRows: `1fr ${showBottom ? '5px var(--bottom-h)' : '0 0'}`,
  };
  const away = (kind: string, label: string) => (
    <div className="popped" data-testid={`popped-${kind}`}>
      <span>{label} – eigenes Fenster</span>
      <button className="btn small" onClick={() => store.closePopout(kind)}>
        Zurückholen
      </button>
    </div>
  );

  return (
    <div className="desk" data-testid="desk" style={deskStyle}>
      {showLeft && (
      <div className="desk-left">
        <CallList game={game} selectedId={sel?.kind === 'call' ? sel.id : null} onSelect={(id) => setSel({ kind: 'call', id })} />
        <IncidentList
          game={game}
          selectedId={sel?.kind === 'incident' ? sel.id : null}
          onSelect={openIncident}
          onNewManual={() => setManual({ pos: null, keywordId: null, address: '', description: '' })}
        />
      </div>
      )}
      {showLeft && <Splitter cssVar="--left-w" dir="x" className="sl" min={240} max={600} />}
      <div className="desk-map">
        {!showMap ? away('karte', 'Karte') : (
        <MapView
          game={game}
          selectedIncidentId={incident?.id ?? null}
          selectedVehicleId={vehicleId}
          onSelectIncident={openIncident}
          onSelectVehicle={setVehicleId}
          focus={focus}
          pickHint={manual && !manual.pos ? 'Einsatzort in die Karte klicken' : null}
          onMapClick={
            manual
              ? (ll) => {
                  const area = game.center.areas.find((a) => a.id === areaAt(game, ll));
                  setManual((m) => (m ? { ...m, pos: ll, address: m.address || `Koordinate ${ll[0].toFixed(4)}, ${ll[1].toFixed(4)}${area ? `, ${area.name}` : ''}` } : m));
                }
              : undefined
          }
        />
        )}
      </div>
      {showRight && <Splitter cssVar="--right-w" dir="x" invert className="sr" min={260} max={700} />}
      {showRight && (
      <div className="desk-right">
        {vehicleId && <VehicleDetail game={game} vehicleId={vehicleId} onClose={() => setVehicleId(null)} onOpenIncident={openIncident} />}
        <VehicleBoard game={game} selectedId={vehicleId} onSelect={setVehicleId} />
      </div>
      )}
      {showBottom && <Splitter cssVar="--bottom-h" dir="y" invert className="h" min={100} max={600} />}
      {(call || incident) && (
        <div className="mask-host">
          <Maske
            game={game}
            call={call ?? (incident?.callId ? game.runtime.calls.find((c) => c.id === incident.callId) : undefined)}
            incident={incident}
            onClose={() => setSel(null)}
            onIncidentCreated={(id) => setSel({ kind: 'incident', id })}
            onShowOnMap={(pos) => {
              setSel(null);
              showOnMap(pos);
            }}
            onSelectVehicle={setVehicleId}
            alarmRequest={alarmReq}
          />
        </div>
      )}
      {showBottom && (
      <div className="desk-bottom">
        <RadioPanel game={game} onOpenIncident={openIncident} />
        <EventLog game={game} />
      </div>
      )}

      {manual && manual.pos && (
        <Modal
          title="Einsatz ohne Notruf anlegen"
          onClose={() => setManual(null)}
          footer={
            <>
              <button className="btn" onClick={() => setManual({ ...manual, pos: null })}>Ort neu wählen</button>
              <button className="btn" onClick={() => setManual(null)}>Abbrechen</button>
              <button className="btn primary" onClick={createManual}>Einsatz anlegen</button>
            </>
          }
        >
          <label className="field">
            <span className="req">Stichwort</span>
            <KeywordSelect game={game} value={manual.keywordId} onChange={(id) => setManual({ ...manual, keywordId: id })} />
          </label>
          <label className="field">
            <span className="req">Adresse / Ortsbeschreibung</span>
            <input type="text" value={manual.address} onChange={(e) => setManual({ ...manual, address: e.target.value })} />
          </label>
          <label className="field">
            <span>Beschreibung</span>
            <textarea rows={2} value={manual.description} onChange={(e) => setManual({ ...manual, description: e.target.value })} />
          </label>
          <div className="dim small">Manuell angelegte Einsätze haben keinen verdeckten Szenarioverlauf: Der Bedarf entspricht der AAO, es gibt keine Patienten.</div>
        </Modal>
      )}
    </div>
  );
}
