import type { FunkLine, FunkState, GameState, Hospital, Incident, RadioMessage, Vehicle } from '../model/types';
import { radioGroupOf } from '../model/radio';
import { acknowledgeRadio, alarmVehicles, assignHospital, capLabel, log, releaseVehicle, statusDef, type CommandResult } from './engine';

/**
 * Sprechfunk zwischen Leitstelle und Fahrzeugen – regelbasiert, ohne KI.
 *
 * Ablauf wie im BOS-Funk:
 *  - Fahrzeug drückt Status 5 (Sprechwunsch). Was es will, ist erst bekannt, wenn die Leitstelle es anspricht:
 *    "Florian Ostholstein 61-48-01 von Leitstelle, kommen" → "Hier Florian Ostholstein 61-48-01,
 *    Nachforderung: Polizei zur Einsatzstelle, kommen" → "Verstanden, Ende" (quittiert).
 *  - Die Leitstelle kann Fahrzeuge auch von sich aus anfunken und Aufträge geben: Status abfragen,
 *    Lagemeldung, Einsatz übernehmen, Transportziel, Einrücken.
 * Das Fahrzeug antwortet nur, wenn es in der geschalteten Rufgruppe ist. Folgesätze ohne Rufnamen
 * gelten dem zuletzt angesprochenen Fahrzeug.
 */

const MAX_LINES = 80;
/** so viele Funkzeilen lang bleibt ein angesprochenes Fahrzeug "im Gespräch" */
const CONTEXT_LINES = 8;

const ok = (message?: string): CommandResult => ({ ok: true, message });
const fail = (error: string): CommandResult => ({ ok: false, error });

function funkOf(state: GameState): FunkState {
  if (!state.runtime.funk) state.runtime.funk = { log: [], counter: 0 };
  return state.runtime.funk;
}

function addLine(state: GameState, line: Omit<FunkLine, 'id' | 'at'>): FunkLine {
  const f = funkOf(state);
  f.counter++;
  const l: FunkLine = { ...line, id: f.counter, at: state.runtime.clock.now };
  f.log.push(l);
  if (f.log.length > MAX_LINES) f.log.splice(0, f.log.length - MAX_LINES);
  return l;
}

// ---------------------------------------------------------------- Zahlen und Rufnamen

const UNITS: Record<string, number> = { null: 0, eins: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9 };
const TEENS: Record<string, number> = { zehn: 10, elf: 11, zwölf: 12, zwoelf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, fuenfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19 };
const TENS: Record<string, number> = { zwanzig: 20, dreißig: 30, dreissig: 30, vierzig: 40, fünfzig: 50, fuenfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90 };
const UNIT_PREFIX: Record<string, number> = { ein: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9 };

/** Zahlwort (0–99) als Zahl, sonst null. "ein" allein zählt nicht (zu häufig im Satz). */
export function numberWord(w: string): number | null {
  if (w in UNITS) return UNITS[w];
  if (w in TEENS) return TEENS[w];
  if (w in TENS) return TENS[w];
  const m = /^(ein|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun)und(zwanzig|dreißig|dreissig|vierzig|fünfzig|fuenfzig|sechzig|siebzig|achtzig|neunzig)$/.exec(w);
  return m ? UNIT_PREFIX[m[1]] + TENS[m[2]] : null;
}

/** Text in Kleinbuchstaben mit einheitlichen Leerzeichen */
export const normalizeFunk = (text: string) => ` ${text.toLowerCase().replace(/[.,;:!?()„“"'«»]/g, ' ').replace(/\s+/g, ' ').trim()} `;

/**
 * Gesprochene Zahlenfolge: "61-48-01", "61 48 1", "614801", "einundsechzig achtundvierzig null eins" → [61, 48, 1].
 * "null" vor einer einzelnen Ziffer gehört zu ihr ("null eins" = 1).
 */
