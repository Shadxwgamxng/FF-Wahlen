import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import type { OverpassElement } from '../../geo/places';
import { parseCsv } from '../../persistence/csv';
import { exportCenter, importJson, validateStoredGame } from '../../persistence/schema';
import { groupDeployment, groupStations, isGroupStation } from '../../sim/alarmGroups';
import { inServiceWindow, vehicleAvailability } from '../../sim/availability';
import { createGame, createManualIncident, setVehicleServiceStatus } from '../../sim/engine';
import { distanceMeters, pointInArea } from '../../sim/geo';
import { createOstholsteinCenter, lastPlacements, OSTHOLSTEIN } from './index';
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
  it('liest alle Einträge beider Listen und kommt auf eine plausible Fahrzeugzahl', () => {
    const rows = parseCsv(ROSTER_INPUT.fahrzeuge).length + parseCsv(ROSTER_INPUT.ergaenzungen).length;
    expect(rows).toBe(262 + 69);
    // jeder Eintrag ist Fahrzeug, zusammengeführt oder (mit Grund) weggelassen
    const mergedAway = roster.merged.filter((m) => m.reason.startsWith('=') || m.reason.startsWith('doppelt')).length;
    expect(roster.vehicles.length + roster.omitted.length + mergedAway).toBe(rows);
    expect(roster.vehicles.length).toBeGreaterThan(290);
    expect(roster.vehicles.length).toBeLessThan(340);
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

  it('Dubletten nach den Hinweisen der Ergänzungsliste', () => {
    // 67/83-xx der Liste = 67/83-02 der Ergänzung
    expect(one('Rettung Ostholstein 67/83-02').identifier).toBe('OH-RD 670');
    expect(byCs('Rettung Ostholstein 67/83-xx')).toHaveLength(0);
    // XX/83-0X ist einer der Tages-RTW
    expect(roster.omitted.some((o) => o.callsign === 'Rettung Ostholstein XX/83-0X')).toBe(true);
    // RTW OH-RD 6800 = 89/83-01
    expect(one('Rettung Ostholstein 89/83-01').identifier).toBe('OH-RD 6800');
    expect(roster.vehicles.filter((v) => v.wache === 'rdh. RW Timmendorfer Strand' && v.typeId === 'rtw')).toHaveLength(3);
    // NEF OH-R 4300 = 67/82-01 (Eutin)
    expect(one('Rettung Ostholstein 67/82-01')).toMatchObject({ identifier: 'OH-R 4300', wache: 'rdh. RW Eutin', organizationId: 'org_na' });
    // xx/83-xx nicht zuzuordnen
    expect(roster.omitted.some((o) => o.callsign === 'Rettung Ostholstein xx/83-xx')).toBe(true);
    // KTW OH-RD 7400 → RW Eutin, nächste freie 67/85-NN
    const ktw = roster.vehicles.find((v) => v.identifier === 'OH-RD 7400')!;
    expect(ktw).toMatchObject({ callsign: 'Rettung Ostholstein 67/85-02', wache: 'rdh. RW Eutin', generated: true, organizationId: 'org_ktp' });
    // 89/47-01: Hemmelsdorf behält die Nummer, das LF 10 der Hauptwache bekommt 89/47-02
    expect(one('Florian Ostholstein 89/47-01').wache).toBe('FF Timmendorfer Strand OF Hemmelsdorf');
    expect(one('Florian Ostholstein 89/47-02')).toMatchObject({ wache: 'FF Timmendorfer Strand', typeId: 'lf10' });
    // MZF Hemmelsdorf (evtl. identisch mit MTW 89/18-01) entfällt
    expect(roster.vehicles.filter((v) => v.wache === 'FF Timmendorfer Strand OF Hemmelsdorf').map((v) => v.typeLabel).sort()).toEqual(['LF 10', 'MTW']);
    // JUH RW Bad Schwartau: alle einmal
    for (const cs of ['Akkon Ostholstein 92/83-01', 'Akkon Ostholstein 92/83-02', 'Akkon Ostholstein 92/83-03', 'Akkon Ostholstein 92/82-01', 'Rettung Ostholstein 92/85-01']) expect(one(cs).wache).toBe('JUH RW Bad Schwartau');
    // "FF Stadt Fehmarn OF Landkirchen" = "FF Fehmarn OF Landkirchen"
    expect(roster.vehicles.filter((v) => v.wache === 'FF Fehmarn OF Landkirchen').map((v) => v.callsign).sort()).toEqual([
      'Florian Ostholstein 30/11-01',
      'Florian Ostholstein 30/47-01',
      'Florian Ostholstein 30/48-03',
    ]);
    expect(roster.stations.some((s) => s.def.name.includes('Stadt Fehmarn'))).toBe(false);
  });

  it('Wache "unbekannt" aus der Ortskennziffer, Kreisebene und Sonderzuordnungen', () => {
    expect(one('Pelikan Ostholstein 74/18-01').wache).toBe('DLRG Bosau');
    expect(roster.vehicles.find((v) => v.identifier === 'OH-WR 1913')).toMatchObject({ wache: 'DLRG Eutin', callsign: 'Pelikan Ostholstein 67/18-02', generated: true });
    expect(one('Rotkreuz Ostholstein 89/19-01').wache).toBe('DRK OV Timmendorfer Strand');
    for (const cs of ['Rettung Ostholstein 01/10-02', 'Rettung Ostholstein 01/10-03']) expect(one(cs)).toMatchObject({ wache: 'rdh. RW Eutin', typeId: 'elrd', organizationId: 'org_rd' });
    expect(roster.vehicles.some((v) => v.wache === 'unbekannt')).toBe(false);
    // GW-Dekon P der Feuerwehr beim THW Oldenburg: bleibt Feuerwehr mit Florian-Rufnamen
    expect(one('Florian Ostholstein 03/74-01')).toMatchObject({ wache: 'THW OV Oldenburg in Holstein', organizationId: 'org_ff', typeId: 'oh_dekonp' });
    // ASB "Sama/Kater 35/…" in Heiligenhafen
    expect(roster.stations.find((s) => s.def.name === 'ASB RV Ostholstein')!.address).toMatch(/Heiligenhafen/);
    expect(one('Sama Ostholstein 35/92-01').organizationId).toBe('org_kats');
    // Jugendfeuerwehr gehört zur Wehr
    expect(one('Florian Ostholstein 83/18-03')).toMatchObject({ wache: 'FF Stockelsdorf OF Stockelsdorf', outOfService: true });
  });

  it('Rufnamen ohne Veröffentlichung: Ortskennziffer der Wache und häufigster Kenner des Typs', () => {
    // FF Oldenburg (OKZ 40): 3 HLF → 40/48-01..03 (Kenner 48 wie die echten HLF 20)
    const old = roster.vehicles.filter((v) => v.wache === 'FF Oldenburg in Holstein');
    expect(old.filter((v) => v.typeId === 'hlf20').map((v) => v.callsign)).toEqual(['Florian Ostholstein 40/48-01', 'Florian Ostholstein 40/48-02', 'Florian Ostholstein 40/48-03']);
    expect(old.find((v) => v.typeId === 'kdow')!.callsign).toBe('Florian Ostholstein 40/10-01');
    expect(old.find((v) => v.typeId === 'oh_dlak')!.callsign).toBe('Florian Ostholstein 40/32-01');
    // Burg auf Fehmarn: Ortskennzahl 33
    const burg = roster.vehicles.filter((v) => v.wache === 'FF Fehmarn OF Burg auf Fehmarn' && v.generated);
    expect(burg.length).toBeGreaterThan(5);
    for (const v of burg) expect(v.callsign).toMatch(/ 33\/\d\d-\d\d$/);
    expect(burg.find((v) => v.typeId === 'oh_lf20kats')!.callsign).toBe('Florian Ostholstein 33/47-01');
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
    const rtw = vehicle('Rettung Ostholstein 67/83-04');
    expect(rtw.serviceWindows).toEqual([{ fromHour: 7, toHour: 19, weekdays: [1, 2, 3, 4, 5] }]);
    expect(inServiceWindow(rtw, at('2026-10-19T10:00:00Z'))).toBe(true); // Montag
    expect(inServiceWindow(rtw, at('2026-10-18T10:00:00Z'))).toBe(false); // Sonntag
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
    for (const s of center.stations.filter((x) => x.organizationId !== 'org_ext')) expect(resp.has(s.id), s.name).toBe(true);
  });

  it('jede Wache aus den Daten genau einmal, im Kreis und am richtigen Ort', () => {
    expect(placements).toHaveLength(WACHEN.length);
    expect(new Set(placements.map((p) => p.stationId)).size).toBe(WACHEN.length);
    for (const p of placements) {
      const st = center.stations.find((s) => s.id === p.stationId)!;
      const def = WACHEN.find((d) => d.name === p.wache)!;
      expect(st.name).toBe(def.name);
      expect(pointInArea(st.position, OSTHOLSTEIN), def.name).toBe(true);
      // OSM-Treffer liegt beim erwarteten Standort und in derselben Gemeinde
      expect(distanceMeters(st.position, def.pos), def.name).toBeLessThan(300);
      expect(gemeindeOf(st.position)?.name, def.name).toBe(gemeindeOf(def.pos)?.name);
    }
    // in den Testdaten (Kreissüden) über OSM gefunden
    for (const name of ['FF Bad Malente-Gremsmühlen', 'FF Süsel OF Süsel', 'FF Timmendorfer Strand', 'FF Bad Schwartau OF Groß Parin', 'FF Eutin OF Neudorf', 'FF Bujendorf', 'rdh. RW Eutin'])
      expect(placements.find((p) => p.wache === name)!.source, name).toBe('osm');
  });

  it('Sonderfälle der Zuordnung (Teilstrings, unbenannte Wachen)', () => {
    // Malente: Feuerwache Lütjenburger Straße 100, nicht Malkwitz
    expect(distanceMeters(stationNamed('FF Bad Malente-Gremsmühlen').position, [54.1892, 10.5657])).toBeLessThan(100);
    expect(stationNamed('FF Bad Malente-Gremsmühlen').address).toBe('Lütjenburger Straße 100, 23714 Malente');
    // Burg auf Fehmarn: Osterstraße, nicht Oldenburg
    const burg = stationNamed('FF Fehmarn OF Burg auf Fehmarn');
    expect(burg.address).toBe('Osterstraße 52, 23769 Fehmarn');
    expect(gemeindeOf(burg.position)?.name).toBe('Fehmarn');
    // Süsel: An der Bäderstraße, nicht Gothendorf
    expect(distanceMeters(stationNamed('FF Süsel OF Süsel').position, [54.08024, 10.7031])).toBeLessThan(100);
    // Groß Parin (Bad Schwartau), nicht Klein Parin (Stockelsdorf)
    expect(gemeindeOf(stationNamed('FF Bad Schwartau OF Groß Parin').position)?.name).toBe('Bad Schwartau');
    expect(center.stations.some((s) => s.name === 'Freiwillige Feuerwehr Klein Parin')).toBe(true);
    // Neudorf: doppelter OSM-Eintrag entfällt
    expect(center.stations.some((s) => s.name === 'Freiwillige Feuerwehr Neudorf')).toBe(false);
    expect(stationNamed('FF Timmendorfer Strand').address).toBe('Wache an der B 76, 23669 Timmendorfer Strand');
    // OSM-Wachen ohne Daten bleiben, aber leer
    const empty = center.stations.find((s) => s.name === 'Freiwillige Feuerwehr Pansdorf')!;
    expect(empty).toBeDefined();
    expect(center.vehicles.some((v) => v.stationId === empty.id)).toBe(false);
  });

  it('Westfehmarn: Gerätehaus "Ortswehr Petersdorf" aus OSM, kein zweiter leerer Standort daneben', () => {
    const petersdorf: OverpassElement[] = [
      { type: 'way', id: 445456569, center: { lat: 54.4814427, lon: 11.0667772 }, tags: { amenity: 'fire_station', name: 'Ortswehr Petersdorf', operator: 'Freiwilligen Feuerwehr Westfehmarn', 'addr:street': 'Ostlandstraße', 'addr:housenumber': '4', 'addr:postcode': '23769', 'addr:city': 'Fehmarn' } },
      { type: 'way', id: 888956451, center: { lat: 54.4590776, lon: 11.0428856 }, tags: { amenity: 'fire_station', name: 'Ortswehr Sulsdorf', operator: 'Freiwilligen Feuerwehr Westfehmarn' } },
    ];
    const c = createOstholsteinCenter([...ELEMENTS, ...petersdorf]);
    const p = lastPlacements.find((x) => x.wache === 'FF Fehmarn OF Westfehmarn')!;
    expect(p.source).toBe('osm');
    const st = c.stations.find((s) => s.id === p.stationId)!;
    expect(distanceMeters(st.position, [54.48144, 11.06678])).toBeLessThan(20);
    expect(st.address).toBe('Ostlandstraße 4, 23769 Fehmarn');
    expect(c.vehicles.some((v) => v.stationId === st.id && v.callsign === 'Florian Ostholstein 30/41-03')).toBe(true);
    // keine weitere Feuerwehr-Station in unmittelbarer Nähe (früher: leere "Ortswehr Petersdorf" 111 m daneben)
    expect(c.stations.filter((s) => s.kind !== 'rettungswache' && s.kind !== 'polizei' && distanceMeters(s.position, st.position) < 200)).toHaveLength(1);
    // die zweite Ortswehr (Sulsdorf) bleibt als leerer OSM-Standort
    expect(c.stations.some((s) => s.name === 'Ortswehr Sulsdorf')).toBe(true);
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
    // nur echte Fahrzeuge (Liste) und Polizei
    expect(center.vehicles.length).toBe(roster.vehicles.length + center.vehicles.filter((v) => v.organizationId === 'org_pol').length);
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
