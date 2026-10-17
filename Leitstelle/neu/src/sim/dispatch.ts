import type { AaoRequirement, GameState, Hospital, Incident, LatLng, Patient, Vehicle, VehicleType } from '../model/types';
import { vehicleAvailability } from './availability';
import { distanceMeters, travelTimeMs } from './geo';
import { EMERGENCY_FACTOR, getRoute } from './routing';

/**
 * Einsatzmittelvorschlag (nachvollziehbar, deterministisch).
 *
 * Bedarf = AAO des gewählten Stichworts + quittierte/empfangene Nachforderungen
 *          − Fähigkeiten der bereits gebundenen Fahrzeuge.
 * Für jeden offenen Bedarf werden verfügbare Fahrzeuge mit passender Fähigkeit nach
 * geschätzter Eintreffzeit (Ausrückzeit + Fahrzeit) sortiert. Fahrzeuge aus nicht
 * zuständigen Wachen erhalten einen Malus von 90 s. Ein gewähltes Fahrzeug deckt alle
 * seine Fähigkeiten ab (z. B. HLF 20 = Löschen + TH + schwere TH).
 */

export const MEDICAL_CAPS = new Set(['rtw', 'ktw', 'notarzt', 'intensiv', 'rth']);
const OUT_OF_AREA_PENALTY_MS = 90_000;

export function typeOf(state: GameState, v: Vehicle): VehicleType | undefined {
  return state.center.vehicleTypes.find((t) => t.id === v.typeId);
}

export function capsOf(state: GameState, v: Vehicle): string[] {
  return typeOf(state, v)?.capabilities ?? [];
}

/** Summiert Bedarfe gleicher Fähigkeit */
export function mergeRequirements(...lists: AaoRequirement[][]): AaoRequirement[] {
  const m = new Map<string, number>();
  for (const l of lists) for (const r of l) m.set(r.capability, (m.get(r.capability) ?? 0) + r.count);
  return [...m.entries()].filter(([, c]) => c > 0).map(([capability, count]) => ({ capability, count }));
}

/** Offener Bedarf nach Abzug der Fähigkeiten der gegebenen Fahrzeuge */
export function openRequirements(state: GameState, reqs: AaoRequirement[], vehicles: Vehicle[]): AaoRequirement[] {
  const have = new Map<string, number>();
  for (const v of vehicles) for (const c of capsOf(state, v)) have.set(c, (have.get(c) ?? 0) + 1);
  // RTH kann als Notarztzubringer und Rettungsmittel gelten
  return reqs
    .map((r) => ({ capability: r.capability, count: Math.max(0, r.count - (have.get(r.capability) ?? 0)) }))
    .filter((r) => r.count > 0);
}

/** Abdeckungsgrad 0..1 der Bedarfe durch Fahrzeuge */
export function coverage(state: GameState, reqs: AaoRequirement[], vehicles: Vehicle[]): number {
  const total = reqs.reduce((s, r) => s + r.count, 0);
  if (total === 0) return 1;
  const open = openRequirements(state, reqs, vehicles).reduce((s, r) => s + r.count, 0);
  return (total - open) / total;
}

export function aaoRequirements(state: GameState, inc: Incident): AaoRequirement[] {
  const rule = state.center.aao.find((a) => a.keywordId === inc.keywordId);
  const backups = inc.backupRequests.map((b) => b.requirements);
  return mergeRequirements(rule?.requirements ?? [], ...backups);
}

export interface Candidate {
  vehicle: Vehicle;
  type: VehicleType | undefined;
  available: boolean;
  reason: string | null;
  etaMs: number;
  distanceM: number;
  inArea: boolean;
  /** ETA aus echter Straßenroute (sonst Näherung) */
  routed: boolean;
  /** Fähigkeiten, die offenen Bedarf decken */
  matches: string[];
}

export function etaFor(state: GameState, v: Vehicle, target: LatLng): { etaMs: number; distanceM: number; routed: boolean } {
  const type = typeOf(state, v);
  const station = state.center.stations.find((s) => s.id === v.stationId);
  const distanceM = distanceMeters(v.rt.position, target);
  let turnout = 0;
  if (v.rt.status === 'frei_wache') turnout = (station?.turnoutSeconds ?? 60) * 1000;
  if (v.external) turnout += v.external.requestDelaySeconds * 1000;
  const route = type?.airborne ? undefined : getRoute(v.rt.position, target);
  const drive = route
    ? route.durationS * 1000 * EMERGENCY_FACTOR
    : travelTimeMs(v.rt.position, target, { speedKmh: type?.speedKmh ?? 50, detourFactor: state.center.settings.detourFactor, airborne: type?.airborne, emergency: true });
  return { etaMs: turnout + drive, distanceM: route ? route.distanceM : distanceM, routed: Boolean(route) };
}

