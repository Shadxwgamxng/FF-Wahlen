import type {
  AaoRequirement,
  CenterConfig,
  EventKind,
  GameState,
  Incident,
  LatLng,
  Patient,
  RadioMessage,
  StatusMeaning,
  Vehicle,
  Weather,
} from '../model/types';
import { SCHEMA_VERSION } from '../model/types';
import { Rng } from './rng';
import { generateCall } from './callgen';
import { findScenario, NO_INCIDENT_KEYWORD } from '../data/scenarios';
import { keywordNeeds } from '../data/keywords';
import { findQuestion } from '../data/questions';
import { allocateCrew, busyPersonIds, hourOf, outOfServiceReason, vehicleAvailability } from './availability';
import { DIFFICULTY, HOURLY_PROFILE } from './difficulty';
import { interpolate, pointInPolygon as pointInArea, travelTimeMs } from './geo';
import { capsOf, coverage, hospitalOptions, MEDICAL_CAPS, mergeRequirements, openRequirements, typeOf } from './dispatch';
import { SIM_START, emptyVehicleRuntime } from '../data/sampleCenter';

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

function setStatus(state: GameState, v: Vehicle, meaning: StatusMeaning, note?: string) {
  if (v.rt.status === meaning) return;
  v.rt.status = meaning;
  v.rt.lastStatusChange = state.runtime.clock.now;
  const d = statusDef(state, meaning);
  log(state, 'status', `${v.callsign}: Status ${d.code} – ${d.label}${note ? ` (${note})` : ''}`, {
    vehicleId: v.id,
    incidentId: v.rt.incidentId ?? undefined,
  });
}

function radio(state: GameState, msg: Omit<RadioMessage, 'id' | 'at' | 'handled'>) {
  const rt = state.runtime;
  rt.counters.radio++;
  const m: RadioMessage = { ...msg, id: `r_${rt.counters.radio}`, at: rt.clock.now, handled: false };
  rt.radio.push(m);
  const v = state.center.vehicles.find((x) => x.id === msg.vehicleId);
  log(state, msg.kind === 'nachforderung' ? 'nachforderung' : 'funk', `${v?.callsign ?? 'Funk'}: ${msg.text}`, {
    vehicleId: msg.vehicleId,
    incidentId: msg.incidentId ?? undefined,
  });
  return m;
}

const vehicle = (state: GameState, id: string) => state.center.vehicles.find((v) => v.id === id);
const incident = (state: GameState, id: string) => state.runtime.incidents.find((i) => i.id === id);
const stationPos = (state: GameState, v: Vehicle): LatLng =>
  state.center.stations.find((s) => s.id === v.stationId)?.position ?? state.center.mapCenter;

