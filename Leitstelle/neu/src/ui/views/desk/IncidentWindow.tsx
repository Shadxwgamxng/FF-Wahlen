import { useEffect, useMemo, useState } from 'react';
import type { GameState, Incident } from '../../../model/types';
import { CAPABILITIES } from '../../../data/vehicleTypes';
import {
  alarmVehicles,
  capLabel,
  changeIncidentKeyword,
  closeIncident,
  releaseAllOnScene,
  releaseVehicle,
  reqText,
  requestBackup,
} from '../../../sim/engine';
import { aaoRequirements, openRequirements, suggestForIncident } from '../../../sim/dispatch';
import { formatDuration, formatKm } from '../../../sim/geo';
import { store } from '../../../store/gameStore';
import { confirmDialog, fmtAgo, fmtClock, StatusBadge } from '../../components/common';
import { KeywordSelect } from './KeywordSelect';
import { RadioActions } from './RadioPanel';

interface Props {
  game: GameState;
  incident: Incident;
  onClose: () => void;
  onSelectVehicle: (id: string) => void;
  onShowOnMap: (pos: [number, number]) => void;
  alarmRequest: number;
}

const STATE_LABEL: Record<Incident['state'], string> = {
  neu: 'Neu – nicht disponiert',
  disponiert: 'Disponiert – Kräfte auf Anfahrt',
  vor_ort: 'Kräfte vor Ort',
  abarbeitung_beendet: 'Maßnahmen beendet – Kräfte entlassen',
  abgeschlossen: 'Abgeschlossen',
};

