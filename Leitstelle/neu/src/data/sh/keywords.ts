import type { KeywordCategory } from '../../model/types';
import type { KeywordSeed } from '../catalogs';

/**
 * Stichwortkatalog Schleswig-Holstein.
 * Codes (Grundschadenart + Erweiterung + Ergänzung) folgen der Struktur der Seite
 * „Einsatzstichworte/Mitte“ (wiki.lstsim.de). Bezeichnungen und Fahrzeugbedarf (AAO) sind
 * eigene Formulierungen bzw. eigene Festlegungen von LEITWARTE (siehe docs/SH-KATALOG-VORSCHLAG.md).
 * Der Bedarf ist in Fähigkeiten angegeben und im AAO-Editor frei änderbar.
 */

type Needs = [string, number][];

/** Bedarfe summieren */
const add = (...lists: Needs[]): Needs => {
  const m = new Map<string, number>();
  for (const l of lists) for (const [c, n] of l) m.set(c, (m.get(c) ?? 0) + n);
  return [...m.entries()].filter(([, n]) => n > 0);
};

const RD = (rtw: number, nef: number): Needs => add([['rtw', rtw], ['notarzt', nef]]);

/**
 * Großeinsatz Rettungsdienst (MANV) je Stufe R5 … R150 (obere Grenze der Verletztenzahl, wie in DIAS).
 * Faustregel: 1 RTW je 2 Verletzte (höchstens 15), 1 Notarzt je 5 Verletzte (höchstens 6),
 * ab R10 Einsatzleiter Rettungsdienst, ab R20 zusätzlich Organisatorischer Leiter.
 * Einheiten der Hilfsorganisationen (jeweils die ganze Komponente, ALL): ab R10 Transportkomponente 1
 * (RTW der Ortsvereine), ab R15 zusätzlich Transportkomponente 2 (KTW der Ortsvereine), ab R20 zusätzlich
 * Betreuungsgruppe und Patientenablage (GW-Betreuung, GW-San).
 */
export const MANV_LEVELS: [string, number, number][] = [
  ['R5', 3, 5],
  ['R10', 6, 10],
  ['R15', 11, 15],
  ['R20', 16, 20],
  ['R30', 21, 30],
  ['R40', 31, 40],
  ['R50', 41, 50],
  ['R75', 51, 75],
  ['R100', 76, 100],
  ['R125', 101, 125],
  ['R150', 126, 150],
];
/** Bedarf "ganze Komponente": alle Fahrzeuge der Leitstelle mit dieser Fähigkeit (ALL_OF_CAPABILITY in sim/dispatch.ts) */
const ALL = 99;
const MANV: Record<string, Needs> = Object.fromEntries(
  MANV_LEVELS.map(([r, , max]) => {
    const needs: Needs = [
      ['rtw', Math.min(15, Math.ceil(max / 2))],
      ['notarzt', Math.min(6, Math.ceil(max / 5))],
    ];
    if (max >= 10) needs.push(['rd_fuehrung', max >= 20 ? 2 : 1], ['t1', ALL]);
    if (max >= 15) needs.push(['t2', ALL]);
    if (max >= 20) needs.push(['betreuung', ALL], ['pat_ablage', ALL]);
    return [r, needs];
  }),
);
const MANV_TEXT: Record<string, string> = Object.fromEntries(MANV_LEVELS.map(([r, min, max]) => [r, `${min}–${max} Verletzte`]));
const MANV_CODES = MANV_LEVELS.map(([r]) => r);

const Y: Needs = [['loeschen', 1], ['rtw', 1], ['notarzt', 1]];
/**
 * Gefahrstoff (X): statt eines GW-Gefahrgut kommen Erkundungsgruppen des LZ-G (je Wache alle LZ-G-Fahrzeuge).
 * Brand: die nächste Erkundungsgruppe. TH ab TH 00 X: die zwei nächsten und das THW (GW-Dekon P).
 */
const X: Needs = [['erkundungsgruppe', 1], ['atemschutz', 1]];
const X_TH: Needs = [['erkundungsgruppe', 2], ['dekon', 1], ['atemschutz', 1]];
const xNeeds = (gsa: string) => (gsa.startsWith('TH') ? X_TH : X);

const FULL = ['', ...MANV_CODES, 'Übung', 'X', ...MANV_CODES.map((r) => `X${r}`), 'XY', 'Y'];

