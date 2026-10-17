import { useState } from 'react';
import type { EventKind, GameState, OrgKind } from '../../../model/types';
import { vehicleAvailability, outOfServiceReason } from '../../../sim/availability';
import { setVehicleServiceStatus } from '../../../sim/engine';
import { formatDuration } from '../../../sim/geo';
import { store } from '../../../store/gameStore';
import { radioGroupOf } from '../../../model/radio';
import { fmtAgo, fmtClock, StatusBadge } from '../../components/common';

export function CallList({ game, selectedId, onSelect }: { game: GameState; selectedId: string | null; onSelect: (id: string) => void }) {
  const now = game.runtime.clock.now;
  const calls = game.runtime.calls.filter((c) => c.receivedAt <= now && (c.state === 'klingelt' || c.state === 'in_abfrage'));
  return (
    <div className="panel" style={{ flex: '0 0 auto', maxHeight: '40%' }}>
      <div className="panel-head">
        <h4 className="grow">Notrufe</h4>
        <span className={`count ${calls.some((c) => c.state === 'klingelt') ? 'alarm' : ''}`} data-testid="call-count">{calls.length}</span>
      </div>
      <div className="panel-body">
        {calls.length === 0 && <div className="empty">Keine wartenden Notrufe.</div>}
        {calls.map((c) => (
          <div key={c.id} className={`list-item ${c.state === 'klingelt' ? 'ringing' : ''} ${selectedId === c.id ? 'selected' : ''}`} onClick={() => onSelect(c.id)} data-testid="call-item">
            <span style={{ fontSize: 18 }}>{c.state === 'klingelt' ? '☎' : '🎧'}</span>
            <div className="grow" style={{ minWidth: 0 }}>
              <div className="row">
                <b className="grow">{c.state === 'klingelt' ? 'Eingehender Notruf' : `In Abfrage – ${c.caller.name}`}</b>
                <span className="mono small">{fmtAgo(now, c.receivedAt)}</span>
              </div>
              {c.state === 'klingelt' ? (
                <div className="small muted">Anrufer wartet{c.redialOf ? ' (erneuter Anruf!)' : ''}</div>
              ) : (
                <div className="small muted ellipsis">{c.opening}</div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function IncidentList({ game, selectedId, onSelect, onNewManual }: { game: GameState; selectedId: string | null; onSelect: (id: string) => void; onNewManual: () => void }) {
  const now = game.runtime.clock.now;
  const incs = [...game.runtime.incidents].sort((a, b) => a.priority - b.priority || a.createdAt - b.createdAt);
  return (
    <div className="panel" style={{ flex: 1 }}>
      <div className="panel-head">
        <h4 className="grow">Laufende Einsätze</h4>
        <button className="btn small" onClick={onNewManual} title="Einsatz ohne Notruf anlegen (z. B. Meldung über Funk)">+ Einsatz</button>
        <span className="count">{incs.length}</span>
      </div>
      <div className="panel-body">
        {incs.length === 0 && <div className="empty">Keine laufenden Einsätze.</div>}
        {incs.map((i) => {
          const kw = game.center.keywords.find((k) => k.id === i.keywordId);
          const radio = game.runtime.radio.some((r) => r.incidentId === i.id && !r.handled);
          return (
            <div key={i.id} className={`list-item ${selectedId === i.id ? 'selected' : ''}`} onClick={() => onSelect(i.id)} data-testid="incident-item">
              <span className={`prio prio-${i.priority}`} />
              <div className="grow" style={{ minWidth: 0 }}>
                <div className="row">
                  <b className="mono">{kw?.code}</b>
                  <span className="grow ellipsis small">{kw?.label}</span>
                  {radio && <span className="status-badge" style={{ background: 'var(--radio)' }} title="Offener Sprechwunsch">5</span>}
                </div>
                <div className="small ellipsis">{i.address}</div>
                <div className="row small muted">
                  <span className="grow">{STATE_SHORT[i.state]} · {i.activeVehicleIds.length} EM</span>
                  <span className="mono">{fmtAgo(now, i.createdAt)}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

const STATE_SHORT = { neu: '⚠ nicht disponiert', disponiert: 'Anfahrt', vor_ort: 'vor Ort', abarbeitung_beendet: 'beendet – entlassen', abgeschlossen: 'abgeschlossen' } as const;

const ORG_FILTER: [string, string, OrgKind[]][] = [
  ['alle', 'Alle', []],
  ['fw', 'Feuerwehr', ['feuerwehr', 'berufsfeuerwehr', 'freiwillige_feuerwehr', 'werkfeuerwehr']],
  ['rd', 'Rettungsdienst', ['rettungsdienst', 'krankentransport', 'notarzt', 'katastrophenschutz']],
  ['sonst', 'Polizei/THW/Extern', ['polizei', 'thw', 'sonstige']],
];

export function VehicleBoard({ game, selectedId, onSelect }: { game: GameState; selectedId: string | null; onSelect: (id: string) => void }) {
  const [org, setOrg] = useState('alle');
  const [onlyFree, setOnlyFree] = useState(false);
  const kinds = ORG_FILTER.find((o) => o[0] === org)![2];
  const groups = game.center.stations
    .map((s) => ({
      s,
      vs: game.center.vehicles.filter((v) => {
        if (v.stationId !== s.id) return false;
        const t = game.center.vehicleTypes.find((x) => x.id === v.typeId);
        if (kinds.length && (!t || !kinds.includes(t.orgKind))) return false;
        if (onlyFree && !(v.rt.status === 'frei_wache' || v.rt.status === 'frei_funk')) return false;
        return true;
      }),
    }))
    .filter((g) => g.vs.length > 0);
  const free = game.center.vehicles.filter((v) => v.rt.status === 'frei_wache' || v.rt.status === 'frei_funk').length;
  return (
    <div className="panel" style={{ flex: 1 }}>
      <div className="panel-head">
        <h4 className="grow">Fahrzeuge</h4>
        <span className="small muted">{free}/{game.center.vehicles.length} frei</span>
      </div>
      <div className="row wrap" style={{ padding: '6px 10px', borderBottom: '1px solid var(--line)' }}>
        {ORG_FILTER.map(([k, l]) => (
          <button key={k} className={`btn small ${org === k ? 'active' : ''}`} onClick={() => setOrg(k)}>{l}</button>
        ))}
        <label className="check small"><input type="checkbox" checked={onlyFree} onChange={(e) => setOnlyFree(e.target.checked)} /> nur frei</label>
      </div>
      <div className="panel-body">
        {groups.map(({ s, vs }) => (
          <div key={s.id} className="station-group">
            <h4>{s.name}</h4>
            {vs.map((v) => {
              const t = game.center.vehicleTypes.find((x) => x.id === v.typeId);
              const inc = v.rt.incidentId ? game.runtime.incidents.find((i) => i.id === v.rt.incidentId) : null;
              const kw = inc ? game.center.keywords.find((k) => k.id === inc.keywordId) : null;
              const av = v.rt.status === 'frei_wache' ? vehicleAvailability(game, v) : null;
              const info = kw ? `${kw.code} · ${inc!.address.split(',')[0]}` : v.rt.status === 'ausser_dienst' ? outOfServiceReason(v, game.runtime.clock.now) ?? '' : av && !av.available ? av.reason ?? '' : '';
              return (
                <div key={v.id} className={`vehicle-row ${selectedId === v.id ? 'selected' : ''}`} onClick={() => onSelect(v.id)} data-testid="vehicle-row">
                  <StatusBadge game={game} meaning={v.rt.status} />
                  <div style={{ minWidth: 0 }}>
                    <div className="ellipsis">{v.callsign}</div>
                    {info && <div className={`small ellipsis ${av && !av.available ? 'field-error' : 'muted'}`}>{info}</div>}
                  </div>
                  <span className="small muted" title={`Funkrufgruppe ${radioGroupOf(game.center, v)?.name ?? ''}`}>
                    {t?.code} <span className="mono dim">{radioGroupOf(game.center, v)?.code}</span>
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function VehicleDetail({ game, vehicleId, onClose, onOpenIncident }: { game: GameState; vehicleId: string; onClose: () => void; onOpenIncident: (id: string) => void }) {
  const v = game.center.vehicles.find((x) => x.id === vehicleId);
  if (!v) return null;
  const now = game.runtime.clock.now;
  const t = game.center.vehicleTypes.find((x) => x.id === v.typeId);
  const st = game.center.stations.find((x) => x.id === v.stationId);
  const av = vehicleAvailability(game, v);
  return (
    <div className="panel" style={{ flex: '0 0 auto', borderBottom: '1px solid var(--line)' }} data-testid="vehicle-detail">
      <div className="panel-head">
        <StatusBadge game={game} meaning={v.rt.status} />
        <h4 className="grow ellipsis" style={{ textTransform: 'none', letterSpacing: 0 }}>{v.callsign}</h4>
        <button className="btn ghost small" onClick={onClose} aria-label="Fahrzeugdetails schließen">✕</button>
      </div>
      <div className="panel-body pad col small" style={{ gap: 4 }}>
        <div>{t?.name} ({t?.code}) · {st?.name} · {v.identifier}</div>
        <div>Funkrufgruppe: <span className="mono">{radioGroupOf(game.center, v)?.code}</span> – {radioGroupOf(game.center, v)?.name}</div>
        <div>Fähigkeiten: <span className="muted">{t?.capabilities.join(', ')}</span></div>
        <div>Status seit {fmtClock(v.rt.lastStatusChange)}{v.rt.move ? ` · Ankunft in ${formatDuration(v.rt.move.arriveAt - now)}` : ''}</div>
        {v.rt.incidentId && (
          <div>
            Einsatz: <a href="#" onClick={(e) => (e.preventDefault(), onOpenIncident(v.rt.incidentId!))}>öffnen</a>
          </div>
        )}
        {!av.available && av.reason && <div className="field-error">{av.reason}</div>}
        <div className="row">
          {v.rt.status === 'ausser_dienst' ? (
            <button className="btn small" onClick={() => store.run((s) => setVehicleServiceStatus(s, v.id, true))}>Status 2 – in Dienst</button>
          ) : (
            <button className="btn small" disabled={Boolean(v.rt.incidentId)} onClick={() => store.run((s) => setVehicleServiceStatus(s, v.id, false))}>Status 6 – außer Dienst</button>
          )}
          <span className="dim">Alarme: {v.rt.alarms}</span>
        </div>
      </div>
    </div>
  );
}

const KIND_ICON: Record<EventKind, string> = { notruf: '☎', alarm: '🔔', status: '•', funk: '📻', nachforderung: '➕', einsatz: '▸', abschluss: '✓', system: 'ℹ', warnung: '⚠' };

export function EventLog({ game }: { game: GameState }) {
  const [filter, setFilter] = useState<'alle' | 'ohne_status'>('ohne_status');
  const events = game.runtime.events;
  const shown = [];
  for (let i = events.length - 1; i >= 0 && shown.length < 150; i--) {
    if (filter === 'ohne_status' && events[i].kind === 'status') continue;
    shown.push(events[i]);
  }
  return (
    <div className="panel">
      <div className="panel-head">
        <h4 className="grow">Ereignisprotokoll</h4>
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} aria-label="Protokollfilter" className="small">
          <option value="ohne_status">ohne Statuswechsel</option>
          <option value="alle">alle Ereignisse</option>
        </select>
      </div>
      <div className="panel-body" data-testid="event-log">
        {shown.map((e) => (
          <div key={e.id} className={`log-line k-${e.kind}`}>
            <span className="t">{fmtClock(e.at)}</span>
            <span>{KIND_ICON[e.kind]}</span>
            <span>{e.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

