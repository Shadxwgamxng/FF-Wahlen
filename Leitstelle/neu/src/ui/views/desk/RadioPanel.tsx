import { useState } from 'react';
import type { GameState, RadioMessage } from '../../../model/types';
import { acknowledgeRadio, assignHospital, releaseAllOnScene } from '../../../sim/engine';
import { hospitalOptions } from '../../../sim/dispatch';
import { formatDuration } from '../../../sim/geo';
import { store } from '../../../store/gameStore';
import { fmtClock } from '../../components/common';

const KIND_LABEL: Record<RadioMessage['kind'], string> = {
  transportziel: 'Transportziel',
  nachforderung: 'Nachforderung',
  lage: 'Lagemeldung',
  defekt: 'Defekt',
};

/** Bedienelemente für eine Funkmeldung (Sprechwunsch) – im Funkpanel und im Einsatzfenster genutzt */
export function RadioActions({ game, msg }: { game: GameState; msg: RadioMessage }) {
  const v = game.center.vehicles.find((x) => x.id === msg.vehicleId);
  const inc = game.runtime.incidents.find((i) => i.id === msg.incidentId);
  const patient = inc?.patients.find((p) => p.id === msg.patientId);
  const options = patient && v ? hospitalOptions(game, patient, v.rt.position) : [];
  const [hosp, setHosp] = useState<string>('');
  const chosen = hosp || options[0]?.hospital.id || '';

  if (msg.kind === 'transportziel') {
    return (
      <div className="row wrap">
        <select value={chosen} onChange={(e) => setHosp(e.target.value)} aria-label="Transportziel" style={{ maxWidth: 380 }}>
          {options.map((o) => (
            <option key={o.hospital.id} value={o.hospital.id} disabled={!o.hospital.available}>
              {o.suitable ? '✓' : '✗'} {o.hospital.name} · {formatDuration(o.etaMs)} · frei {o.free}/{o.hospital.capacity}
              {o.hospital.available ? '' : ' (abgemeldet)'}
            </option>
          ))}
        </select>
        <button className="btn small primary" onClick={() => store.run((s) => assignHospital(s, msg.id, chosen))} disabled={!chosen}>
          Ziel zuweisen
        </button>
        <span className="dim small">✓ = Fachrichtung „{patient?.department}“ laut Spieldaten vorhanden</span>
      </div>
    );
  }
  return (
    <div className="row wrap">
      {msg.kind === 'lage' && inc?.state === 'abarbeitung_beendet' && (
        <button className="btn small primary" onClick={() => store.run((s) => releaseAllOnScene(s, inc.id))}>Kräfte entlassen</button>
      )}
      <button className="btn small" onClick={() => store.run((s) => acknowledgeRadio(s, msg.id))}>Quittieren</button>
    </div>
  );
}

export function RadioPanel({ game, onOpenIncident }: { game: GameState; onOpenIncident: (id: string) => void }) {
  const msgs = game.runtime.radio.filter((r) => !r.handled);
  const now = game.runtime.clock.now;
  return (
    <div className="panel" style={{ borderRight: '1px solid var(--line)' }}>
      <div className="panel-head">
        <h4 className="grow">Funk / Sprechwünsche</h4>
        <span className={`count ${msgs.length ? 'alarm' : ''}`}>{msgs.length}</span>
      </div>
      <div className="panel-body">
        {msgs.length === 0 && <div className="empty">Keine offenen Sprechwünsche.</div>}
        {msgs.map((m) => {
          const v = game.center.vehicles.find((x) => x.id === m.vehicleId);
          return (
            <div key={m.id} className="list-item" style={{ flexDirection: 'column', gap: 4, cursor: 'default' }}>
              <div className="row" style={{ width: '100%' }}>
                <span className="status-badge" style={{ background: 'var(--radio)' }}>5</span>
                <b className="grow ellipsis">{v?.callsign}</b>
                <span className="chip small">{KIND_LABEL[m.kind]}</span>
                <span className="mono small dim">{fmtClock(m.at)} ({Math.round((now - m.at) / 60000)} min)</span>
              </div>
              <div className="small">{m.text}</div>
              <div className="row" style={{ width: '100%' }}>
                <RadioActions game={game} msg={m} />
                <span className="spacer" />
                {m.incidentId && (
                  <button className="btn small ghost" onClick={() => onOpenIncident(m.incidentId!)}>Einsatz öffnen</button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
