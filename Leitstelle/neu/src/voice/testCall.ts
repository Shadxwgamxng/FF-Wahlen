import type { GameState } from '../model/types';
import type { Facts } from '../data/questions';
import { findScenario } from '../data/scenarios';
import { CALLER_NAMES, randomLocation, resolveFact } from '../sim/callgen';
import { truthKeywordCode, truthMeldebild } from '../sim/engine';
import { Rng } from '../sim/rng';
import type { VoiceCall } from './caller';

/**
 * Fester Testfall des Sprachtests: Küchenbrand, Person noch in der Wohnung (Variante 0).
 * Der Seed bestimmt Adresse, Stockwerk, Ausbreitung usw. – gleicher Seed, gleicher Anruf.
 */
export const VOICE_TEST_SCENARIO = 'brand_kueche';
export const VOICE_TEST_VARIANT = 0;

export function buildVoiceTestCall(state: GameState, seed: number): VoiceCall {
  const sc = findScenario(VOICE_TEST_SCENARIO)!;
  const variant = sc.variants?.[VOICE_TEST_VARIANT] ?? null;
  const rng = new Rng(seed);
  const facts: Facts = {};
  for (const [k, spec] of Object.entries({ ...sc.facts, ...(variant?.facts ?? {}) })) facts[k] = resolveFact(spec, rng);
  const location = randomLocation(state, rng, sc.location);
  const phone = `0${rng.int(1500, 1799)} ${rng.int(100000, 999999)}`;
  facts._address = location.address;
  facts._detail = location.detail;
  facts._phone = phone;
  return {
    scenarioId: sc.id,
    scenarioName: `${sc.name}${variant ? ` – ${variant.label}` : ''}`,
    variantIdx: variant ? VOICE_TEST_VARIANT : -1,
    category: sc.category,
    // Eröffnung eines Nachbarn: passt zur Variante "Person in Wohnung"
    opening: sc.openings[0],
    caller: { name: rng.pick(CALLER_NAMES), relation: 'Nachbar/-in', phone },
    facts,
    location,
  };
}

/** Was der Disponent während des Gesprächs selbst in die Maske eingetragen hat */
export interface VoiceEntry {
  street: string;
  houseNumber: string;
  city: string;
  trapped: 'ja' | 'nein' | 'unbekannt';
  injured: string;
  meldebildId: string;
  keywordId: string;
  notes: string;
}

export const emptyVoiceEntry = (): VoiceEntry => ({ street: '', houseNumber: '', city: '', trapped: 'unbekannt', injured: '', meldebildId: '', keywordId: '', notes: '' });

export interface EvalItem {
  label: string;
  ok: boolean;
  expected: string;
  given: string;
}

export interface VoiceEvaluation {
  items: EvalItem[];
  score: number;
  total: number;
  durationSeconds: number;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .replace(/str\.(?=\s|$)/g, 'strasse')
    .replace(/[^a-z0-9äöü]+/g, '');

/** Vergleicht die Eingaben des Disponenten mit der Spielwahrheit – erst nach Gesprächsende */
export function evaluateVoiceTest(state: GameState, call: VoiceCall, entry: VoiceEntry, askedQuestions: Iterable<string>, durationSeconds: number): VoiceEvaluation {
  const asked = new Set(askedQuestions);
  const sc = findScenario(call.scenarioId)!;
  const items: EvalItem[] = [];
  const add = (label: string, ok: boolean, expected: string, given: string) => items.push({ label, ok, expected, given: given || '–' });

  add('Einsatzort abgefragt', asked.has('ort'), 'Frage nach dem Notfallort', asked.has('ort') ? 'gestellt' : 'nicht gestellt');
  add('Straße', norm(entry.street) === norm(call.location.street), call.location.street, entry.street);
  add('Hausnummer', norm(entry.houseNumber) === norm(call.location.houseNumber), call.location.houseNumber, entry.houseNumber);
  if (call.location.city) add('Ort', norm(entry.city) === norm(call.location.city), call.location.city, entry.city);
  for (const q of sc.keyQuestions) {
    const label = { b_personen: 'Personen in Gefahr abgefragt', b_stock: 'Stockwerk abgefragt' }[q] ?? `Schlüsselfrage ${q}`;
    add(label, asked.has(q), 'gestellt', asked.has(q) ? 'gestellt' : 'nicht gestellt');
  }
  const trapped = call.facts.trapped === true ? 'ja' : call.facts.trapped === false ? 'nein' : 'unbekannt';
  add('Personen in Gefahr eingetragen', entry.trapped === trapped, trapped, entry.trapped === 'unbekannt' ? '' : entry.trapped);
  const injured = typeof call.facts.injured === 'number' ? call.facts.injured : 0;
  add('Anzahl Verletzte', entry.injured.trim() !== '' && Number(entry.injured) === injured, String(injured), entry.injured);

  const catalogId = state.center.catalogId ?? 'standard';
  const mbLabel = truthMeldebild(call.scenarioId, call.variantIdx, catalogId);
  if (mbLabel) {
    const given = state.center.meldebilder.find((m) => m.id === entry.meldebildId)?.label ?? '';
    add('Meldebild', given === mbLabel, mbLabel, given);
  }
  const code = truthKeywordCode(call.scenarioId, call.variantIdx, catalogId);
  const givenKw = state.center.keywords.find((k) => k.id === entry.keywordId)?.code ?? '';
  add('Stichwort', givenKw === code, code, givenKw);

  return { items, score: items.filter((i) => i.ok).length, total: items.length, durationSeconds: Math.round(durationSeconds) };
}
