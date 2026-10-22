import { z } from 'zod';
import type { CenterConfig, GameState } from '../model/types';
import { SCHEMA_VERSION } from '../model/types';
import { createEmptyCenter, emptyVehicleRuntime } from '../data/sampleCenter';
import { emptyMask } from '../model/mask';

/**
 * Validierung und Migration des dokumentierten JSON-Austauschformats (siehe docs/DATENFORMAT.md).
 *
 * Importe werden "nachsichtig" validiert: Ungültige Einzeleinträge (z. B. ein Fahrzeug mit
 * fehlendem Typ) werden verworfen und im Importbericht aufgeführt, statt den gesamten Import
 * abzubrechen. Ist die Grundstruktur unbrauchbar, wird der Import abgelehnt und vorhandene
 * Daten bleiben unverändert.
 */

export const EXPORT_FORMAT = 'leitwarte';
export const FORMAT_VERSION = 1;

const latLng = z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]);
const id = z.string().min(1);

const orgKind = z.enum(['feuerwehr', 'berufsfeuerwehr', 'freiwillige_feuerwehr', 'rettungsdienst', 'krankentransport', 'notarzt', 'polizei', 'thw', 'katastrophenschutz', 'werkfeuerwehr', 'sonstige']);
const category = z.enum(['brand', 'th', 'vu', 'rd', 'ktp', 'abc', 'wasser', 'tier', 'pol', 'sonstiges']);
const meaning = z.enum(['frei_funk', 'frei_wache', 'alarmiert', 'anfahrt', 'einsatzort', 'sprechwunsch', 'ausser_dienst', 'transport', 'am_ziel']);

const placeIndexSchema = z.object({
  source: z.literal('osm'),
  fetchedAt: z.string(),
  strings: z.array(z.string()),
  places: z.array(z.tuple([z.enum(['w', 'g', 'o', 'k', 's', 'b', 'l', 'x']), z.number(), z.number(), z.number(), z.string(), z.number(), z.string(), z.number()])),
});

