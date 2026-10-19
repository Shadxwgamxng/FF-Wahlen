import type { KeywordCategory } from '../model/types';
import type { Facts } from '../data/questions';
import { findQuestion } from '../data/questions';
import { hashSeed } from './details/types';
import { CallerVoice, initialEmotion, lowerFirst, personalityFor, voiceFor, type Emotion, type Personality, type VoicePersona } from './style';
import type { GeneratedLocation } from '../sim/callgen';
import { matchIntents, normalize, type ConversationIntent } from './intents';
import { answerDetail, findDetail } from './details';

/**
 * Simulierter Anrufer für den Sprachtest – rein regelbasiert, ohne KI und ohne Netzwerk.
 *
 * Grundsatz: Der Anrufer erfindet keine Fakten. Jede inhaltliche Antwort kommt aus den
 * Antwortfunktionen in data/questions.ts, die nur die verdeckten Szenariofakten lesen
 * (fehlt ein Fakt, sagt der Anrufer, dass er es nicht weiß). Alles andere sind feste
 * Gesprächsfloskeln ohne Sachinhalt (Nachfragen, Bestätigen, Drängen).
 *
 * Damit es nicht künstlich klingt, hat jeder Anrufer eine Persönlichkeit (style.ts) und
 * formuliert jede Antwort in einer von mehreren Varianten mit Füllwörtern, Abbrüchen und
 * Wiederholungen – deterministisch je Anruf.
 */

export type { Emotion, Personality, VoicePersona } from './style';
export { initialEmotion } from './style';

export interface VoiceCall {
  scenarioId: string;
  scenarioName: string;
  variantIdx: number;
  category: KeywordCategory;
  opening: string;
  caller: { name: string; relation: string; phone: string };
  facts: Facts;
  location: GeneratedLocation;
}

export interface CallerTurn {
  text: string;
  /** erkannte Fragen (IDs aus data/questions.ts) */
  questions: string[];
  intents: ConversationIntent[];
  /** false, wenn der Anrufer nichts verstanden hat */
  understood: boolean;
  emotion: Emotion;
  /** Anrufer hat sich verabschiedet */
  ended: boolean;
  /** Inhaltliche Antworten ohne Füllwörter (für Prüfung und Auswertung) */
  content: string[];
}

const MAX_ANSWERS_PER_TURN = 3;

/** Buchstabiertafel nach DIN 5009 (Ausgabe 2022, Städtenamen) */
const SPELLING: Record<string, string> = {
  a: 'Aachen', ä: 'Umlaut Aachen', b: 'Berlin', c: 'Chemnitz', d: 'Düsseldorf', e: 'Essen', f: 'Frankfurt', g: 'Goslar', h: 'Hamburg', i: 'Ingelheim',
  j: 'Jena', k: 'Köln', l: 'Leipzig', m: 'München', n: 'Nürnberg', o: 'Offenbach', ö: 'Umlaut Offenbach', p: 'Potsdam', q: 'Quickborn', r: 'Rostock',
  s: 'Salzwedel', ß: 'Eszett', t: 'Tübingen', u: 'Unna', ü: 'Umlaut Unna', v: 'Völklingen', w: 'Wuppertal', x: 'Xanten', y: 'Ypsilon', z: 'Zwickau',
};

export function spellWord(word: string): string {
  const parts: string[] = [];
  for (const ch of word.toLowerCase()) {
    if (SPELLING[ch]) parts.push(`${ch === 'ß' ? 'ß' : ch.toUpperCase()} wie ${SPELLING[ch]}`);
    else if (ch === ' ' || ch === '-') parts.push(ch === '-' ? 'Bindestrich' : 'Leerzeichen');
    else if (/[0-9]/.test(ch)) parts.push(ch);
  }
  return parts.join(', ');
}

export function personaFor(emotion: Emotion, personality: Personality = 'ruhig'): VoicePersona {
  return voiceFor(personality, emotion);
}

/** Seed für Persönlichkeit und Formulierungen eines Anrufs */
export const callSeed = (call: Pick<VoiceCall, 'scenarioId' | 'caller'>) => `${call.scenarioId}|${call.caller.phone}|${call.caller.name}`;

/** Eröffnung je nach Persönlichkeit und Gefühlslage einleiten (der Eröffnungssatz selbst bleibt unverändert) */
export function openingLine(opening: string, personality: Personality, emotion: Emotion, name: string, voice: CallerVoice): string {
  const line = (intro: string) => (intro.endsWith('–') ? `${intro} ${lowerFirst(opening)}` : `${intro} ${opening}`.trim());
  if (emotion === 2) return line(voice.pick(['Hallo?! Hallo, bitte –', 'Hallo? Hallo! Bitte, schnell –', 'Ja, hallo, bitte –']));
  switch (personality) {
    case 'aelter':
      return line(voice.pick([`Ja, guten Tag, hier ist ${name}.`, `Ja, hallo, hier spricht ${name}.`, 'Ja, guten Tag …']));
    case 'redselig':
      return line(voice.pick([`Ja, hallo, hier ist ${name}, also –`, 'Ja, hallo, also passen Sie auf –', 'Hallo, ja, äh –']));
    case 'aufgeregt':
      return line(voice.pick(['Hallo? Ja –', 'Ja, hallo, äh –', 'Hallo!']));
    case 'ruhig':
      return line(voice.pick(['Ja, guten Tag.', 'Ja, hallo.', '']));
    default:
      return opening;
  }
}
export class CallerSim {
  readonly asked = new Set<string>();
  readonly personality: Personality;
  readonly voice: CallerVoice;
  emotion: Emotion;
  ended = false;
  private openingSaid = false;
  private lastAnswer = '';
  private misunderstood = 0;
  private turns = 0;
  private reassured = false;