export interface Suggestion {
  required: AaoRequirement[];
  open: AaoRequirement[];
  proposal: { vehicleId: string; reasons: string[] }[];
  unfilled: AaoRequirement[];
  candidates: Candidate[];
}

export function suggestForIncident(state: GameState, inc: Incident): Suggestion {
  const required = aaoRequirements(state, inc);
  const bound = state.center.vehicles.filter((v) => inc.activeVehicleIds.includes(v.id));
  // Nach Ende der Maßnahmen werden keine weiteren Kräfte vorgeschlagen
  const finished = inc.state === 'abarbeitung_beendet' || inc.state === 'abgeschlossen';
  const open = finished ? [] : openRequirements(state, required, bound);
  const area = state.center.areas.find((a) => a.id === inc.areaId);
  const openCaps = new Set(open.map((o) => o.capability));

  const candidates: Candidate[] = state.center.vehicles
    .filter((v) => !inc.activeVehicleIds.includes(v.id))
    .map((v) => {
      const av = vehicleAvailability(state, v);
      const { etaMs, distanceM, routed } = etaFor(state, v, inc.position);
      const caps = capsOf(state, v);
      return {
        vehicle: v,
        type: typeOf(state, v),
        available: av.available,
        reason: av.reason,
        etaMs,
        distanceM,
        routed,
        inArea: !area || area.responsibleStationIds.includes(v.stationId),
        matches: caps.filter((c) => openCaps.has(c)),
      };
    })
    .sort((a, b) => a.etaMs - b.etaMs);

  // Greedy-Auswahl
  const remaining = new Map(open.map((o) => [o.capability, o.count]));
  const chosen: Suggestion['proposal'] = [];
  const chosenIds = new Set<string>();
  // seltene Fähigkeiten zuerst, damit Mehrzweckfahrzeuge nicht "verbraucht" werden
  const order = [...open].sort(
    (a, b) => candidates.filter((c) => c.available && c.matches.includes(a.capability)).length - candidates.filter((c) => c.available && c.matches.includes(b.capability)).length,
  );
  for (const req of order) {
    while ((remaining.get(req.capability) ?? 0) > 0) {
      const best = candidates
        .filter((c) => c.available && !chosenIds.has(c.vehicle.id) && c.matches.includes(req.capability))
        .map((c) => ({ c, score: c.etaMs + (c.inArea ? 0 : OUT_OF_AREA_PENALTY_MS) }))
        .sort((a, b) => a.score - b.score)[0];
      if (!best) break;
      chosenIds.add(best.c.vehicle.id);
      const covered: string[] = [];
      for (const cap of best.c.matches) {
        const n = remaining.get(cap) ?? 0;
        if (n > 0) {
          remaining.set(cap, n - 1);
          covered.push(cap);
        }
      }
      const reasons = [
        `deckt: ${covered.join(', ')}`,
        `ETA ≈ ${Math.round(best.c.etaMs / 60000)} min`,
        best.c.inArea ? 'zuständig' : 'nicht zuständig (Malus 90 s)',
      ];
      if (best.c.vehicle.rt.status === 'frei_funk') reasons.push('frei über Funk (unterwegs)');
      chosen.push({ vehicleId: best.c.vehicle.id, reasons });
    }
  }
  const unfilled = [...remaining.entries()].filter(([, n]) => n > 0).map(([capability, count]) => ({ capability, count }));
  return { required, open, proposal: chosen, unfilled, candidates };
}

// ---------------------------------------------------------------------------
// Krankenhaus-Zielauswahl (reine Spiellogik – keine medizinische Entscheidungshilfe)
// ---------------------------------------------------------------------------

export interface HospitalOption {
  hospital: Hospital;
  suitable: boolean;
  free: number;
  etaMs: number;
  score: number;
}

export function hospitalOptions(state: GameState, patient: Patient, from: LatLng): HospitalOption[] {
  return state.center.hospitals
    .map((h) => {
      const suitable = h.available && (h.departments.includes(patient.department) || (patient.department === 'allgemein' && h.departments.length > 0));
      const free = h.capacity - h.occupied;
      const etaMs = travelTimeMs(from, h.position, { speedKmh: 60, detourFactor: state.center.settings.detourFactor, emergency: patient.needsDoctor });
      const score = etaMs + (suitable ? 0 : 3_600_000) + (free <= 0 ? 1_800_000 : 0) + (h.available ? 0 : 10_000_000);
      return { hospital: h, suitable, free, etaMs, score };
    })
    .sort((a, b) => a.score - b.score);
}
