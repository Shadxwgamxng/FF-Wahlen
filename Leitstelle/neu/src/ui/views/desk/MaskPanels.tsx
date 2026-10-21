import { useEffect, useMemo, useState } from 'react';
import type { Call, GameState, Incident } from '../../../model/types';
import { CAPABILITIES } from '../../../data/vehicleTypes';
import { capLabel, prefetchRoutes, reqText, statusDef } from '../../../sim/engine';
import { aaoRequirements, openRequirements, suggestForIncident } from '../../../sim/dispatch';
import { groupName, isGroupVehicle, proposalWithGroups, turnoutFactor } from '../../../sim/alarmGroups';
import { formatDuration, formatKm } from '../../../sim/geo';
import { radioGroupOf } from '../../../model/radio';
import { store } from '../../../store/gameStore';
import { fmtClock, StatusBadge } from '../../components/common';
import { RadioActions, radioText } from './RadioPanel';
import { setCallVoiceMuted, useCallVoiceStatus } from '../../callVoice';
import { FunkConsent } from '../../funk';

/** Gesprächsleiste: Dialog mit dem Anrufer und Fragen */
export function Gespraech({ game, call }: { game: GameState; call: Call }) {
  return (
    <div className="mask-box col" style={{ flex: 1, minHeight: 0 }}>
      <div className="mask-title">Gesprächsverlauf · {call.caller.name || 'Anrufer'} <span className="dim">({call.caller.relation})</span></div>
      <div className="dialog" style={{ overflow: 'auto', flex: 1, minHeight: 120 }} aria-label="Gesprächsverlauf">
        <div className="bubble dispatcher small">Notruf Feuerwehr und Rettungsdienst, wo genau ist der Notfallort?</div>
        <div className="bubble caller">{call.opening}</div>
        {call.dialog.map((d) => (
          <div key={d.questionId} className="col" style={{ gap: 4 }}>
            <div className="bubble dispatcher">{d.question}</div>
            <div className="bubble caller">{d.answer}</div>
          </div>
        ))}
      </div>
      {call.state === 'in_abfrage' && <Freisprechen callId={call.id} />}
      {game.runtime.clock.now - call.receivedAt > 0 && <span className="dim small">Gesprächsbeginn {fmtClock(call.acceptedAt ?? call.receivedAt, true)}</span>}
    </div>
  );
}

const VOICE_LABEL: Record<string, string> = {
  hoert: '● Freisprechen',
  spricht: 'Anrufer spricht …',
  pause: 'Pause (Funk)',
  stumm: 'Mikrofon stumm',
  aufgelegt: '☎ Anrufer hat aufgelegt',
};

/** Zustand des Freisprechens im laufenden Notruf (Mikrofon am Leitstand-PC) */
function Freisprechen({ callId }: { callId: string }) {
  const s = useCallVoiceStatus();
  if (s.callId !== callId) return null;
  return (
    <div className="col" style={{ gap: 4, margin: '4px 0' }} data-testid="freisprechen">
      <div className="row" style={{ alignItems: 'center' }}>
        <span className={`small grow funk-status ${s.state === 'hoert' ? 'on' : s.state === 'spricht' ? 'rx' : s.state === 'fehler' ? 'err' : ''}`}>
          {s.state === 'fehler' ? s.error : (VOICE_LABEL[s.state] ?? '')}
          {s.state === 'hoert' && s.interim ? ` · „${s.interim}“` : ''}
        </span>
        <button className="btn small" onClick={() => setCallVoiceMuted(!s.muted)} data-testid="freisprechen-stumm">
          {s.muted ? 'Mikrofon an' : 'Stumm'}
        </button>
      </div>
      {s.state === 'fehler' && <FunkConsent />}
    </div>
  );
}

