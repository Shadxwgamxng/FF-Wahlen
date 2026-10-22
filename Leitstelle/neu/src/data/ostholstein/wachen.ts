import type { LatLng } from '../../model/types';
import { parseCsv } from '../../persistence/csv';
import wachenCsv from './wachen.csv?raw';

/**
 * Wachen der Beispielleitstelle Ostholstein: eine Station je Zeile in wachen.csv (mit Koordinaten,
 * Quelle bos-fahrzeuge.info bzw. Websites der Wehren und Rettungsdienst Holstein), dazu wenige Wachen,
 * die nur aus Hinweisen der Fahrzeugliste folgen (EXTRA).
 *
 *  - osm:     Namen der Wache in OpenStreetMap; damit wird der OSM-Eintrag derselben Wache übernommen
 *             statt doppelt angelegt (Teilstrings wie "Burg"/"Oldenburg" machen den Abgleich über Namen allein unsicher)
 *  - posKind: 'adr' = Position der Adresse, 'ort' = nur Ortsmitte bzw. Straße (genaue Lage unbekannt),
 *             'osm' = Position des OSM-Objekts
 */

export type WacheKind = 'ff' | 'rw' | 'thw' | 'kats' | 'luft';

export interface WacheDef {
  name: string;
  kind: WacheKind;
  osm?: string[];
  pos: LatLng;
  posKind: 'osm' | 'adr' | 'ort';
  address?: string;
}

