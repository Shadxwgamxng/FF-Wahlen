import type { CenterConfig, ServiceWindow, Station, Vehicle } from '../../model/types';
import type { County } from '../../geo/osm';
import { extractFacilities } from '../../geo/osm';
import { buildPlaceIndex, type OverpassElement } from '../../geo/places';
import { buildCenter, defaultOrganizations } from '../centerFactory';
import { emptyVehicleRuntime } from '../sampleCenter';
import { pointInArea } from '../../sim/geo';
import boundary from './boundary.json';

/**
 * Beispielleitstelle "Kreis Ostholstein" auf Basis echter OpenStreetMap-Daten.
 *  - Kreisgrenze: mitgeliefert (OSM-Relation 27025, über Nominatim abgerufen)
 *  - Adressen, Feuerwehren, Rettungswachen, Polizei, Kliniken: werden beim ersten Start
 *    live über die Overpass-API geladen (kostenlos, Daten © OpenStreetMap-Mitwirkende, ODbL)
 *  - Fahrzeuge: von LEITWARTE nach einfachen Regeln auf die realen Standorte verteilt.
 *    Fahrzeugausstattung und Funkrufnamen sind NICHT die realen Verhältnisse.
 */

export const OSTHOLSTEIN: County = boundary as County;

/** Größere Orte bekommen eine stärkere Feuerwehr-Ausstattung */
const LARGE_TOWNS = ['Eutin', 'Neustadt', 'Bad Schwartau', 'Oldenburg', 'Heiligenhafen', 'Fehmarn', 'Burg', 'Timmendorfer Strand', 'Scharbeutz', 'Ratekau', 'Stockelsdorf', 'Malente', 'Lensahn'];
const NEF_TOWNS = ['Eutin', 'Neustadt', 'Oldenburg', 'Bad Schwartau', 'Fehmarn', 'Burg'];

const shortPlace = (name: string) =>
  name
    .replace(/^(Freiwillige Feuerwehr|Feuerwehr|FF|Feuerwache|Feuerwehrhaus|Rettungswache|RW|DRK[- ]Rettungswache|Polizeistation|Polizeirevier|Polizei)\s*/i, '')
    .replace(/\s*\(.*\)$/, '')
    .trim() || name;

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
  const c = buildCenter({ name: 'IRLS Süd – Kreis Ostholstein (Beispiel)', operator: 'Beispiel (nicht offiziell)', counties: [OSTHOLSTEIN], organizations: orgs, places, facilities });
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

  let ffNr = 0;
  let rwNr = 0;
  let polNr = 0;
  for (const st of c.stations) {
    const place = shortPlace(st.name);
    const large = LARGE_TOWNS.some((t) => st.name.includes(t));
    if (st.kind === 'feuerwehrhaus' || st.kind === 'feuerwache') {
      ffNr++;
      const nr = String(ffNr).padStart(2, '0');
      add(st, 'hlf10', `Florian Ostholstein ${nr}/40-1`);
      add(st, 'mtf', `Florian Ostholstein ${nr}/19-1`);
      if (large) {
        add(st, 'elw1', `Florian Ostholstein ${nr}/11-1`);
        add(st, 'lf20', `Florian Ostholstein ${nr}/44-1`);
        add(st, 'dlk', `Florian Ostholstein ${nr}/33-1`);
        add(st, 'tlf', `Florian Ostholstein ${nr}/23-1`);
      }
      st.capacity = large ? 8 : 4;
    } else if (st.kind === 'rettungswache') {
      rwNr++;
      const nr = String(rwNr).padStart(2, '0');
      add(st, 'rtw', `Rettung Ostholstein ${nr}/83-1`);
      add(st, 'rtw', `Rettung Ostholstein ${nr}/83-2`, DAY);
      if (NEF_TOWNS.some((t) => st.name.includes(t))) add(st, 'nef', `Rettung Ostholstein ${nr}/82-1`);
      if (rwNr <= 3) add(st, 'ktw', `Rettung Ostholstein ${nr}/85-1`, KTP_TIME);
      st.capacity = 6;
    } else if (st.kind === 'polizei') {
      polNr++;
      add(st, 'fustw', `Heros Ostholstein ${polNr}/11 (${place})`);
    }
  }
  // Eine Rettungswache mit Führungsdienst und Sonderfahrzeugen
  const firstRw = c.stations.find((s) => s.kind === 'rettungswache');
  if (firstRw) {
    add(firstRw, 'elrd', 'Rettung Ostholstein 01/01-1');
    add(firstRw, 'itw', 'Rettung Ostholstein 01/84-1', DAY);
    firstRw.capacity += 2;
  }
  add(rthStation, 'rth', 'Christoph 12', [{ fromHour: 7, toHour: 20, weekdays: [] }], { neighborId: 'nb_luft', requestDelaySeconds: 120 });
  c.vehicles = vehicles;
  c.settings.seed = 20261019;
  return c;
}
