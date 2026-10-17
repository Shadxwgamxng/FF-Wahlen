/**
 * Zentrales, typisiertes Datenmodell von LEITWARTE.
 *
 * Aufteilung:
 *  - CenterConfig: alles, was im Leitstellen-Editor konfiguriert wird (persistente Stammdaten).
 *  - Runtime:      der laufende Simulationszustand (Uhr, Notrufe, Einsätze, Protokoll, Statistik).
 *  - GameState:    CenterConfig + Runtime = ein vollständiger Spielstand.
 *
 * Alle Entitäten besitzen stabile String-IDs. Zeiten sind Simulationszeit in Millisekunden
 * (Unix-Epoch), Koordinaten sind WGS84 [lat, lng].
 */

export type ID = string;
export type LatLng = [number, number];

// ---------------------------------------------------------------------------
// Stammdaten
// ---------------------------------------------------------------------------

export type OrgKind =
  | 'feuerwehr'
  | 'berufsfeuerwehr'
  | 'freiwillige_feuerwehr'
  | 'rettungsdienst'
  | 'krankentransport'
  | 'notarzt'
  | 'polizei'
  | 'thw'
  | 'katastrophenschutz'
  | 'werkfeuerwehr'
  | 'sonstige';

export interface Organization {
  id: ID;
  name: string;
  kind: OrgKind;
  /** Kurzbeschreibung der Zuständigkeiten */
  responsibilities: string;
  color: string;
}

/** Fähigkeiten, aus denen Einsatzbedarfe zusammengesetzt werden (frei erweiterbar). */
export type Capability = string;

export interface VehicleType {
  id: ID;
  /** Kurzbezeichnung, z. B. "HLF 20" */
  code: string;
  name: string;
  orgKind: OrgKind;
  capabilities: Capability[];
  /** Mindestbesatzung als Qualifikations-Anforderungen */
  crewRequirements: CrewRequirement[];
  /** Sitzplätze gesamt */
  seats: number;
  /** Durchschnittsgeschwindigkeit mit Sonderrechten in km/h (Näherung) */
  speedKmh: number;
  /** Luftfahrzeug: Luftlinie ohne Umwegfaktor */
  airborne?: boolean;
  /** Kann Patienten transportieren */
  canTransport?: boolean;
  /** Freie, organisationsspezifische Zusatzeigenschaften */
  extra?: Record<string, string>;
}

export interface CrewRequirement {
  qualification: QualificationId;
  count: number;
}

export type QualificationId = string;

export interface Qualification {
  id: QualificationId;
  name: string;
}

export interface Area {
  id: ID;
  name: string;
  /** Gemeinde, Teilgebiet o. ä. */
  kind: 'gemeinde' | 'teilgebiet' | 'stadtteil';
  polygon: LatLng[];
  /** Zuständige Wachen (für Zuständigkeitsprüfung in der Disposition) */
  responsibleStationIds: ID[];
}

export type StationKind =
  | 'feuerwache'
  | 'feuerwehrhaus'
  | 'rettungswache'
  | 'notarztstandort'
  | 'polizei'
  | 'thw'
  | 'kats'
  | 'werkfeuerwehr'
  | 'sonstige';

export interface Station {
  id: ID;
  name: string;
  kind: StationKind;
  organizationId: ID;
  position: LatLng;
  address: string;
  /** Anzahl Stellplätze */
  capacity: number;
  /** Ausrückzeit in Sekunden (Alarm -> Status 3) */
  turnoutSeconds: number;
}

export interface ServiceWindow {
  /** Stunde 0–23, Beginn inkl. */
  fromHour: number;
  /** Stunde 1–24, Ende exkl. */
  toHour: number;
  /** Wochentage 0=So … 6=Sa; leer = jeden Tag */
  weekdays: number[];
}

export interface MaintenanceWindow {
  id: ID;
  from: number;
  to: number;
  reason: string;
}

