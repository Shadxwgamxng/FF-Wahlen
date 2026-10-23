import type { DiasNode, DiasTree } from './model';

/**
 * LEITWARTE-Ergänzung der Notrufabfrage.
 *
 * Der importierte DIAS-Mitschnitt ist lückenhaft: Eingaben (Alter, Freitext, Körperschema …) wurden
 * übersprungen, manche Antworten haben keine aufgezeichnete Folgeseite, und zusammengefasste Teilbäume
 * führen zu Ergebnissen anderer Abfragewege. An diesen Stellen setzt LEITWARTE fort:
 *   1. ein einfacher Eingabeschritt für die übersprungene Eingabe,
 *   2. eigene Folgefragen je Fachrichtung (eigene Formulierungen, NICHT aus DIAS),
 *   3. ein eigenes Ergebnis: Stichwort nach Regeln (Katalog der Leitstelle), Meldebild- und Infotext aus dem Weg.
 * Alles ist als LEITWARTE-Ergänzung gekennzeichnet.
 */

export interface Step {
  nodeId: string;
  option: number;
}

export interface Completion {
  /** Eingabe am Lückenschritt (Alter, Freitext, Körperteile, Mehrfachauswahl …) */
  input?: string;
  /** Antworten auf LEITWARTE-Folgefragen (Frage-ID → Wert) */
  answers: Record<string, string>;
}

export type Domain = 'medizin' | 'ktp' | 'wasser' | 'berg' | 'fach' | 'brand' | 'th' | 'vu' | 'unwetter' | 'ecall';

export type GapKind = 'alter' | 'freitext' | 'eingabe' | 'koerperschema' | 'mehrfach' | 'ende' | 'fehlt';

export interface Gap {
  kind: GapKind;
  /** Lückenknoten (fehlt bei ausgegrauter Antwort ohne Folgeseite) */
  node?: DiasNode;
}

/** Wo steht die Abfrage? Liefert die Lücke, wenn der Mitschnitt an dieser Stelle nicht weitergeht. */
/** Bahn/Gleis als eigenes Wort – "Fahrbahn reinigen" ist kein Gleisbereich */
export const mentionsRailway = (text: string) => /(^|[^a-zäöüß])(bahn[a-zäöüß]*|gleis[a-zäöüß]*|zug|züge|zuges)(?![a-zäöüß])/i.test(text) || /Straßenbahn|S-Bahn|U-Bahn/i.test(text);
/** Gas als eigenes Wort – "Gasse" oder "Gast" zählen nicht */
export const mentionsGas = (text: string) => /\b(Erd|Flüssig|Propan)?gas(geruch|austritt|leitung|flasche)?\b/i.test(text);

export function gapAt(tree: DiasTree, steps: Step[]): Gap | null {
  const last = steps[steps.length - 1];
  const currentId = last ? tree.nodes[last.nodeId]?.options[last.option]?.to : tree.root;
  if (!currentId) return last ? { kind: 'fehlt' } : null;
  const node = tree.nodes[currentId];
  if (!node) return { kind: 'fehlt' };
  if (node.kind === 'frage' || node.kind === 'ergebnis') return null;
  return { kind: node.kind as GapKind, node };
}

const ANSWER_ONLY = /^(ja|nein|unklar|unbekannt|unklar \/ unbekannt|keine|\d+|\d+-\d+|16-n)$/i;

