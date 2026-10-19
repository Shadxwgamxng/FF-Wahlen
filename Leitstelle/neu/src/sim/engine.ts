import type {
  AaoRequirement,
  Call,
  CenterConfig,
  EventKind,
  GameState,
  Incident,
  LatLng,
  Patient,
  RadioMessage,
  StatusMeaning,
  Vehicle,
  VehicleTimes,
  EinsatzMask,
  Weather,
} from '../model/types';
import { SCHEMA_VERSION } from '../model/types';
import { Rng } from './rng';
import { generateCall } from './callgen';
import { findScenario, NO_INCIDENT_KEYWORD } from '../data/scenarios';
import { catalogNeeds } from '../data/catalogs';
import { findQuestion } from '../data/questions';
import { CallerVoice, initialEmotion, personalityFor } from '../voice/style';
import { hashSeed } from '../voice/details/types';
import { hourOf, outOfServiceReason, vehicleAvailability } from './availability';
import { DIFFICULTY, HOURLY_PROFILE } from './difficulty';
import { distanceMeters, interpolate, pointInArea, travelTimeMs } from './geo';
import { cumulative, EMERGENCY_FACTOR, getRoute, requestRoute } from './routing';
import { aaoRequirements, capsOf, coverage, hospitalOptions, MEDICAL_CAPS, mergeRequirements, openRequirements, typeOf } from './dispatch';
import { SIM_START, emptyVehicleRuntime } from '../data/sampleCenter';
import { groupDeployment, groupName, isGroupStation, isGroupVehicle, turnoutFactor } from './alarmGroups';
import { emptyMask, maskAddress } from '../model/mask';
import { arrivalReport } from './lagemeldung';
import { geocode, reverseGeocode, describePlace } from '../geo/places';

/**
 * Simulations-Engine. Alle Zustandsänderungen des Spiels laufen über die hier exportierten
 * Funktionen (tick + Befehle). Sie arbeiten auf einem veränderbaren Zustand – im Store
 * werden sie innerhalb von immer.produce() aufgerufen, in Tests direkt.
 */

export type CommandResult = { ok: true; message?: string; id?: string } | { ok: false; error: string };
const ok = (message?: string, id?: string): CommandResult => ({ ok: true, message, id });
const fail = (error: string): CommandResult => ({ ok: false, error });

const MIN = 60_000;
const MAX_EVENTS = 4000;

// ---------------------------------------------------------------------------
// Aufbau
// ---------------------------------------------------------------------------

export function createGame(center: CenterConfig, startAt = SIM_START): GameState {
  const state: GameState = {
    schemaVersion: SCHEMA_VERSION,
    center,
    runtime: {
      clock: { now: startAt, running: false, speed: 1, startedAt: startAt },
      rngState: center.settings.seed >>> 0,
      weather: 'klar',
      nextWeatherChange: startAt + 3 * 3600_000,
      nextCallAt: startAt + 45_000,
      counters: { call: 0, incident: 0, event: 0, radio: 0, patient: 0 },
      calls: [],
      incidents: [],
      radio: [],
      events: [],
      archive: [],
      hospitalBeds: [],
      stats: { callsTotal: 0, callsMissed: 0, callWaitMsTotal: 0, callsAnswered: 0 },
    },
  };
  for (const v of center.vehicles) {
    const st = center.stations.find((s) => s.id === v.stationId);
    v.rt = emptyVehicleRuntime(st?.position ?? center.mapCenter, startAt);
  }
  for (const h of center.hospitals) h.occupied = 0;
  log(state, 'system', `Dienstbeginn in der ${center.name}.`);
  updateServiceStatus(state);
  return state;
}

/** Stellt sicher, dass ein neu im Editor angelegtes Fahrzeug gültige Laufzeitdaten hat */
export function ensureVehicleRuntime(state: GameState, v: Vehicle) {
  if (!v.rt) {
    const st = state.center.stations.find((s) => s.id === v.stationId);
    v.rt = emptyVehicleRuntime(st?.position ?? state.center.mapCenter, state.runtime.clock.now);
  }
}

// ---------------------------------------------------------------------------
// Hilfsfunktionen
// ---------------------------------------------------------------------------

function withRng<T>(state: GameState, fn: (rng: Rng) => T): T {
  const rng = new Rng(state.runtime.rngState);
  const r = fn(rng);
  state.runtime.rngState = rng.state;
  return r;
}

export function log(state: GameState, kind: EventKind, text: string, refs: { incidentId?: string; vehicleId?: string; callId?: string } = {}) {
  const rt = state.runtime;
  rt.counters.event++;
  rt.events.push({ id: rt.counters.event, at: rt.clock.now, kind, text, ...refs });
  if (rt.events.length > MAX_EVENTS) rt.events.splice(0, rt.events.length - MAX_EVENTS);
  if (refs.incidentId) {
    const inc = rt.incidents.find((i) => i.id === refs.incidentId);
    inc?.log.push({ at: rt.clock.now, text });
  }
}

export function statusDef(state: GameState, meaning: StatusMeaning) {
  return state.center.statusDefs.find((s) => s.meaning === meaning) ?? { meaning, code: '?', label: meaning, color: '#888' };
}

const TIME_KEY: Partial<Record<StatusMeaning, keyof VehicleTimes>> = { alarmiert: 'alarm', anfahrt: 'anfahrt', einsatzort: 'einsatzort', transport: 'transport', am_ziel: 'am_ziel' };

function setStatus(state: GameState, v: Vehicle, meaning: StatusMeaning, note?: string) {
  if (v.rt.status === meaning) return;
  v.rt.status = meaning;
  v.rt.lastStatusChange = state.runtime.clock.now;
  const tk = TIME_KEY[meaning];
  const tinc = v.rt.incidentId ? incident(state, v.rt.incidentId) : undefined;
  if (tk && tinc) (tinc.times[v.id] ??= {})[tk] = state.runtime.clock.now;
  const d = statusDef(state, meaning);
  log(state, 'status', `${v.callsign}: Status ${d.code} – ${d.label}${note ? ` (${note})` : ''}`, {
    vehicleId: v.id,
    incidentId: v.rt.incidentId ?? undefined,
  });
}

function radio(state: GameState, msg: Omit<RadioMessage, 'id' | 'at' | 'handled'>) {
  const rt = state.runtime;
  rt.counters.radio++;
  // Der Inhalt ist erst bekannt, wenn die Leitstelle das Fahrzeug anspricht (Funk oder "Ansprechen")
  const m: RadioMessage = { ...msg, id: `r_${rt.counters.radio}`, at: rt.clock.now, handled: false, revealed: false };
  rt.radio.push(m);
  const v = state.center.vehicles.find((x) => x.id === msg.vehicleId);
  log(state, msg.kind === 'nachforderung' ? 'nachforderung' : 'funk', `${v?.callsign ?? 'Funk'}: Sprechwunsch`, {
    vehicleId: msg.vehicleId,
    incidentId: msg.incidentId ?? undefined,
  });
  return m;
}

const vehicle = (state: GameState, id: string) => state.center.vehicles.find((v) => v.id === id);
/** Fahrt mit Sondersignal? (Stichwort-Eigenschaft, Standard ja) */
const incEmergency = (state: GameState, inc: Incident) => state.center.keywords.find((k) => k.id === inc.keywordId)?.emergency !== false;
/** Zeitfaktor für Versorgung/Übergabe bei Infektionsschutz */
const infectionFactor = (state: GameState, inc: Incident | undefined) => {
  const inf = inc ? state.center.keywords.find((k) => k.id === inc.keywordId)?.infection : undefined;
  return inf === 'hoch' ? 2 : inf === 'covid' ? 1.4 : 1;
};
const incident = (state: GameState, id: string) => state.runtime.incidents.find((i) => i.id === id);
const stationPos = (state: GameState, v: Vehicle): LatLng =>
  state.center.stations.find((s) => s.id === v.stationId)?.position ?? state.center.mapCenter;

function startMove(state: GameState, v: Vehicle, to: LatLng, purpose: 'einsatz' | 'transport' | 'rueckfahrt', emergency: boolean) {
  const now = state.runtime.clock.now;
  const type = typeOf(state, v);
  const from = [...v.rt.position] as LatLng;
  const route = type?.airborne ? undefined : getRoute(from, to);
  let dur: number;
  if (route) dur = route.durationS * 1000 * (emergency ? EMERGENCY_FACTOR : 1);
  else {
    dur = travelTimeMs(from, to, { speedKmh: type?.speedKmh ?? 50, detourFactor: state.center.settings.detourFactor, airborne: type?.airborne, emergency });
    if (!type?.airborne) requestRoute(from, to);
  }
  v.rt.move = {
    from,
    to: [...to] as LatLng,
    departAt: now,
    arriveAt: now + Math.max(dur, 5000),
    purpose,
    emergency,
    routed: Boolean(route) || Boolean(type?.airborne),
    ...(route ? { path: route.path, cum: cumulative(route.path) } : {}),
  };
}

/**
 * Stellt laufende Fahrten, die mit der Näherung gestartet sind, auf inzwischen geladene
 * Straßenrouten um. Der bereits gefahrene Anteil bleibt erhalten.
 */
export function applyRoutes(state: GameState): CommandResult {
  const now = state.runtime.clock.now;
  let n = 0;
  for (const v of state.center.vehicles) {
    const m = v.rt.move;
    if (!m || m.routed) continue;
    const r = getRoute(m.from, m.to);
    if (!r) continue;
    const frac = m.arriveAt > m.departAt ? Math.min(1, Math.max(0, (now - m.departAt) / (m.arriveAt - m.departAt))) : 0;
    const total = Math.max(5000, r.durationS * 1000 * (m.emergency ? EMERGENCY_FACTOR : 1));
    m.path = r.path;
    m.cum = cumulative(r.path);
    m.routed = true;
    m.departAt = now - frac * total;
    m.arriveAt = m.departAt + total;
    v.rt.position = interpolate(m, now);
    n++;
  }
  return ok(n ? `${n} Fahrt(en) auf Straßenroute umgestellt.` : undefined);
}