interface Mod {
  suffix: string;
  needs: Needs;
  exercise?: boolean;
  /** höhere Dringlichkeit (z. B. Menschenleben in Gefahr) */
  urgent?: boolean;
}

function modifier(eg: string, gsa: string): Mod {
  if (eg === '') return { suffix: '', needs: [] };
  if (eg === 'Übung') return { suffix: ' (Übungseinsatz)', needs: [], exercise: true };
  if (eg === 'Y') return { suffix: ' – Menschenleben in Gefahr', needs: Y, urgent: true };
  const X = xNeeds(gsa);
  if (eg === 'X') return { suffix: ' – Gefahrstoffaustritt', needs: X, urgent: true };
  if (eg === 'XY') return { suffix: ' – Gefahrstoff und Menschenleben in Gefahr', needs: add(X, Y), urgent: true };
  if (MANV[eg]) return { suffix: ` – Großeinsatz Rettungsdienst ${MANV_TEXT[eg]}`, needs: MANV[eg], urgent: true };
  if (/^XR\d+$/.test(eg) && MANV[eg.slice(1)]) {
    const r = eg.slice(1);
    return { suffix: ` – Gefahrstoff, Großeinsatz Rettungsdienst ${MANV_TEXT[r]}`, needs: add(X, MANV[r]), urgent: true };
  }
  throw new Error(`Unbekannte Ergänzung ${eg}`);
}

const seeds: KeywordSeed[] = [];
const code = (...parts: string[]) => parts.filter(Boolean).join(' ');

function family(gsa: string, ew: string, label: string, category: KeywordCategory, priority: 1 | 2 | 3, base: Needs, egs: string[], extra: Partial<KeywordSeed> = {}) {
  for (const eg of egs) {
    const m = modifier(eg, gsa);
    seeds.push({
      code: code(gsa, ew, eg),
      label: label + m.suffix,
      category,
      priority: m.urgent ? 1 : priority,
      needs: add(base, m.needs),
      ...extra,
      ...(m.exercise ? { exercise: true, emergency: false } : {}),
    });
  }
}

function one(c: string, label: string, category: KeywordCategory, priority: 1 | 2 | 3, needs: Needs, extra: Partial<KeywordSeed> = {}) {
  seeds.push({ code: c, label, category, priority, needs, ...extra });
}

/** Grundvariante + COVID-Variante (gleiche Fahrzeuge, verlängerte Versorgung) */
function withCovid(c: string, label: string, category: KeywordCategory, priority: 1 | 2 | 3, needs: Needs, extra: Partial<KeywordSeed> = {}) {
  one(c, label, category, priority, needs, extra);
  one(`${c} COVID`, `${label} – Infektionsverdacht (COVID)`, category, priority, needs, { ...extra, infection: 'covid' });
}

