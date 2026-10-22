import type { CenterConfig, LatLng, Station, Vehicle } from '../../model/types';
import type { County } from '../../geo/osm';
import { extractFacilities } from '../../geo/osm';
import { buildPlaceIndex, type OverpassElement } from '../../geo/places';
import { extractPois } from '../../geo/pois';
import { buildCenter, defaultOrganizations } from '../centerFactory';
import { emptyVehicleRuntime } from '../sampleCenter';
import { distanceMeters, pointInArea } from '../../sim/geo';
import boundary from './boundary.json';
import { gemeindeCenter, gemeindeOf } from './gemeinden';
import { ostholsteinVehicleTypes } from './fahrzeugtypen';
import { buildRoster, type RosterStation } from './roster';
import type { WacheDef } from './wachen';

export { gemeindeOf, okzOf } from './gemeinden';

/**
 * Beispielleitstelle "Kreis Ostholstein" mit echten Fahrzeugen und Wachen.
 *  - Fahrzeuge und Wachen nach öffentlichen Quellen: bos-fahrzeuge.info, Websites der Wehren,
 *    brianpeschke.de und Rettungsdienst Holstein (vollständige Liste Stand Oktober 2026: fahrzeuge-komplett.csv, wachen.csv).
 *    Fahrzeuge ohne veröffentlichten Funkrufnamen bekommen einen Rufnamen nach dem Schema
 *    "Florian Ostholstein 61/48-01" (Ortskennziffer / Fahrzeugkenner - laufende Nummer).
 *  - Kreisgrenze: mitgeliefert (OSM-Relation 27025, über Nominatim abgerufen)
 *  - Wachen an den Koordinaten aus wachen.csv (Adresse bzw. Ortsmitte); der OSM-Eintrag derselben Wache wird übernommen.
 *  - Adressen, Polizei, Kliniken: werden beim ersten Start live über die Overpass-API geladen
 *    (kostenlos, Daten © OpenStreetMap-Mitwirkende, ODbL).
 *  - Polizei ist nicht in den Listen: je Polizeistation ein Streifenwagen (Anforderung per Telefon).
 */

export const OSTHOLSTEIN: County = boundary as County;

const shortPlace = (name: string) =>
  name
    .replace(/^(Freiwillige Feuerwehr|Feuerwehr|FF|Feuerwache|Feuerwehrhaus|Rettungswache|RW|DRK[- ]Rettungswache|Polizeistation|Polizeirevier|Polizei)\s*/i, '')
    .replace(/\s*\(.*\)$/, '')
    .trim() || name;

/**
 * Wachen, die es als eigene Wehr nicht (mehr) gibt (in OpenStreetMap trotzdem eingetragen). Laut Nutzer:
 * Wulfsdorf, Sulsdorf und Techelwitz gibt es nicht; "FF Gemeinde Gremersdorf" ist FF Giddendorf-Seegalendorf-Gremersdorf.
 */
const NOT_A_UNIT = [/Altratjensdorf/, /Wulfsdorf/, /Sulsdorf/, /Techelwitz/, /Gemeinde Gremersdorf/];

const KIND: Record<Exclude<WacheDef['kind'], 'luft'>, { kind: Station['kind']; org: string; turnout: number }> = {
  ff: { kind: 'feuerwehrhaus', org: 'org_ff', turnout: 300 },
  rw: { kind: 'rettungswache', org: 'org_rd', turnout: 60 },
  thw: { kind: 'thw', org: 'org_thw', turnout: 900 },
  kats: { kind: 'kats', org: 'org_kats', turnout: 600 },
};

/** Stationsarten aus OSM, die zu einer Wachenart passen */
const OSM_KINDS: Partial<Record<WacheDef['kind'], Station['kind'][]>> = { ff: ['feuerwehrhaus', 'feuerwache'], rw: ['rettungswache'] };

const baseName = (n: string) => n.replace(/\s*\(\d+\)$/, '').trim().toLowerCase();