export interface Vehicle {
  id: ID;
  callsign: string;
  typeId: ID;
  organizationId: ID;
  stationId: ID;
  /** Kennzeichen o. ä. */
  identifier: string;
  equipment: string[];
  /** Leer = rund um die Uhr im Dienst */
  serviceWindows: ServiceWindow[];
  maintenance: MaintenanceWindow[];
  /** Extern (Nachbarleitstelle / Luftrettung) – Alarmierung über Anforderung */
  external?: { neighborId: ID; requestDelaySeconds: number };
  /** Laufzeitdaten */
  rt: VehicleRuntime;
}

export type StatusMeaning =
  | 'frei_funk' // 1
  | 'frei_wache' // 2
  | 'alarmiert' // Alarm empfangen, rückt aus
  | 'anfahrt' // 3
  | 'einsatzort' // 4
  | 'sprechwunsch' // 5
  | 'ausser_dienst' // 6
  | 'transport' // 7
  | 'am_ziel'; // 8

export interface StatusDef {
  meaning: StatusMeaning;
  code: string;
  label: string;
  color: string;
}

export interface VehicleRuntime {
  status: StatusMeaning;
  /** Status vor einem Sprechwunsch (wird danach wiederhergestellt) */
  statusBeforeSpeak?: StatusMeaning;
  position: LatLng;
  incidentId: ID | null;
  move: Movement | null;
  /** Wann die aktuelle Phase endet (Ausrücken, Übergabe im Krankenhaus …) */
  phaseUntil: number | null;
  /** Gebundenes Personal */
  crewIds: ID[];
  /** Patient an Bord / zugewiesen */
  patientId: ID | null;
  /** Ziel bei Transport */
  targetHospitalId: ID | null;
  /** Ungeplanter Ausfall bis */
  breakdownUntil: number | null;
  /** Statistik-Akkumulatoren (ms) */
  statMs: { available: number; busy: number; outOfService: number };
  alarms: number;
  lastStatusChange: number;
}

export interface Movement {
  from: LatLng;
  to: LatLng;
  departAt: number;
  arriveAt: number;
  purpose: 'einsatz' | 'transport' | 'rueckfahrt';
  emergency: boolean;
}

export type ShiftKind = 'tag' | 'nacht' | '24h' | 'ehrenamt';

export interface Person {
  id: ID;
  name: string;
  stationId: ID;
  qualifications: QualificationId[];
  shift: ShiftKind;
  absences: { id: ID; from: number; to: number; reason: string }[];
}

export interface ShiftModel {
  /** Tagdienst Beginn/Ende (Stunde) */
  dayStart: number;
  dayEnd: number;
  /** Anteil der Ehrenamtlichen, die tagsüber erreichbar sind (0..1) */
  volunteerDayAvailability: number;
  volunteerNightAvailability: number;
}

export type KeywordCategory =
  | 'brand'
  | 'th'
  | 'vu'
  | 'rd'
  | 'ktp'
  | 'abc'
  | 'wasser'
  | 'tier'
  | 'pol'
  | 'sonstiges';

export interface Keyword {
  id: ID;
  code: string;
  label: string;
  category: KeywordCategory;
  /** 1 = höchste Priorität */
  priority: 1 | 2 | 3;
}

export interface AaoRequirement {
  capability: Capability;
  count: number;
}

export interface AaoRule {
  id: ID;
  keywordId: ID;
  requirements: AaoRequirement[];
  note: string;
}

export interface Hospital {
  id: ID;
  name: string;
  position: LatLng;
  departments: string[];
  /** Freie Kapazität (Patienten) – wird in der Simulation belegt und wieder frei */
  capacity: number;
  occupied: number;
  available: boolean;
}

export interface NeighborCenter {
  id: ID;
  name: string;
  position: LatLng;
  note: string;
}

export type Difficulty = 'leicht' | 'normal' | 'schwer' | 'experte';

