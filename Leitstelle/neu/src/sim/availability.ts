import type { CenterConfig, GameState, Person, Vehicle, VehicleType } from '../model/types';

/**
 * Verfügbarkeit von Fahrzeugen und Personal.
 * Alle Funktionen sind rein (ohne Seiteneffekte) und werden von Engine, Disposition und UI
 * gemeinsam genutzt – damit gibt es genau eine Stelle für diese Regeln.
 */

export const hourOf = (t: number) => new Date(t).getUTCHours();
export const weekdayOf = (t: number) => new Date(t).getUTCDay();

export function inServiceWindow(v: Vehicle, now: number): boolean {
  if (v.serviceWindows.length === 0) return true;
  const h = hourOf(now);
  const wd = weekdayOf(now);
  return v.serviceWindows.some(
    (w) => (w.weekdays.length === 0 || w.weekdays.includes(wd)) && h >= w.fromHour && h < w.toHour,
  );
}

export function activeMaintenance(v: Vehicle, now: number) {
  return v.maintenance.find((m) => now >= m.from && now < m.to);
}

/** Grund, warum ein Fahrzeug planmäßig außer Dienst ist – oder null */
export function outOfServiceReason(v: Vehicle, now: number): string | null {
  const m = activeMaintenance(v, now);
  if (m) return `Wartung: ${m.reason}`;
  if (v.rt.breakdownUntil === -1) return 'Manuell außer Dienst';
  if (v.rt.breakdownUntil && now < v.rt.breakdownUntil) return 'Technischer Defekt';
  if (!inServiceWindow(v, now)) return 'Außerhalb der Dienstzeit';
  return null;
}

/** Deterministischer Hash für Erreichbarkeit Ehrenamtlicher (ohne Zufallszustand zu verbrauchen) */
function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

export function personOnDuty(p: Person, center: CenterConfig, now: number): boolean {
  if (p.absences.some((a) => now >= a.from && now < a.to)) return false;
  const h = hourOf(now);
  const { dayStart, dayEnd } = center.shiftModel;
  const day = h >= dayStart && h < dayEnd;
  switch (p.shift) {
    case '24h':
      return true;
    case 'tag':
      return day;
    case 'nacht':
      return !day;
    case 'ehrenamt': {
      // Erreichbarkeit wechselt je halbem Tag, deterministisch je Person
      const slot = `${p.id}:${Math.floor(now / 43200000)}`;
      const p0 = day ? center.shiftModel.volunteerDayAvailability : center.shiftModel.volunteerNightAvailability;
      return hash01(slot) < p0;
    }
  }
}

export function busyPersonIds(state: GameState): Set<string> {
  const s = new Set<string>();
  for (const v of state.center.vehicles) for (const id of v.rt.crewIds) s.add(id);
  return s;
}

export interface CrewResult {
  ok: boolean;
  crewIds: string[];
  missing: { qualification: string; count: number }[];
}

/**
 * Stellt eine Besatzung aus dienstbereitem, ungebundenem Personal der Wache zusammen.
 * Seltene Qualifikationen werden zuerst vergeben (Greedy).
 */
export function allocateCrew(state: GameState, v: Vehicle, type: VehicleType | undefined, now: number, busy = busyPersonIds(state)): CrewResult {
  if (!type || type.crewRequirements.length === 0) return { ok: true, crewIds: [], missing: [] };
  if (v.external) return { ok: true, crewIds: [], missing: [] };
  const pool = state.center.personnel.filter(
    (p) => p.stationId === v.stationId && !busy.has(p.id) && personOnDuty(p, state.center, now),
  );
  const reqs = [...type.crewRequirements].sort(
    (a, b) => pool.filter((p) => p.qualifications.includes(a.qualification)).length - pool.filter((p) => p.qualifications.includes(b.qualification)).length,
  );
  const used = new Set<string>();
  const missing: CrewResult['missing'] = [];
  for (const r of reqs) {
    let got = 0;
    // Bevorzugt Personen mit wenigen Qualifikationen, um Spezialisten zu schonen
    const cands = pool
      .filter((p) => !used.has(p.id) && p.qualifications.includes(r.qualification))
      .sort((a, b) => a.qualifications.length - b.qualifications.length);
    for (const p of cands) {
      if (got >= r.count) break;
      used.add(p.id);
      got++;
    }
    if (got < r.count) missing.push({ qualification: r.qualification, count: r.count - got });
  }
  return { ok: missing.length === 0, crewIds: [...used], missing };
}

export interface Availability {
  available: boolean;
  reason: string | null;
}

/** Ist das Fahrzeug jetzt für eine neue Alarmierung disponierbar? */
export function vehicleAvailability(state: GameState, v: Vehicle, busy?: Set<string>): Availability {
  const now = state.runtime.clock.now;
  if (v.rt.incidentId) return { available: false, reason: 'Im Einsatz gebunden' };
  const oos = outOfServiceReason(v, now);
  if (oos) return { available: false, reason: oos };
  if (v.rt.status !== 'frei_wache' && v.rt.status !== 'frei_funk') return { available: false, reason: 'Status nicht einsatzbereit' };
  if (v.rt.status === 'frei_wache') {
    const type = state.center.vehicleTypes.find((t) => t.id === v.typeId);
    const crew = allocateCrew(state, v, type, now, busy);
    if (!crew.ok) {
      const q = crew.missing.map((m) => `${m.count}× ${qualName(state.center, m.qualification)}`).join(', ');
      return { available: false, reason: `Besatzung unvollständig (fehlt: ${q})` };
    }
  }
  return { available: true, reason: null };
}

export const qualName = (c: CenterConfig, id: string) => c.qualifications.find((q) => q.id === id)?.name ?? id;
