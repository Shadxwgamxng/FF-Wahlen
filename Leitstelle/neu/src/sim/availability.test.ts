import { describe, expect, it } from 'vitest';
import type { Vehicle } from '../model/types';
import { emptyVehicleRuntime } from '../data/sampleCenter';
import { inServiceWindow, monthOf, outOfServiceReason } from './availability';

const veh = (v: Partial<Vehicle>): Vehicle => ({ id: 'v', callsign: 'Test', typeId: 'rtw', organizationId: 'o', stationId: 's', identifier: '', equipment: [], serviceWindows: [], maintenance: [], rt: emptyVehicleRuntime([54, 10]), ...v });
const at = (iso: string) => Date.parse(iso);

describe('Dienstzeiten mit Saison', () => {
  it('Monat in UTC wie die Stunde', () => {
    expect(monthOf(at('2026-05-01T00:00:00Z'))).toBe(5);
    expect(monthOf(at('2026-04-30T23:59:00Z'))).toBe(4);
  });

  it('Fenster gilt nur in den angegebenen Monaten; ohne Monate ganzjährig', () => {
    const season = veh({ serviceWindows: [{ fromHour: 7, toHour: 19, weekdays: [], months: [5, 6, 7, 8, 9] }] });
    expect(inServiceWindow(season, at('2026-05-01T10:00:00Z'))).toBe(true);
    expect(inServiceWindow(season, at('2026-09-30T18:59:00Z'))).toBe(true);
    expect(inServiceWindow(season, at('2026-09-30T19:00:00Z'))).toBe(false);
    expect(inServiceWindow(season, at('2026-10-01T10:00:00Z'))).toBe(false);
    expect(inServiceWindow(season, at('2026-04-30T10:00:00Z'))).toBe(false);
    expect(outOfServiceReason(season, at('2026-12-24T10:00:00Z'))).toBe('Außerhalb der Dienstzeit');
    // Winterdienst über den Jahreswechsel, leere Monatsliste = ganzjährig
    const winter = veh({ serviceWindows: [{ fromHour: 0, toHour: 24, weekdays: [], months: [12, 1, 2] }] });
    expect(inServiceWindow(winter, at('2027-01-15T03:00:00Z'))).toBe(true);
    expect(inServiceWindow(winter, at('2026-07-15T03:00:00Z'))).toBe(false);
    const always = veh({ serviceWindows: [{ fromHour: 7, toHour: 19, weekdays: [1, 2, 3, 4, 5], months: [] }] });
    expect(inServiceWindow(always, at('2026-12-21T10:00:00Z'))).toBe(true); // Montag
  });

  it('dauerhaft außer Dienst hat Vorrang vor allem anderen', () => {
    expect(outOfServiceReason(veh({ outOfService: true }), at('2026-07-01T10:00:00Z'))).toBe('Dauerhaft außer Dienst');
  });
});