export function spokenNumbers(text: string): number[] {
  const out: number[] = [];
  const tokens = text.toLowerCase().split(/[^0-9a-zäöüß]+/).filter(Boolean);
  let pendingZero = false;
  for (const t of tokens) {
    let n: number | null = null;
    if (/^\d+$/.test(t)) {
      if (t.length === 6) {
        out.push(Number(t.slice(0, 2)), Number(t.slice(2, 4)), Number(t.slice(4)));
        pendingZero = false;
        continue;
      }
      n = Number(t);
    } else n = numberWord(t);
    if (n === null) {
      pendingZero = false;
      continue;
    }
    if (pendingZero && n < 10) {
      out[out.length - 1] = n; // "null eins" → 1
      pendingZero = false;
      continue;
    }
    out.push(n);
    pendingZero = n === 0 && (t === 'null' || t === '0');
  }
  return out;
}

const callsignNumbers = (callsign: string) => (callsign.replace(/\(.*\)/, '').match(/\d+/g) ?? []).map(Number);
const callsignWord = (callsign: string) => callsign.trim().split(/\s+/)[0].toLowerCase();

function containsSeq(hay: number[], needle: number[]): boolean {
  if (!needle.length || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) if (needle.every((n, j) => hay[i + j] === n)) return true;
  return false;
}

/** Fahrzeuge, deren Rufname im Text vorkommt (bei Gleichstand mit Organisationswort bevorzugt) */
export function findCallsign(state: GameState, text: string): Vehicle | null {
  const nums = spokenNumbers(text);
  const norm = normalizeFunk(text);
  const hits: { v: Vehicle; score: number }[] = [];
  for (const v of state.center.vehicles) {
    const seq = callsignNumbers(v.callsign);
    const word = callsignWord(v.callsign);
    const named = norm.includes(` ${word} `);
    if (seq.length && containsSeq(nums, seq)) {
      // kurze Rufnamen ("Christoph 12", "Heros 3/11") nur zusammen mit dem Organisationswort
      if (seq.length < 3 && !named) continue;
      hits.push({ v, score: seq.length * 10 + (named ? 5 : 0) });
    } else if (!seq.length && norm.includes(` ${v.callsign.toLowerCase()} `)) hits.push({ v, score: 50 });
  }
  hits.sort((a, b) => b.score - a.score);
  if (!hits.length) return null;
  if (hits.length > 1 && hits[0].score === hits[1].score) return null; // mehrdeutig
  return hits[0].v;
}

/** Text für die Sprachausgabe: Rufnamen ziffernweise ("61 48 null 1"), ohne Bindestriche */
export function toSpeech(text: string): string {
  return text
    .replace(/(\d+)[-/](\d+)(?:-(\d+))?/g, (_, a: string, b: string, c?: string) => [a, b, c].filter(Boolean).map((x) => x!.replace(/^0(\d)$/, 'null $1')).join(' '))
    .replace(/×/g, ' ')
    .replace(/–/g, ',');
}

// ---------------------------------------------------------------- Aufträge erkennen

const has = (norm: string, re: RegExp) => re.test(norm);
const GENERIC_HOSPITAL = new Set(['klinik', 'kliniken', 'klinikum', 'krankenhaus', 'ostholstein', 'holstein', 'sana', 'gmbh', 'zentrum', 'standort', 'fachklinik', 'akademisches', 'lehrkrankenhaus', 'und', 'der', 'die', 'das', 'für', 'in', 'am', 'an']);

const tokenize = (s: string) =>
  s
    .toLowerCase()
    .split(/[^a-zäöüß0-9]+/)
    .filter((t) => t.length >= 3);

function matchHospital(state: GameState, norm: string): Hospital | null {
  let best: Hospital | null = null;
  let bestScore = 0;
  let tie = false;
  for (const h of state.center.hospitals) {
    let score = 0;
    for (const t of new Set(tokenize(h.name))) if (norm.includes(` ${t} `) || norm.includes(` ${t}`)) score += GENERIC_HOSPITAL.has(t) ? 0.1 : 1;
    if (score > bestScore) [best, bestScore, tie] = [h, score, false];
    else if (score === bestScore && score > 0) tie = true;
  }
  return bestScore >= 1 && !tie ? best : null;
}

