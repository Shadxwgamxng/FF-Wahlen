import type { LatLng, PolygonRings } from '../model/types';
import { simplifyRing } from '../sim/geo';
import type { OverpassElement } from './places';

/**
 * Zugriff auf OpenStreetMap-Dienste (kostenlos, mit Nutzungsregeln):
 *  - Nominatim (Landkreisgrenzen per Klick): https://operations.osmfoundation.org/policies/nominatim/
 *    max. 1 Anfrage/Sekunde, keine Massenabfragen – wir fragen nur pro Klick an.
 *  - Overpass API (Adressen/Orte einmalig je Leitstelle): https://wiki.openstreetmap.org/wiki/Overpass_API
 * Daten © OpenStreetMap-Mitwirkende, ODbL.
 */

export const NOMINATIM_URL = 'https://nominatim.openstreetmap.org';
/** Kostenlose öffentliche Overpass-Server – werden der Reihe nach probiert */
export const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];

export interface County {
  osmRelationId: number;
  name: string;
  state: string;
  polygons: PolygonRings[];
}

type GeoJsonGeom = { type: 'Polygon'; coordinates: number[][][] } | { type: 'MultiPolygon'; coordinates: number[][][][] } | { type: string; coordinates: unknown };

export function geojsonToPolygons(g: GeoJsonGeom, tol = 0.0004): PolygonRings[] {
  const ring = (r: number[][]): LatLng[] => simplifyRing(r.map(([lon, lat]) => [round5(lat), round5(lon)] as LatLng), tol);
  if (g.type === 'Polygon') return [(g.coordinates as number[][][]).map(ring)];
  if (g.type === 'MultiPolygon') return (g.coordinates as number[][][][]).map((p) => p.map(ring));
  return [];
}
const round5 = (x: number) => Math.round(x * 1e5) / 1e5;

