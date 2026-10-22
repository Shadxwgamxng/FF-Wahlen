import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { OverpassElement } from '../../geo/places';
import { parseCsv } from '../../persistence/csv';
import { exportCenter, importJson, validateStoredGame } from '../../persistence/schema';
import { groupDeployment, groupStations, isGroupStation } from '../../sim/alarmGroups';
import { inServiceWindow, vehicleAvailability } from '../../sim/availability';
import { createGame, createManualIncident, setVehicleServiceStatus } from '../../sim/engine';
import { saveVehicle } from '../../sim/editorOps';
import { distanceMeters, pointInArea } from '../../sim/geo';
import { createOstholsteinCenter, lastPlacements, OSTHOLSTEIN, wacheKey } from './index';
import { gemeindeOf } from './gemeinden';
import { normTypeLabel, OSTHOLSTEIN_TYPES, ostholsteinVehicleTypes, resolveType } from './fahrzeugtypen';
import { buildRoster, isRealCallsign, parseServiceWindows, ROSTER_INPUT } from './roster';
import { WACHEN } from './wachen';

/** Echte OSM-Daten aus dem Süden des Kreises (siehe e2e/fixtures/README.md) */
const ELEMENTS: OverpassElement[] = JSON.parse(readFileSync(new URL('../../../e2e/fixtures/overpass-ostholstein-sued.json', import.meta.url), 'utf8')).elements;

const roster = buildRoster();
const center = createOstholsteinCenter(ELEMENTS);
const placements = [...lastPlacements];
const byCs = (cs: string) => roster.vehicles.filter((v) => v.callsign === cs);
const one = (cs: string) => {
  const hits = byCs(cs);
  expect(hits, cs).toHaveLength(1);
  return hits[0];
};
const stationNamed = (name: string) => center.stations.find((s) => s.name === name)!;
const vehicle = (cs: string) => center.vehicles.find((v) => v.callsign === cs)!;
/** Montag, 13. Juli 2026 bzw. Montag, 19. Oktober 2026 (UTC) */
const at = (iso: string) => Date.parse(iso);

