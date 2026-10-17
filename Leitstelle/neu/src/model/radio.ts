import type { CenterConfig, RadioGroup, Vehicle } from './types';

/** Wirksame Funkrufgruppe eines Fahrzeugs: eigene Angabe oder die seiner Organisation */
export function radioGroupOf(c: CenterConfig, v: Vehicle): RadioGroup | null {
  if (v.radioGroup?.code) return v.radioGroup;
  return c.organizations.find((o) => o.id === v.organizationId)?.radioGroup ?? null;
}
