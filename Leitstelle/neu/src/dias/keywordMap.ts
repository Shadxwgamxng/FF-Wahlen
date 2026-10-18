/**
 * Zuordnung der DIAS-Alarmstichwörter zu den Stichwörtern der Leitstelle (Katalog Schleswig-Holstein).
 * DIAS nutzt teils andere Schreibweisen (THHÖHE, FEU Y, R5/R10 …) und Zusätze (NAIK, FIRST).
 * Die Zuordnung ist ein Vorschlag – der Disponent kann das Stichwort in der Maske jederzeit ändern.
 */

export interface KeywordMatch {
  /** Code im Katalog der Leitstelle, null = keine sinnvolle Zuordnung */
  code: string | null;
  /** DIAS-Stichwort steht genau so im Katalog */
  exact: boolean;
  /** Hinweis für den Disponenten */
  note?: string;
}

/** Feste Zuordnungen (nur Codes) */
const TABLE: Record<string, string> = {
  'TH HÖHE': 'TH SRHT',
  'TH TV': 'TH K TV',
  'TH TIER K': 'TH K 00',
  'TH TIER': 'TH 00',
  'TH DRZF': 'TH K 00',
  'TH GAS HAUS Y': 'TH GAS',
  'TH GAS HAUS': 'TH GAS',
  'TH FLUSI K': 'TH K FLUSI',
  'TH AUST K': 'TH K AUST',
  'M PSNV-B': 'SOKO PSNV-B HAUS',
  'M PSNV-E': 'SOKO PSNV-E',
  'W POL': 'W POLIZEI',
  'WL KVSH': 'W ÄBD',
  'KBF DLK': 'KBF STANDARD DL',
  'FEU AUS': 'FEU K AUS',
  'FEU K RWM': 'FEU K BMA P',
};

const NOTES: Record<string, string> = {
  WNG: 'DIAS vergibt hier kein regionales Stichwort – bitte das Rettungsdienst-Stichwort passend zum Meldebild wählen.',
  'Beratung - Kein Feuerwehreinsatz': 'Laut Abfrage kein Feuerwehreinsatz – ggf. ohne Einsatz beenden oder weiterleiten.',
  'Szenario selbst entsprechend VA SNA vergeben!': 'Stichwort laut Abfrage selbst festlegen.',
};

/** Verletztenzahl R5/R10/R15/R20 (DIAS) → MANV-Stufen R0–R4 des Katalogs */
const R_MAP: Record<string, string> = { R5: 'R0', R10: 'R1', R15: 'R2', R20: 'R2' };
const MODIFIER = /^(Y|X|XY|R\d+|XR\d+|ÜBUNG)$/;
const CLASSES = [['FEU', 'K'], ['FEU', 'G'], ['TH', 'K'], ['TH', 'G'], ['FEU'], ['TH']];

const spaced = (s: string) =>
  s
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^(TH|FEU)(?=[A-ZÄÖÜ])/i, '$1 ');

function mapR(tokens: string[]): string[] {
  return tokens.map((t) => {
    const m = /^(X?)(R\d+)$/.exec(t);
    return m && R_MAP[m[2]] ? `${m[1]}${R_MAP[m[2]]}` : t;
  });
}

/** "TH K Y" → "TH K 00 Y", "FEU" → "FEU 00" */
function insert00(tokens: string[]): string[] | null {
  for (const cls of CLASSES) {
    if (cls.every((c, i) => tokens[i] === c)) {
      const rest = tokens.slice(cls.length);
      if (!rest.length || MODIFIER.test(rest[0])) return [...cls, '00', ...rest];
      return null;
    }
  }
  return null;
}

export function mapDiasKeyword(dias: string, catalogCodes: Iterable<string>): KeywordMatch {
  const index = new Map<string, string>();
  for (const c of catalogCodes) index.set(c.toUpperCase(), c);
  const find = (s: string | null | undefined) => (s ? index.get(s.toUpperCase()) : undefined);
  const raw = dias.trim();
  if (NOTES[raw]) return { code: null, exact: false, note: NOTES[raw] };
  const exact = find(raw);
  if (exact) return { code: exact, exact: true };
  const s = spaced(raw);
  const viaTable = find(TABLE[s.toUpperCase()] ?? TABLE[s]);
  if (viaTable) return { code: viaTable, exact: false };
  let tokens = mapR(s.toUpperCase().split(' '));
  // NOTF 11 BAB → NOTF BAB 11
  if (tokens[0] === 'NOTF' && /^\d\d$/.test(tokens[1] ?? '') && tokens[2] === 'BAB') tokens = ['NOTF', 'BAB', tokens[1], ...tokens.slice(3)];
  const full = find(tokens.join(' ')) ?? find(insert00(tokens)?.join(' '));
  if (full) return { code: full, exact: false };
  // Unbekanntes Objektwort vor Zusätzen weglassen, Zusätze behalten: "TH G FLUG2 R5" → "TH G 00 R0"
  const firstMod = tokens.findIndex((t, i) => i > 0 && MODIFIER.test(t));
  if (firstMod > 1 && !['K', 'G', '00'].includes(tokens[firstMod - 1])) {
    const t = [...tokens.slice(0, firstMod - 1), ...tokens.slice(firstMod)];
    const c = find(t.join(' ')) ?? find(insert00(t)?.join(' '));
    if (c) return { code: c, exact: false, note: `DIAS: ${raw}` };
  }
  for (let n = tokens.length; n >= 1; n--) {
    const t = tokens.slice(0, n);
    const c = find(t.join(' ')) ?? find(insert00(t)?.join(' ')) ?? find(TABLE[t.join(' ')]);
    if (c) return { code: c, exact: false, note: n < tokens.length ? `DIAS: ${raw}` : undefined };
  }
  return { code: null, exact: false, note: `Kein passendes Stichwort für „${raw}“ im Katalog – bitte selbst wählen.` };
}