/** OSM-Namen der Wachen (amenity=fire_station bzw. emergency=ambulance_station) */
const OSM_NAMES: Record<string, string[]> = {
  'DRK RW Neustadt in Holstein': ['Rettungswache Neustadt'],
  'DRK RW Oldenburg in Holstein': ['Rettungswache Oldenburg', 'Rettungswache Oldenburg in Holstein'],
  'FF Ahrensbök OF Ahrensbök': ['Freiwillige Feuerwehr Ahrensbök'],
  'FF Altenkrempe OF Altenkrempe': ['Freiwillige Feuerwehr Altenkrempe'],
  'FF Bad Schwartau OF Bad Schwartau-Rensefeld': ['Freiwillige Feuerwehr Bad Schwartau-Rensefeld'],
  'FF Bad Schwartau OF Groß Parin': ['Freiwillige Feuerwehr Parin'],
  'FF Beschendorf': ['Freiwillige Feuerwehr Beschendorf'],
  'FF Bosau OF Hutzfeld-Brackrade': ['Freiwillige Feuerwehr Hutzfeld-Brackrade'],
  'FF Bosau OF Thürk': ['Freiwillige Feuerwehr Thürk'],
  'FF Bujendorf': ['Freiwilige Feuerwehr Bujendorf'],
  'FF Dahme': ['Freiwillige Feuerwehr Dahme'],
  'FF Damlos': ['Freiwillige Feuerwehr Damlos'],
  'FF Eutin OF Eutin': ['Freiwillige Feuerwehr Eutin'],
  'FF Eutin OF Fissau-Sibbersdorf': ['Freiwillige Feuerwehr Fissau-Sibbersdorf'],
  'FF Eutin OF Neudorf': ['Freiwillige Feuerwehr Eutin-Neudorf'],
  'FF Fehmarn OF Bannesdorf': ['Freiwillige Feuerwehr Bannesdorf'],
  'FF Fehmarn OF Burg auf Fehmarn': ['Freiwillige Feuerwehr Burg'],
  'FF Fehmarn OF Dänschendorf': ['Freiwillige Feuerwehr Dänschendorf'],
  'FF Fehmarn OF Landkirchen': ['Freiwillige Feuerwehr Landkirchen'],
  'FF Fehmarn OF Puttgarden-Todendorf': ['Freiwillige Feuerwehr Puttgarden'],
  'FF Fehmarn OF Süderort': ['Freiwillige Feuerwehr Süderort'],
  'FF Fehmarn OF Westfehmarn': ['Ortswehr Petersdorf'],
  'FF Großenbrode': ['Freiwillige Feuerwehr Großenbrode'],
  'FF Grube': ['Freiwillige Feuerwehr Grube'],
  'FF Grömitz OF Brenkenhagen': ['Feuerwehr Brenkenhagen'],
  'FF Grömitz OF Cismar': ['Freiwillige Feuerwehr Cismar'],
  'FF Grömitz OF Grömitz': ['Feuerwehr Grömitz'],
  'FF Grömitz OF Guttau': ['Feuerwehr Guttau'],
  'FF Grömitz OF Lenste': ['Freiwillige Feuerwehr Lenste'],
  'FF Grömitz OF Suxdorf-Nienhagen': ['Feuerwehr Suxdorf-Nienhagen'],
  'FF Göhl': ['Freiwillige Feuerwehr Göhl'],
  'FF Harmsdorf': ['Freiwillige Feuerwehr Harmsdorf'],
  'FF Heiligenhafen': ['Freiwillige Feuerwehr Stadt Heiligenhafen'],
  'FF Kasseedorf OF Kasseedorf': ['FF Kasseedorf'],
  'FF Kellenhusen': ['Feuerwehr Kellenhusen'],
  'FF Lensahn OF Lensahn': ['Freiwillige Feuerwehr Lensahn'],
  'FF Lensahn OF Lensahnerhof': ['Freiwillige Feuerwehr Lensahnerhof'],
  'FF Lensahn OF Sipsdorf': ['Freiwillige Feuerwehr Sipsdorf'],
  'FF Lensahn OF Wahrendorf': ['Freiwillige Feuerwehr Wahrendorf'],
  'FF Manhagen': ['Freiwillige Feuerwehr Manhagen'],
  'FF Neustadt in Holstein': ['Freiwillige Feuerwehr Neustadt in Holstein'],
  'FF Oldenburg in Holstein': ['Freiwillige Feuerwehr Oldenburg'],
  'FF Ratekau OF Luschendorf': ['Freiwillige Feuerwehr Luschendorf'],
  'FF Ratekau OF Offendorf': ['Freiwillige Feuerwehr Offendorf/Kreuzkamp'],
  'FF Ratekau OF Ovendorf': ['Freiwillige Feuerwehr Ovendorf'],
  'FF Ratekau OF Ratekau': ['Freiwillige Feuerwehr Ratekau'],
  'FF Ratekau OF Sereetz': ['Freiwillige Feuerwehr Sereetz'],
  'FF Ratekau OF Warnsdorf/Häven': ['Freiwillige Feuerwehr Warnsdorf'],
  'FF Scharbeutz OF Gleschendorf': ['Freiwillige Feuerwehr Gleschendorf'],
  'FF Scharbeutz OF Haffkrug': ['Freiwillige Feuerwehr Haffkrug'],
  'FF Scharbeutz OF Pönitz': ['Feuerwehr Pönitz'],
  'FF Scharbeutz OF Scharbeutz': ['Freiwillige Feuerwehr Scharbeutz'],
  'FF Schönwalde am Bungsberg OF Schönwalde am Bungsberg': ['Freiwillige Feuerwehr Schönwalde'],
  'FF Sierksdorf OF Sierksdorf': ['Freiwillige Feuerwehr Sierksdorf'],
  'FF Stockelsdorf OF Curau': ['Freiwillige Feuerwehr Curau'],
  'FF Stockelsdorf OF Eckhorst': ['Freiwillige Feuerwehr Eckhorst'],
  'FF Stockelsdorf OF Mori': ['Freiwillige Feuerwehr Mori'],
  'FF Stockelsdorf OF Stockelsdorf': ['Freiwillige Feuerwehr Stockelsdorf'],
  'FF Süsel OF Fassensdorf': ['Freiwillige Feuerwehr Fassensdorf'],
  'FF Süsel OF Gothendorf': ['Freiwillige Feuerwehr Gothendorf'],
  'FF Süsel OF Groß Meinsdorf': ['Freiwillige Feuerwehr Groß Meinsdorf'],
  'FF Süsel OF Süsel': ['Freiwillige Feuerwehr Süsel'],
  'FF Süsel OF Zarnekau': ['Feuerwehr Zarnekau'],
  'FF Timmendorfer Strand OF Hemmelsdorf': ['Freiwillige Feuerwehr Hemmelsdorf'],
  'FF Timmendorfer Strand OF Niendorf/Ostsee': ['Freiwillige Feuerwehr Niendorf'],
  'FF Timmendorfer Strand OF Timmendorfer Strand': ['Freiwillige Feuerwehr Timmendorfer Strand'],
  'FTZ Kreis Ostholstein': ['Feuerwehrtechnische Zentrale des Kreises Ostholstein ( FTZ Ostholstein)'],
  'JUH RW Bad Schwartau': ['Rettungswache Bad Schwartau'],
  'JUH RW Cismar': ['Rettungswache Cismar'],
  'rdh. RW Ahrensbök': ['Rettungswache Ahrensbök'],
  'rdh. RW Burg auf Fehmarn': ['Rettungswache Burg'],
  'rdh. RW Eutin': ['Rettungswache Eutin'],
  'rdh. RW Heiligenhafen': ['Rettungswache Heiligenhafen'],
  'rdh. RW Malente': ['Rettungswache Malente'],
  'rdh. RW Petersdorf': ['Rettungswache Petersdorf'],
  'rdh. RW Schönwalde': ['Rettungswache Schönwalde am Bungsberg'],
  'rdh. RW Timmendorfer Strand': ['Rettungswache Timmendorfer Strand'],
};