function startMove(state: GameState, v: Vehicle, to: LatLng, purpose: 'einsatz' | 'transport' | 'rueckfahrt', emergency: boolean) {
  const now = state.runtime.clock.now;
  const type = typeOf(state, v);
  const dur = travelTimeMs(v.rt.position, to, {
    speedKmh: type?.speedKmh ?? 50,
    detourFactor: state.center.settings.detourFactor,
    airborne: type?.airborne,
    emergency,
  });
  v.rt.move = { from: [...v.rt.position] as LatLng, to: [...to] as LatLng, departAt: now, arriveAt: now + Math.max(dur, 5000), purpose, emergency };
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
        startMove(state, v, inc.position, 'einsatz', true);
        setStatus(state, v, 'anfahrt');
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
    if (inc) {
      if (!inc.firstArrivalAt) {
        inc.firstArrivalAt = now;
        inc.lastNeedCheckAt = now;
        if (inc.state === 'disponiert' || inc.state === 'neu') inc.state = 'vor_ort';
        log(state, 'einsatz', `Erstes Fahrzeug an der Einsatzstelle ${inc.address}.`, { incidentId: inc.id });
        if (inc.escalation && !inc.escalation.triggered) inc.escalation.at = now + (inc.escalation.at - inc.createdAt);
      }
      if (inc.state === 'abarbeitung_beendet') {
        radio(state, { vehicleId: v.id, incidentId: inc.id, kind: 'lage', text: 'Eingetroffen, Einsatzstelle bereits abgearbeitet – erbitten Entlassung.' });
      }
    }
  } else if (m.purpose === 'transport') {
    setStatus(state, v, 'am_ziel');
    withRng(state, (rng) => (v.rt.phaseUntil = now + rng.range(8, 15) * MIN));
  } else {
    // Rückfahrt beendet
    v.rt.crewIds = [];
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
  if (inc) inc.activeVehicleIds = inc.activeVehicleIds.filter((id) => id !== v.id);
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

const onScene = (state: GameState, inc: Incident) =>
  state.center.vehicles.filter((v) => v.rt.incidentId === inc.id && (v.rt.status === 'einsatzort' || (v.rt.status === 'sprechwunsch' && v.rt.statusBeforeSpeak === 'einsatzort')));

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
  const transporters = present.filter((v) => typeOf(state, v)?.canTransport && v.rt.status === 'einsatzort');
  const doctorPresent = present.some((v) => capsOf(state, v).includes('notarzt'));
  // Fahrzeuge Patienten zuweisen
  for (const v of transporters) {
    if (v.rt.patientId) continue;
    const p = inc.patients.find((x) => x.state === 'wartet' && !x.vehicleId);
    if (!p) break;
    p.vehicleId = v.id;
    v.rt.patientId = p.id;
    withRng(state, (rng) => (p.readyAt = now + rng.range(8, 18) * MIN * DIFFICULTY[state.center.settings.difficulty].workTime));
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
  if (missing.length === 0) return;
  addBackupRequest(state, inc, present[0], missing, `Nachforderung: ${reqText(missing)}`);
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

export function askQuestion(state: GameState, callId: string, questionId: string): CommandResult {
  const c = state.runtime.calls.find((x) => x.id === callId);
  if (!c || c.state !== 'in_abfrage') return fail('Kein Notruf in Abfrage.');
  if (c.dialog.some((d) => d.questionId === questionId)) return fail('Frage wurde bereits gestellt.');
  const q = findQuestion(c.category, questionId);
  if (!q) return fail('Unbekannte Frage.');
  c.dialog.push({ questionId, question: q.text, answer: q.answer(c.facts), askedAt: state.runtime.clock.now });
  return ok();
}

export function updateCallNotes(state: GameState, callId: string, notes: string): CommandResult {
  const c = state.runtime.calls.find((x) => x.id === callId);
  if (!c) return fail('Notruf nicht gefunden.');
  c.notes = notes;
  return ok();
}

export function setCallKeyword(state: GameState, callId: string, keywordId: string | null): CommandResult {
  const c = state.runtime.calls.find((x) => x.id === callId);
  if (!c || c.state !== 'in_abfrage') return fail('Kein Notruf in Abfrage.');
  if (keywordId && !state.center.keywords.some((k) => k.id === keywordId)) return fail('Unbekanntes Stichwort.');
  c.keywordId = keywordId;
  return ok();
}

/** Abfragehilfe: schlägt das Stichwort vor, sobald die Schlüsselfragen gestellt wurden (nur leicht/normal) */
export function keywordHint(state: GameState, callId: string): { keywordId: string | null; noIncident: boolean } | null {
  const c = state.runtime.calls.find((x) => x.id === callId);
  if (!c || !DIFFICULTY[state.center.settings.difficulty].keywordHint) return null;
  const sc = findScenario(c.scenarioId);
  if (!sc) return null;
  if (!sc.keyQuestions.every((q) => c.dialog.some((d) => d.questionId === q))) return null;
  const code = truthKeywordCode(c.scenarioId, c.variantIdx);
  if (code === NO_INCIDENT_KEYWORD) return { keywordId: null, noIncident: true };
  return { keywordId: state.center.keywords.find((k) => k.code === code)?.id ?? null, noIncident: false };
}

export function truthKeywordCode(scenarioId: string, variantIdx: number): string {
  const sc = findScenario(scenarioId);
  if (!sc) return '';
  return (variantIdx >= 0 ? sc.variants?.[variantIdx]?.keyword : undefined) ?? sc.keyword;
}

export function createIncidentFromCall(state: GameState, callId: string): CommandResult {
  const rt = state.runtime;
  const c = rt.calls.find((x) => x.id === callId);
  if (!c || c.state !== 'in_abfrage') return fail('Kein Notruf in Abfrage.');
  if (!c.dialog.some((d) => d.questionId === 'ort')) return fail('Der Einsatzort wurde noch nicht abgefragt.');
  if (!c.keywordId) return fail('Bitte zuerst ein Einsatzstichwort wählen.');
  const kw = state.center.keywords.find((k) => k.id === c.keywordId);
  if (!kw) return fail('Unbekanntes Stichwort.');
  const sc = findScenario(c.scenarioId);
  const variant = sc && c.variantIdx >= 0 ? sc.variants?.[c.variantIdx] : undefined;
  const truthCode = truthKeywordCode(c.scenarioId, c.variantIdx);
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
    const esc = variant?.escalation === null ? undefined : (variant?.escalation ?? sc?.escalation);
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
      position: [...c.location.position] as LatLng,
      address: c.location.address,
      areaId: c.location.areaId,
      description: c.notes || c.opening,
      priority: kw.priority,
      needs: truthCode === NO_INCIDENT_KEYWORD ? [] : keywordNeeds(truthCode),
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

export function closeCallWithoutIncident(state: GameState, callId: string, reason: string): CommandResult {
  const c = state.runtime.calls.find((x) => x.id === callId);
  if (!c || c.state !== 'in_abfrage') return fail('Kein Notruf in Abfrage.');
  c.state = 'abgeschlossen';
  c.closedAt = state.runtime.clock.now;
  const real = truthKeywordCode(c.scenarioId, c.variantIdx);
  log(state, real === NO_INCIDENT_KEYWORD || c.duplicateOfIncidentId ? 'notruf' : 'warnung', `Notruf ohne Einsatz beendet: ${reason || 'kein Grund angegeben'}${real !== NO_INCIDENT_KEYWORD && !c.duplicateOfIncidentId ? ' – ACHTUNG: Es lag ein echter Notfall vor!' : ''}`, { callId });
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
    address,
    areaId: state.center.areas.find((a) => a.polygon.length > 2 && pointInArea(position, a.polygon))?.id ?? null,
    description,
    priority: kw.priority,
    needs: nonMedical(rule?.requirements ?? keywordNeeds(kw.code)),
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
    const busy = busyPersonIds(state);
    const av = vehicleAvailability(state, v, busy);
    if (!av.available) {
      errors.push(`${v.callsign}: ${av.reason}`);
      continue;
    }
    if (v.rt.status === 'frei_wache') {
      const crew = allocateCrew(state, v, typeOf(state, v), now, busy);
      v.rt.crewIds = crew.crewIds;
    }
    v.rt.incidentId = inc.id;
    v.rt.alarms++;
    inc.vehicleIds = [...new Set([...inc.vehicleIds, v.id])];
    inc.activeVehicleIds.push(v.id);
    const st = state.center.stations.find((s) => s.id === v.stationId);
    if (v.rt.status === 'frei_funk') {
      log(state, 'alarm', `${v.callsign} alarmiert (über Funk, unterwegs)`, { incidentId: inc.id, vehicleId: v.id });
      startMove(state, v, inc.position, 'einsatz', true);
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
    v.rt.crewIds = [];
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
