import type { LatLng, PlaceIndex, Poi, PoiGroup } from '../model/types';
import { describePlace, reverseGeocode, type OverpassElement } from './places';

/**
 * Besondere Objekte (POIs) aus OpenStreetMap: Pflegeheime, Arztpraxen, Apotheken, Märkte, Schulen,
 * Kitas, Kirchen, Bahnhöfe, Industrie, Höfe, Campingplätze, Häfen, Badestellen …
 * Sie erscheinen auf der Karte und dienen als realistische Einsatzorte.
 */

type Rule = [group: PoiGroup, type: string, test: (t: Record<string, string>) => boolean];

const RULES: Rule[] = [
  ['pflege', 'Pflegeheim', (t) => t.amenity === 'nursing_home' || (t.amenity === 'social_facility' && /nursing_home|assisted_living|group_home/.test(t['social_facility'] ?? ''))],
  ['pflege', 'Arztpraxis', (t) => t.amenity === 'doctors' || t.healthcare === 'doctor'],
  ['pflege', 'Zahnarztpraxis', (t) => t.amenity === 'dentist' || t.healthcare === 'dentist'],
  ['pflege', 'Apotheke', (t) => t.amenity === 'pharmacy'],
  ['pflege', 'Dialyse', (t) => t.healthcare === 'dialysis' || /dialyse/i.test(t.name ?? '')],
  ['pflege', 'Klinik', (t) => t.amenity === 'clinic' || t.healthcare === 'clinic'],
  ['handel', 'Supermarkt', (t) => t.shop === 'supermarket' || t.shop === 'discount'],
  ['handel', 'Baumarkt', (t) => t.shop === 'doityourself' || t.shop === 'hardware'],
  ['handel', 'Einkaufszentrum', (t) => t.shop === 'mall' || t.shop === 'department_store'],
  ['handel', 'Tankstelle', (t) => t.amenity === 'fuel'],
  ['handel', 'Restaurant', (t) => t.amenity === 'restaurant' || t.amenity === 'fast_food'],
  ['handel', 'Gaststätte', (t) => t.amenity === 'pub' || t.amenity === 'bar' || t.amenity === 'cafe'],
  ['handel', 'Hotel', (t) => t.tourism === 'hotel' || t.tourism === 'guest_house'],
  ['oeffentlich', 'Schule', (t) => t.amenity === 'school'],
  ['oeffentlich', 'Kita', (t) => t.amenity === 'kindergarten' || t.amenity === 'childcare'],
  ['oeffentlich', 'Sporthalle', (t) => t.leisure === 'sports_centre' || t.leisure === 'sports_hall' || t.building === 'sports_hall'],
  ['oeffentlich', 'Schwimmbad', (t) => t.leisure === 'swimming_pool' || t.amenity === 'swimming_pool' || t.leisure === 'water_park'],
  ['oeffentlich', 'Kirche', (t) => t.amenity === 'place_of_worship'],
  ['oeffentlich', 'Bahnhof', (t) => t.railway === 'station' || t.railway === 'halt'],
  ['oeffentlich', 'Rathaus', (t) => t.amenity === 'townhall'],
  ['oeffentlich', 'Gemeindezentrum', (t) => t.amenity === 'community_centre'],
  ['oeffentlich', 'Veranstaltungsort', (t) => t.amenity === 'theatre' || t.amenity === 'cinema' || t.amenity === 'events_venue'],
  ['gewerbe', 'Industriebetrieb', (t) => t.landuse === 'industrial' || t.man_made === 'works' || t.industrial !== undefined],
  ['gewerbe', 'Landwirtschaftlicher Betrieb', (t) => t.landuse === 'farmyard' || t.place === 'farm' || t.building === 'farm'],
  ['gewerbe', 'Campingplatz', (t) => t.tourism === 'camp_site' || t.tourism === 'caravan_site'],
  ['gewerbe', 'Hafen', (t) => t.leisure === 'marina' || t.harbour === 'yes' || t.landuse === 'harbour'],
  ['gewerbe', 'Badestelle', (t) => t.leisure === 'bathing_place' || t.leisure === 'beach_resort'],
  ['gewerbe', 'Freizeitpark', (t) => t.tourism === 'theme_park' || t.tourism === 'zoo'],
];

export const POI_GROUP_LABEL: Record<PoiGroup, string> = { pflege: 'Pflege & Medizin', handel: 'Handel & Gastro', oeffentlich: 'Öffentlich', gewerbe: 'Gewerbe & Freizeit' };

/** Zusätzliche Overpass-Abfrage für POIs, die im Grunddatensatz fehlen */
export function poiQuery(relationIds: number[]): { label: string; query: string } {
  const areas = relationIds.map((id) => `area(id:${3600000000 + id})`).join(';');
  return {
    label: 'Besondere Objekte (POIs)',
    query: `[out:json][timeout:240];(${areas};)->.a;(nwr["amenity"~"^(nursing_home|social_facility|doctors|dentist|pharmacy|clinic|fuel|restaurant|fast_food|pub|bar|cafe|school|kindergarten|childcare|place_of_worship|townhall|community_centre|theatre|cinema|events_venue|swimming_pool)$"]["name"](area.a);nwr["healthcare"]["name"](area.a);nwr["shop"~"^(supermarket|discount|doityourself|hardware|mall|department_store)$"](area.a);nwr["tourism"~"^(hotel|guest_house|camp_site|caravan_site|theme_park|zoo)$"](area.a);nwr["leisure"~"^(sports_centre|sports_hall|swimming_pool|water_park|marina|bathing_place)$"]["name"](area.a);nwr["railway"~"^(station|halt)$"](area.a);nwr["landuse"~"^(industrial|farmyard|harbour)$"]["name"](area.a);nwr["man_made"="works"](area.a););out tags center qt;`,
  };
}