export function IncidentWindow({ game, incident: inc, onClose, onSelectVehicle, onShowOnMap, alarmRequest }: Props) {
  const now = game.runtime.clock.now;
  const kw = game.center.keywords.find((k) => k.id === inc.keywordId);
  const sug = useMemo(() => suggestForIncident(game, inc), [game, inc]);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [showAll, setShowAll] = useState(false);
  const [backupCap, setBackupCap] = useState('loeschen');
  const [backupCount, setBackupCount] = useState(1);

  // Bei Wechsel des Einsatzes: Vorschlag vorauswählen
  useEffect(() => {
    setSel(new Set(sug.proposal.map((p) => p.vehicleId)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inc.id, inc.activeVehicleIds.length, inc.backupRequests.length, inc.keywordId]);

  const alarm = () => {
    const ids = [...sel].filter((id) => sug.candidates.find((c) => c.vehicle.id === id)?.available);
    if (ids.length === 0) return store.toast('fehler', 'Keine verfügbaren Fahrzeuge ausgewählt.');
    store.run((s) => alarmVehicles(s, inc.id, ids));
  };
  // Tastaturkürzel "A" aus dem Leitstand
  useEffect(() => {
    if (alarmRequest > 0) alarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alarmRequest]);

  const bound = game.center.vehicles.filter((v) => inc.activeVehicleIds.includes(v.id));
  const required = aaoRequirements(game, inc);
  const open = openRequirements(game, required, bound);
  const radio = game.runtime.radio.filter((r) => r.incidentId === inc.id && !r.handled);
  const proposalReasons = new Map(sug.proposal.map((p) => [p.vehicleId, p.reasons]));
  // Reihenfolge: Vorschlag, dann passende Fahrzeuge, dann übrige – jeweils nach Eintreffzeit
  const rank = (c: (typeof sug.candidates)[number]) => (proposalReasons.has(c.vehicle.id) ? 0 : sel.has(c.vehicle.id) ? 1 : c.matches.length ? 2 : 3);
  const candidates = sug.candidates
    .filter((c) => showAll || c.available)
    .sort((a, b) => rank(a) - rank(b) || a.etaMs - b.etaMs)
    .slice(0, showAll ? 300 : 40);
  const progress = inc.workTotalMs > 0 ? Math.min(1, inc.workDoneMs / inc.workTotalMs) : 1;

  const close = async () => {
    if (inc.vehicleIds.length === 0 && !(await confirmDialog('Einsatz ohne alarmierte Kräfte abschließen (abbrechen)?', { confirmLabel: 'Abschließen' }))) return;
    if (store.run((s) => closeIncident(s, inc.id)).ok) onClose();
  };

  return (
    <div className="window" data-testid="incident-window" style={{ width: 'min(860px, 100%)' }}>
      <div className="window-head">
        <span className={`prio prio-${inc.priority}`} style={{ alignSelf: 'stretch' }} />
        <h3 className="grow ellipsis">
          <span className="mono">{kw?.code}</span> {kw?.label} <span className="muted small">· {inc.number}</span>
        </h3>
        <span className="chip">{STATE_LABEL[inc.state]}</span>
        <button className="btn ghost small" onClick={onClose} aria-label="Fenster schließen" title="Schließen (Esc)">✕</button>
      </div>
      <div className="window-body">
        <div className="row wrap" style={{ alignItems: 'flex-start' }}>
          <div className="col grow" style={{ minWidth: 260, gap: 4 }}>
            <div>
              <b>{inc.address}</b> <button className="btn small" onClick={() => onShowOnMap(inc.position)}>Karte</button>
            </div>
            <div className="muted small">{inc.description}</div>
            <div className="small mono dim">
              Angelegt {fmtClock(inc.createdAt)} ({fmtAgo(now, inc.createdAt)}) · Alarm {inc.firstAlarmAt ? fmtClock(inc.firstAlarmAt) : '–'} · Eintreffen {inc.firstArrivalAt ? fmtClock(inc.firstArrivalAt) : '–'}
            </div>
          </div>
          <label className="field" style={{ minWidth: 260 }}>
            <span>Stichwort ändern</span>
            <KeywordSelect game={game} value={inc.keywordId} onChange={(id) => id && store.run((s) => changeIncidentKeyword(s, inc.id, id))} />
          </label>
        </div>

        {inc.firstArrivalAt && (
          <div className="row">
            <span className="small muted nowrap">Maßnahmen</span>
            <div className="bar-track" title={`${Math.round(progress * 100)} %`}>
              <div className="bar" style={{ width: `${progress * 100}%`, background: progress >= 1 ? 'var(--ok)' : 'var(--accent)' }} />
            </div>
            <span className="small mono">{Math.round(progress * 100)} %</span>
          </div>
        )}

        {radio.length > 0 && (
          <div className="col">
            {radio.map((r) => (
              <div key={r.id} className="warnbox col" style={{ gap: 6 }}>
                <span>
                  <b>{game.center.vehicles.find((v) => v.id === r.vehicleId)?.callsign}:</b> {r.text}
                </span>
                <RadioActions game={game} msg={r} />
              </div>
            ))}
          </div>
        )}

        {inc.patients.length > 0 && (
          <div>
            <h4 style={{ marginBottom: 4 }}>Patienten</h4>
            <div className="row wrap">
              {inc.patients.map((p) => (
                <span key={p.id} className="chip" title={p.department}>
                  {p.label}: {PAT_LABEL[p.state]}
                  {p.needsDoctor && (p.state === 'wartet' || p.state === 'versorgt') ? ' · NA' : ''}
                  {p.hospitalId ? ` → ${game.center.hospitals.find((h) => h.id === p.hospitalId)?.name.split(' ')[0]}` : ''}
                </span>
              ))}
            </div>
          </div>
        )}

        <div>
          <div className="row" style={{ marginBottom: 4 }}>
            <h4 className="grow">Gebundene Einsatzmittel ({bound.length})</h4>
            {bound.length > 0 && (
              <button className="btn small" onClick={() => store.run((s) => releaseAllOnScene(s, inc.id))}>Alle entlassen</button>
            )}
          </div>
          {bound.length === 0 ? (
            <div className="dim small">Noch keine Fahrzeuge alarmiert.</div>
          ) : (
            <table className="grid">
              <tbody>
                {bound.map((v) => {
                  const t = game.center.vehicleTypes.find((x) => x.id === v.typeId);
                  return (
                    <tr key={v.id}>
                      <td style={{ width: 30 }}><StatusBadge game={game} meaning={v.rt.status} /></td>
                      <td><a href="#" onClick={(e) => (e.preventDefault(), onSelectVehicle(v.id))}>{v.callsign}</a></td>
                      <td className="muted">{t?.code}</td>
                      <td className="mono small">{v.rt.move ? `ETA ${formatDuration(v.rt.move.arriveAt - now)}` : v.rt.phaseUntil && v.rt.status === 'alarmiert' ? `rückt aus (${formatDuration(v.rt.phaseUntil - now)})` : ''}</td>
                      <td className="right">
                        <button className="btn small" disabled={v.rt.status === 'transport' || v.rt.status === 'am_ziel'} onClick={() => store.run((s) => releaseVehicle(s, v.id))}>Entlassen</button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {inc.state !== 'abarbeitung_beendet' && (
          <div className="col" style={{ gap: 6 }}>
            <div className="row wrap">
              <h4 className="grow">Einsatzmittelvorschlag</h4>
              <span className="small muted">Bedarf (AAO{inc.backupRequests.length ? ' + Nachforderungen' : ''}): {reqText(required) || '–'}</span>
            </div>
            {open.length === 0 ? (
              <div className="hint small">Bedarf laut AAO durch gebundene Kräfte gedeckt.</div>
            ) : (
              <div className="small">
                Offen: <b>{reqText(open)}</b>
                {sug.unfilled.length > 0 && <span className="field-error"> · Nicht verfügbar: {reqText(sug.unfilled)}</span>}
              </div>
            )}
            <div className="row">
              <button className="btn alarm" onClick={alarm} disabled={sel.size === 0} data-testid="alarm-button">
                {sel.size} Fahrzeug(e) alarmieren <kbd>A</kbd>
              </button>
              <button className="btn small" onClick={() => setSel(new Set(sug.proposal.map((p) => p.vehicleId)))}>Vorschlag übernehmen</button>
              <button className="btn small" onClick={() => setSel(new Set())}>Auswahl leeren</button>
              <span className="spacer" />
              <label className="check small">
                <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} /> auch nicht verfügbare
              </label>
            </div>
            <div style={{ maxHeight: 280, overflow: 'auto', border: '1px solid var(--line)', borderRadius: 6 }}>
              <table className="grid">
                <thead>
                  <tr>
                    <th></th>
                    <th>Fahrzeug</th>
                    <th>Typ</th>
                    <th>Status</th>
                    <th>ETA*</th>
                    <th>Entf.</th>
                    <th>Hinweis</th>
                  </tr>
                </thead>
                <tbody>
                  {candidates.map((c) => {
                    const reasons = proposalReasons.get(c.vehicle.id);
                    return (
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
                        <td className="mono nowrap">{Math.round(c.etaMs / 60000)} min</td>
                        <td className="mono small nowrap">{formatKm(c.distanceM)}</td>
                        <td className="small">
                          {!c.available ? <span className="field-error">{c.reason}</span> : reasons ? <span style={{ color: 'var(--ok)' }}>Vorschlag: {reasons.join(' · ')}</span> : c.matches.length ? `passt: ${c.matches.map(capLabel).join(', ')}` : <span className="dim">kein offener Bedarf{c.inArea ? '' : ' · nicht zuständig'}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="dim small">* ETA = Ausrückzeit + geschätzte Fahrzeit (Luftlinie × Umwegfaktor, keine Verkehrsdaten).</div>
          </div>
        )}

        <div className="row wrap">
          <span className="small muted">Bedarf manuell erhöhen:</span>
          <select value={backupCap} onChange={(e) => setBackupCap(e.target.value)} aria-label="Fähigkeit">
            {Object.entries(CAPABILITIES).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
          </select>
          <input type="number" min={1} max={10} value={backupCount} onChange={(e) => setBackupCount(Number(e.target.value))} style={{ width: 60 }} aria-label="Anzahl" />
          <button className="btn small" onClick={() => store.run((s) => requestBackup(s, inc.id, [{ capability: backupCap, count: backupCount }], 'Nachforderung durch Disponent'))}>Hinzufügen</button>
          <span className="spacer" />
          <button className="btn primary" onClick={close} disabled={inc.activeVehicleIds.length > 0} title={inc.activeVehicleIds.length ? 'Erst alle Fahrzeuge entlassen' : ''} data-testid="close-incident">
            Einsatz abschließen
          </button>
        </div>

        <details>
          <summary className="muted small">Einsatzprotokoll ({inc.log.length})</summary>
          <div style={{ maxHeight: 200, overflow: 'auto' }}>
            {[...inc.log].reverse().map((l, i) => (
              <div key={i} className="log-line" style={{ gridTemplateColumns: '46px 1fr' }}>
                <span className="t">{fmtClock(l.at)}</span>
                <span>{l.text}</span>
              </div>
            ))}
          </div>
        </details>
      </div>
    </div>
  );
}

const PAT_LABEL = { wartet: 'wartet', versorgt: 'versorgt', transport: 'im Transport', uebergeben: 'übergeben', kein_transport: 'kein Transport' } as const;

