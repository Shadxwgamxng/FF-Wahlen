import type { GameState, Vehicle } from '../model/types';

/**
 * Verfügbarkeit von Fahrzeugen (Dienstzeiten, Wartung, Defekte). Fahrzeuge sind innerhalb
 * ihrer Dienstzeit immer besetzt – Personal wird bewusst nicht simuliert.
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

export interface Availability {
  available: boolean;
  reason: string | null;
}

/** Ist das Fahrzeug jetzt für eine neue Alarmierung disponierbar? */
export function vehicleAvailability(state: GameState, v: Vehicle): Availability {
  const now = state.runtime.clock.now;
  if (v.rt.incidentId) return { available: false, reason: 'Im Einsatz gebunden' };
  const oos = outOfServiceReason(v, now);
  if (oos) return { available: false, reason: oos };
  if (v.rt.status !== 'frei_wache' && v.rt.status !== 'frei_funk') return { available: false, reason: 'Status nicht einsatzbereit' };
  return { available: true, reason: null };
}