/**
 * Ortsteil des Wachennamens für den Dublettenabgleich: ohne Organisation und Wachenart, bei Ortsfeuerwehren
 * nur der Ortsteil ("rdh. RW Malente", "Rettungswache Malente" → "malente"; "FF Eutin OF Neudorf" → "neudorf").
 */
export const wacheKey = (name: string) =>
  baseName(name)
    .replace(/\s*\(.*\)$/, '')
    .replace(/^.*\bof\s+/, '')
    .replace(/^((rdh\.|drk|juh|asb|mhd)\s+)?(freiwill?ige feuerwehr|feuerwehrhaus|feuerwache|feuerwehr|ortswehr|ff|pf|lehrrettungswache|rettungswache|rw)\s+/, '')
    .replace(/[\s-]+/g, ' ')
    .trim();

/** Woher die Position einer Wache stammt */
export type PositionSource = 'osm' | 'adresse' | 'tabelle' | 'ortsmitte' | 'gemeinde';

export interface StationPlacement {
  wache: string;
  stationId: string;
  source: PositionSource;
  osmName?: string;
}

/** Zuordnung der Wachen zu Positionen beim letzten Aufbau (für Tests und Auswertung) */
export let lastPlacements: StationPlacement[] = [];

export function createOstholsteinCenter(elements: OverpassElement[]): CenterConfig {
  const orgs = defaultOrganizations().filter((o) => o.id !== 'org_bf');
  const RG: Record<string, [string, string]> = {
    org_ff: ['Feuerwehren Ostholstein', 'FW_OH'],
    org_rd: ['Rettungsdienst Ostholstein', 'RD_OH'],
    org_ktp: ['Krankentransport Ostholstein', 'KTP_OH'],
    org_na: ['Notarztdienst Ostholstein', 'NA_OH'],
    org_pol: ['Polizei Ostholstein', 'POL_OH'],
    org_thw: ['THW Ostholstein', 'THW_OH'],
    org_kats: ['Katastrophenschutz Ostholstein', 'KATS_OH'],
    org_ext: ['Luftrettung', 'LR_SH'],
  };
  for (const o of orgs) o.radioGroup = { name: RG[o.id]?.[0] ?? o.name, code: RG[o.id]?.[1] ?? 'GRP' };

  const places = buildPlaceIndex(elements, { areas: [OSTHOLSTEIN], maxPerKind: { w: 20000, g: 5000, o: 3000, k: 1200, s: 6000, b: 1500, l: 3000, x: 2500 } });
  const facilities = extractFacilities(elements).filter((f) => pointInArea(f.position, OSTHOLSTEIN));
  const c = buildCenter({ catalogId: 'sh', name: 'IRLS Süd – Kreis Ostholstein (Beispiel)', operator: 'Beispiel (nicht offiziell)', counties: [OSTHOLSTEIN], organizations: orgs, places, facilities });
  c.stations = c.stations.filter((s) => !NOT_A_UNIT.some((r) => r.test(s.name)));
  c.description =
    'Beispielleitstelle auf dem echten Kreis Ostholstein: echte Kreisgrenze, echte Adressen und Standorte aus OpenStreetMap. Fahrzeuge und Wachen nach öffentlichen Quellen (bos-fahrzeuge.info, Websites der Wehren, brianpeschke.de, Rettungsdienst Holstein; Stand der vollständigen Liste Oktober 2026). Polizei wird telefonisch angefordert.';
  c.state = 'Schleswig-Holstein';
  c.sharing.tags = ['beispiel', 'ostholstein'];
  c.vehicleTypes = ostholsteinVehicleTypes();

  // ---------------------------------------------------------------- Wachen aus den Listen auf Standorte legen
  const roster = buildRoster();
  const inCounty = (p: LatLng) => pointInArea(p, OSTHOLSTEIN);
  const claimed = new Set<string>();
  const placements: StationPlacement[] = [];
  const stationOf = new Map<string, Station>();
  const vehicleCount = new Map<string, number>();
  for (const v of roster.vehicles) vehicleCount.set(v.wache, (vehicleCount.get(v.wache) ?? 0) + 1);

  // OSM-Eintrag derselben Wache übernehmen (statt doppelt anzulegen): genannter OSM-Name im Umkreis von 3 km,
  // sonst ein Eintrag gleicher Art direkt an der Position aus der Liste
  const findOsm = (def: WacheDef): Station | undefined => {
    const kinds = OSM_KINDS[def.kind];
    if (!kinds) return undefined;
    const free = c.stations.filter((s) => kinds.includes(s.kind) && !claimed.has(s.id));
    const near = (list: Station[], maxM: number) =>
      list
        .map((s) => ({ s, d: distanceMeters(s.position, def.pos) }))
        .filter((x) => x.d <= maxM)
        .sort((a, b) => a.d - b.d)[0]?.s;
    if (def.osm) {
      const names = def.osm.map((n) => n.toLowerCase());
      const named = near(
        free.filter((s) => names.includes(baseName(s.name))),
        3000,
      );
      if (named) return named;
    }
    return near(free, 150);
  };

  // Position aus der Wachenliste; ist dort nur die Ortsmitte bekannt, gilt ein passender OSM-Eintrag
  const place = (rs: RosterStation): { position: LatLng; source: PositionSource; osm?: Station } => {
    const def = rs.def;
    const osm = findOsm(def);
    if (def.posKind === 'ort' && osm) return { position: osm.position, source: 'osm', osm };
    if (inCounty(def.pos)) return { position: def.pos, source: def.posKind === 'ort' ? 'ortsmitte' : def.posKind === 'osm' ? 'osm' : 'adresse', osm };
    const gem = gemeindeOf(def.pos);
    return { position: gem ? gemeindeCenter(gem) : c.mapCenter, source: 'gemeinde', osm };
  };

  // Rettungshubschrauber (extern, Luftrettungszentrum Siblin)
  const luft = roster.stations.find((s) => s.def.kind === 'luft')!;
  const rthStation: Station = { id: 'st_rth', name: luft.def.name, kind: 'sonstige', organizationId: 'org_ext', position: luft.def.pos, address: luft.address, capacity: 1, turnoutSeconds: 120 };
  c.neighbors.push({ id: 'nb_luft', name: 'Luftrettung Schleswig-Holstein', position: rthStation.position, note: 'Rettungshubschrauber Christoph 12 zur Unterstützung (Anforderung mit Verzug).' });
  stationOf.set(luft.def.name, rthStation);
  placements.push({ wache: luft.def.name, stationId: rthStation.id, source: 'osm' });

  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/ä/g, 'ae')
      .replace(/ö/g, 'oe')
      .replace(/ü/g, 'ue')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
  const added: Station[] = [];
  for (const rs of roster.stations) {
    const def = rs.def;
    if (def.kind === 'luft') continue;
    const k = KIND[def.kind];
    const { position, source, osm } = place(rs);
    // Reserve für den Editor: zwei Stellplätze mehr als Fahrzeuge, Feuerwehr und Rettungswache mindestens vier
    const n = vehicleCount.get(def.name) ?? 0;
    const capacity = def.kind === 'ff' || def.kind === 'rw' ? Math.max(4, n + 2) : n + 2;
    let st: Station;
    if (osm) {
      claimed.add(osm.id);
      st = osm;
      Object.assign(st, { name: def.name, kind: k.kind, organizationId: k.org, position, address: rs.address || osm.address, capacity, turnoutSeconds: k.turnout });
    } else {
      st = { id: `st_oh_${slug(def.name)}`, name: def.name, kind: k.kind, organizationId: k.org, position, address: rs.address, capacity, turnoutSeconds: k.turnout };
      added.push(st);
    }
    stationOf.set(def.name, st);
    placements.push({ wache: def.name, stationId: st.id, source, osmName: osm ? def.osm?.[0] ?? 'unbenannt' : undefined });
  }
  // Doppelte OSM-Einträge derselben Wache (z. B. "Neudorf" und "Eutin-Neudorf", FTZ und Kreisfeuerwehrverband) entfernen
  const claimedStations = c.stations.filter((s) => claimed.has(s.id));
  c.stations = c.stations.filter(
    (s) =>
      claimed.has(s.id) ||
      s.kind === 'polizei' ||
      !claimedStations.some((m) => (m.kind === 'rettungswache') === (s.kind === 'rettungswache') && distanceMeters(m.position, s.position) < 120),
  );
  // Weitere OSM-Einträge gleicher Art und gleichen Namens wie eine Wache aus den Daten (bzw. deren OSM-Treffer)
  // im Umkreis von 5 km sind dieselbe Wache (z. B. zweimal "Rettungswache Malente", einmal ohne Adresse).
  // Nur in OSM benannte Einträge – unbenannte heißen nur nach dem Ort ("Feuerwehr Süsel (2)").
  const osmNames = new Set(elements.filter((e) => e.tags?.name && (e.tags.amenity === 'fire_station' || e.tags.emergency === 'ambulance_station')).map((e) => baseName(e.tags!.name)));
  const placedDefs = roster.stations.flatMap((rs) => {
    const st = stationOf.get(rs.def.name);
    const kinds = OSM_KINDS[rs.def.kind];
    return st && kinds ? [{ st, kinds, keys: new Set([rs.def.name, ...(rs.def.osm ?? [])].map(wacheKey).filter(Boolean)) }] : [];
  });
  const sameWache = (s: Station) =>
    osmNames.has(baseName(s.name)) && placedDefs.some((p) => p.kinds.includes(s.kind) && p.keys.has(wacheKey(s.name)) && distanceMeters(p.st.position, s.position) <= 5000);
  c.stations = c.stations.filter((s) => claimed.has(s.id) || !sameWache(s));
  c.stations.push(...added, rthStation);
  for (const a of c.areas) a.responsibleStationIds = c.stations.filter((s) => s.organizationId !== 'org_ext' && pointInArea(s.position, a)).map((s) => s.id);
  lastPlacements = placements;

  // ---------------------------------------------------------------- Fahrzeuge
  const vehicles: Vehicle[] = [];
  const add = (st: Station, v: Omit<Vehicle, 'id' | 'stationId' | 'equipment' | 'maintenance' | 'rt'>) => {
    vehicles.push({ id: `v_${String(vehicles.length + 1).padStart(3, '0')}`, stationId: st.id, equipment: [], maintenance: [], ...v, rt: emptyVehicleRuntime(st.position) });
  };
  for (const rv of roster.vehicles) {
    const st = stationOf.get(rv.wache)!;
    add(st, {
      callsign: rv.callsign,
      typeId: rv.typeId,
      organizationId: rv.organizationId,
      identifier: rv.identifier,
      serviceWindows: rv.serviceWindows,
      ...(rv.outOfService ? { outOfService: true } : {}),
      ...(rv.typeId === 'rth' ? { external: { neighborId: 'nb_luft', requestDelaySeconds: 120 } } : {}),
    });
  }

  // Polizei (nicht in den Listen, Anforderung per Telefon): Streifenwagen je Polizeistation, Führung und Einsatzgruppe
  const police = c.stations.filter((s) => s.kind === 'polizei');
  police.forEach((st, i) => add(st, { callsign: `Heros Ostholstein ${i + 1}/11 (${shortPlace(st.name)})`, typeId: 'fustw', organizationId: st.organizationId, identifier: '', serviceWindows: [] }));
  const firstPol = police[0];
  if (firstPol) {
    // Polizeiführung und Einsatzgruppe für Großlagen (AMOK, Geisellage, Lebensbedrohliche Einsatzlage)
    add(firstPol, { callsign: 'Heros Ostholstein 1/1 (Führung)', typeId: 'pol_fueh', organizationId: firstPol.organizationId, identifier: '', serviceWindows: [] });
    add(firstPol, { callsign: 'Heros Ostholstein 1/40 (Einsatzgruppe)', typeId: 'pol_grukw', organizationId: firstPol.organizationId, identifier: '', serviceWindows: [] });
  }
  for (const st of police) st.capacity = vehicles.filter((v) => v.stationId === st.id).length + 2;

  c.vehicles = vehicles;
  c.pois = extractPois(elements, undefined, (p) => pointInArea(p, OSTHOLSTEIN));
  c.settings.seed = 20261019;
  return c;
}