export const schemas = {
  organization: z.preprocess(
    (v) => (v && typeof v === 'object' && !('radioGroup' in v) ? { ...(v as Record<string, unknown>), radioGroup: { name: String((v as { name?: unknown }).name ?? ''), code: '' } } : v),
    z.object({
      id,
      name: z.string().min(1),
      kind: orgKind,
      responsibilities: z.string().default(''),
      color: z.string().default('#888888'),
      radioGroup: z.object({ name: z.string(), code: z.string() }),
    }),
  ),
  vehicleType: z.object({
    id,
    code: z.string().min(1),
    name: z.string().min(1),
    orgKind,
    capabilities: z.array(z.string()),
    seats: z.number().int().min(1),
    speedKmh: z.number().positive().max(400),
    airborne: z.boolean().optional(),
    canTransport: z.boolean().optional(),
    extra: z.record(z.string(), z.string()).optional(),
  }),
  area: z.preprocess(
    // Migration: frühere Versionen speicherten nur einen Ring in "polygon"
    (v) => (v && typeof v === 'object' && 'polygon' in v && !('polygons' in v) ? { ...(v as Record<string, unknown>), polygons: [[(v as { polygon: unknown }).polygon]] } : v),
    z.object({
      id,
      name: z.string().min(1),
      kind: z.enum(['landkreis', 'gemeinde', 'teilgebiet', 'stadtteil']),
      polygons: z.array(z.array(z.array(latLng).min(3)).min(1)).min(1),
      osmRelationId: z.number().optional(),
      responsibleStationIds: z.array(z.string()),
    }),
  ),
  station: z.object({
    id,
    name: z.string().min(1),
    kind: z.enum(['feuerwache', 'feuerwehrhaus', 'rettungswache', 'notarztstandort', 'polizei', 'thw', 'kats', 'werkfeuerwehr', 'sonstige']),
    organizationId: z.string(),
    position: latLng,
    address: z.string().default(''),
    capacity: z.number().int().min(0),
    turnoutSeconds: z.number().min(0).max(3600),
    mainStationId: z.string().optional(),
  }),
  vehicle: z.object({
    id,
    callsign: z.string().min(1),
    typeId: z.string(),
    organizationId: z.string(),
    stationId: z.string(),
    identifier: z.string().default(''),
    equipment: z.array(z.string()).default([]),
    serviceWindows: z
      .array(z.object({ fromHour: z.number().int().min(0).max(23), toHour: z.number().int().min(1).max(24), weekdays: z.array(z.number().int().min(0).max(6)), months: z.array(z.number().int().min(1).max(12)).optional() }))
      .default([]),
    outOfService: z.boolean().optional(),
    maintenance: z.array(z.object({ id, from: z.number(), to: z.number(), reason: z.string() })).default([]),
    external: z.object({ neighborId: z.string(), requestDelaySeconds: z.number().min(0) }).optional(),
    radioGroup: z.object({ name: z.string(), code: z.string() }).optional(),
    rt: z.any().optional(),
  }),
  statusDef: z.object({ meaning, code: z.string().min(1), label: z.string().min(1), color: z.string() }),
  keyword: z.object({
    id,
    code: z.string().min(1),
    label: z.string().min(1),
    category,
    priority: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    emergency: z.boolean().optional(),
    forward: z.boolean().optional(),
    exercise: z.boolean().optional(),
    infection: z.enum(['covid', 'hoch']).optional(),
    note: z.string().optional(),
  }),
  meldebild: z.object({ id, label: z.string().min(1), cedus: z.string().optional(), category, keywordCode: z.string(), note: z.string().optional() }),
  aao: z.object({ id, keywordId: z.string(), requirements: z.array(z.object({ capability: z.string(), count: z.number().int().min(1) })), note: z.string().default('') }),
  hospital: z.object({ id, name: z.string().min(1), position: latLng, departments: z.array(z.string()), capacity: z.number().int().min(0), occupied: z.number().int().min(0).default(0), available: z.boolean().default(true) }),
  neighbor: z.object({ id, name: z.string().min(1), position: latLng, note: z.string().default('') }),
  settings: z.object({
    callsPerHour: z.number().min(0).max(200),
    difficulty: z.enum(['leicht', 'normal', 'schwer', 'experte']),
    seed: z.number().int(),
    categoryWeights: z.record(z.string(), z.number().min(0)).default({}),
    useTimeOfDay: z.boolean(),
    useWeather: z.boolean(),
    randomBreakdowns: z.boolean(),
    autoHospital: z.boolean(),
    autoRelease: z.boolean(),
    detourFactor: z.number().min(1).max(3),
    disabledScenarioIds: z.array(z.string()).default([]),
  }),
};

export interface ImportIssue {
  path: string;
  message: string;
}

const COLLECTIONS = [
  ['organizations', 'organization'],
  ['vehicleTypes', 'vehicleType'],
  ['areas', 'area'],
  ['stations', 'station'],
  ['vehicles', 'vehicle'],
  ['statusDefs', 'statusDef'],
  ['keywords', 'keyword'],
  ['meldebilder', 'meldebild'],
  ['aao', 'aao'],
  ['hospitals', 'hospital'],
  ['neighbors', 'neighbor'],
] as const;

const fmtZod = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.') || '(Wurzel)'}: ${i.message}`).join('; ');