// ---------------------------------------------------------------- Notfalleinsätze (NOTF)
const NOTF_RD: [string, number, number, string][] = [
  ['01', 1, 0, 'Notfall: 1 RTW'],
  ['02', 2, 0, 'Notfall: 2 RTW'],
  ['03', 3, 0, 'Notfall: 3 RTW'],
  ['10', 0, 1, 'Notfall: nur Notarzt (NEF)'],
  ['11', 1, 1, 'Notfall: RTW und Notarzt'],
  ['12', 2, 1, 'Notfall: 2 RTW und Notarzt'],
  ['13', 3, 1, 'Notfall: 3 RTW und Notarzt'],
  ['22', 2, 2, 'Notfall: 2 RTW und 2 Notärzte'],
  ['23', 3, 2, 'Notfall: 3 RTW und 2 Notärzte'],
];
for (const [ew, r, n, l] of NOTF_RD) {
  withCovid(`NOTF ${ew}`, l, 'rd', 1, RD(r, n));
  if (ew === '01' || ew === '11') {
    one(`NOTF ${ew} First`, `${l} mit Ersthelfergruppe (First Responder)`, 'rd', 1, add(RD(r, n), [['first_responder', 1]]));
    one(`NOTF ${ew} X`, `${l} – hochinfektiös (Sonderschutz)`, 'rd', 1, RD(r, n), { infection: 'hoch' });
  }
}
one('NOTF ADIP', 'Notfall: schwergewichtiger Patient (über 180 kg)', 'rd', 1, [['rtw_schwerlast', 1]]);
one('NOTF ADIP G', 'Notfall: schwergewichtiger Patient (über 230 kg) mit Tragehilfe', 'rd', 1, [['rtw_schwerlast', 1], ['loeschen', 1]]);
for (const [ew, r, n, l] of NOTF_RD) one(`NOTF BAB ${ew}`, `${l} – Autobahn/Schnellstraße`, 'vu', 1, add(RD(r, n), [['polizei', 1]]));
for (const r of MANV_CODES) one(`NOTF BAB ${r}`, `Großeinsatz Rettungsdienst auf Autobahn/Schnellstraße – ${MANV_TEXT[r]}`, 'vu', 1, add(MANV[r], [['th', 1], ['polizei', 1]]));
one('NOTF INKUB', 'Notfall: Transport im Inkubator (Neugeborenes)', 'rd', 1, [['inkubator', 1], ['notarzt', 1]]);
withCovid('NOTF K', 'Notfall ohne Sondersignal: 1 RTW', 'rd', 2, RD(1, 0), { emergency: false });
for (const r of MANV_CODES) one(`NOTF ${r}`, `Großeinsatz Rettungsdienst – ${MANV_TEXT[r]}`, 'rd', 1, MANV[r]);
one('NOTF RTH', 'Notfall: nur Rettungshubschrauber', 'rd', 1, [['rth', 1]]);
one('NOTF SOKO KIT', 'Notfall: Krisenintervention (Kriseninterventionsteam)', 'rd', 2, [['psnv', 1]], { note: 'in der Praxis abgelöst durch PSNV-B' });
one('NOTF SOKO Fuss', 'Notfall: Sanitäts-Fußtrupp (z. B. Großveranstaltung)', 'rd', 2, [['san_gross', 1]]);
// Notfallverlegungen
const VERL: [string, string, Needs][] = [
  ['01', 'Notfallverlegung mit RTW', RD(1, 0)],
  ['11', 'Notfallverlegung mit RTW und Notarzt', RD(1, 1)],
  ['RTH', 'Notfallverlegung mit Rettungshubschrauber', [['rth', 1]]],
  ['ITW', 'Notfallverlegung mit Intensivtransportwagen', [['intensiv', 1]]],
  ['ARZT', 'Notfallverlegung mit RTW und begleitendem Klinikarzt', RD(1, 0)],
  ['ECMO', 'Notfallverlegung eines ECMO-Patienten', [['intensiv', 1], ['notarzt', 1]]],
  ['VEF', 'Notfallverlegung mit RTW und Verlegungsarzt (VEF)', RD(1, 1)],
];
for (const [ew, l, n] of VERL) withCovid(`NOTF VERL ${ew}`, l, 'ktp', 2, n);