export interface SimSettings {
  /** Durchschnittliche Notrufe pro Stunde Simulationszeit (vor Schwierigkeitsfaktor) */
  callsPerHour: number;
  difficulty: Difficulty;
  seed: number;
  /** Anteil der Kategorien (Gewicht) */
  categoryWeights: Partial<Record<KeywordCategory, number>>;
  /** Tageszeit berücksichtigen */
  useTimeOfDay: boolean;
  useWeather: boolean;
  /** Zufällige Fahrzeugausfälle */
  randomBreakdowns: boolean;
  /** Krankenhausziel automatisch wählen statt Sprechwunsch */
  autoHospital: boolean;
  /** Fahrzeuge nach Einsatzende automatisch entlassen */
  autoRelease: boolean;
  /** Umwegfaktor der Fahrzeitnäherung */
  detourFactor: number;
  /** Ausgeschlossene Szenarien */
  disabledScenarioIds: string[];
}

export interface CenterConfig {
  id: ID;
  name: string;
  description: string;
  operator: string;
  country: string;
  state: string;
  district: string;
  city: string;
  mapCenter: LatLng;
  mapZoom: number;
  organizations: Organization[];
  qualifications: Qualification[];
  vehicleTypes: VehicleType[];
  areas: Area[];
  stations: Station[];
  vehicles: Vehicle[];
  personnel: Person[];
  shiftModel: ShiftModel;
  statusDefs: StatusDef[];
  keywords: Keyword[];
  aao: AaoRule[];
  hospitals: Hospital[];
  neighbors: NeighborCenter[];
  /** Fiktive Straßennamen für generierte Einsatzadressen */
  streetNames: string[];
  settings: SimSettings;
  /** Vorbereitet für spätere Community-Bibliothek */
  sharing: { visibility: 'privat' | 'geteilt' | 'oeffentlich'; author: string; tags: string[] };
}

// ---------------------------------------------------------------------------
// Laufzeit
// ---------------------------------------------------------------------------

export type CallState = 'klingelt' | 'in_abfrage' | 'abgeschlossen' | 'aufgelegt';

export interface CallQA {
  questionId: string;
  question: string;
  answer: string;
  askedAt: number;
}

export interface Call {
  id: ID;
  receivedAt: number;
  acceptedAt: number | null;
  closedAt: number | null;
  state: CallState;
  caller: { name: string; phone: string; relation: string };
  opening: string;
  scenarioId: string;
  variantIdx: number;
  category: KeywordCategory;
  location: { position: LatLng; address: string; areaId: ID | null; detail: string };
  /** Verdeckte Fakten (Wahrheit des Szenarios) */
  facts: Record<string, string | number | boolean>;
  dialog: CallQA[];
  /** Vom Disponenten notiert */
  notes: string;
  /** Vom Disponenten gewähltes Stichwort */
  keywordId: ID | null;
  incidentId: ID | null;
  /** Zeitpunkt, an dem der Anrufer ohne Annahme auflegt */
  hangupAt: number;
  /** Erneuter Anruf nach Auflegen bzw. Folgeanruf zu bestehendem Einsatz */
  redialOf: ID | null;
  /** Folgeanruf (Doppelmeldung) zu einem bereits angelegten Einsatz */
  duplicateOfIncidentId: ID | null;
}

export type IncidentState =
  | 'neu' // angelegt, noch nichts alarmiert
  | 'disponiert' // Kräfte alarmiert, keiner vor Ort
  | 'vor_ort' // mindestens eine Einheit vor Ort
  | 'abarbeitung_beendet' // Maßnahmen beendet, Kräfte noch gebunden
  | 'abgeschlossen';

export interface Patient {
  id: ID;
  label: string;
  needsDoctor: boolean;
  department: string;
  state: 'wartet' | 'versorgt' | 'transport' | 'uebergeben' | 'kein_transport';
  vehicleId: ID | null;
  hospitalId: ID | null;
  /** Versorgung vor Ort abgeschlossen ab (wenn Fahrzeug zugewiesen) */
  readyAt: number | null;
}

