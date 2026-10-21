import type { GameState, Incident, Vehicle } from '../model/types';
import { alarmPolice, log, tickHooks, type CommandResult } from './engine';
import { etaFor, isPoliceVehicle, typeOf } from './dispatch';
import { vehicleAvailability } from './availability';
import { numberWord } from './funk';

/**
 * Telefonat mit der (simulierten) Polizeileitstelle.
 * Die Polizei disponiert ihre Streifen selbst. Die Leitstelle ruft an, teilt den Einsatz (dann sieht die
 * Polizei Ort, Stichwort und Infotext) und stellt eine Anforderung, z. B. "Wir brauchen zwei Streifen zur
 * Absicherung, Person aggressiv". Die Polizeileitstelle bestätigt und schickt die nächsten freien Streifen.
 */

export interface PoliceLine {
  at: number;
  from: 'leitstelle' | 'polizei';
  text: string;
}

export interface PoliceCall {
  open: boolean;
  shared: boolean;
  lines: PoliceLine[];
  /** von der Polizei bereits geschickte Streifen */
  sent: string[];
  pending?: { count: number; reason?: string };
}

const ok = (message?: string): CommandResult => ({ ok: true, message });
const fail = (error: string): CommandResult => ({ ok: false, error });

const findInc = (state: GameState, id: string) => state.runtime.incidents.find((i) => i.id === id && i.state !== 'abgeschlossen');

function callOf(inc: Incident): PoliceCall {
  inc.police ??= { open: false, shared: false, lines: [], sent: [] };
  return inc.police;
}

function say(state: GameState, inc: Incident, from: PoliceLine['from'], text: string) {
  const c = callOf(inc);
  c.lines.push({ at: state.runtime.clock.now, from, text });
  if (c.lines.length > 60) c.lines.splice(0, c.lines.length - 60);
}

const GREETINGS = ['Polizeileitstelle, guten Tag. Was kann ich für Sie tun?', 'Polizei, Einsatzleitstelle, guten Tag?', 'Polizeileitstelle, ja bitte?'];

/** Anruf bei der Polizeileitstelle beginnen */
export function policeCallOpen(state: GameState, incidentId: string): CommandResult {
  const inc = findInc(state, incidentId);
  if (!inc) return fail('Einsatz nicht gefunden.');
  const c = callOf(inc);
  if (c.open) return ok();
  c.open = true;
  say(state, inc, 'polizei', GREETINGS[c.lines.length % GREETINGS.length]);
  log(state, 'einsatz', 'Telefonat mit der Polizeileitstelle.', { incidentId: inc.id });
  return ok();
}

export function policeCallClose(state: GameState, incidentId: string): CommandResult {
  const inc = findInc(state, incidentId);
  if (!inc?.police?.open) return ok();
  inc.police.open = false;
  say(state, inc, 'polizei', 'Alles klar, auf Wiederhören.');
  return ok();
}

/** Einsatz an die Polizei teilen: Ort, Stichwort, Infotext */
export function policeShare(state: GameState, incidentId: string): CommandResult {
  const inc = findInc(state, incidentId);
  if (!inc) return fail('Einsatz nicht gefunden.');
  const c = callOf(inc);
  if (!c.open) policeCallOpen(state, incidentId);
  if (c.shared) return ok('Einsatz ist bereits geteilt.');
  c.shared = true;
  const kw = state.center.keywords.find((k) => k.id === inc.keywordId);
  say(state, inc, 'leitstelle', '(Einsatz geteilt)');
  say(state, inc, 'polizei', `Ich hab den Einsatz hier: ${kw ? `${kw.code}, ` : ''}${inc.address}${inc.description ? `, ${inc.description}` : ''}. Was brauchen Sie von uns?`);
  log(state, 'einsatz', 'Einsatz an die Polizei geteilt.', { incidentId: inc.id });
  return ok();
}

const COUNT_WORDS: Record<string, number> = { eine: 1, einen: 1, ein: 1, einer: 1 };

/** Anzahl angeforderter Streifen aus dem Satz (Standard 1) */
export function requestedPatrols(text: string): number {
  const n = text.toLowerCase();
  const m = /(\d+|[a-zäöüß]+)\s+(streifen|streife|streifenwagen|funkstreifen|funkstreife|wagen|fahrzeuge|fahrzeug|besatzungen|kräfte|beamte)\b/.exec(n);
  if (m) {
    const w = m[1];
    const num = /^\d+$/.test(w) ? Number(w) : (COUNT_WORDS[w] ?? numberWord(w));
    if (num && num > 0) return Math.min(num, 6);
  }
  return 1;
}

const REASONS: [RegExp, string][] = [
  [/messer|waffe|bewaffnet|schuss|pistole/, 'bewaffnete Person'],
  [/aggressiv|gewalt|schlägerei|schlaegerei|randal|bedroh|angriff/, 'aggressive Person'],
  [/absicher|verkehr|sperr|umleitung|stau/, 'Absicherung und Verkehrslenkung'],
  [/tot|leiche|verstorben|todesfall/, 'Todesfall'],
  [/einbruch|diebstahl|überfall|ueberfall|raub/, 'Straftat'],
  [/vermisst|suche|weggelaufen|demenz/, 'Personensuche'],
  [/unfall|verkehrsunfall|unfallaufnahme/, 'Unfallaufnahme'],
  [/brand|brandstift/, 'Brandermittlung'],
  [/tür|tuer|wohnungsöffnung|wohnungsoeffnung/, 'Wohnungsöffnung'],
  [/kampfmittel|bombe|munition|sprengstoff/, 'Kampfmittel, Absperrung'],
];