// ---------------------------------------------------------------- Krankenbeförderung (KBF) – ohne Sondersignal
const KBF = { emergency: false } as const;
const kbfTriple = (ew: string, l: string, needs: Needs) => {
  one(`KBF ${ew}`, `Krankenbeförderung: ${l}`, 'ktp', 3, needs, KBF);
  one(`KBF ${ew} COVID`, `Krankenbeförderung: ${l} – Infektionsverdacht (COVID)`, 'ktp', 3, add(needs.filter(([c]) => c !== 'ktw'), needs.some(([c]) => c === 'ktw') ? [['ktw_infekt', 1]] : []), { ...KBF, infection: 'covid' });
  one(`KBF ${ew} INF`, `Krankenbeförderung: ${l} – infektiös`, 'ktp', 3, add(needs.filter(([c]) => c !== 'ktw'), needs.some(([c]) => c === 'ktw') ? [['ktw_infekt', 1]] : []), { ...KBF, infection: 'covid' });
};
kbfTriple('ADIP', 'schwergewichtiger Patient (über 180 kg)', [['ktw_schwerlast', 1]]);
one('KBF ADIP G', 'Krankenbeförderung: schwergewichtiger Patient (über 230 kg) mit Tragehilfe', 'ktp', 3, [['ktw_schwerlast', 1], ['loeschen', 1]], KBF);
one('KBF ADIP G COVID', 'Krankenbeförderung: über 230 kg mit Tragehilfe – Infektionsverdacht (COVID)', 'ktp', 3, [['ktw_schwerlast', 1], ['loeschen', 1]], { ...KBF, infection: 'covid' });
one('KBF ADIP G INF', 'Krankenbeförderung: über 230 kg mit Tragehilfe – infektiös', 'ktp', 3, [['ktw_schwerlast', 1], ['loeschen', 1]], { ...KBF, infection: 'covid' });
kbfTriple('AMBU', 'ambulante Behandlung mit Rückfahrt am selben Tag', [['ktw', 1]]);
one('KBF COVID', 'Krankenbeförderung – Infektionsverdacht (COVID)', 'ktp', 3, [['ktw_infekt', 1]], { ...KBF, infection: 'covid' });
one('KBF FEHL', 'Krankenbeförderung: Fehlfahrt (nur Abrechnung/Statistik)', 'ktp', 3, [], KBF);
kbfTriple('FERN', 'Fernfahrt (über 300 km oder über 8 Stunden)', [['ktw', 1]]);
one('KBF INF', 'Krankenbeförderung – infektiös', 'ktp', 3, [['ktw_infekt', 1]], { ...KBF, infection: 'covid' });
kbfTriple('ST', 'sitzend im Tragestuhl', [['ktw', 1]]);
one('KBF STANDARD', 'Krankenbeförderung (Standard)', 'ktp', 3, [['ktw', 1]], KBF);
one('KBF STANDARD DL', 'Krankenbeförderung mit Tragehilfe durch Drehleiter', 'ktp', 3, [['ktw', 1], ['hoehenrettung', 1]], KBF);
one('KBF STANDARD LF', 'Krankenbeförderung mit Tragehilfe durch die Feuerwehr', 'ktp', 3, [['ktw', 1], ['loeschen', 1]], KBF);
kbfTriple('VERL', 'Verlegung zwischen Kliniken', [['ktw', 1]]);
kbfTriple('ZWANG', 'Einweisung gegen den Willen (mit Polizei)', [['ktw', 1], ['polizei', 1]]);

// ---------------------------------------------------------------- Feuer (FEU K / FEU / FEU G)
one('FEU K 00', 'Brand kleiner als Standard', 'brand', 2, [['loeschen', 1]]);
one('FEU K AUS', 'Brand kleiner als Standard – Nachkontrolle', 'brand', 3, [['loeschen', 1]], { emergency: false });
one('FEU K BAHN', 'Brand kleiner als Standard im Gleisbereich', 'brand', 2, [['loeschen', 1]]);
one('FEU K BMA', 'Brandmeldeanlage – Kontrolle (z. B. Störung)', 'brand', 2, [['loeschen', 1]]);
one('FEU K BMA P', 'Heimrauchmelder ohne Brandanzeichen', 'brand', 2, [['loeschen', 1]]);

const FEU00: Needs = [['fuehrung_1', 1], ['loeschen', 2], ['hoehenrettung', 1]];
const FEU2: Needs = [['fuehrung_1', 1], ['loeschen', 3], ['hoehenrettung', 1], ['wasser_gross', 1]];
const FEU3: Needs = [['fuehrung_2', 1], ['fuehrung_1', 1], ['loeschen', 4], ['hoehenrettung', 2], ['wasser_gross', 1], ['atemschutz', 1], ['rtw', 1]];
const FEU4 = add(FEU3, [['loeschen', 2], ['logistik', 1]]);
const FEU5 = add(FEU4, [['loeschen', 2], ['mannschaft', 1]]);
const FEU6 = add(FEU5, [['loeschen', 2], ['mannschaft', 1]]);
const FEU7 = add(FEU6, [['loeschen', 2], ['mannschaft', 1]]);
const WATER: Needs = [['wasserrettung', 1]];