describe('Fahrzeugliste Ostholstein (roster)', () => {
  it('liest alle Einträge der vollständigen Liste und kommt auf eine plausible Fahrzeugzahl', () => {
    const rows = parseCsv(ROSTER_INPUT.fahrzeuge).length;
    expect(rows).toBe(532);
    // jeder Eintrag ist Fahrzeug, zusammengeführt oder (mit Grund) weggelassen
    const mergedAway = roster.merged.filter((m) => m.reason.startsWith('=') || m.reason.startsWith('doppelt')).length;
    expect(roster.vehicles.length + roster.omitted.length + mergedAway).toBe(rows);
    expect(roster.vehicles.length).toBe(530);
    expect(one('Florian Ostholstein 42/41-06').wache).toBe('FF Wangels OF Grammdorf');
    expect(one('Florian Ostholstein 42/41-05').wache).toBe('FF Giddendorf-Seegalendorf-Gremersdorf');
    for (const o of roster.omitted) expect(o.reason.length, o.callsign).toBeGreaterThan(10);
  });

  it('keine doppelten Rufnamen; erzeugte Rufnamen im Schema "<Präfix> Ostholstein OKZ/Kenner-NN"', () => {
    const all = roster.vehicles.map((v) => v.callsign);
    expect(new Set(all).size).toBe(all.length);
    const numbers = (cs: string) => /(\d\d\/\d\d-\d\d)$/.exec(cs)?.[1];
    const realNumbers = new Set(roster.vehicles.filter((v) => !v.generated).map((v) => numbers(v.callsign)).filter(Boolean));
    for (const v of roster.vehicles.filter((x) => x.generated)) {
      expect(v.callsign).toMatch(/^(Florian|Rettung|Rotkreuz|Akkon|Sama|Pelikan|Adler|Heros|Johannes) Ostholstein \d\d\/\d\d-\d\d$/);
      // nie dieselbe Nummer wie ein echter Rufname (auch nicht mit anderem Präfix)
      expect(realNumbers.has(numbers(v.callsign)), v.callsign).toBe(false);
    }
    // Platzhalter sind nie Rufnamen
    for (const v of roster.vehicles) expect(isRealCallsign(v.callsign), v.callsign).toBe(true);
  });

  it('jede Typbezeichnung der Listen ist einem Typ zugeordnet', () => {
    const ids = new Set(ostholsteinVehicleTypes().map((t) => t.id));
    expect(roster.omitted.filter((o) => /Fahrzeugtyp/.test(o.reason))).toEqual([]);
    for (const v of roster.vehicles) expect(ids.has(v.typeId), `${v.callsign}: ${v.typeLabel} → ${v.typeId}`).toBe(true);
    // neue Typen tragen die echte Bezeichnung
    expect(resolveType('TSF-W', 'ff')).toBe('oh_tsfw');
    expect(OSTHOLSTEIN_TYPES.find((t) => t.id === 'oh_tsfw')!.code).toBe('TSF-W');
    expect(resolveType('LF 20-Kats', 'ff')).toBe(resolveType('LF 20 KatS', 'ff'));
    expect(resolveType('DLAK 23-12', 'ff')).toBe('oh_dlak');
    expect(normTypeLabel('HLF 20 (2)')).toBe('HLF 20');
    // gleiche Bezeichnung, je Organisation andere Fähigkeiten
    expect(resolveType('MTW', 'dlrg')).toBe('oh_mtw_wr');
    expect(resolveType('MTW', 'thw')).toBe('oh_mtw_thw');
    expect(resolveType('KdoW', 'rd')).toBe('elrd');
    // Typ-IDs eindeutig
    const all = ostholsteinVehicleTypes().map((t) => t.id);
    expect(new Set(all).size).toBe(all.length);
  });

  it('Fähigkeiten der neuen Typen passen zur Bezeichnung', () => {
    const caps = (id: string) => ostholsteinVehicleTypes().find((t) => t.id === id)!.capabilities;
    expect(caps('oh_mlf')).toEqual(expect.arrayContaining(['loeschen', 'th']));
    expect(caps('oh_lf2016')).toEqual(expect.arrayContaining(['loeschen', 'th', 'wasser_gross']));
    expect(caps('oh_tlf3000')).toEqual(expect.arrayContaining(['loeschen', 'wasser_gross']));
    expect(caps('oh_hlf2016')).toContain('th_schwer');
    expect(caps('oh_dla')).toContain('hoehenrettung');
    expect(caps('oh_tmb')).toContain('hoehenrettung');
    expect(caps('oh_tel')).toContain('fuehrung_2');
    expect(caps('oh_mzf')).toContain('mannschaft');
    // MTW/MZF der Hilfsorganisationen sind Mannschaftswagen, kein GW-San; ihre KdoW/ELW keine RD-Führung
    expect(caps('oh_mtw_san')).toEqual(['mannschaft']);
    expect(caps('oh_mzf_san')).toEqual(['mannschaft']);
    expect(caps('oh_kdow_san')).not.toContain('rd_fuehrung');
    expect(caps('oh_elw_san')).not.toContain('rd_fuehrung');
    const sanGross = roster.vehicles.filter((v) => caps(v.typeId).includes('san_gross')).map((v) => v.typeId);
    expect(sanGross.length).toBeGreaterThan(0);
    expect(new Set(sanGross)).toEqual(new Set(['gwsan']));
    const rdFuehrung = roster.vehicles.filter((v) => caps(v.typeId).includes('rd_fuehrung'));
    expect(rdFuehrung.map((v) => v.callsign).sort()).toEqual(['Rettung Ostholstein 01/10-02', 'Rettung Ostholstein 01/10-03']);
    expect(caps('oh_rw1')).toEqual(expect.arrayContaining(['th', 'th_schwer', 'oel']));
    expect(caps('oh_dekonp')).toContain('gefahrgut');
    expect(caps('oh_gwas')).toContain('atemschutz');
    expect(caps('oh_mtw_wr')).toContain('wasserrettung');
    expect(ostholsteinVehicleTypes().find((t) => t.id === 'oh_ktw4')!.canTransport).toBe(true);
    expect(caps('oh_gkw1')).toContain('thw_bergung');
  });

  it('Dubletten und Korrekturen des Nutzers', () => {
    // RW Eutin: nur RTW 67/83-01 und -02 (Kennzeichen OH-RD 670 vom früheren "67/83-xx"), vier KTW, NEF mit OH-R 4300
    const eutin = roster.vehicles.filter((v) => v.wache === 'rdh. RW Eutin');
    expect(eutin.filter((v) => v.typeId === 'rtw').map((v) => v.callsign)).toEqual(['Rettung Ostholstein 67/83-01', 'Rettung Ostholstein 67/83-02']);
    expect(one('Rettung Ostholstein 67/83-02').identifier).toBe('OH-RD 670');
    expect(eutin.filter((v) => v.typeId === 'ktw').map((v) => v.callsign).sort()).toEqual(['Rettung Ostholstein 67/85-01', 'Rettung Ostholstein 67/85-02', 'Rettung Ostholstein 67/85-03', 'Rettung Ostholstein 67/85-04']);
    expect(one('Rettung Ostholstein 67/85-02')).toMatchObject({ identifier: 'OH-RD 7400', organizationId: 'org_ktp' });
    expect(one('Rettung Ostholstein 67/82-01')).toMatchObject({ identifier: 'OH-R 4300', wache: 'rdh. RW Eutin', organizationId: 'org_na' });
    for (const cs of ['Rettung Ostholstein 67/83-03', 'Rettung Ostholstein 67/83-xx', 'Rettung Ostholstein XX/83-0X', 'Rettung Ostholstein xx/83-xx']) expect(byCs(cs), cs).toHaveLength(0);
    // RTW OH-RD 6800 = 89/83-01
    expect(one('Rettung Ostholstein 89/83-01').identifier).toBe('OH-RD 6800');
    expect(roster.vehicles.filter((v) => v.wache === 'rdh. RW Timmendorfer Strand' && v.typeId === 'rtw')).toHaveLength(3);
    // Oldenburg: nur zwei RTW, alle Rufnamen fest „Rotkreuz Ostholstein“
    const oldenburg = roster.vehicles.filter((v) => v.wache === 'DRK RW Oldenburg in Holstein');
    expect(oldenburg.filter((v) => v.typeId === 'rtw').map((v) => v.callsign)).toEqual(['Rotkreuz Ostholstein 40/83-01', 'Rotkreuz Ostholstein 40/83-02']);
    expect(oldenburg.every((v) => v.callsign.startsWith('Rotkreuz Ostholstein '))).toBe(true);
    expect(one('Rotkreuz Ostholstein 40/82-01').identifier).toBe('OH-RD 6710');
    expect(byCs('Rettung Ostholstein 40/82-01')).toHaveLength(0);
    // CBRN-Erkunder 03/71-01 (LZ-G) bei der FF Oldenburg, nicht Malente
    expect(one('Florian Ostholstein 03/71-01')).toMatchObject({ wache: 'FF Oldenburg in Holstein', typeId: 'oh_cbrn' });
    expect(byCs('Florian Ostholstein 03/18-01')).toHaveLength(0);
    // Süderort: LF 10 = 30/44-02; Heiligenhafen: GW-L2 35/68-01
    expect(one('Florian Ostholstein 30/44-02')).toMatchObject({ wache: 'FF Fehmarn OF Süderort', typeId: 'lf10' });
    expect(one('Florian Ostholstein 35/68-01')).toMatchObject({ wache: 'FF Heiligenhafen', typeId: 'gwl' });
    // neue Wehren in Wangels und Heringsdorf
    const at = (w: string) => roster.vehicles.filter((v) => v.wache === w).map((v) => v.typeLabel).sort();
    expect(at('FF Wangels OF Hansühn-Testorf')).toEqual(['HLF', 'MZF', 'TLF 24/50']);
    expect(at('FF Wangels OF Döhnsdorf-Weißenhaus')).toEqual(['LF 10', 'MTW']);
    expect(at('FF Heringsdorf OF Heringsdorf')).toEqual(['GW-Bahnrettung', 'HLF 10', 'MZF']);
    expect(at('FF Heringsdorf OF Fargemiel')).toEqual(['LF 10']);
    // 89/47-01: Hemmelsdorf behält die Nummer, das LF 10 der Hauptwache bekommt die nächste freie
    expect(one('Florian Ostholstein 89/47-01').wache).toBe('FF Timmendorfer Strand OF Hemmelsdorf');
    expect(one('Florian Ostholstein 89/47-03')).toMatchObject({ wache: 'FF Timmendorfer Strand OF Timmendorfer Strand', typeId: 'lf10', generated: true });
    // MZF Hemmelsdorf (evtl. identisch mit MTW 89/18-01) entfällt
    expect(roster.omitted.map((o) => `${o.wache}|${o.type}`)).toEqual(['FF Timmendorfer Strand OF Hemmelsdorf|MZF']);
    // JUH RW Bad Schwartau: alle einmal
    for (const cs of ['Akkon Ostholstein 92/83-01', 'Akkon Ostholstein 92/83-02', 'Akkon Ostholstein 92/83-03', 'Akkon Ostholstein 92/82-01', 'Rettung Ostholstein 92/85-01']) expect(one(cs).wache).toBe('JUH RW Bad Schwartau');
  });

  it('Ortswehren aus den Antworten des Nutzers', () => {
    const at = (w: string) => roster.vehicles.filter((v) => v.wache === w).map((v) => `${v.callsign} ${v.typeLabel}`).sort();
    expect(at('Feuerwehr Fehmarn Hauptamtliche Wache')).toEqual([
      'Florian Ostholstein 31/10-01 KdoW',
      'Florian Ostholstein 31/10-02 KdoW',
      'Florian Ostholstein 31/18-01 MTW',
      'Florian Ostholstein 31/48-01 HLF 20',
      'Florian Ostholstein 31/48-02 HLF 10',
    ]);
    expect(at('FF Bosau OF Bosau')).toEqual(['Florian Ostholstein 74/44-01 LF 10/6', 'Florian Ostholstein 74/78-01 MZB']);
    expect(one('Florian Ostholstein 74/78-01').typeId).toBe('oh_mzb');
    expect(one('Florian Ostholstein 03/76-01')).toMatchObject({ wache: 'FF Fehmarn OF Bisdorf-Hinrichsdorf', typeId: 'oh_gwl1' });
    expect(one('Florian Ostholstein 77/42-02')).toMatchObject({ wache: 'FF Ahrensbök OF Gnissau', typeId: 'oh_lf8' });
    expect(one('Florian Ostholstein 58/41-06').organizationId).toBe('org_ff');
    // Wasserrettungsstationen mit angenommenem Rettungsboot
    for (const w of ['DLRG WRS Burg auf Fehmarn', 'DLRG WRS Ostermade', 'DLRG WRS Großenbrode']) {
      const v = roster.vehicles.filter((x) => x.wache === w);
      expect(v.map((x) => x.typeId), w).toEqual(['oh_rboot_wr']);
      expect(v[0].callsign, w).toMatch(/^Pelikan Ostholstein \d\d\/78-\d\d$/);
    }
    // gibt es nicht bzw. dieselbe Wehr: OSM-Einträge entfallen
    for (const n of ['Freiwillige Feuerwehr Wulfsdorf', 'Freiwillige Feuerwehr Gemeinde Gremersdorf', 'Feuerwache Techelwitz']) expect(center.stations.some((s) => s.name === n), n).toBe(false);
  });

  it('Wache "unbekannt" aus Hinweis bzw. Ortskennziffer und Sonderzuordnungen', () => {
    expect(one('Pelikan Ostholstein 74/18-01').wache).toBe('DLRG Bosau');
    expect(roster.vehicles.find((v) => v.identifier === 'OH-WR 1913')).toMatchObject({ wache: 'DLRG Eutin', generated: true });
    expect(roster.vehicles.find((v) => v.identifier === 'OH-WR 1913')!.callsign).toMatch(/^Pelikan Ostholstein 67\/18-\d\d$/);
    expect(one('Rotkreuz Ostholstein 89/19-01').wache).toBe('DRK OV Timmendorfer Strand');
    // Kreisebene: Leitung rdh. (Bad Schwartau)
    for (const cs of ['Rettung Ostholstein 01/10-02', 'Rettung Ostholstein 01/10-03']) expect(one(cs)).toMatchObject({ wache: 'rdh. Leitung Bad Schwartau', typeId: 'elrd', organizationId: 'org_rd' });
    expect(roster.vehicles.some((v) => v.wache === 'unbekannt')).toBe(false);
    // GW-Dekon P der Feuerwehr beim THW Oldenburg: bleibt Feuerwehr mit Florian-Rufnamen
    expect(one('Florian Ostholstein 03/74-01')).toMatchObject({ wache: 'THW OV Oldenburg in Holstein', organizationId: 'org_ff', typeId: 'oh_dekonp' });
    // ASB "Sama/Kater 35/…" in Heiligenhafen
    expect(roster.stations.find((s) => s.def.name === 'ASB RV Ostholstein')!.address).toMatch(/Heiligenhafen/);
    expect(one('Sama Ostholstein 35/92-01').organizationId).toBe('org_kats');
    // Jugendfeuerwehr: eigene Wache laut Liste, dauerhaft außer Dienst
    expect(one('Florian Ostholstein 83/18-03')).toMatchObject({ wache: 'FF Stockelsdorf Jugendfeuerwehr', outOfService: true });
    // RTW T1 eines Ortsvereins fährt im Rettungsdienst
    expect(one('Rotkreuz Ostholstein 42/83-01').organizationId).toBe('org_rd');
  });

  it('Rufnamen ohne Veröffentlichung: Ortskennziffer der Wache und häufigster Kenner des Typs', () => {
    // Heringsdorf und Wangels (OKZ 42): Kenner wie bei den echten Fahrzeugen gleichen Typs
    expect(roster.vehicles.filter((v) => v.wache === 'FF Heringsdorf OF Heringsdorf').map((v) => v.callsign).sort()).toEqual([
      'Florian Ostholstein 42/14-01',
      'Florian Ostholstein 42/48-01',
      'Florian Ostholstein 42/52-01',
    ]);
    for (const v of roster.vehicles.filter((x) => /Wangels OF (Hansühn|Döhnsdorf)|Heringsdorf/.test(x.wache))) expect(v).toMatchObject({ generated: true, organizationId: 'org_ff' });
    expect(one('Florian Ostholstein 42/48-02')).toMatchObject({ wache: 'FF Wangels OF Hansühn-Testorf', typeId: 'hlf20' });
    // MZF Süderort ohne Rufnamen: OKZ 30 (Fehmarn)
    expect(roster.vehicles.find((v) => v.wache === 'FF Fehmarn OF Süderort' && v.typeLabel === 'MZF')!.callsign).toMatch(/^Florian Ostholstein 30\/14-\d\d$/);
    // THW ohne veröffentlichten Rufnamen: OKZ der Gemeinde (Eutin 67)
    expect(roster.vehicles.filter((v) => v.wache === 'THW OV Eutin' && v.generated).every((v) => /^Heros Ostholstein 67\//.test(v.callsign))).toBe(true);
  });

  it('Dienstzeiten mit Saison aus den Hinweisen', () => {
    expect(parseServiceWindows('')).toEqual([]);
    expect(parseServiceWindows('24h; Adresse: Poststraße 3, 23623 Ahrensbök')).toEqual([]);
    expect(parseServiceWindows('Tages-RTW')).toEqual([{ fromHour: 7, toHour: 19, weekdays: [] }]);
    expect(parseServiceWindows('tagsüber')).toEqual([{ fromHour: 7, toHour: 19, weekdays: [] }]);
    expect(parseServiceWindows('Tages-RTW Mo–Fr')).toEqual([{ fromHour: 7, toHour: 19, weekdays: [1, 2, 3, 4, 5] }]);
    expect(parseServiceWindows('Tages-RTW, nur Saison Mai–Sept.')).toEqual([{ fromHour: 7, toHour: 19, weekdays: [], months: [5, 6, 7, 8, 9] }]);
    expect(parseServiceWindows('nur Mai–Sept. 24h')).toEqual([{ fromHour: 0, toHour: 24, weekdays: [], months: [5, 6, 7, 8, 9] }]);

    const nef = vehicle('Rettung Ostholstein 89/82-01');
    expect(nef.serviceWindows).toEqual([{ fromHour: 0, toHour: 24, weekdays: [], months: [5, 6, 7, 8, 9] }]);
    expect(inServiceWindow(nef, at('2026-07-13T03:00:00Z'))).toBe(true);
    expect(inServiceWindow(nef, at('2026-10-19T12:00:00Z'))).toBe(false);
    const rtw = vehicle('Rotkreuz Ostholstein 61/83-02');
    expect(rtw.serviceWindows).toEqual([{ fromHour: 7, toHour: 19, weekdays: [] }]);
    expect(inServiceWindow(rtw, at('2026-10-18T10:00:00Z'))).toBe(true); // auch sonntags
    expect(inServiceWindow(rtw, at('2026-10-19T20:00:00Z'))).toBe(false);
    // ohne Hinweis rund um die Uhr
    expect(vehicle('Rettung Ostholstein 67/83-01').serviceWindows).toEqual([]);
    expect(vehicle('Rettung Ostholstein 77/83-02').serviceWindows[0].months).toEqual([5, 6, 7, 8, 9]);
  });

  it('nie alarmierte Fahrzeuge: aufgenommen, aber dauerhaft außer Dienst – auch nach Neustart und Laden', () => {
    const never = roster.vehicles.filter((v) => v.outOfService).map((v) => v.callsign);
    expect(never).toEqual(
      expect.arrayContaining(['Florian Ostholstein 86/17-01', 'Rotkreuz Ostholstein 92/17-01', 'Florian Ostholstein 47/18-03', 'Florian Ostholstein 83/18-03']),
    );
    expect(roster.vehicles.filter((v) => v.outOfService && v.typeId === 'oh_info')).toHaveLength(2);
    const g = createGame(structuredClone(center));
    const werbe = g.center.vehicles.find((v) => v.callsign === 'Rotkreuz Ostholstein 92/17-01')!;
    expect(werbe.rt.status).toBe('ausser_dienst');
    expect(vehicleAvailability(g, werbe)).toEqual({ available: false, reason: 'Dauerhaft außer Dienst' });
    expect(setVehicleServiceStatus(g, werbe.id, true).ok).toBe(false);
    // Jugendfeuerwehr rückt mit der Alarmgruppe nie aus
    const kw = g.center.keywords.find((k) => k.category === 'brand')!;
    const st = g.center.stations.find((s) => s.name === 'FF Stockelsdorf OF Stockelsdorf')!;
    createManualIncident(g, kw.id, st.position, 'Bohnrader Weg 4a, 23617 Stockelsdorf', 'Test');
    const dep = groupDeployment(g, g.runtime.incidents[0], st);
    expect(dep.length).toBeGreaterThan(0);
    expect(dep.some((v) => v.outOfService)).toBe(false);
    // Laden (Export/Import, gespeicherter Spielstand) und Neustart erhalten den Zustand
    const r = importJson(JSON.stringify(exportCenter(g.center)));
    if (!r.ok || r.kind !== 'leitstelle') throw new Error('Import fehlgeschlagen');
    const re = r.center.vehicles.find((v) => v.callsign === werbe.callsign)!;
    expect(re.outOfService).toBe(true);
    expect(r.center.vehicles.find((v) => v.callsign === 'Rettung Ostholstein 89/82-01')!.serviceWindows[0].months).toEqual([5, 6, 7, 8, 9]);
    const g2 = createGame(r.center);
    expect(vehicleAvailability(g2, g2.center.vehicles.find((v) => v.callsign === werbe.callsign)!).available).toBe(false);
    const stored = validateStoredGame(g2);
    expect(stored.game!.center.vehicles.find((v) => v.callsign === werbe.callsign)!.outOfService).toBe(true);
  });
});

describe('Beispielleitstelle Ostholstein mit echten Fahrzeugen', () => {
  it('alle Fahrzeuge an gültigen Wachen, Typen in der Typliste der Leitstelle', () => {
    const stationIds = new Set(center.stations.map((s) => s.id));
    const typeIds = new Set(center.vehicleTypes.map((t) => t.id));
    for (const v of center.vehicles) {
      expect(stationIds.has(v.stationId), v.callsign).toBe(true);
      expect(typeIds.has(v.typeId), v.callsign).toBe(true);
      expect(center.organizations.some((o) => o.id === v.organizationId), v.callsign).toBe(true);
    }
    expect(new Set(center.vehicles.map((v) => v.callsign)).size).toBe(center.vehicles.length);
    // Kapazität passt zur Fahrzeugzahl
    for (const s of center.stations) expect(s.capacity, s.name).toBeGreaterThanOrEqual(center.vehicles.filter((v) => v.stationId === s.id).length);
    // Zuständigkeit: alle eigenen Wachen im Kreis
    const resp = new Set(center.areas[0].responsibleStationIds);
    for (const s of center.stations.filter((x) => x.organizationId !== 'org_ext' && x.organizationId !== 'org_nb')) expect(resp.has(s.id), s.name).toBe(true);
  });

  it('jede Wache aus den Daten genau einmal, im Kreis und an ihrer Koordinate', () => {
    expect(placements).toHaveLength(WACHEN.length);
    expect(new Set(placements.map((p) => p.stationId)).size).toBe(WACHEN.length);
    for (const p of placements) {
      const st = center.stations.find((s) => s.id === p.stationId)!;
      const def = WACHEN.find((d) => d.name === p.wache)!;
      expect(st.name).toBe(def.name);
      expect(pointInArea(st.position, OSTHOLSTEIN), def.name).toBe(true);
      // genaue Adressen stehen genau dort; Ortsmitten dürfen auf den OSM-Eintrag der Wache rücken
      expect(distanceMeters(st.position, def.pos), def.name).toBeLessThan(def.posKind === 'ort' ? 3000 : 1);
      expect(gemeindeOf(st.position)?.name, def.name).toBe(gemeindeOf(def.pos)?.name);
    }
    // OSM-Eintrag derselben Wache übernommen (kein doppelter Standort)
    for (const name of ['FF Bad Malente-Gremsmühlen', 'FF Süsel OF Süsel', 'FF Bad Schwartau OF Groß Parin', 'FF Eutin OF Neudorf', 'rdh. RW Eutin'])
      expect(placements.find((p) => p.wache === name)!.osmName, name).toBeDefined();
  });

  it('Sonderfälle der Zuordnung (Teilstrings, gleiche Adressen, Wachen ohne Daten)', () => {
    expect(distanceMeters(stationNamed('FF Bad Malente-Gremsmühlen').position, [54.1892, 10.5657])).toBeLessThan(100);
    expect(stationNamed('FF Bad Malente-Gremsmühlen').address).toBe('Lütjenburger Straße 100, 23714 Malente');
    const burg = stationNamed('FF Fehmarn OF Burg auf Fehmarn');
    expect(burg.address).toBe('Osterstraße 52, 23769 Fehmarn');
    expect(gemeindeOf(burg.position)?.name).toBe('Fehmarn');
    expect(distanceMeters(stationNamed('FF Süsel OF Süsel').position, [54.08024, 10.7031])).toBeLessThan(100);
    expect(gemeindeOf(stationNamed('FF Bad Schwartau OF Groß Parin').position)?.name).toBe('Bad Schwartau');
    expect(gemeindeOf(stationNamed('FF Stockelsdorf OF Klein Parin').position)?.name).toBe('Stockelsdorf');
    expect(center.stations.some((s) => s.name === 'Freiwillige Feuerwehr Neudorf')).toBe(false);
    expect(stationNamed('FF Timmendorfer Strand OF Timmendorfer Strand').address).toBe('Bäderrandstraße 6, 23669 Timmendorfer Strand');
    expect(stationNamed('DLRG Haffkrug-Scharbeutz').address).toBe('Fuchsberg 1b, 23683 Scharbeutz');
    // mehrere Wachen an derselben Adresse bleiben getrennt
    expect(stationNamed('ASB RV Ostholstein').id).not.toBe(stationNamed('rdh. RW Heiligenhafen').id);
    expect(stationNamed('rdh. RW Ahrensbök').id).not.toBe(stationNamed('FF Ahrensbök OF Ahrensbök').id);
    // OSM-Feuerwehren ohne Gegenstück in den Daten bleiben, aber leer
    const names = new Set(WACHEN.map((d) => d.name));
    const osmOnly = center.stations.filter((s) => (s.kind === 'feuerwehrhaus' || s.kind === 'feuerwache') && !names.has(s.name));
    for (const st of osmOnly) expect(center.vehicles.some((v) => v.stationId === st.id), st.name).toBe(false);
  });

  it('Westfehmarn: Gerätehaus "Ortswehr Petersdorf" aus OSM, kein zweiter leerer Standort daneben', () => {
    const petersdorf: OverpassElement[] = [
      { type: 'way', id: 445456569, center: { lat: 54.4814427, lon: 11.0667772 }, tags: { amenity: 'fire_station', name: 'Ortswehr Petersdorf', operator: 'Freiwilligen Feuerwehr Westfehmarn', 'addr:street': 'Ostlandstraße', 'addr:housenumber': '4', 'addr:postcode': '23769', 'addr:city': 'Fehmarn' } },
      { type: 'way', id: 888956451, center: { lat: 54.4590776, lon: 11.0428856 }, tags: { amenity: 'fire_station', name: 'Ortswehr Sulsdorf', operator: 'Freiwilligen Feuerwehr Westfehmarn' } },
    ];
    const c = createOstholsteinCenter([...ELEMENTS, ...petersdorf]);
    const p = lastPlacements.find((x) => x.wache === 'FF Fehmarn OF Westfehmarn')!;
    expect(p.osmName).toBeDefined();
    const st = c.stations.find((s) => s.id === p.stationId)!;
    expect(distanceMeters(st.position, [54.48144, 11.06678])).toBeLessThan(20);
    expect(st.address).toBe('Ostlandstraße 4, 23769 Fehmarn');
    expect(c.vehicles.some((v) => v.stationId === st.id && v.callsign === 'Florian Ostholstein 30/41-03')).toBe(true);
    // keine weitere Feuerwehr-Station in unmittelbarer Nähe (früher: leere "Ortswehr Petersdorf" 111 m daneben)
    expect(c.stations.filter((s) => s.kind !== 'rettungswache' && s.kind !== 'polizei' && distanceMeters(s.position, st.position) < 200)).toHaveLength(1);
    // Sulsdorf gibt es laut Nutzer nicht (mehr): OSM-Eintrag entfällt
    expect(c.stations.some((s) => s.name === 'Ortswehr Sulsdorf')).toBe(false);
  });

  it('Phantom-Dubletten: gleichnamige OSM-Einträge derselben Wache in der Nähe entfallen', () => {
    expect(wacheKey('rdh. RW Malente')).toBe('malente');
    expect(wacheKey('Rettungswache Malente (2)')).toBe('malente');
    expect(wacheKey('FF Eutin OF Neudorf')).toBe('neudorf');
    expect(wacheKey('Freiwillige Feuerwehr Eutin-Neudorf')).toBe('eutin neudorf');
    // Malente: OSM-Node 3287130686 ohne Adresse (2,6 km neben der Wache an der Lütjenburger Straße 82)
    const rwMalente = stationNamed('rdh. RW Malente');
    expect(center.stations.some((s) => s.name === 'Rettungswache Malente')).toBe(false);
    expect(center.stations.filter((s) => s.kind === 'rettungswache' && distanceMeters(s.position, rwMalente.position) < 5000)).toHaveLength(1);
    // Zuständigkeitsbereiche nur mit vorhandenen Wachen
    const ids = new Set(center.stations.map((s) => s.id));
    for (const a of center.areas) for (const id of a.responsibleStationIds) expect(ids.has(id), id).toBe(true);
    // allgemein: gleichnamig nahe → entfällt, gleichnamig weit weg oder anderer Name → bleibt; unbenannte OSM-Feuerwehren bleiben
    // das unbenannte OSM-Feuerwehrhaus an der Lütjenburger Straße 100 ist die FF Bad Malente-Gremsmühlen selbst
    expect(center.stations.some((s) => s.name === 'Feuerwehr Malente')).toBe(false);
    const extra: OverpassElement[] = [
      { type: 'node', id: 990000001, lat: 54.1452, lon: 10.6152, tags: { emergency: 'ambulance_station', name: 'Rettungswache Eutin' } },
      { type: 'node', id: 990000002, lat: 54.2152, lon: 10.6152, tags: { emergency: 'ambulance_station', name: 'Rettungswache Eutin' } },
      { type: 'node', id: 990000003, lat: 54.1402, lon: 10.6252, tags: { emergency: 'ambulance_station', name: 'Rettungswache Fissau' } },
      { type: 'node', id: 990000004, lat: 54.0102, lon: 10.7552, tags: { amenity: 'fire_station', name: 'Feuerwehr Scharbeutz' } },
    ];
    const c = createOstholsteinCenter([...ELEMENTS, ...extra]);
    const eutin = c.stations.find((s) => s.name === 'rdh. RW Eutin')!;
    const near = (lat: number, lon: number) => c.stations.find((s) => distanceMeters(s.position, [lat, lon]) < 10);
    expect(near(54.1452, 10.6152), 'Dublette 1,3 km neben RW Eutin').toBeUndefined();
    expect(near(54.2152, 10.6152), 'gleicher Name, 9 km entfernt').toBeDefined();
    expect(near(54.1402, 10.6252), 'anderer Name').toBeDefined();
    expect(near(54.0102, 10.7552), 'Feuerwehr Scharbeutz (Daten: FF Scharbeutz OF Scharbeutz)').toBeUndefined();
    expect(c.stations.filter((s) => s.kind === 'rettungswache' && distanceMeters(s.position, eutin.position) < 3000).map((s) => s.name)).toContain('rdh. RW Eutin');
    const cids = new Set(c.stations.map((s) => s.id));
    for (const a of c.areas) for (const id of a.responsibleStationIds) expect(cids.has(id), id).toBe(true);
  });

  it('jeder RTW gehört zum Rettungsdienst (RD_OH), auch an einem Ortsverein', () => {
    const rtw = center.vehicles.filter((v) => v.typeId === 'rtw' && !v.external);
    expect(rtw.length).toBeGreaterThan(10);
    for (const v of rtw) expect(v.organizationId, v.callsign).toBe('org_rd');
    const akkon = vehicle('Akkon Ostholstein 67/83-11');
    expect(center.stations.find((s) => s.id === akkon.stationId)!.name).toBe('JUH OV Eutin');
    expect(center.organizations.find((o) => o.id === akkon.organizationId)!.radioGroup.code).toBe('RD_OH');
  });

  it('Wachen haben Stellplätze in Reserve: Editor kann Fahrzeuge hinzufügen', () => {
    const count = (id: string) => center.vehicles.filter((v) => v.stationId === id).length;
    for (const p of placements) {
      const st = center.stations.find((s) => s.id === p.stationId)!;
      if (st.organizationId === 'org_ext') continue;
      const def = WACHEN.find((d) => d.name === p.wache)!;
      expect(st.capacity, st.name).toBe(def.kind === 'ff' || def.kind === 'rw' ? Math.max(4, count(st.id) + 2) : count(st.id) + 2);
    }
    for (const st of center.stations.filter((s) => s.kind === 'polizei')) expect(st.capacity, st.name).toBe(count(st.id) + 2);
    const g = createGame(structuredClone(center));
    const st = g.center.stations.find((s) => s.name === 'FF Neustadt in Holstein')!;
    const tpl = g.center.vehicles.find((v) => v.stationId === st.id)!;
    expect(saveVehicle(g, { ...structuredClone(tpl), id: 'v_neu1', callsign: 'Florian Ostholstein 99/99-01' }, true)).toBeNull();
    expect(saveVehicle(g, { ...structuredClone(tpl), id: 'v_neu2', callsign: 'Florian Ostholstein 99/99-02' }, true)).toBeNull();
    expect(saveVehicle(g, { ...structuredClone(tpl), id: 'v_neu3', callsign: 'Florian Ostholstein 99/99-03' }, true)).toMatch(/keinen freien Stellplatz/);
  });

  it('Christoph 12 einmal, extern am Luftrettungszentrum Siblin', () => {
    const rth = center.vehicles.filter((v) => v.callsign === 'Christoph 12');
    expect(rth).toHaveLength(1);
    const st = center.stations.find((s) => s.id === rth[0].stationId)!;
    expect(st.position).toEqual([54.03495, 10.56238]);
    expect(st.name).toBe('Luftrettungszentrum Siblin');
    expect(rth[0].external?.neighborId).toBe('nb_luft');
    expect(rth[0].serviceWindows).toEqual([{ fromHour: 7, toHour: 20, weekdays: [] }]);
    expect(center.neighbors.find((n) => n.id === 'nb_luft')!.position).toEqual([54.03495, 10.56238]);
  });

  it('Polizei bleibt, erfundene Sonderfahrzeuge und Beispielstationen entfallen', () => {
    expect(center.vehicles.filter((v) => v.typeId === 'fustw').length).toBe(center.stations.filter((s) => s.kind === 'polizei').length);
    expect(center.vehicles.some((v) => v.typeId === 'pol_fueh')).toBe(true);
    expect(center.vehicles.some((v) => v.typeId === 'pol_grukw')).toBe(true);
    expect(center.stations.some((s) => s.id === 'st_kats' || s.id === 'st_thw')).toBe(false);
    for (const t of ['itw', 'iktw', 'srtw', 'sktw', 'psnv']) expect(center.vehicles.some((v) => v.typeId === t), t).toBe(false);
    // nur echte Fahrzeuge (Liste), Polizei und externe Rettungsmittel der Nachbarn bzw. weitere RTH (Christoph 12 steht in der Liste)
    const externalOnly = center.vehicles.filter((v) => v.external && v.callsign !== 'Christoph 12').length;
    expect(center.vehicles.length).toBe(roster.vehicles.length + center.vehicles.filter((v) => v.organizationId === 'org_pol').length + externalOnly);
  });

  it('Organisationen und Funkrufgruppen', () => {
    const grp = (cs: string) => center.organizations.find((o) => o.id === vehicle(cs).organizationId)!.radioGroup.code;
    expect(grp('Florian Ostholstein 61/48-01')).toBe('FW_OH');
    expect(grp('Rettung Ostholstein 67/83-01')).toBe('RD_OH');
    expect(grp('Rotkreuz Ostholstein 61/82-01')).toBe('NA_OH');
    expect(grp('Rettung Ostholstein 92/85-01')).toBe('KTP_OH');
    expect(grp('Heros Eutin 24/55')).toBe('THW_OH');
    expect(grp('Rotkreuz Ostholstein 42/95-01')).toBe('KATS_OH');
    expect(grp('Christoph 12')).toBe('LR_SH');
    expect(stationNamed('THW OV Eutin').kind).toBe('thw');
    expect(stationNamed('DLRG Bosau').kind).toBe('kats');
    expect(stationNamed('rdh. RW Eutin').kind).toBe('rettungswache');
  });

  it('Alarmgruppen der Freiwilligen Feuerwehren mit den echten Wehren', () => {
    const g = createGame(structuredClone(center));
    const ff = groupStations(g).filter((s) => g.center.vehicles.some((v) => v.stationId === s.id));
    expect(ff.length).toBeGreaterThan(60);
    expect(isGroupStation(g, g.center.stations.find((s) => s.name === 'FF Neustadt in Holstein'))).toBe(true);
    expect(isGroupStation(g, g.center.stations.find((s) => s.name === 'rdh. RW Eutin'))).toBe(false);
    const kw = g.center.keywords.find((k) => k.category === 'brand')!;
    const st = g.center.stations.find((s) => s.name === 'FF Oldenburg in Holstein')!;
    createManualIncident(g, kw.id, st.position, 'Ringstraße 5, 23758 Oldenburg in Holstein', 'Test');
    const dep = groupDeployment(g, g.runtime.incidents[0], st);
    expect(dep.length).toBeGreaterThan(0);
    expect(dep.every((v) => v.stationId === st.id)).toBe(true);
  });
});

describe('Großeinsatz Rettungsdienst mit den Einheiten der Hilfsorganisationen', () => {
  it('ab R10 alle RTW der Ortsvereine (T1), ab R15 alle KTW (T2), ab R20 alle GW-San und GW-Betreuung', async () => {
    const { suggestForIncident } = await import('../../sim/dispatch');
    const caps = (typeId: string) => center.vehicleTypes.find((t) => t.id === typeId)!.capabilities;
    const all = (cap: string) => center.vehicles.filter((v) => !v.outOfService && caps(v.typeId).includes(cap)).map((v) => v.id).sort();
    // T1 = RTW der Ortsvereine, T2 = KTW der Ortsvereine
    expect(all('t1').length).toBeGreaterThanOrEqual(5);
    for (const id of all('t1')) expect(center.stations.find((s) => s.id === center.vehicles.find((v) => v.id === id)!.stationId)!.kind).toBe('kats');
    expect(all('t2').length).toBeGreaterThanOrEqual(10);
    expect(all('betreuung').length).toBeGreaterThanOrEqual(4);
    expect(all('pat_ablage').length).toBeGreaterThanOrEqual(4);
    const proposal = (code: string) => {
      const g = createGame(structuredClone(center));
      const kw = g.center.keywords.find((k) => k.code === code)!;
      const st = g.center.stations.find((s) => s.name === 'FF Eutin OF Eutin')!;
      createManualIncident(g, kw.id, st.position, 'Am Priwall 12, 23701 Eutin', 'Test');
      return new Set(suggestForIncident(g, g.runtime.incidents[0]).proposal.map((p) => p.vehicleId));
    };
    const r10 = proposal('NOTF R10');
    for (const id of all('t1')) expect(r10.has(id), id).toBe(true);
    expect(all('t2').every((id) => r10.has(id))).toBe(false);
    const r15 = proposal('NOTF R15');
    for (const id of [...all('t1'), ...all('t2')]) expect(r15.has(id), id).toBe(true);
    const r20 = proposal('NOTF R20');
    for (const id of [...all('t1'), ...all('t2'), ...all('betreuung'), ...all('pat_ablage')]) expect(r20.has(id), id).toBe(true);
  });
});

describe('Ortswehren und Hauptwehr', () => {
  it('jede Ortswehr kennt ihre Hauptwehr; bei Brand wird die Hauptwehr mitalarmiert, sonst nicht', async () => {
    const { suggestForIncident } = await import('../../sim/dispatch');
    const { proposalWithGroups } = await import('../../sim/alarmGroups');
    const main = (n: string) => center.stations.find((s) => s.id === stationNamed(n).mainStationId)?.name;
    expect(main('FF Ahrensbök OF Gnissau')).toBe('FF Ahrensbök OF Ahrensbök');
    expect(main('FF Ahrensbök OF Ahrensbök')).toBeUndefined();
    expect(main('FF Benz')).toBe('FF Bad Malente-Gremsmühlen');
    expect(main('FF Gremersdorf OF Neuratjensdorf')).toBe('FF Giddendorf-Seegalendorf-Gremersdorf');
    expect(main('FF Wangels OF Grammdorf')).toBe('FF Wangels OF Wangels');
    expect(main('FF Bad Schwartau OF Groß Parin')).toBe('FF Bad Schwartau OF Bad Schwartau-Rensefeld');
    const groupsFor = (code: string, wache: string) => {
      const g = createGame(structuredClone(center));
      const kw = g.center.keywords.find((k) => k.code === code)!;
      const st = g.center.stations.find((s) => s.name === wache)!;
      createManualIncident(g, kw.id, st.position, 'Test', 'Test');
      const inc = g.runtime.incidents[0];
      return proposalWithGroups(g, inc, suggestForIncident(g, inc)).groups.map((x) => x.station.name);
    };
    // Kleinbrand in Gnissau: Ortswehr Gnissau + Hauptwehr Ahrensbök
    const brand = groupsFor('FEU K 00', 'FF Ahrensbök OF Gnissau');
    expect(brand).toContain('FF Ahrensbök OF Gnissau');
    expect(brand).toContain('FF Ahrensbök OF Ahrensbök');
    // kleine Hilfeleistung: Ortswehr allein (ohne Hauptwehr, sofern der Bedarf sie nicht braucht)
    const th = groupsFor('TH K 00', 'FF Ahrensbök OF Gnissau');
    expect(th).toContain('FF Ahrensbök OF Gnissau');
    expect(th).not.toContain('FF Ahrensbök OF Ahrensbök');
    // umgekehrt nicht: Brand im Hauptort ohne Ortswehr
    const haupt = groupsFor('FEU K 00', 'FF Ahrensbök OF Ahrensbök');
    expect(haupt).toEqual(['FF Ahrensbök OF Ahrensbök']);
  });

  it('RTW der Ortsvereine (T1) nur beim Großeinsatz, nicht im Alltag', async () => {
    const { suggestForIncident } = await import('../../sim/dispatch');
    const g = createGame(structuredClone(center));
    const kw = g.center.keywords.find((k) => k.code === 'NOTF 01')!;
    const t1 = new Set(g.center.vehicles.filter((v) => ['oh_rtw_hiorg', 'oh_rtwt1'].includes(v.typeId)).map((v) => v.id));
    expect(t1.size).toBeGreaterThanOrEqual(5);
    // Notfall direkt an der Wache eines Ortsvereins mit RTW: trotzdem ein RTW des Rettungsdienstes
    const st = g.center.stations.find((s) => s.name === 'DRK OV Süsel')!;
    createManualIncident(g, kw.id, st.position, 'Test', 'Test');
    const p = suggestForIncident(g, g.runtime.incidents[0]).proposal.map((x) => x.vehicleId);
    expect(p.length).toBe(1);
    expect(t1.has(p[0])).toBe(false);
  });
});

describe('Kliniken und externe Rettungsmittel', () => {
  it('Kliniken nach Recherche (AMEOS statt Sana), außerhalb nur UKSH Lübeck und Kiel', () => {
    const names = center.hospitals.map((h) => h.name);
    expect(names).toContain('AMEOS Klinikum Eutin');
    expect(names).toContain('Schön Klinik Neustadt');
    expect(names.filter((n) => !pointInArea(center.hospitals.find((h) => h.name === n)!.position, OSTHOLSTEIN)).sort()).toEqual(['UKSH Campus Kiel', 'UKSH Campus Lübeck']);
    expect(names.some((n) => /Sana/.test(n))).toBe(false);
    expect(center.hospitals.find((h) => h.name === 'UKSH Campus Lübeck')!.departments).toContain('verbrennung');
    expect(center.hospitals.find((h) => h.name === 'Schön Klinik Neustadt')!.departments).toEqual(expect.arrayContaining(['neurologie', 'kardiologie', 'unfallchirurgie']));
  });

  it('Nachbarn an der Kreisgrenze und Rettungshubschrauber: extern mit Verzug, nicht zuständig im Kreis', () => {
    const ext = center.vehicles.filter((v) => v.external);
    const cs = ext.map((v) => v.callsign);
    for (const c of ['Florian Lübeck 10/82-01', 'Florian Lübeck 30/83-01', 'Rettung Plön 40/83-01', 'Akkon Plön 80/83-01', 'Christoph 12', 'Christoph 42', 'Christoph Hansa', 'Christoph 92']) expect(cs, c).toContain(c);
    for (const v of ext) expect(v.external!.requestDelaySeconds, v.callsign).toBeGreaterThan(0);
    expect(vehicle('Christoph 42').serviceWindows).toEqual([]);
    expect(vehicle('Christoph Hansa').serviceWindows).toEqual([{ fromHour: 8, toHour: 21, weekdays: [] }]);
    expect(vehicle('Christoph 92').typeId).toBe('oh_ith');
    const resp = new Set(center.areas[0].responsibleStationIds);
    for (const v of ext) expect(resp.has(v.stationId), v.callsign).toBe(false);
  });
});
