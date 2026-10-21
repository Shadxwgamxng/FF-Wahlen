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
  /** Pflicht-Funkrufgruppe der Organisation (z. B. TETRA-Gruppe); Fahrzeuge erben sie */
  radioGroup: RadioGroup;
}

export interface RadioGroup {
  /** Klarname, z. B. "Rettungsdienst Ostholstein" */
  name: string;
  /** Kürzel, z. B. "RD_OH" */
  code: string;
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

/** Polygon als Liste von Ringen: [Außenring, Loch1, Loch2, …] */
export type PolygonRings = LatLng[][];

export interface Area {
  id: ID;
  name: string;
  /** Landkreis (echte Grenze aus OpenStreetMap) oder selbst gezeichnetes Teilgebiet */
  kind: 'landkreis' | 'gemeinde' | 'teilgebiet' | 'stadtteil';
  /** Multipolygon: mehrere Teilflächen (z. B. Inseln), jeweils mit optionalen Löchern */
  polygons: PolygonRings[];
  /** OSM-Relation, aus der die Grenze stammt */
  osmRelationId?: number;
  /** Zuständige Wachen (für Zuständigkeitsprüfung in der Disposition) */
  responsibleStationIds: ID[];
}

/**
 * Echte Orte aus OpenStreetMap für Einsatzadressen.
 * Kompakt gespeichert: [Art, Breite×1e5, Länge×1e5, Straße(idx), Hausnr., Ort(idx), PLZ, Name(idx | -1)]
 *  Art: w = Wohnhaus, g = Gewerbe, o = öffentlich, k = Klinik/Pflege, s = Straße, b = Autobahn/Schnellstraße,
 *       l = Wald/Feld, x = Gewässer/Strand
 */
export type PlaceKind = 'w' | 'g' | 'o' | 'k' | 's' | 'b' | 'l' | 'x';
export type PlaceTuple = [PlaceKind, number, number, number, string, number, string, number];

export type PoiGroup = 'pflege' | 'handel' | 'oeffentlich' | 'gewerbe';

export interface Poi {
  id: ID;
  name: string;
  /** z. B. "Pflegeheim", "Arztpraxis", "Supermarkt" */
  type: string;
  group: PoiGroup;
  position: LatLng;
  address: string;
}

export interface PlaceIndex {
  source: 'osm';
  fetchedAt: string;
  strings: string[];
  places: PlaceTuple[];
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
  /** Abweichende Funkrufgruppe (leer = Gruppe der Organisation) */
  radioGroup?: RadioGroup;
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
  /** Straßenroute (OSRM); fehlt sie, fährt das Fahrzeug die Luftlinien-Näherung */
  path?: LatLng[];
  /** Kumulierte Streckenanteile 0..1 je Stützpunkt von path */
  cum?: number[];
  routed: boolean;
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
  /** Anfahrt mit Sondersignal (Standard: ja) */
  emergency?: boolean;
  /** Weiterleitung an andere Stelle (kein Einsatz, z. B. ärztlicher Bereitschaftsdienst) */
  forward?: boolean;
  /** Übungseinsatz */
  exercise?: boolean;
  /** Infektionsschutz: verlängert Versorgung und Bindungszeit */
  infection?: 'covid' | 'hoch';
  note?: string;
}

/** Meldebild / Verdachtsdiagnose: schlägt ein Einsatzstichwort vor */
export interface Meldebild {
  id: ID;
  label: string;
  /** CEDUS-Code (dreistellig) – nur bei medizinischen Meldebildern */
  cedus?: string;
  category: KeywordCategory;
  /** Code des vorgeschlagenen Einsatzstichworts */
  keywordCode: string;
  note?: string;
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
  vehicleTypes: VehicleType[];
  areas: Area[];
  stations: Station[];
  vehicles: Vehicle[];
  statusDefs: StatusDef[];
  /** Stichwortkatalog, mit dem die Leitstelle angelegt wurde (z. B. "standard", "sh") */
  catalogId: string;
  keywords: Keyword[];
  meldebilder: Meldebild[];
  aao: AaoRule[];
  hospitals: Hospital[];
  neighbors: NeighborCenter[];
  /** Straßennamen für Einsatzadressen, falls keine OSM-Orte geladen sind */
  streetNames: string[];
  /** Echte Adressen/Orte aus OpenStreetMap (für realistische Einsatzorte) */
  places: PlaceIndex | null;
  /** Besondere Objekte aus OpenStreetMap (Pflegeheime, Arztpraxen, Märkte, Schulen …) für Einsatzlagen und Karte */
  pois?: Poi[];
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
  /** Gesprochener Satz (Freisprechen): welche Abfragefragen er beantwortet hat */
  covers?: string[];
}

/** Mehrspieler: Bitte um Übernahme eines Notrufs/Einsatzes */
export interface TakeOverRequest {
  from: { id: string; name: string };
  /** Spielzeit der Anfrage */
  at: number;
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
  location: {
    position: LatLng;
    address: string;
    areaId: ID | null;
    detail: string;
    street?: string;
    houseNumber?: string;
    postcode?: string;
    city?: string;
  };
  /** Verdeckte Fakten (Wahrheit des Szenarios) */
  facts: Record<string, string | number | boolean>;
  dialog: CallQA[];
  /** Vom Disponenten notiert */
  notes: string;
  /** Vom Disponenten gewähltes Stichwort */
  keywordId: ID | null;
  /** Vom Disponenten gewähltes Meldebild */
  meldebildId?: ID | null;
  /** Fortschritt der standardisierten Notrufabfrage (DIAS): gewählte Antworten je Schritt – geteilt mit Tablet/Zweitfenstern */
  dias?: { steps: { nodeId: string; option: number }[]; completion?: { input?: string; answers: Record<string, string> } };
  incidentId: ID | null;
  /** Zeitpunkt, an dem der Anrufer ohne Annahme auflegt */
  hangupAt: number;
  /** Erneuter Anruf nach Auflegen bzw. Folgeanruf zu bestehendem Einsatz */
  redialOf: ID | null;
  /** Folgeanruf (Doppelmeldung) zu einem bereits angelegten Einsatz */
  duplicateOfIncidentId: ID | null;
  /** Mehrspieler: wer den Notruf bearbeitet */
  owner?: { id: string; name: string };
  /** Mehrspieler: offene Übernahme-Anfrage (Zuständiger muss zustimmen) */
  takeOverRequest?: TakeOverRequest;
  /** Mehrspieler: letzte abgelehnte Anfrage (Hinweis beim Anfragenden) */
  takeOverDeclined?: { id: string; name: string; by: string };
  /** Anschlussart des Anrufers (bestimmt die Genauigkeit der Ortung) */
  phoneType: 'festnetz' | 'mobil';
  /** Laufende bzw. abgeschlossene Ortung */
  locate: CallLocate | null;
  /** Eingaben in der Einsatzmaske */
  mask: EinsatzMask;
}

export interface CallLocate {
  startedAt: number;
  readyAt: number;
  status: 'laeuft' | 'ok' | 'fehler';
  position?: LatLng;
  /** Ungenauigkeitsradius in Metern (Mobilfunk) */
  accuracyM?: number;
  street?: string;
  houseNumber?: string;
  postcode?: string;
  city?: string;
  message?: string;
}

/** Vom Disponenten ausgefüllte Felder der Einsatzmaske */
export interface EinsatzMask {
  callerName: string;
  callerPhone: string;
  street: string;
  houseNumber: string;
  postcode: string;
  city: string;
  object: string;
  /** Alarmierungstext / Info an die Kräfte */
  info: string;
  patientName: string;
  targetHospitalId: string;
  /** Zieladresse (KTP), Freitext des Disponenten */
  targetAddress: string;
  remarks: string;
  /** Aus Ortung übernommene Position (statt Geokodierung der Adresse) */
  position: LatLng | null;
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
  /** Mehrspieler: wer den Einsatz bearbeitet */
  owner?: { id: string; name: string };
  /** Mehrspieler: offene Übernahme-Anfrage (Zuständiger muss zustimmen) */
  takeOverRequest?: TakeOverRequest;
  /** Mehrspieler: letzte abgelehnte Anfrage (Hinweis beim Anfragenden) */
  takeOverDeclined?: { id: string; name: string; by: string };
  /** Telefonat mit der Polizeileitstelle (sim/polizei.ts) */
  police?: { open: boolean; shared: boolean; lines: { at: number; from: 'leitstelle' | 'polizei'; text: string }[]; sent: string[]; pending?: { count: number; reason?: string } };
  log: { at: number; text: string }[];
  /** Bewertungshinweis: richtiges Stichwort gewählt? */
  keywordCorrect: boolean | null;
  /** Zeitpunkt der letzten automatischen Bedarfsprüfung der Kräfte vor Ort */
  lastNeedCheckAt: number | null;
  /** Tatsächlicher Ort des Geschehens (kann von der eingegebenen Adresse abweichen) */
  truePosition: LatLng;
  /** Kräfte vor Ort haben gemeldet, dass an der Adresse nichts festzustellen ist */
  locationWrongReported: boolean;
  /** Statuszeiten je Fahrzeug für die Dispoliste */
  times: Record<ID, VehicleTimes>;
  /** Daten aus der Einsatzmaske */
  mask: EinsatzMask | null;
  /** Gewähltes Meldebild (zweistufige Kataloge) */
  meldebildId?: ID | null;
}

export interface VehicleTimes {
  alarm?: number;
  anfahrt?: number;
  einsatzort?: number;
  transport?: number;
  am_ziel?: number;
  frei?: number;
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
  /**
   * Inhalt schon gehört? false = nur "Status 5 – Sprechwunsch", bis die Leitstelle das Fahrzeug anspricht.
   * Fehlt (ältere Spielstände) = bekannt.
   */
  revealed?: boolean;
}

/** Eine Zeile im Funkverkehr (Sprechfunk zwischen Leitstelle und Fahrzeugen) */
export interface FunkLine {
  id: number;
  at: number;
  from: 'leitstelle' | 'fahrzeug' | 'system';
  vehicleId?: ID;
  /** geschaltete Rufgruppe */
  group?: string;
  text: string;
  /** Text für die Sprachausgabe (Ziffern einzeln, ohne Bindestriche) */
  speech?: string;
}

export interface FunkState {
  log: FunkLine[];
  counter: number;
  /** zuletzt angesprochenes Fahrzeug – Folgesätze ohne Rufnamen gelten ihm */
  lastVehicleId?: ID;
  lastAt?: number;
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
  /** bei vorzeitigem Abschluss: offene Punkte zum Abschlusszeitpunkt */
  closedOpen?: string[];
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
  /** Mehrspieler: verbundene Spieler (zuletzt gesehen, Echtzeit ms) */
  players?: { id: string; name: string; seenAt: number; host: boolean }[];
  /** Sprechfunkverkehr (fehlt in älteren Spielständen) */
  funk?: FunkState;
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
