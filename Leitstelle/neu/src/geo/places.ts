import type { Area, LatLng, PlaceIndex, PlaceKind, PlaceTuple } from '../model/types';
import { distanceMeters, pointInArea } from '../sim/geo';
import type { Rng } from '../sim/rng';

/**
 * Echte Einsatzorte aus OpenStreetMap.
 * - buildPlaceIndex(): wandelt eine Overpass-Antwort in einen kompakten Index um
 * - pickPlace():       wählt zufällig einen zur Lage passenden Ort (Wohnhaus, Straße, Wald …)
 * - describePlace():   erzeugt Adresse und Ortsbeschreibung
 * - geocode():         findet eine eingegebene Adresse (Straße, Hausnummer, Ort)
 */

export interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  geometry?: { lat: number; lon: number }[];
  tags?: Record<string, string>;
}

const RESIDENTIAL = new Set(['house', 'residential', 'apartments', 'detached', 'semidetached_house', 'terrace', 'bungalow', 'farm', 'yes', 'dormitory']);
const COMMERCIAL = new Set(['industrial', 'commercial', 'warehouse', 'retail', 'office', 'manufacture', 'service', 'barn', 'farm_auxiliary', 'supermarket']);
const PUBLIC_AMENITY = new Set(['school', 'kindergarten', 'restaurant', 'pub', 'bar', 'cafe', 'fast_food', 'townhall', 'community_centre', 'place_of_worship', 'bus_station', 'library', 'theatre', 'cinema', 'swimming_pool', 'university', 'college', 'marketplace', 'fuel', 'post_office', 'bank']);
const MEDICAL_AMENITY = new Set(['hospital', 'clinic', 'nursing_home', 'doctors', 'social_facility']);

/** Ordnet ein OSM-Element einer Ortsart zu (oder null, wenn es nicht als Einsatzort taugt) */
export function classify(t: Record<string, string>): PlaceKind | null {
  const hw = t.highway;
  if (hw === 'motorway' || hw === 'trunk') return 'b';
  if (hw && ['primary', 'secondary', 'tertiary', 'unclassified', 'residential'].includes(hw)) return 's';
  if (t.landuse === 'forest' || t.natural === 'wood' || t.landuse === 'farmland' || t.landuse === 'meadow' || t.natural === 'heath') return 'l';
  if (t.natural === 'water' || t.natural === 'beach' || t.waterway === 'river' || t.waterway === 'canal' || t.leisure === 'marina') return 'x';
  if (MEDICAL_AMENITY.has(t.amenity) || t.healthcare) return 'k';
  if (PUBLIC_AMENITY.has(t.amenity) || t.shop === 'supermarket' || t.leisure === 'park' || t.railway === 'station' || t.tourism === 'hotel') return 'o';
  // Wachen, Behörden u. ä. sind keine typischen Einsatzorte
  if (t.amenity || t.emergency || t.office === 'government') return null;
  if (t['addr:housenumber'] && t['addr:street']) {
    if (t.shop || t.craft || t.office || t.industrial || COMMERCIAL.has(t.building)) return 'g';
    if (!t.building || RESIDENTIAL.has(t.building)) return 'w';
  }
  return null;
}

class Strings {
  list: string[] = [];
  private map = new Map<string, number>();
  idx(s: string | undefined): number {
    if (!s) return -1;
    let i = this.map.get(s);
    if (i === undefined) {
      i = this.list.length;
      this.list.push(s);
      this.map.set(s, i);
    }
    return i;
  }
}

const pos = (e: OverpassElement): LatLng | null => {
  if (e.lat !== undefined && e.lon !== undefined) return [e.lat, e.lon];
  if (e.center) return [e.center.lat, e.center.lon];
  if (e.geometry?.length) {
    // mittlerer Stützpunkt liegt (anders als der Mittelpunkt der Box) sicher auf der Straße
    const g = e.geometry[Math.floor(e.geometry.length / 2)];
    return [g.lat, g.lon];
  }
  return null;
};

export interface BuildOptions {
  /** Höchstzahl je Ortsart (zufällige, aber reproduzierbare Auswahl) */
  maxPerKind?: Partial<Record<PlaceKind, number>>;
  /** Nur Orte innerhalb dieser Gebiete */
  areas?: Pick<Area, 'polygons'>[];
}

