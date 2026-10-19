import type { Facts } from '../data/questions';
import { Rng } from '../sim/rng';
import { hashSeed } from './details/types';

/**
 * Natürliche Sprechweise des Anrufers: Füllwörter, Abbrüche, Wiederholungen, Gefühlslage und
 * eine Persönlichkeit je Anrufer. Die Schicht fügt nur Floskeln ohne Sachinhalt hinzu – die
 * Fakten der Antwort bleiben Wort für Wort erhalten. Alles ist deterministisch (Seed je Anruf).
 */

/** 0 = ruhig, 1 = aufgeregt, 2 = panisch */
export type Emotion = 0 | 1 | 2;

export type Personality = 'ruhig' | 'aufgeregt' | 'aelter' | 'knapp' | 'redselig';

export const PERSONALITY_LABEL: Record<Personality, string> = {
  ruhig: 'ruhig und sachlich',
  aufgeregt: 'aufgeregt, schnell aus der Fassung',
  aelter: 'älterer Mensch, etwas umständlich',
  knapp: 'kurz angebunden',
  redselig: 'redselig',
};

export interface VoicePersona {
  rate: number;
  pitch: number;
}

/** Persönlichkeit aus dem Anruf ableiten (gleicher Anruf, gleiche Persönlichkeit) */
export function personalityFor(seedText: string, facts: Facts): Personality {
  const rng = new Rng(hashSeed(`${seedText}|persoenlichkeit`));
  const r = rng.next();
  const age = typeof facts.callerAge === 'number' ? facts.callerAge : null;
  if (age !== null && age >= 70) return 'aelter';
  if (r < 0.26) return 'ruhig';
  if (r < 0.5) return 'aufgeregt';
  if (r < 0.68) return 'aelter';
  if (r < 0.84) return 'knapp';
  return 'redselig';
}

/** Gefühlslage zu Gesprächsbeginn aus den Fakten und der Persönlichkeit */
export function initialEmotion(facts: Facts, personality?: Personality): Emotion {
  let e: Emotion = 0;
  if (facts.trapped === true || facts.conscious === false || facts.breathing === 'nein' || facts.visible === false) e = 2;
  else if ((typeof facts.injured === 'number' && facts.injured > 0) || facts.spreading === true || facts.weapon === true) e = 1;
  if (personality === 'aufgeregt' && e < 2) e = (e + 1) as Emotion;
  return e;
}

/** Stimme: Tempo und Tonhöhe nach Persönlichkeit und Gefühlslage */
export function voiceFor(personality: Personality, emotion: Emotion): VoicePersona {
  const base = { ruhig: [0.98, 1], aufgeregt: [1.08, 1.06], aelter: [0.86, 0.94], knapp: [1.04, 0.98], redselig: [1.02, 1.02] }[personality];
  return { rate: Math.min(1.35, base[0] + emotion * 0.09), pitch: base[1] + emotion * 0.07 };
}

/** Feste Gesprächsfloskeln je Persönlichkeit – nie mit Sachinhalt */
export type PhraseKey = 'nichtVerstanden' | 'nichtVerstanden2' | 'hallo' | 'beruhigt' | 'beruhigtNochAufgeregt' | 'verstanden' | 'ende' | 'ungeduldig' | 'beeilen' | 'schonGesagt' | 'wiederholung';

