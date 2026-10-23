import type { CenterConfig, RadioGroup, Vehicle } from './types';

/** Wirksame Funkrufgruppe eines Fahrzeugs: eigene Angabe oder die seiner Organisation */
export function radioGroupOf(c: CenterConfig, v: Vehicle): RadioGroup | null {
  if (v.radioGroup?.code) return v.radioGroup;
  return c.organizations.find((o) => o.id === v.organizationId)?.radioGroup ?? null;
}

/**
 * Rufgruppen, die ein Leitstand-PC hört: seine eigene und die seines Tablets (je höchstens eine).
 * Ohne Gruppe hört der Platz keinen Fahrzeugfunk.
 */
export function heardGroups(pcGroup: string | null | undefined, tabletGroup: string | null | undefined): Set<string> {
  const s = new Set<string>();
  if (pcGroup) s.add(pcGroup);
  if (tabletGroup) s.add(tabletGroup);
  return s;
}

/** Funkzeile hörbar? Nur aus einer geschalteten Rufgruppe – ohne Gruppe hört der Platz nichts */
export function hearsLine(line: { group?: string }, heard: Set<string>): boolean {
  return !!line.group && heard.has(line.group);
}

/** Fahrzeug in einer gehörten Rufgruppe? (Ton für Sprechwunsch) */
export function hearsVehicle(c: CenterConfig, vehicleId: string | undefined, heard: Set<string>): boolean {
  if (!vehicleId) return heard.size > 0;
  const v = c.vehicles.find((x) => x.id === vehicleId);
  const g = v ? radioGroupOf(c, v)?.code : undefined;
  return !!g && heard.has(g);
}

/** Sortierschlüssel eines Rufnamens: Ortskennzahl, Fahrzeugkennung, laufende Nummer ("… 40/44-01") */
export function callsignKey(callsign: string): [number, number, number] {
  const m = /(\d+)\s*\/\s*(\d+)(?:\s*-\s*(\d+))?/.exec(callsign);
  return m ? [Number(m[1]), Number(m[2]), Number(m[3] ?? 0)] : [Infinity, Infinity, Infinity];
}

/** Rufnamen nach Ortskennzahl sortieren; Rufnamen ohne Kennzahl (z. B. "Christoph 12") ans Ende */
export function compareCallsigns(a: string, b: string): number {
  const ka = callsignKey(a);
  const kb = callsignKey(b);
  for (let i = 0; i < 3; i++) if (ka[i] !== kb[i]) return ka[i] < kb[i] ? -1 : 1;
  return a.localeCompare(b, 'de');
}