/** Prüft eine Leitstellenkonfiguration nachsichtig und liefert eine bereinigte Fassung */
export function parseCenterLenient(raw: unknown): { center: CenterConfig | null; issues: ImportIssue[] } {
  const issues: ImportIssue[] = [];
  if (!raw || typeof raw !== 'object') return { center: null, issues: [{ path: '', message: 'Keine Leitstellendaten gefunden.' }] };
  const r = raw as Record<string, unknown>;
  if (typeof r.name !== 'string' || !r.name.trim()) return { center: null, issues: [{ path: 'name', message: 'Leitstelle hat keinen Namen.' }] };
  const base = createEmptyCenter(r.name);
  const out: CenterConfig = { ...base, id: typeof r.id === 'string' && r.id ? r.id : base.id };
  for (const key of ['name', 'description', 'operator', 'country', 'state', 'district', 'city'] as const) {
    if (typeof r[key] === 'string') out[key] = r[key] as string;
  }
  const mc = latLng.safeParse(r.mapCenter);
  if (mc.success) out.mapCenter = mc.data;
  if (typeof r.mapZoom === 'number') out.mapZoom = r.mapZoom;
  if (Array.isArray(r.streetNames)) out.streetNames = r.streetNames.filter((s): s is string => typeof s === 'string');
  out.catalogId = typeof r.catalogId === 'string' ? r.catalogId : 'standard';
  if (!Array.isArray(r.meldebilder)) out.meldebilder = [];
  if (Array.isArray(r.pois))
    out.pois = r.pois.filter(
      (x): x is NonNullable<CenterConfig['pois']>[number] =>
        !!x && typeof x === 'object' && typeof (x as { name?: unknown }).name === 'string' && latLng.safeParse((x as { position?: unknown }).position).success,
    );
  out.places = null;
  if (r.places) {
    const pp = placeIndexSchema.safeParse(r.places);
    if (pp.success) out.places = pp.data as CenterConfig['places'];
    else issues.push({ path: 'places', message: 'OSM-Ortsdaten beschädigt – verworfen (können im Editor neu geladen werden).' });
  }

  for (const [key, schemaName] of COLLECTIONS) {
    const arr = r[key];
    if (arr === undefined) continue;
    if (!Array.isArray(arr)) {
      issues.push({ path: key, message: 'Ist keine Liste – Standardwerte verwendet.' });
      continue;
    }
    const schema = schemas[schemaName] as z.ZodTypeAny;
    const seen = new Set<string>();
    const valid: unknown[] = [];
    arr.forEach((item, i) => {
      const p = schema.safeParse(item);
      if (!p.success) {
        issues.push({ path: `${key}[${i}]`, message: `Verworfen – ${fmtZod(p.error)}` });
        return;
      }
      const itemId = (p.data as { id?: string; meaning?: string }).id ?? (p.data as { meaning: string }).meaning;
      if (seen.has(itemId)) {
        issues.push({ path: `${key}[${i}]`, message: `Verworfen – doppelte ID "${itemId}".` });
        return;
      }
      seen.add(itemId);
      valid.push(p.data);
    });
    (out as unknown as Record<string, unknown>)[key] = valid;
  }
  for (const [key, schemaName] of [['settings', 'settings']] as const) {
    if (r[key] === undefined) continue;
    const p = (schemas[schemaName] as z.ZodTypeAny).safeParse(r[key]);
    if (p.success) (out as unknown as Record<string, unknown>)[key] = p.data;
    else issues.push({ path: key, message: `Ungültig – Standardwerte verwendet (${fmtZod(p.error)})` });
  }
  if (r.sharing && typeof r.sharing === 'object') out.sharing = { ...out.sharing, ...(r.sharing as object) } as CenterConfig['sharing'];

  issues.push(...repairReferences(out));
  for (const v of out.vehicles) {
    const st = out.stations.find((s) => s.id === v.stationId)!;
    if (!v.rt || typeof v.rt !== 'object') v.rt = emptyVehicleRuntime(st.position);
  }
  return { center: out, issues };
}