const PHRASES: Record<PhraseKey, Partial<Record<Personality, string[]>> & { _: string[] }> = {
  nichtVerstanden: {
    _: ['Wie bitte? Was meinen Sie?', 'Wie bitte? Das hab ich nicht verstanden.', 'Was? Entschuldigung, was haben Sie gesagt?'],
    knapp: ['Wie bitte?', 'Was?'],
    aelter: ['Wie bitte? Ich hab Sie nicht verstanden, ich höre nicht mehr so gut.', 'Wie bitte? Was sagten Sie?'],
  },
  nichtVerstanden2: {
    _: ['Wie bitte? Ich verstehe Sie nicht – schicken Sie doch bitte einfach jemanden!', 'Ich versteh nicht, was Sie wollen! Schicken Sie einfach jemanden, bitte!'],
    knapp: ['Wie bitte? Schicken Sie einfach jemanden.'],
    aelter: ['Wie bitte? Ach Gott, ich versteh Sie nicht … schicken Sie doch bitte jemanden!'],
  },
  hallo: {
    _: ['Ja, hallo? Hören Sie mich?', 'Hallo? Ja, hallo?', 'Hallo? Sind Sie da?'],
    knapp: ['Hallo?'],
  },
  beruhigt: {
    _: ['Okay, danke.', 'Gut … danke.', 'Okay. Danke Ihnen.'],
    knapp: ['Okay.', 'Gut.'],
    aelter: ['Ach, Gott sei Dank. Danke.', 'Na, Gott sei Dank.'],
    redselig: ['Okay, danke, da bin ich ja beruhigt.', 'Gut, gut. Danke, wirklich.'],
  },
  beruhigtNochAufgeregt: {
    _: ['Okay … okay. Bitte beeilen Sie sich.', 'Ja … ja, okay. Aber bitte schnell!', 'Okay. Okay, ich versuch’s.'],
    knapp: ['Okay. Schnell bitte.'],
  },
  verstanden: {
    _: ['Verstanden.', 'Ja, okay.', 'Alles klar.', 'Mach ich.'],
    knapp: ['Ja.', 'Okay.'],
    aelter: ['Ja, ja. Verstanden.', 'Ja, gut.'],
  },
  ende: {
    _: ['Danke! Bitte kommen Sie schnell.', 'Danke, bis gleich. Beeilen Sie sich!', 'Okay, danke! Tschüss.'],
    knapp: ['Danke. Tschüss.'],
    aelter: ['Danke schön. Bitte schnell, ja?', 'Vielen Dank. Auf Wiederhören.'],
  },
  ungeduldig: {
    _: ['Kommt denn jetzt jemand?', 'Schicken Sie jetzt jemanden oder nicht?', 'Ist denn schon jemand unterwegs?'],
    knapp: ['Kommt jetzt jemand?'],
    aelter: ['Kommt denn nun jemand?'],
  },
  beeilen: {
    _: ['Bitte beeilen Sie sich!', 'Bitte, schnell!', 'Machen Sie schnell, bitte!'],
    knapp: ['Schnell bitte!'],
  },
  schonGesagt: {
    _: ['Das hab ich doch schon gesagt:', 'Hab ich doch gerade gesagt:', 'Wie gesagt:'],
    knapp: ['Wie gesagt:'],
    aelter: ['Das sagte ich doch schon:', 'Wie ich schon sagte:'],
  },
  wiederholung: {
    _: ['Ich hab gesagt:', 'Nochmal:', 'Also nochmal:'],
    aelter: ['Ich sagte:'],
  },
};

/** alle Floskeln einer Art (für Tests) */
export const allPhrases = (key: PhraseKey) => Object.values(PHRASES[key]).flat() as string[];

/** Füllwörter vor einer Antwort */
const FILLERS: Record<Personality, string[][]> = {
  // [ruhig, aufgeregt, panisch]
  ruhig: [['Also,', 'Ja,', 'Hm,', 'Moment,'], ['Also,', 'Ähm,', 'Ja,'], ['Oh Gott,', 'Ähm,', 'Bitte,']],
  aufgeregt: [['Ähm,', 'Also,', 'Ja,'], ['Ähm,', 'Äh,', 'Also,', 'Ja, äh,'], ['Oh Gott,', 'Oh Gott, oh Gott,', 'Äh,', 'Bitte,']],
  aelter: [['Also,', 'Na ja,', 'Tja,', 'Wissen Sie,', 'Moment mal,'], ['Ach Gott,', 'Also,', 'Meine Güte,'], ['Ach Gott, ach Gott,', 'Meine Güte,', 'Oh je,']],
  knapp: [[], ['Ähm,'], ['Äh,']],
  redselig: [['Also,', 'Ja, also,', 'Na ja,', 'Wie soll ich sagen,'], ['Also,', 'Ähm, also,', 'Ja, äh,'], ['Oh Gott,', 'Äh,', 'Also,']],
};

