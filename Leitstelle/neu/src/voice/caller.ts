import type { KeywordCategory } from '../model/types';
import type { Facts } from '../data/questions';
import { findQuestion } from '../data/questions';
import type { GeneratedLocation } from '../sim/callgen';
import { matchIntents, type ConversationIntent } from './intents';

/**
 * Simulierter Anrufer für den Sprachtest – rein regelbasiert, ohne KI und ohne Netzwerk.
 *
 * Grundsatz: Der Anrufer erfindet keine Fakten. Jede inhaltliche Antwort kommt aus den
 * Antwortfunktionen in data/questions.ts, die nur die verdeckten Szenariofakten lesen
 * (fehlt ein Fakt, sagt der Anrufer, dass er es nicht weiß). Alles andere sind feste
 * Gesprächsfloskeln ohne Sachinhalt (Nachfragen, Bestätigen, Drängen).
 */

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

/** 0 = ruhig, 1 = aufgeregt, 2 = panisch */
export type Emotion = 0 | 1 | 2;

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
}

export interface VoicePersona {
  rate: number;
  pitch: number;
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

export function initialEmotion(facts: Facts): Emotion {
  if (facts.trapped === true || facts.conscious === false || facts.breathing === 'nein' || facts.visible === false) return 2;
  if ((typeof facts.injured === 'number' && facts.injured > 0) || facts.spreading === true || facts.weapon === true) return 1;
  return 0;
}

export function personaFor(emotion: Emotion): VoicePersona {
  return { rate: 1 + emotion * 0.1, pitch: 1 + emotion * 0.08 };
}

export class CallerSim {
  readonly asked = new Set<string>();
  emotion: Emotion;
  ended = false;
  private openingSaid = false;
  private lastAnswer = '';
  private misunderstood = 0;
  private turns = 0;
  private reassured = false;

  constructor(readonly call: VoiceCall) {
    this.emotion = initialEmotion(call.facts);
  }

  /** Reaktion auf eine Äußerung des Disponenten */
  respond(utterance: string): CallerTurn {
    const base = { questions: [] as string[], intents: [] as ConversationIntent[], emotion: this.emotion };
    if (this.ended) return { ...base, text: '', understood: false, ended: true };
    const said = utterance.trim();
    if (!said) return { ...base, text: '', understood: false, ended: false };
    this.turns++;
    const m = matchIntents(said, this.call.category);
    const parts: string[] = [];
    let content = false;

    if (!this.openingSaid) {
      parts.push(this.call.opening);
      this.openingSaid = true;
    }

    if (m.intents.includes('wiederholen') && !m.questions.length && this.lastAnswer) {
      parts.push(`Ich habe gesagt: ${this.lastAnswer}`);
      content = true;
    }
    if (m.intents.includes('buchstabieren') && this.call.location.street) {
      parts.push(`${this.call.location.street}: ${spellWord(this.call.location.street)}.`);
      content = true;
    }
    if (m.intents.includes('name')) {
      parts.push(`Mein Name ist ${this.call.caller.name}.`);
      content = true;
    }

    const answers: string[] = [];
    for (const qid of m.questions.slice(0, MAX_ANSWERS_PER_TURN)) {
      const q = findQuestion(this.call.category, qid);
      if (!q) continue;
      const a = q.answer(this.call.facts);
      answers.push(this.asked.has(qid) ? `Das habe ich doch schon gesagt: ${a}` : a);
      this.asked.add(qid);
    }
    if (answers.length) {
      parts.push(...answers);
      this.lastAnswer = answers.join(' ');
      content = true;
    }

    if (m.intents.includes('beruhigen')) {
      this.reassured = true;
      if (this.emotion > 0) this.emotion = (this.emotion - 1) as Emotion;
      if (!answers.length) parts.push(this.emotion >= 1 ? 'Okay … okay. Bitte beeilen Sie sich.' : 'Okay, danke.');
      content = true;
    }
    if (m.intents.includes('anweisung') && !answers.length) {
      parts.push('Okay, mache ich.');
      content = true;
    }
    if (m.intents.includes('ende')) {
      parts.push('Danke! Bitte kommen Sie schnell.');
      this.ended = true;
      content = true;
    }

    if (!content) {
      if (m.intents.includes('begruessung') && parts.length) {
        // nur Begrüßung: der Anrufer hat mit seinem Eröffnungssatz geantwortet
      } else if (m.intents.includes('begruessung')) {
        parts.push('Ja, hallo? Hören Sie mich?');
      } else if (!parts.length) {
        this.misunderstood++;
        if (this.misunderstood >= 2 && this.emotion < 2) this.emotion = (this.emotion + 1) as Emotion;
        parts.push(this.misunderstood >= 2 ? 'Wie bitte? Ich verstehe Sie nicht – schicken Sie doch bitte einfach jemanden!' : 'Wie bitte? Was meinen Sie?');
      }
    } else {
      this.misunderstood = 0;
    }

    // Ohne Zusage, dass Hilfe kommt, wird der Anrufer mit der Zeit ungeduldiger
    if (!this.ended && !this.reassured && this.turns >= 5 && this.turns % 3 === 2) {
      if (this.emotion < 2) this.emotion = (this.emotion + 1) as Emotion;
      parts.push('Kommt denn jetzt jemand?');
    } else if (!this.ended && this.emotion === 2 && this.turns % 3 === 0) {
      parts.push('Bitte beeilen Sie sich!');
    }

    return {
      text: parts.join(' '),
      questions: m.questions.slice(0, MAX_ANSWERS_PER_TURN),
      intents: m.intents,
      understood: content || m.intents.length > 0,
      emotion: this.emotion,
      ended: this.ended,
    };
  }
}
