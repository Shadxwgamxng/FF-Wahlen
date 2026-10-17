import { describe, expect, it } from 'vitest';
import { buildPlaceIndex, classify, describePlace, geocode, pickPlace, reverseGeocode, searchStreets, type OverpassElement } from './places';
import { extractFacilities, geojsonToPolygons, overpassQueries } from './osm';
import { buildCenter, defaultOrganizations, validateWizard } from '../data/centerFactory';
import { Rng } from '../sim/rng';
import { createGame, tick } from '../sim/engine';
import { generateCall } from '../sim/callgen';
import { findScenario } from '../data/scenarios';
import type { County } from './osm';

/** Kleine, von Hand gebaute Overpass-Antwort (Struktur wie die echte API) */
const ELEMENTS: OverpassElement[] = [
  { type: 'node', id: 1, lat: 54.1, lon: 10.6, tags: { 'addr:street': 'Lindenweg', 'addr:housenumber': '3', 'addr:postcode': '23701', 'addr:city': 'Eutin', building: 'house' } },
  { type: 'way', id: 2, center: { lat: 54.101, lon: 10.601 }, tags: { 'addr:street': 'Lindenweg', 'addr:housenumber': '5', 'addr:postcode': '23701', 'addr:city': 'Eutin', building: 'apartments' } },
  { type: 'way', id: 3, center: { lat: 54.11, lon: 10.62 }, tags: { 'addr:street': 'Industriestraße', 'addr:housenumber': '12', 'addr:postcode': '23701', 'addr:city': 'Eutin', building: 'industrial' } },
  { type: 'node', id: 4, lat: 54.105, lon: 10.61, tags: { amenity: 'school', name: 'Grundschule Am See', 'addr:street': 'Seestraße', 'addr:housenumber': '1', 'addr:city': 'Eutin', 'addr:postcode': '23701' } },
  { type: 'way', id: 5, geometry: [{ lat: 54.12, lon: 10.63 }, { lat: 54.121, lon: 10.64 }, { lat: 54.122, lon: 10.65 }], tags: { highway: 'secondary', name: 'Plöner Straße', ref: 'B 76' } },
  { type: 'way', id: 6, center: { lat: 54.13, lon: 10.66 }, tags: { landuse: 'forest', name: 'Eutiner Forst' } },
  { type: 'way', id: 7, center: { lat: 54.14, lon: 10.67 }, tags: { natural: 'water', name: 'Großer Eutiner See' } },
  { type: 'node', id: 8, lat: 54.106, lon: 10.612, tags: { amenity: 'fire_station', name: 'Freiwillige Feuerwehr Eutin', 'addr:street': 'Feuerwehrstraße', 'addr:housenumber': '2', 'addr:city': 'Eutin' } },
  { type: 'node', id: 9, lat: 54.107, lon: 10.613, tags: { emergency: 'ambulance_station', name: 'Rettungswache Eutin' } },
  { type: 'way', id: 10, center: { lat: 54.108, lon: 10.614 }, tags: { amenity: 'hospital', name: 'Sana Kliniken Eutin' } },
  { type: 'node', id: 11, lat: 60, lon: 10, tags: { 'addr:street': 'Weit weg', 'addr:housenumber': '1', 'addr:city': 'Woanders' } },
  { type: 'node', id: 12, lat: 54.15, lon: 10.7, tags: { natural: 'tree' } }, // kein Einsatzort
];

const AREA = { polygons: [[[[54.0, 10.5], [54.3, 10.5], [54.3, 10.9], [54.0, 10.9]] as [number, number][]]] };

