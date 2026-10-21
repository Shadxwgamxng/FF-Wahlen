import { describe, expect, it } from 'vitest';
import type { Poi } from '../model/types';
import { buildPlaceIndex, type OverpassElement } from './places';
import { poiAddress, searchPois, splitAddress } from './pois';

const poi = (id: string, name: string, type: string, address = '', position: [number, number] = [54.1, 10.6]): Poi => ({ id, name, type, group: 'pflege', position, address });

const POIS: Poi[] = [
  poi('a', 'Haus am See', 'Pflegeheim', 'Seestraße 4, 23701 Eutin'),
  poi('b', 'Seeblick', 'Hotel', 'Uferweg 2, 23701 Eutin'),
  poi('c', 'Lindenhof', 'Pflegeheim'),
  poi('d', 'Grundschule Am See', 'Schule', 'Schulweg 1, 23701 Eutin'),
  poi('e', 'Weißer Hirsch', 'Gaststätte', 'Markt 3, 23701 Eutin'),
];

describe('POI-Suche für die Maske', () => {
  it('findet Name, Typ und Adresse; Wortanfang vor Teiltreffer', () => {
    expect(searchPois(POIS, 'see').map((p) => p.id)).toEqual(['b', 'd', 'a']);
    expect(searchPois(POIS, 'pflege lind').map((p) => p.id)).toEqual(['c']);
    expect(searchPois(POIS, 'uferweg').map((p) => p.id)).toEqual(['b']);
    // normalisiert: ß/ss, Groß-/Kleinschreibung
    expect(searchPois(POIS, 'WEISSER').map((p) => p.id)).toEqual(['e']);
  });

  it('liefert nichts bei zu kurzer Eingabe oder ohne POIs und begrenzt die Liste', () => {
    expect(searchPois(POIS, 's')).toEqual([]);
    expect(searchPois(undefined, 'see')).toEqual([]);
    expect(searchPois(POIS, 'eutin', 2)).toHaveLength(2);
  });

  it('zerlegt Adressen und nimmt ohne eigene Adresse das nächste Gebäude', () => {
    expect(splitAddress('Seestraße 4a, 23701 Eutin')).toEqual({ street: 'Seestraße', houseNumber: '4a', postcode: '23701', city: 'Eutin' });
    expect(splitAddress('Seestraße')).toBeNull();
    expect(poiAddress(POIS[0])).toMatchObject({ street: 'Seestraße', houseNumber: '4', city: 'Eutin', address: 'Seestraße 4, 23701 Eutin' });

    const els: OverpassElement[] = [
      { type: 'node', id: 1, lat: 54.1001, lon: 10.6001, tags: { 'addr:street': 'Lindenweg', 'addr:housenumber': '3', 'addr:postcode': '23701', 'addr:city': 'Eutin', building: 'house' } },
      { type: 'node', id: 2, lat: 54.2, lon: 10.7, tags: { 'addr:street': 'Fernweg', 'addr:housenumber': '9', 'addr:postcode': '23701', 'addr:city': 'Eutin', building: 'house' } },
    ];
    const ix = buildPlaceIndex(els);
    expect(poiAddress(POIS[2], ix)).toMatchObject({ street: 'Lindenweg', houseNumber: '3', postcode: '23701', city: 'Eutin' });
    // ohne Kartendaten bleibt nur der Name, aber nie ein Absturz
    expect(poiAddress(POIS[2]).address).toBe('Lindenhof');
  });
});
