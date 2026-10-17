import 'fake-indexeddb/auto';
import { describe, expect, it, beforeEach } from 'vitest';
import { createSampleCenter } from '../data/sampleCenter';
import { acceptCall, createGame, tick } from '../sim/engine';
import { exportCenter, exportGame, importJson, validateStoredGame } from './schema';
import { importKeywordsCsv, importStationsCsv, importVehiclesCsv, parseCsv } from './csv';
import { projects, resetDbConnection, snapshots } from './db';
import { computeStats } from '../sim/stats';

describe('JSON-Export und -Import', () => {
  it('Leitstelle: Export -> Import ergibt identische Konfiguration', () => {
    const c = createSampleCenter();
    const text = JSON.stringify(exportCenter(c));
    const r = importJson(text);
    expect(r.ok).toBe(true);
    if (!r.ok || r.kind !== 'leitstelle') throw new Error();
    expect(r.issues).toEqual([]);
    expect(r.center.vehicles.length).toBe(c.vehicles.length);
    expect(r.center.stations.map((s) => s.id)).toEqual(c.stations.map((s) => s.id));
    expect(r.center.aao).toEqual(c.aao);
  });

  it('Spielstand: Export -> Import erhält Laufzeitzustand', () => {
    const g = createGame(createSampleCenter());
    for (let i = 0; i < 200; i++) tick(g, 10_000);
    const r = importJson(JSON.stringify(exportGame(g)));
    expect(r.ok).toBe(true);
    if (!r.ok || r.kind !== 'spielstand') throw new Error();
    expect(r.game.runtime.clock.now).toBe(g.runtime.clock.now);
    expect(r.game.runtime.calls.length).toBe(g.runtime.calls.length);
    expect(r.game.runtime.rngState).toBe(g.runtime.rngState);
  });

  it('lehnt kaputtes JSON und fremde Formate ab', () => {
    expect(importJson('{kaputt').ok).toBe(false);
    expect(importJson(JSON.stringify({ foo: 1 })).ok).toBe(false);
    expect(importJson(JSON.stringify({ format: 'leitwarte', formatVersion: 99, kind: 'leitstelle', data: {} })).ok).toBe(false);
  });

  it('repariert beschädigte Einträge und berichtet sie', () => {
    const env = exportCenter(createSampleCenter()) as { data: Record<string, unknown[]> } & object;
    const data = env.data as unknown as { vehicles: Record<string, unknown>[]; stations: unknown[]; aao: Record<string, unknown>[] };
    data.vehicles[0].typeId = 'gibt_es_nicht';
    (data.vehicles[1] as Record<string, unknown>).callsign = '';
    data.aao[0].keywordId = 'kw_unbekannt';
    data.stations.push({ id: 'kaputt' });
    const r = importJson(JSON.stringify(env));
    expect(r.ok).toBe(true);
    if (!r.ok || r.kind !== 'leitstelle') throw new Error();
    expect(r.issues.length).toBeGreaterThanOrEqual(4);
    expect(r.center.vehicles.length).toBe(createSampleCenter().vehicles.length - 2);
  });

  it('validiert gespeicherte Spielstände', () => {
    const g = createGame(createSampleCenter());
    expect(validateStoredGame(g).game).not.toBeNull();
    expect(validateStoredGame({ center: {}, runtime: {} }).game).toBeNull();
  });
});