/** Nachsätze ohne Sachinhalt */
const TAILS: Record<Personality, string[][]> = {
  ruhig: [[], [], ['Bitte schnell.']],
  aufgeregt: [[], ['Ich bin total durcheinander.', 'Oh Mann.'], ['Bitte!', 'Oh Gott, bitte schnell!']],
  aelter: [['Ja.', 'So ist das.'], ['Ach du liebe Zeit.'], ['Ach Gott, ach Gott.']],
  knapp: [[], [], []],
  redselig: [['Hätte ich auch nicht gedacht, ehrlich gesagt.', 'So was hab ich noch nicht erlebt.', 'Ich steh hier gerade noch ganz neben mir.'], ['Ich bin ganz durcheinander, entschuldigen Sie.', 'So was hab ich noch nie erlebt.'], ['Bitte, bitte schnell!']],
};

const P_FILLER: Record<Personality, number> = { ruhig: 0.3, aufgeregt: 0.55, aelter: 0.6, knapp: 0.08, redselig: 0.6 };
const P_TAIL: Record<Personality, number> = { ruhig: 0.1, aufgeregt: 0.25, aelter: 0.25, knapp: 0, redselig: 0.4 };

/**
 * Sprecher eines Anrufs. Jede Äußerung zieht den nächsten Zufallswert – gleiche Gesprächsfolge,
 * gleiche Formulierungen.
 */
export class CallerVoice {
  private rng: Rng;

  constructor(
    readonly personality: Personality,
    seed: number,
  ) {
    this.rng = new Rng(seed);
  }

  /** zufällige Auswahl aus Alternativen (für Antwortvarianten) */
  pick = <T>(alts: readonly T[]): T => alts[Math.floor(this.rng.next() * alts.length) % alts.length];

  phrase(key: PhraseKey): string {
    const bank = PHRASES[key];
    return this.pick(bank[this.personality] ?? bank._);
  }

  /** Antwortsatz natürlich klingen lassen – Inhalt bleibt erhalten */
  /** keepStart: Satz beginnt mit einem Namen (Adresse) – Anfang nie verändern oder kleinschreiben */
  naturalize(text: string, emotion: Emotion, keepStart = false): string {
    let t = text.trim();
    if (!t) return t;
    const fillers = FILLERS[this.personality][emotion];
    const rng = this.rng;
    // Panik: Satzanfang stottern ("Da – da ist noch jemand drin!")
    if (emotion === 2 && this.personality !== 'knapp' && !t.includes('…') && rng.chance(0.35) && !keepStart) {
      const m = /^([A-ZÄÖÜa-zäöüß]+)(\s)/.exec(t);
      if (m && m[1].length <= 6) t = `${m[1]} – ${lowerFirst(t)}`;
    }
    // Abbrüche und Pausen an Kommas, wenn jemand aufgeregt oder umständlich ist
    if ((emotion >= 1 || this.personality === 'aelter') && this.personality !== 'knapp' && rng.chance(0.4)) t = t.replace(/, /, ' … ');
    if (fillers.length && rng.chance(P_FILLER[this.personality] + emotion * 0.1)) {
      const f = this.pick(fillers);
      t = keepStart ? `${f.replace(/,$/, ' …')} ${t}` : `${f} ${lowerFirst(t)}`;
    }
    if (emotion === 2 && rng.chance(0.4)) t = t.replace(/\.$/, '!');
    const tails = TAILS[this.personality][emotion];
    if (tails.length && rng.chance(P_TAIL[this.personality])) t = `${t} ${this.pick(tails)}`;
    return t;
  }
}

/** Ersten Buchstaben nach einem Füllwort klein – nur bei typischen Satzanfängen (nie "Sie", Namen, Zahlen) */
const COMMON_START = /^(Ja|Nein|Da|Das|Der|Die|Dem|Den|Ein|Eine|Einer|Es|Er|Etwa|Wir|Mein|Meine|Meiner|Hier|So|Also|Nicht|Nichts|Kein|Keine|Davon|Nur|Auf|In|Im|Am|Von|Mit|Bei|Gerade|Gleich|Noch|Schon|Soweit|Ganz|Zwei|Drei|Vier|Fünf|Wie|Was|Wo|Seit|Vor|Unter|Über|Hinter|Neben|Durch|Aus|Zu|Zum|Zur|Man|Eher|Vielleicht|Ungefähr|Keiner|Niemand|Alle|Leider|Gar)\b/;
export function lowerFirst(t: string): string {
  return COMMON_START.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
}