export function buildPlaceIndex(elements: OverpassElement[], opts: BuildOptions = {}): PlaceIndex {
  const strings = new Strings();
  const addressed: { p: LatLng; street: string; city: string; pc: string }[] = [];
  const raw: { kind: PlaceKind; p: LatLng; t: Record<string, string> }[] = [];
  for (const e of elements) {
    const t = e.tags ?? {};
    const kind = classify(t);
    const p = pos(e);
    if (!kind || !p) continue;
    if (opts.areas?.length && !opts.areas.some((a) => pointInArea(p, a))) continue;
    raw.push({ kind, p, t });
    if (t['addr:street'] && t['addr:housenumber']) addressed.push({ p, street: t['addr:street'], city: t['addr:city'] ?? t['addr:place'] ?? '', pc: t['addr:postcode'] ?? '' });
  }
  // Raster für die Suche nach der nächsten Adresse (für Straßen-, Wald-, Gewässerorte)
  const grid = new Map<string, typeof addressed>();
  const key = (p: LatLng) => `${Math.floor(p[0] * 50)}:${Math.floor(p[1] * 30)}`;
  for (const a of addressed) {
    const k = key(a.p);
    if (!grid.has(k)) grid.set(k, []);
    grid.get(k)!.push(a);
  }
  const nearest = (p: LatLng) => {
    let best: (typeof addressed)[number] | null = null;
    let bd = Infinity;
    const gy = Math.floor(p[0] * 50);
    const gx = Math.floor(p[1] * 30);
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++)
        for (const a of grid.get(`${gy + dy}:${gx + dx}`) ?? []) {
          const d = (a.p[0] - p[0]) ** 2 + ((a.p[1] - p[1]) * 0.6) ** 2;
          if (d < bd) {
            bd = d;
            best = a;
          }
        }
    return best;
  };

  const byKind = new Map<PlaceKind, PlaceTuple[]>();
  for (const r of raw) {
    const t = r.t;
    let street: string | undefined = t['addr:street'];
    let nr = t['addr:housenumber'] ?? '';
    let city = t['addr:city'] ?? t['addr:place'] ?? '';
    let pc = t['addr:postcode'] ?? '';
    let name = t.name;
    if (r.kind === 's' || r.kind === 'b') {
      street = t.name ?? t.ref;
      nr = '';
      name = t.ref && t.name ? t.ref : '';
    }
    if (!city || !street) {
      const n = nearest(r.p);
      if (!n) continue; // ohne Bezug zu einer Ortschaft nicht als Einsatzort verwendbar
      city ||= n.city;
      pc ||= n.pc;
      if (!street) street = n.street;
    }
    if (!street || !city) continue;
    const tuple: PlaceTuple = [r.kind, Math.round(r.p[0] * 1e5), Math.round(r.p[1] * 1e5), strings.idx(street), nr, strings.idx(city), pc, strings.idx(name)];
    if (!byKind.has(r.kind)) byKind.set(r.kind, []);
    byKind.get(r.kind)!.push(tuple);
  }
  const places: PlaceTuple[] = [];
  for (const [kind, list] of byKind) {
    const max = opts.maxPerKind?.[kind];
    if (max !== undefined && list.length > max) {
      // gleichmäßig ausdünnen (deterministisch)
      const step = list.length / max;
      for (let i = 0; i < max; i++) places.push(list[Math.floor(i * step)]);
    } else places.push(...list);
  }
  return { source: 'osm', fetchedAt: new Date().toISOString(), strings: strings.list, places };
}

export const placeLatLng = (t: PlaceTuple): LatLng => [t[1] / 1e5, t[2] / 1e5];

const KIND_TEXT: Record<PlaceKind, string> = {
  w: 'Wohnhaus',
  g: 'Gewerbebetrieb',
  o: 'öffentlicher Ort',
  k: 'Einrichtung des Gesundheitswesens',
  s: 'Straße',
  b: 'Schnellstraße',
  l: 'Wald / Feldflur',
  x: 'Gewässer / Strand',
};

export function describePlace(ix: PlaceIndex, t: PlaceTuple): { address: string; street: string; houseNumber: string; city: string; postcode: string; detail: string } {
  const street = ix.strings[t[3]] ?? '';
  const city = ix.strings[t[5]] ?? '';
  const name = t[7] >= 0 ? ix.strings[t[7]] : '';
  const kind = t[0];
  let address: string;
  let detail: string;
  switch (kind) {
    case 's':
      address = `${street}, ${t[6]} ${city}`.trim();
      detail = 'auf der Fahrbahn';
      break;
    case 'b':
      address = `${name || street}${name && street !== name ? ` (${street})` : ''} bei ${city}`;
      detail = 'Schnellstraße';
      break;
    case 'l':
      address = `Wald/Feld nahe ${street}, ${t[6]} ${city}`.trim();
      detail = name || 'Feldweg';
      break;
    case 'x':
      address = `${name || 'Ufer'} nahe ${street}, ${t[6]} ${city}`.trim();
      detail = name ? 'am Ufer' : 'Gewässer';
      break;
    default:
      address = `${street} ${t[4]}, ${t[6]} ${city}`.replace(/\s+,/, ',').trim();
      detail = name || KIND_TEXT[kind];
  }
  return { address, street, houseNumber: t[4], city, postcode: t[6], detail };
}

/** Ausweichreihenfolge, falls eine Ortsart im Gebiet fehlt */
const FALLBACK: Record<PlaceKind, PlaceKind[]> = {
  w: ['w', 'g', 'o'],
  g: ['g', 'w'],
  o: ['o', 'g', 'w'],
  k: ['k', 'o', 'w'],
  s: ['s', 'b', 'w'],
  b: ['b', 's'],
  l: ['l', 's'],
  x: ['x', 'l', 's'],
};

