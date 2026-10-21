import type { KeywordCategory } from '../model/types';
import type { Facts, QuestionDef } from '../data/questions';
import { CATEGORY_QUESTIONS, findQuestion } from '../data/questions';
import type { DiasNode } from '../dias/model';
import { hashSeed } from './details/types';
import { CallerVoice, initialEmotion, lowerFirst, personalityFor, voiceFor, type Emotion, type Personality, type VoicePersona } from './style';
import type { GeneratedLocation } from '../sim/callgen';
import { matchIntents, normalize, type ConversationIntent } from './intents';
import { answerDetail, findDetail } from './details';
import { answerDiasNode, answerFree, answerKindOf, answerTopic, classifyFree, isSnaTopic, similarToQuestion, topicOf, type SnaSource } from './diasAnswer';

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
  /** beantworteter Abfrageknoten (Notrufabfrage) und die dazu passende Antwortmöglichkeit */
  dias?: { nodeId: string; option: number | null };
}

/** Kontext einer Äußerung: aktuelle Frage der Notrufabfrage (DIAS-Knoten oder LEITWARTE-Folgefrage) */
export interface RespondContext {
  dias?: DiasNode | null;
}

/**
 * Fachfragen mit kritischer Angabe: Fehlt der Fakt (oder ist es eine Frage einer anderen Fachrichtung),
 * antwortet das allgemeine Thema – abgeleitet statt "weiß ich nicht".
 */
const CRITICAL_TOPIC: Record<string, [topic: string, fact: string]> = {
  rd_bewusst: ['sna_bewusst', 'conscious'],
  rd_atmung: ['sna_atmung', 'breathing'],
  rd_alter: ['sna_alter', 'age'],
  vu_eingeklemmt: ['sna_eingeklemmt', 'trapped'],
  b_personen: ['sna_eingeklemmt', 'trapped'],
  th_personen: ['sna_gefahr', 'trapped'],
  verletzt: ['sna_anzahl', 'injured'],
};

/** Frage einer beliebigen Fachrichtung (zweiter Erkennungsdurchlauf) */
function anyQuestion(id: string): QuestionDef | undefined {
  for (const qs of Object.values(CATEGORY_QUESTIONS)) {
    const q = qs.find((x) => x.id === id);
    if (q) return q;
  }
  return undefined;
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
  respond(utterance: string, ctx: RespondContext = {}): CallerTurn {
    const base = { questions: [] as string[], intents: [] as ConversationIntent[], emotion: this.emotion, content: [] as string[] };
    const v = this.voice;
    if (this.ended) return { ...base, text: '', understood: false, ended: true };
    const said = utterance.trim();
    if (!said) return { ...base, text: '', understood: false, ended: false };
    this.turns++;
    const m = matchIntents(said, this.call.category);
    const parts: string[] = [];
    let content = false;
    const sna: SnaSource = { scenarioId: this.call.scenarioId, category: this.call.category, facts: this.call.facts, relation: this.call.caller.relation, opening: this.call.opening, seed: callSeed(this.call) };
    const node = ctx.dias && answerKindOf(ctx.dias) !== 'keine' ? ctx.dias : null;
    // Vorgelesene Abfragefrage: Antwort passend zur Frage im Abfragefeld
    const readsNode = node !== null && similarToQuestion(said, node.question);
    let diasTurn: CallerTurn['dias'];

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
    const answerNode = (n: DiasNode) => {
      const r = answerDiasNode(sna, n, v.pick);
      if (!r) return false;
      const key = `dias:${n.id}`;
      spoken.push(r.text);
      answers.push(this.asked.has(key) ? `${v.phrase('schonGesagt')} ${r.text}` : v.naturalize(r.text, this.emotion));
      this.asked.add(key);
      diasTurn = { nodeId: n.id, option: r.option };
      return true;
    };
    if (readsNode) answerNode(node);
    for (const qid of readsNode ? [] : m.questions.slice(0, MAX_ANSWERS_PER_TURN)) {
      let a: string;
      const crit = CRITICAL_TOPIC[qid];
      if (isSnaTopic(qid)) {
        a = answerTopic(sna, qid, v.pick, said);
      } else if (crit && (!findQuestion(this.call.category, qid) || this.call.facts[crit[1]] === undefined)) {
        a = answerTopic(sna, crit[0], v.pick, said);
      } else if (findDetail(qid)) {
        // Detail ohne Szenariofakt: wird beim ersten Mal passend festgelegt und gemerkt
        a = answerDetail({ scenarioId: this.call.scenarioId, category: this.call.category, facts: this.call.facts, relation: this.call.caller.relation }, qid);
      } else {
        const q = findQuestion(this.call.category, qid) ?? anyQuestion(qid);
        if (!q) continue;
        a = q.answer(this.call.facts, v.pick);
      }
      spoken.push(a);
      answers.push(this.asked.has(qid) ? `${v.phrase('schonGesagt')} ${a}` : v.naturalize(a, this.emotion, qid === 'ort'));
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

    // Nichts erkannt: Anweisung quittieren, Frage plausibel beantworten (Thema, Abfragefeld, festgelegt)
    const free = !content && !m.intents.includes('begruessung') ? classifyFree(said) : null;
    if (free) {
      const topical = free !== 'anweisung' && topicOf(said) !== null;
      if (free === 'anweisung' || topical || !node || !answerNode(node)) {
        const r = answerFree(sna, said, free, v.pick);
        spoken.push(r.text);
        answers.push(v.naturalize(r.text, this.emotion));
      }
      parts.push(...answers);
      this.lastAnswer = answers.join(' ');
      content = true;
    } else if (!content && node && !m.intents.includes('begruessung') && normalize(said).trim().split(' ').length >= 3 && answerNode(node)) {
      // unklar formulierte Frage, während eine Abfragefrage offen ist
      parts.push(...answers);
      this.lastAnswer = answers.join(' ');
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
      ...(diasTurn ? { dias: diasTurn } : {}),
    };
  }
}