/** Telefonat mit der Polizeileitstelle: Einsatz teilen und Kräfte anfordern (die Polizei disponiert selbst) */
export function PolizeiTelefon({ game, inc }: { game: GameState; inc: Incident }) {
  const [text, setText] = useState('');
  const p = inc.police;
  const needed = openRequirements(game, aaoRequirements(game, inc), game.center.vehicles.filter((v) => inc.activeVehicleIds.includes(v.id))).some((r) => r.capability.startsWith('polizei'));
  const send = () => {
    if (!text.trim()) return;
    store.cmd('policeTalk', inc.id, text.trim());
    setText('');
  };
  return (
    <div className="mask-box col" style={{ gap: 6 }} data-testid="polizei">
      <div className="row" style={{ alignItems: 'center' }}>
        <div className="mask-title grow">Polizei</div>
        {needed && !p?.sent.length && <span className="chip alarm small">Polizei erforderlich</span>}
        {p?.sent.length ? <span className="chip small">{p.sent.length} Streife(n) unterwegs</span> : null}
        {!p?.open ? (
          <button className="btn small primary" onClick={() => store.cmd('policeCallOpen', inc.id)} data-testid="polizei-anrufen">
            ☎ Polizei anrufen
          </button>
        ) : (
          <>
            <button className="btn small" disabled={p.shared} onClick={() => store.cmd('policeShare', inc.id)} data-testid="polizei-teilen">
              {p.shared ? 'Einsatz geteilt' : 'Einsatz teilen'}
            </button>
            <button className="btn small" onClick={() => store.cmd('policeCallClose', inc.id)}>
              Auflegen
            </button>
          </>
        )}
      </div>
      {p?.open && <Freisprechen callId={`pol:${inc.id}`} />}
      {p && p.lines.length > 0 && (
        <div className="dialog" style={{ maxHeight: 160, overflow: 'auto' }}>
          {p.lines.slice(-8).map((l, i) => (
            <div key={i} className={`bubble ${l.from === 'leitstelle' ? 'dispatcher' : 'caller'} small`}>
              {l.text}
            </div>
          ))}
        </div>
      )}
      {p?.open && (
        <form
          className="row"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input className="grow" value={text} onChange={(e) => setText(e.target.value)} placeholder="Meldung an Polizei" data-testid="polizei-input" />
          <button className="btn small" type="submit">
            Sagen
          </button>
        </form>
      )}
    </div>
  );
}

const T = (t?: number) => (t ? fmtClock(t) : '');