const streetOf = (address: string) => address.split(',')[0].replace(/\s+\d+\s*[a-z]?$/i, '').trim();

function matchIncident(state: GameState, norm: string): Incident | null {
  const open = state.runtime.incidents.filter((i) => i.state !== 'abgeschlossen');
  // "Einsatz 12" / "Einsatznummer 12"
  const m = /einsatz(?:nummer)? (?:nummer )?(\d+)/.exec(norm);
  if (m) {
    const n = Number(m[1]);
    const hit = open.find((i) => Number(i.number.split('-').pop()) === n);
    if (hit) return hit;
  }
  const hits = open.filter((i) => {
    const street = streetOf(i.address).toLowerCase();
    return street.length >= 4 && norm.includes(` ${street}`);
  });
  return hits.length === 1 ? hits[0] : null;
}

type Order =
  | { k: 'transport'; hospital: Hospital }
  | { k: 'einsatz'; incident: Incident }
  | { k: 'einruecken' }
  | { k: 'lage' }
  | { k: 'status' }
  | { k: 'quittung' };

export function detectOrder(state: GameState, text: string): Order | null {
  const n = normalizeFunk(text);
  const hospital = matchHospital(state, n);
  if (hospital && has(n, / (krankenhaus|klinik|klinikum|transportziel|ziel|fahren sie|bringen sie|nach|ins|in die|anfahren) /)) return { k: 'transport', hospital };
  if (has(n, / (einrücken|einruecken|rücken sie ein|ruecken sie ein|rückt ein|rueckt ein|können einrücken|koennen einruecken|zur wache|zurück zur wache|sind entlassen|sie sind frei|frei für|entlassen) /)) return { k: 'einruecken' };
  const incident = has(n, / (einsatz|einsatzstelle|übernehmen|uebernehmen|übernehmen sie|alarm|fahren sie|anfahren) /) ? matchIncident(state, n) : null;
  if (incident) return { k: 'einsatz', incident };
  if (has(n, / (lage|lagemeldung|rückmeldung|rueckmeldung|wie sieht es aus|wie ist die lage|was ist los|situation) /)) return { k: 'lage' };
  if (has(n, / status /) && !has(n, / status (\d|eins|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht) /)) return { k: 'status' };
  if (has(n, / (verstanden|quittiert|veranlasst|wird alarmiert|werden alarmiert|kommt|kommen sofort|ist unterwegs|sind unterwegs|wird erledigt|in ordnung|okay|ok|roger|wird geschickt) /)) return { k: 'quittung' };
  return null;
}

// ---------------------------------------------------------------- Antworten der Besatzung

const spokenCount = (n: number, label: string) => (n === 1 ? label : `${n} ${label}`);
/** gesprochene Bezeichnung, wo sie vom Kurzlabel abweicht */
const SPOKEN_CAP: Record<string, string> = { polizei: 'Polizei', polizei_gruppe: 'Polizei-Einsatzgruppe' };

/** Was das Fahrzeug bei seinem Sprechwunsch sagt (ohne "Hier …" und ohne "kommen") */
export function crewReport(msg: RadioMessage): string {
  if (msg.kind === 'nachforderung' && msg.requirements?.length) {
    const what = msg.requirements.map((r) => spokenCount(r.count, SPOKEN_CAP[r.capability] ?? capLabel(r.capability))).join(', ');
    return `Nachforderung: ${what} zur Einsatzstelle`;
  }
  return msg.text.replace(/[.!]\s*$/, '');
}