/** Landkreis bzw. kreisfreie Stadt an einer Kartenposition (echte Grenze aus OSM) */
export async function fetchCountyAt(p: LatLng, fetchFn: typeof fetch = fetch): Promise<County> {
  const url = `${NOMINATIM_URL}/reverse?format=jsonv2&lat=${p[0]}&lon=${p[1]}&zoom=8&polygon_geojson=1&polygon_threshold=0.0003&accept-language=de`;
  const res = await fetchFn(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Nominatim antwortet mit Fehler ${res.status}.`);
  const j = await res.json();
  if (j.error) throw new Error('An dieser Stelle wurde kein Landkreis gefunden.');
  if (j.osm_type !== 'relation' || j.category !== 'boundary' || !j.geojson) {
    throw new Error('An dieser Stelle wurde keine Kreisgrenze gefunden – bitte etwas weiter ins Landesinnere klicken.');
  }
  const polygons = geojsonToPolygons(j.geojson);
  if (!polygons.length) throw new Error('Die Grenze konnte nicht gelesen werden.');
  return { osmRelationId: Number(j.osm_id), name: j.name ?? j.address?.county ?? j.address?.city ?? 'Unbekannt', state: j.address?.state ?? '', polygons };
}

const AMENITIES =
  'school|kindergarten|restaurant|pub|bar|cafe|fast_food|townhall|community_centre|place_of_worship|bus_station|library|theatre|cinema|swimming_pool|university|college|marketplace|fuel|post_office|bank|hospital|clinic|nursing_home|doctors|social_facility|fire_station|police';

export function overpassQueries(relationIds: number[]): { label: string; query: string }[] {
  const areas = relationIds.map((id) => `area(id:${3600000000 + id})`).join(';');
  const head = `[out:json][timeout:240];(${areas};)->.a;`;
  return [
    {
      label: 'Adressen und Gebäude',
      query: `${head}(nwr["addr:housenumber"]["addr:street"](area.a););out tags center qt;`,
    },
    {
      label: 'Einrichtungen, Wald und Gewässer',
      query: `${head}(nwr["amenity"~"^(${AMENITIES})$"](area.a);nwr["emergency"="ambulance_station"](area.a);nwr["shop"="supermarket"](area.a);nwr["railway"="station"](area.a);nwr["leisure"~"^(marina|park)$"](area.a);nwr["landuse"~"^(forest|farmland|meadow)$"](area.a);nwr["natural"~"^(wood|water|beach|heath)$"](area.a);way["waterway"~"^(river|canal)$"]["name"](area.a););out tags center qt;`,
    },
    {
      label: 'Straßen',
      query: `${head}(way["highway"~"^(motorway|trunk|primary|secondary|tertiary|unclassified)$"](area.a););out tags geom qt;`,
    },
  ];
}

export interface OverpassOptions {
  fetchFn?: typeof fetch;
  /** Fortschritt für die Anzeige, z. B. "Server 2 von 4 …" */
  onStatus?: (text: string) => void;
  /** Anzahl Durchgänge über alle Server */
  rounds?: number;
  /** Wartezeit vor dem 2., 3. … Durchgang in ms */
  backoffMs?: number[];
  /** Abbruch einer einzelnen Anfrage nach ms */
  requestTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Bereits geladene Abfragen (nur im Speicher): Ein erneuter Versuch lädt nur, was noch fehlt */
const overpassCache = new Map<string, OverpassElement[]>();
export const clearOverpassCache = () => overpassCache.clear();

const hostOf = (url: string) => new URL(url).host;

/**
 * Führt eine Overpass-Abfrage aus. Überlastete oder nicht erreichbare Server (im Browser oft nur als
 * "Failed to fetch" sichtbar) werden übersprungen; nach einem erfolglosen Durchgang wird gewartet
 * und erneut versucht.
 */
export async function runOverpass(query: string, options: OverpassOptions | typeof fetch = {}): Promise<OverpassElement[]> {
  const o: OverpassOptions = typeof options === 'function' ? { fetchFn: options } : options;
  const cached = overpassCache.get(query);
  if (cached) return cached;
  const fetchFn = o.fetchFn ?? fetch;
  const rounds = o.rounds ?? 3;
  const backoff = o.backoffMs ?? [10_000, 30_000];
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const timeoutMs = o.requestTimeoutMs ?? 300_000;
  const problems: string[] = [];
  for (let round = 0; round < rounds; round++) {
    if (round > 0) {
      const wait = backoff[Math.min(round - 1, backoff.length - 1)] ?? 0;
      o.onStatus?.(`Alle Kartendaten-Server ausgelastet – neuer Versuch in ${Math.round(wait / 1000)} s (Durchgang ${round + 1}/${rounds}) …`);
      await sleep(wait);
    }
    for (let i = 0; i < OVERPASS_URLS.length; i++) {
      const url = OVERPASS_URLS[i];
      o.onStatus?.(`Server ${i + 1}/${OVERPASS_URLS.length} (${hostOf(url)}) …`);
      const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
      const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
      try {
        const res = await fetchFn(url, { method: 'POST', body: new URLSearchParams({ data: query }), headers: { Accept: 'application/json' }, signal: ctrl?.signal });
        if (!res.ok) throw new Error(res.status === 429 ? 'zu viele Anfragen (429)' : `Fehler ${res.status}`);
        const j = await res.json();
        if (!Array.isArray(j.elements)) throw new Error('unerwartete Antwort');
        // Overpass meldet Zeitüberschreitungen teils im Text bei leerem Ergebnis
        if (typeof j.remark === 'string' && /runtime error|timed out|out of memory/i.test(j.remark)) throw new Error('Abfrage abgebrochen (Server ausgelastet)');
        overpassCache.set(query, j.elements);
        return j.elements as OverpassElement[];
      } catch (e) {
        const msg = (e as Error).name === 'AbortError' ? 'Zeitüberschreitung' : (e as Error).message === 'Failed to fetch' ? 'keine Antwort' : (e as Error).message;
        problems.push(`${hostOf(url)}: ${msg}`);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }
  }
  throw new Error(
    `Die kostenlosen OpenStreetMap-Server (Overpass) sind gerade nicht erreichbar oder überlastet. Bitte in ein paar Minuten erneut versuchen – bereits geladene Teile bleiben erhalten. (${problems.slice(-OVERPASS_URLS.length).join('; ')})`,
  );
}

export interface Facility {
  osmId: string;
  kind: 'feuerwehr' | 'rettungswache' | 'polizei' | 'krankenhaus';
  name: string;
  position: LatLng;
  address: string;
}

/** Wachen und Kliniken aus den heruntergeladenen OSM-Daten als Vorschläge */
export function extractFacilities(elements: OverpassElement[]): Facility[] {
  const out: Facility[] = [];
  const seen = new Set<string>();
  for (const e of elements) {
    const t = e.tags ?? {};
    const kind: Facility['kind'] | null =
      t.amenity === 'fire_station' ? 'feuerwehr' : t.emergency === 'ambulance_station' ? 'rettungswache' : t.amenity === 'police' ? 'polizei' : t.amenity === 'hospital' ? 'krankenhaus' : null;
    if (!kind) continue;
    const p = e.lat !== undefined ? ([e.lat, e.lon] as LatLng) : e.center ? ([e.center.lat, e.center.lon] as LatLng) : null;
    if (!p) continue;
    const id = `${e.type}/${e.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const addr = [t['addr:street'] && `${t['addr:street']} ${t['addr:housenumber'] ?? ''}`.trim(), [t['addr:postcode'], t['addr:city']].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const fallbackName = { feuerwehr: 'Feuerwehr', rettungswache: 'Rettungswache', polizei: 'Polizei', krankenhaus: 'Krankenhaus' }[kind];
    out.push({ osmId: id, kind, name: t.name ?? `${fallbackName}${t['addr:city'] ? ` ${t['addr:city']}` : ''}`, position: [round5(p[0]), round5(p[1])], address: addr });
  }
  return out.sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name, 'de'));
}
