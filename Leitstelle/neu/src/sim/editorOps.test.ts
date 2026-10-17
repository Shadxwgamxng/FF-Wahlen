import { describe, expect, it } from 'vitest';
import { createEmptyCenter, createSampleCenter, emptyVehicleRuntime } from '../data/sampleCenter';
import type { GameState, Person, Station, Vehicle } from '../model/types';
import { acceptCall, alarmVehicles, askQuestion, createGame, createIncidentFromCall, setCallKeyword, tick, injectScenarioCall } from './engine';
import { deleteKeyword, deleteStation, deleteVehicle, saveKeyword, savePerson, saveStation, saveStatusDef, saveVehicle, deleteVehicleType } from './editorOps';
import { suggestForIncident } from './dispatch';
import { vehicleAvailability } from './availability';

const station = (over: Partial<Station> = {}): Station => ({
  id: 'st_x',
  name: 'Wache X',
  kind: 'feuerwache',
  organizationId: 'org_bf',
  position: [50.6, 9.6],
  address: '',
  capacity: 2,
  turnoutSeconds: 60,
  ...over,
});

const vehicle = (g: GameState, over: Partial<Vehicle> = {}): Vehicle => ({
  id: 'v_x',
  callsign: 'Florian X 1/44-1',
  typeId: 'lf20',
  organizationId: '',
  stationId: 'st_x',
  identifier: '',
  equipment: [],
  serviceWindows: [],
  maintenance: [],
  rt: emptyVehicleRuntime([0, 0], g.runtime.clock.now),
  ...over,
});

describe('Leitstellen-Editor: eigene Leitstelle von Grund auf', () => {
  it('leere Leitstelle -> Wache -> Fahrzeug -> Personal -> Notruf -> Alarm', () => {
    const g = createGame(createEmptyCenter('ILS Test'));
    g.runtime.nextCallAt = Number.MAX_SAFE_INTEGER;
    expect(g.center.vehicles).toHaveLength(0);
    expect(saveStation(g, station(), true)).toBeNull();
    expect(saveVehicle(g, vehicle(g), true)).toBeNull();
    const v = g.center.vehicles[0];
    expect(v.organizationId).toBe('org_bf'); // von der Wache übernommen
    expect(v.rt.position).toEqual([50.6, 9.6]);
    // ohne Personal nicht besetzbar
    expect(vehicleAvailability(g, v).available).toBe(false);
    const quals: [string, string[]][] = [
      ['gf', ['gf', 'agt', 'tm', 'ma']],
      ['ma', ['ma', 'tm', 'agt']],
      ['a1', ['agt', 'tm']],
      ['a2', ['agt', 'tm']],
      ['t1', ['tm']],
      ['t2', ['tm']],
    ];
    for (const [id, q] of quals) {
      const p: Person = { id, name: id, stationId: 'st_x', qualifications: q, shift: '24h', absences: [] };
      expect(savePerson(g, p, true)).toBeNull();
    }
    expect(vehicleAvailability(g, v).available).toBe(true);
    // Notruf -> Einsatz -> Vorschlag enthält das eigene Fahrzeug
    expect(injectScenarioCall(g, 'brand_muell').ok).toBe(true);
    const call = g.runtime.calls[0];
    acceptCall(g, call.id);
    askQuestion(g, call.id, 'ort');
    setCallKeyword(g, call.id, 'kw_b_1');
    const r = createIncidentFromCall(g, call.id);
    expect(r.ok).toBe(true);
    const inc = g.runtime.incidents[0];
    const sug = suggestForIncident(g, inc);
    expect(sug.proposal.map((p) => p.vehicleId)).toEqual(['v_x']);
    expect(alarmVehicles(g, inc.id, ['v_x']).ok).toBe(true);
    expect(v.rt.crewIds).toHaveLength(6);
    for (let i = 0; i < 200; i++) tick(g, 10_000);
    expect(['anfahrt', 'einsatzort']).toContain(v.rt.status);
  });
});

describe('Editor-Regeln', () => {
  it('verhindert doppelte Namen, Überbelegung und Löschen mit Abhängigkeiten', () => {
    const g = createGame(createSampleCenter());
    expect(saveStation(g, station({ name: 'Feuerwache 1 Bergstadt' }), true)).toContain('existiert bereits');
    expect(saveStation(g, station({ capacity: 1 }), true)).toBeNull();
    expect(saveVehicle(g, vehicle(g), true)).toBeNull();
    expect(saveVehicle(g, vehicle(g, { id: 'v_y', callsign: 'Florian Y' }), true)).toContain('keinen freien Stellplatz');
    expect(saveVehicle(g, vehicle(g, { id: 'v_z', callsign: 'florian x 1/44-1' }), true)).toContain('bereits vergeben');
    expect(deleteStation(g, 'st_x')).toContain('Fahrzeug');
    expect(deleteVehicleType(g, 'lf20')).toContain('verwendet');
    expect(deleteVehicle(g, 'v_x')).toBeNull();
    expect(deleteStation(g, 'st_x')).toBeNull();
  });

  it('Bearbeiten übernimmt keine veralteten Laufzeitdaten aus dem Formular', () => {
    const g = createGame(createSampleCenter());
    const v = g.center.vehicles[3];
    const draft = structuredClone(v);
    v.rt.status = 'anfahrt';
    v.rt.incidentId = 'i_1';
    draft.identifier = 'NEU';
    expect(saveVehicle(g, draft, false)).toBeNull();
    const saved = g.center.vehicles.find((x) => x.id === v.id)!;
    expect(saved.identifier).toBe('NEU');
    expect(saved.rt.status).toBe('anfahrt');
    expect(deleteVehicle(g, v.id)).toContain('Einsatz');
  });

  it('Wechsel der Wache verlegt freies Fahrzeug auf die neue Wache', () => {
    const g = createGame(createSampleCenter());
    const v = g.center.vehicles.find((x) => x.typeId === 'rtw')!;
    expect(saveVehicle(g, { ...structuredClone(v), stationId: 'st_rw_lin' }, false)).toBeNull();
    const st = g.center.stations.find((s) => s.id === 'st_rw_lin')!;
    expect(g.center.vehicles.find((x) => x.id === v.id)!.rt.position).toEqual(st.position);
  });

  it('Stichwort mit laufendem Einsatz kann nicht gelöscht werden; neues Stichwort erhält AAO', () => {
    const g = createGame(createSampleCenter());
    expect(saveKeyword(g, { id: 'kw_neu', code: 'B SILO', label: 'Silobrand', category: 'brand', priority: 1 }, true)).toBeNull();
    expect(g.center.aao.some((a) => a.keywordId === 'kw_neu')).toBe(true);
    injectScenarioCall(g, 'brand_muell');
    const c = g.runtime.calls[g.runtime.calls.length - 1];
    acceptCall(g, c.id);
    askQuestion(g, c.id, 'ort');
    setCallKeyword(g, c.id, 'kw_neu');
    createIncidentFromCall(g, c.id);
    expect(deleteKeyword(g, 'kw_neu')).toContain('laufenden Einsatz');
  });

  it('Statuscodes sind konfigurierbar, aber eindeutig', () => {
    const g = createGame(createSampleCenter());
    expect(saveStatusDef(g, { meaning: 'einsatzort', code: 'E', label: 'Eingetroffen', color: '#ff0000' })).toBeNull();
    expect(g.center.statusDefs.find((s) => s.meaning === 'einsatzort')!.code).toBe('E');
    expect(saveStatusDef(g, { meaning: 'anfahrt', code: 'E', label: 'x', color: '#000' })).toContain('bereits vergeben');
  });
});
