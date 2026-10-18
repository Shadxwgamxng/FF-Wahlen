import type { KeywordCategory } from '../../model/types';
import type { FactValue, Facts } from '../../data/questions';
import type { LocationKind } from '../../data/scenarios';
import { Rng } from '../../sim/rng';

/**
 * Detailthemen: Fragen, auf die es im Szenario oft keinen Fakt gibt ("Wie viele Etagen hat das Haus?").
 * Der Anrufer legt die Antwort beim ersten Nachfragen fest – passend zur Lage und ohne den
 * Szenariofakten zu widersprechen – und merkt sie sich für den Rest des Gesprächs (als Fakt x_<id>).
 * Steht im Szenario bereits ein Fakt x_<id>, wird dieser verwendet.
 */

export type BuildingKind = 'efh' | 'rh' | 'mfh' | 'hochhaus' | 'gewerbe' | 'oeffentlich' | 'klinik' | 'keins';

export interface BuildingInfo {
  kind: BuildingKind;
  /** Bezeichnung im Satz, z. B. "Mehrfamilienhaus" */
  label: string;
  /** Geschosse über der Erde inkl. Erdgeschoss */
  minFloors: number;
  maxFloors: number;
}

export interface DetailContext {
  category: KeywordCategory;
  location: LocationKind;
  scenarioId: string;
  /** verdeckte Szenariofakten (nur lesen!), inkl. _address, _detail, _phone */
  facts: Readonly<Facts>;
  /** Gebäude am Einsatzort (aus Ortsbeschreibung, Lageart und Stockwerk abgeleitet), null im Freien */
  building: BuildingInfo | null;
  /** Deterministischer Zufall – je Anruf und Thema gleich, unabhängig von der Fragereihenfolge */
  rng: Rng;
  /** Wert eines anderen Detailthemas (wird bei Bedarf festgelegt) – für widerspruchsfreie Abhängigkeiten */
  get: (topicId: string) => FactValue | undefined;
  /** Rolle des Anrufers, z. B. "Nachbar/-in", "Passant/-in" */
  relation: string;
}

export interface DetailTopic {
  /** eindeutig, beginnt mit "x_" */
  id: string;
  /** kurze Bezeichnung für Tests und Übersicht */
  label: string;
  /** Kategorien, in denen das Thema erkannt wird (leer/fehlt = alle) */
  categories?: KeywordCategory[];
  /** Muster auf dem normalisierten Text (Kleinbuchstaben, ae/oe/ue/ss, ein Leerzeichen vorn und hinten) */
  patterns: RegExp[];
  /** typische Formulierungen des Disponenten – werden in den Tests geprüft */
  examples: string[];
  /** false: Der Anrufer kann dazu nichts wissen (Antwort dann über unknown) */
  applies?: (ctx: DetailContext) => boolean;
  /** Wert festlegen (nur aus ctx, deterministisch über ctx.rng) */
  generate: (ctx: DetailContext) => FactValue;
  /** Antwortsatz des Anrufers */
  answer: (value: FactValue, ctx: DetailContext) => string;
  /** Antwort, wenn applies false ist (Standard: "Das kann ich nicht sagen.") */
  unknown?: (ctx: DetailContext) => string;
}

/** Ganzes Wort / Wortfolge (Alternativen mit |) */
export const w = (s: string) => new RegExp(` (?:${s}) `);
/** freies Muster */
export const p = (s: string) => new RegExp(s);

export const ZAHLWORT = ['null', 'ein', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf'];
export const zahl = (n: number) => (n >= 0 && n < ZAHLWORT.length ? ZAHLWORT[n] : String(n));

/** Obergeschoss aus Fakten wie "2. Obergeschoss." / "3. OG" / "Erdgeschoss" (0) / "Keller" (-1), sonst null */
export function storeyOf(v: FactValue | undefined): number | null {
  if (typeof v !== 'string') return null;
  const s = v.toLowerCase();
  const m = /(\d+)\.\s*(obergeschoss|og|etage|stock)/.exec(s);
  if (m) return Number(m[1]);
  if (/erdgeschoss|parterre|\beg\b/.test(s)) return 0;
  if (/keller|untergeschoss/.test(s)) return -1;
  if (/dachgeschoss|dachboden|dachstuhl/.test(s)) return 99;
  return null;
}

/** Gebäude am Einsatzort ableiten */
export function deriveBuilding(location: LocationKind, facts: Facts, rng: Rng): BuildingInfo | null {
  const d = `${facts._detail ?? ''} ${facts.object ?? ''}`.toLowerCase();
  let b: BuildingInfo | null;
  if (/hochhaus/.test(d)) b = { kind: 'hochhaus', label: 'Hochhaus', minFloors: 8, maxFloors: 14 };
  else if (/einfamilienhaus|bungalow|ferienhaus/.test(d)) b = { kind: 'efh', label: 'Einfamilienhaus', minFloors: 1, maxFloors: 2 };
  else if (/reihenhaus|doppelhaus/.test(d)) b = { kind: 'rh', label: 'Reihenhaus', minFloors: 2, maxFloors: 3 };
  else if (/mehrfamilienhaus|wohnblock|hinterhaus|wohnung|apartment/.test(d)) b = { kind: 'mfh', label: 'Mehrfamilienhaus', minFloors: 3, maxFloors: 6 };
  else if (location === 'wohn') b = rng.chance(0.5) ? { kind: 'mfh', label: 'Mehrfamilienhaus', minFloors: 3, maxFloors: 5 } : { kind: 'efh', label: 'Einfamilienhaus', minFloors: 1, maxFloors: 2 };
  else if (location === 'gewerbe') b = { kind: 'gewerbe', label: 'Firmengebäude', minFloors: 1, maxFloors: 3 };
  else if (location === 'klinik') b = { kind: 'klinik', label: 'Klinikgebäude', minFloors: 3, maxFloors: 6 };
  else if (location === 'oeffentlich' && /supermarkt|gaststaette|bahnhof|schule|halle|kirche|rathaus|markt/.test(d)) b = { kind: 'oeffentlich', label: 'Gebäude', minFloors: 1, maxFloors: 3 };
  else b = null;
  if (!b) return null;
  // Brand-/Einsatzstockwerk muss im Haus liegen
  const st = storeyOf(facts.floor);
  if (st !== null && st !== 99 && st + 1 > b.minFloors) {
    b = { ...b, minFloors: st + 1, maxFloors: Math.max(b.maxFloors, st + 1) };
    if (b.kind === 'efh' && st >= 2) b = { kind: 'mfh', label: 'Mehrfamilienhaus', minFloors: st + 1, maxFloors: Math.max(st + 2, 4) };
  }
  return b;
}

/** FNV-1a – stabiler Seed aus Text */
export function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
