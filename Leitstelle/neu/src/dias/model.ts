/**
 * Standardisierte Notrufabfrage (SNA) im Stil von DIAS.
 *
 * Die Inhalte (Fragen, Meldebilder, Infotexte) gehören der jeweiligen Leitstelle und sind NICHT Teil
 * von LEITWARTE. Der Nutzer importiert seinen eigenen Export (JSON, Format des DIAS-Mitschnitts)
 * lokal im Browser; er wird nur in IndexedDB gespeichert. Hier steht nur der Leser für das Format.
 */

export interface DiasOption {
  code: string;
  label: string;
  /** Antwort-ID im Mitschnitt (für den Wegvergleich) */
  answerId?: string;
  /** Folgeknoten; null, wenn der Mitschnitt hier endet */
  to: string | null;
}

export interface DiasSection {
  /** Fachbereich, z. B. "Medizinischer Notfall" */
  fach: string;
  /** Abfrageergebnis-Nummer */
  code: string;
  /** Meldebild / Abfrageergebnis-Text */
  meldebild: string;
  /** Regionales Alarmstichwort / AAO (null = nicht vergeben) */
  stichwort: string | null;
}

export interface DiasResult {
  /** Zusammenfassung der Abfrage ("medizinischer Notruf, Fremdanrufer …") */
  summary: string[];
  sections: DiasSection[];
  infoIntern: string[];
  infoExtern: string[];
}

export type DiasNodeKind = 'frage' | 'ergebnis' | 'alter' | 'freitext' | 'eingabe' | 'koerperschema' | 'mehrfach' | 'ende';

export interface DiasNode {
  id: string;
  question: string;
  /** Frage mit Hervorhebungen (nur <b>, <i>, <u>, <br> – beim Import bereinigt) */
  html: string;
  kind: DiasNodeKind;
  options: DiasOption[];
  /** Zusatztext (Dialoge, Eingabemasken) – nur Text */
  dialog: string | null;
  result: DiasResult | null;
  /**
   * Weg, auf dem diese Seite im Mitschnitt aufgezeichnet wurde (Antwort-IDs und Beschriftungen).
   * Der Mitschnitt fasst gleich aussehende Teilbäume zusammen – eine Ergebnisseite kann deshalb
   * über andere Wege erreicht werden, als auf dem sie aufgezeichnet wurde.
   */
  recorded?: { answerIds: string[]; labels: string[] };
}

export interface DiasTree {
  version: 1;
  source: string;
  capturedAt: string;
  scope: string;
  importedAt: number;
  root: string;
  nodes: Record<string, DiasNode>;
  stats: { nodes: number; results: number; incomplete: number };
}

interface RawOption {
  answerId?: string;
  code?: string | null;
  label?: string | null;
  text?: string | null;
}
interface RawNode {
  id: string;
  samplePath?: { from?: string; answerId?: string; label?: string | null }[];
  question?: string | null;
  questionHtml?: string | null;
  options?: RawOption[];
  dialogText?: string | null;
  kind?: string | null;
}
interface RawEdge {
  from: string;
  answerId?: string;
  code?: string | null;
  label?: string | null;
  to: string;
}

/** Erlaubt nur einfache Hervorhebungen; alles andere wird zu Text */
export function sanitizeHtml(html: string): string {
  const escaped = html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .replace(/&lt;(\/?)(b|i|u|strong|em)&gt;/gi, (_, slash: string, tag: string) => `<${slash}${tag.toLowerCase()}>`)
    .replace(/&lt;br\s*\/?&gt;/gi, '<br>')
    .replace(/&amp;(nbsp|amp|lt|gt|quot);/g, '&$1;');
}

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

// Die Stichwortzeile wird nur vorausschauend gelesen: Ist kein Stichwort vergeben, beginnt dort der nächste Abschnitt
const SECTION = /([^\n]+)\n\s*Abfrageergebnis\s*:\s*(\d+)\s*\n([^\n]+)\n(?:[ \t]*\n)*\s*Regionales Alarmstichwort \/ AAO[ \t]*\n(?=([^\n]*))/g;
const NOT_A_KEYWORD = /^(Brandschutz|Medizinischer Notfall|Info intern|Info extern|Zurück zur Abfrage|Übergabe|Notrufabfrageergebnis)/;

/** Liest das Ergebnis aus dem Dialogtext einer Ergebnisseite */
export function parseResult(text: string): DiasResult | null {
  if (!/Notrufabfrageergebnis/.test(text)) return null;
  const sections: DiasSection[] = [];
  let firstSectionAt = -1;
  for (const m of text.matchAll(SECTION)) {
    if (firstSectionAt < 0) firstSectionAt = m.index ?? -1;
    const sw = clean(m[4]);
    sections.push({ fach: clean(m[1]), code: m[2], meldebild: clean(m[3]), stichwort: sw && !NOT_A_KEYWORD.test(sw) ? sw : null });
  }
  const start = text.indexOf('Notrufabfrageergebnis') + 'Notrufabfrageergebnis'.length;
  const stopCandidates = [firstSectionAt, text.indexOf('Zurück zur Abfrage'), text.indexOf('Info intern')].filter((i) => i > start);
  const end = stopCandidates.length ? Math.min(...stopCandidates) : text.length;
  const summary = text
    .slice(start, end)
    .split('\n')
    .map((l) => clean(l).replace(/,$/, ''))
    .filter(Boolean);
  const between = (a: string, b: string) => {
    const i = text.indexOf(a);
    if (i < 0) return [];
    const j = text.indexOf(b, i + a.length);
    const chunk = text.slice(i + a.length, j < 0 ? text.length : j);
    return chunk
      .split('\n')
      .map(clean)
      .filter((l) => l && l !== '«' && l !== '»' && l !== 'Suche');
  };
  return { summary, sections, infoIntern: between('Info intern', 'Info extern'), infoExtern: between('Info extern', 'Zurück zur Abfrage') };
}