/** Merkt Routen vor (z. B. für Kandidaten im Einsatzmittelvorschlag), ohne den Zustand zu ändern */
export function prefetchRoutes(pairs: [LatLng, LatLng][]) {
  for (const [a, b] of pairs) if (!getRoute(a, b)) requestRoute(a, b);
}

export function capLabel(cap: string) {
  return CAP_SHORT[cap] ?? cap;
}
const CAP_SHORT: Record<string, string> = {
  fuehrung_1: 'ELW 1', fuehrung_2: 'ELW 2', fuehrung_kdo: 'KdoW', loeschen: 'Löschfahrzeug', wasser_gross: 'Tanklöschfahrzeug',
  hoehenrettung: 'Drehleiter', th: 'TH-Fahrzeug', th_schwer: 'Rüstwagen/schwere TH', atemschutz: 'GW-Atemschutz', gefahrgut: 'GW-Gefahrgut',
  logistik: 'GW-Logistik', mannschaft: 'MTF', wasserrettung: 'Wasserrettung', oel: 'Ölschadenbekämpfung', rtw: 'RTW', ktw: 'KTW',
  notarzt: 'Notarzt', intensiv: 'ITW', san_gross: 'GW-San', rd_fuehrung: 'ELRD/OrgL', rth: 'RTH', polizei: 'Streife',
  polizei_fuehrung: 'Polizeiführung', polizei_gruppe: 'Polizei-Gruppe', thw_bergung: 'THW-Bergung', thw_pumpen: 'THW-Pumpen', tier: 'GW-Tier',
};
export const reqText = (reqs: AaoRequirement[]) => reqs.map((r) => `${r.count}× ${capLabel(r.capability)}`).join(', ');

// ---------------------------------------------------------------------------
// Simulationsschritt
// ---------------------------------------------------------------------------

export function tick(state: GameState, dtMs: number) {
  if (dtMs <= 0) return;
  const rt = state.runtime;
  const prev = rt.clock.now;
  rt.clock.now += dtMs;
  updateWeather(state);
  generateCalls(state);
  handleCallTimeouts(state);
  processLocates(state);
  updateServiceStatus(state);
  randomBreakdowns(state, dtMs);
  updateVehicles(state);
  updateIncidents(state, dtMs);
  releaseHospitalBeds(state);
  accumulateStats(state, rt.clock.now - prev);
}

const WEATHER_NEXT: Record<Weather, [Weather, number][]> = {
  klar: [['klar', 3], ['bewoelkt', 3], ['hitze', 1], ['nebel', 0.5]],
  bewoelkt: [['klar', 2], ['bewoelkt', 2], ['regen', 2], ['gewitter', 0.5], ['schnee', 0.4]],
  regen: [['regen', 2], ['bewoelkt', 2], ['gewitter', 0.7]],
  gewitter: [['regen', 2], ['bewoelkt', 1]],
  schnee: [['schnee', 2], ['bewoelkt', 1]],
  hitze: [['hitze', 2], ['klar', 2], ['gewitter', 1]],
  nebel: [['bewoelkt', 2], ['klar', 1]],
};
export const WEATHER_LABEL: Record<Weather, string> = {
  klar: 'Klar', bewoelkt: 'Bewölkt', regen: 'Regen', gewitter: 'Gewitter / Sturm', schnee: 'Schnee / Glätte', hitze: 'Hitze', nebel: 'Nebel',
};

function updateWeather(state: GameState) {
  const rt = state.runtime;
  if (!state.center.settings.useWeather || rt.clock.now < rt.nextWeatherChange) return;
  withRng(state, (rng) => {
    const next = rng.weighted(WEATHER_NEXT[rt.weather], ([, w]) => w)![0];
    rt.nextWeatherChange = rt.clock.now + rng.range(2, 6) * 3600_000;
    if (next !== rt.weather) {
      rt.weather = next;
      log(state, 'system', `Wetterlage: ${WEATHER_LABEL[next]}`);
    }
  });
}

export function callRatePerMs(state: GameState, at: number): number {
  const s = state.center.settings;
  const diff = DIFFICULTY[s.difficulty];
  const tod = s.useTimeOfDay ? HOURLY_PROFILE[hourOf(at)] : 1;
  return (Math.max(0, s.callsPerHour) * diff.callRate * tod) / 3600_000;
}

function generateCalls(state: GameState) {
  const rt = state.runtime;
  let guard = 0;
  while (rt.nextCallAt <= rt.clock.now && guard++ < 50) {
    const at = rt.nextCallAt;
    withRng(state, (rng) => {
      const diff = DIFFICULTY[state.center.settings.difficulty];
      const recent = rt.incidents.filter((i) => i.scenarioId !== 'manuell' && i.state !== 'abgeschlossen' && at - i.createdAt < 15 * MIN && i.callId);
      if (recent.length > 0 && rng.chance(diff.duplicateCallChance)) {
        createDuplicateCall(state, rng, rng.pick(recent), at);
      } else {
        rt.counters.call++;
        const call = generateCall(state, rng, `c_${rt.counters.call}`, at);
        if (call) {
          rt.calls.push(call);
          rt.stats.callsTotal++;
          log(state, 'notruf', `Notruf geht ein (${call.caller.relation})`, { callId: call.id });
        }
      }
      const rate = callRatePerMs(state, at);
      rt.nextCallAt = rate > 0 ? at + Math.max(15_000, rng.exponential(rate)) : at + 3600_000;
    });
  }
}

function createDuplicateCall(state: GameState, rng: Rng, inc: Incident, at: number) {
  const rt = state.runtime;
  const orig = rt.calls.find((c) => c.id === inc.callId);
  if (!orig) return;
  rt.counters.call++;
  const diff = DIFFICULTY[state.center.settings.difficulty];
  rt.calls.push({
    ...orig,
    id: `c_${rt.counters.call}`,
    receivedAt: at,
    acceptedAt: null,
    closedAt: null,
    state: 'klingelt',
    caller: { ...orig.caller, name: rng.pick(['Kraus', 'Dietrich', 'Albrecht', 'Sauer', 'Vogt']), relation: 'weitere/-r Anrufer/-in' },
    opening: `Ich wollte melden: ${orig.opening.charAt(0).toLowerCase()}${orig.opening.slice(1)}`,
    dialog: [],
    notes: '',
    keywordId: null,
    incidentId: null,
    hangupAt: at + diff.hangupSeconds * 1000,
    redialOf: null,
    duplicateOfIncidentId: inc.id,
    facts: { ...orig.facts },
    locate: null,
    mask: emptyMask(orig.caller.phone),
  });
  rt.stats.callsTotal++;
  log(state, 'notruf', 'Notruf geht ein (weiterer Anrufer)', { callId: `c_${rt.counters.call}` });
}

function handleCallTimeouts(state: GameState) {
  const rt = state.runtime;
  for (const c of rt.calls) {
    if (c.state !== 'klingelt' || c.receivedAt > rt.clock.now || rt.clock.now < c.hangupAt) continue;
    c.state = 'aufgelegt';
    c.closedAt = rt.clock.now;
    rt.stats.callsMissed++;
    log(state, 'warnung', `Anrufer hat nach ${Math.round((c.hangupAt - c.receivedAt) / 1000)} s aufgelegt – Notruf nicht angenommen!`, { callId: c.id });
    // Echte Notfälle: Anrufer versucht es einmal erneut
    if (!c.redialOf && !c.duplicateOfIncidentId && c.scenarioId !== 'son_fehlanruf') {
      withRng(state, (rng) => {
        rt.counters.call++;
        const diff = DIFFICULTY[state.center.settings.difficulty];
        const at = rt.clock.now + rng.range(45, 120) * 1000;
        rt.calls.push({
          ...c,
          id: `c_${rt.counters.call}`,
          receivedAt: at,
          closedAt: null,
          state: 'klingelt',
          opening: `(Ruft erneut an) Warum geht denn keiner ran?! ${c.opening}`,
          hangupAt: at + diff.hangupSeconds * 1000,
          redialOf: c.id,
          facts: { ...c.facts },
          dialog: [],
          locate: null,
          mask: emptyMask(c.caller.phone),
        });
        rt.stats.callsTotal++;
      });
    }
  }
}

/** Planmäßige Außerdienststellung (Dienstzeiten, Wartung, Defekt) und Rückkehr in den Dienst */
function updateServiceStatus(state: GameState) {
  const now = state.runtime.clock.now;
  for (const v of state.center.vehicles) {
    if (v.rt.incidentId) continue;
    const reason = outOfServiceReason(v, now);
    if (reason && v.rt.status === 'frei_wache') {
      setStatus(state, v, 'ausser_dienst', reason);
    } else if (!reason && v.rt.status === 'ausser_dienst' && !v.rt.move && v.rt.breakdownUntil !== -1) {
      v.rt.breakdownUntil = null;
      setStatus(state, v, 'frei_wache', 'wieder einsatzbereit');
    }
  }
}

function randomBreakdowns(state: GameState, dtMs: number) {
  if (!state.center.settings.randomBreakdowns) return;
  const diff = DIFFICULTY[state.center.settings.difficulty];
  // ≈ 1 Ausfall je Fahrzeug alle ~40 Tage (normal)
  const p = (dtMs / 3600_000) * 0.001 * diff.breakdown;
  withRng(state, (rng) => {
    for (const v of state.center.vehicles) {
      if (v.rt.status !== 'frei_wache' || v.external) continue;
      if (rng.chance(p)) {
        v.rt.breakdownUntil = state.runtime.clock.now + rng.range(1, 5) * 3600_000;
        setStatus(state, v, 'ausser_dienst', 'Technischer Defekt');
        log(state, 'warnung', `${v.callsign} meldet technischen Defekt – voraussichtlich bis ${fmtTime(v.rt.breakdownUntil)} nicht einsatzbereit.`, { vehicleId: v.id });
      }
    }
  });
}

