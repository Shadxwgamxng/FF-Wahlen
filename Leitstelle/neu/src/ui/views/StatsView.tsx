import { Fragment, useMemo, useState } from 'react';
import type { GameState } from '../../model/types';
import { computeStats } from '../../sim/stats';
import { CATEGORY_LABELS } from '../../data/keywords';
import { formatDuration } from '../../sim/geo';
import { fmtClock, fmtDateTime, Tabs } from '../components/common';

const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)} %`);
const dur = (x: number | null) => (x === null ? '–' : formatDuration(x));

/** Einfaches horizontales Balkendiagramm (eine Reihe, Werte als Text, Tooltip per title) */
function Bars({ rows, format = (v: number) => String(v) }: { rows: { label: string; value: number }[]; format?: (v: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div className="col" style={{ gap: 4 }}>
      {rows.map((r) => (
        <div key={r.label} className="row" title={`${r.label}: ${format(r.value)}`}>
          <span className="small ellipsis" style={{ width: 170 }}>{r.label}</span>
          <div className="bar-track" style={{ height: 12 }}>
            <div className="bar" style={{ width: `${(r.value / max) * 100}%`, height: 12, borderRadius: '0 4px 4px 0' }} />
          </div>
          <span className="small mono" style={{ width: 60, textAlign: 'right' }}>{format(r.value)}</span>
        </div>
      ))}
      {rows.length === 0 && <div className="dim small">Noch keine Daten.</div>}
    </div>
  );
}

function HourChart({ byHour }: { byHour: number[] }) {
  const max = Math.max(1, ...byHour);
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 2, alignItems: 'end', height: 120, borderBottom: '1px solid var(--line-2)' }}>
        {byHour.map((v, h) => (
          <div key={h} title={`${h}–${h + 1} Uhr: ${v} Einsätze`} style={{ height: `${(v / max) * 100}%`, minHeight: v ? 2 : 0, background: 'var(--accent)', borderRadius: '4px 4px 0 0' }} />
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(24, 1fr)', gap: 2 }}>
        {byHour.map((_, h) => (
          <span key={h} className="dim" style={{ fontSize: 9, textAlign: 'center' }}>{h % 3 === 0 ? h : ''}</span>
        ))}
      </div>
    </div>
  );
}

export function StatsView({ game }: { game: GameState }) {
  const [tab, setTab] = useState<'kpi' | 'archiv'>('kpi');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  // Statistik nur bei Bedarf neu berechnen (alle ~5 s Simulationszeit reicht für die Anzeige)
  const bucket = Math.floor(game.runtime.clock.now / 5000);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const s = useMemo(() => computeStats(game), [bucket, game.runtime.archive.length, game.runtime.incidents.length]);
  const arch = [...game.runtime.archive].reverse().filter((a) => !q || `${a.number} ${a.keywordCode} ${a.address}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="page">
      <Tabs tabs={[['kpi', 'Kennzahlen'], ['archiv', `Einsatzarchiv (${game.runtime.archive.length})`]]} value={tab} onChange={setTab} />
      {tab === 'kpi' && (
        <div className="col" style={{ gap: 14 }}>
          <div className="small muted">Alle Werte werden aus den tatsächlichen Ereignissen dieses Spielstands berechnet (simulierte Zeit: {formatDuration(s.simulatedMs)}).</div>
          <div className="cards">
            {(
              [
                ['Einsätze gesamt', String(s.incidentsTotal)],
                ['offen / abgeschlossen', `${s.incidentsOpen} / ${s.incidentsClosed}`],
                ['Notrufe (verpasst)', `${s.callsTotal} (${s.callsMissed})`],
                ['Ø Wartezeit Notruf', dur(s.avgCallWaitMs)],
                ['Ø Dispositionszeit', dur(s.avgDispatchMs)],
                ['Ø Anfahrtszeit', dur(s.avgResponseMs)],
                ['Ø Einsatzbindung', dur(s.avgBindingMs)],
                ['Einsätze mit Nachforderung', pct(s.backupRate)],
                ['Stichwort korrekt', pct(s.keywordAccuracy)],
              ] as [string, string][]
            ).map(([l, v]) => (
              <div key={l} className="card kpi">
                <div className="v">{v}</div>
                <div className="l">{l}</div>
              </div>
            ))}
          </div>
          <div className="small dim">Dispositionszeit = Notrufeingang bis erste Alarmierung · Anfahrtszeit = erste Alarmierung bis erstes Eintreffen · Einsatzbindung = erste Alarmierung bis Abschluss.</div>
          <div className="row wrap" style={{ alignItems: 'flex-start', gap: 14 }}>
            <div className="card grow" style={{ minWidth: 320 }}>
              <h3 style={{ marginBottom: 8 }}>Einsätze nach Kategorie</h3>
              <Bars rows={s.byCategory.map((c) => ({ label: CATEGORY_LABELS[c.category], value: c.count }))} />
            </div>
            <div className="card grow" style={{ minWidth: 320 }}>
              <h3 style={{ marginBottom: 8 }}>Einsätze nach Tageszeit (Stunde)</h3>
              <HourChart byHour={s.byHour} />
            </div>
          </div>
          <div className="card">
            <h3 style={{ marginBottom: 8 }}>Fahrzeugauslastung und -verfügbarkeit</h3>
            <div style={{ maxHeight: 420, overflow: 'auto' }}>
              <table className="grid">
                <thead>
                  <tr><th>Fahrzeug</th><th>Alarme</th><th>Auslastung (gebunden)</th><th>Verfügbar</th></tr>
                </thead>
                <tbody>
                  {s.vehicles.map((v) => (
                    <tr key={v.id}>
                      <td>{v.callsign}</td>
                      <td className="mono">{v.alarms}</td>
                      <td>
                        <div className="row">
                          <div className="bar-track" style={{ height: 8, maxWidth: 200 }}><div className="bar" style={{ width: `${v.utilization * 100}%`, height: 8 }} /></div>
                          <span className="mono small">{pct(v.utilization)}</span>
                        </div>
                      </td>
                      <td className="mono small">{pct(v.availability)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
      {tab === 'archiv' && (
        <div className="col">
          <input type="search" placeholder="Archiv durchsuchen (Nummer, Stichwort, Adresse) …" value={q} onChange={(e) => setQ(e.target.value)} style={{ maxWidth: 420 }} />
          <div className="card" style={{ padding: 0 }}>
            <table className="grid">
              <thead>
                <tr><th>Nr.</th><th>Stichwort</th><th>Adresse</th><th>Beginn</th><th>Dispo</th><th>Anfahrt</th><th>EM</th><th>Nachf.</th><th>Stichwort ok</th></tr>
              </thead>
              <tbody>
                {arch.map((a) => (
                  <Fragment key={a.id}>
                    <tr onClick={() => setOpen(open === a.id ? null : a.id)} style={{ cursor: 'pointer' }}>
                      <td className="mono small">{a.number}</td>
                      <td className="mono"><b>{a.keywordCode}</b></td>
                      <td className="small">{a.address}</td>
                      <td className="small mono">{fmtDateTime(a.createdAt)}</td>
                      <td className="small mono">{a.firstAlarmAt ? formatDuration(a.firstAlarmAt - (a.callReceivedAt ?? a.createdAt)) : '–'}</td>
                      <td className="small mono">{a.firstAlarmAt && a.firstArrivalAt ? formatDuration(a.firstArrivalAt - a.firstAlarmAt) : '–'}</td>
                      <td>{a.vehicleCount}</td>
                      <td>{a.backupCount}</td>
                      <td>{a.keywordCorrect === null ? '–' : a.keywordCorrect ? '✓' : <span className="field-error">✗</span>}</td>
                    </tr>
                    {open === a.id && (
                      <tr>
                        <td colSpan={9}>
                          {a.log.map((l, i) => (
                            <div key={i} className="log-line" style={{ gridTemplateColumns: '46px 1fr' }}>
                              <span className="t">{fmtClock(l.at)}</span>
                              <span>{l.text}</span>
                            </div>
                          ))}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
                {arch.length === 0 && (
                  <tr><td colSpan={9} className="empty">Noch keine abgeschlossenen Einsätze.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
