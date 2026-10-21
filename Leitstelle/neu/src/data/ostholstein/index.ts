import type { CenterConfig, ServiceWindow, Station, Vehicle } from '../../model/types';
import type { County } from '../../geo/osm';
import { extractFacilities } from '../../geo/osm';
import { buildPlaceIndex, type OverpassElement } from '../../geo/places';
import { extractPois } from '../../geo/pois';
import { buildCenter, defaultOrganizations } from '../centerFactory';
import { emptyVehicleRuntime } from '../sampleCenter';
import { distanceMeters, pointInArea } from '../../sim/geo';
import boundary from './boundary.json';
import gemeindenData from './gemeinden.json';

/**
 * Beispielleitstelle "Kreis Ostholstein" auf Basis echter OpenStreetMap-Daten.
 *  - Kreisgrenze: mitgeliefert (OSM-Relation 27025, über Nominatim abgerufen)
 *  - Adressen, Feuerwehren, Rettungswachen, Polizei, Kliniken: werden beim ersten Start
 *    live über die Overpass-API geladen (kostenlos, Daten © OpenStreetMap-Mitwirkende, ODbL)
 *  - Fahrzeuge: von LEITWARTE nach einfachen Regeln auf die realen Standorte verteilt.
 *    Die Fahrzeugausstattung entspricht NICHT den realen Verhältnissen.
 *  - Funkrufnamen Feuerwehr und Rettungsdienst nach dem Schema "Florian Ostholstein 61-48-01"
 *    (Ortskennziffer – Fahrzeugkenner – laufende Nummer). Die Ortskennziffer hängt an der Gemeinde,
 *    in der die Wache liegt (Gemeindegrenzen aus OpenStreetMap, vereinfacht, in gemeinden.json).
 */

export const OSTHOLSTEIN: County = boundary as County;

/** Größere Orte bekommen eine stärkere Feuerwehr-Ausstattung */
const LARGE_TOWNS = ['Eutin', 'Neustadt', 'Bad Schwartau', 'Oldenburg', 'Heiligenhafen', 'Fehmarn', 'Burg', 'Timmendorfer Strand', 'Scharbeutz', 'Ratekau', 'Stockelsdorf', 'Malente', 'Lensahn'];
const COAST = ['Neustadt', 'Heiligenhafen', 'Fehmarn', 'Burg', 'Grömitz', 'Timmendorfer', 'Scharbeutz', 'Dahme', 'Kellenhusen'];
const NEF_TOWNS = ['Eutin', 'Neustadt', 'Oldenburg', 'Bad Schwartau', 'Fehmarn', 'Burg'];

const shortPlace = (name: string) =>
  name
    .replace(/^(Freiwillige Feuerwehr|Feuerwehr|FF|Feuerwache|Feuerwehrhaus|Rettungswache|RW|DRK[- ]Rettungswache|Polizeistation|Polizeirevier|Polizei)\s*/i, '')
    .replace(/\s*\(.*\)$/, '')
    .trim() || name;

interface Gemeinde {
  name: string;
  /** Ortskennziffer im Funkrufnamen */
  okz: string;
  polygons: [number, number][][][];
}
const GEMEINDEN = gemeindenData as Gemeinde[];

/** Fahrzeugkenner (zweiter Teil des Funkrufnamens) je Fahrzeugtyp */
const KENNER: Record<string, string> = {
  kdow: '10',
  elw1: '11',
  elw2: '12',
  mtf: '19',
  tlf: '23',
  dlk: '30',
  lf20: '44',
  hlf10: '48',
  rw: '52',
  gwl: '56',
  gwg: '58',
  gwa: '59',
  gwh: '64',
  gww: '69',
  fr: '79',
  elrd: '01',
  nef: '82',
  rtw: '83',
  srtw: '83',
  itw: '84',
  ktw: '85',
  sktw: '85',
  iktw: '88',
  psnv: '90',
};

/**
 * Mehrere Gemeinden mit derselben Ortskennziffer (Amt): Diese Gemeinde bekommt die 01.
 * Annahme nach Amtssitz; ohne Eintrag gilt die alphabetisch erste Gemeinde.
 */
const LEAD_GEMEINDE: Record<string, string> = { '47': 'Lensahn', '50': 'Grube' };

/** Wachen, die es als eigene Wehr nicht gibt (in OpenStreetMap trotzdem eingetragen) */
const NOT_A_UNIT = [/Altratjensdorf/];

/** Gemeinde einer Wache; liegt sie knapp außerhalb aller (vereinfachten) Grenzen, die nächstgelegene */
export function gemeindeOf(p: [number, number]): Gemeinde | undefined {
  const hit = GEMEINDEN.find((g) => pointInArea(p, g));
  if (hit) return hit;
  let best: Gemeinde | undefined;
  let bestD = 3000;
  for (const g of GEMEINDEN)
    for (const rings of g.polygons)
      for (const q of rings[0] ?? []) {
        const d = distanceMeters(p, q);
        if (d < bestD) [best, bestD] = [g, d];
      }
  return best;
}