export const fmtTime = (t: number) =>
  new Date(t).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

function updateVehicles(state: GameState) {
  const now = state.runtime.clock.now;
  for (const v of state.center.vehicles) {
    // Ausrücken beendet -> Anfahrt
    if (v.rt.status === 'alarmiert' && v.rt.phaseUntil !== null && now >= v.rt.phaseUntil) {
      v.rt.phaseUntil = null;
      const inc = v.rt.incidentId ? incident(state, v.rt.incidentId) : undefined;
      if (inc) {
        startMove(state, v, inc.position, 'einsatz', incEmergency(state, inc));
        setStatus(state, v, 'anfahrt');
        reportGroupTurnout(state, v, inc);
      }
    }
    if (v.rt.move) {
      v.rt.position = interpolate(v.rt.move, now);
      if (now >= v.rt.move.arriveAt) arrive(state, v);
    }
    // Übergabe im Krankenhaus beendet
    if (v.rt.status === 'am_ziel' && v.rt.phaseUntil !== null && now >= v.rt.phaseUntil) {
      v.rt.phaseUntil = null;
      finishHandover(state, v);
    }
  }
}

function arrive(state: GameState, v: Vehicle) {
  const m = v.rt.move!;
  v.rt.position = [...m.to] as LatLng;
  v.rt.move = null;
  const now = state.runtime.clock.now;
  if (m.purpose === 'einsatz') {
    const inc = v.rt.incidentId ? incident(state, v.rt.incidentId) : undefined;
    setStatus(state, v, 'einsatzort');
    if (inc && !locationCorrect(inc)) {
      if (!inc.locationWrongReported) {
        inc.locationWrongReported = true;
        radio(state, { vehicleId: v.id, incidentId: inc.id, kind: 'lage', text: `An der Adresse ${inc.address} ist keine Einsatzstelle feststellbar – erbitten Überprüfung der Adresse.` });
      }
    } else if (inc) {
      if (!inc.firstArrivalAt) {
        inc.firstArrivalAt = now;
        inc.lastNeedCheckAt = now;
        if (inc.state === 'disponiert' || inc.state === 'neu') inc.state = 'vor_ort';
        log(state, 'einsatz', `Erstes Fahrzeug an der Einsatzstelle ${inc.address}.`, { incidentId: inc.id });
        if (inc.escalation && !inc.escalation.triggered) inc.escalation.at = now + (inc.escalation.at - inc.createdAt);
        // Erste Lagemeldung: das erste Fahrzeug drückt Status 5 und meldet nach dem Ansprechen die Lage
        const bound = state.center.vehicles.filter((x) => inc.activeVehicleIds.includes(x.id));
        const missing = openRequirements(state, nonMedical(inc.needs), bound).length > 0;
        v.rt.statusBeforeSpeak = 'einsatzort';
        setStatus(state, v, 'sprechwunsch');
        radio(state, { vehicleId: v.id, incidentId: inc.id, kind: 'lage', text: arrivalReport(state, inc, missing) });
      }
      if (inc.state === 'abarbeitung_beendet') {
        radio(state, { vehicleId: v.id, incidentId: inc.id, kind: 'lage', text: 'Eingetroffen, Einsatzstelle bereits abgearbeitet – erbitten Entlassung.' });
      }
    }
  } else if (m.purpose === 'transport') {
    setStatus(state, v, 'am_ziel');
    const tinc = v.rt.incidentId ? incident(state, v.rt.incidentId) : undefined;
    withRng(state, (rng) => (v.rt.phaseUntil = now + rng.range(8, 15) * MIN * infectionFactor(state, tinc)));
  } else {
    // Rückfahrt beendet
    const reason = outOfServiceReason(v, now);
    setStatus(state, v, reason ? 'ausser_dienst' : 'frei_wache', reason ?? undefined);
  }
}

function finishHandover(state: GameState, v: Vehicle) {
  const now = state.runtime.clock.now;
  const inc = v.rt.incidentId ? incident(state, v.rt.incidentId) : undefined;
  const pat = inc?.patients.find((p) => p.id === v.rt.patientId);
  if (pat && inc) {
    pat.state = 'uebergeben';
    const h = state.center.hospitals.find((x) => x.id === pat.hospitalId);
    if (h) {
      h.occupied++;
      withRng(state, (rng) => state.runtime.hospitalBeds.push({ hospitalId: h.id, until: now + rng.range(2, 8) * 3600_000 }));
      log(state, 'einsatz', `Patient ${pat.label} an ${h.name} übergeben.`, { incidentId: inc.id, vehicleId: v.id });
    }
  }
  detachFromIncident(state, v);
  v.rt.patientId = null;
  v.rt.targetHospitalId = null;
  setStatus(state, v, 'frei_funk');
  startMove(state, v, stationPos(state, v), 'rueckfahrt', false);
}

function detachFromIncident(state: GameState, v: Vehicle) {
  const inc = v.rt.incidentId ? incident(state, v.rt.incidentId) : undefined;
  if (inc) {
    inc.activeVehicleIds = inc.activeVehicleIds.filter((id) => id !== v.id);
    (inc.times[v.id] ??= {}).frei = state.runtime.clock.now;
  }
  v.rt.incidentId = null;
}

function releaseHospitalBeds(state: GameState) {
  const rt = state.runtime;
  const due = rt.hospitalBeds.filter((b) => b.until <= rt.clock.now);
  if (due.length === 0) return;
  rt.hospitalBeds = rt.hospitalBeds.filter((b) => b.until > rt.clock.now);
  for (const b of due) {
    const h = state.center.hospitals.find((x) => x.id === b.hospitalId);
    if (h) h.occupied = Math.max(0, h.occupied - 1);
  }
}

function accumulateStats(state: GameState, dt: number) {
  for (const v of state.center.vehicles) {
    const s = v.rt.status;
    if (s === 'frei_wache' || s === 'frei_funk') v.rt.statMs.available += dt;
    else if (s === 'ausser_dienst') v.rt.statMs.outOfService += dt;
    else v.rt.statMs.busy += dt;
  }
}

// ---------------------------------------------------------------------------
// Einsatzablauf
// ---------------------------------------------------------------------------

/** Liegt die eingegebene Adresse nah genug am tatsächlichen Geschehen? */
export const locationCorrect = (inc: Incident) => distanceMeters(inc.position, inc.truePosition) <= WRONG_LOCATION_M;
const WRONG_LOCATION_M = 250;

const onScene = (state: GameState, inc: Incident) =>
  !locationCorrect(inc)
    ? []
    : state.center.vehicles.filter((v) => v.rt.incidentId === inc.id && (v.rt.status === 'einsatzort' || (v.rt.status === 'sprechwunsch' && v.rt.statusBeforeSpeak === 'einsatzort')));

const nonMedical = (reqs: AaoRequirement[]) => reqs.filter((r) => !MEDICAL_CAPS.has(r.capability) && r.capability !== 'rd_fuehrung');

function updateIncidents(state: GameState, dtMs: number) {
  const now = state.runtime.clock.now;
  for (const inc of state.runtime.incidents) {
    if (inc.state === 'abgeschlossen' || inc.state === 'neu' || inc.state === 'disponiert') continue;
    const present = onScene(state, inc);

    // Lageentwicklung
    if (inc.escalation && !inc.escalation.triggered && inc.firstArrivalAt && now >= inc.escalation.at) {
      inc.escalation.triggered = true;
      inc.needs = mergeRequirements(inc.needs, inc.escalation.requirements);
      inc.workTotalMs = Math.round(inc.workTotalMs * 1.3);
      const extra = inc.escalation.extraPatients;
      withRng(state, (rng) => {
        for (let i = 0; i < extra; i++) inc.patients.push(newPatient(state, rng, inc.scenarioId, inc.patients.length + 1));
      });
      const reporter = present[0] ?? state.center.vehicles.find((v) => v.rt.incidentId === inc.id);
      if (reporter) {
        addBackupRequest(state, inc, reporter, inc.escalation.requirements, `Lageänderung: ${inc.escalation.text}`);
      }
    }

    if (inc.state === 'vor_ort') {
      // Arbeit an der Einsatzstelle
      const reqs = nonMedical(inc.needs);
      handlePatients(state, inc, present);
      const patientsDone = inc.patients.every((p) => p.state !== 'wartet' && p.state !== 'versorgt');
      if (reqs.length === 0 && inc.patients.length > 0) {
        // Rein medizinischer Einsatz: Maßnahmen = Patientenversorgung
        if (patientsDone) inc.workDoneMs = inc.workTotalMs;
      } else if (present.length > 0) {
        const cov = reqs.length === 0 ? 1 : coverage(state, reqs, present);
        inc.workDoneMs = Math.min(inc.workTotalMs, inc.workDoneMs + dtMs * Math.pow(cov, 1.5));
      }
      checkMissingForces(state, inc, present);
      const onlyTransports = inc.activeVehicleIds.every((id) => {
        const s = vehicle(state, id)?.rt.status;
        return s === 'transport' || s === 'am_ziel';
      });
      if (inc.workDoneMs >= inc.workTotalMs && patientsDone && (present.length > 0 || onlyTransports)) {
        inc.state = 'abarbeitung_beendet';
        inc.workDoneAt = now;
        log(state, 'einsatz', `Einsatzmaßnahmen an der Einsatzstelle beendet.`, { incidentId: inc.id });
        if (present.length > 0) {
          if (state.center.settings.autoRelease) {
            for (const v of present) releaseVehicleInternal(state, v, 'automatisch entlassen');
          } else {
            radio(state, { vehicleId: present[0].id, incidentId: inc.id, kind: 'lage', text: 'Einsatzstelle abgearbeitet, Kräfte können entlassen werden.' });
          }
        }
      }
    }
    if (inc.state === 'abarbeitung_beendet' && state.center.settings.autoRelease && inc.activeVehicleIds.length === 0) {
      closeIncident(state, inc.id);
    }
  }
}