/** Entfernt Einträge mit ungültigen Referenzen (und berichtet sie) */
export function repairReferences(c: CenterConfig): ImportIssue[] {
  const issues: ImportIssue[] = [];
  const typeIds = new Set(c.vehicleTypes.map((t) => t.id));
  const stationIds = new Set(c.stations.map((s) => s.id));
  const orgIds = new Set(c.organizations.map((o) => o.id));
  const kwIds = new Set(c.keywords.map((k) => k.id));
  c.stations = c.stations.filter((s) => {
    if (!orgIds.has(s.organizationId)) {
      issues.push({ path: `stations/${s.id}`, message: `Unbekannte Organisation "${s.organizationId}" – Wache verworfen.` });
      stationIds.delete(s.id);
      return false;
    }
    return true;
  });
  // Verweis auf eine nicht mehr vorhandene Hauptwehr entfernen
  for (const s of c.stations) if (s.mainStationId && !stationIds.has(s.mainStationId)) delete s.mainStationId;
  c.vehicles = c.vehicles.filter((v) => {
    if (!typeIds.has(v.typeId)) issues.push({ path: `vehicles/${v.id}`, message: `Unbekannter Fahrzeugtyp "${v.typeId}" – Fahrzeug verworfen.` });
    else if (!stationIds.has(v.stationId)) issues.push({ path: `vehicles/${v.id}`, message: `Unbekannte Wache "${v.stationId}" – Fahrzeug verworfen.` });
    else return true;
    return false;
  });
  c.aao = c.aao.filter((a) => {
    if (kwIds.has(a.keywordId)) return true;
    issues.push({ path: `aao/${a.id}`, message: `Unbekanntes Stichwort "${a.keywordId}" – AAO-Regel verworfen.` });
    return false;
  });
  for (const a of c.areas) a.responsibleStationIds = a.responsibleStationIds.filter((s) => stationIds.has(s));
  // Pflicht-Status ergänzen
  const meanings = ['frei_funk', 'frei_wache', 'alarmiert', 'anfahrt', 'einsatzort', 'sprechwunsch', 'ausser_dienst', 'transport', 'am_ziel'] as const;
  const defaults = createEmptyCenter('x').statusDefs;
  for (const m of meanings) {
    if (!c.statusDefs.some((s) => s.meaning === m)) {
      c.statusDefs.push(defaults.find((d) => d.meaning === m)!);
      issues.push({ path: 'statusDefs', message: `Status "${m}" fehlte – Standard ergänzt.` });
    }
  }
  return issues;
}

// ---------------------------------------------------------------------------
// Export / Import
// ---------------------------------------------------------------------------

export interface ExportEnvelope {
  format: typeof EXPORT_FORMAT;
  formatVersion: number;
  kind: 'leitstelle' | 'spielstand';
  exportedAt: string;
  data: unknown;
}

export function exportCenter(c: CenterConfig): ExportEnvelope {
  // Laufzeitdaten der Fahrzeuge gehören nicht zur Leitstellenkonfiguration
  const data = { ...c, vehicles: c.vehicles.map(({ rt: _rt, ...v }) => v), hospitals: c.hospitals.map((h) => ({ ...h, occupied: 0 })) };
  return { format: EXPORT_FORMAT, formatVersion: FORMAT_VERSION, kind: 'leitstelle', exportedAt: new Date().toISOString(), data };
}

export function exportGame(g: GameState): ExportEnvelope {
  return { format: EXPORT_FORMAT, formatVersion: FORMAT_VERSION, kind: 'spielstand', exportedAt: new Date().toISOString(), data: g };
}

/** Migrationen älterer Formatversionen (Version 1 ist aktuell – hier werden künftige Schritte ergänzt) */
export function migrate(env: ExportEnvelope): ExportEnvelope {
  let e = env;
  if (e.formatVersion < 1) e = { ...e, formatVersion: 1 };
  return e;
}

export type ImportResult =
  | { ok: true; kind: 'leitstelle'; center: CenterConfig; issues: ImportIssue[] }
  | { ok: true; kind: 'spielstand'; game: GameState; issues: ImportIssue[] }
  | { ok: false; error: string; issues: ImportIssue[] };

const runtimeSchema = z.object({
  clock: z.object({ now: z.number(), running: z.boolean(), speed: z.number(), startedAt: z.number() }),
  rngState: z.number(),
  weather: z.string(),
  nextWeatherChange: z.number(),
  nextCallAt: z.number(),
  counters: z.object({ call: z.number(), incident: z.number(), event: z.number(), radio: z.number(), patient: z.number() }),
  calls: z.array(z.any()),
  incidents: z.array(z.any()),
  radio: z.array(z.any()),
  funk: z.any().optional(),
  events: z.array(z.any()),
  archive: z.array(z.any()),
  hospitalBeds: z.array(z.object({ hospitalId: z.string(), until: z.number() })).default([]),
  stats: z.object({ callsTotal: z.number(), callsMissed: z.number(), callWaitMsTotal: z.number(), callsAnswered: z.number() }),
});