/** Index nach Art – wird pro PlaceIndex-Objekt zwischengespeichert */
const kindCache = new WeakMap<PlaceIndex, Map<PlaceKind, PlaceTuple[]>>();
export function placesOfKind(ix: PlaceIndex, k: PlaceKind): PlaceTuple[] {
  let m = kindCache.get(ix);
  if (!m) {
    m = new Map();
    for (const p of ix.places) {
      if (!m.has(p[0])) m.set(p[0], []);
      m.get(p[0])!.push(p);
    }
    kindCache.set(ix, m);
  }
  return m.get(k) ?? [];
}

export function pickPlace(ix: PlaceIndex, rng: Rng, kind: PlaceKind): PlaceTuple | null {
  for (const k of FALLBACK[kind]) {
    const list = placesOfKind(ix, k);
    if (list.length) return list[Math.floor(rng.next() * list.length)];
  }
  return ix.places.length ? ix.places[Math.floor(rng.next() * ix.places.length)] : null;
}

// ---------------------------------------------------------------------------
// Adresssuche (für die Einsatzmaske)
// ---------------------------------------------------------------------------

export interface StreetEntry {
  street: string;
  city: string;
  postcode: string;
  /** Hausnummer -> Position */
  numbers: Map<string, LatLng>;
  /** Mittelpunkt der Straße (falls Hausnummer unbekannt) */
  center: LatLng;
}

const streetCache = new WeakMap<PlaceIndex, StreetEntry[]>();
export function streetDirectory(ix: PlaceIndex): StreetEntry[] {
  const cached = streetCache.get(ix);
  if (cached) return cached;
  const m = new Map<string, { e: StreetEntry; sum: [number, number, number] }>();
  for (const t of ix.places) {
    if (t[0] === 'l' || t[0] === 'x' || t[0] === 'b') continue;
    const street = ix.strings[t[3]];
    const city = ix.strings[t[5]];
    const k = `${street}|${city}`;
    let rec = m.get(k);
    if (!rec) {
      rec = { e: { street, city, postcode: t[6], numbers: new Map(), center: [0, 0] }, sum: [0, 0, 0] };
      m.set(k, rec);
    }
    const p = placeLatLng(t);
    if (t[4]) rec.e.numbers.set(t[4].toLowerCase(), p);
    rec.sum[0] += p[0];
    rec.sum[1] += p[1];
    rec.sum[2]++;
  }
  const out = [...m.values()].map(({ e, sum }) => ({ ...e, center: [sum[0] / sum[2], sum[1] / sum[2]] as LatLng }));
  out.sort((a, b) => a.street.localeCompare(b.street, 'de') || a.city.localeCompare(b.city, 'de'));
  streetCache.set(ix, out);
  return out;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/straße/g, 'str')
    .replace(/strasse/g, 'str')
    .replace(/str\./g, 'str')
    .replace(/[^a-z0-9äöüß]/g, '');

export function searchStreets(ix: PlaceIndex, query: string, limit = 12): StreetEntry[] {
  const q = norm(query);
  if (q.length < 2) return [];
  const dir = streetDirectory(ix);
  const starts = dir.filter((e) => norm(e.street).startsWith(q));
  const contains = dir.filter((e) => !norm(e.street).startsWith(q) && norm(e.street).includes(q));
  return [...starts, ...contains].slice(0, limit);
}

export interface GeocodeResult {
  position: LatLng;
  exact: boolean;
  street: string;
  city: string;
  postcode: string;
}

export function geocode(ix: PlaceIndex, street: string, houseNumber: string, city: string): GeocodeResult | null {
  const s = norm(street);
  const c = norm(city);
  const dir = streetDirectory(ix);
  const cands = dir.filter((e) => norm(e.street) === s && (!c || norm(e.city) === c));
  if (!cands.length) return null;
  for (const e of cands) {
    const p = e.numbers.get(houseNumber.trim().toLowerCase());
    if (p) return { position: p, exact: true, street: e.street, city: e.city, postcode: e.postcode };
  }
  const e = cands[0];
  return { position: e.center, exact: false, street: e.street, city: e.city, postcode: e.postcode };
}

/** Nächstgelegene Adresse zu einer Position (z. B. Ergebnis einer Handy-Ortung) */
export function reverseGeocode(ix: PlaceIndex, p: LatLng): { tuple: PlaceTuple; distanceM: number } | null {
  let best: PlaceTuple | null = null;
  let bd = Infinity;
  for (const t of ix.places) {
    if (t[0] === 'l' || t[0] === 'x' || t[0] === 'b' || !t[4]) continue;
    const d = distanceMeters(p, placeLatLng(t));
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return best ? { tuple: best, distanceM: bd } : null;
}
