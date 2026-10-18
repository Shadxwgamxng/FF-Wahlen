import type { AaoRule, Area, CenterConfig, Hospital, LatLng, Organization, PlaceIndex, Station } from '../model/types';
import type { County, Facility } from '../geo/osm';
import { DEFAULT_KEYWORDS, KEYWORD_SEEDS, keywordIdFromCode } from './keywords';
import { DEFAULT_STATUS_DEFS, DEFAULT_VEHICLE_TYPES } from './vehicleTypes';
import { STREET_NAMES } from './sampleCenter';
import { newId } from '../model/ids';
import { pointInArea } from '../sim/geo';
import { reverseGeocode } from '../geo/places';

/**
 * Baut eine neue Leitstelle aus den Angaben des Assistenten "Leitstelle erstellen":
 * echte Landkreise (OSM-Grenzen), Organisationen mit Funkrufgruppen, OSM-Orte und
 * ausgewählte reale Standorte (Feuerwehr, Rettungswachen, Polizei, Kliniken) als Vorschläge.
 */

/** Vorlage der Organisationen im Assistenten (Funkrufgruppen trägt der Spieler ein) */
export function defaultOrganizations(): Organization[] {
  const o = (id: string, name: string, kind: Organization['kind'], color: string, responsibilities: string): Organization => ({
    id,
    name,
    kind,
    color,
    responsibilities,
    radioGroup: { name: '', code: '' },
  });
  return [
    o('org_bf', 'Berufsfeuerwehr', 'berufsfeuerwehr', '#e5484d', 'Brandschutz und technische Hilfe (hauptamtlich)'),
    o('org_ff', 'Freiwillige Feuerwehren', 'freiwillige_feuerwehr', '#f76b15', 'Brandschutz und technische Hilfe (ehrenamtlich)'),
    o('org_rd', 'Rettungsdienst', 'rettungsdienst', '#ffffff', 'Notfallrettung'),
    o('org_ktp', 'Krankentransport', 'krankentransport', '#a3a3a3', 'Qualifizierter Krankentransport'),
    o('org_na', 'Notarztdienst', 'notarzt', '#f5d90a', 'Notarztgestellung'),
    o('org_pol', 'Polizei', 'polizei', '#3e63dd', 'Partnerkräfte für Absicherung und Gefahrenabwehr'),
    o('org_thw', 'THW', 'thw', '#0090ff', 'Bergung, Pumpen, Logistik'),
    o('org_kats', 'Katastrophenschutz', 'katastrophenschutz', '#8e4ec6', 'Sanitäts- und Betreuungsdienst'),
    o('org_ext', 'Luftrettung / Nachbarbereiche', 'sonstige', '#12a594', 'Externe Einsatzmittel'),
  ];
}

export function defaultAao(): AaoRule[] {
  return KEYWORD_SEEDS.map((k) => ({
    id: `aao_${keywordIdFromCode(k.code).slice(3)}`,
    keywordId: keywordIdFromCode(k.code),
    requirements: k.needs.map(([capability, count]) => ({ capability, count })),
    note: '',
  }));
}

export interface WizardInput {
  name: string;
  operator: string;
  counties: County[];
  organizations: Organization[];
  places: PlaceIndex | null;
  facilities: Facility[];
}

export function centerBounds(counties: County[]): { center: LatLng; zoom: number } {
  const pts = counties.flatMap((c) => c.polygons.flatMap((r) => r[0] ?? []));
  if (!pts.length) return { center: [54.3, 10.1], zoom: 9 };
  const lat = pts.map((p) => p[0]);
  const lng = pts.map((p) => p[1]);
  const minLat = Math.min(...lat);
  const maxLat = Math.max(...lat);
  const minLng = Math.min(...lng);
  const maxLng = Math.max(...lng);
  const span = Math.max(maxLat - minLat, (maxLng - minLng) * 0.6);
  const zoom = span > 1.5 ? 8 : span > 0.7 ? 9 : span > 0.35 ? 10 : 11;
  return { center: [(minLat + maxLat) / 2, (minLng + maxLng) / 2], zoom };
}

export function validateWizard(i: WizardInput): string[] {
  const errs: string[] = [];
  if (!i.name.trim()) errs.push('Bitte einen Namen für die Leitstelle angeben.');
  if (i.counties.length === 0) errs.push('Bitte mindestens einen Landkreis auswählen.');
  if (i.organizations.length === 0) errs.push('Mindestens eine Organisation ist nötig.');
  for (const o of i.organizations) {
    if (!o.radioGroup.name.trim() || !o.radioGroup.code.trim()) errs.push(`Funkrufgruppe für „${o.name}“ fehlt (Name und Kürzel).`);
  }
  const codes = i.organizations.map((o) => o.radioGroup.code.trim().toUpperCase()).filter(Boolean);
  if (new Set(codes).size !== codes.length) errs.push('Die Kürzel der Funkrufgruppen müssen eindeutig sein.');
  return errs;
}

