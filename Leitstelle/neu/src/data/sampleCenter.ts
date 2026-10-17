import type {
  AaoRule,
  Area,
  CenterConfig,
  Hospital,
  LatLng,
  NeighborCenter,
  ServiceWindow,
  Station,
  Vehicle,
} from '../model/types';
import { DEFAULT_KEYWORDS, KEYWORD_SEEDS, keywordIdFromCode } from './keywords';
import { DEFAULT_ORGANIZATIONS, DEFAULT_STATUS_DEFS, DEFAULT_VEHICLE_TYPES } from './vehicleTypes';

/**
 * Vollständig vorkonfigurierte Beispielleitstelle "ILS Hessenwald" (fiktiv).
 * Die Gemeinden, Wachen, Adressen und Personen sind frei erfunden. Als Kartenhintergrund
 * dient ein realer Ausschnitt (OpenStreetMap); Straßen auf der Karte und fiktive Adressen
 * stimmen daher nicht überein.
 */

export const STREET_NAMES = [
  'Hauptstraße', 'Bahnhofstraße', 'Schulstraße', 'Gartenstraße', 'Kirchweg', 'Lindenallee', 'Ringstraße', 'Bergstraße',
  'Am Markt', 'Mühlenweg', 'Waldstraße', 'Feldweg', 'Industriestraße', 'Goethestraße', 'Schillerplatz', 'Rosenweg',
  'Am Sportplatz', 'Brunnenstraße', 'Talstraße', 'Eichendorffweg', 'Am Klinikum', 'Gewerbering', 'Birkenweg', 'Wiesenstraße',
  'Am Bach', 'Burgstraße', 'Friedhofsweg', 'Zum Steinbruch', 'Kastanienallee', 'Uferstraße',
];

const rect = (s: number, w: number, n: number, e: number): LatLng[] => [
  [s, w],
  [n, w],
  [n, e],
  [s, e],
];

const AREAS: Area[] = [
  { id: 'area_bergstadt', name: 'Bergstadt', kind: 'gemeinde', polygons: [[rect(50.52, 9.62, 50.59, 9.73)]], responsibleStationIds: ['st_fw1', 'st_fw2', 'st_rw_berg', 'st_pol_berg'] },
  { id: 'area_talheim', name: 'Talheim', kind: 'gemeinde', polygons: [[rect(50.59, 9.5, 50.68, 9.86)]], responsibleStationIds: ['st_ff_tal', 'st_rw_tal'] },
  { id: 'area_lindenfeld', name: 'Lindenfeld', kind: 'gemeinde', polygons: [[rect(50.44, 9.5, 50.52, 9.86)]], responsibleStationIds: ['st_ff_lin', 'st_rw_lin', 'st_pol_lin'] },
  { id: 'area_wiesbach', name: 'Wiesbach', kind: 'gemeinde', polygons: [[rect(50.52, 9.5, 50.59, 9.62)]], responsibleStationIds: ['st_ff_wie', 'st_rw_wie'] },
  { id: 'area_eichenau', name: 'Eichenau', kind: 'gemeinde', polygons: [[rect(50.52, 9.73, 50.59, 9.86)]], responsibleStationIds: ['st_ff_eich', 'st_rw_eich', 'st_wf'] },
];

const st = (
  id: string,
  name: string,
  kind: Station['kind'],
  organizationId: string,
  position: LatLng,
  address: string,
  capacity: number,
  turnoutSeconds: number,
): Station => ({ id, name, kind, organizationId, position, address, capacity, turnoutSeconds });