/** Ortskennziffer einer Wache */
export function okzOf(st: Pick<Station, 'name' | 'position'>): string {
  if (/Kreisfeuerwehrverband|Feuerwehrtechnische Zentrale|\bFTZ\b/i.test(st.name)) return '01';
  const g = gemeindeOf(st.position);
  // Fehmarn: alle Wehren 30, nur Burg auf Fehmarn 33
  if (g?.name === 'Fehmarn' && /\bBurg\b/.test(st.name)) return '33';
  return g?.okz ?? '00';
}

const DAY: ServiceWindow[] = [{ fromHour: 7, toHour: 19, weekdays: [] }];
const KTP_TIME: ServiceWindow[] = [{ fromHour: 7, toHour: 19, weekdays: [1, 2, 3, 4, 5] }];

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
  const dropped = new Set(c.stations.filter((s) => NOT_A_UNIT.some((r) => r.test(s.name))).map((s) => s.id));
  if (dropped.size) {
    c.stations = c.stations.filter((s) => !dropped.has(s.id));
    for (const a of c.areas) a.responsibleStationIds = a.responsibleStationIds.filter((id) => !dropped.has(id));
  }
  c.description =
    'Beispielleitstelle auf dem echten Kreis Ostholstein: echte Kreisgrenze, echte Adressen und reale Standorte aus OpenStreetMap. Die Fahrzeuge sind von LEITWARTE verteilt und entsprechen nicht der realen Ausstattung.';
  c.state = 'Schleswig-Holstein';
  c.sharing.tags = ['beispiel', 'ostholstein'];

  // Externer Rettungshubschrauber (Standort Siblin bei Eutin)
  const rthStation: Station = { id: 'st_rth', name: 'Luftrettungsstation Siblin', kind: 'sonstige', organizationId: 'org_ext', position: [54.1425, 10.6197], address: 'Siblin, 23701 Eutin', capacity: 1, turnoutSeconds: 120 };
  c.stations.push(rthStation);
  c.neighbors.push({ id: 'nb_luft', name: 'Luftrettung Schleswig-Holstein', position: rthStation.position, note: 'Rettungshubschrauber zur Unterstützung (Anforderung mit Verzug).' });

  const vehicles: Vehicle[] = [];
  let n = 0;
  const add = (st: Station, typeId: string, callsign: string, windows: ServiceWindow[] = [], external?: Vehicle['external']) => {
    n++;
    vehicles.push({
      id: `v_${String(n).padStart(3, '0')}`,
      callsign,
      typeId,
      organizationId: st.organizationId,
      stationId: st.id,
      identifier: `OH-${typeId.toUpperCase()} ${100 + n}`,
      equipment: [],
      serviceWindows: windows,
      maintenance: [],
      external,
      rt: emptyVehicleRuntime(st.position),
    });
  };

  // Funkrufname: "<Präfix> Ostholstein OKZ-Kenner-NN", NN läuft je Ortskennziffer und Kenner hoch.
  // Die Wehr des Hauptortes einer Gemeinde wird zuerst nummeriert (bekommt also die 01).
  const okz = new Map(c.stations.map((s) => [s.id, okzOf(s)]));
  const used = new Map<string, number>();
  const callsign = (prefix: string, st: Station, typeId: string) => {
    const key = `${prefix}|${okz.get(st.id)}-${KENNER[typeId] ?? '00'}`;
    const nr = (used.get(key) ?? 0) + 1;
    used.set(key, nr);
    return `${prefix} Ostholstein ${okz.get(st.id)}-${KENNER[typeId] ?? '00'}-${String(nr).padStart(2, '0')}`;
  };
  // Rang: 0 = Hauptort der führenden Gemeinde einer gemeinsamen OKZ, 1 = Hauptort einer Gemeinde,
  // 2 = Ortsteil mit Bindestrich ("Eutin-Neudorf"), 3 = alle anderen Wachen
  const rank = (st: Station) => {
    const gem = gemeindeOf(st.position);
    if (!gem) return 3;
    const g = gem.name.replace(/ (in|am) .*$/, '');
    const place = shortPlace(st.name).replace(/^(Stadt|Gemeinde)\s+/, '');
    const esc = g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (new RegExp(`^${esc}(?![\\p{L}-])`, 'u').test(place)) return LEAD_GEMEINDE[gem.okz] === gem.name ? 0 : 1;
    if (new RegExp(`^${esc}-`, 'u').test(place)) return 2;
    return 3;
  };
  const numbered = c.stations
    .map((st, i) => ({ st, i, r: rank(st), g: gemeindeOf(st.position)?.name ?? '' }))
    .sort((a, b) => a.r - b.r || a.g.localeCompare(b.g, 'de') || a.i - b.i)
    .map((x) => x.st);
  const order = new Map(numbered.map((s, i) => [s.id, i]));
  const ff = (st: Station, typeId: string) => add(st, typeId, callsign('Florian', st, typeId));
  const rd = (st: Station, typeId: string, windows: ServiceWindow[] = []) => add(st, typeId, callsign('Rettung', st, typeId), windows);

  let ffNr = 0;
  let rwNr = 0;
  let polNr = 0;
  const pending: [number, () => void][] = [];
  for (const st of c.stations) {
    const place = shortPlace(st.name);
    const large = LARGE_TOWNS.some((t) => st.name.includes(t));
    if (st.kind === 'feuerwehrhaus' || st.kind === 'feuerwache') {
      ffNr++;
      const rural = ffNr % 6 === 0;
      pending.push([
        order.get(st.id)!,
        () => {
          ff(st, 'hlf10');
          ff(st, 'mtf');
          if (large) {
            ff(st, 'elw1');
            ff(st, 'lf20');
            ff(st, 'dlk');
            ff(st, 'tlf');
            ff(st, 'rw');
            if (COAST.some((t) => st.name.includes(t))) ff(st, 'gww');
            if (st.name.includes('Eutin') || st.name.includes('Neustadt')) {
              ff(st, 'gwg');
              ff(st, 'gwa');
              ff(st, 'gwl');
            }
            if (st.name.includes('Eutin')) {
              ff(st, 'elw2');
              ff(st, 'gwh');
            }
          } else if (rural) {
            // Helfer vor Ort in ländlichen Wehren
            ff(st, 'fr');
          }
        },
      ]);
      st.capacity = large ? 14 : 4;
    } else if (st.kind === 'rettungswache') {
      rwNr++;
      const withKtw = rwNr <= 3;
      pending.push([
        order.get(st.id)!,
        () => {
          rd(st, 'rtw');
          rd(st, 'rtw', DAY);
          if (NEF_TOWNS.some((t) => st.name.includes(t))) rd(st, 'nef');
          if (withKtw) rd(st, 'ktw', KTP_TIME);
        },
      ]);
      st.capacity = 6;
    } else if (st.kind === 'polizei') {
      polNr++;
      add(st, 'fustw', `Heros Ostholstein ${polNr}/11 (${place})`);
    }
  }
  for (const [, run] of pending.sort((a, b) => a[0] - b[0])) run();
  // Eine Rettungswache mit Führungsdienst und Sonderfahrzeugen
  const firstRw = c.stations.find((s) => s.kind === 'rettungswache');
  if (firstRw) {
    rd(firstRw, 'elrd');
    rd(firstRw, 'itw', DAY);
    rd(firstRw, 'iktw', KTP_TIME);
    rd(firstRw, 'srtw');
    rd(firstRw, 'sktw', KTP_TIME);
    rd(firstRw, 'psnv');
    firstRw.capacity += 6;
  }
  // Polizeiführung und Einsatzgruppe für Großlagen (AMOK, Geisellage, Lebensbedrohliche Einsatzlage)
  const firstPol = c.stations.find((s) => s.kind === 'polizei');
  if (firstPol) {
    add(firstPol, 'pol_fueh', 'Heros Ostholstein 1/1 (Führung)');
    add(firstPol, 'pol_grukw', 'Heros Ostholstein 1/40 (Einsatzgruppe)');
    firstPol.capacity += 2;
  }
  // Einheiten des Katastrophenschutzes und des THW (Standort: Kreisfeuerwehrzentrale, angenommen in Eutin)
  const ktzPos: [number, number] = [54.1263, 10.6253];
  const kats: Station = { id: 'st_kats', name: 'Katastrophenschutzzentrum (Beispiel)', kind: 'kats', organizationId: 'org_kats', position: ktzPos, address: 'Eutin', capacity: 6, turnoutSeconds: 600 };
  const thw: Station = { id: 'st_thw', name: 'THW-Ortsverband (Beispiel)', kind: 'thw', organizationId: 'org_thw', position: [ktzPos[0] + 0.004, ktzPos[1] + 0.006], address: 'Eutin', capacity: 6, turnoutSeconds: 900 };
  c.stations.push(kats, thw);
  add(kats, 'gwsan', 'Rotkreuz Ostholstein 90/91-1');
  add(kats, 'gwsan', 'Rotkreuz Ostholstein 90/91-2');
  add(kats, 'orgl', 'Rotkreuz Ostholstein 90/02-1');
  add(thw, 'thw_gkw', 'Heros Ostholstein 23/52');
  add(thw, 'thw_mzkw', 'Heros Ostholstein 23/53');
  add(thw, 'thw_ntw', 'Heros Ostholstein 23/55');
  add(thw, 'thw_mtw', 'Heros Ostholstein 23/10');
  for (const a of c.areas) a.responsibleStationIds.push(kats.id, thw.id);
  add(rthStation, 'rth', 'Christoph 12', [{ fromHour: 7, toHour: 20, weekdays: [] }], { neighborId: 'nb_luft', requestDelaySeconds: 120 });
  c.vehicles = vehicles;
  c.pois = extractPois(elements, undefined, (p) => pointInArea(p, OSTHOLSTEIN));
  c.settings.seed = 20261019;
  return c;
}