export function buildCenter(i: WizardInput): CenterConfig {
  const { center, zoom } = centerBounds(i.counties);
  const orgByKind = (...kinds: Organization['kind'][]) => i.organizations.find((o) => kinds.includes(o.kind));
  const areas: Area[] = i.counties.map((c) => ({
    id: `area_osm_${c.osmRelationId}`,
    name: c.name,
    kind: 'landkreis',
    polygons: c.polygons,
    osmRelationId: c.osmRelationId,
    responsibleStationIds: [],
  }));

  const stations: Station[] = [];
  const hospitals: Hospital[] = [];
  // Unbenannte Standorte (in OSM ohne Namen) nach dem nächstgelegenen Ort benennen
  const cityNear = (p: LatLng) => {
    if (!i.places) return '';
    const r = reverseGeocode(i.places, p);
    return r && r.distanceM < 3000 ? (i.places.strings[r.tuple[5]] ?? '') : '';
  };
  const usedNames = new Set<string>();
  const uniqueName = (n: string) => {
    let name = n;
    for (let k = 2; usedNames.has(name); k++) name = `${n} (${k})`;
    usedNames.add(name);
    return name;
  };
  for (const f0 of i.facilities) {
    const generic = /^(Feuerwehr|Rettungswache|Polizei|Krankenhaus)$/.test(f0.name);
    const f = { ...f0, name: uniqueName(generic ? `${f0.name} ${cityNear(f0.position)}`.trim() : f0.name) };
    if (f.kind === 'krankenhaus') {
      hospitals.push({ id: newId('kh'), name: f.name, position: f.position, departments: ['allgemein', 'innere', 'unfallchirurgie'], capacity: 8, occupied: 0, available: true });
      continue;
    }
    let org: Organization | undefined;
    let kind: Station['kind'];
    let turnout = 60;
    if (f.kind === 'feuerwehr') {
      const pro = /berufsfeuerwehr|feuerwache|hauptwache/i.test(f.name);
      org = pro ? orgByKind('berufsfeuerwehr', 'feuerwehr') ?? orgByKind('freiwillige_feuerwehr') : orgByKind('freiwillige_feuerwehr', 'feuerwehr') ?? orgByKind('berufsfeuerwehr');
      kind = pro ? 'feuerwache' : 'feuerwehrhaus';
      turnout = pro ? 60 : 300;
    } else if (f.kind === 'rettungswache') {
      org = orgByKind('rettungsdienst');
      kind = 'rettungswache';
    } else {
      org = orgByKind('polizei');
      kind = 'polizei';
      turnout = 90;
    }
    if (!org) continue; // Organisation wurde im Assistenten abgewählt
    stations.push({ id: newId('st'), name: f.name, kind, organizationId: org.id, position: f.position, address: f.address, capacity: 6, turnoutSeconds: turnout });
  }
  for (const a of areas) a.responsibleStationIds = stations.filter((s) => pointInArea(s.position, a)).map((s) => s.id);

  return {
    id: newId('center'),
    name: i.name.trim(),
    description: '',
    operator: i.operator.trim(),
    country: 'Deutschland',
    state: [...new Set(i.counties.map((c) => c.state).filter(Boolean))].join(', '),
    district: i.counties.map((c) => c.name).join(', '),
    city: '',
    mapCenter: center,
    mapZoom: zoom,
    organizations: i.organizations.map((o) => ({ ...o, radioGroup: { name: o.radioGroup.name.trim(), code: o.radioGroup.code.trim().toUpperCase() } })),
    vehicleTypes: DEFAULT_VEHICLE_TYPES.map((t) => ({ ...t })),
    areas,
    stations,
    vehicles: [],
    statusDefs: DEFAULT_STATUS_DEFS.map((s) => ({ ...s })),
    keywords: DEFAULT_KEYWORDS.map((k) => ({ ...k })),
    aao: defaultAao(),
    hospitals,
    neighbors: [],
    streetNames: [...STREET_NAMES],
    places: i.places,
    settings: {
      callsPerHour: 5,
      difficulty: 'normal',
      seed: Math.floor(Math.random() * 1e9),
      categoryWeights: {},
      useTimeOfDay: true,
      useWeather: true,
      randomBreakdowns: true,
      autoHospital: false,
      autoRelease: false,
      detourFactor: 1.35,
      disabledScenarioIds: [],
    },
    sharing: { visibility: 'privat', author: '', tags: [] },
  };
}