const STATIONS: Station[] = [
  st('st_fw1', 'Feuerwache 1 Bergstadt', 'feuerwache', 'org_bf', [50.556, 9.672], 'Feuerwehrstraße 1, Bergstadt', 14, 60),
  st('st_fw2', 'Feuerwache 2 Bergstadt-Süd', 'feuerwache', 'org_bf', [50.534, 9.69], 'Südring 40, Bergstadt', 8, 60),
  st('st_ff_tal', 'FF Talheim', 'feuerwehrhaus', 'org_ff', [50.634, 9.662], 'Am Feuerwehrhaus 2, Talheim', 4, 300),
  st('st_ff_eich', 'FF Eichenau', 'feuerwehrhaus', 'org_ff', [50.561, 9.8], 'Brunnenstraße 5, Eichenau', 4, 300),
  st('st_ff_lin', 'FF Lindenfeld', 'feuerwehrhaus', 'org_ff', [50.481, 9.71], 'Kirchweg 12, Lindenfeld', 5, 300),
  st('st_ff_wie', 'FF Wiesbach', 'feuerwehrhaus', 'org_ff', [50.566, 9.553], 'Talstraße 3, Wiesbach', 3, 330),
  st('st_wf', 'Werkfeuerwehr Chemiepark', 'werkfeuerwehr', 'org_wf', [50.584, 9.742], 'Industriestraße 100, Eichenau', 3, 60),
  st('st_rw_berg', 'Rettungswache Bergstadt', 'rettungswache', 'org_rd', [50.549, 9.678], 'Am Klinikum 3, Bergstadt', 10, 60),
  st('st_rw_tal', 'Rettungswache Talheim', 'rettungswache', 'org_rd', [50.628, 9.672], 'Hauptstraße 80, Talheim', 2, 60),
  st('st_rw_lin', 'Rettungswache Lindenfeld', 'rettungswache', 'org_rd', [50.487, 9.702], 'Bahnhofstraße 9, Lindenfeld', 3, 60),
  st('st_rw_eich', 'Rettungswache Eichenau', 'rettungswache', 'org_rd', [50.566, 9.79], 'Ringstraße 22, Eichenau', 2, 60),
  st('st_rw_wie', 'Rettungswache Wiesbach', 'rettungswache', 'org_rd', [50.56, 9.56], 'Lindenallee 4, Wiesbach', 2, 60),
  st('st_pol_berg', 'Polizeirevier Bergstadt', 'polizei', 'org_pol', [50.552, 9.684], 'Schillerplatz 1, Bergstadt', 6, 60),
  st('st_pol_lin', 'Polizeiposten Lindenfeld', 'polizei', 'org_pol', [50.484, 9.715], 'Am Markt 2, Lindenfeld', 2, 90),
  st('st_thw', 'THW Ortsverband Bergstadt', 'thw', 'org_thw', [50.572, 9.705], 'Gewerbering 12, Bergstadt', 3, 900),
  st('st_kats', 'Katastrophenschutzzentrum', 'kats', 'org_kats', [50.543, 9.655], 'Mühlenweg 30, Bergstadt', 2, 900),
  st('st_ext_rth', 'Luftrettungsstation Nachbarkreis', 'sonstige', 'org_ext', [50.705, 9.945], 'Flugplatz Nord (extern)', 1, 120),
];

const MOFR_7_19: ServiceWindow[] = [{ fromHour: 7, toHour: 19, weekdays: [1, 2, 3, 4, 5] }];
const DAY_8_20: ServiceWindow[] = [{ fromHour: 8, toHour: 20, weekdays: [] }];
const RTH_DAY: ServiceWindow[] = [{ fromHour: 7, toHour: 20, weekdays: [] }];

interface VSeed {
  callsign: string;
  type: string;
  station: string;
  windows?: ServiceWindow[];
  external?: Vehicle['external'];
}

