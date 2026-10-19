import type { FunkLine, FunkState, GameState, Hospital, Incident, RadioMessage, Vehicle } from '../model/types';
import { radioGroupOf } from '../model/radio';
import { sceneSummary } from './lagemeldung';
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

/** Ziffernfolgen aus 1–3 aufeinanderfolgenden Zahlen ohne Trenner: [6148, 1] → "6148", "61481", "1" */
function joinedWindows(nums: number[]): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < nums.length; i++) for (let k = 1; k <= 3 && i + k <= nums.length; k++) out.add(nums.slice(i, i + k).join(''));
  return out;
}

function containsSeq(hay: number[], needle: number[]): boolean {
  if (!needle.length || needle.length > hay.length) return false;
  for (let i = 0; i + needle.length <= hay.length; i++) if (needle.every((n, j) => hay[i + j] === n)) return true;
  return false;
}

/** Fahrzeug, dessen Rufname im Text vorkommt (bei Gleichstand mit Organisationswort bevorzugt); null = keins oder mehrdeutig */
export function findCallsign(state: GameState, text: string): Vehicle | null {
  return matchCallsign(state, text).vehicle;
}

/**
 * Rufnamensuche mit Auskunft, ob überhaupt ein Rufname versucht wurde (Organisationswort oder Zahlenfolge).
 * Nur ohne Rufnamenversuch darf ein Folgesatz dem zuletzt angesprochenen Fahrzeug gelten.
 */
export function matchCallsign(state: GameState, text: string): { vehicle: Vehicle | null; attempted: boolean; ambiguous: boolean } {
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
    } else if (seq.length === 3 && joinedWindows(nums).has(seq.join(''))) {
      // Erkennung hat Zahlen zusammengezogen: "6148 1" oder "61481" = 61-48-1 (statt "null eins")
      hits.push({ v, score: 29 + (named ? 5 : 0) });
    } else if (!seq.length && norm.includes(` ${v.callsign.toLowerCase()} `)) hits.push({ v, score: 50 });
  }
  hits.sort((a, b) => b.score - a.score);
  const words = new Set(state.center.vehicles.map((v) => callsignWord(v.callsign)));
  const attempted = hits.length > 0 || [...words].some((w) => w.length >= 4 && norm.includes(` ${w} `)) || nums.filter((n) => n >= 10).length >= 2 || nums.some((n) => n >= 1000);
  if (!hits.length) return { vehicle: null, attempted, ambiguous: false };
  if (hits.length > 1 && hits[0].score === hits[1].score) return { vehicle: null, attempted: true, ambiguous: true };
  return { vehicle: hits[0].v, attempted: true, ambiguous: false };
}