describe('OSM-Ortsdaten', () => {
  it('klassifiziert Orte nach Art', () => {
    expect(classify({ 'addr:street': 'a', 'addr:housenumber': '1', building: 'house' })).toBe('w');
    expect(classify({ 'addr:street': 'a', 'addr:housenumber': '1', building: 'industrial' })).toBe('g');
    expect(classify({ amenity: 'nursing_home' })).toBe('k');
    expect(classify({ highway: 'motorway' })).toBe('b');
    expect(classify({ natural: 'wood' })).toBe('l');
    expect(classify({ natural: 'tree' })).toBeNull();
  });

  it('baut einen kompakten Index, filtert auf das Gebiet und ergänzt Orte ohne Adresse', () => {
    const ix = buildPlaceIndex(ELEMENTS, { areas: [AREA] });
    // Feuer-/Rettungswachen sind keine Einsatzorte, die Adresse außerhalb des Kreises fällt weg
    expect(ix.places.map((p) => p[0]).sort()).toEqual(['g', 'k', 'l', 'o', 's', 'w', 'w', 'x']);
    const forest = ix.places.find((p) => p[0] === 'l')!;
    expect(describePlace(ix, forest).city).toBe('Eutin');
    expect(ix.places.some((p) => ix.strings[p[5]] === 'Woanders')).toBe(false);
  });

  it('liefert sinnvolle Orte je Lage (Türöffnung im Wohnhaus, Waldbrand im Wald)', () => {
    const ix = buildPlaceIndex(ELEMENTS, { areas: [AREA] });
    const rng = new Rng(1);
    for (let i = 0; i < 20; i++) {
      expect(pickPlace(ix, rng, 'w')![0]).toBe('w');
      expect(pickPlace(ix, rng, 'l')![0]).toBe('l');
    }
    const street = describePlace(ix, pickPlace(ix, rng, 's')!);
    expect(street.address).toContain('Plöner Straße');
  });

  it('findet Adressen (Geokodierung) und Straßen (Autovervollständigung)', () => {
    const ix = buildPlaceIndex(ELEMENTS, { areas: [AREA] });
    expect(searchStreets(ix, 'lind')[0].street).toBe('Lindenweg');
    const exact = geocode(ix, 'Lindenweg', '5', 'Eutin')!;
    expect(exact.exact).toBe(true);
    expect(exact.position).toEqual([54.101, 10.601]);
    const approx = geocode(ix, 'lindenweg', '99', '')!;
    expect(approx.exact).toBe(false);
    expect(geocode(ix, 'Gibtsnicht', '1', 'Eutin')).toBeNull();
    const r = reverseGeocode(ix, [54.1002, 10.6001])!;
    expect(ix.strings[r.tuple[3]]).toBe('Lindenweg');
  });

  it('extrahiert reale Wachen und Kliniken', () => {
    const f = extractFacilities(ELEMENTS);
    expect(f.map((x) => x.kind).sort()).toEqual(['feuerwehr', 'krankenhaus', 'rettungswache']);
    expect(f.find((x) => x.kind === 'feuerwehr')!.address).toContain('Feuerwehrstraße 2');
  });

  it('wandelt GeoJSON-Multipolygone in Ringe [Breite, Länge]', () => {
    const p = geojsonToPolygons({ type: 'MultiPolygon', coordinates: [[[[10, 54], [11, 54], [11, 55], [10, 55], [10, 54]]], [[[11.1, 54.4], [11.3, 54.4], [11.3, 54.5], [11.1, 54.4]]]] });
    expect(p).toHaveLength(2);
    expect(p[0][0][0]).toEqual([54, 10]);
  });

  it('erzeugt Overpass-Abfragen für die gewählten Kreise', () => {
    const q = overpassQueries([27025]);
    expect(q).toHaveLength(3);
    expect(q[0].query).toContain('area(id:3600027025)');
  });
});

describe('Leitstelle aus dem Assistenten', () => {
  const county: County = { osmRelationId: 1, name: 'Testkreis', state: 'Schleswig-Holstein', polygons: AREA.polygons };

  it('prüft Pflichtangaben inkl. Funkrufgruppen', () => {
    const orgs = defaultOrganizations();
    const errs = validateWizard({ name: '', operator: '', counties: [], organizations: orgs, places: null, facilities: [] });
    expect(errs.join(' ')).toContain('Namen');
    expect(errs.join(' ')).toContain('Landkreis');
    expect(errs.join(' ')).toContain('Funkrufgruppe');
  });

  it('übernimmt Kreise, reale Standorte und echte Einsatzorte – Notrufe entstehen an echten Adressen', () => {
    const orgs = defaultOrganizations().map((o, i) => ({ ...o, radioGroup: { name: `${o.name} Testkreis`, code: `G${i}` } }));
    const places = buildPlaceIndex(ELEMENTS, { areas: [AREA] });
    const input = { name: 'IRLS Test', operator: 'Testkreis', counties: [county], organizations: orgs, places, facilities: extractFacilities(ELEMENTS) };
    expect(validateWizard(input)).toEqual([]);
    const c = buildCenter(input);
    expect(c.areas[0].kind).toBe('landkreis');
    expect(c.stations.map((s) => s.kind).sort()).toEqual(['feuerwehrhaus', 'rettungswache']);
    expect(c.hospitals[0].name).toBe('Sana Kliniken Eutin');
    expect(c.areas[0].responsibleStationIds).toHaveLength(2);
    const g = createGame(c);
    const rng = new Rng(3);
    const call = generateCall(g, rng, 'c_t', g.runtime.clock.now, findScenario('th_tuer'))!;
    expect(call.location.address).toMatch(/Lindenweg|Seestraße/);
    expect(call.location.city).toBe('Eutin');
    tick(g, 1000);
  });
});

describe('Beispielleitstelle Ostholstein', () => {
  it('nutzt die echte Kreisgrenze und verteilt Fahrzeuge auf reale Standorte', async () => {
    const { createOstholsteinCenter, OSTHOLSTEIN } = await import('../data/ostholstein');
    expect(OSTHOLSTEIN.name).toBe('Kreis Ostholstein');
    expect(OSTHOLSTEIN.polygons.length).toBeGreaterThanOrEqual(2);
    const c = createOstholsteinCenter(ELEMENTS);
    expect(c.areas[0].osmRelationId).toBe(27025);
    expect(c.stations.find((s) => s.name === 'Freiwillige Feuerwehr Eutin')).toBeDefined();
    const eutinFf = c.stations.find((s) => s.name === 'Freiwillige Feuerwehr Eutin')!;
    expect(c.vehicles.filter((v) => v.stationId === eutinFf.id).map((v) => v.typeId)).toContain('dlk');
    expect(c.vehicles.some((v) => v.callsign === 'Christoph 12')).toBe(true);
    expect(c.organizations.every((o) => o.radioGroup.code)).toBe(true);
    const g = createGame(c);
    for (let i = 0; i < 100; i++) tick(g, 10_000);
    expect(g.runtime.calls.length).toBeGreaterThan(0);
    for (const call of g.runtime.calls) expect(call.location.city).toBe('Eutin');
  });
});