family('FEU', '00', 'Brand Standard', 'brand', 1, FEU00, FULL);
family('FEU', 'BAHN', 'Brand Standard im Gleisbereich', 'brand', 1, FEU00, FULL);
one('FEU BMA', 'Brandmeldeanlage ausgelöst (Objektstufe 1)', 'brand', 1, [['fuehrung_1', 1], ['loeschen', 1], ['hoehenrettung', 1]]);
one('FEU BMA Übung', 'Brandmeldeanlage (Übungseinsatz)', 'brand', 3, [['fuehrung_1', 1], ['loeschen', 1], ['hoehenrettung', 1]], { exercise: true, emergency: false });
one('FEU BMA X', 'Brandmeldeanlage – Gefahrstoffbetrieb (Objektstufe 2)', 'brand', 1, add([['fuehrung_1', 1], ['loeschen', 2], ['hoehenrettung', 1]], X));
one('FEU BMA Y', 'Brandmeldeanlage – Menschenleben in Gefahr (Objektstufe 2)', 'brand', 1, add([['fuehrung_1', 1], ['loeschen', 2], ['hoehenrettung', 1]], [['rtw', 1], ['notarzt', 1]]));
family('FEU', 'SCHIFF', 'Brand Standard auf einem Schiff', 'brand', 1, add(FEU00, WATER), FULL);
one('FEU SCHIFF W', 'Brand Standard auf einem Schiff – nur vom Wasser erreichbar', 'brand', 1, [['fuehrung_1', 1], ['wasserrettung', 2], ['loeschen', 1]]);
family('FEU', 'WALD', 'Wald- und Vegetationsbrand Standard', 'brand', 1, [['fuehrung_1', 1], ['loeschen', 2], ['wasser_gross', 1]], ['', 'Übung']);
family('FEU', '2', 'Brand Stufe 2', 'brand', 1, FEU2, FULL);
one('FEU 2 SCHIFF', 'Brand Stufe 2 auf einem Schiff', 'brand', 1, add(FEU2, WATER));
one('FEU 2 SCHIFF Y', 'Brand Stufe 2 auf einem Schiff – Menschenleben in Gefahr', 'brand', 1, add(FEU2, WATER, Y));
const STAGE = ['', ...MANV_CODES, 'Übung'];
family('FEU', '3', 'Brand Stufe 3', 'brand', 1, FEU3, STAGE);
family('FEU', '4', 'Brand Stufe 4', 'brand', 1, FEU4, STAGE);
family('FEU', '5', 'Brand Stufe 5', 'brand', 1, FEU5, STAGE);
family('FEU', '6', 'Brand Stufe 6', 'brand', 1, FEU6, STAGE);
family('FEU', '7', 'Brand Stufe 7', 'brand', 1, FEU7, STAGE);
family('FEU G', '00', 'Brand größer Standard', 'brand', 1, FEU2, FULL);
family('FEU G', 'BAHN', 'Brand größer Standard im Gleisbereich', 'brand', 1, FEU2, FULL);
one('FEU G BMA', 'Brandmeldeanlage ausgelöst (Objektstufe 3)', 'brand', 1, [['fuehrung_1', 1], ['loeschen', 3], ['hoehenrettung', 1]]);
one('FEU G BMA Übung', 'Brandmeldeanlage Objektstufe 3 (Übungseinsatz)', 'brand', 3, [['fuehrung_1', 1], ['loeschen', 3], ['hoehenrettung', 1]], { exercise: true, emergency: false });
one('FEU G BMA Y', 'Brandmeldeanlage – Menschenleben in Gefahr (Objektstufe 4)', 'brand', 1, [['fuehrung_2', 1], ['fuehrung_1', 1], ['loeschen', 4], ['hoehenrettung', 2], ['rtw', 2], ['notarzt', 1]]);
family('FEU G', 'SCHIFF', 'Brand größer Standard auf einem Schiff', 'brand', 1, add(FEU2, WATER), FULL);
one('FEU G SCHIFF W', 'Brand größer Standard auf einem Schiff – nur vom Wasser erreichbar', 'brand', 1, [['fuehrung_1', 1], ['wasserrettung', 2], ['loeschen', 2]]);
family('FEU G', 'WALD', 'Wald- und Vegetationsbrand größer Standard', 'brand', 1, [['fuehrung_1', 1], ['loeschen', 3], ['wasser_gross', 2]], ['', 'Übung']);