const isRequest = (n: string) => /(streife|polizei|beamte|unterstützung|unterstuetzung|schicken|brauchen|benötigen|benoetigen|anfordern|bitte um|kommen sie|vorbeischicken)/.test(n);
const isBye = (n: string) => /^(danke|vielen dank|tschüss|tschuess|auf wiederhören|auf wiederhoeren|ende)\b|\b(danke|tschüss|auf wiederhören)\s*[.!]?$/.test(n.trim());

/** Freie Streifen nach Anfahrtszeit */
function freePatrols(state: GameState, inc: Incident): Vehicle[] {
  return state.center.vehicles
    .filter((v) => isPoliceVehicle(state, v) && !v.rt.incidentId && vehicleAvailability(state, v).available && (typeOf(state, v)?.capabilities ?? []).includes('polizei'))
    .map((v) => ({ v, eta: etaFor(state, v, inc.position).etaMs }))
    .sort((a, b) => a.eta - b.eta)
    .map((x) => x.v);
}

/** Die Leitstelle spricht mit der Polizeileitstelle */
export function policeTalk(state: GameState, incidentId: string, text: string): CommandResult {
  const inc = findInc(state, incidentId);
  if (!inc) return fail('Einsatz nicht gefunden.');
  const said = text.trim();
  if (!said) return fail('Nichts gesagt.');
  const c = callOf(inc);
  if (!c.open) policeCallOpen(state, incidentId);
  say(state, inc, 'leitstelle', said);
  const n = said.toLowerCase();

  if (isBye(n) && !isRequest(n)) return policeCallClose(state, incidentId);

  // Ort genannt? Dann kennt die Polizei den Einsatz auch ohne Teilen
  const street = inc.address.split(',')[0].replace(/\s+\d+\s*[a-z]?$/i, '').toLowerCase();
  if (!c.shared && street.length >= 4 && n.includes(street)) c.shared = true;

  if (!isRequest(n)) {
    say(state, inc, 'polizei', c.shared ? 'Verstanden. Brauchen Sie eine Streife vor Ort?' : 'Wo genau ist das und was ist passiert? Sie können mir den Einsatz auch teilen.');
    return ok();
  }
  if (!c.shared) {
    say(state, inc, 'polizei', 'Gerne – wo genau ist die Einsatzstelle? Am einfachsten teilen Sie mir den Einsatz, dann habe ich alles.');
    return ok();
  }
  const want = requestedPatrols(n);
  const reason = REASONS.find(([re]) => re.test(n))?.[1];
  const free = freePatrols(state, inc).slice(0, want);
  if (!free.length) {
    c.pending = { count: want, reason };
    say(state, inc, 'polizei', 'Verstanden. Im Moment ist leider keine Streife frei – ich schicke die nächste, sobald eine frei wird. Rufen Sie gern noch mal an, wenn es dringender wird.');
    log(state, 'einsatz', `Polizei angefordert (${want}), derzeit keine Streife frei.`, { incidentId: inc.id });
    return ok();
  }
  const r = alarmPolice(
    state,
    inc.id,
    free.map((v) => v.id),
  );
  if (!r.ok) {
    say(state, inc, 'polizei', 'Moment … das klappt gerade nicht, ich melde mich gleich.');
    return ok();
  }
  c.sent.push(...free.map((v) => v.id));
  c.pending = free.length < want ? { count: want - free.length, reason } : undefined;
  const eta = Math.max(1, Math.round(etaFor(state, free[0], inc.position).etaMs / 60000));
  const what = free.length === 1 ? 'eine Streife' : `${free.length} Streifen`;
  const short = free.length < want ? ` Mehr habe ich gerade nicht frei.` : '';
  say(state, inc, 'polizei', `Alles klar, ich schicke ${what}${reason ? ` wegen ${reason}` : ''} zur ${inc.address.split(',')[0]}. Die sind in etwa ${eta} Minuten da.${short}`);
  log(state, 'einsatz', `Polizei schickt ${what}: ${free.map((v) => v.callsign).join(', ')}.`, { incidentId: inc.id });
  return ok();
}

/** Zugesagte Streifen nachschicken, sobald welche frei werden */
tickHooks.push((state) => {
  for (const inc of state.runtime.incidents) {
    const p = inc.police?.pending;
    if (!p || inc.state === 'abgeschlossen') continue;
    const free = freePatrols(state, inc).slice(0, p.count);
    if (!free.length) continue;
    if (!alarmPolice(state, inc.id, free.map((v) => v.id)).ok) continue;
    inc.police!.sent.push(...free.map((v) => v.id));
    p.count -= free.length;
    if (p.count <= 0) inc.police!.pending = undefined;
    log(state, 'einsatz', `Polizei schickt nachträglich ${free.map((v) => v.callsign).join(', ')}.`, { incidentId: inc.id });
  }
});
