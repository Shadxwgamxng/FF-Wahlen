import type { AaoRequirement, AaoRule, Keyword, KeywordCategory, Meldebild } from '../model/types';
import { KEYWORD_SEEDS } from './keywords';
import { SH_KEYWORD_SEEDS } from './sh/keywords';
import { SH_MELDEBILDER } from './sh/meldebilder';

/**
 * Stichwortkataloge. Eine Leitstelle wird mit einem Katalog angelegt (Assistent bzw. Beispiel);
 * danach sind Stichwörter, AAO und Meldebilder im Editor frei änderbar.
 *
 *  - "standard": eigener, vereinfachter Katalog von LEITWARTE
 *  - "sh":       Schleswig-Holstein – Struktur und Codes (Grundschadenart/Erweiterung/Ergänzung,
 *                CEDUS-Codes der Meldebilder) angelehnt an die Seite „Einsatzstichworte/Mitte“
 *                im LstSim-Wiki; alle Texte und die Fahrzeugzuordnung (AAO) sind eigene Inhalte.
 */

export interface KeywordSeed {
  code: string;
  label: string;
  category: KeywordCategory;
  priority: 1 | 2 | 3;
  needs: [string, number][];
  emergency?: boolean;
  forward?: boolean;
  exercise?: boolean;
  infection?: 'covid' | 'hoch';
  note?: string;
}

export interface Catalog {
  id: string;
  label: string;
  description: string;
  keywords: KeywordSeed[];
  meldebilder: Meldebild[];
}

export const CATALOGS: Catalog[] = [
  {
    id: 'standard',
    label: 'LEITWARTE-Standard',
    description: 'Vereinfachter Katalog mit 40 Stichwörtern (B, TH, VU, RD, KTP, ABC, W, TIER, POL).',
    keywords: KEYWORD_SEEDS,
    meldebilder: [],
  },
  {
    id: 'sh',
    label: 'Schleswig-Holstein',
    description: 'Zweistufig: Einsatzstichwort (Grundschadenart + Erweiterung + Ergänzung, z. B. „FEU 00 Y“) und Meldebild mit CEDUS-Code als Vorschlag.',
    keywords: SH_KEYWORD_SEEDS,
    meldebilder: SH_MELDEBILDER,
  },
];

export const catalogById = (id: string | undefined): Catalog => CATALOGS.find((c) => c.id === id) ?? CATALOGS[0];

/** Stabile ID aus einem Stichwort-Code (Umlaute transliteriert) */
export const keywordIdFromCode = (code: string) =>
  'kw_' +
  code
    .toLowerCase()
    .replace(/ä/g, 'ae')
    .replace(/ö/g, 'oe')
    .replace(/ü/g, 'ue')
    .replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/_$/, '');

export const toRequirements = (needs: [string, number][]): AaoRequirement[] => needs.map(([capability, count]) => ({ capability, count }));

export function catalogKeywords(cat: Catalog): Keyword[] {
  return cat.keywords.map((k) => ({
    id: keywordIdFromCode(k.code),
    code: k.code,
    label: k.label,
    category: k.category,
    priority: k.priority,
    ...(k.emergency === false ? { emergency: false } : {}),
    ...(k.forward ? { forward: true } : {}),
    ...(k.exercise ? { exercise: true } : {}),
    ...(k.infection ? { infection: k.infection } : {}),
    ...(k.note ? { note: k.note } : {}),
  }));
}

export function catalogAao(cat: Catalog): AaoRule[] {
  return cat.keywords.map((k) => ({ id: `aao_${keywordIdFromCode(k.code).slice(3)}`, keywordId: keywordIdFromCode(k.code), requirements: toRequirements(k.needs), note: '' }));
}

/** Tatsächlicher Bedarf eines Stichworts im Katalog (Spielwahrheit für Szenarien) */
export function catalogNeeds(catalogId: string | undefined, code: string): AaoRequirement[] {
  const seed = catalogById(catalogId).keywords.find((k) => k.code === code);
  return seed ? toRequirements(seed.needs) : [];
}