function handlePatients(state: GameState, inc: Incident, present: Vehicle[]) {
  const now = state.runtime.clock.now;
  // auch während eines Sprechwunschs (Status 5) vor Ort wird der Patient weiter versorgt
  const transporters = present.filter((v) => typeOf(state, v)?.canTransport);
  const doctorPresent = present.some((v) => capsOf(state, v).includes('notarzt'));
  // Fahrzeuge Patienten zuweisen
  for (const v of transporters) {
    if (v.rt.patientId) continue;
    const p = inc.patients.find((x) => x.state === 'wartet' && !x.vehicleId);
    if (!p) break;
    p.vehicleId = v.id;
    v.rt.patientId = p.id;
    withRng(state, (rng) => (p.readyAt = now + rng.range(8, 18) * MIN * DIFFICULTY[state.center.settings.difficulty].workTime * infectionFactor(state, inc)));
  }
  for (const p of inc.patients) {
    if (p.state !== 'wartet' || !p.vehicleId || p.readyAt === null || now < p.readyAt) continue;
    if (p.needsDoctor && !doctorPresent) continue; // wartet auf Notarzt
    const v = vehicle(state, p.vehicleId);
    if (!v) continue;
    if (p.department === '-') {
      p.state = 'kein_transport';
    }
    const noTransport = p.state === 'kein_transport';
    if (noTransport) {
      v.rt.patientId = null;
      log(state, 'einsatz', `${p.label}: ambulant versorgt, kein Transport erforderlich.`, { incidentId: inc.id, vehicleId: v.id });
      continue;
    }
    p.state = 'versorgt';
    if (state.center.settings.autoHospital) {
      const best = hospitalOptions(state, p, v.rt.position)[0];
      if (best) startTransport(state, v, p, best.hospital.id);
    } else {
      v.rt.statusBeforeSpeak = 'einsatzort';
      setStatus(state, v, 'sprechwunsch');
      radio(state, {
        vehicleId: v.id,
        incidentId: inc.id,
        kind: 'transportziel',
        text: `Patient ${p.label} transportbereit${p.needsDoctor ? ' (mit Notarztbegleitung)' : ''}, Fachrichtung ${p.department} – erbitten Transportziel.`,
        patientId: p.id,
      });
    }
  }
}

function startTransport(state: GameState, v: Vehicle, p: Patient, hospitalId: string) {
  const h = state.center.hospitals.find((x) => x.id === hospitalId)!;
  p.state = 'transport';
  p.hospitalId = h.id;
  v.rt.targetHospitalId = h.id;
  v.rt.statusBeforeSpeak = undefined;
  startMove(state, v, h.position, 'transport', p.needsDoctor);
  setStatus(state, v, 'transport', `nach ${h.name}`);
}

/** Kräfte vor Ort prüfen Bedarf und fordern ggf. nach (spätestens alle 5 min) */
function checkMissingForces(state: GameState, inc: Incident, present: Vehicle[]) {
  const now = state.runtime.clock.now;
  if (present.length === 0 || !inc.firstArrivalAt || now - inc.firstArrivalAt < 3 * MIN) return;
  if (inc.lastNeedCheckAt && now - inc.lastNeedCheckAt < 5 * MIN) return;
  inc.lastNeedCheckAt = now;
  if (state.runtime.radio.some((r) => r.incidentId === inc.id && r.kind === 'nachforderung' && !r.handled)) return;
  const bound = state.center.vehicles.filter((v) => inc.activeVehicleIds.includes(v.id));
  const missing = openRequirements(state, nonMedical(inc.needs), bound);
  // Medizinischer Bedarf aus den Patienten
  const waiting = inc.patients.filter((p) => p.state === 'wartet' && !p.vehicleId).length;
  const freeTransporters = bound.filter((v) => typeOf(state, v)?.canTransport && !v.rt.patientId).length;
  if (waiting > freeTransporters) missing.push({ capability: 'rtw', count: waiting - freeTransporters });
  const needDoc = inc.patients.some((p) => p.needsDoctor && (p.state === 'wartet' || p.state === 'versorgt'));
  if (needDoc && !bound.some((v) => capsOf(state, v).includes('notarzt'))) missing.push({ capability: 'notarzt', count: 1 });
  // Bereits angeforderte, aber noch nicht alarmierte Kräfte nicht erneut nachfordern
  const outstanding = new Map(openRequirements(state, aaoRequirements(state, inc), bound).map((r) => [r.capability, r.count]));
  const fresh = missing
    .map((r) => ({ capability: r.capability, count: r.count - (outstanding.get(r.capability) ?? 0) }))
    .filter((r) => r.count > 0);
  if (fresh.length === 0) return;
  addBackupRequest(state, inc, present[0], fresh, `Nachforderung: ${reqText(fresh)}`);
}

function addBackupRequest(state: GameState, inc: Incident, v: Vehicle, reqs: AaoRequirement[], text: string) {
  inc.backupRequests.push({ at: state.runtime.clock.now, text, requirements: reqs.map((r) => ({ ...r })) });
  if (v.rt.status === 'einsatzort') {
    v.rt.statusBeforeSpeak = 'einsatzort';
    setStatus(state, v, 'sprechwunsch');
  }
  radio(state, { vehicleId: v.id, incidentId: inc.id, kind: 'nachforderung', text, requirements: reqs });
}

function newPatient(state: GameState, rng: Rng, scenarioId: string, n: number): Patient {
  const sc = findScenario(scenarioId);
  const spec = sc?.patients;
  state.runtime.counters.patient++;
  const noTransport = rng.chance(spec?.noTransportProb ?? 0);
  return {
    id: `pat_${state.runtime.counters.patient}`,
    label: `P${n}`,
    needsDoctor: rng.chance(spec?.doctorProb ?? 0.2),
    department: noTransport ? '-' : rng.pick(spec?.departments ?? ['allgemein']),
    state: 'wartet',
    vehicleId: null,
    hospitalId: null,
    readyAt: null,
  };
}

// ---------------------------------------------------------------------------
// Befehle: Notrufannahme
// ---------------------------------------------------------------------------

export function acceptCall(state: GameState, callId: string): CommandResult {
  const c = state.runtime.calls.find((x) => x.id === callId);
  if (!c) return fail('Notruf nicht gefunden.');
  if (c.receivedAt > state.runtime.clock.now) return fail('Notruf ist noch nicht eingegangen.');
  if (c.state !== 'klingelt') return fail('Notruf wurde bereits angenommen oder beendet.');
  c.state = 'in_abfrage';
  c.acceptedAt = state.runtime.clock.now;
  state.runtime.stats.callsAnswered++;
  state.runtime.stats.callWaitMsTotal += c.acceptedAt - c.receivedAt;
  log(state, 'notruf', `Notruf angenommen nach ${Math.round((c.acceptedAt - c.receivedAt) / 1000)} s.`, { callId });
  return ok();
}

/** Bereits gestellte Abfragefragen eines Notrufs (geklickt oder im Freisprechen gesagt) */
export function askedQuestions(c: Pick<Call, 'dialog'>): Set<string> {
  return new Set(c.dialog.flatMap((d) => [d.questionId, ...(d.covers ?? [])]));
}

export function askQuestion(state: GameState, callId: string, questionId: string): CommandResult {
  const c = state.runtime.calls.find((x) => x.id === callId);
  if (!c || c.state !== 'in_abfrage') return fail('Kein Notruf in Abfrage.');
  if (askedQuestions(c).has(questionId)) return fail('Frage wurde bereits gestellt.');
  const q = findQuestion(c.category, questionId);
  if (!q) return fail('Unbekannte Frage.');
  // natürliche Sprechweise: Persönlichkeit je Anrufer, Formulierung je Frage (deterministisch)
  const personality = personalityFor(`${c.id}|${c.scenarioId}`, c.facts);
  const voice = new CallerVoice(personality, hashSeed(`${c.id}|${questionId}`));
  const answer = voice.naturalize(q.answer(c.facts, voice.pick), initialEmotion(c.facts, personality), questionId === 'ort');
  c.dialog.push({ questionId, question: q.text, answer, askedAt: state.runtime.clock.now });
  return ok();
}

/**
 * Freisprechen: ein gesprochener Wortwechsel mit dem (simulierten) Anrufer.
 * questionIds: erkannte Abfragefragen; facts: vom Anrufer neu festgelegte Detailangaben (nur x_…, nie überschreiben).
 */
export function voiceTurn(state: GameState, callId: string, said: string, reply: string, questionIds: string[], facts: Record<string, string | number | boolean> = {}): CommandResult {
  const c = state.runtime.calls.find((x) => x.id === callId);
  if (!c || c.state !== 'in_abfrage') return fail('Kein Notruf in Abfrage.');
  if (!said.trim()) return fail('Nichts gesprochen.');
  const n = c.dialog.filter((d) => d.questionId.startsWith('sprache_')).length + 1;
  c.dialog.push({ questionId: `sprache_${n}`, question: said.trim(), answer: reply, askedAt: state.runtime.clock.now, covers: questionIds.filter(Boolean) });
  for (const [k, v] of Object.entries(facts)) if (k.startsWith('x_') && c.facts[k] === undefined) c.facts[k] = v;
  return ok();
}

export function updateCallNotes(state: GameState, callId: string, notes: string): CommandResult {
  const c = state.runtime.calls.find((x) => x.id === callId);
  if (!c) return fail('Notruf nicht gefunden.');
  c.notes = notes;
  return ok();
}

