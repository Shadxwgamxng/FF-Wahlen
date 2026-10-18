import type { KeywordCategory } from '../model/types';

export interface StdKeywordSeed {
  code: string;
  label: string;
  category: KeywordCategory;
  priority: 1 | 2 | 3;
  needs: [string, number][];
}

/**
 * Stichwortkatalog der Beispielleitstelle inklusive Standardbedarf.
 * Der Standardbedarf dient zwei Zwecken:
 *  1. als Ausgangswert für die AAO der Beispielleitstelle (im Editor frei änderbar),
 *  2. als "tatsächlicher Bedarf" eines Szenarios mit diesem Stichwort (Spielwahrheit).
 */
export const KEYWORD_SEEDS: StdKeywordSeed[] = [
  { code: 'B 1', label: 'Kleinbrand (Mülltonne, PKW, Container)', category: 'brand', priority: 2, needs: [['loeschen', 1]] },
  { code: 'B 2', label: 'Mittelbrand (LKW, Balkon, Elektroverteiler)', category: 'brand', priority: 2, needs: [['loeschen', 2], ['fuehrung_1', 1]] },
  { code: 'B 3', label: 'Gebäudebrand', category: 'brand', priority: 1, needs: [['fuehrung_1', 1], ['loeschen', 2], ['hoehenrettung', 1], ['rtw', 1]] },
  { code: 'B 3 Y', label: 'Gebäudebrand – Menschenleben in Gefahr', category: 'brand', priority: 1, needs: [['fuehrung_1', 1], ['loeschen', 3], ['hoehenrettung', 1], ['rtw', 2], ['notarzt', 1]] },
  { code: 'B 4', label: 'Großbrand', category: 'brand', priority: 1, needs: [['fuehrung_2', 1], ['fuehrung_1', 1], ['loeschen', 4], ['hoehenrettung', 1], ['wasser_gross', 1], ['atemschutz', 1], ['rtw', 1], ['rd_fuehrung', 1]] },
  { code: 'B BMA', label: 'Brandmeldeanlage ausgelöst', category: 'brand', priority: 2, needs: [['fuehrung_1', 1], ['loeschen', 1], ['hoehenrettung', 1]] },
  { code: 'B WALD', label: 'Wald- / Flächenbrand', category: 'brand', priority: 2, needs: [['loeschen', 2], ['wasser_gross', 1], ['fuehrung_1', 1]] },
  { code: 'B KAMIN', label: 'Kaminbrand', category: 'brand', priority: 2, needs: [['loeschen', 1], ['hoehenrettung', 1]] },
  { code: 'B RM', label: 'Heimrauchmelder ausgelöst', category: 'brand', priority: 2, needs: [['loeschen', 1]] },
  { code: 'B UNKLAR', label: 'Unklare Rauchentwicklung', category: 'brand', priority: 2, needs: [['loeschen', 1]] },
  { code: 'TH 1', label: 'Technische Hilfe klein', category: 'th', priority: 3, needs: [['th', 1]] },
  { code: 'TH OEL', label: 'Ölspur / Betriebsmittel', category: 'th', priority: 3, needs: [['th', 1]] },
  { code: 'TH TUER', label: 'Türöffnung – Person hilflos', category: 'th', priority: 1, needs: [['th', 1], ['rtw', 1]] },
  { code: 'TH WASSER', label: 'Wasserschaden / Keller unter Wasser', category: 'th', priority: 3, needs: [['th', 1]] },
  { code: 'TH AUFZUG', label: 'Person im Aufzug', category: 'th', priority: 2, needs: [['th', 1]] },
  { code: 'TH GAS', label: 'Gasgeruch / Gasaustritt', category: 'th', priority: 1, needs: [['fuehrung_1', 1], ['loeschen', 1], ['polizei', 1]] },
  { code: 'TH UNWETTER', label: 'Sturm- / Unwetterschaden', category: 'th', priority: 3, needs: [['th', 1], ['hoehenrettung', 1]] },
  { code: 'TH HOEHE', label: 'Höhen- / Tiefenrettung', category: 'th', priority: 1, needs: [['th', 1], ['hoehenrettung', 1], ['rtw', 1], ['notarzt', 1]] },
  { code: 'TH TRAGE', label: 'Tragehilfe für den Rettungsdienst', category: 'th', priority: 2, needs: [['th', 1], ['hoehenrettung', 1]] },
  { code: 'TH Y', label: 'Person eingeklemmt (nicht Verkehr)', category: 'th', priority: 1, needs: [['fuehrung_1', 1], ['th_schwer', 1], ['loeschen', 1], ['rtw', 1], ['notarzt', 1]] },
  { code: 'TH HW', label: 'Hochwasser / Überflutung', category: 'th', priority: 2, needs: [['th', 2], ['thw_pumpen', 1], ['fuehrung_1', 1]] },
  { code: 'VU 1', label: 'Verkehrsunfall mit Verletzten', category: 'vu', priority: 1, needs: [['th', 1], ['rtw', 1], ['polizei', 1]] },
  { code: 'VU Y', label: 'Verkehrsunfall – Person eingeklemmt', category: 'vu', priority: 1, needs: [['fuehrung_1', 1], ['th', 1], ['th_schwer', 1], ['loeschen', 1], ['rtw', 1], ['notarzt', 1], ['polizei', 1]] },
  { code: 'VU MANV', label: 'Verkehrsunfall – Massenanfall von Verletzten', category: 'vu', priority: 1, needs: [['fuehrung_1', 1], ['th_schwer', 1], ['loeschen', 2], ['rtw', 4], ['notarzt', 2], ['rd_fuehrung', 1], ['polizei', 1]] },
  { code: 'RD 1', label: 'Notfall ohne Notarzt', category: 'rd', priority: 2, needs: [['rtw', 1]] },
  { code: 'RD 2', label: 'Notfall mit Notarzt', category: 'rd', priority: 1, needs: [['rtw', 1], ['notarzt', 1]] },
  { code: 'RD REA', label: 'Reanimation', category: 'rd', priority: 1, needs: [['rtw', 1], ['notarzt', 1]] },
  { code: 'RD MANV', label: 'Massenanfall von Verletzten', category: 'rd', priority: 1, needs: [['rtw', 3], ['notarzt', 2], ['rd_fuehrung', 1], ['san_gross', 1]] },
  { code: 'KTP', label: 'Krankentransport', category: 'ktp', priority: 3, needs: [['ktw', 1]] },
  { code: 'KTP INF', label: 'Infektionstransport', category: 'ktp', priority: 3, needs: [['ktw', 1]] },
  { code: 'KTP ITW', label: 'Intensivverlegung', category: 'ktp', priority: 2, needs: [['intensiv', 1]] },
  { code: 'ABC 1', label: 'Gefahrstoffaustritt klein', category: 'abc', priority: 1, needs: [['fuehrung_1', 1], ['loeschen', 1], ['gefahrgut', 1]] },
  { code: 'ABC 2', label: 'Gefahrstoffaustritt groß / Chemieunfall', category: 'abc', priority: 1, needs: [['fuehrung_2', 1], ['fuehrung_1', 1], ['loeschen', 2], ['gefahrgut', 1], ['atemschutz', 1], ['rtw', 1]] },
  { code: 'ABC CO', label: 'CO-Warnmelder ausgelöst', category: 'abc', priority: 1, needs: [['loeschen', 1], ['rtw', 1]] },
  { code: 'W 1', label: 'Wasserrettung – Person im Wasser', category: 'wasser', priority: 1, needs: [['wasserrettung', 1], ['loeschen', 1], ['rtw', 1], ['notarzt', 1]] },
  { code: 'TIER', label: 'Tier in Notlage (klein)', category: 'tier', priority: 3, needs: [['th', 1]] },
  { code: 'TIER GROSS', label: 'Großtier in Notlage', category: 'tier', priority: 3, needs: [['th', 1], ['tier', 1]] },
  { code: 'POL 1', label: 'Unterstützung Polizei / Verkehrsabsicherung', category: 'pol', priority: 3, needs: [['polizei', 1]] },
  { code: 'POL RD', label: 'Gewalttat mit Verletzten', category: 'pol', priority: 1, needs: [['polizei', 2], ['rtw', 1]] },
  { code: 'POL SUI', label: 'Person droht zu springen', category: 'pol', priority: 1, needs: [['polizei', 2], ['hoehenrettung', 1], ['rtw', 1], ['notarzt', 1]] },
];

export const CATEGORY_LABELS: Record<KeywordCategory, string> = {
  brand: 'Brand',
  th: 'Technische Hilfe',
  vu: 'Verkehrsunfall',
  rd: 'Rettungsdienst',
  ktp: 'Krankentransport',
  abc: 'Gefahrstoffe (ABC)',
  wasser: 'Wasserrettung',
  tier: 'Tierrettung',
  pol: 'Polizei / Sicherheit',
  sonstiges: 'Sonstiges',
};