/** Text für die Sprachausgabe: Rufnamen in Zahlengruppen ("61 48 1" = einundsechzig achtundvierzig eins), ohne Bindestriche */
export function toSpeech(text: string): string {
  return text
    .replace(/(\d+)[-/](\d+)(?:-(\d+))?/g, (_, a: string, b: string, c?: string) => [a, b, c].filter(Boolean).map((x) => x!.replace(/^0(\d)$/, '$1')).join(' '))
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

/** Ortsnamen zählen bei Kliniken nur wenig (sonst wäre "nach Eutin" ein Transportziel) */
function placeTokens(state: GameState): Set<string> {
  const out = new Set<string>();
  for (const i of state.runtime.incidents) for (const t of tokenize(i.address.split(',').slice(1).join(' '))) out.add(t);
  for (const a of state.center.areas ?? []) for (const t of tokenize(a.name)) out.add(t);
  for (const s of state.center.stations) for (const t of tokenize(s.address ?? '')) if (!/\d/.test(t)) out.add(t);
  return out;
}

export function matchHospital(state: GameState, norm: string): { hospital: Hospital | null; distinctive: boolean } {
  const places = placeTokens(state);
  let best: { h: Hospital; score: number; share: number; distinctive: boolean } | null = null;
  let tie = false;
  for (const h of state.center.hospitals) {
    const tokens = [...new Set(tokenize(h.name))];
    let score = 0;
    let distinctive = false;
    let own = 0;
    let ownHit = 0;
    for (const t of tokens) {
      const generic = GENERIC_HOSPITAL.has(t);
      const place = places.has(t);
      if (!generic) own++;
      if (!norm.includes(` ${t} `)) continue;
      if (generic) score += 0.1;
      else if (place) score += 0.5;
      else {
        score += 1;
        distinctive = true;
      }
      if (!generic) ownHit++;
    }
    const share = own ? ownHit / own : 0;
    if (score <= 0) continue;
    if (!best || score > best.score || (score === best.score && share > best.share)) [best, tie] = [{ h, score, share, distinctive }, false];
    else if (score === best.score && share === best.share) tie = true;
  }
  return best && best.score >= 0.5 && !tie ? { hospital: best.h, distinctive: best.distinctive } : { hospital: null, distinctive: false };
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
  | { k: 'info' }
  | { k: 'transport'; hospital: Hospital }
  | { k: 'einsatz'; incident: Incident }
  | { k: 'einruecken' }
  | { k: 'lage' }
  | { k: 'status' }
  | { k: 'quittung' };

/**
 * Auftrag im Funkspruch. transportWanted: Fahrzeug wartet auf ein Transportziel – dann genügt ein Klinikname,
 * sonst braucht es ein Klinikwort ("Krankenhaus", "Klinikum", "Transportziel") oder einen eindeutigen Kliniknamen.
 */
export function detectOrder(state: GameState, text: string, transportWanted = false): Order | null {
  const n = normalizeFunk(text);
  const question = /\?\s*$/.test(text.trim());
  // Lagemitteilung an das Fahrzeug ("Anrufer meldet …", "Zur Info …") – wird zurückbestätigt
  if (INFO_START.test(n)) return { k: 'info' };
  // Lagemeldung zuerst – "wie ist die Lage am Einsatz Kirchhofsallee?" ist keine Zuteilung
  if (has(n, / (lage|lagemeldung|rückmeldung|rueckmeldung|wie sieht es aus|wie ist die lage|was ist los|situation) /)) return { k: 'lage' };
  const { hospital, distinctive } = matchHospital(state, n);
  const hospitalWord = has(n, / (krankenhaus|klinik|klinikum|transportziel|zielklinik) /);
  if (hospital && (transportWanted || hospitalWord || distinctive) && has(n, / (krankenhaus|klinik|klinikum|transportziel|ziel|fahren sie|bringen sie|nach|ins|in die|anfahren|zum|zur) /))
    return { k: 'transport', hospital };
  const incident = has(n, / (einsatz|einsatzstelle|übernehmen|uebernehmen|alarm|fahren sie|anfahren) /) ? matchIncident(state, n) : null;
  if (incident && has(n, / (übernehmen|uebernehmen|alarm|fahren sie|anfahren|einsatz \d|einsatznummer|zur einsatzstelle) /)) return { k: 'einsatz', incident };
  if (!question && has(n, / (einrücken|einruecken|rücken sie ein|ruecken sie ein|rückt ein|rueckt ein|können einrücken|koennen einruecken|zur wache|zurück zur wache|sind entlassen|sie sind frei) /)) return { k: 'einruecken' };
  if (incident) return { k: 'einsatz', incident };
  if (has(n, / status /) && !has(n, / status (\d|eins|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht) /)) return { k: 'status' };
  if (has(n, / (verstanden|quittiert|veranlasst|wird alarmiert|werden alarmiert|kommt|kommen sofort|ist unterwegs|sind unterwegs|wird erledigt|in ordnung|okay|ok|roger|wird geschickt) /)) return { k: 'quittung' };
  return null;
}

const INFO_START = / (anrufer|anruferin|melder|zeuge|zeugin) (meldet|sagt|berichtet|gibt an|teilt mit)| (zur info|zur information|information|nachtrag|nachmeldung|mitteilung|neue lage|lageänderung|lageaenderung|achtung|hinweis) /;

/** Wörter, die zum Funkverkehr gehören, nicht zum Inhalt */
const FRAME_WORDS = new Set(['von', 'für', 'fuer', 'hier', 'leitstelle', 'kommen', 'ende', 'ostholstein']);

/**
 * Inhalt eines Funkspruchs ohne Rufnamen und Funkfloskeln:
 * "Florian Ostholstein 61-82-01 von Leitstelle, Anrufer meldet …, kommen" → "Anrufer meldet …"
 */
export function messageContent(text: string): string {
  let t = text.trim().replace(/[.!]+\s*$/, '');
  // Rufname vorn: alles bis zur letzten Zahl in den ersten Wörtern
  const words = t.split(/\s+/);
  let cut = -1;
  for (let i = 0; i < Math.min(words.length, 8); i++) {
    const w = words[i].toLowerCase().replace(/[^0-9a-zäöüß/-]/g, '');
    if (/\d/.test(w) || numberWord(w) !== null) cut = i;
  }
  if (cut >= 0) t = words.slice(cut + 1).join(' ');
  // "von Leitstelle," / ", kommen" / ", Ende"
  t = t.replace(/^[,\s]*((von|für|fuer|hier)\s+)?(der\s+)?leitstelle[,\s]*/i, '');
  t = t.replace(/[,\s]+(kommen|ende)\s*$/i, '').replace(/^[,\s]+|[,\s]+$/g, '');
  return t;
}

const contentWords = (content: string) => normalizeFunk(content).trim().split(' ').filter((w) => w && !FRAME_WORDS.has(w));

/** Sinngemäße Wiederholung einer Mitteilung durch die Besatzung */
export function readBack(content: string): string {
  let t = content.trim();
  const RW: [RegExp, string][] = [
    [/\b(der |die )?(anrufer|anruferin|melder|zeuge|zeugin)\s+(meldet|sagt|berichtet|gibt an|teilt mit)(,?\s*dass)?[:,]?\s*/gi, ''],
    [/\b(zur info(rmation)?|information|nachtrag|nachmeldung|mitteilung|hinweis|achtung)[:,]?\s*/gi, ''],
    [/\b(jetzt|derzeit|aktuell|nun)\s+unter\s+(laufender\s+|laufenden\s+)?reanimation(smaßnahmen|smassnahmen)?\b/gi, 'wird nun reanimiert'],
    [/\bunter\s+(laufender\s+|laufenden\s+)?reanimation(smaßnahmen|smassnahmen)?\b/gi, 'wird reanimiert'],
    [/\bwird jetzt\b/gi, 'wird nun'],
    [/\bist jetzt\b/gi, 'ist nun'],
    [/\bjetzt\b/gi, 'nun'],
  ];
  for (const [re, by] of RW) t = t.replace(re, by);
  t = t.replace(/\s{2,}/g, ' ').replace(/^[,\s]+|[,\s.]+$/g, '');
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
}

const ACKS = ['das haben wir verstanden', 'verstanden', 'haben wir mitgeschrieben', 'ist verstanden'];

/** Lagemitteilung zurückbestätigen – je nach Lage des Fahrzeugs mit Ankunftszeit */
function infoReply(state: GameState, v: Vehicle, content: string): string {
  const f = funkOf(state);
  const parts = [readBack(content), ACKS[f.counter % ACKS.length]].filter(Boolean);
  const m = v.rt.move;
  if (m && m.purpose === 'einsatz' && (v.rt.status === 'anfahrt' || v.rt.status === 'alarmiert')) {
    const min = Math.max(1, Math.round((m.arriveAt - state.runtime.clock.now) / 60000));
    parts.push(`sind in etwa ${min === 1 ? 'einer Minute' : `${min} Minuten`} vor Ort`);
  } else if (v.rt.status === 'alarmiert') parts.push('rücken gleich aus');
  const inc = v.rt.incidentId ? state.runtime.incidents.find((i) => i.id === v.rt.incidentId) : undefined;
  if (inc) log(state, 'funk', `Leitstelle an ${v.callsign}: ${content}`, { vehicleId: v.id, incidentId: inc.id });
  return parts.join(', ');
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
  const t = msg.text.replace(/[.!]\s*$/, '');
  // "Hier Florian …, eingetroffen. …"
  return t.startsWith('Eingetroffen') ? `e${t.slice(1)}` : t;
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
    parts.push(...sceneSummary(state, inc));
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

  const cs = matchCallsign(state, said);
  const named = cs.vehicle;
  let v: Vehicle | null = named;
  // Folgesatz ohne Rufnamen gilt dem zuletzt angesprochenen Fahrzeug – nie, wenn ein (unklarer) Rufname gesagt wurde
  if (!v && !cs.attempted && f.lastVehicleId && f.lastAt !== undefined && f.counter - f.lastAt <= CONTEXT_LINES) v = state.center.vehicles.find((x) => x.id === f.lastVehicleId) ?? null;
  if (!v) {
    addLine(state, {
      from: 'system',
      group: group ?? undefined,
      text: cs.ambiguous
        ? 'Rufname nicht eindeutig – bitte den vollständigen Rufnamen nennen.'
        : cs.attempted
          ? 'Rufname nicht erkannt – kein Fahrzeug mit diesem Rufnamen. Bitte wiederholen.'
          : 'Kein Rufname erkannt – bitte das Fahrzeug mit Rufnamen ansprechen, z. B. „Florian Ostholstein 61-48-01 von Leitstelle, kommen“.',
    });
    f.lastVehicleId = undefined;
    return ok();
  }
  const vg = radioGroupOf(state.center, v)?.code;
  if (group && vg && vg !== group) {
    addLine(state, { from: 'system', group, text: `Keine Antwort – ${v.callsign} hört Rufgruppe ${vg}, geschaltet ist ${group}.` });
    return ok();
  }
  f.lastVehicleId = v.id;

  const transportWanted = state.runtime.radio.some((r) => r.vehicleId === v.id && !r.handled && r.kind === 'transportziel');
  const order = detectOrder(state, said, transportWanted);
  const pending = unrevealed(state, v);
  const parts: string[] = [];
  let close: 'kommen' | 'Ende' | null = 'kommen';

  // alle offenen Anliegen des Fahrzeugs, ältestes zuerst
  if (pending) for (const m of state.runtime.radio.filter((r) => r.vehicleId === v.id && !r.handled && r.revealed === false)) parts.push(reveal(state, v, m));

  const content = messageContent(said);
  if (order?.k === 'info' || (!order && contentWords(content).length >= 3)) {
    // Mitteilung der Leitstelle: sinngemäß wiederholen und bestätigen
    parts.push(infoReply(state, v, content));
  } else if (order) {
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
  // nach "Ende" ist das Gespräch vorbei
  if (close === 'Ende' || (order?.k === 'quittung' && close === null)) f.lastVehicleId = undefined;
  return ok();
}

function execOrder(state: GameState, v: Vehicle, order: Order, justRevealed: boolean): { text?: string; error?: string; close: 'kommen' | 'Ende' | null } {
  switch (order.k) {
    case 'info':
      return { close: 'kommen' };
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
      return { text: `verstanden, übernehmen Einsatz ${order.incident.address.split(',')[0]}`, close: 'Ende' };
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