const KIND: Record<string, DiasNodeKind> = {
  'skipped-age-dialog': 'alter',
  'skipped-free-text': 'freitext',
  'skipped-special-input': 'eingabe',
  'skipped-complex-dialog': 'koerperschema',
  'multi-select': 'mehrfach',
  result: 'ergebnis',
};

/** Wandelt den Mitschnitt in einen kompakten Abfragebaum um. Wirft bei unbekanntem Format. */
export function parseDiasExport(raw: unknown, importedAt = Date.now()): DiasTree {
  const r = raw as { metadata?: Record<string, unknown>; nodes?: RawNode[]; edges?: RawEdge[] };
  if (!r || typeof r !== 'object' || !Array.isArray(r.nodes) || !Array.isArray(r.edges)) throw new Error('Keine DIAS-Abfragedatei: "nodes" und "edges" fehlen.');
  if (!r.nodes.length) throw new Error('Die Datei enthält keine Abfrageschritte.');
  const edgesFrom = new Map<string, RawEdge[]>();
  for (const e of r.edges) {
    if (!e || typeof e.from !== 'string' || typeof e.to !== 'string') continue;
    edgesFrom.set(e.from, [...(edgesFrom.get(e.from) ?? []), e]);
  }
  const ids = new Set(r.nodes.map((n) => n.id));
  const nodes: Record<string, DiasNode> = {};
  let results = 0;
  let incomplete = 0;
  for (const n of r.nodes) {
    if (!n || typeof n.id !== 'string') continue;
    const out = edgesFrom.get(n.id) ?? [];
    const rawOptions = n.options?.length ? n.options : out.map((e) => ({ answerId: e.answerId, code: e.code, label: e.label }));
    const options: DiasOption[] = rawOptions.map((o) => {
      const e = out.find((x) => (o.answerId && x.answerId === o.answerId) || (!o.answerId && x.code === o.code && x.label === o.label));
      // Manche Antworten (z. B. Personenzahl "1", "2") haben nur einen Text und kein Label
      const label = clean(String(o.label || ('text' in o ? o.text : '') || o.code || ''));
      return { code: String(o.code ?? ''), label, answerId: o.answerId ? String(o.answerId) : undefined, to: e && ids.has(e.to) ? e.to : null };
    });
    const dialog = n.dialogText ? String(n.dialogText) : null;
    const result = dialog ? parseResult(dialog) : null;
    let kind: DiasNodeKind = result ? 'ergebnis' : (KIND[n.kind ?? ''] ?? 'frage');
    if (kind === 'ergebnis' && !result) kind = 'ende';
    if (kind === 'frage' && !options.some((o) => o.to)) kind = 'ende';
    if (kind === 'ergebnis') results++;
    else if (kind !== 'frage') incomplete++;
    nodes[n.id] = {
      id: n.id,
      question: clean(String(n.question ?? '')),
      html: sanitizeHtml(String(n.questionHtml ?? n.question ?? '')),
      kind,
      options,
      dialog: kind === 'ergebnis' ? null : dialog,
      result,
      recorded:
        kind === 'ergebnis' && Array.isArray(n.samplePath)
          ? { answerIds: n.samplePath.map((x) => String(x.answerId ?? '')), labels: n.samplePath.map((x) => clean(String(x.label ?? ''))) }
          : undefined,
    };
  }
  const root = nodes.q00001 ? 'q00001' : r.nodes[0].id;
  const meta = r.metadata ?? {};
  return {
    version: 1,
    source: String(meta.source ?? 'unbekannt'),
    capturedAt: String(meta.capturedAt ?? meta.completedAt ?? ''),
    scope: String(meta.scope ?? ''),
    importedAt,
    root,
    nodes,
    stats: { nodes: Object.keys(nodes).length, results, incomplete },
  };
}

/** Das in der Maske zu übernehmende Alarmstichwort (erstes vergebenes, sonst null) */
export function primaryKeyword(res: DiasResult): string | null {
  return res.sections.find((s) => s.stichwort)?.stichwort ?? null;
}

/**
 * Vergleicht den geklickten Weg mit dem Aufzeichnungsweg einer Ergebnisseite.
 * Liefert null, wenn sie übereinstimmen (oder nichts aufgezeichnet ist), sonst die erste Abweichung.
 */
export function pathMismatch(node: DiasNode, chosenAnswerIds: string[], chosenLabels: string[]): { step: number; recorded: string; chosen: string } | null {
  const rec = node.recorded;
  if (!rec || !rec.answerIds.length) return null;
  const n = Math.max(rec.answerIds.length, chosenAnswerIds.length);
  for (let i = 0; i < n; i++) {
    if (rec.answerIds[i] !== chosenAnswerIds[i]) return { step: i + 1, recorded: rec.labels[i] ?? '–', chosen: chosenLabels[i] ?? '–' };
  }
  return null;
}