/** Wachenart aus Name und Organisation der Wachenliste */
export function kindOf(name: string, organisation: string): WacheKind {
  if (/Luftrettung/i.test(organisation)) return 'luft';
  if (/^THW\b/.test(name) || /^THW$/i.test(organisation)) return 'thw';
  if (/\bRW\b/.test(name) || /Rettungsdienst/i.test(organisation)) return 'rw';
  if (/Feuerwehr|^FTZ\b/i.test(organisation) || /^(FF|PF|FTZ)\b/.test(name)) return 'ff';
  return 'kats';
}

/** Wachen, die in der Wachenliste fehlen und aus Hinweisen bzw. der Ortskennziffer der Fahrzeugliste folgen */
const EXTRA: WacheDef[] = [
  // "Kennzahl 01 = Kreisebene, vermutlich Leitung rdh." – Lage nur ungefähr (Bad Schwartau)
  { name: 'rdh. Leitung Bad Schwartau', kind: 'rw', pos: [53.91205, 10.67194], posKind: 'ort', address: 'Gutenbergstraße 1, 23611 Bad Schwartau' },
  { name: 'DLRG Eutin', kind: 'kats', pos: [54.13805, 10.61231], posKind: 'ort', address: 'Eutin' },
  { name: 'DLRG Bosau', kind: 'kats', pos: [54.10214, 10.42523], posKind: 'ort', address: 'Bosau' },
  { name: 'DRK OV Timmendorfer Strand', kind: 'kats', pos: [53.99177, 10.77797], posKind: 'ort', address: 'Timmendorfer Strand' },
];

/** Genauere Position als in der Liste (dort nur Ortsmitte) */
const POSITION_OVERRIDE: Record<string, Pick<WacheDef, 'pos' | 'posKind' | 'address'>> = {
  'Luftrettungszentrum Siblin': { pos: [54.03495, 10.56238], posKind: 'osm', address: 'Am Hubschrauberlandeplatz 1, 23623 Ahrensbök' },
};

/** Adressen mit Fehlern in der Quelle */
const ADDRESS_FIX: Record<string, string> = {
  // Quelle nennt 23863 – Scharbeutz hat 23683/23684
  'DLRG Haffkrug-Scharbeutz': 'Fuchsberg 1b, 23683 Scharbeutz',
};

export function parseWachen(csv: string): WacheDef[] {
  const fromCsv = parseCsv(csv).flatMap((r): WacheDef[] => {
    const name = r.wache?.trim();
    const lat = Number(r.lat);
    const lon = Number(r.lon);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lon)) return [];
    const exact = /^Adresse/i.test(r.genauigkeit ?? '') || /OSM/i.test(r.genauigkeit ?? '');
    const def: WacheDef = {
      name,
      kind: kindOf(name, r.organisation ?? ''),
      ...(OSM_NAMES[name] ? { osm: OSM_NAMES[name] } : {}),
      pos: [lat, lon],
      posKind: /OSM/i.test(r.genauigkeit ?? '') ? 'osm' : exact ? 'adr' : 'ort',
      address: ADDRESS_FIX[name] ?? r.adresse?.trim(),
    };
    return [Object.assign(def, POSITION_OVERRIDE[name])];
  });
  const known = new Set(fromCsv.map((d) => d.name));
  return [...fromCsv, ...EXTRA.filter((d) => !known.has(d.name))];
}

export const WACHEN: WacheDef[] = parseWachen(wachenCsv);

/** Abweichende Schreibweisen der Wache in der Fahrzeugliste */
export const WACHE_ALIAS: Record<string, string> = {
  'FF Stadt Fehmarn OF Landkirchen': 'FF Fehmarn OF Landkirchen',
};

/** Kurzname der Organisation für Wachen, die aus der Ortskennziffer abgeleitet werden */
export const ORG_SHORT: Record<string, string> = {
  Pelikan: 'DLRG',
  Rotkreuz: 'DRK OV',
  Akkon: 'JUH OV',
  Sama: 'ASB',
  Kater: 'ASB',
  Johannes: 'MHD',
};