/** Text der gewählten Antworten (ohne Eckklammer-Hinweise) */
export function pathLabels(tree: DiasTree, steps: Step[]): string[] {
  return steps
    .map((s) => tree.nodes[s.nodeId]?.options[s.option]?.label ?? '')
    .map((l) => l.replace(/\s*\[[^\]]*\]\s*/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Fragen und Antworten des Weges als ein Suchtext */
function pathHaystack(tree: DiasTree, steps: Step[]): string {
  return steps.map((s) => `${tree.nodes[s.nodeId]?.question ?? ''} ${tree.nodes[s.nodeId]?.options[s.option]?.label ?? ''}`).join(' | ');
}

/** Nur die gewählten Antworten ab dem zweiten Schritt (die Einstiegsantwort nennt bloß die Fachrichtung) */
function answerHaystack(tree: DiasTree, steps: Step[]): string {
  return pathLabels(tree, steps.slice(1)).join(' | ');
}

export function domainOf(tree: DiasTree, steps: Step[]): Domain {
  const first = pathLabels(tree, steps.slice(0, 1))[0] ?? '';
  const hay = answerHaystack(tree, steps);
  if (/Krankentransport|Intensiv-Verlegung/i.test(first)) return 'ktp';
  if (/Wassernotfall/i.test(first)) return 'wasser';
  if (/Berg|Höhle/i.test(first)) return 'berg';
  if (/Fach/i.test(first)) return 'fach';
  if (/Verkehrsunfall/i.test(first)) return 'vu';
  if (/Naturereignis|Unwetter/i.test(first)) return 'unwetter';
  if (/eCall|Automatische Notrufe/i.test(first)) return 'ecall';
  if (/Brandschutz|techn\. Notruf/i.test(first)) return /Feuer(?!wehr)|Brand(?!schutz)|Rauch|Explosion|Verpuffung|BMA|Warnmelder|Blitz/i.test(hay) ? 'brand' : 'th';
  // Med. Notruf (auch wenn der Weg in Feuerwehr-Teilbäume führt: medizinisch führen)
  return 'medizin';
}

export interface FollowUp {
  id: string;
  text: string;
  options: { v: string; label: string }[];
}

const JA_NEIN_UNKLAR = [
  { v: 'ja', label: 'Ja' },
  { v: 'nein', label: 'Nein' },
  { v: 'unklar', label: 'Unklar' },
];
const PERSONEN = [
  { v: '0', label: 'Keine' },
  { v: '1', label: '1' },
  { v: '2', label: '2' },
  { v: '3-6', label: '3–6' },
  { v: '7-10', label: '7–10' },
  { v: '11-25', label: '11–25' },
  { v: '26-50', label: '26–50' },
  { v: '>50', label: 'mehr als 50' },
  { v: 'unklar', label: 'Unklar' },
];

const Q: Record<string, FollowUp> = {
  bewusst: { id: 'bewusst', text: 'Ist die Person wach und reagiert sie auf Ansprache?', options: JA_NEIN_UNKLAR },
  atmung: {
    id: 'atmung',
    text: 'Wie atmet die Person?',
    options: [
      { v: 'normal', label: 'Normal' },
      { v: 'erschwert', label: 'Erschwert / pfeifend' },
      { v: 'nein', label: 'Gar nicht / Schnappatmung' },
      { v: 'unklar', label: 'Unklar' },
    ],
  },
  blutung: { id: 'blutung', text: 'Blutet die Person stark, ohne dass es aufhört?', options: JA_NEIN_UNKLAR },
  personen: { id: 'personen', text: 'Wie viele Personen sind verletzt, erkrankt oder in Gefahr?', options: PERSONEN },
  gefahr: { id: 'gefahr', text: 'Sind Menschen eingeschlossen, vermisst oder unmittelbar in Gefahr?', options: JA_NEIN_UNKLAR },
  gefahrstoff: { id: 'gefahrstoff', text: 'Sind Gefahrstoffe beteiligt (Warntafeln, Gasflaschen, Chemikalien, auslaufende Stoffe)?', options: JA_NEIN_UNKLAR },
  groesse: {
    id: 'groesse',
    text: 'Wie groß ist das Feuer?',
    options: [
      { v: 'klein', label: 'Klein (Mülleimer, Kleinfeuer, Pfanne)' },
      { v: 'mittel', label: 'Ein Gebäude / Fahrzeug / eine Wohnung' },
      { v: 'gross', label: 'Großflächig / mehrere Gebäude / Halle' },
      { v: 'unklar', label: 'Unklar' },
    ],
  },
  eingeklemmt: { id: 'eingeklemmt', text: 'Ist jemand eingeklemmt oder kommt nicht aus dem Fahrzeug?', options: JA_NEIN_UNKLAR },
  bab: { id: 'bab', text: 'Ist es auf einer Autobahn oder Schnellstraße?', options: JA_NEIN_UNKLAR.slice(0, 2) },
  sicht: { id: 'sicht', text: 'Ist die Person im Wasser noch zu sehen?', options: JA_NEIN_UNKLAR },
  zugang: { id: 'zugang', text: 'Ist die Person ohne Hilfsmittel erreichbar?', options: JA_NEIN_UNKLAR },
  kontakt: { id: 'kontakt', text: 'Gibt es Sprechkontakt zu den Insassen?', options: JA_NEIN_UNKLAR.slice(0, 2) },
  ktp_art: {
    id: 'ktp_art',
    text: 'Wie muss der Patient befördert werden?',
    options: [
      { v: 'sitzend', label: 'Sitzend' },
      { v: 'liegend', label: 'Liegend' },
      { v: 'intensiv', label: 'Intensiv / beatmet' },
    ],
  },
  infekt: { id: 'infekt', text: 'Liegt eine ansteckende Erkrankung vor?', options: JA_NEIN_UNKLAR },
  anforderung: {
    id: 'anforderung',
    text: 'Was genau wird angefordert?',
    options: [
      { v: 'rtw', label: 'Rettungswagen' },
      { v: 'na', label: 'Notarzt' },
      { v: 'rth', label: 'Rettungshubschrauber' },
      { v: 'ktw', label: 'Krankentransport' },
      { v: 'fw', label: 'Feuerwehr' },
      { v: 'pol', label: 'Polizei' },
    ],
  },
  th_lage: {
    id: 'th_lage',
    text: 'Was ist die Lage?',
    options: [
      { v: 'baum', label: 'Baum / Ast / Hindernis' },
      { v: 'wasser', label: 'Wasser im Gebäude / Überflutung' },
      { v: 'sturm', label: 'Sturmschaden am Gebäude' },
      { v: 'tuer', label: 'Tür öffnen / Person in Wohnung' },
      { v: 'sonst', label: 'Sonstiges' },
    ],
  },
};

/** Personenzahl aus dem Weg ablesen (null = unbekannt) */
export function personsFromPath(tree: DiasTree, steps: Step[]): number | null {
  let n: number | null = null;
  for (const s of steps) {
    const node = tree.nodes[s.nodeId];
    const label = node?.options[s.option]?.label ?? '';
    if (/^1 Person/i.test(label)) n = 1;
    else if (/Wie viele Person/i.test(node?.question ?? '')) {
      if (/^keine$/i.test(label)) n = 0;
      else if (/^\d+$/.test(label)) n = Number(label);
      else if (/^(\d+)-(\d+)$/.test(label)) n = Number(label.split('-')[0]);
      else if (/^16-N$/i.test(label)) n = 16;
    }
  }
  return n;
}

const countFromAnswer = (v: string | undefined): number | null => {
  if (!v || v === 'unklar') return null;
  if (v === '>50') return 51;
  return Number(v.split('-')[0]);
};

/** Welche Folgefragen stellt LEITWARTE (in dieser Reihenfolge)? Bereits Bekanntes wird nicht erneut gefragt. */
export function followUpsFor(tree: DiasTree, steps: Step[]): FollowUp[] {
  const d = domainOf(tree, steps);
  const hay = pathHaystack(tree, steps);
  const known = personsFromPath(tree, steps);
  const list: FollowUp[] = [];
  const ask = (q: FollowUp, unless?: RegExp) => {
    if (!unless || !unless.test(hay)) list.push(q);
  };
  const askPersons = () => {
    if (known === null || (known === 1 && /2 oder mehr/i.test(hay))) list.push(Q.personen);
  };
  switch (d) {
    case 'medizin':
      ask(Q.bewusst, /spricht|ansprechbar|bewusstlos|reagiert|wach/i);
      ask(Q.atmung, /atmet|Atmung|Atemstillstand|Schnapp/i);
      if (/Verletz|Unfall|Sturz|Blut|Schnitt|Stich|Gewalt|Messer/i.test(hay)) ask(Q.blutung, /Blutung/i);
      askPersons();
      break;
    case 'brand':
      ask(Q.groesse);
      ask(Q.gefahr, /eingeschlossen|vermisst/i);
      askPersons();
      ask(Q.gefahrstoff, /Gefahrgut|Gefahrstoff|Gasflasche|Chemikal/i);
      break;
    case 'th':
      ask(Q.th_lage, /Tür|Türe|Baum|Ast|Wasser|Sturm|Gas|Bahn|abgestürzt|Höhe|eingeklemmt|verschüttet/i);
      ask(Q.gefahr, /eingeschlossen|vermisst|eingeklemmt|verschüttet/i);
      askPersons();
      ask(Q.gefahrstoff, /Gefahrgut|Gefahrstoff|Gas/i);
      break;
    case 'vu':
      ask(Q.eingeklemmt, /eingeklemmt|eingeschlossen/i);
      askPersons();
      ask(Q.bab, /Autobahn|BAB/i);
      ask(Q.gefahrstoff, /Gefahrgut|Warntafel|Betriebsstoff/i);
      break;
    case 'wasser':
      ask(Q.sicht, /zu sehen|sichtbar|untergegangen/i);
      askPersons();
      break;
    case 'berg':
      ask(Q.zugang, /zugänglich/i);
      askPersons();
      break;
    case 'ktp':
      if (!/Intensiv|liegend|sitzend|Trage/i.test(answerHaystack(tree, steps))) list.push(Q.ktp_art);
      ask(Q.infekt, /Infekt|COVID|MRSA|isolier/i);
      break;
    case 'unwetter':
      ask(Q.th_lage, /Baum|Ast|Wasser|Sturm|Dach/i);
      ask(Q.gefahr, /eingeschlossen|vermisst|in Gefahr/i);
      break;
    case 'ecall':
      ask(Q.kontakt, /Kontakt/i);
      askPersons();
      ask(Q.bab, /Autobahn|BAB/i);
      break;
    case 'fach':
      ask(Q.anforderung, /\b(RTW|NEF|Notarzt|KTW|RTH|ITH|Feuerwehr|Polizei)\b/i);
      break;
  }
  return list;
}

/** Nächste offene Folgefrage (null = alle beantwortet) */
export function nextFollowUp(tree: DiasTree, steps: Step[], c: Completion): FollowUp | null {
  return followUpsFor(tree, steps).find((q) => c.answers[q.id] === undefined) ?? null;
}

export interface LwResult {
  /** Vorgeschlagene Stichwort-Codes in absteigender Priorität (das erste vorhandene wird genommen) */
  candidates: string[];
  meldebild: string;
  info: string;
  reasons: string[];
}

/** Großeinsatz-Stufe zur Verletztenzahl (R5 … R150, obere Grenze der Stufe) */
const R_LEVEL = (n: number) => `R${[5, 10, 15, 20, 30, 40, 50, 75, 100, 125, 150].find((m) => n <= m) ?? 150}`;

function withModifiers(base: string, mods: { x?: boolean; y?: boolean; r?: string | null }): string[] {
  const out: string[] = [];
  const r = mods.r ?? '';
  if (mods.x && r) out.push(`${base} X${r}`);
  if (mods.x && mods.y) out.push(`${base} XY`);
  if (r) out.push(`${base} ${r}`);
  if (mods.y) out.push(`${base} Y`);
  if (mods.x) out.push(`${base} X`);
  out.push(base);
  return out;
}

/** Ergebnis aus Weg, Eingabe und Folgefragen ableiten */
export function deriveResult(tree: DiasTree, steps: Step[], c: Completion): LwResult {
  const d = domainOf(tree, steps);
  const hay = pathHaystack(tree, steps);
  const a = c.answers;
  const persons = countFromAnswer(a.personen) ?? personsFromPath(tree, steps);
  const many = persons !== null && persons >= 3;
  const yes = (k: string) => a[k] === 'ja';
  const reasons: string[] = [];
  let candidates: string[] = [];
  const bab = yes('bab') || /Autobahn|BAB/i.test(hay);
  const critical =
    a.bewusst === 'nein' ||
    a.atmung === 'nein' ||
    a.atmung === 'erschwert' ||
    yes('blutung') ||
    /Reanimation|leblos|Atemstillstand|bewusstlos|Geburt|Mehrfachverletzung|Polytrauma|Schlaganfall|Herzinfarkt|Strangulation|Verbrennung|Ertrink|Stich|Schuss|gestürzt aus|abgestürzt/i.test(hay);

  switch (d) {
    case 'medizin':
    case 'berg':
    case 'ecall': {
      if (d === 'berg' && a.zugang === 'nein') candidates.push('TH SRHT');
      if (many) {
        const r = R_LEVEL(persons!);
        candidates.push(bab ? `NOTF BAB ${r}` : `NOTF ${r}`);
        reasons.push(`${persons} Betroffene → MANV-Stufe ${r}`);
      }
      const level = critical || (d === 'ecall' && a.kontakt === 'nein') ? '11' : '01';
      reasons.push(level === '11' ? 'lebensbedrohlich bzw. unklar → mit Notarzt' : 'nicht lebensbedrohlich → Rettungswagen');
      candidates.push(bab ? `NOTF BAB ${level}` : `NOTF ${level}`, `NOTF ${level}`);
      break;
    }
    case 'ktp':
      if (a.ktp_art === 'intensiv' || /Intensiv|beatmet|ITW/i.test(answerHaystack(tree, steps))) candidates.push('KBF VERL');
      if (yes('infekt')) candidates.push('KBF INF', 'KBF COVID');
      candidates.push('KBF STANDARD');
      break;
    case 'fach': {
      const req = a.anforderung ?? (/RTH|ITH/i.test(hay) ? 'rth' : /NEF|Notarzt/i.test(hay) ? 'na' : /KTW/i.test(hay) ? 'ktw' : /Feuerwehr/i.test(hay) ? 'fw' : /Polizei/i.test(hay) ? 'pol' : 'rtw');
      candidates.push({ rtw: 'NOTF 01', na: 'NOTF 11', rth: 'NOTF RTH', ktw: 'KBF STANDARD', fw: 'TH K 00', pol: 'W POLIZEI' }[req] ?? 'NOTF 01');
      reasons.push(`Anforderung: ${req.toUpperCase()}`);
      break;
    }
    case 'brand': {
      const small = a.groesse === 'klein' || /Kleinobjekt|Müll|Container|Papierkorb|Pfanne|Kamin/i.test(hay);
      const big = a.groesse === 'gross' || /Industrie|Lager|Halle|Hochhaus|Krankenhaus|Pflegeheim|Alten|Bauernhof|Scheune|Schiff|Flugzeug|Bahn/i.test(hay);
      const y = yes('gefahr') || /eingeschlossen|vermisst/i.test(hay);
      const x = yes('gefahrstoff');
      const r = many ? R_LEVEL(persons!) : null;
      const base = big ? 'FEU G 00' : small && !y ? 'FEU K 00' : 'FEU 00';
      candidates.push(...withModifiers(base, { x, y, r }));
      if (base !== 'FEU 00') candidates.push(...withModifiers('FEU 00', { x, y, r }));
      reasons.push(big ? 'Großobjekt/großflächig' : small ? 'Kleinbrand' : 'Brand Gebäude/Fahrzeug', ...(y ? ['Menschen in Gefahr'] : []), ...(x ? ['Gefahrstoffe'] : []), ...(r ? [`${persons} Verletzte`] : []));
      break;
    }
    case 'vu': {
      const x = yes('gefahrstoff');
      const r = many ? R_LEVEL(persons!) : null;
      if (yes('eingeklemmt') || /eingeklemmt/i.test(hay)) {
        candidates.push(...withModifiers('TH 00', { x, y: true, r }));
        reasons.push('Person eingeklemmt');
      } else if (many) {
        candidates.push(bab ? `NOTF BAB ${r}` : `NOTF ${r}`);
        reasons.push(`${persons} Verletzte`);
      } else if (persons && persons > 0) {
        candidates.push(bab ? 'NOTF BAB 01' : 'NOTF 01');
        reasons.push('Verletzte ohne Einklemmung');
      } else if (x) {
        candidates.push('TH 00 X', 'TH K 00');
        reasons.push('Betriebs-/Gefahrstoffe');
      } else {
        candidates.push('W POLIZEI', 'TH K 00');
        reasons.push('ohne Verletzte → Polizei');
      }
      break;
    }
    case 'wasser': {
      // Person im Wasser ist immer Menschenleben in Gefahr – auch wenn sie nicht mehr zu sehen ist
      candidates.push(...withModifiers('TH WASSER', { y: true, r: many ? R_LEVEL(persons!) : null }));
      reasons.push('Person im Wasser');
      break;
    }
    case 'th':
    case 'unwetter': {
      const y = yes('gefahr') || /eingeschlossen|vermisst|eingeklemmt|verschüttet/i.test(hay);
      const x = yes('gefahrstoff');
      const r = many ? R_LEVEL(persons!) : null;
      if (mentionsGas(hay)) candidates.push('TH GAS');
      if (mentionsRailway(hay)) candidates.push(...withModifiers('TH BAHN', { x, y, r }));
      if (/abgestürzt|Höhe|Tiefe|droht zu springen|abzustürzen/i.test(hay)) candidates.push(/springen|abzustürzen/i.test(hay) ? 'TH PDRZS' : 'TH SRHT');
      if (a.th_lage === 'tuer' || /Tür|Türe|in Wohnung eingeschlossen/i.test(hay)) candidates.push('TH K TV');
      if (a.th_lage === 'wasser' || /Wasser|Überflut/i.test(hay)) candidates.push(...withModifiers('TH WASSER', { y, r }));
      candidates.push(...withModifiers(y || r ? 'TH 00' : 'TH K 00', { x, y, r }), 'TH 00', 'TH K 00');
      reasons.push(y ? 'Menschen in Gefahr' : 'technische Hilfe ohne Menschenleben in Gefahr');
      break;
    }
  }
  candidates = [...new Set(candidates)];

  const labels = pathLabels(tree, steps);
  const informative = labels.filter((l, i) => i > 0 && !ANSWER_ONLY.test(l));
  const extras: string[] = [];
  if (a.bewusst === 'nein') extras.push('reagiert nicht');
  if (a.atmung === 'nein') extras.push('keine normale Atmung');
  if (a.atmung === 'erschwert') extras.push('Atmung erschwert');
  if (yes('blutung')) extras.push('starke Blutung');
  if (yes('gefahr')) extras.push('Menschen in Gefahr');
  if (yes('eingeklemmt')) extras.push('Person eingeklemmt');
  if (yes('gefahrstoff')) extras.push('Gefahrstoffe');
  if (persons !== null && persons > 1) extras.push(`${a.personen ?? persons} Betroffene`);
  const meldebild = [informative.slice(-3).join(' · ') || labels[0] || 'Notruf', extras.join(', ')].filter(Boolean).join(' – ');
  const inputText = c.input?.trim() ? `Angabe: ${c.input.trim()}` : '';
  const info = [labels.join(', '), inputText, extras.join(', ')].filter(Boolean).join(' | ');
  return { candidates, meldebild, info, reasons };
}

/** Erstes Stichwort aus den Kandidaten, das im Katalog der Leitstelle existiert */
export function pickKeyword(candidates: string[], codes: Iterable<string>): string | null {
  const set = new Map<string, string>();
  for (const c of codes) set.set(c.toUpperCase(), c);
  for (const c of candidates) {
    const hit = set.get(c.toUpperCase());
    if (hit) return hit;
  }
  return null;
}

/** Aktueller Knoten der Abfrage (wie im Abfragefeld; null, wenn der Weg ins Leere führt) */
export function currentNode(tree: DiasTree, steps: Step[]): DiasNode | null {
  const last = steps[steps.length - 1];
  const id = last ? tree.nodes[last.nodeId]?.options[last.option]?.to : tree.root;
  return id ? (tree.nodes[id] ?? null) : null;
}

/**
 * Die Frage, die gerade im Abfragefeld steht: DIAS-Knoten, Eingabeschritt einer Lücke oder
 * LEITWARTE-Folgefrage (als Knoten mit Antwortmöglichkeiten). null bei Ergebnis/Ende.
 */
export function currentQuestion(tree: DiasTree, steps: Step[], c?: Completion): DiasNode | null {
  const gap = gapAt(tree, steps);
  if (!gap) {
    const n = currentNode(tree, steps);
    return n && n.kind === 'frage' ? n : null;
  }
  if (!c && gap.kind !== 'fehlt' && gap.kind !== 'ende') return gap.node ?? null;
  const q = nextFollowUp(tree, steps, c ?? { answers: {} });
  if (!q) return null;
  return { id: `lw_${q.id}`, question: q.text, html: '', kind: 'frage', options: q.options.map((o) => ({ code: o.v, label: o.label, to: null })), dialog: null, result: null };
}
