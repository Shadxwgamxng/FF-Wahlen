import type { GameState, KeywordCategory } from '../model/types';

/**
 * Kennzahlen – ausschließlich aus tatsächlichen Simulationsereignissen berechnet
 * (Archiv, laufende Einsätze, Fahrzeug-Zeitkonten, Notrufzähler).
 */
export interface Stats {
  incidentsTotal: number;
  incidentsOpen: number;
  incidentsClosed: number;
  byCategory: { category: KeywordCategory; count: number }[];
  byHour: number[];
  avgDispatchMs: number | null;
  avgResponseMs: number | null;
  avgBindingMs: number | null;
  backupRate: number | null;
  keywordAccuracy: number | null;
  callsTotal: number;
  callsMissed: number;
  avgCallWaitMs: number | null;
  vehicles: { id: string; callsign: string; utilization: number; availability: number; alarms: number }[];
  simulatedMs: number;
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

export function computeStats(g: GameState): Stats {
  const rt = g.runtime;
  const arch = rt.archive;
  const all = [
    ...arch.map((a) => ({ category: a.category, createdAt: a.createdAt })),
    ...rt.incidents.map((i) => ({ category: i.category, createdAt: i.createdAt })),
  ];
  const cats = new Map<KeywordCategory, number>();
  const byHour = new Array(24).fill(0);
  for (const i of all) {
    cats.set(i.category, (cats.get(i.category) ?? 0) + 1);
    byHour[new Date(i.createdAt).getUTCHours()]++;
  }
  const withAlarm = [...arch, ...rt.incidents].filter((i) => i.firstAlarmAt !== null);
  const dispatch = withAlarm.map((i) => {
    const call = 'callReceivedAt' in i ? i.callReceivedAt : rt.calls.find((c) => c.id === i.callId)?.receivedAt ?? null;
    return i.firstAlarmAt! - (call ?? i.createdAt);
  });
  const response = withAlarm.filter((i) => i.firstArrivalAt !== null).map((i) => i.firstArrivalAt! - i.firstAlarmAt!);
  const binding = arch.filter((a) => a.firstAlarmAt !== null).map((a) => a.closedAt - a.firstAlarmAt!);
  const judged = arch.filter((a) => a.keywordCorrect !== null);
  const vehicles = g.center.vehicles.map((v) => {
    const t = v.rt.statMs.available + v.rt.statMs.busy + v.rt.statMs.outOfService;
    return {
      id: v.id,
      callsign: v.callsign,
      utilization: t > 0 ? v.rt.statMs.busy / t : 0,
      availability: t > 0 ? v.rt.statMs.available / t : 0,
      alarms: v.rt.alarms,
    };
  });
  return {
    incidentsTotal: all.length,
    incidentsOpen: rt.incidents.length,
    incidentsClosed: arch.length,
    byCategory: [...cats.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count),
    byHour,
    avgDispatchMs: avg(dispatch),
    avgResponseMs: avg(response),
    avgBindingMs: avg(binding),
    backupRate: arch.length ? arch.filter((a) => a.backupCount > 0).length / arch.length : null,
    keywordAccuracy: judged.length ? judged.filter((a) => a.keywordCorrect).length / judged.length : null,
    callsTotal: rt.stats.callsTotal,
    callsMissed: rt.stats.callsMissed,
    avgCallWaitMs: rt.stats.callsAnswered ? rt.stats.callWaitMsTotal / rt.stats.callsAnswered : null,
    vehicles: vehicles.sort((a, b) => b.utilization - a.utilization),
    simulatedMs: rt.clock.now - rt.clock.startedAt,
  };
}