/** Meldebild wählen – übernimmt das vorgeschlagene Stichwort (der Disponent kann es danach ändern) */
export function setCallMeldebild(state: GameState, callId: string, meldebildId: string | null): CommandResult {
  const c = state.runtime.calls.find((x) => x.id === callId);
  if (!c || c.state !== 'in_abfrage') return fail('Kein Notruf in Abfrage.');
  if (!meldebildId) {
    c.meldebildId = null;
    return ok();
  }
  const mb = state.center.meldebilder.find((m) => m.id === meldebildId);
  if (!mb) return fail('Unbekanntes Meldebild.');
  c.meldebildId = mb.id;
  const kw = mb.keywordCode ? state.center.keywords.find((k) => k.code === mb.keywordCode) : undefined;
  if (kw) c.keywordId = kw.id;
  return ok();
}

/** Fortschritt der Notrufabfrage (DIAS) speichern – damit Tablet und Einsatzmaske denselben Stand zeigen */
export function setCallDias(state: GameState, callId: string, steps: { nodeId: string; option: number }[], completion?: { input?: string; answers: Record<string, string> } | null): CommandResult {
  const c = state.runtime.calls.find((x) => x.id === callId);
  if (!c || c.state !== 'in_abfrage') return fail('Kein Notruf in Abfrage.');
  if (!Array.isArray(steps) || steps.length > 300 || steps.some((s) => !s || typeof s.nodeId !== 'string' || !Number.isInteger(s.option) || s.option < 0))
    return fail('Ungültiger Abfrageverlauf.');
  let comp: { input?: string; answers: Record<string, string> } | undefined;
  if (completion) {
    const answers: Record<string, string> = {};
    for (const [k, v] of Object.entries(completion.answers ?? {}).slice(0, 50)) if (typeof v === 'string') answers[String(k).slice(0, 40)] = v.slice(0, 40);
    comp = { answers, ...(typeof completion.input === 'string' ? { input: completion.input.slice(0, 2000) } : {}) };
  }
  c.dias = { steps: steps.map((s) => ({ nodeId: s.nodeId, option: s.option })), ...(comp ? { completion: comp } : {}) };
  return ok();
}

/**
 * Ergebnis der Notrufabfrage in die Maske übernehmen: Stichwort, Meldebild als Alarmierungstext,
 * Abfrageweg und Info-Bausteine als Hinweise (ergänzt, nicht überschrieben; doppelte Zeilen werden nicht wiederholt).
 */
export function applyDiasResult(state: GameState, callId: string, r: { keywordId: string | null; info: string; remarks: string[] }): CommandResult {
  const c = state.runtime.calls.find((x) => x.id === callId);
  if (!c || c.state !== 'in_abfrage') return fail('Kein Notruf in Abfrage.');
  if (r.keywordId) {
    if (!state.center.keywords.some((k) => k.id === r.keywordId)) return fail('Unbekanntes Stichwort.');
    c.keywordId = r.keywordId;
  }
  const lines = c.mask.remarks.split('\n').filter((l) => l.trim());
  for (const l of r.remarks) if (l.trim() && !lines.includes(l.trim())) lines.push(l.trim());
  c.mask = { ...c.mask, info: String(r.info ?? '').slice(0, 500) || c.mask.info, remarks: lines.join('\n') };
  return ok('Abfrageergebnis übernommen.');
}

export function setCallKeyword(state: GameState, callId: string, keywordId: string | null): CommandResult {
  const c = state.runtime.calls.find((x) => x.id === callId);
  if (!c || c.state !== 'in_abfrage') return fail('Kein Notruf in Abfrage.');
  if (keywordId && !state.center.keywords.some((k) => k.id === keywordId)) return fail('Unbekanntes Stichwort.');
  c.keywordId = keywordId;
  return ok();
}

/** Abfragehilfe: schlägt das Stichwort vor, sobald die Schlüsselfragen gestellt wurden (nur leicht/normal) */
export function keywordHint(state: GameState, callId: string): { keywordId: string | null; noIncident: boolean; meldebildId: string | null } | null {
  const c = state.runtime.calls.find((x) => x.id === callId);
  if (!c || !DIFFICULTY[state.center.settings.difficulty].keywordHint) return null;
  const sc = findScenario(c.scenarioId);
  if (!sc) return null;
  const asked = askedQuestions(c);
  if (!sc.keyQuestions.every((q) => asked.has(q))) return null;
  const code = truthKeywordCode(c.scenarioId, c.variantIdx, state.center.catalogId);
  const mb = truthMeldebild(c.scenarioId, c.variantIdx, state.center.catalogId);
  const meldebildId = mb ? (state.center.meldebilder.find((m) => m.label === mb)?.id ?? null) : null;
  if (code === NO_INCIDENT_KEYWORD) return { keywordId: null, noIncident: true, meldebildId };
  return { keywordId: state.center.keywords.find((k) => k.code === code)?.id ?? null, noIncident: false, meldebildId };
}

/** Richtiges Stichwort eines Szenarios im Katalog der Leitstelle */
export function truthKeywordCode(scenarioId: string, variantIdx: number, catalogId = 'standard'): string {
  const sc = findScenario(scenarioId);
  if (!sc) return '';
  const v = variantIdx >= 0 ? sc.variants?.[variantIdx] : undefined;
  if (catalogId === 'sh') return v?.sh?.keyword ?? sc.sh?.keyword ?? (sc.catalogs?.includes('sh') ? (v?.keyword ?? sc.keyword) : '');
  return v?.keyword ?? sc.keyword;
}

/** Passendes Meldebild (Bezeichnung) eines Szenarios – nur im zweistufigen SH-Katalog */
export function truthMeldebild(scenarioId: string, variantIdx: number, catalogId = 'standard'): string | null {
  if (catalogId !== 'sh') return null;
  const sc = findScenario(scenarioId);
  const v = variantIdx >= 0 ? sc?.variants?.[variantIdx] : undefined;
  return v?.sh?.meldebild ?? sc?.sh?.meldebild ?? null;
}

/**
 * Ermittelt die Position zur in der Einsatzmaske eingegebenen Adresse.
 * Reihenfolge: übernommene Ortung → Geokodierung über die OSM-Adressen → (ohne OSM-Daten) Abgleich
 * mit dem Straßennamen des Anrufs. Eine falsch eingegebene Adresse führt zu einer falschen Position.
 */
export function resolveMaskLocation(state: GameState, mask: EinsatzMask, truth?: { street?: string; position: LatLng }): { position: LatLng; address: string; exact: boolean } | { error: string } {
  if (!mask.street.trim()) return { error: 'Bitte die Straße des Einsatzorts eingeben (oder den Anrufer orten).' };
  const address = maskAddress(mask);
  if (mask.position) return { position: mask.position, address, exact: true };
  const ix = state.center.places;
  if (ix && ix.places.length) {
    const g = geocode(ix, mask.street, mask.houseNumber, mask.city);
    if (!g) return { error: `Adresse „${address}“ nicht gefunden – Schreibweise prüfen, Ort ergänzen oder den Anrufer orten.` };
    return { position: g.position, address, exact: g.exact };
  }
  const norm = (x: string) => x.toLowerCase().replace(/[^a-zäöüß0-9]/g, '');
  if (truth?.street && norm(truth.street) === norm(mask.street)) return { position: truth.position, address, exact: true };
  return { error: 'Ohne Kartendaten kann die Adresse nicht geprüft werden – bitte den Anrufer orten.' };
}

export function updateCallMask(state: GameState, callId: string, patch: Partial<EinsatzMask>): CommandResult {
  const c = state.runtime.calls.find((x) => x.id === callId);
  if (!c) return fail('Notruf nicht gefunden.');
  // Wird die Adresse von Hand geändert, gilt eine übernommene Ortungsposition nicht mehr
  const addrChanged = ['street', 'houseNumber', 'postcode', 'city'].some((k) => k in patch && !('position' in patch));
  c.mask = { ...c.mask, ...patch, ...(addrChanged ? { position: null } : {}) };
  return ok();
}

/** Startet die Ortung des Anrufers (Festnetz: genaue Adresse, Mobilfunk: Standort mit Ungenauigkeit) */
export function startLocating(state: GameState, callId: string): CommandResult {
  const c = state.runtime.calls.find((x) => x.id === callId);
  if (!c || c.state !== 'in_abfrage') return fail('Kein Notruf in Abfrage.');
  if (c.locate?.status === 'laeuft') return fail('Ortung läuft bereits.');
  const now = state.runtime.clock.now;
  const dur = withRng(state, (rng) => (c.phoneType === 'festnetz' ? rng.range(4, 7) : rng.range(10, 25)) * 1000);
  c.locate = { startedAt: now, readyAt: now + dur, status: 'laeuft' };
  log(state, 'notruf', `Ortung gestartet (${c.phoneType === 'festnetz' ? 'Festnetz' : 'Mobilfunk'})`, { callId });
  return ok();
}