const posOf = (e: OverpassElement): LatLng | null =>
  e.lat !== undefined && e.lon !== undefined ? [e.lat, e.lon] : e.center ? [e.center.lat, e.center.lon] : null;

const round5 = (x: number) => Math.round(x * 1e5) / 1e5;

/** POIs aus Overpass-Elementen (nur benannte, ohne Doppelte), auf die gewählten Gruppen beschränkt */
export function extractPois(elements: OverpassElement[], groups: PoiGroup[] = ['pflege', 'handel', 'oeffentlich', 'gewerbe'], inside?: (p: LatLng) => boolean): Poi[] {
  const want = new Set(groups);
  const out: Poi[] = [];
  const seen = new Set<string>();
  for (const e of elements) {
    const t = e.tags ?? {};
    // Rettungswachen, Feuerwehren, Polizei und Krankenhäuser sind Standorte, keine POIs
    if (t.amenity === 'hospital' || t.amenity === 'fire_station' || t.amenity === 'police' || t.emergency === 'ambulance_station') continue;
    const rule = RULES.find((r) => want.has(r[0]) && r[2](t));
    if (!rule) continue;
    const p = posOf(e);
    if (!p || (inside && !inside(p))) continue;
    const name = t.name ?? (rule[1] === 'Bahnhof' ? t.name : undefined);
    if (!name) continue;
    const key = `${rule[1]}|${name}|${p[0].toFixed(3)}|${p[1].toFixed(3)}`;
    if (seen.has(key) || seen.has(`${e.type}/${e.id}`)) continue;
    seen.add(key);
    seen.add(`${e.type}/${e.id}`);
    const addr = [t['addr:street'] && `${t['addr:street']} ${t['addr:housenumber'] ?? ''}`.trim(), [t['addr:postcode'], t['addr:city']].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    out.push({ id: `poi_${e.type[0]}${e.id}`, name, type: rule[1], group: rule[0], position: [round5(p[0]), round5(p[1])], address: addr });
  }
  return out.sort((a, b) => a.group.localeCompare(b.group) || a.type.localeCompare(b.type, 'de') || a.name.localeCompare(b.name, 'de'));
}

export interface AddressParts {
  street: string;
  houseNumber: string;
  postcode: string;
  city: string;
}

/** Zerlegt „Straße Nr, PLZ Ort“ in Einzelteile (null, wenn keine Hausnummer erkennbar ist) */
export function splitAddress(addr: string): AddressParts | null {
  const m = /^(.*?)\s+(\d+\s*[a-zA-Z]?)\s*,\s*(\d{5})?\s*(.*)$/.exec(addr.trim());
  return m ? { street: m[1], houseNumber: m[2].replace(/\s+/g, ''), postcode: m[3] ?? '', city: m[4] } : null;
}

/**
 * Vollständige Adresse eines POI: eigene addr-Tags, sonst alles vom nächsten Gebäude (nie gemischt).
 * Nur ohne Kartendaten bleibt die (ggf. unvollständige) eigene Angabe bzw. der Name.
 */
export function poiAddress(poi: Poi, ix?: PlaceIndex | null): AddressParts & { address: string } {
  const own = splitAddress(poi.address);
  if (own) return { ...own, address: poi.address };
  const r = ix ? reverseGeocode(ix, poi.position) : null;
  if (ix && r) {
    const d = describePlace(ix, r.tuple);
    return { street: d.street, houseNumber: d.houseNumber, postcode: d.postcode, city: d.city, address: d.address };
  }
  return { street: poi.address ? poi.address.split(',')[0].trim() : '', houseNumber: '', postcode: '', city: '', address: poi.address || poi.name };
}

const normPoi = (s: string) =>
  s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9äöü]+/g, ' ')
    .trim();

/** POI-Suche für die Maske: Name, Typ oder Adresse; Treffer am Wortanfang vor Teiltreffern */
export function searchPois(pois: Poi[] | undefined, query: string, limit = 10): Poi[] {
  const q = normPoi(query);
  if (q.length < 2 || !pois?.length) return [];
  const words = q.split(' ');
  const scored: { p: Poi; s: number }[] = [];
  for (const p of pois) {
    const name = normPoi(p.name);
    const hay = `${name} ${normPoi(p.type)} ${normPoi(p.address)}`;
    // alle Suchwörter müssen vorkommen
    if (!words.every((w) => hay.includes(w))) continue;
    const atWord = (w: string) => hay.startsWith(w) || hay.includes(` ${w}`);
    const s = name.startsWith(q) ? 0 : words.every(atWord) ? (words.every((w) => name.startsWith(w) || name.includes(` ${w}`)) ? 1 : 2) : 3;
    scored.push({ p, s });
  }
  return scored
    .sort((a, b) => a.s - b.s || a.p.name.localeCompare(b.p.name, 'de'))
    .slice(0, limit)
    .map((x) => x.p);
}