// ---------------------------------------------------------------- Technische Hilfe (TH K / TH / TH G)
one('TH K 00', 'Technische Hilfe kleiner als Standard', 'th', 3, [['th', 1]]);
one('TH K 00 COVID', 'Technische Hilfe kleiner als Standard – Infektionsverdacht (COVID)', 'th', 3, [['th', 1]], { infection: 'covid' });
one('TH K 00 Übung', 'Technische Hilfe kleiner als Standard (Übungseinsatz)', 'th', 3, [['th', 1]], { exercise: true, emergency: false });
one('TH K A', 'Technische Hilfe – Arbeitseinsatz', 'th', 3, [['th', 1]], { emergency: false, note: 'regional (Arbeitsfahrzeug der Berufsfeuerwehr)' });
one('TH K A COVID', 'Technische Hilfe – Arbeitseinsatz, Infektionsverdacht (COVID)', 'th', 3, [['th', 1]], { emergency: false, infection: 'covid' });
one('TH K AUST', 'Auslaufende Betriebsstoffe (klein)', 'th', 3, [['th', 1]]);
one('TH K ERK', 'Erkundung (unklare Lage)', 'th', 2, [['loeschen', 1]]);
one('TH K ERK X', 'Erkundung – Verdacht auf Gefahrstoff', 'th', 1, [['loeschen', 1], ['erkundungsgruppe', 1]]);
one('TH K ERK XY', 'Erkundung – Gefahrstoff und Menschenleben in Gefahr', 'th', 1, [['loeschen', 1], ['erkundungsgruppe', 1], ['rtw', 1]]);
one('TH K FLUSI', 'Absicherung einer Hubschrauberlandung', 'th', 2, [['loeschen', 1]]);
one('TH K TV', 'Türöffnung', 'th', 2, [['th', 1]]);
one('TH K TV 01', 'Türöffnung mit RTW (Person hilflos)', 'th', 1, [['th', 1], ['rtw', 1]]);
one('TH K TV 01 COVID', 'Türöffnung mit RTW – Infektionsverdacht (COVID)', 'th', 1, [['th', 1], ['rtw', 1]], { infection: 'covid' });
one('TH K TV 11', 'Türöffnung mit RTW und Notarzt', 'th', 1, [['th', 1], ['rtw', 1], ['notarzt', 1]]);
one('TH K TV 11 COVID', 'Türöffnung mit RTW und Notarzt – Infektionsverdacht (COVID)', 'th', 1, [['th', 1], ['rtw', 1], ['notarzt', 1]], { infection: 'covid' });

const TH00: Needs = [['fuehrung_1', 1], ['th', 1], ['th_schwer', 1]];
const THG: Needs = [['fuehrung_1', 1], ['th', 2], ['th_schwer', 1], ['logistik', 1]];
family('TH', '00', 'Technische Hilfe Standard', 'th', 1, TH00, FULL);
family('TH', 'AUST', 'Auslaufende Betriebsstoffe', 'th', 2, [['th', 1], ['oel', 1]], ['', 'Übung']);
one('TH AUST W', 'Auslaufende Betriebsstoffe auf dem Wasser', 'th', 2, [['th', 1], ['oel', 1], ['wasserrettung', 1]]);
family('TH', 'BAHN', 'Technische Hilfe Standard im Gleisbereich', 'th', 1, TH00, FULL);
family('TH', 'GAS', 'Gasaustritt / Gasgeruch', 'th', 1, [['fuehrung_1', 1], ['loeschen', 2], ['polizei', 1]], ['', 'Übung']);
family('TH', 'KMF', 'Kampfmittelfund', 'th', 1, [['loeschen', 1], ['polizei', 2]], ['', 'Übung']);
const PDRZS: Needs = [['fuehrung_1', 1], ['loeschen', 1], ['hoehenrettung', 1], ['rtw', 1], ['notarzt', 1], ['polizei', 2]];
one('TH PDRZS', 'Person droht zu springen', 'th', 1, PDRZS);
one('TH PDRZS COVID', 'Person droht zu springen – Infektionsverdacht (COVID)', 'th', 1, PDRZS, { infection: 'covid' });
one('TH PDRZS W', 'Person droht ins Wasser zu springen', 'th', 1, add(PDRZS, WATER));
one('TH PDRZS W COVID', 'Person droht ins Wasser zu springen – Infektionsverdacht (COVID)', 'th', 1, add(PDRZS, WATER), { infection: 'covid' });
one('TH PDRZS Übung', 'Person droht zu springen (Übungseinsatz)', 'th', 3, PDRZS, { exercise: true, emergency: false });
const SRHT: Needs = [['th', 1], ['hoehenrettung', 1], ['hoehenretter', 1], ['rtw', 1], ['notarzt', 1]];
one('TH SRHT', 'Spezielle Rettung aus Höhen und Tiefen', 'th', 1, SRHT);
one('TH SRHT COVID', 'Spezielle Rettung aus Höhen und Tiefen – Infektionsverdacht (COVID)', 'th', 1, SRHT, { infection: 'covid' });
one('TH SRHT Übung', 'Spezielle Rettung aus Höhen und Tiefen (Übungseinsatz)', 'th', 3, SRHT, { exercise: true, emergency: false });
family('TH', 'WASSER', 'Technische Hilfe auf dem Wasser', 'wasser', 1, [['wasserrettung', 1], ['loeschen', 1], ['rtw', 1]], FULL);
family('TH G', '00', 'Technische Hilfe größer Standard', 'th', 1, THG, FULL);
family('TH G', 'BAHN', 'Technische Hilfe größer Standard im Gleisbereich', 'th', 1, THG, FULL);