function processLocates(state: GameState) {
  const now = state.runtime.clock.now;
  for (const c of state.runtime.calls) {
    const l = c.locate;
    if (!l || l.status !== 'laeuft' || now < l.readyAt) continue;
    withRng(state, (rng) => {
      const loc = c.location;
      if (c.phoneType === 'festnetz') {
        // Anschlussadresse – stimmt nur, wenn der Anrufer von zu Hause aus anruft
        const atHome = loc.houseNumber && !/Wald|Ufer|Fahrbahn|Schnellstraße/.test(loc.detail);
        if (atHome) {
          Object.assign(l, { status: 'ok', position: loc.position, accuracyM: 0, street: loc.street, houseNumber: loc.houseNumber, postcode: loc.postcode, city: loc.city, message: 'Anschlussadresse ermittelt.' });
        } else {
          Object.assign(l, { status: 'fehler', message: 'Festnetzanschluss ohne verwertbare Adresse für diesen Einsatzort – bitte Adresse erfragen.' });
        }
        return;
      }
      if (rng.chance(0.1)) {
        Object.assign(l, { status: 'fehler', message: 'Ortung fehlgeschlagen (kein Standort vom Netz übermittelt).' });
        return;
      }
      const acc = Math.round(rng.range(15, 500));
      const ang = rng.range(0, Math.PI * 2);
      const d = rng.range(0, acc * 0.7);
      const pos: LatLng = [loc.position[0] + (Math.cos(ang) * d) / 111_320, loc.position[1] + (Math.sin(ang) * d) / (111_320 * Math.cos((loc.position[0] * Math.PI) / 180))];
      const ix = state.center.places;
      const near = ix ? reverseGeocode(ix, pos) : null;
      const parts = near && ix ? describePlace(ix, near.tuple) : null;
      Object.assign(l, {
        status: 'ok',
        position: pos,
        accuracyM: acc,
        street: parts?.street ?? '',
        houseNumber: parts?.houseNumber ?? '',
        postcode: parts?.postcode ?? '',
        city: parts?.city ?? '',
        message: `Mobilfunkortung: Standort mit ±${acc} m Genauigkeit${parts ? `, nächste Adresse ${parts.street} ${parts.houseNumber}` : ''}.`,
      });
    });
    log(state, 'notruf', `Ortung abgeschlossen: ${l.message}`, { callId: c.id });
  }
}

/** Übernimmt das Ortungsergebnis in die Einsatzmaske */
export function applyLocate(state: GameState, callId: string): CommandResult {
  const c = state.runtime.calls.find((x) => x.id === callId);
  const l = c?.locate;
  if (!c || !l || l.status !== 'ok' || !l.position) return fail('Kein Ortungsergebnis vorhanden.');
  c.mask = { ...c.mask, street: l.street ?? '', houseNumber: l.houseNumber ?? '', postcode: l.postcode ?? '', city: l.city ?? '', position: l.position };
  return ok('Ortung in die Einsatzmaske übernommen.');
}

/** Korrigiert die Adresse eines Einsatzes; gebundene Kräfte fahren den neuen Ort an */
export function correctIncidentLocation(state: GameState, incidentId: string, patch: Pick<EinsatzMask, 'street' | 'houseNumber' | 'postcode' | 'city'> & { position?: LatLng | null }): CommandResult {
  const inc = incident(state, incidentId);
  if (!inc || inc.state === 'abgeschlossen') return fail('Einsatz nicht gefunden.');
  const mask = { ...(inc.mask ?? emptyMask()), ...patch, position: patch.position ?? null };
  const r = resolveMaskLocation(state, mask);
  if ('error' in r) return fail(r.error);
  inc.position = r.position;
  inc.address = r.address;
  inc.mask = mask;
  inc.areaId = state.center.areas.find((a) => pointInArea(r.position, a))?.id ?? null;
  inc.locationWrongReported = false;
  for (const v of state.center.vehicles) {
    if (v.rt.incidentId !== inc.id || v.rt.status === 'transport' || v.rt.status === 'am_ziel' || v.rt.status === 'alarmiert') continue;
    startMove(state, v, inc.position, 'einsatz', incEmergency(state, inc));
    setStatus(state, v, 'anfahrt', 'neue Adresse');
  }
  log(state, 'einsatz', `Einsatzadresse korrigiert: ${r.address}`, { incidentId });
  return ok('Adresse korrigiert – Kräfte fahren den neuen Einsatzort an.');
}

export function createIncidentFromCall(state: GameState, callId: string, mask?: EinsatzMask): CommandResult {
  const rt = state.runtime;
  const c = rt.calls.find((x) => x.id === callId);
  if (!c || c.state !== 'in_abfrage') return fail('Kein Notruf in Abfrage.');
  const selected = c.keywordId ? state.center.keywords.find((k) => k.id === c.keywordId) : undefined;
  if (selected?.forward) return forwardCall(state, c.id, selected.id);
  // Ohne Einsatzmaske (Tests, automatischer Spieler): Ort muss abgefragt sein und wird übernommen
  let loc: { position: LatLng; address: string } = { position: c.location.position, address: c.location.address };
  if (mask) {
    const r = resolveMaskLocation(state, mask, { street: c.location.street, position: c.location.position });
    if ('error' in r) return fail(r.error);
    loc = r;
  } else if (!askedQuestions(c).has('ort')) return fail('Der Einsatzort wurde noch nicht abgefragt.');
  if (!c.keywordId) return fail('Bitte zuerst ein Einsatzstichwort wählen.');
  const kw = state.center.keywords.find((k) => k.id === c.keywordId);
  if (!kw) return fail('Unbekanntes Stichwort.');
  const sc = findScenario(c.scenarioId);
  const variant = sc && c.variantIdx >= 0 ? sc.variants?.[c.variantIdx] : undefined;
  const truthCode = truthKeywordCode(c.scenarioId, c.variantIdx, state.center.catalogId);
  const diff = DIFFICULTY[state.center.settings.difficulty];

  rt.counters.incident++;
  const id = `i_${rt.counters.incident}`;
  const inc = withRng(state, (rng): Incident => {
    const work = variant?.workMin ?? sc?.workMin ?? [20, 40];
    const pSpec = variant?.patients === null ? undefined : (variant?.patients ?? sc?.patients);
    let pCount = 0;
    if (pSpec) {
      if (typeof pSpec.count === 'string') {
        const v = c.facts[pSpec.count];
        pCount = typeof v === 'number' ? v : 0;
      } else pCount = rng.int(pSpec.count[0], pSpec.count[1]);
    }
    if (kw.exercise) pCount = 0;
    const esc = kw.exercise || variant?.escalation === null ? undefined : (variant?.escalation ?? sc?.escalation);
    const escalate = esc && rng.chance(Math.min(0.95, esc.prob * diff.escalation));
    const created: Incident = {
      id,
      number: `${new Date(rt.clock.now).getUTCFullYear()}-${String(rt.counters.incident).padStart(5, '0')}`,
      callId: c.id,
      createdAt: rt.clock.now,
      firstAlarmAt: null,
      firstArrivalAt: null,
      workDoneAt: null,
      closedAt: null,
      state: 'neu',
      keywordId: kw.id,
      scenarioId: c.scenarioId,
      category: kw.category,
      position: [...loc.position] as LatLng,
      truePosition: [...c.location.position] as LatLng,
      locationWrongReported: false,
      times: {},
      mask: mask ? { ...mask } : null,
      address: loc.address,
      areaId: state.center.areas.find((a) => pointInArea(loc.position, a))?.id ?? c.location.areaId,
      description: mask?.info || c.notes || c.opening,
      priority: kw.priority,
      needs: truthCode === NO_INCIDENT_KEYWORD ? [] : catalogNeeds(state.center.catalogId, truthCode),
      workTotalMs: Math.round(rng.range(work[0], work[1]) * MIN * diff.workTime),
      workDoneMs: 0,
      patients: [],
      vehicleIds: [],
      activeVehicleIds: [],
      backupRequests: [],
      escalation: escalate
        ? { at: rt.clock.now + rng.range(4, 12) * MIN, requirements: esc!.needs.map((r) => ({ ...r })), text: esc!.text, triggered: false, extraPatients: esc!.extraPatients ?? 0 }
        : null,
      log: [],
      keywordCorrect: truthCode === kw.code,
      meldebildId: c.meldebildId ?? null,
      lastNeedCheckAt: null,
    };
    for (let i = 0; i < pCount; i++) created.patients.push(newPatient(state, rng, c.scenarioId, i + 1));
    return created;
  });
  rt.incidents.push(inc);
  c.state = 'abgeschlossen';
  c.closedAt = rt.clock.now;
  c.incidentId = id;
  log(state, 'einsatz', `Einsatz ${inc.number} angelegt: ${kw.code} – ${kw.label}, ${inc.address}`, { incidentId: id, callId });
  return ok('Einsatz angelegt.', id);
}

/** Weiterleitung an eine andere Stelle (Stichwort mit forward = true) – es entsteht kein Einsatz */
export function forwardCall(state: GameState, callId: string, keywordId: string): CommandResult {
  const c = state.runtime.calls.find((x) => x.id === callId);
  const kw = state.center.keywords.find((k) => k.id === keywordId);
  if (!c || c.state !== 'in_abfrage') return fail('Kein Notruf in Abfrage.');
  if (!kw?.forward) return fail('Dieses Stichwort ist keine Weiterleitung.');
  c.state = 'abgeschlossen';
  c.closedAt = state.runtime.clock.now;
  c.keywordId = kw.id;
  const real = truthKeywordCode(c.scenarioId, c.variantIdx, state.center.catalogId);
  const isEmergency = real && real !== NO_INCIDENT_KEYWORD && !state.center.keywords.find((k) => k.code === real)?.forward;
  const correct = real === kw.code;
  log(
    state,
    isEmergency ? 'warnung' : 'notruf',
    `Notruf weitergeleitet: ${kw.label}${correct ? '' : isEmergency ? ' – ACHTUNG: Es lag ein echter Notfall vor!' : real && real !== NO_INCIDENT_KEYWORD ? ` – besser wäre gewesen: ${state.center.keywords.find((k) => k.code === real)?.label ?? real}` : ''}`,
    { callId },
  );
  return ok(`Weitergeleitet: ${kw.label}`);
}

export function closeCallWithoutIncident(state: GameState, callId: string, reason: string): CommandResult {
  const c = state.runtime.calls.find((x) => x.id === callId);
  if (!c || c.state !== 'in_abfrage') return fail('Kein Notruf in Abfrage.');
  c.state = 'abgeschlossen';
  c.closedAt = state.runtime.clock.now;
  const real = truthKeywordCode(c.scenarioId, c.variantIdx, state.center.catalogId);
  const noEmergency = real === NO_INCIDENT_KEYWORD || Boolean(state.center.keywords.find((k) => k.code === real)?.forward) || Boolean(c.duplicateOfIncidentId);
  log(state, noEmergency ? 'notruf' : 'warnung', `Notruf ohne Einsatz beendet: ${reason || 'kein Grund angegeben'}${noEmergency ? '' : ' – ACHTUNG: Es lag ein echter Notfall vor!'}`, { callId });
  return ok();
}