const V: VSeed[] = [
  // BF Wache 1
  { callsign: 'Florian Bergstadt 1/10-1', type: 'kdow', station: 'st_fw1' },
  { callsign: 'Florian Bergstadt 1/11-1', type: 'elw1', station: 'st_fw1' },
  { callsign: 'Florian Bergstadt 1/12-1', type: 'elw2', station: 'st_fw1' },
  { callsign: 'Florian Bergstadt 1/46-1', type: 'hlf20', station: 'st_fw1' },
  { callsign: 'Florian Bergstadt 1/46-2', type: 'hlf20', station: 'st_fw1' },
  { callsign: 'Florian Bergstadt 1/23-1', type: 'tlf', station: 'st_fw1' },
  { callsign: 'Florian Bergstadt 1/33-1', type: 'dlk', station: 'st_fw1' },
  { callsign: 'Florian Bergstadt 1/52-1', type: 'rw', station: 'st_fw1' },
  { callsign: 'Florian Bergstadt 1/58-1', type: 'gwg', station: 'st_fw1' },
  { callsign: 'Florian Bergstadt 1/59-1', type: 'gwa', station: 'st_fw1' },
  { callsign: 'Florian Bergstadt 1/56-1', type: 'gwl', station: 'st_fw1' },
  // BF Wache 2
  { callsign: 'Florian Bergstadt 2/46-1', type: 'hlf20', station: 'st_fw2' },
  { callsign: 'Florian Bergstadt 2/44-1', type: 'lf20', station: 'st_fw2' },
  { callsign: 'Florian Bergstadt 2/33-1', type: 'dlk', station: 'st_fw2' },
  { callsign: 'Florian Bergstadt 2/69-1', type: 'gww', station: 'st_fw2' },
  // FF
  { callsign: 'Florian Talheim 1/40-1', type: 'hlf10', station: 'st_ff_tal' },
  { callsign: 'Florian Talheim 1/42-1', type: 'lf10', station: 'st_ff_tal' },
  { callsign: 'Florian Talheim 1/19-1', type: 'mtf', station: 'st_ff_tal' },
  { callsign: 'Florian Eichenau 1/40-1', type: 'hlf10', station: 'st_ff_eich' },
  { callsign: 'Florian Eichenau 1/23-1', type: 'tlf', station: 'st_ff_eich' },
  { callsign: 'Florian Eichenau 1/19-1', type: 'mtf', station: 'st_ff_eich' },
  { callsign: 'Florian Lindenfeld 1/11-1', type: 'elw1', station: 'st_ff_lin' },
  { callsign: 'Florian Lindenfeld 1/44-1', type: 'lf20', station: 'st_ff_lin' },
  { callsign: 'Florian Lindenfeld 1/40-1', type: 'hlf10', station: 'st_ff_lin' },
  { callsign: 'Florian Lindenfeld 1/65-1', type: 'gwt', station: 'st_ff_lin' },
  { callsign: 'Florian Wiesbach 1/42-1', type: 'lf10', station: 'st_ff_wie' },
  { callsign: 'Florian Wiesbach 1/19-1', type: 'mtf', station: 'st_ff_wie' },
  { callsign: 'Florian Chemiepark 1/46-1', type: 'hlf20', station: 'st_wf' },
  { callsign: 'Florian Chemiepark 1/58-1', type: 'gwg', station: 'st_wf' },
  // Rettungsdienst
  { callsign: 'Rotkreuz Bergstadt 1/83-1', type: 'rtw', station: 'st_rw_berg' },
  { callsign: 'Rotkreuz Bergstadt 1/83-2', type: 'rtw', station: 'st_rw_berg' },
  { callsign: 'Rotkreuz Bergstadt 1/83-3', type: 'rtw', station: 'st_rw_berg', windows: DAY_8_20 },
  { callsign: 'Rotkreuz Bergstadt 1/82-1', type: 'nef', station: 'st_rw_berg' },
  { callsign: 'Rotkreuz Bergstadt 1/85-1', type: 'ktw', station: 'st_rw_berg', windows: MOFR_7_19 },
  { callsign: 'Rotkreuz Bergstadt 1/85-2', type: 'ktw', station: 'st_rw_berg', windows: MOFR_7_19 },
  { callsign: 'Rotkreuz Bergstadt 1/86-1', type: 'iktw', station: 'st_rw_berg', windows: MOFR_7_19 },
  { callsign: 'Rotkreuz Bergstadt 1/84-1', type: 'itw', station: 'st_rw_berg' },
  { callsign: 'Rotkreuz Bergstadt 1/01-1', type: 'elrd', station: 'st_rw_berg' },
  { callsign: 'Rotkreuz Talheim 1/83-1', type: 'rtw', station: 'st_rw_tal' },
  { callsign: 'Rotkreuz Talheim 1/85-1', type: 'ktw', station: 'st_rw_tal', windows: MOFR_7_19 },
  { callsign: 'Rotkreuz Lindenfeld 1/83-1', type: 'rtw', station: 'st_rw_lin' },
  { callsign: 'Rotkreuz Lindenfeld 1/82-1', type: 'nef', station: 'st_rw_lin' },
  { callsign: 'Rotkreuz Eichenau 1/83-1', type: 'rtw', station: 'st_rw_eich' },
  { callsign: 'Rotkreuz Wiesbach 1/83-1', type: 'rtw', station: 'st_rw_wie' },
  // Polizei
  { callsign: 'Heros Bergstadt 11/1', type: 'fustw', station: 'st_pol_berg' },
  { callsign: 'Heros Bergstadt 11/2', type: 'fustw', station: 'st_pol_berg' },
  { callsign: 'Heros Bergstadt 11/3', type: 'fustw', station: 'st_pol_berg' },
  { callsign: 'Heros Bergstadt 10/1', type: 'pol_fueh', station: 'st_pol_berg' },
  { callsign: 'Heros Bergstadt 12/1', type: 'pol_grukw', station: 'st_pol_berg' },
  { callsign: 'Heros Lindenfeld 21/1', type: 'fustw', station: 'st_pol_lin' },
  // THW / KatS
  { callsign: 'Heros THW Bergstadt 22/52', type: 'thw_gkw', station: 'st_thw' },
  { callsign: 'Heros THW Bergstadt 22/53', type: 'thw_mzkw', station: 'st_thw' },
  { callsign: 'Akkon Bergstadt 1/91-1', type: 'gwsan', station: 'st_kats' },
  { callsign: 'Rotkreuz Bergstadt 1/02-1', type: 'orgl', station: 'st_kats' },
  // Extern
  { callsign: 'Christoph 99', type: 'rth', station: 'st_ext_rth', windows: RTH_DAY, external: { neighborId: 'nb_nord', requestDelaySeconds: 120 } },
];