function lagemeldung(state: GameState, v: Vehicle): string {
  const inc = v.rt.incidentId ? state.runtime.incidents.find((i) => i.id === v.rt.incidentId) : undefined;
  const st = statusDef(state, v.rt.status);
  if (!inc) return `Status ${st.code}, ${st.label}, kein Einsatz`;
  const parts: string[] = [];
  if (v.rt.status === 'alarmiert' || v.rt.status === 'anfahrt') parts.push(`auf Anfahrt zur Einsatzstelle ${inc.address}`);
  else if (v.rt.status === 'transport') {
    const h = state.center.hospitals.find((x) => x.id === v.rt.targetHospitalId);
    parts.push(`Transport mit Patient${h ? ` nach ${h.name}` : ''}`);
  } else if (v.rt.status === 'am_ziel') parts.push('am Krankenhaus, Patientenübergabe läuft');
  else if (inc.state === 'abarbeitung_beendet') parts.push('Einsatzstelle abgearbeitet, Kräfte können einrücken');
  else {
    const kw = state.center.keywords.find((k) => k.id === inc.keywordId);
    parts.push(`Lage an der Einsatzstelle ${inc.address}${kw ? `, ${kw.label}` : ''}`);
    const pts = inc.patients.filter((p) => p.state !== 'kein_transport');
    if (pts.length) {
      const waiting = pts.filter((p) => p.state === 'wartet').length;
      parts.push(`${pts.length === 1 ? 'ein Patient' : `${pts.length} Patienten`}${waiting ? `, davon ${waiting === 1 ? 'einer' : waiting} noch in Versorgung` : ''}`);
    } else parts.push('keine Patienten');
    if (inc.workTotalMs > 0) {
      const pct = Math.min(100, Math.round(((inc.workDoneMs / inc.workTotalMs) * 100) / 10) * 10);
      parts.push(pct >= 100 ? 'Maßnahmen gleich abgeschlossen' : `Maßnahmen laufen, etwa ${pct} Prozent abgearbeitet`);
    }
    if (state.runtime.radio.some((r) => r.incidentId === inc.id && r.kind === 'nachforderung' && !r.handled)) parts.push('Nachforderung steht noch aus');
  }
  return parts.join(', ');
}

function vehicleLine(state: GameState, v: Vehicle, group: string | null, text: string): FunkLine {
  return addLine(state, { from: 'fahrzeug', vehicleId: v.id, group: group ?? radioGroupOf(state.center, v)?.code, text, speech: toSpeech(text) });
}

/** Ältester offener Sprechwunsch des Fahrzeugs, dessen Inhalt noch niemand gehört hat */
const unrevealed = (state: GameState, v: Vehicle) => state.runtime.radio.find((r) => r.vehicleId === v.id && !r.handled && r.revealed === false);
const openRevealed = (state: GameState, v: Vehicle) => [...state.runtime.radio].reverse().find((r) => r.vehicleId === v.id && !r.handled && r.revealed !== false);

function reveal(state: GameState, v: Vehicle, msg: RadioMessage): string {
  msg.revealed = true;
  log(state, msg.kind === 'nachforderung' ? 'nachforderung' : 'funk', `${v.callsign}: ${msg.text}`, { vehicleId: v.id, incidentId: msg.incidentId ?? undefined });
  return crewReport(msg);
}

// ---------------------------------------------------------------- Befehle

/**
 * Die Leitstelle spricht (Text aus der Spracherkennung oder getippt).
 * group: geschaltete Rufgruppe (null = alle, z. B. beim Klick auf "Ansprechen").
 */
