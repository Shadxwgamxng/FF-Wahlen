import { describe, expect, it } from 'vitest';
import { buildPlaceIndex, type OverpassElement } from '../geo/places';
import { buildCenter, defaultOrganizations } from '../data/centerFactory';
import { emptyMask } from '../model/mask';
import type { GameState } from '../model/types';
import { acceptCall, alarmVehicles, applyLocate, correctIncidentLocation, createGame, createIncidentFromCall, injectScenarioCall, setCallKeyword, startLocating, tick, locationCorrect, setLocateClock, processLocates, locatesDue, resolveMaskLocation, updateCallMask } from './engine';
import { suggestForIncident } from './dispatch';
import { saveVehicle } from './editorOps';
import { emptyVehicleRuntime } from '../data/sampleCenter';

const AREA = { polygons: [[[[54.0, 10.5], [54.3, 10.5], [54.3, 10.9], [54.0, 10.9]] as [number, number][]]] };
const EL: OverpassElement[] = [
  { type: 'node', id: 1, lat: 54.1, lon: 10.6, tags: { 'addr:street': 'Lindenweg', 'addr:housenumber': '3', 'addr:postcode': '23701', 'addr:city': 'Eutin', building: 'house' } },
  { type: 'node', id: 2, lat: 54.2, lon: 10.8, tags: { 'addr:street': 'Hafenstraße', 'addr:housenumber': '9', 'addr:postcode': '23730', 'addr:city': 'Neustadt', building: 'house' } },
];

function game(): GameState {
  const orgs = defaultOrganizations().map((o, i) => ({ ...o, radioGroup: { name: o.name, code: `G${i}` } }));
  const c = buildCenter({ name: 'T', operator: '', counties: [{ osmRelationId: 1, name: 'K', state: 'SH', polygons: AREA.polygons }], organizations: orgs, places: buildPlaceIndex(EL), facilities: [] });
  c.stations.push({ id: 'st', name: 'FW', kind: 'feuerwache', organizationId: 'org_bf', position: [54.15, 10.7], address: '', capacity: 5, turnoutSeconds: 60 });
  c.settings.randomBreakdowns = false;
  const g = createGame(c);
  g.runtime.nextCallAt = Number.MAX_SAFE_INTEGER;
  saveVehicle(g, { id: 'v1', callsign: 'Florian 1', typeId: 'hlf20', organizationId: '', stationId: 'st', identifier: '', equipment: [], serviceWindows: [], maintenance: [], rt: emptyVehicleRuntime([0, 0]) }, true);
  return g;
}

function call(g: GameState) {
  injectScenarioCall(g, 'th_tuer');
  const c = g.runtime.calls.at(-1)!;
  acceptCall(g, c.id);
  setCallKeyword(g, c.id, 'kw_th_tuer');
  return c;
}

