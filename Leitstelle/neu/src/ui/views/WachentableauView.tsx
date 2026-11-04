import { useState } from 'react';
import type { GameState, OrgKind, Vehicle } from '../../model/types';
import { compareCallsigns } from '../../model/radio';
import { isPoliceVehicle } from '../../sim/dispatch';
import { statusDef } from '../../sim/engine';
import { store } from '../../store/gameStore';
import { fmtClock } from '../components/common';
import { usePrefs } from '../prefs';
import { statusColors } from '../statusColors';
import { VehicleDetail } from './desk/DeskPanels';

/**
 * Wachentableau: je Wache ein Block mit ihren Einsatzmitteln, jede Zeile in der Farbe ihres Status
 * (Rufname, Status, Zeit der letzten Statusänderung). Ein Klick zeigt das Fahrzeug, ein Doppelklick
 * öffnet seinen Einsatz.
 */

const ANZEIGE: [string, string, OrgKind[]][] = [
  ['alle', 'Alle Einsatzmittel', []],
  ['fw', 'Feuerwehr', ['feuerwehr', 'berufsfeuerwehr', 'freiwillige_feuerwehr', 'werkfeuerwehr']],
  ['rd', 'Rettungsdienst', ['rettungsdienst', 'krankentransport', 'notarzt']],
  ['kats', 'Katastrophenschutz / THW', ['katastrophenschutz', 'thw']],
];

/** "Florian Ostholstein 61/48-01" → "FL 61/48-01", "Heros Neustadt/Holstein 21/10" → "HE 21/10" – kurz wie auf dem Tableau */
export function shortCallsign(callsign: string): string {
  const m = /^(\S+)\s.*?(\d+\/\d+(?:-\d+)?)$/.exec(callsign);
  return m ? `${m[1].slice(0, 2).toUpperCase()} ${m[2]}` : callsign;
}

export function Wachentableau({ game, onOpenIncident }: { game: GameState; onOpenIncident: (id: string) => void }) {
  usePrefs();
  const [anzeige, setAnzeige] = useState('alle');
  const [vehicleId, setVehicleId] = useState<string | null>(null);
  const kinds = ANZEIGE.find((a) => a[0] === anzeige)![2];
  const shown = (v: Vehicle) => {
    if (v.external || isPoliceVehicle(game, v)) return false;
    const t = game.center.vehicleTypes.find((x) => x.id === v.typeId);
    return !kinds.length || (!!t && kinds.includes(t.orgKind));
  };
  const blocks = game.center.stations
    .map((s) => ({ s, vs: game.center.vehicles.filter((v) => v.stationId === s.id && shown(v)).sort((a, b) => compareCallsigns(a.callsign, b.callsign)) }))
    .filter((b) => b.vs.length > 0)
    .sort((a, b) => compareCallsigns(a.vs[0].callsign, b.vs[0].callsign) || a.s.name.localeCompare(b.s.name, 'de'));
  return (
    <div className="tableau" data-testid="wachentableau">
      <div className="tableau-bar">
        <label className="row small">
          ausgewählte Anzeige:
          <select value={anzeige} onChange={(e) => setAnzeige(e.target.value)} aria-label="Ausgewählte Anzeige">
            {ANZEIGE.map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
        </label>
        <span className="spacer" />
        <span className="tableau-legend small">
          {(['frei_funk', 'frei_wache', 'alarmiert', 'anfahrt', 'einsatzort', 'sprechwunsch', 'transport', 'am_ziel', 'ausser_dienst'] as const).map((m) => {
            const c = statusColors(game, m);
            return (
              <span key={m} className="tableau-key" style={{ background: c.bg, color: c.fg }} title={statusDef(game, m).label}>
                {statusDef(game, m).code}
              </span>
            );
          })}
        </span>
      </div>
      <div className="tableau-body">
        <div className="tableau-cols">
          {blocks.map(({ s, vs }) => (
            <table key={s.id} className="tableau-block">
              <thead>
                <tr>
                  <th className="ellipsis" title={s.name} colSpan={2}>{s.name}</th>
                  <th>I</th>
                  <th>Zeit</th>
                </tr>
              </thead>
              <tbody>
                {vs.map((v) => {
                  const c = statusColors(game, v.rt.status);
                  const d = statusDef(game, v.rt.status);
                  const t = game.center.vehicleTypes.find((x) => x.id === v.typeId);
                  return (
                    <tr
                      key={v.id}
                      className={vehicleId === v.id ? 'sel' : ''}
                      title={`${v.callsign} · ${t?.code ?? ''} · ${d.code} – ${d.label}`}
                      onClick={() => setVehicleId(v.id)}
                      onDoubleClick={() => v.rt.incidentId && onOpenIncident(v.rt.incidentId)}
                      data-testid="tableau-row"
                    >
                      <td className="tb-name" style={{ background: c.bg, color: c.fg }}>{shortCallsign(v.callsign)}</td>
                      <td className="tb-st" style={{ background: c.bg, color: c.fg }}>{d.code}</td>
                      <td className="tb-info">{v.rt.incidentId ? '●' : ''}</td>
                      <td className="tb-time mono">{fmtClock(v.rt.lastStatusChange)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ))}
        </div>
      </div>
      {vehicleId && (
        <div className="tableau-detail">
          <VehicleDetail game={game} vehicleId={vehicleId} onClose={() => setVehicleId(null)} onOpenIncident={onOpenIncident} />
        </div>
      )}
    </div>
  );
}

/** Bereich „Wachentableau“ im Hauptfenster: Doppelklick öffnet den Einsatz im Leitstand */
export function WachentableauView({ game }: { game: GameState }) {
  return <Wachentableau game={game} onOpenIncident={(id) => store.uiAction({ kind: 'openIncident', id })} />;
}