export function importJson(text: string): ImportResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: `Die Datei ist kein gültiges JSON (${(e as Error).message}).`, issues: [] };
  }
  const envP = z
    .object({ format: z.literal(EXPORT_FORMAT), formatVersion: z.number().int(), kind: z.enum(['leitstelle', 'spielstand']), exportedAt: z.string().optional(), data: z.unknown() })
    .safeParse(raw);
  if (!envP.success) return { ok: false, error: `Unbekanntes Dateiformat: Erwartet wird eine LEITWARTE-Exportdatei (${fmtZod(envP.error)}).`, issues: [] };
  if (envP.data.formatVersion > FORMAT_VERSION)
    return { ok: false, error: `Die Datei stammt aus einer neueren Version (Format ${envP.data.formatVersion}). Bitte LEITWARTE aktualisieren.`, issues: [] };
  const env = migrate(envP.data as ExportEnvelope);

  if (env.kind === 'leitstelle') {
    const { center, issues } = parseCenterLenient(env.data);
    if (!center) return { ok: false, error: 'Die Leitstellendaten sind unbrauchbar.', issues };
    return { ok: true, kind: 'leitstelle', center, issues };
  }
  const d = env.data as Record<string, unknown> | null;
  if (!d || typeof d !== 'object') return { ok: false, error: 'Spielstand enthält keine Daten.', issues: [] };
  const { center, issues } = parseCenterLenient(d.center);
  if (!center) return { ok: false, error: 'Die Leitstellendaten im Spielstand sind unbrauchbar.', issues };
  const rtP = runtimeSchema.safeParse(d.runtime);
  if (!rtP.success) {
    return { ok: false, error: `Laufzeitdaten des Spielstands sind beschädigt (${fmtZod(rtP.error)}). Tipp: Die Datei kann als Leitstelle ohne Spielverlauf neu gestartet werden.`, issues };
  }
  const game: GameState = { schemaVersion: SCHEMA_VERSION, center, runtime: rtP.data as unknown as GameState['runtime'] };
  // Migration älterer Spielstände (vor Einsatzmaske/Ortung)
  for (const inc of game.runtime.incidents as unknown as Record<string, unknown>[]) {
    inc.truePosition ??= inc.position;
    inc.times ??= {};
    inc.mask ??= null;
    inc.locationWrongReported ??= false;
  }
  for (const c of game.runtime.calls as unknown as Record<string, unknown>[]) {
    c.mask ??= emptyMask(String((c.caller as { phone?: string })?.phone ?? ''));
    c.locate ??= null;
    c.phoneType ??= 'mobil';
  }
  // Konsistenz: Fahrzeuge dürfen nur an existierende Einsätze gebunden sein
  const incIds = new Set(game.runtime.incidents.map((i: { id: string }) => i.id));
  for (const v of center.vehicles) {
    if (v.rt?.incidentId && !incIds.has(v.rt.incidentId)) {
      issues.push({ path: `vehicles/${v.id}`, message: 'Bindung an unbekannten Einsatz entfernt.' });
      const st = center.stations.find((s) => s.id === v.stationId)!;
      v.rt = emptyVehicleRuntime(st.position, game.runtime.clock.now);
    }
  }
  return { ok: true, kind: 'spielstand', game, issues };
}

/** Rohdaten eines Spielstands aus der Datenbank prüfen (Schutz vor beschädigten Einträgen) */
export function validateStoredGame(g: unknown): { game: GameState | null; issues: ImportIssue[] } {
  const r = importJson(JSON.stringify(exportGame(g as GameState)));
  if (!r.ok) return { game: null, issues: [{ path: '', message: r.error }, ...r.issues] };
  if (r.kind !== 'spielstand') return { game: null, issues: [] };
  return { game: r.game, issues: r.issues };
}
