import type { GameState, Incident, Station, Vehicle } from '../model/types';
import { hourOf, vehicleAvailability, weekdayOf } from './availability';
import { aaoRequirements, capsOf, etaFor, openRequirements, type Suggestion } from './dispatch';

/**
 * Alarmgruppen der Freiwilligen Feuerwehren.
 * Freiwillige Wehren werden nicht fahrzeugweise alarmiert, sondern als Alarmgruppe (eine Gruppe je
 * Feuerwehrhaus). Die Wehr entscheidet nach der Lage (AAO-Bedarf des Einsatzes), mit welchen
 * Fahrzeugen sie ausrückt. Die Ausrückzeit hängt von der Tageszeit ab (Mitglieder sind tagsüber
 * oft auf der Arbeit, nachts im Bett).
 */

/** Wird diese Wache über eine Alarmgruppe alarmiert? (Organisation der Art "Freiwillige Feuerwehr") */
export function isGroupStation(state: GameState, st: Station | undefined): boolean {
  if (!st) return false;
  return state.center.organizations.find((o) => o.id === st.organizationId)?.kind === 'freiwillige_feuerwehr';
}

export function isGroupVehicle(state: GameState, v: Vehicle): boolean {
  return !v.external && isGroupStation(state, state.center.stations.find((s) => s.id === v.stationId));
}

export function groupStations(state: GameState): Station[] {
  return state.center.stations.filter((s) => isGroupStation(state, s));
}

/** Name der Alarmgruppe (Wachenname) */
export const groupName = (st: Station) => st.name;

/** Fahrzeuge, die zuerst ausrücken, wenn kein bestimmter Bedarf offen ist (Löschfahrzeug vor TH vor Rest) */
const FIRST_OUT = ['loeschen', 'th', 'th_schwer'];

/**
 * Mit welchen Fahrzeugen rückt die Wehr aus? Deckt den noch offenen Bedarf des Einsatzes so gut wie
 * möglich; ist nichts mehr offen (z. B. zur Verstärkung alarmiert), rückt das erste Löschfahrzeug aus.
 * @param alsoBound Fahrzeuge, die im selben Alarm schon anderen Gruppen/Fahrzeugen zugeteilt sind
 */
export function groupDeployment(state: GameState, inc: Incident, st: Station, alsoBound: Vehicle[] = []): Vehicle[] {
  const pool = state.center.vehicles.filter((v) => v.stationId === st.id && !v.external && !inc.activeVehicleIds.includes(v.id) && vehicleAvailability(state, v).available);
  if (!pool.length) return [];
  const bound = [...state.center.vehicles.filter((v) => inc.activeVehicleIds.includes(v.id)), ...alsoBound];
  const chosen: Vehicle[] = [];
  for (;;) {
    const open = openRequirements(state, aaoRequirements(state, inc), [...bound, ...chosen]);
    const openCaps = new Map(open.map((o) => [o.capability, o.count]));
    const best = pool
      .filter((v) => !chosen.includes(v))
      .map((v) => ({ v, n: capsOf(state, v).filter((c) => (openCaps.get(c) ?? 0) > 0).length }))
      .filter((x) => x.n > 0)
      .sort((a, b) => b.n - a.n)[0];
    if (!best) break;
    chosen.push(best.v);
  }
  if (!chosen.length) {
    const first = [...pool].sort((a, b) => rankFirstOut(state, a) - rankFirstOut(state, b))[0];
    chosen.push(first);
  }
  return chosen;
}

function rankFirstOut(state: GameState, v: Vehicle): number {
  const caps = capsOf(state, v);
  const i = FIRST_OUT.findIndex((c) => caps.includes(c));
  return i < 0 ? FIRST_OUT.length : i;
}

/**
 * Faktor auf die Ausrückzeit: werktags tagsüber (6–18 Uhr) dauert es länger, nachts etwas länger,
 * abends und am Wochenende sind die Wehren am schnellsten.
 */
export function turnoutFactor(now: number): { factor: number; label: string } {
  const h = hourOf(now);
  const wd = weekdayOf(now);
  const weekday = wd >= 1 && wd <= 5;
  if (weekday && h >= 6 && h < 18) return { factor: 1.4, label: 'werktags tagsüber' };
  if (h >= 23 || h < 6) return { factor: 1.15, label: 'nachts' };
  return { factor: 1, label: weekday ? 'abends' : 'Wochenende' };
}

export interface GroupProposal {
  station: Station;
  /** voraussichtlich ausrückende Fahrzeuge */
  vehicles: Vehicle[];
  /** Fahrzeit des ersten Fahrzeugs (ohne Ausrückzeit) in ms */
  etaMs: number;
  reasons: string[];
}

/**
 * Wandelt den fahrzeugbezogenen Einsatzmittelvorschlag um: Fahrzeuge Freiwilliger Feuerwehren werden
 * durch ihre Alarmgruppe ersetzt. Liefert die vorgeschlagenen Gruppen und die übrigen Fahrzeuge.
 */
export function proposalWithGroups(state: GameState, inc: Incident, sug: Suggestion): { groups: GroupProposal[]; vehicleIds: string[] } {
  const groups = new Map<string, GroupProposal>();
  const vehicleIds: string[] = [];
  for (const p of sug.proposal) {
    const v = state.center.vehicles.find((x) => x.id === p.vehicleId);
    if (!v) continue;
    if (!isGroupVehicle(state, v)) {
      vehicleIds.push(v.id);
      continue;
    }
    const st = state.center.stations.find((s) => s.id === v.stationId)!;
    if (!groups.has(st.id)) groups.set(st.id, { station: st, vehicles: [], etaMs: Infinity, reasons: [] });
  }
  // Brand: eine Ortswehr wird zusammen mit der Hauptwehr ihrer Gemeinde alarmiert (nicht umgekehrt)
  const category = state.center.keywords.find((k) => k.id === inc.keywordId)?.category;
  const asMain = new Set<string>();
  if (category === 'brand') {
    for (const g of [...groups.values()]) {
      const main = g.station.mainStationId ? state.center.stations.find((s) => s.id === g.station.mainStationId) : undefined;
      if (main && isGroupStation(state, main) && !groups.has(main.id)) {
        groups.set(main.id, { station: main, vehicles: [], etaMs: Infinity, reasons: [] });
        asMain.add(main.id);
      }
    }
  }
  // Voraussichtliche Ausrückordnung je Gruppe (nacheinander, damit Gruppen sich nicht doppelt zählen)
  const other = state.center.vehicles.filter((v) => vehicleIds.includes(v.id));
  const taken: Vehicle[] = [...other];
  for (const g of groups.values()) {
    g.vehicles = groupDeployment(state, inc, g.station, taken);
    taken.push(...g.vehicles);
    g.etaMs = Math.min(...g.vehicles.map((v) => etaFor(state, v, inc.position).etaMs), Infinity);
    g.reasons = [`rückt voraussichtlich aus mit ${g.vehicles.map((v) => state.center.vehicleTypes.find((t) => t.id === v.typeId)?.code ?? v.typeId).join(', ')}`];
    if (asMain.has(g.station.id)) g.reasons.push('Hauptwehr der Gemeinde – bei Brand gemeinsam mit der Ortswehr alarmiert');
  }
  // mitalarmierte Hauptwehr ohne einsatzbereite Fahrzeuge entfällt
  return { groups: [...groups.values()].filter((g) => g.vehicles.length || !asMain.has(g.station.id)), vehicleIds };
}