export function linkCallToIncident(state: GameState, callId: string, incidentId: string): CommandResult {
  const c = state.runtime.calls.find((x) => x.id === callId);
  const inc = incident(state, incidentId);
  if (!c || c.state !== 'in_abfrage') return fail('Kein Notruf in Abfrage.');
  if (!inc || inc.state === 'abgeschlossen') return fail('Einsatz nicht gefunden oder bereits abgeschlossen.');
  c.state = 'abgeschlossen';
  c.closedAt = state.runtime.clock.now;
  c.incidentId = inc.id;
  const correct = c.duplicateOfIncidentId === inc.id;
  log(state, correct ? 'notruf' : 'warnung', `Notruf mit Einsatz ${inc.number} verknüpft${correct ? '' : ' – ACHTUNG: Der Anruf betraf einen anderen Notfall!'}`, { callId, incidentId: inc.id });
  return ok();
}

export function createManualIncident(state: GameState, keywordId: string, position: LatLng, address: string, description: string): CommandResult {
  const kw = state.center.keywords.find((k) => k.id === keywordId);
  if (!kw) return fail('Bitte ein gültiges Stichwort wählen.');
  if (!address.trim()) return fail('Bitte eine Adresse angeben.');
  const rt = state.runtime;
  rt.counters.incident++;
  const id = `i_${rt.counters.incident}`;
  const rule = state.center.aao.find((a) => a.keywordId === kw.id);
  rt.incidents.push({
    id,
    number: `${new Date(rt.clock.now).getUTCFullYear()}-${String(rt.counters.incident).padStart(5, '0')}`,
    callId: null,
    createdAt: rt.clock.now,
    firstAlarmAt: null,
    firstArrivalAt: null,
    workDoneAt: null,
    closedAt: null,
    state: 'neu',
    keywordId: kw.id,
    scenarioId: 'manuell',
    category: kw.category,
    position,
    truePosition: position,
    locationWrongReported: false,
    times: {},
    mask: null,
    address,
    areaId: state.center.areas.find((a) => pointInArea(position, a))?.id ?? null,
    description,
    priority: kw.priority,
    needs: nonMedical(rule?.requirements ?? catalogNeeds(state.center.catalogId, kw.code)),
    workTotalMs: 20 * MIN,
    workDoneMs: 0,
    patients: [],
    vehicleIds: [],
    activeVehicleIds: [],
    backupRequests: [],
    escalation: null,
    log: [],
    keywordCorrect: null,
    lastNeedCheckAt: null,
  });
  log(state, 'einsatz', `Einsatz manuell angelegt: ${kw.code}, ${address}`, { incidentId: id });
  return ok('Einsatz angelegt.', id);
}

export function changeIncidentKeyword(state: GameState, incidentId: string, keywordId: string): CommandResult {
  const inc = incident(state, incidentId);
  const kw = state.center.keywords.find((k) => k.id === keywordId);
  if (!inc || inc.state === 'abgeschlossen') return fail('Einsatz nicht gefunden.');
  if (!kw) return fail('Unbekanntes Stichwort.');
  inc.keywordId = kw.id;
  inc.priority = kw.priority;
  log(state, 'einsatz', `Stichwort geändert auf ${kw.code} – ${kw.label}`, { incidentId });
  return ok();
}

// ---------------------------------------------------------------------------
// Befehle: Disposition
// ---------------------------------------------------------------------------

export function alarmVehicles(state: GameState, incidentId: string, vehicleIds: string[]): CommandResult {
  const inc = incident(state, incidentId);
  if (!inc) return fail('Einsatz nicht gefunden.');
  if (inc.state === 'abgeschlossen') return fail('Einsatz ist bereits abgeschlossen.');
  if (vehicleIds.length === 0) return fail('Keine Fahrzeuge ausgewählt.');
  const now = state.runtime.clock.now;
  const errors: string[] = [];
  let count = 0;
  const unique = [...new Set(vehicleIds)];
  for (const vid of unique) {
    const v = vehicle(state, vid);
    if (!v) {
      errors.push(`Fahrzeug ${vid} existiert nicht.`);
      continue;
    }
    const av = vehicleAvailability(state, v);
    if (!av.available) {
      errors.push(`${v.callsign}: ${av.reason}`);
      continue;
    }
    v.rt.incidentId = inc.id;
    v.rt.alarms++;
    inc.vehicleIds = [...new Set([...inc.vehicleIds, v.id])];
    inc.activeVehicleIds.push(v.id);
    const st = state.center.stations.find((s) => s.id === v.stationId);
    if (v.rt.status === 'frei_funk') {
      log(state, 'alarm', `${v.callsign} alarmiert (über Funk, unterwegs)`, { incidentId: inc.id, vehicleId: v.id });
      startMove(state, v, inc.position, 'einsatz', incEmergency(state, inc));
      setStatus(state, v, 'anfahrt');
    } else {
      const base = (st?.turnoutSeconds ?? 60) * 1000 + (v.external?.requestDelaySeconds ?? 0) * 1000;
      v.rt.phaseUntil = now + withRng(state, (rng) => Math.round(base * rng.range(0.75, 1.3)));
      log(state, 'alarm', `${v.callsign} alarmiert${v.external ? ' (Anforderung über Nachbarleitstelle)' : ''}`, { incidentId: inc.id, vehicleId: v.id });
      setStatus(state, v, 'alarmiert');
    }
    count++;
  }
  if (count > 0) {
    if (!inc.firstAlarmAt) inc.firstAlarmAt = now;
    if (inc.state === 'neu') inc.state = 'disponiert';
  }
  if (count === 0) return fail(errors.join(' '));
  return ok(errors.length ? `${count} Fahrzeug(e) alarmiert. Nicht alarmiert: ${errors.join(' ')}` : `${count} Fahrzeug(e) alarmiert.`);
}

/**
 * Alarmgruppen Freiwilliger Feuerwehren alarmieren. Jede Wehr entscheidet nach der Lage, mit welchen
 * Fahrzeugen sie ausrückt (siehe alarmGroups.ts); die Ausrückzeit hängt von der Tageszeit ab.
 */
export function alarmGroups(state: GameState, incidentId: string, stationIds: string[]): CommandResult {
  const inc = incident(state, incidentId);
  if (!inc) return fail('Einsatz nicht gefunden.');
  if (inc.state === 'abgeschlossen') return fail('Einsatz ist bereits abgeschlossen.');
  if (stationIds.length === 0) return fail('Keine Alarmgruppe ausgewählt.');
  const now = state.runtime.clock.now;
  const { factor, label } = turnoutFactor(now);
  const taken: Vehicle[] = [];
  const errors: string[] = [];
  const done: string[] = [];
  for (const sid of [...new Set(stationIds)]) {
    const st = state.center.stations.find((s) => s.id === sid);
    if (!st || !isGroupStation(state, st)) {
      errors.push(`${st?.name ?? sid}: keine Alarmgruppe.`);
      continue;
    }
    const dep = groupDeployment(state, inc, st, taken);
    if (!dep.length) {
      errors.push(`${groupName(st)}: keine einsatzbereiten Fahrzeuge.`);
      continue;
    }
    const r = alarmVehicles(state, inc.id, dep.map((v) => v.id));
    if (!r.ok) {
      errors.push(r.error);
      continue;
    }
    taken.push(...dep);
    // Sammeln am Gerätehaus: das erste Fahrzeug nach der Ausrückzeit, die weiteren kurz danach
    withRng(state, (rng) => {
      let t = now + st.turnoutSeconds * 1000 * factor * rng.range(0.8, 1.25);
      for (const v of dep) {
        if (v.rt.status !== 'alarmiert') continue;
        v.rt.phaseUntil = Math.round(t);
        t += rng.range(30, 120) * 1000;
      }
    });
    const codes = dep.map((v) => typeOf(state, v)?.code ?? v.typeId).join(', ');
    log(state, 'alarm', `Alarmgruppe ${groupName(st)} alarmiert (${label}) – Wehr rückt aus mit ${codes}`, { incidentId: inc.id });
    done.push(groupName(st));
  }
  if (!done.length) return fail(errors.join(' ') || 'Keine Alarmgruppe alarmiert.');
  return ok(`${done.length} Alarmgruppe(n) alarmiert${errors.length ? `. Nicht alarmiert: ${errors.join(' ')}` : '.'}`);
}

/** Das erste ausrückende Fahrzeug einer Wehr meldet über Funk, mit welchen Fahrzeugen die Wehr kommt */
function reportGroupTurnout(state: GameState, v: Vehicle, inc: Incident) {
  if (!isGroupVehicle(state, v)) return;
  const same = state.center.vehicles.filter((x) => x.stationId === v.stationId && x.rt.incidentId === inc.id);
  if (same.some((x) => x !== v && x.rt.status !== 'alarmiert')) return;
  const st = state.center.stations.find((s) => s.id === v.stationId)!;
  const codes = same.map((x) => typeOf(state, x)?.code ?? x.typeId).join(', ');
  radio(state, { vehicleId: v.id, incidentId: inc.id, kind: 'lage', text: `${groupName(st)} rückt aus mit ${codes}.` });
}