export function radioTalk(state: GameState, text: string, group: string | null = null): CommandResult {
  const said = text.trim();
  if (!said) return fail('Nichts gesprochen.');
  const f = funkOf(state);
  addLine(state, { from: 'leitstelle', group: group ?? undefined, text: said });

  const named = findCallsign(state, said);
  let v: Vehicle | null = named;
  if (!v && f.lastVehicleId && f.lastAt !== undefined && f.counter - f.lastAt <= CONTEXT_LINES) v = state.center.vehicles.find((x) => x.id === f.lastVehicleId) ?? null;
  if (!v) {
    addLine(state, { from: 'system', group: group ?? undefined, text: 'Kein Rufname erkannt – bitte das Fahrzeug mit Rufnamen ansprechen, z. B. „Florian Ostholstein 61-48-01 von Leitstelle, kommen“.' });
    return ok();
  }
  const vg = radioGroupOf(state.center, v)?.code;
  if (group && vg && vg !== group) {
    addLine(state, { from: 'system', group, text: `Keine Antwort – ${v.callsign} hört Rufgruppe ${vg}, geschaltet ist ${group}.` });
    return ok();
  }
  f.lastVehicleId = v.id;

  const order = detectOrder(state, said);
  const pending = unrevealed(state, v);
  const parts: string[] = [];
  let close: 'kommen' | 'Ende' | null = 'kommen';

  if (pending) parts.push(reveal(state, v, pending));

  if (order) {
    const r = execOrder(state, v, order, !!pending);
    if (r.text) parts.push(r.text);
    if (r.error) addLine(state, { from: 'system', group: group ?? undefined, text: r.error });
    close = r.close;
  } else if (!pending) {
    if (named) parts.push('hört');
    else parts.push('Leitstelle, bitte wiederholen');
  }

  if (parts.length) {
    const prefix = named ? `Hier ${v.callsign}, ` : '';
    const body = parts.join(', ');
    vehicleLine(state, v, group, `${prefix}${body}${close ? `, ${close}.` : '.'}`);
  }
  f.lastAt = f.counter;
  return ok();
}

function execOrder(state: GameState, v: Vehicle, order: Order, justRevealed: boolean): { text?: string; error?: string; close: 'kommen' | 'Ende' | null } {
  switch (order.k) {
    case 'status': {
      const st = statusDef(state, v.rt.status);
      return { text: `Status ${st.code}, ${st.label}`, close: 'kommen' };
    }
    case 'lage':
      return { text: lagemeldung(state, v), close: 'kommen' };
    case 'quittung': {
      if (justRevealed) return { close: 'kommen' };
      const msg = openRevealed(state, v);
      if (!msg) return { close: null };
      if (msg.kind === 'transportziel') return { text: 'erbitten noch Transportziel', close: 'kommen' };
      const r = acknowledgeRadio(state, msg.id);
      // auf "Verstanden, Ende" der Leitstelle antwortet niemand mehr
      return r.ok ? { close: null } : { error: r.error, close: null };
    }
    case 'transport': {
      const msg = state.runtime.radio.find((r) => r.vehicleId === v.id && !r.handled && r.kind === 'transportziel');
      if (!msg) return { text: 'haben keinen Patienten zum Transport', close: 'kommen' };
      msg.revealed = true;
      const r = assignHospital(state, msg.id, order.hospital.id);
      if (!r.ok) return { text: 'Leitstelle, bitte wiederholen', error: r.error, close: 'kommen' };
      return { text: `verstanden, fahren ${order.hospital.name} an`, close: 'Ende' };
    }
    case 'einsatz': {
      if (v.rt.incidentId === order.incident.id) return { text: 'sind bereits für diesen Einsatz alarmiert', close: 'kommen' };
      const r = alarmVehicles(state, order.incident.id, [v.id]);
      if (!r.ok) return { text: 'negativ, können nicht übernehmen', error: r.error, close: 'kommen' };
      return { text: `verstanden, übernehmen Einsatz ${order.incident.address}`, close: 'Ende' };
    }
    case 'einruecken': {
      if (!v.rt.incidentId) return { text: 'verstanden, sind bereits frei', close: 'Ende' };
      const r = releaseVehicle(state, v.id);
      if (!r.ok) return { text: 'negativ, haben Patienten an Bord', error: r.error, close: 'kommen' };
      return { text: 'verstanden, rücken ein', close: 'Ende' };
    }
  }
}

/** Knopf "Ansprechen": wie "<Rufname> von Leitstelle, kommen" */
export function radioCall(state: GameState, vehicleId: string): CommandResult {
  const v = state.center.vehicles.find((x) => x.id === vehicleId);
  if (!v) return fail('Fahrzeug nicht gefunden.');
  return radioTalk(state, `${v.callsign} von Leitstelle, kommen`, null);
}