/** Dispoliste: alle für den Einsatz alarmierten Fahrzeuge mit Statuszeiten */
export function DispoListe({ game, inc, onSelectVehicle }: { game: GameState; inc: Incident; onSelectVehicle: (id: string) => void }) {
  const now = game.runtime.clock.now;
  return (
    <div className="mask-box">
      <div className="mask-title">Dispoliste ({inc.activeVehicleIds.length} gebunden / {inc.vehicleIds.length} alarmiert)</div>
      <div style={{ overflow: 'auto', maxHeight: 220 }}>
        <table className="grid mask-table" data-testid="dispoliste">
          <thead>
            <tr><th>St</th><th>Einsatzmittel</th><th>Typ</th><th>FuRG</th><th>Alarm</th><th>3</th><th>4</th><th>7</th><th>8</th><th>Frei</th><th>ETA</th><th></th></tr>
          </thead>
          <tbody>
            {inc.vehicleIds.map((id) => {
              const v = game.center.vehicles.find((x) => x.id === id);
              if (!v) return null;
              const t = inc.times[id] ?? {};
              const active = inc.activeVehicleIds.includes(id);
              return (
                <tr key={id} className={active ? '' : 'unavailable'}>
                  <td>{active ? <StatusBadge game={game} meaning={v.rt.status} /> : <span className="dim">–</span>}</td>
                  <td className="nowrap"><a href="#" onClick={(e) => (e.preventDefault(), onSelectVehicle(id))}>{v.callsign}</a></td>
                  <td>{game.center.vehicleTypes.find((x) => x.id === v.typeId)?.code}</td>
                  <td className="mono small">{radioGroupOf(game.center, v)?.code}</td>
                  <td className="mono small">{T(t.alarm)}</td>
                  <td className="mono small">{T(t.anfahrt)}</td>
                  <td className="mono small">{T(t.einsatzort)}</td>
                  <td className="mono small">{T(t.transport)}</td>
                  <td className="mono small">{T(t.am_ziel)}</td>
                  <td className="mono small">{T(t.frei)}</td>
                  <td className="mono small nowrap">{active && v.rt.move ? formatDuration(v.rt.move.arriveAt - now) : active && v.rt.status === 'alarmiert' && v.rt.phaseUntil ? `+${formatDuration(v.rt.phaseUntil - now)}` : ''}</td>
                  <td className="right">
                    {active && (
                      <button className="btn small" disabled={v.rt.status === 'transport' || v.rt.status === 'am_ziel'} onClick={() => store.cmd('releaseVehicle', v.id)}>
                        Entlassen
                      </button>
                    )}
                  </td>
                </tr>
              );
            })}
            {inc.vehicleIds.length === 0 && (
              <tr><td colSpan={12} className="empty">Keine Einsatzmittel alarmiert.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Maßnahmen: Einsatzmittelvorschlag, freie Auswahl und Alarmierung */
export function Massnahmen({ game, inc, alarmRequest }: { game: GameState; inc: Incident; alarmRequest: number }) {
  const sug = useMemo(() => suggestForIncident(game, inc), [game, inc]);
  const plan = useMemo(() => proposalWithGroups(game, inc, sug), [game, inc, sug]);
  // Auswahl: Fahrzeuge (hauptamtlich, RD, Polizei …) und Alarmgruppen (Freiwillige Feuerwehren, je Wache)
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [selGroups, setSelGroups] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [backupCap, setBackupCap] = useState('loeschen');
  const [backupCount, setBackupCount] = useState(1);

  useEffect(() => {
    prefetchRoutes(sug.candidates.filter((c) => c.available && !c.type?.airborne).slice(0, 15).map((c) => [c.vehicle.rt.position, inc.position]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inc.id, inc.position[0], inc.position[1]]);
  const applyProposal = () => {
    setSel(new Set(plan.vehicleIds));
    setSelGroups(new Set(plan.groups.map((g) => g.station.id)));
  };
  useEffect(() => {
    applyProposal();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inc.id, inc.activeVehicleIds.length, inc.backupRequests.length, inc.keywordId]);

  const alarm = () => {
    const ids = [...sel].filter((id) => sug.candidates.find((c) => c.vehicle.id === id)?.available);
    const groups = [...selGroups];
    if (ids.length === 0 && groups.length === 0) return store.toast('fehler', 'Keine Einsatzmittel ausgewählt.');
    if (groups.length) store.cmd('alarmGroups', inc.id, groups);
    if (ids.length) store.cmd('alarmVehicles', inc.id, ids);
  };
  useEffect(() => {
    if (alarmRequest > 0) alarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alarmRequest]);

  const bound = game.center.vehicles.filter((v) => inc.activeVehicleIds.includes(v.id));
  const required = aaoRequirements(game, inc);
  const open = openRequirements(game, required, bound);
  const reasons = new Map(sug.proposal.map((p) => [p.vehicleId, p.reasons]));
  const rank = (c: (typeof sug.candidates)[number]) => (reasons.has(c.vehicle.id) ? 0 : sel.has(c.vehicle.id) ? 1 : c.matches.length ? 2 : 3);
  const vehicleCands = sug.candidates.filter((c) => !isGroupVehicle(game, c.vehicle));
  const candidates = vehicleCands
    .filter((c) => showAll || c.available)
    .sort((a, b) => rank(a) - rank(b) || a.etaMs - b.etaMs)
    .slice(0, showAll ? 300 : 40);

  // Alarmgruppen: je Wache einer Freiwilligen Feuerwehr
  const planned = new Map(plan.groups.map((g) => [g.station.id, g]));
  const groupRows = useMemo(() => {
    const byStation = new Map<string, (typeof sug.candidates)[number][]>();
    for (const c of sug.candidates) {
      if (!isGroupVehicle(game, c.vehicle)) continue;
      byStation.set(c.vehicle.stationId, [...(byStation.get(c.vehicle.stationId) ?? []), c]);
    }
    return [...byStation.entries()]
      .map(([sid, cs]) => {
        const avail = cs.filter((c) => c.available);
        return {
          station: game.center.stations.find((s) => s.id === sid)!,
          available: avail,
          etaMs: avail.length ? Math.min(...avail.map((c) => c.etaMs)) : Infinity,
          distanceM: Math.min(...cs.map((c) => c.distanceM)),
          matches: [...new Set(avail.flatMap((c) => c.matches))],
          inArea: cs.some((c) => c.inArea),
        };
      })
      .filter((g) => g.station && (showAll || g.available.length));
  }, [sug, game, showAll]);
  const groupRank = (g: (typeof groupRows)[number]) => (planned.has(g.station.id) ? 0 : selGroups.has(g.station.id) ? 1 : g.matches.length ? 2 : 3);
  const sortedGroups = [...groupRows].sort((a, b) => groupRank(a) - groupRank(b) || a.etaMs - b.etaMs);
  // ohne "auch nicht verfügbare": vorgeschlagene/gewählte Gruppen und die 5 nächsten weiteren
  const groups = showAll ? sortedGroups : [...sortedGroups.filter((g) => groupRank(g) < 2), ...sortedGroups.filter((g) => groupRank(g) >= 2).slice(0, 5)];
  const tf = turnoutFactor(game.runtime.clock.now);

  if (inc.state === 'abarbeitung_beendet') return <div className="mask-box"><div className="mask-title">Maßnahmen</div><div className="small muted">Maßnahmen beendet.</div></div>;

  return (
    <div className="mask-box col" style={{ gap: 6 }}>
      <div className="row wrap">
        <div className="mask-title grow">Maßnahmen / Einsatzmittelvorschlag</div>
        <span className="small muted">AAO{inc.backupRequests.length ? ' + Nachforderungen' : ''}: {reqText(required) || '–'}</span>
      </div>
      {open.length === 0 ? (
        <div className="small muted">AAO gedeckt.</div>
      ) : (
        <div className="small">
          Offen: <b>{reqText(open)}</b>
          {sug.unfilled.length > 0 && <span className="field-error"> · nicht verfügbar: {reqText(sug.unfilled)}</span>}
        </div>
      )}
      <div className="row wrap">
        <button className="btn alarm" onClick={alarm} disabled={sel.size + selGroups.size === 0} data-testid="alarm-button">
          Alarmieren ({selGroups.size ? `${selGroups.size} AG` : ''}{selGroups.size && sel.size ? ' + ' : ''}{sel.size ? `${sel.size} Fzg` : ''}{!sel.size && !selGroups.size ? '0' : ''}) <kbd>A</kbd>
        </button>
        <button className="btn small" onClick={applyProposal}>Vorschlag</button>
        <button
          className="btn small"
          onClick={() => {
            setSel(new Set());
            setSelGroups(new Set());
          }}
        >
          Leeren
        </button>
        <span className="spacer" />
        <label className="check small"><input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> auch nicht verfügbare</label>
      </div>
      <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 4 }}>
        <table className="grid mask-table">
          <thead>
            <tr><th></th><th>Alarmgruppe / Fahrzeug</th><th>Typ</th><th>St</th><th>ETA</th><th>Entf.</th><th>Hinweis</th></tr>
          </thead>
          <tbody>
            {groups.length > 0 && (
              <tr className="group-head">
                <td colSpan={7} className="small muted">Alarmgruppen FF · Ausrückzeit {tf.label}{tf.factor > 1 ? ' (verlängert)' : ''}</td>
              </tr>
            )}
            {groups.map((g) => {
              const pl = planned.get(g.station.id);
              const usable = g.available.length > 0;
              return (
                <tr key={g.station.id} className={usable ? (selGroups.has(g.station.id) ? 'selected' : '') : 'unavailable'} data-testid="group-row">
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Alarmgruppe ${groupName(g.station)} auswählen`}
                      disabled={!usable}
                      checked={selGroups.has(g.station.id)}
                      onChange={(e) => {
                        const n = new Set(selGroups);
                        if (e.target.checked) n.add(g.station.id);
                        else n.delete(g.station.id);
                        setSelGroups(n);
                      }}
                    />
                  </td>
                  <td className="nowrap"><span className="chip small">AG</span> {groupName(g.station)}</td>
                  <td className="small">{g.available.map((c) => c.type?.code ?? c.vehicle.typeId).join(', ') || '–'}</td>
                  <td />
                  <td className="mono nowrap">{Number.isFinite(g.etaMs) ? `${Math.round((g.etaMs + (tf.factor - 1) * g.station.turnoutSeconds * 1000) / 60000)} min` : '–'}</td>
                  <td className="mono small nowrap">{formatKm(g.distanceM)}</td>
                  <td className="small">
                    {!usable ? <span className="field-error">keine Fahrzeuge einsatzbereit</span> : pl ? <span style={{ color: 'var(--ok)' }}>Vorschlag: {pl.reasons.join(' · ')}</span> : g.matches.length ? `passt: ${g.matches.map(capLabel).join(', ')}` : <span className="dim">kein offener Bedarf</span>}
                  </td>
                </tr>
              );
            })}
            {groups.length > 0 && candidates.length > 0 && (
              <tr className="group-head">
                <td colSpan={7} className="small muted">Fahrzeuge</td>
              </tr>
            )}
            {candidates.map((c) => (
              <tr key={c.vehicle.id} className={c.available ? (sel.has(c.vehicle.id) ? 'selected' : '') : 'unavailable'}>
                <td>
                  <input
                    type="checkbox"
                    aria-label={`${c.vehicle.callsign} auswählen`}
                    disabled={!c.available}
                    checked={sel.has(c.vehicle.id)}
                    onChange={(e) => {
                      const n = new Set(sel);
                      if (e.target.checked) n.add(c.vehicle.id);
                      else n.delete(c.vehicle.id);
                      setSel(n);
                    }}
                  />
                </td>
                <td className="nowrap">{c.vehicle.callsign}</td>
                <td>{c.type?.code}</td>
                <td><StatusBadge game={game} meaning={c.vehicle.rt.status} /></td>
                <td className="mono nowrap" title={c.routed ? 'Route' : 'Luftlinie'}>{Math.round(c.etaMs / 60000)} min{c.routed ? '' : '*'}</td>
                <td className="mono small nowrap">{formatKm(c.distanceM)}</td>
                <td className="small">
                  {!c.available ? <span className="field-error">{c.reason}</span> : reasons.get(c.vehicle.id) ? <span style={{ color: 'var(--ok)' }}>Vorschlag: {reasons.get(c.vehicle.id)!.join(' · ')}</span> : c.matches.length ? `passt: ${c.matches.map(capLabel).join(', ')}` : <span className="dim">kein offener Bedarf</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="dim small">* ETA geschätzt</div>
      <div className="row wrap">
        <span className="small muted">Nachalarmieren:</span>
        <select value={backupCap} onChange={(e) => setBackupCap(e.target.value)} aria-label="Fähigkeit">
          {Object.entries(CAPABILITIES).map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
        <input type="number" min={1} max={10} value={backupCount} onChange={(e) => setBackupCount(Number(e.target.value))} style={{ width: 56 }} aria-label="Anzahl" />
        <button className="btn small" onClick={() => store.cmd('requestBackup', inc.id, [{ capability: backupCap, count: backupCount }], 'Nachforderung durch Disponent')}>Bedarf erhöhen</button>
      </div>
    </div>
  );
}

/** Rückmeldungen: offene Sprechwünsche und Einsatzprotokoll */
export function Rueckmeldungen({ game, inc }: { game: GameState; inc: Incident }) {
  const radio = game.runtime.radio.filter((r) => r.incidentId === inc.id && !r.handled);
  return (
    <div className="mask-box col" style={{ gap: 6, flex: 1, minHeight: 0 }}>
      <div className="mask-title">Rückmeldungen</div>
      {radio.map((r) => {
        const v = game.center.vehicles.find((x) => x.id === r.vehicleId);
        return (
          <div key={r.id} className="warnbox col" style={{ gap: 4 }}>
            <span>
              <span className="status-badge" style={{ background: statusDef(game, 'sprechwunsch').color }}>{statusDef(game, 'sprechwunsch').code}</span> <b>{v?.callsign}:</b> {radioText(r)}
            </span>
            <RadioActions game={game} msg={r} />
          </div>
        );
      })}
      <div style={{ overflow: 'auto', flex: 1, minHeight: 80 }}>
        {[...inc.log].reverse().map((l, i) => (
          <div key={i} className="log-line" style={{ gridTemplateColumns: '46px 1fr' }}>
            <span className="t">{fmtClock(l.at)}</span>
            <span>{l.text}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