// ---------------------------------------------------------------- Polizeilagen (Bereitstellung)
const POL_LARGE: Needs = [['rtw', 2], ['notarzt', 1], ['rd_fuehrung', 1], ['polizei_fuehrung', 1], ['polizei_gruppe', 1]];
const polFamily = (ew: string, l: string, base: Needs) => {
  one(`POL ${ew}`, `Polizeilage: ${l}`, 'pol', 1, base);
  for (const r of MANV_CODES) one(`POL ${ew} ${r}`, `Polizeilage: ${l} – Großeinsatz Rettungsdienst ${MANV_TEXT[r]}`, 'pol', 1, add(base, MANV[r]));
};
polFamily('AMOK', 'Amoklage', POL_LARGE);
polFamily('BOMBE', 'Bombendrohung (Bereitstellung)', [['loeschen', 1], ['rtw', 1], ['polizei', 1]]);
polFamily('GEISEL', 'Geiselnahme (Bereitstellung)', POL_LARGE);
polFamily('LEBE', 'lebensbedrohliche Einsatzlage', POL_LARGE);
polFamily('SEK', 'Spezialeinsatz der Polizei (Bereitstellung)', [['rtw', 1], ['notarzt', 1]]);
polFamily('TERROR', 'Terroranschlag', POL_LARGE);
polFamily('USBV', 'Fund einer Spreng-/Brandvorrichtung (Bereitstellung)', [['loeschen', 1], ['rtw', 1], ['polizei', 1]]);
one('SOLA', 'Sonderlage (Führungsstab)', 'sonstiges', 1, [['fuehrung_2', 1], ['rd_fuehrung', 1]]);

// ---------------------------------------------------------------- Sonderkomponenten
one('SOKO MIRG FiFi', 'Brandbekämpfung auf See (Maritime Incident Response Group)', 'brand', 1, [['loeschen', 2], ['wasserrettung', 1], ['fuehrung_1', 1]]);
one('SOKO MIRG FR', 'Erstmaßnahmen auf See (Maritime Incident Response Group)', 'wasser', 1, [['loeschen', 1], ['wasserrettung', 1]]);
one('SOKO PSNV-B HAUS', 'Psychosoziale Notfallversorgung Betroffener – häusliches Umfeld', 'sonstiges', 2, [['psnv', 1]]);
one('SOKO PSNV-B ÖFF', 'Psychosoziale Notfallversorgung Betroffener – öffentlicher Raum', 'sonstiges', 2, [['psnv', 1]]);
one('SOKO PSNV-E', 'Psychosoziale Notfallversorgung für Einsatzkräfte', 'sonstiges', 3, [['psnv', 1]], { emergency: false });
one('SOKO PSNV-E BF', 'Psychosoziale Notfallversorgung für Einsatzkräfte (Berufsfeuerwehr)', 'sonstiges', 3, [['psnv', 1]], { emergency: false });
one('SOKO PSNV-E FF', 'Psychosoziale Notfallversorgung für Einsatzkräfte (Freiwillige Feuerwehr)', 'sonstiges', 3, [['psnv', 1]], { emergency: false });
one('SOKO SRHT', 'Sonderkomponente Höhenrettung', 'th', 1, [['hoehenretter', 1]]);

