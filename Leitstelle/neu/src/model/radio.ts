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

/** Funkzeile hörbar? Zeilen ohne Rufgruppe (z. B. nach "Ansprechen" per Klick) immer */
export function hearsLine(line: { group?: string }, heard: Set<string>): boolean {
  return !line.group || heard.has(line.group);
}

/** Fahrzeug in einer gehörten Rufgruppe? (Ton für Sprechwunsch) */
export function hearsVehicle(c: CenterConfig, vehicleId: string | undefined, heard: Set<string>): boolean {
  if (!vehicleId) return true;
  const v = c.vehicles.find((x) => x.id === vehicleId);
  const g = v ? radioGroupOf(c, v)?.code : undefined;
  return !!g && heard.has(g);
}