describe('CSV-Import', () => {
  it('parst Semikolon-CSV mit Anführungszeichen', () => {
    const rows = parseCsv('name;adresse\n"Wache ""Nord""";"Weg 1; Hinterhof"\n');
    expect(rows).toEqual([{ name: 'Wache "Nord"', adresse: 'Weg 1; Hinterhof' }]);
  });

  it('importiert Wachen, Fahrzeuge und Stichwörter mit Fehlerbericht', () => {
    const c = createSampleCenter();
    const st = importStationsCsv(c, 'name;art;organisation;lat;lng;adresse;ausrueckzeit\nFF Neudorf;feuerwehrhaus;Freiwillige Feuerwehren;50,6;9,6;Dorfstr. 1;300\nKaputt;feuerwache;Unbekannt;1;1;;\n');
    expect(st.added).toBe(1);
    expect(st.errors).toHaveLength(1);
    const v = importVehiclesCsv(c, 'funkrufname,typ,wache,kennung\nFlorian Neudorf 1/44-1,LF 20,FF Neudorf,HW-1\nX,LF 99,FF Neudorf,\n', 0);
    expect(v.added).toBe(1);
    expect(v.errors[0]).toContain('LF 99');
    expect(c.vehicles.at(-1)!.stationId).toBe(c.stations.at(-1)!.id);
    const k = importKeywordsCsv(c, 'code;bezeichnung;kategorie;prioritaet;bedarf\nB SILO;Silobrand;brand;1;loeschen:2|hoehenrettung:1\n');
    expect(k.added).toBe(1);
    expect(c.aao.at(-1)!.requirements).toEqual([{ capability: 'loeschen', count: 2 }, { capability: 'hoehenrettung', count: 1 }]);
  });
});

describe('IndexedDB-Persistenz', () => {
  beforeEach(async () => {
    resetDbConnection();
    for (const p of await projects.list()) await projects.delete(p.id);
  });

  it('speichert, lädt, kopiert und löscht Leitstellen samt Spielständen', async () => {
    const g = createGame(createSampleCenter());
    for (let i = 0; i < 30; i++) tick(g, 10_000);
    await projects.put({ id: 'p1', name: 'Test', createdAt: 1, updatedAt: 2, state: g });
    await snapshots.put({ id: 's1', projectId: 'p1', name: 'Vor Schichtwechsel', kind: 'manuell', createdAt: 3, simTime: g.runtime.clock.now, state: g });
    const loaded = await projects.get('p1');
    expect(loaded!.state.runtime.clock.now).toBe(g.runtime.clock.now);
    expect(loaded!.state.center.vehicles.length).toBe(g.center.vehicles.length);
    // Kopie
    await projects.put({ ...loaded!, id: 'p2', name: 'Kopie' });
    expect((await projects.list()).map((p) => p.id).sort()).toEqual(['p1', 'p2']);
    // Spielstand laden und weiterspielen
    const snap = await snapshots.get('s1');
    const resumed = validateStoredGame(snap!.state).game!;
    const call = resumed.runtime.calls.find((c) => c.state === 'klingelt' && c.receivedAt <= resumed.runtime.clock.now);
    if (call) expect(acceptCall(resumed, call.id).ok).toBe(true);
    tick(resumed, 10_000);
    // Löschen entfernt auch Spielstände
    await projects.delete('p1');
    expect(await snapshots.listFor('p1')).toEqual([]);
    expect((await projects.list()).map((p) => p.id)).toEqual(['p2']);
  });

  it('begrenzt automatische Spielstände', async () => {
    const g = createGame(createSampleCenter());
    for (let i = 0; i < 5; i++) await snapshots.put({ id: `a${i}`, projectId: 'p', name: 'auto', kind: 'auto', createdAt: i, simTime: 0, state: g });
    await snapshots.pruneAuto('p', 3);
    expect((await snapshots.listFor('p')).map((s) => s.id)).toEqual(['a4', 'a3', 'a2']);
  });
});

describe('Statistik', () => {
  it('berechnet Kennzahlen aus echten Ereignissen', () => {
    const g = createGame(createSampleCenter());
    const s0 = computeStats(g);
    expect(s0.incidentsTotal).toBe(0);
    expect(s0.avgResponseMs).toBeNull();
    for (let i = 0; i < 360; i++) tick(g, 10_000);
    const s = computeStats(g);
    expect(s.callsTotal).toBe(g.runtime.stats.callsTotal);
    expect(s.simulatedMs).toBe(3600_000);
    expect(s.vehicles.every((v) => v.availability + v.utilization <= 1.0001)).toBe(true);
  });
});