describe('Einsatzmaske', () => {
  it('Einsatz entsteht an der eingetippten Adresse; unbekannte Adressen werden abgelehnt', () => {
    const g = game();
    const c = call(g);
    expect(createIncidentFromCall(g, c.id, { ...emptyMask(), street: 'Gibtsnichtweg', houseNumber: '1' })).toMatchObject({ ok: false });
    expect(createIncidentFromCall(g, c.id, { ...emptyMask(), street: '' })).toMatchObject({ ok: false });
    const r = createIncidentFromCall(g, c.id, { ...emptyMask(), street: c.location.street!, houseNumber: c.location.houseNumber!, city: c.location.city! });
    expect(r.ok).toBe(true);
    const inc = g.runtime.incidents[0];
    expect(inc.position).toEqual(c.location.position);
    expect(locationCorrect(inc)).toBe(true);
  });

  it('falsche Adresse: Kräfte finden nichts, melden sich, nach Korrektur fahren sie neu an', () => {
    const g = game();
    const c = call(g);
    const wrong = c.location.street === 'Lindenweg' ? { street: 'Hafenstraße', houseNumber: '9', city: 'Neustadt' } : { street: 'Lindenweg', houseNumber: '3', city: 'Eutin' };
    createIncidentFromCall(g, c.id, { ...emptyMask(), ...wrong });
    const inc = g.runtime.incidents[0];
    expect(locationCorrect(inc)).toBe(false);
    alarmVehicles(g, inc.id, suggestForIncident(g, inc).proposal.map((p) => p.vehicleId));
    for (let i = 0; i < 400 && !inc.locationWrongReported; i++) tick(g, 10_000);
    expect(inc.locationWrongReported).toBe(true);
    expect(inc.firstArrivalAt).toBeNull();
    expect(g.runtime.radio.some((m) => m.incidentId === inc.id && m.text.includes('keine Einsatzstelle'))).toBe(true);
    expect(correctIncidentLocation(g, inc.id, { street: c.location.street!, houseNumber: c.location.houseNumber!, postcode: '', city: c.location.city! }).ok).toBe(true);
    expect(g.center.vehicles.find((v) => v.id === 'v1')!.rt.status).toBe('anfahrt');
    for (let i = 0; i < 400 && !inc.firstArrivalAt; i++) tick(g, 10_000);
    expect(inc.firstArrivalAt).not.toBeNull();
    expect(inc.times.v1.alarm).toBeDefined();
    expect(inc.times.v1.einsatzort).toBeDefined();
  });

  it('Ortung: Festnetz liefert die Anschlussadresse, Mobilfunk einen Standort mit Ungenauigkeit', () => {
    const g = game();
    let seenFest = false;
    let seenMobil = false;
    for (let k = 0; k < 20 && !(seenFest && seenMobil); k++) {
      const c = call(g);
      expect(startLocating(g, c.id).ok).toBe(true);
      expect(c.locate!.status).toBe('laeuft');
      for (let i = 0; i < 6; i++) tick(g, 5_000);
      // Ergebnis nach Echtzeit, nicht nach Spielzeit
      expect(c.locate!.status).toBe('laeuft');
      setLocateClock(() => Date.now() + 6_001);
      processLocates(g);
      setLocateClock(null);
      expect(c.locate!.status).toBe('ok');
      if (c.phoneType === 'festnetz' && c.locate!.accuracyM === 0) {
        seenFest = true;
        expect(applyLocate(g, c.id).ok).toBe(true);
        expect(c.mask.street).toBe(c.location.street);
        expect(createIncidentFromCall(g, c.id, c.mask).ok).toBe(true);
      }
      if (c.phoneType === 'mobil') {
        seenMobil = true;
        expect(c.locate!.accuracyM).toBeGreaterThanOrEqual(15);
        expect(c.locate!.street).toBeTruthy();
      }
    }
    expect(seenFest && seenMobil).toBe(true);
  });

  it('Ortung: immer ein Ergebnis nach 3–6 Sekunden Echtzeit, auch bei angehaltener Simulation', () => {
    const g = game();
    let real = 1_000_000;
    setLocateClock(() => real);
    try {
      for (let k = 0; k < 30; k++) {
        const c = call(g);
        expect(startLocating(g, c.id).ok).toBe(true);
        const wait = c.locate!.readyAtReal! - real;
        expect(wait).toBeGreaterThanOrEqual(3000);
        expect(wait).toBeLessThanOrEqual(6000);
        real += 2_999;
        expect(locatesDue(g)).toBe(false);
        real += 3_001;
        expect(locatesDue(g)).toBe(true);
        processLocates(g); // ohne tick: Simulation steht
        expect(c.locate!.status).toBe('ok');
        expect(c.locate!.position).toBeTruthy();
      }
    } finally {
      setLocateClock(null);
    }
  });
});

describe('Objekt-Übernahme (POI)', () => {
  it('Adresse samt Position im selben Patch: Einsatzort gilt sofort als exakt', () => {
    const g = game();
    const c = call(g);
    updateCallMask(g, c.id, { object: 'Pflegeheim Haus am See', street: 'Lindenweg', houseNumber: '3', postcode: '23701', city: 'Eutin', position: [54.1001, 10.6001] });
    expect(c.mask.position).toEqual([54.1001, 10.6001]);
    expect(resolveMaskLocation(g, c.mask)).toMatchObject({ exact: true, position: [54.1001, 10.6001] });
    // spätere Handänderung der Adresse verwirft die Position wieder
    updateCallMask(g, c.id, { houseNumber: '5' });
    expect(c.mask.position).toBeNull();
  });
});
