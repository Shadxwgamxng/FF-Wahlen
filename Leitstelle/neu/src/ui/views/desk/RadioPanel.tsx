import { useState } from 'react';
import type { GameState, RadioMessage } from '../../../model/types';
import { hospitalOptions } from '../../../sim/dispatch';
import { formatDuration } from '../../../sim/geo';
import { store } from '../../../store/gameStore';
import { fmtClock } from '../../components/common';
import { FunkBar, joinPcGroup, radioSend } from '../../funk';
import { radioGroupOf } from '../../../model/radio';

const KIND_LABEL: Record<RadioMessage['kind'], string> = {
  transportziel: 'Transportziel',
  nachforderung: 'Nachforderung',
  lage: 'Lagemeldung',
  defekt: 'Defekt',
};

/** Bedienelemente für eine Funkmeldung (Sprechwunsch) – im Funkpanel und im Einsatzfenster genutzt */
export function RadioActions({ game, msg }: { game: GameState; msg: RadioMessage }) {
  if (msg.revealed === false) return <UnrevealedActions msg={msg} />;
  return <RevealedActions game={game} msg={msg} />;
}

/** Sprechwunsch, dessen Inhalt noch niemand gehört hat: erst ansprechen (Funk oder Knopf) */
function UnrevealedActions({ msg }: { msg: RadioMessage }) {
  return (
    <div className="row wrap">
      <button className="btn small primary" onClick={() => {
          // in die Rufgruppe des Fahrzeugs wechseln, damit man die Antwort hört
          const v = store.state?.center.vehicles.find((x) => x.id === msg.vehicleId);
          const g = v && store.state ? radioGroupOf(store.state.center, v)?.code : undefined;
          if (g) joinPcGroup(g);
          void radioSend(store.cmdAsync('radioCall', msg.vehicleId));
        }} data-testid="ansprechen">
        Ansprechen
      </button>
    </div>
  );
}

/** Text einer Funkmeldung – vor dem Ansprechen nur der Sprechwunsch */
export const radioText = (msg: RadioMessage) => (msg.revealed === false ? 'Sprechwunsch' : msg.text);

function RevealedActions({ game, msg }: { game: GameState; msg: RadioMessage }) {
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
        <button className="btn small primary" onClick={() => store.cmd('assignHospital', msg.id, chosen)} disabled={!chosen}>
          Ziel zuweisen
        </button>
        <span className="dim small">✓ = {patient?.department}</span>
      </div>
    );
  }
  return (
    <div className="row wrap">
      {msg.kind === 'lage' && inc?.state === 'abarbeitung_beendet' && (
        <button className="btn small primary" onClick={() => store.cmd('releaseAllOnScene', inc.id)}>Kräfte entlassen</button>
      )}
      <button className="btn small" onClick={() => store.cmd('acknowledgeRadio', msg.id)}>Quittieren</button>
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
        <FunkBar game={game} />
        {msgs.length === 0 && <div className="empty">Keine offenen Sprechwünsche.</div>}
        {msgs.map((m) => {
          const v = game.center.vehicles.find((x) => x.id === m.vehicleId);
          return (
            <div key={m.id} className="list-item" style={{ flexDirection: 'column', gap: 4, cursor: 'default' }}>
              <div className="row" style={{ width: '100%' }}>
                <span className="status-badge" style={{ background: 'var(--radio)' }}>5</span>
                <b className="grow ellipsis">{v?.callsign}</b>
                <span className="chip small">{m.revealed === false ? 'Sprechwunsch' : KIND_LABEL[m.kind]}</span>
                <span className="mono small dim">{fmtClock(m.at)} ({Math.round((now - m.at) / 60000)} min)</span>
              </div>
              <div className="small">{radioText(m)}</div>
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
