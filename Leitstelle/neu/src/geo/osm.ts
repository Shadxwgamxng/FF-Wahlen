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
export const OVERPASS_URLS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];

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

export async function runOverpass(query: string, fetchFn: typeof fetch = fetch): Promise<OverpassElement[]> {
  let lastErr: unknown = null;
  for (const url of OVERPASS_URLS) {
    try {
      const res = await fetchFn(url, { method: 'POST', body: new URLSearchParams({ data: query }), headers: { Accept: 'application/json' } });
      if (res.status === 429) throw new Error('Overpass ist ausgelastet (zu viele Anfragen). Bitte in einer Minute erneut versuchen.');
      if (!res.ok) throw new Error(`Overpass antwortet mit Fehler ${res.status}.`);
      const j = await res.json();
      return j.elements as OverpassElement[];
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Overpass nicht erreichbar.');
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