export interface Incident {
  id: ID;
  number: string;
  callId: ID | null;
  createdAt: number;
  firstAlarmAt: number | null;
  firstArrivalAt: number | null;
  workDoneAt: number | null;
  closedAt: number | null;
  state: IncidentState;
  keywordId: ID;
  /** Tatsächliches Szenario (verdeckt) */
  scenarioId: string;
  category: KeywordCategory;
  position: LatLng;
  address: string;
  areaId: ID | null;
  description: string;
  priority: 1 | 2 | 3;
  /** Tatsächlicher Bedarf (aus Szenario + Nachforderungen) */
  needs: AaoRequirement[];
  /** Arbeitsumfang in Sim-Millisekunden bei voller Besetzung */
  workTotalMs: number;
  workDoneMs: number;
  patients: Patient[];
  /** Alle jemals alarmierten Fahrzeuge */
  vehicleIds: ID[];
  /** Aktuell gebundene Fahrzeuge */
  activeVehicleIds: ID[];
  backupRequests: { at: number; text: string; requirements: AaoRequirement[] }[];
  escalation: { at: number; requirements: AaoRequirement[]; text: string; triggered: boolean; extraPatients: number } | null;
  log: { at: number; text: string }[];
  /** Bewertungshinweis: richtiges Stichwort gewählt? */
  keywordCorrect: boolean | null;
  /** Zeitpunkt der letzten automatischen Bedarfsprüfung der Kräfte vor Ort */
  lastNeedCheckAt: number | null;
}

export type EventKind =
  | 'notruf'
  | 'alarm'
  | 'status'
  | 'funk'
  | 'nachforderung'
  | 'einsatz'
  | 'abschluss'
  | 'system'
  | 'warnung';

export interface LogEvent {
  id: number;
  at: number;
  kind: EventKind;
  text: string;
  incidentId?: ID;
  vehicleId?: ID;
  callId?: ID;
}

export interface RadioMessage {
  id: ID;
  at: number;
  vehicleId: ID;
  incidentId: ID | null;
  kind: 'transportziel' | 'nachforderung' | 'lage' | 'defekt';
  text: string;
  handled: boolean;
  /** Bei Nachforderung */
  requirements?: AaoRequirement[];
  patientId?: ID;
}

export type Weather = 'klar' | 'bewoelkt' | 'regen' | 'gewitter' | 'schnee' | 'hitze' | 'nebel';

export interface ArchivedIncident {
  id: ID;
  number: string;
  keywordId: ID;
  keywordCode: string;
  category: KeywordCategory;
  address: string;
  createdAt: number;
  callReceivedAt: number | null;
  firstAlarmAt: number | null;
  firstArrivalAt: number | null;
  closedAt: number;
  vehicleCount: number;
  backupCount: number;
  patientCount: number;
  keywordCorrect: boolean | null;
  log: { at: number; text: string }[];
}

export interface Runtime {
  clock: { now: number; running: boolean; speed: number; startedAt: number };
  rngState: number;
  weather: Weather;
  nextWeatherChange: number;
  nextCallAt: number;
  counters: { call: number; incident: number; event: number; radio: number; patient: number };
  calls: Call[];
  incidents: Incident[];
  radio: RadioMessage[];
  events: LogEvent[];
  archive: ArchivedIncident[];
  /** Belegte Klinikbetten mit Freigabezeitpunkt */
  hospitalBeds: { hospitalId: ID; until: number }[];
  stats: {
    callsTotal: number;
    callsMissed: number;
    callWaitMsTotal: number;
    callsAnswered: number;
  };
}

export interface GameState {
  schemaVersion: number;
  center: CenterConfig;
  runtime: Runtime;
}

export const SCHEMA_VERSION = 1;