const HOSPITALS: Hospital[] = [
  { id: 'kh_klinikum', name: 'Klinikum Bergstadt (Maximalversorgung)', position: [50.546, 9.664], departments: ['allgemein', 'innere', 'kardiologie', 'unfallchirurgie', 'neurologie', 'gynaekologie', 'intensiv', 'paediatrie'], capacity: 20, occupied: 0, available: true },
  { id: 'kh_kreis', name: 'Kreisklinik Lindenfeld', position: [50.491, 9.716], departments: ['allgemein', 'innere', 'unfallchirurgie', 'gynaekologie'], capacity: 8, occupied: 0, available: true },
  { id: 'kh_herz', name: 'Herzzentrum Eichenau', position: [50.571, 9.788], departments: ['kardiologie', 'innere', 'intensiv'], capacity: 6, occupied: 0, available: true },
  { id: 'kh_kinder', name: 'Kinderklinik Bergstadt', position: [50.561, 9.689], departments: ['paediatrie'], capacity: 5, occupied: 0, available: true },
  { id: 'kh_psych', name: 'Fachklinik für Psychiatrie Talheim', position: [50.624, 9.648], departments: ['psychiatrie'], capacity: 4, occupied: 0, available: true },
  { id: 'kh_brand', name: 'Schwerbrandverletztenzentrum (Nachbarkreis)', position: [50.7, 9.95], departments: ['verbrennung', 'intensiv', 'unfallchirurgie'], capacity: 3, occupied: 0, available: true },
];

const NEIGHBORS: NeighborCenter[] = [
  { id: 'nb_nord', name: 'Leitstelle Nachbarkreis Nord', position: [50.705, 9.95], note: 'Stellt den Rettungshubschrauber Christoph 99.' },
  { id: 'nb_west', name: 'Leitstelle Westtal', position: [50.56, 9.33], note: 'Überlandhilfe Feuerwehr nach Absprache (in Version 1 nur informativ).' },
];

export const SIM_START = Date.UTC(2026, 9, 19, 7, 30); // Montag, 19.10.2026, 07:30 (Simulationszeit, "UTC-naiv")