function releaseVehicleInternal(state: GameState, v: Vehicle, note: string) {
  const inc = v.rt.incidentId ? incident(state, v.rt.incidentId) : undefined;
  if (inc && v.rt.patientId) {
    const p = inc.patients.find((x) => x.id === v.rt.patientId);
    if (p && p.state === 'wartet') {
      p.vehicleId = null;
      p.readyAt = null;
    }
  }
  // offene Sprechwünsche des Fahrzeugs gelten als erledigt
  for (const r of state.runtime.radio) if (r.vehicleId === v.id && !r.handled && r.kind !== 'nachforderung') r.handled = true;
  v.rt.patientId = null;
  v.rt.phaseUntil = null;
  v.rt.statusBeforeSpeak = undefined;
  detachFromIncident(state, v);
  if (inc) log(state, 'einsatz', `${v.callsign} entlassen (${note}).`, { incidentId: inc.id, vehicleId: v.id });
  const atStation = !v.rt.move && dist2(v.rt.position, stationPos(state, v)) < 1e-8;
  if (atStation) {
    setStatus(state, v, 'frei_wache');
  } else {
    setStatus(state, v, 'frei_funk');
    startMove(state, v, stationPos(state, v), 'rueckfahrt', false);
  }
}
const dist2 = (a: LatLng, b: LatLng) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

export function releaseVehicle(state: GameState, vehicleId: string): CommandResult {
  const v = vehicle(state, vehicleId);
  if (!v || !v.rt.incidentId) return fail('Fahrzeug ist keinem Einsatz zugeordnet.');
  if (v.rt.status === 'transport' || v.rt.status === 'am_ziel') return fail(`${v.callsign} transportiert einen Patienten und kann nicht entlassen werden.`);
  releaseVehicleInternal(state, v, 'durch Leitstelle');
  return ok(`${v.callsign} entlassen.`);
}

export function releaseAllOnScene(state: GameState, incidentId: string): CommandResult {
  const inc = incident(state, incidentId);
  if (!inc) return fail('Einsatz nicht gefunden.');
  const vs = state.center.vehicles.filter((v) => v.rt.incidentId === inc.id && v.rt.status !== 'transport' && v.rt.status !== 'am_ziel');
  if (vs.length === 0) return fail('Keine entlassbaren Fahrzeuge.');
  for (const v of vs) releaseVehicleInternal(state, v, 'durch Leitstelle');
  return ok(`${vs.length} Fahrzeug(e) entlassen.`);
}

export function assignHospital(state: GameState, radioId: string, hospitalId: string): CommandResult {
  const r = state.runtime.radio.find((x) => x.id === radioId);
  if (!r || r.kind !== 'transportziel' || r.handled) return fail('Keine offene Transportzielanfrage.');
  const v = vehicle(state, r.vehicleId);
  const inc = r.incidentId ? incident(state, r.incidentId) : undefined;
  const p = inc?.patients.find((x) => x.id === r.patientId);
  if (!v || !inc || !p) return fail('Fahrzeug oder Patient nicht gefunden.');
  const h = state.center.hospitals.find((x) => x.id === hospitalId);
  if (!h) return fail('Krankenhaus nicht gefunden.');
  if (!h.available) return fail(`${h.name} ist abgemeldet.`);
  r.handled = true;
  startTransport(state, v, p, h.id);
  return ok(`Transportziel ${h.name} zugewiesen.`);
}

export function acknowledgeRadio(state: GameState, radioId: string): CommandResult {
  const r = state.runtime.radio.find((x) => x.id === radioId);
  if (!r || r.handled) return fail('Meldung nicht gefunden oder bereits quittiert.');
  if (r.kind === 'transportziel') return fail('Bitte ein Transportziel zuweisen.');
  r.handled = true;
  const v = vehicle(state, r.vehicleId);
  if (v && v.rt.status === 'sprechwunsch' && v.rt.statusBeforeSpeak) {
    const back = v.rt.statusBeforeSpeak;
    v.rt.statusBeforeSpeak = undefined;
    setStatus(state, v, back, 'Sprechwunsch erledigt');
  }
  log(state, 'funk', `Meldung quittiert: ${r.text}`, { incidentId: r.incidentId ?? undefined, vehicleId: r.vehicleId });
  return ok();
}

export function requestBackup(state: GameState, incidentId: string, reqs: AaoRequirement[], text: string): CommandResult {
  const inc = incident(state, incidentId);
  if (!inc || inc.state === 'abgeschlossen') return fail('Einsatz nicht gefunden.');
  const clean = reqs.filter((r) => r.count > 0);
  if (clean.length === 0) return fail('Keine Kräfte angegeben.');
  inc.backupRequests.push({ at: state.runtime.clock.now, text: text || 'Nachforderung durch Leitstelle', requirements: clean });
  log(state, 'nachforderung', `Leitstelle erhöht Bedarf: ${reqText(clean)}`, { incidentId });
  return ok();
}

export function closeIncident(state: GameState, incidentId: string): CommandResult {
  const rt = state.runtime;
  const inc = incident(state, incidentId);
  if (!inc) return fail('Einsatz nicht gefunden.');
  if (inc.state === 'abgeschlossen') return fail('Einsatz ist bereits abgeschlossen.');
  if (inc.activeVehicleIds.length > 0) return fail('Es sind noch Fahrzeuge gebunden. Bitte zuerst entlassen.');
  if (inc.patients.some((p) => p.state === 'wartet' || p.state === 'versorgt' || p.state === 'transport'))
    return fail('Es gibt noch unversorgte bzw. nicht übergebene Patienten.');
  if (inc.state !== 'abarbeitung_beendet' && inc.vehicleIds.length > 0 && inc.workDoneMs < inc.workTotalMs)
    return fail('Die Einsatzmaßnahmen sind noch nicht beendet.');
  inc.state = 'abgeschlossen';
  inc.closedAt = rt.clock.now;
  for (const r of rt.radio) if (r.incidentId === inc.id) r.handled = true;
  log(state, 'abschluss', `Einsatz ${inc.number} abgeschlossen.`, { incidentId });
  const kw = state.center.keywords.find((k) => k.id === inc.keywordId);
  const call = rt.calls.find((c) => c.id === inc.callId);
  rt.archive.push({
    id: inc.id,
    number: inc.number,
    keywordId: inc.keywordId,
    keywordCode: kw?.code ?? '?',
    category: inc.category,
    address: inc.address,
    createdAt: inc.createdAt,
    callReceivedAt: call?.receivedAt ?? null,
    firstAlarmAt: inc.firstAlarmAt,
    firstArrivalAt: inc.firstArrivalAt,
    closedAt: inc.closedAt,
    vehicleCount: inc.vehicleIds.length,
    backupCount: inc.backupRequests.length,
    patientCount: inc.patients.length,
    keywordCorrect: inc.keywordCorrect,
    log: [...inc.log],
  });
  rt.incidents = rt.incidents.filter((i) => i.id !== inc.id);
  // Abgeschlossene Notrufe und erledigte Funkmeldungen begrenzen
  rt.calls = rt.calls.filter((c) => c.state === 'klingelt' || c.state === 'in_abfrage' || rt.clock.now - (c.closedAt ?? rt.clock.now) < 30 * MIN);
  rt.radio = rt.radio.filter((r) => !r.handled || rt.clock.now - r.at < 30 * MIN);
  return ok('Einsatz abgeschlossen und archiviert.');
}

/** Manuelle Statusänderung für nicht gebundene Fahrzeuge (Außer Dienst / Einsatzbereit) */
export function setVehicleServiceStatus(state: GameState, vehicleId: string, inService: boolean): CommandResult {
  const v = vehicle(state, vehicleId);
  if (!v) return fail('Fahrzeug nicht gefunden.');
  if (v.rt.incidentId) return fail('Fahrzeug ist im Einsatz gebunden.');
  if (inService) {
    if (v.rt.status !== 'ausser_dienst') return fail('Fahrzeug ist bereits einsatzbereit.');
    v.rt.breakdownUntil = null;
    const reason = outOfServiceReason(v, state.runtime.clock.now);
    if (reason) return fail(`Kann nicht in Dienst gehen: ${reason}`);
    setStatus(state, v, v.rt.move ? 'frei_funk' : 'frei_wache', 'manuell');
  } else {
    if (v.rt.status === 'ausser_dienst') return fail('Fahrzeug ist bereits außer Dienst.');
    v.rt.breakdownUntil = -1; // manuell außer Dienst bis zur manuellen Rückmeldung
    setStatus(state, v, 'ausser_dienst', 'manuell');
  }
  return ok();
}

// ---------------------------------------------------------------------------
// Uhr
// ---------------------------------------------------------------------------

export function setRunning(state: GameState, running: boolean): CommandResult {
  state.runtime.clock.running = running;
  return ok();
}

export function setSpeed(state: GameState, speed: number): CommandResult {
  if (!(speed > 0 && speed <= 120)) return fail('Ungültige Geschwindigkeit.');
  state.runtime.clock.speed = speed;
  return ok();
}

/** Löst sofort einen Notruf eines bestimmten Szenarios aus (Übungs-/Szenariomodus) */
export function injectScenarioCall(state: GameState, scenarioId: string): CommandResult {
  const sc = findScenario(scenarioId);
  if (!sc) return fail('Unbekanntes Szenario.');
  const rt = state.runtime;
  return withRng(state, (rng) => {
    rt.counters.call++;
    const call = generateCall(state, rng, `c_${rt.counters.call}`, rt.clock.now, sc);
    if (!call) return fail('Notruf konnte nicht erzeugt werden.');
    rt.calls.push(call);
    rt.stats.callsTotal++;
    log(state, 'notruf', `Notruf geht ein (${call.caller.relation}) – Übungsszenario`, { callId: call.id });
    return ok(`Notruf "${sc.name}" ausgelöst.`);
  });
}

/** Setzt den Spielverlauf zurück, behält aber die Leitstellenkonfiguration */
export function restartSimulation(state: GameState): CommandResult {
  const fresh = createGame(state.center, state.runtime.clock.startedAt);
  state.runtime = fresh.runtime;
  state.center = fresh.center;
  return ok('Simulation neu gestartet.');
}
