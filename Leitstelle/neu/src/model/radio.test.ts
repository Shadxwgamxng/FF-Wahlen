import { describe, expect, it } from 'vitest';
import type { CenterConfig } from './types';
import { heardGroups, hearsLine, hearsVehicle } from './radio';

const center = {
  organizations: [{ id: 'o1', radioGroup: { code: 'FW-1', name: 'Feuerwehr' } }],
  vehicles: [
    { id: 'v1', organizationId: 'o1' },
    { id: 'v2', organizationId: 'o1', radioGroup: { code: 'RD-2', name: 'Rettungsdienst' } },
    { id: 'v3', organizationId: 'ox' },
  ],
} as unknown as CenterConfig;

describe('Rufgruppen hören', () => {
  it('PC hört eigene Gruppe und die seines Tablets, sonst keine', () => {
    expect([...heardGroups('FW-1', 'RD-2')].sort()).toEqual(['FW-1', 'RD-2']);
    expect([...heardGroups('FW-1', null)]).toEqual(['FW-1']);
    expect(heardGroups('', null).size).toBe(0);
  });

  it('Funkzeilen nur aus gehörten Gruppen – ohne geschaltete Gruppe nichts', () => {
    const heard = heardGroups('FW-1', null);
    expect(hearsLine({ group: 'FW-1' }, heard)).toBe(true);
    expect(hearsLine({ group: 'RD-2' }, heard)).toBe(false);
    expect(hearsLine({}, heard)).toBe(false);
    expect(hearsLine({}, heardGroups(null, null))).toBe(false);
    expect(hearsLine({ group: 'FW-1' }, heardGroups(null, null))).toBe(false);
  });

  it('Sprechwunsch-Ton nur für Fahrzeuge in gehörter Gruppe', () => {
    const heard = heardGroups(null, 'RD-2');
    expect(hearsVehicle(center, 'v2', heard)).toBe(true);
    expect(hearsVehicle(center, 'v1', heard)).toBe(false);
    expect(hearsVehicle(center, 'v3', heard)).toBe(false);
    expect(hearsVehicle(center, undefined, heard)).toBe(true);
    expect(hearsVehicle(center, 'v1', heardGroups(null, null))).toBe(false);
  });
});