export function emptyVehicleRuntime(position: LatLng, now = SIM_START): Vehicle['rt'] {
  return {
    status: 'frei_wache',
    position,
    incidentId: null,
    move: null,
    phaseUntil: null,
    patientId: null,
    targetHospitalId: null,
    breakdownUntil: null,
    statMs: { available: 0, busy: 0, outOfService: 0 },
    alarms: 0,
    lastStatusChange: now,
  };
}

export function createSampleCenter(): CenterConfig {
  const types = DEFAULT_VEHICLE_TYPES.map((t) => ({ ...t }));
  const vehicles: Vehicle[] = V.map((seed, i) => {
    const station = STATIONS.find((s) => s.id === seed.station)!;
    const type = types.find((t) => t.id === seed.type)!;
    return {
      id: `v_${String(i + 1).padStart(3, '0')}`,
      callsign: seed.callsign,
      typeId: type.id,
      organizationId: station.organizationId,
      stationId: station.id,
      identifier: `HW-${type.code.replace(/[^A-Z0-9]/gi, '').toUpperCase()} ${100 + i}`,
      equipment: [],
      serviceWindows: seed.windows ?? [],
      maintenance: [],
      external: seed.external,
      rt: emptyVehicleRuntime(station.position),
    };
  });
  // Geplante Wartung als Beispiel: GW-Tier am ersten Tag 09–13 Uhr in der Werkstatt
  const gwt = vehicles.find((v) => v.typeId === 'gwt');
  if (gwt) gwt.maintenance.push({ id: 'mw_1', from: Date.UTC(2026, 9, 19, 9), to: Date.UTC(2026, 9, 19, 13), reason: 'TÜV-Prüfung' });

  const aao: AaoRule[] = KEYWORD_SEEDS.map((k) => ({
    id: `aao_${keywordIdFromCode(k.code).slice(3)}`,
    keywordId: keywordIdFromCode(k.code),
    requirements: k.needs.map(([capability, count]) => ({ capability, count })),
    note: '',
  }));

  return {
    id: 'center_hessenwald',
    name: 'ILS Hessenwald (Beispiel)',
    description: 'Fiktive Integrierte Leitstelle für Feuerwehr und Rettungsdienst mit fünf Gemeinden. Sofort spielbar.',
    operator: 'Landkreis Hessenwald (fiktiv)',
    country: 'Deutschland',
    state: 'Hessen',
    district: 'Landkreis Hessenwald (fiktiv)',
    city: 'Bergstadt',
    mapCenter: [50.56, 9.69],
    mapZoom: 11,
    organizations: DEFAULT_ORGANIZATIONS.map((o) => ({ ...o })),
    vehicleTypes: types,
    areas: structuredClone(AREAS),
    stations: STATIONS.map((s) => ({ ...s })),
    vehicles,
    statusDefs: DEFAULT_STATUS_DEFS.map((s) => ({ ...s })),
    keywords: DEFAULT_KEYWORDS.map((k) => ({ ...k })),
    aao,
    hospitals: HOSPITALS.map((h) => ({ ...h })),
    neighbors: NEIGHBORS.map((n) => ({ ...n })),
    streetNames: [...STREET_NAMES],
    places: null,
    settings: {
      callsPerHour: 5,
      difficulty: 'normal',
      seed: 20261019,
      categoryWeights: {},
      useTimeOfDay: true,
      useWeather: true,
      randomBreakdowns: true,
      autoHospital: false,
      autoRelease: false,
      detourFactor: 1.35,
      disabledScenarioIds: [],
    },
    sharing: { visibility: 'privat', author: '', tags: ['beispiel'] },
  };
}

/** Leere Leitstelle mit Standardkatalogen (Fahrzeugtypen, Stichwörter, AAO, Status), aber ohne Wachen/Fahrzeuge. */
export function createEmptyCenter(name: string): CenterConfig {
  const sample = createSampleCenter();
  return {
    ...sample,
    id: `center_${Date.now().toString(36)}`,
    name,
    description: '',
    operator: '',
    state: '',
    district: '',
    city: '',
    areas: [],
    stations: [],
    vehicles: [],
    hospitals: [],
    neighbors: [],
    sharing: { visibility: 'privat', author: '', tags: [] },
  };
}