// ---------------------------------------------------------------- Dienstfahrten, Info, Test (ohne Einsatzgeschehen)
const ADMIN = { emergency: false } as const;
one('DF Standard', 'Dienstfahrt (z. B. Werkstatt)', 'sonstiges', 3, [], ADMIN);
one('DF BrSiwa', 'Dienstfahrt: Brandsicherheitswache', 'sonstiges', 3, [['loeschen', 1]], ADMIN);
one('DF BrSiwa K', 'Dienstfahrt: Brandsicherheitswache ohne Fahrzeug (Fußtrupp)', 'sonstiges', 3, [], ADMIN);
one('DF PROBE', 'Dienstfahrt: Probealarm', 'sonstiges', 3, [], ADMIN);
one('DF FREMD', 'Dienstfahrt: Fremdbesetzung', 'sonstiges', 3, [], ADMIN);
one('DF FREMD R', 'Dienstfahrt: Gebietsabsicherung Rettungsdienst', 'sonstiges', 3, [['rtw', 1]], ADMIN);
one('DF FREMD F', 'Dienstfahrt: Gebietsabsicherung Feuerwehr', 'sonstiges', 3, [['loeschen', 1]], ADMIN);
one('DF SanWa', 'Dienstfahrt: Sanitätswachdienst', 'sonstiges', 3, [['ktw', 1]], ADMIN);
one('I Info', 'Informationseinsatz (ohne Kräfte)', 'sonstiges', 3, [], ADMIN);
one('I TEST', 'Testeinsatz', 'sonstiges', 3, [], ADMIN);
one('I TEST T-Dienst', 'Testeinsatz Technik/Systembetreuung', 'sonstiges', 3, [], ADMIN);
one('I TEST Dispo', 'Testeinsatz Disposition', 'sonstiges', 3, [], ADMIN);
one('I TEST GEO', 'Testeinsatz Koordinaten', 'sonstiges', 3, [], ADMIN);
one('I SCHLÜSSEL', 'Schlüsseldepot/Funkschlüssel öffnen', 'sonstiges', 3, [], ADMIN);

// ---------------------------------------------------------------- Weiterleitungen (kein Einsatz)
const FWD = { forward: true, emergency: false } as const;
one('W ÄBD', 'Weiterleitung an den ärztlichen Bereitschaftsdienst (116117)', 'rd', 3, [], FWD);
one('W ÄBD COVID', 'Weiterleitung an den ärztlichen Bereitschaftsdienst – Infektionsverdacht', 'rd', 3, [], FWD);
one('W A-ARZT', 'Weiterleitung an das Gesundheitsamt (Amtsarzt)', 'sonstiges', 3, [], FWD);
one('W AUS-AMT', 'Weiterleitung an das Integrationsamt', 'sonstiges', 3, [], FWD);
one('W FEU', 'Weiterleitung Brandeinsatz an zuständige Leitstelle', 'brand', 3, [], FWD);
one('W J-AMT', 'Weiterleitung an das Jugendamt', 'sonstiges', 3, [], FWD);
one('W KBF', 'Weiterleitung Krankenbeförderung', 'ktp', 3, [], FWD);
one('W NOTF', 'Weiterleitung Notfall an zuständige Leitstelle', 'rd', 3, [], FWD);
one('W O-AMT', 'Weiterleitung an das Ordnungsamt', 'sonstiges', 3, [], FWD);
one('W POLIZEI', 'Weiterleitung an die Polizei (110)', 'pol', 3, [], FWD);
one('W Seelsorger', 'Weiterleitung an die Notfallseelsorge', 'sonstiges', 3, [], FWD);
one('W TH', 'Weiterleitung Technische Hilfe an zuständige Leitstelle', 'th', 3, [], FWD);
one('W U-AMT', 'Weiterleitung an die Umweltbehörde', 'sonstiges', 3, [], FWD);
one('W V-AMT', 'Weiterleitung an das Veterinäramt', 'tier', 3, [], FWD);

// ---------------------------------------------------------------- THW-Module
one('THW Beleuchtung', 'THW: Ausleuchtung', 'th', 3, [['thw_notstrom', 1]]);
one('THW Bergung', 'THW: Bergung', 'th', 2, [['thw_bergung', 1]]);
one('THW FB', 'THW: Fachberatung', 'th', 3, [['thw_fuehrung', 1]]);
one('THW ÖL', 'THW: Ölschadenbekämpfung', 'th', 3, [['thw_pumpen', 1], ['logistik', 1]]);
one('THW ORTUNG', 'THW: Ortung verschütteter Personen', 'th', 1, [['thw_bergung', 1]]);
one('THW Strom', 'THW: Notstromversorgung', 'th', 3, [['thw_notstrom', 1]]);
one('THW Transport', 'THW: Transport/Logistik', 'th', 3, [['logistik', 1]]);
one('THW WASSER', 'THW: Wasserschaden / Pumpen', 'th', 3, [['thw_pumpen', 1]]);

export const SH_KEYWORD_SEEDS: KeywordSeed[] = seeds;