  constructor(readonly call: VoiceCall) {
    const seed = callSeed(call);
    this.personality = personalityFor(seed, call.facts);
    this.voice = new CallerVoice(this.personality, hashSeed(`${seed}|stimme`));
    this.emotion = initialEmotion(call.facts, this.personality);
  }

  /** Reaktion auf eine Äußerung des Disponenten */
  respond(utterance: string): CallerTurn {
    const base = { questions: [] as string[], intents: [] as ConversationIntent[], emotion: this.emotion, content: [] as string[] };
    const v = this.voice;
    if (this.ended) return { ...base, text: '', understood: false, ended: true };
    const said = utterance.trim();
    if (!said) return { ...base, text: '', understood: false, ended: false };
    this.turns++;
    const m = matchIntents(said, this.call.category);
    const parts: string[] = [];
    let content = false;

    if (!this.openingSaid) {
      parts.push(openingLine(this.call.opening, this.personality, this.emotion, this.call.caller.name, v));
      this.openingSaid = true;
    }

    if (m.intents.includes('wiederholen') && !m.questions.length && this.lastAnswer) {
      parts.push(`${v.phrase('wiederholung')} ${this.lastAnswer}`);
      content = true;
    }
    let nameSpelled = false;
    if (m.intents.includes('buchstabieren')) {
      // Was soll buchstabiert werden? Name, Ort oder (Standard) die Straße
      const n = normalize(said);
      nameSpelled = / (name|namen|nachname)/.test(n);
      const target = nameSpelled ? this.call.caller.name : / (ort|stadt|gemeinde)/.test(n) ? this.call.location.city : this.call.location.street;
      if (target) {
        parts.push(`${target}: ${spellWord(target)}.`);
        content = true;
      }
    }
    if (m.intents.includes('name') && !nameSpelled) {
      parts.push(v.pick([`Mein Name ist ${this.call.caller.name}.`, `${this.call.caller.name}.`, `${this.call.caller.name}, ich heiße ${this.call.caller.name}.`, `Ich bin ${this.call.caller.name}.`]));
      content = true;
    }

    const answers: string[] = [];
    const spoken: string[] = [];
    for (const qid of m.questions.slice(0, MAX_ANSWERS_PER_TURN)) {
      let a: string;
      if (findDetail(qid)) {
        // Detail ohne Szenariofakt: wird beim ersten Mal passend festgelegt und gemerkt
        a = answerDetail({ scenarioId: this.call.scenarioId, category: this.call.category, facts: this.call.facts, relation: this.call.caller.relation }, qid);
      } else {
        const q = findQuestion(this.call.category, qid);
        if (!q) continue;
        a = q.answer(this.call.facts, v.pick);
      }
      spoken.push(a);
      answers.push(this.asked.has(qid) ? `${v.phrase('schonGesagt')} ${a}` : v.naturalize(a, this.emotion));
      this.asked.add(qid);
    }
    if (answers.length) {
      parts.push(...answers);
      this.lastAnswer = answers.join(' ');
      content = true;
    }

    let acknowledged = false;
    if (m.intents.includes('beruhigen')) {
      this.reassured = true;
      if (this.emotion > 0) this.emotion = (this.emotion - 1) as Emotion;
      if (!answers.length) {
        parts.push(v.phrase(this.emotion >= 1 ? 'beruhigtNochAufgeregt' : 'beruhigt'));
        acknowledged = true;
      }
      content = true;
    }
    if (m.intents.includes('anweisung') && !answers.length && !acknowledged) {
      // reine Verständnisquittung – der Anrufer sagt keine Handlung zu, die die Simulation nicht abbildet
      parts.push(v.phrase('verstanden'));
      content = true;
    }
    if (m.intents.includes('ende')) {
      parts.push(v.phrase('ende'));
      this.ended = true;
      content = true;
    }

    if (!content) {
      if (m.intents.includes('begruessung') && parts.length) {
        // nur Begrüßung: der Anrufer hat mit seinem Eröffnungssatz geantwortet
      } else if (m.intents.includes('begruessung')) {
        parts.push(v.phrase('hallo'));
      } else if (!parts.length) {
        this.misunderstood++;
        if (this.misunderstood >= 2 && this.emotion < 2) this.emotion = (this.emotion + 1) as Emotion;
        parts.push(v.phrase(this.misunderstood >= 2 ? 'nichtVerstanden2' : 'nichtVerstanden'));
      }
    } else {
      this.misunderstood = 0;
    }

    // Ohne Zusage, dass Hilfe kommt, wird der Anrufer mit der Zeit ungeduldiger
    if (!this.ended && !this.reassured && this.turns >= 5 && this.turns % 3 === 2) {
      if (this.emotion < 2) this.emotion = (this.emotion + 1) as Emotion;
      parts.push(v.phrase('ungeduldig'));
    } else if (!this.ended && this.emotion === 2 && this.turns % 3 === 0) {
      parts.push(v.phrase('beeilen'));
    }

    return {
      text: parts.join(' '),
      questions: m.questions.slice(0, MAX_ANSWERS_PER_TURN),
      intents: m.intents,
      understood: content || m.intents.length > 0,
      emotion: this.emotion,
      ended: this.ended,
      content: spoken,
    };
  }
}
