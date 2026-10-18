import type { FactValue } from '../../data/questions';
import type { BuildingKind, DetailContext, DetailTopic } from './types';
import { p, w, zahl, storeyOf } from './types';

/* ------------------------------------------------------------------ Hilfen */

const str = (v: FactValue) => String(v);
const low = (v: FactValue | undefined) => String(v ?? '').toLowerCase();

/**
 * Alle Szenariotexte (klein), OHNE Ortsbeschreibung und ohne bereits festgelegte Detailwerte (x_…) –
 * sonst hinge das Ergebnis von der Fragereihenfolge ab.
 */
const scenText = (c: DetailContext) =>
  Object.entries(c.facts)
    .filter(([k, v]) => typeof v === 'string' && !k.startsWith('x_') && !k.startsWith('_'))
    .map(([, v]) => String(v))
    .join(' ')
    .toLowerCase();
/** Szenariotexte inkl. Ortsbeschreibung */
const factText = (c: DetailContext) => `${scenText(c)} ${low(c.facts._detail)}`;
/** Nur Ereignis und Objekt (was brennt / was ist los) */
const eventText = (c: DetailContext) => `${low(c.facts.what)} ${low(c.facts.object)}`;

type Kind = BuildingKind | 'scheune';
const isHouse = (k: Kind) => k === 'efh' || k === 'rh';
interface Bld {
  kind: Kind;
  label: string;
  minFloors: number;
  maxFloors: number;
}

/** Mindestanzahl Geschosse (inkl. EG), die die Szenariotexte verlangen ("3. OG", "zweiter Stock", "Dachgeschoss" …) */
function neededFloors(c: DetailContext): number {
  const t = scenText(c);
  let st = 0;
  const s0 = storeyOf(c.facts.floor);
  if (s0 !== null && s0 !== 99 && s0 > st) st = s0;
  for (const m of t.matchAll(/(\d+)\.\s*(obergeschoss|og|etage|stock)/g)) st = Math.max(st, Number(m[1]));
  const ORD: Record<string, number> = { erst: 1, zweit: 2, dritt: 3, viert: 4, fuenft: 5, fünft: 5, sechst: 6 };
  for (const m of t.matchAll(/(erst|zweit|dritt|viert|fuenft|fünft|sechst)(e|en|er|em) (stock|etage|obergeschoss)/g)) st = Math.max(st, ORD[m[1]]);
  if (st === 0 && (s0 === 99 || /obergeschoss|\bog\b|dachgeschoss|dachwohnung|\bstock\b|treppenhaus|treppe /.test(t))) st = 1;
  return st + 1;
}

/**
 * Gebäude am Einsatzort. Grundlage ist ctx.building; ausdrücklich genannte Gebäudearten aus den
 * Szenariotexten ("Dachstuhl eines Mehrfamilienhauses", "Pflegeheim", "Scheune") haben Vorrang
 * vor der zufälligen Ortsbeschreibung, und die Geschosszahl reicht immer bis zum genannten Stockwerk.
 */
function bld(c: DetailContext): Bld | null {
  const s = scenText(c);
  // Gebäudeart nur aus Ereignis/Objekt/Stockwerk – nicht aus Vorgeschichte oder Transportziel
  const ev = `${eventText(c)} ${low(c.facts.floor)}`;
  const d = `${ev} ${low(c.facts._detail)}`;
  let b: Bld | null = c.building ? { ...c.building } : null;
  const set = (kind: Kind, label: string, minFloors: number, maxFloors: number) => (b = { kind, label, minFloors, maxFloors });
  if (/hochhaus/.test(ev)) set('hochhaus', 'Hochhaus', 8, 14);
  else if (/mehrfamilienhaus|wohnblock/.test(ev)) set('mfh', 'Mehrfamilienhaus', 3, 5);
  else if (/einfamilienhaus|bungalow|ferienhaus/.test(ev)) set('efh', 'Einfamilienhaus', 1, 2);
  else if (/reihenhaus|doppelhaus/.test(ev)) set('rh', 'Reihenhaus', 2, 3);
  else if (/gaestehaus|gästehaus|pension|zimmervermietung/.test(ev)) set('mfh', 'Gästehaus', 2, 3);
  else if (/unterkunft/.test(ev)) set('mfh', 'Unterkunft', 1, 2);
  else if (/pflegeheim|seniorenheim|altenheim|einrichtung mit (bettl|pflege)|bewohnerzimmer|wohnbereich/.test(d)) set('klinik', 'Pflegeheim', 2, 4);
  else if (/krankenhaus|klinik/.test(ev) && b?.kind === 'klinik') set('klinik', 'Krankenhaus', 3, 6);
  else if (/scheune|geraeteschuppen|geräteschuppen|schuppen|\bstall\b/.test(ev)) set('scheune', /schuppen/.test(ev) ? 'Schuppen' : 'Scheune', 1, 1);
  else if (b && b.kind === 'gewerbe' && /halle/.test(ev)) set('gewerbe', 'Halle', 1, 2);
  else if (b && b.kind === 'gewerbe' && /werkstatt/.test(ev)) set('gewerbe', 'Werkstatt', 1, 2);
  else if (b && b.kind === 'oeffentlich') {
    const lbl = /supermarkt/.test(d) ? 'Supermarkt' : /gaststaette|gaststätte/.test(d) ? 'Gaststätte' : /bahnhof/.test(d) ? 'Bahnhofsgebäude' : /schule/.test(d) ? 'Schule' : /kirche/.test(d) ? 'Kirche' : b.label;
    set('oeffentlich', lbl, b.minFloors, b.maxFloors);
  }
  if (!b) return null;
  let bb: Bld = b;
  const need = neededFloors(c);
  // Reetdach gibt es nur auf niedrigen Wohnhäusern
  if (/reet/.test(s) && ['mfh', 'hochhaus'].includes(bb.kind) && need <= 2) bb = { kind: 'efh', label: 'Friesenhaus', minFloors: 1, maxFloors: 2 };
  // "1. OG links" oder ab dem 3. OG: kein Einfamilienhaus
  if (isHouse(bb.kind) && (need >= 4 || /\b(links|rechts)\b/.test(low(c.facts.floor)))) bb = { kind: 'mfh', label: 'Mehrfamilienhaus', minFloors: Math.max(3, need), maxFloors: Math.max(4, need) };
  if (need > bb.minFloors && bb.kind !== 'scheune') return { ...bb, minFloors: need, maxFloors: Math.max(bb.maxFloors, need) };
  return bb;
}

/** "Ein" / "Eine" passend zur Bezeichnung */
const ein = (label: string) => (/^(Halle|Werkstatt|Scheune|Unterkunft|Schule|Kirche|Gaststätte)$/.test(label) ? 'Eine' : 'Ein');

/** Wohngebäude (Wohnung/Haus mit Bewohnern) */
const residential = (c: DetailContext) => {
  const b = bld(c);
  return b !== null && ['efh', 'rh', 'mfh', 'hochhaus'].includes(b.kind);
};
/** "das Haus" / "das Gebäude" / "die Scheune" */
/** Scheune/Schuppen mit passendem Artikel */
const sch = (b: Bld | null) =>
  b?.label === 'Schuppen'
    ? { der: 'der Schuppen', ein: 'ein Schuppen', dem: 'dem Schuppen', des: 'des Schuppens', alt: 'Ein alter Schuppen' }
    : { der: 'die Scheune', ein: 'eine Scheune', dem: 'der Scheune', des: 'der Scheune', alt: 'Eine alte Scheune' };
const noun = (b: Bld) => (b.kind === 'scheune' ? sch(b).der : ['efh', 'rh', 'mfh', 'hochhaus'].includes(b.kind) ? 'das Haus' : 'das Gebäude');
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Das Ereignis spielt draußen (Hof, Container, Fahrzeug, vor dem Gebäude …), obwohl am Ort ein Gebäude steht */
const outsideHint = (c: DetailContext) =>
  /draußen|draussen|im hof|im freien|kaimauer|pier|garten|straßenrand/.test(low(c.facts.floor)) ||
  /container|mülltonne|muelltonne|gelber-sack|gelber sack|\bpkw\b|kleinwagen|elektroauto|\bauto\b|böschung|boeschung|hecke|vegetation|baum in einer|birke/.test(eventText(c)) ||
  (/^(vor |am |auf dem |im stadtpark|stadtpark)|vorplatz|marktplatz/.test(low(c.facts._detail)) &&
    !/heim|haus|gebäude|gebaeude|halle|zimmer|wohnung|station|flur|küche|kueche/.test(eventText(c)));

/** Einsatz in einem Gebäude */
const inside = (c: DetailContext) => bld(c) !== null && !outsideHint(c);

const isPassant = (c: DetailContext) => /passant|spaziergaenger|spaziergänger|fahrer/i.test(c.relation);
/** Anrufer gehört zum Haus/zur Familie/zum Betrieb */
const isInsider = (c: DetailContext) => /bewohner|angeh|betroffen|hausmeister|pflege|station|kolleg|betrieb/i.test(c.relation);
/** Personal/Betrieb (kennt Technik und Schlüssel eines Nicht-Wohngebäudes) */
const isStaff = (c: DetailContext) => /hausmeister|pflege|station|kolleg|betrieb/i.test(c.relation);
const isResident = (c: DetailContext) => /bewohner|betroffen/i.test(c.relation);

const NOT_HOUSE = () => 'Hier ist kein Gebäude, das ist im Freien.';
const NOT_INSIDE = () => 'Das betrifft hier kein Haus, das ist draußen.';

const kellerOf = (c: DetailContext) => c.get('x_keller') === true;

/* ---------------------------------------------- Haustür (auch für die Wohnungstür im Einfamilienhaus) */

function haustuerAnswer(v: FactValue, c: DetailContext): string {
  const b = bld(c);
  const nobody = c.facts.trapped === true || /verschlossen|keiner macht auf|macht keiner auf/.test(scenText(c));
  switch (str(v)) {
    case 'insider_draussen':
      return 'Ich warte draußen vor dem Haus und zeige Ihnen den Eingang.';
    case 'insider':
      return b?.kind === 'klinik' ? 'Ich hole Sie unten am Haupteingang ab.' : 'Ich mache Ihnen die Tür auf, wenn Sie da sind.';
    case 'offen':
      return b && b.kind !== 'scheune' && !residential(c) ? 'Der Haupteingang ist offen, da kommen Sie rein.' : 'Die Haustür steht offen, da kommen Sie rein.';
    case 'tor_offen':
      return `Das Tor von ${sch(b).dem} steht offen.`;
    case 'tor_zu':
      return `Das Tor von ${sch(b).dem} ist zu, aber nicht abgeschlossen.`;
    case 'pforte':
      return 'Der Eingang ist zu, Sie müssen vorne an der Pforte klingeln.';
    case 'nachbar':
      return 'Die Haustür ist zu, aber ich habe einen Türöffner, ich drücke auf, wenn Sie klingeln.';
    default:
      if (isPassant(c)) return 'Die Haustür ist zu, ich komme da auch nicht rein.';
      return nobody ? 'Die Haustür ist zu, da macht keiner auf.' : 'Die Haustür ist zu, da müssen Sie klingeln.';
  }
}

/* ------------------------------------------------------------------ Themen */

/** Gebäude, Zugang, Brandumfeld */
export const BUILDING_TOPICS: DetailTopic[] = [
  {
    id: 'x_etagen',
    label: 'Anzahl der Etagen',
    patterns: [
      p(' wie ?viele? (etagen|stockwerke|stockwerk|geschosse|obergeschosse|stock) '),
      p(' wie hoch ist (das|der|die) (haus|gebaeude|block|wohnblock|scheune|halle)'),
      p(' (etagen|stockwerke|geschosse) hat '),
      p(' (ist|wie) (das|es) (ein |so ein )?(hohes|grosses|flaches) (haus|gebaeude)'),
    ],
    examples: ['Wie viele Etagen hat das Gebäude?', 'wie viele stockwerke hat das haus', 'Wie hoch ist das Haus?', 'wieviele geschosse hat der block', 'äh wie viele obergeschosse hat das so', 'äh wieviel etagen sind das so'],
    applies: (c) => bld(c) !== null,
    generate: (c) => {
      const b = bld(c)!;
      return c.rng.int(b.minFloors, b.maxFloors);
    },
    answer: (v, c) => {
      const b = bld(c)!;
      const n = Number(v);
      if (n <= 1) {
        if (b.kind === 'scheune') return `${cap(sch(b).der)} ist ebenerdig, nur ein großer Raum unter dem Dach.`;
        if (b.kind === 'gewerbe' && /Halle|Werkstatt/.test(b.label)) return `Nur ein Geschoss, aber die ${b.label} ist ziemlich hoch.`;
        if (isHouse(b.kind)) return 'Das ist ein Bungalow, nur Erdgeschoss.';
        return 'Das ist ein flaches Gebäude, nur Erdgeschoss.';
      }
      return `${cap(noun(b))} hat ${zahl(n)} Etagen, also Erdgeschoss und ${zahl(n - 1)} ${n - 1 === 1 ? 'Obergeschoss' : 'Obergeschosse'}.`;
    },
    unknown: NOT_HOUSE,
  },
  {
    id: 'x_gebaeudeart',
    label: 'Gebäudeart und Baualter',
    patterns: [
      p(' (was fuer ein|welche art von|welche sorte) (haus|gebaeude|wohnhaus) (ist (das|es)|handelt es sich|haben wir)'),
      p(' was (ist|sind) (das|es) (\\w+ )?fuer (ein|eine) (haus|gebaeude|wohnhaus|bau) '),
      p(' (ist (das|es) )?(ein )?(einfamilienhaus|reihenhaus|mehrfamilienhaus|wohnblock|hochhaus|altbau|neubau) oder (ein )?(einfamilienhaus|reihenhaus|mehrfamilienhaus|wohnblock|hochhaus|altbau|neubau) '),
      w('gebaeudeart|gebaeudetyp|haustyp|bauweise|baujahr|altbau|neubau|fachwerkhaus|plattenbau'),
      p(' wie alt ist (das|der) (haus|gebaeude|block|bau)'),
    ],
    examples: ['Was für ein Haus ist das?', 'ist das ein einfamilienhaus oder ein mehrfamilienhaus', 'Wie alt ist das Gebäude ungefähr?', 'äh altbau oder neubau', 'was ist das denn für ein gebäude', 'ist das ein altbau'],
    applies: (c) => bld(c) !== null,
    generate: (c) => {
      const b = bld(c)!;
      if (/reet|friesenhaus|\bkate\b/.test(factText(c)) && b.kind !== 'gewerbe' && b.kind !== 'klinik') return 'reet';
      if (b.kind === 'scheune') return 'scheune';
      if (b.kind === 'gewerbe') return c.rng.pick(['halle', 'buero', 'alt_gewerbe']);
      if (b.kind === 'klinik') return c.rng.pick(['klinik_alt', 'klinik_neu']);
      if (b.kind === 'hochhaus') return c.rng.pick(['siebziger', 'siebziger', 'neu']);
      if (b.kind === 'oeffentlich') return c.rng.pick(['oeff_alt', 'siebziger', 'neu']);
      return c.rng.pick(['alt', 'nachkrieg', 'siebziger', 'neu']);
    },
    answer: (v, c) => {
      const b = bld(c)!;
      switch (str(v)) {
        case 'reet':
          return isHouse(b.kind) ? 'Ein altes Friesenhaus mit Reetdach, bestimmt über hundert Jahre alt.' : `${ein(b.label)} ${b.label} mit Reetdach, schon ziemlich alt.`;
        case 'scheune':
          return `${sch(b).alt} aus Holz und Backstein.`;
        case 'halle':
          return 'Eine Halle aus Stahl und Blech, vorne dran ist ein Bürotrakt.';
        case 'buero':
          return 'Ein Firmengebäude, vorne Büros aus Beton, dahinter die Halle.';
        case 'alt_gewerbe':
          return 'Ein älteres Firmengebäude aus Backstein mit angebauter Halle.';
        case 'klinik_alt':
          return `${ein(b.label)} ${b.label}, älterer Bau mit mehreren Anbauten.`;
        case 'klinik_neu':
          return `${ein(b.label)} ${b.label}, noch relativ neu gebaut.`;
        case 'oeff_alt':
          return `${ein(b.label)} ${b.label}, schon ein älterer Bau.`;
        case 'alt':
          return `${ein(b.label)} ${b.label}, ein Altbau mit Holzbalkendecken, glaube ich.`;
        case 'nachkrieg':
          return `${ein(b.label)} ${b.label}, so aus den Fünfzigern, Klinkerbau.`;
        case 'siebziger':
          return `${ein(b.label)} ${b.label}, ich schätze aus den Siebzigern.`;
        default:
          return `${ein(b.label)} ${b.label}, noch ziemlich neu.`;
      }
    },
    unknown: NOT_HOUSE,
  },
  {
    id: 'x_dach',
    label: 'Dachform und Dacheindeckung',
    patterns: [
      w('dachform|reetdach|strohdach|flachdach|satteldach|walmdach|spitzdach|dacheindeckung|reetgedeckt'),
      p(' (was fuer ein|welche art von|welches) dach'),
      p(' wie (ist|sieht) das dach'),
      p(' (womit|mit was) ist das dach (gedeckt|bedeckt)'),
      p(' dach (\\w+ ){0,2}(aus|mit) (reet|stroh|ziegeln|ziegel|blech|pappe) '),
    ],
    examples: ['Was für ein Dach hat das Haus?', 'ist das ein reetdach', 'Hat das Gebäude ein Flachdach?', 'äh womit ist das dach gedeckt', 'wie sieht das dach so aus', 'äh ist das dach mit reet gedeckt'],
    applies: (c) => bld(c) !== null,
    generate: (c) => {
      const t = factText(c);
      const b = bld(c)!;
      if (/reet/.test(t) || c.get('x_gebaeudeart') === 'reet') return 'reet';
      if (b.kind === 'hochhaus' || b.kind === 'klinik') return 'flach';
      if (b.kind === 'scheune') return c.rng.chance(0.6) ? 'blech' : 'ziegel';
      if (b.kind === 'gewerbe') return c.rng.chance(0.7) ? 'flach' : 'blech';
      if (b.kind === 'oeffentlich') return c.rng.chance(0.6) ? 'flach' : 'ziegel';
      if (/dachstuhl|dachgeschoss|dachboden/.test(t)) return c.rng.chance(0.9) ? 'ziegel' : 'reet';
      if (b.kind === 'efh' && c.rng.chance(0.1)) return 'reet';
      if (b.kind === 'mfh' && c.rng.chance(0.25)) return 'flach';
      return 'ziegel';
    },
    answer: (v, c) => {
      const b = bld(c)!;
      switch (str(v)) {
        case 'reet':
          return c.category === 'brand' ? 'Das ist ein Reetdach, also Stroh, das brennt wie Zunder!' : 'Das ist ein Reetdach.';
        case 'flach':
          return 'Ein Flachdach.';
        case 'blech':
          return b.kind === 'scheune' ? 'Ein Dach aus Wellblech.' : 'Ein flaches Blechdach, so Trapezblech.';
        default:
          return 'Ein ganz normales Spitzdach mit Ziegeln.';
      }
    },
    unknown: NOT_HOUSE,
  },
  {
    id: 'x_aufzug',
    label: 'Aufzug vorhanden',
    patterns: [
      p(' (gibt es|gibts|hat das haus|hat das gebaeude|hat der block|ist da|ist dort|haben sie) (\\w+ ){0,2}(einen |ein )?(aufzug|fahrstuhl|lift|personenaufzug) '),
      p(' (aufzug|fahrstuhl|lift) (vorhanden|im haus|im gebaeude) '),
    ],
    examples: ['Gibt es einen Aufzug im Haus?', 'hat das haus einen fahrstuhl', 'Ist da ein Lift?', 'äh gibts da so einen aufzug', 'ist ein fahrstuhl vorhanden'],
    applies: (c) => bld(c) !== null,
    generate: (c) => {
      const t = scenText(c);
      const b = bld(c)!;
      const eng = /(kein|keinen|ohne) (aufzug|fahrstuhl|lift)|trage passt nicht|treppenhaus ist zu eng|enges treppenhaus|treppe ist nicht zu schaffen/;
      if (b.kind !== 'klinik' && eng.test(t)) return false;
      if (/aufzug|fahrstuhl/.test(t)) return true;
      if (b.kind === 'hochhaus' || b.kind === 'klinik') return true;
      if (isHouse(b.kind) || b.kind === 'scheune') return false;
      const floors = Number(c.get('x_etagen') ?? b.minFloors);
      if (floors <= 2) return false;
      if (isPassant(c)) return 'unbekannt';
      if (b.kind === 'mfh') return floors >= 5 ? c.rng.chance(0.7) : c.rng.chance(0.15);
      return c.rng.chance(0.5);
    },
    answer: (v, c) => {
      const b = bld(c)!;
      if (v === true) {
        if (/steckengeblieben|steckt|feststeck|im aufzug/.test(scenText(c))) return 'Ja, und in dem steckt ja gerade jemand fest!';
        return b.kind === 'klinik' ? 'Ja, es gibt einen Bettenaufzug.' : 'Ja, es gibt einen Aufzug.';
      }
      if (v === 'unbekannt') return 'Das weiß ich nicht, ich war noch nie in dem Haus.';
      if (isHouse(b.kind)) return 'Nein, das ist ein normales Wohnhaus, da gibt es keinen Aufzug.';
      if (b.kind === 'scheune') return `Nein, das ist ${sch(b).ein}.`;
      return 'Nein, einen Aufzug gibt es nicht, nur das Treppenhaus.';
    },
    unknown: NOT_HOUSE,
  },
  {
    id: 'x_keller',
    label: 'Keller vorhanden',
    patterns: [
      p(' (gibt es|gibts|hat das haus|hat das gebaeude|hat es|hat der block|ist da) (\\w+ ){0,2}(einen |ein )?(keller|kellergeschoss|untergeschoss) '),
      w('unterkellert'),
    ],
    examples: ['Hat das Haus einen Keller?', 'ist das gebäude unterkellert', 'gibt es da einen keller', 'äh hat das haus so einen keller', 'äh gibts da nen keller'],
    applies: (c) => bld(c) !== null,
    generate: (c) => {
      if (storeyOf(c.facts.floor) === -1 || /keller|untergeschoss|souterrain/.test(scenText(c))) return true;
      const kind = bld(c)!.kind;
      if (kind === 'scheune') return false;
      if (kind === 'mfh' || kind === 'hochhaus' || kind === 'klinik') return c.rng.chance(0.9);
      if (kind === 'gewerbe' || kind === 'oeffentlich') return c.rng.chance(0.3);
      return c.rng.chance(0.65);
    },
    answer: (v, c) => {
      const b = bld(c)!;
      if (v === true) return `Ja, ${noun(b)} hat einen Keller.`;
      return isHouse(b.kind) || b.kind === 'mfh' ? 'Nein, keinen Keller, das ist auf einer Bodenplatte gebaut.' : 'Nein, einen Keller gibt es da nicht.';
    },
    unknown: NOT_HOUSE,
  },
  {
    id: 'x_treppenhaus',
    label: 'Treppenhaus / Fluchtweg verraucht',
    categories: ['brand'],
    patterns: [
      w('treppenhaus|treppenraum|fluchtweg|rettungsweg|hausflur'),
      p(' (kommt|kommen) (man|sie|die leute|die bewohner) (\\w+ ){0,2}(noch )?(durch|ueber) die treppe'),
      p(' ist (die|der) (treppe|flur) (\\w+ )?(verraucht|frei|begehbar)'),
    ],
    examples: ['Ist das Treppenhaus verraucht?', 'ist der fluchtweg noch frei', 'Kommt man noch durch die Treppe raus?', 'äh wie sieht es im treppenhaus aus', 'ist der hausflur verraucht'],
    applies: (c) => inside(c) && !isPassant(c),
    generate: (c) => {
      const smoke = low(c.facts.smoke);
      if (/treppenhaus/.test(smoke) && !/kein rauch/.test(smoke)) return 'verraucht';
      if (/ganze (haus|gebäude|gebaeude) brennt|vollbrand|steht in flammen/.test(`${smoke} ${eventText(c)}`)) return 'verraucht';
      if (/flur/.test(smoke) && !/kein rauch/.test(smoke)) return 'leicht';
      if (storeyOf(c.facts.floor) === -1 && c.facts.spreading === true) return 'verraucht';
      if (/kein rauch|ob es (ueberhaupt|überhaupt) brennt/.test(`${smoke} ${low(c.facts.object)}`)) return 'frei';
      if (c.facts.spreading === true) return c.rng.chance(0.6) ? 'verraucht' : 'leicht';
      return c.rng.chance(0.7) ? 'frei' : 'leicht';
    },
    answer: (v, c) => {
      const b = bld(c)!;
      const s = str(v);
      if (isHouse(b.kind)) {
        const flur = Number(c.get('x_etagen') ?? 2) <= 1 ? 'Der Flur' : 'Die Treppe im Haus';
        if (s === 'verraucht') return `${flur} ist voller Rauch, da kommt keiner mehr durch!`;
        if (s === 'leicht') return 'Es zieht schon etwas Rauch rein, aber man kommt noch durch.';
        return `${flur} ist frei, da ist kein Rauch.`;
      }
      if (b.kind === 'mfh' || b.kind === 'hochhaus') {
        if (s === 'verraucht') return 'Das Treppenhaus ist komplett verraucht, da sieht man die Hand vor Augen nicht!';
        if (s === 'leicht') return 'Im Treppenhaus ist schon etwas Rauch, aber man kommt noch durch.';
        return 'Das Treppenhaus ist frei, da ist kein Rauch.';
      }
      if (s === 'verraucht') return 'Drinnen ist alles voller Rauch, da kommt keiner mehr durch!';
      if (s === 'leicht') return 'In den Fluren ist schon etwas Rauch, aber man kommt noch raus.';
      return 'Die Fluchtwege sind frei, da ist kein Rauch.';
    },
    unknown: (c) => (bld(c) === null ? NOT_HOUSE() : !inside(c) ? NOT_INSIDE() : 'Das kann ich von draußen nicht sehen, ich bin nur vorbeigekommen.'),
  },
  {
    id: 'x_haustuer',
    label: 'Haustür offen / Zugang ins Gebäude',
    patterns: [
      w('haustuer|hauseingang|hauseingangstuer|eingangstuer|haupteingang'),
      p(' wo (genau )?(ist|befindet sich) (der|die) (hauseingang|haustuer|eingang|eingangstuer|haupteingang) '),
      p(' (kommt|kommen) (man|wir|die kollegen|die einsatzkraefte|der rettungsdienst|die feuerwehr) (\\w+ ){0,2}(rein|hinein|ins haus|ins gebaeude) '),
      p(' (ist|wird) (\\w+ ){0,2}(aufgemacht|geoeffnet) wenn (wir|die kollegen) (kommen|da sind)'),
    ],
    examples: ['Ist die Haustür offen?', 'kommt man ins haus rein', 'Wo ist der Hauseingang?', 'äh kommen die kollegen da so rein', 'ist die haustür abgeschlossen'],
    applies: (c) => bld(c) !== null,
    generate: (c) => {
      const b = bld(c)!;
      if (b.kind === 'scheune') return c.rng.chance(0.5) ? 'tor_offen' : 'tor_zu';
      if (isInsider(c)) return c.category === 'brand' ? 'insider_draussen' : 'insider';
      if (!residential(c)) return c.rng.chance(0.7) ? 'offen' : 'pforte';
      if (isPassant(c)) return 'zu';
      if (b.kind === 'mfh' || b.kind === 'hochhaus') return c.rng.pick(['offen', 'zu', 'zu', 'nachbar']);
      return c.rng.pick(['offen', 'zu', 'zu']);
    },
    answer: haustuerAnswer,
    unknown: NOT_HOUSE,
  },
  {
    id: 'x_schluessel',
    label: 'Schlüssel vorhanden',
    patterns: [w('schluessel|ersatzschluessel|zweitschluessel|hausschluessel|wohnungsschluessel|generalschluessel')],
    examples: ['Haben Sie einen Schlüssel?', 'hat jemand einen ersatzschlüssel', 'äh haben sie so einen schlüssel für die wohnung', 'Gibt es einen Zweitschlüssel?'],
    applies: (c) => bld(c) !== null,
    generate: (c) => {
      const b = bld(c)!;
      if (b.kind === 'scheune') return 'offen';
      if (!residential(c)) return isStaff(c) ? 'ja' : 'firma';
      if (/bewohner|angeh|hausmeister|pflege|station|betrieb/i.test(c.relation)) return 'ja';
      if (isPassant(c)) return 'nein';
      return c.rng.pick(['nein', 'nein', 'nachbar', 'ja']);
    },
    answer: (v, c) => {
      const b = bld(c)!;
      switch (str(v)) {
        case 'ja':
          if (/hausmeister|betrieb/i.test(c.relation)) return 'Ja, ich habe den Generalschlüssel dabei.';
          if (/pflege|station/i.test(c.relation)) return 'Ja, wir haben hier alle Schlüssel.';
          return 'Ja, ich habe einen Schlüssel.';
        case 'offen':
          return `Da braucht man keinen Schlüssel, ${sch(b).der} ist nicht abgeschlossen.`;
        case 'firma':
          return b.kind === 'klinik' ? 'Ich nicht, aber das Personal hier hat Schlüssel.' : 'Ich nicht, da müsste jemand von der Firma kommen.';
        case 'nachbar':
          return 'Ich nicht, aber die Nachbarin von gegenüber hat einen Ersatzschlüssel.';
        default:
          return isPassant(c) ? 'Nein, ich wohne hier ja nicht.' : 'Nein, einen Schlüssel habe ich nicht.';
      }
    },
    unknown: NOT_HOUSE,
  },
  {
    id: 'x_klingel',
    label: 'Name an Klingel / Tür',
    patterns: [
      w('klingel|klingelschild|tuerschild|namensschild|briefkasten'),
      p(' (welcher|was fuer ein) name (steht|ist) (\\w+ ){0,4}(tuer|wohnung|klingel|briefkasten)'),
      p(' wie heissen die (bewohner|leute|nachbarn|mieter)'),
      p(' wie heisst die (familie|bewohnerin|mieterin) '),
      p(' (auf|bei) welche[nm] namen '),
    ],
    examples: ['Welcher Name steht an der Klingel?', 'was steht auf dem klingelschild', 'Wie heißen die Bewohner?', 'äh welcher name steht da so an der tür', 'auf welchen namen müssen wir klingeln'],
    applies: (c) => bld(c) !== null,
    generate: (c) => {
      const b = bld(c)!;
      const m = /klingel\s*["„“]?([A-ZÄÖÜ][a-zäöüß]+)/i.exec(String(c.facts._detail ?? ''));
      if (m && residential(c)) return m[1];
      if (b.kind === 'scheune') return 'scheune';
      if (b.kind === 'gewerbe') return 'firma';
      if (b.kind === 'klinik' || b.kind === 'oeffentlich') return 'einrichtung';
      if (isPassant(c)) return '';
      if (isResident(c)) return 'eigener';
      return c.rng.pick(['Petersen', 'Hansen', 'Jensen', 'Schröder', 'Brandt', 'Lorenzen', 'Thomsen', 'Wulf', 'Carstensen', 'Möller']);
    },
    answer: (v, c) => {
      const b = bld(c)!;
      const s = str(v);
      if (!s) return 'Das kann ich von hier nicht lesen, ich bin nur vorbeigekommen.';
      if (s === 'scheune') return `Das ist ${sch(b).ein}, da gibt es keine Klingel.`;
      if (s === 'firma') return 'Da steht nur der Firmenname dran, Eingang ist vorne beim Schild.';
      if (s === 'einrichtung') return 'Das ist kein Wohnhaus, da gibt es keine Namensklingel, nur den Haupteingang.';
      if (s === 'eigener') return 'Da steht unser Name dran, also meiner.';
      return `An der Klingel steht ${s}.`;
    },
    unknown: NOT_HOUSE,
  },
  {
    id: 'x_wohnungslage',
    label: 'Lage der Wohnung im Geschoss',
    patterns: [
      p(' (links|rechts|mitte|in der mitte|vorne|hinten) oder (links|rechts|mitte|in der mitte|vorne|hinten) '),
      p(' (welche|auf welcher|an welcher) seite (\\w+ ){0,3}(wohnung|tuer|flur|treppenhaus|haus)'),
      p(' (liegt|ist) die wohnung (\\w+ ){0,2}(links|rechts|mitte|vorne|hinten) '),
    ],
    examples: ['Liegt die Wohnung links oder rechts?', 'ist die wohnung links oder rechts vom eingang', 'Auf welcher Seite ist die Wohnung?', 'äh links rechts oder mitte'],
    applies: (c) => residential(c),
    generate: (c) => {
      const b = bld(c)!;
      if (isHouse(b.kind)) return 'einzig';
      const t = `${low(c.facts.floor)} ${low(c.facts._detail)}`;
      if (/links/.test(t)) return 'links';
      if (/rechts/.test(t)) return 'rechts';
      if (/mitte/.test(t)) return 'mitte';
      if (isPassant(c)) return 'unbekannt';
      return c.rng.pick(['links', 'rechts', 'links', 'rechts', 'mitte']);
    },
    answer: (v) => {
      switch (str(v)) {
        case 'einzig':
          return 'Das ist ein Haus für eine Familie, da gibt es nur die eine Wohnung.';
        case 'mitte':
          return 'Die mittlere Wohnung, direkt gegenüber der Treppe.';
        case 'unbekannt':
          return 'Das weiß ich nicht, ich sehe das nur von draußen.';
        default:
          return `Vom Treppenhaus aus ${str(v)}.`;
      }
    },
    unknown: (c) => (bld(c) === null ? NOT_HOUSE() : 'Das ist kein Wohnhaus, da gibt es keine Wohnungen.'),
  },
  {
    id: 'x_brandursache',
    label: 'Wie das Feuer entstanden ist',
    categories: ['brand'],
    patterns: [
      w('brandursache|ursache'),
      p(' (wie|wodurch|wovon) (ist|kam) (es|das|der brand|das feuer) (\\w+ ){0,2}(entstanden|ausgebrochen|zustande|dazu)'),
      p(' wie kam es (zu dem|zum) (brand|feuer) '),
      p(' (wodurch|wie|womit) hat (es|das|das feuer|der brand) (\\w+ )?angefangen'),
      p(' was hat (den brand|das feuer) (ausgeloest|verursacht)'),
      p(' (wissen sie|weiss man) (\\w+ )?(wie|wodurch|warum) (es|das feuer|der brand) (\\w+ ){0,2}(angefangen|entstanden|ausgebrochen)'),
    ],
    examples: ['Wie ist das Feuer entstanden?', 'wissen sie wie es angefangen hat', 'Was hat den Brand ausgelöst?', 'äh kennen sie die ursache', 'wodurch hat es so angefangen', 'äh wie kam es zu dem brand'],
    generate: (c) => {
      const t = factText(c);
      const ev = eventText(c);
      const b = bld(c);
      if (/brandmeldeanlage/.test(ev)) return 'bma';
      if (/rauchmelder|heimrauchmelder|ob es (ueberhaupt|überhaupt) brennt/.test(ev)) return 'rm';
      if (/gelöscht|geloescht|gestern gebrannt|nachkontroll/.test(t)) return 'nachschau';
      const draussen = !inside(c);
      if (draussen && /bremse|heißgelaufen|heissgelaufen/.test(ev)) return 'bremse';
      if (draussen && /güterwagen|gueterwagen|bauzug|waggon/.test(ev) && !/aggregat|motor/.test(ev)) return c.rng.pick(['bahn', 'unklar']);
      if (draussen && /schiff|boot|kutter|yacht|fähre|faehre/.test(ev)) return 'maschinenraum';
      if (draussen && /\bpkw\b|\bauto\b|\blkw\b|motor|reifen|kombi|kleinwagen|sattelzug|triebwagen|\bbus\b/.test(ev)) return 'technik';
      if (/herd|pfanne|fett|küche|kueche/.test(ev)) return 'herd';
      if (/schornstein|kamin|holzofen/.test(t)) return 'ofen';
      if (/elektroauto|akku|batterie/.test(t)) return 'akku';
      if (/elektrobrand|unterverteilung|verteiler|kabel|steckdose/.test(t)) return 'elektro';
      if (/blitz|reet/.test(t)) return c.rng.chance(0.5) ? 'blitz' : 'funken';
      if (/gleis/.test(ev)) return c.rng.pick(['bahn', 'zigarette']);
      if (/feld|getreide|stoppel/.test(ev)) return c.rng.pick(['zigarette', 'maschine', 'unklar']);
      if (/wald|böschung|boeschung|heide|moor|unterholz|düne|duene|vegetation/.test(ev)) return c.rng.pick(['zigarette', 'unklar']);
      if ((!b || b.kind === 'scheune') && /scheune|heu|stroh/.test(ev)) return c.rng.pick(['heu', 'elektro', 'unklar']);
      if (storeyOf(c.facts.floor) === -1 || /keller/.test(ev)) return isPassant(c) ? 'unklar' : c.rng.pick(['keller', 'elektro', 'unklar']);
      if (/mülltonne|muelltonne|tonne|container|gelber|mülleimer|muelleimer|papierkorb/.test(ev)) return c.rng.pick(['zigarette', 'unklar', 'asche']);
      if (isPassant(c)) return 'unklar';
      if (b && (b.kind === 'gewerbe' || b.kind === 'scheune')) return c.rng.pick(['elektro', 'unklar', 'arbeiten']);
      if (b && !residential(c)) return c.rng.pick(['elektro', 'unklar', 'zigarette']);
      return c.rng.pick(['kerze', 'elektro', 'unklar', 'unklar', 'zigarette']);
    },
    answer: (v, c) => {
      const ins = isInsider(c);
      const wohnung = inside(c) && residential(c);
      switch (str(v)) {
        case 'bma':
          return 'Keine Ahnung, die Brandmeldeanlage hat ausgelöst, warum, weiß ich nicht.';
        case 'rm':
          return 'Keine Ahnung, ich weiß nur, dass der Melder piept.';
        case 'nachschau':
          return 'Da hatte es vorher schon gebrannt, wir dachten, das ist aus.';
        case 'herd':
          return 'Da war wohl Essen auf dem Herd, das Fett hat Feuer gefangen.';
        case 'ofen':
          return ins ? 'Wir haben den Holzofen angeheizt, und dann fing es im Schornstein an zu knistern.' : 'Die haben wohl den Holzofen angeheizt, und dann kamen oben Funken aus dem Schornstein.';
        case 'blitz':
          return 'Ich glaube, da hat vorhin der Blitz eingeschlagen.';
        case 'funken':
          return 'Keine Ahnung, vielleicht Funkenflug, das Reet ist ja knochentrocken.';
        case 'akku':
          return 'Ich glaube, das kam von der Batterie, es hat erst gezischt und dann gebrannt.';
        case 'bremse':
          return 'Ich glaube, da ist eine Bremse heißgelaufen, das hat vorher richtig gequietscht.';
        case 'technik':
          return 'Ich weiß nicht, ich glaube, das kam vom Motor.';
        case 'maschinenraum':
          return 'Ich glaube, das kam aus dem Maschinenraum.';
        case 'bahn':
          return 'Vielleicht Funkenflug vom Zug, der ist vorhin vorbeigefahren.';
        case 'zigarette':
          return wohnung ? 'Keine Ahnung, vielleicht hat jemand im Bett geraucht.' : 'Keine Ahnung, vielleicht hat jemand eine Zigarette weggeworfen.';
        case 'maschine':
          return 'Da war vorhin ein Mähdrescher unterwegs, vielleicht kam es davon.';
        case 'asche':
          return 'Vielleicht hat jemand heiße Asche reingekippt.';
        case 'keller':
          return 'Keine Ahnung, vielleicht hat da unten jemand was angezündet, da steht ja immer Gerümpel rum.';
        case 'heu':
          return 'Vielleicht hat sich das Heu selbst entzündet, das war noch feucht eingefahren.';
        case 'arbeiten':
          return 'Da wurde vorhin noch geschweißt, vielleicht kam es davon.';
        case 'kerze':
          return ins ? 'Ich glaube, da war noch eine Kerze an.' : 'Ich weiß nicht genau, vielleicht eine Kerze.';
        case 'elektro':
          return ins ? 'Es hat erst nach verschmortem Kabel gerochen, vielleicht was Elektrisches.' : 'Keine Ahnung, vielleicht was Elektrisches.';
        default:
          return isPassant(c) ? 'Das weiß ich nicht, ich habe nur den Rauch gesehen.' : 'Das weiß ich nicht, auf einmal hat es gebrannt.';
      }
    },
  },
  {
    id: 'x_wohnungstuer',
    label: 'Wohnungstür / Zimmertür zu oder offen',
    patterns: [
      w('wohnungstuer|zimmertuer|kuechentuer|wohnungseingangstuer'),
      p(' (die )?tuer (zur|von der|der) (wohnung|kueche|brandwohnung) '),
    ],
    examples: ['Ist die Wohnungstür zu?', 'ist die tür zur wohnung offen', 'Haben Sie die Wohnungstür geschlossen?', 'äh steht die wohnungstür so offen'],
    applies: (c) => inside(c) && residential(c),
    generate: (c) => {
      const t = scenText(c);
      if (isHouse(bld(c)!.kind)) return `haus:${str(c.get('x_haustuer') ?? 'zu')}`;
      if (/verschlossen|keiner macht auf|macht keiner auf|türspalt|tuerspalt/.test(t)) return 'zu_fremd';
      if (c.category === 'brand') {
        if (/rauchmelder|ob es (ueberhaupt|überhaupt) brennt/.test(eventText(c)) && !isResident(c)) return isPassant(c) ? 'unbekannt' : 'zu_fremd';
        if (isResident(c) || /angeh/i.test(c.relation)) return c.facts.trapped === true ? 'zu_drin' : 'zu_ich';
        if (isPassant(c)) return 'unbekannt';
        if (c.facts.trapped === true) return 'zu_fremd';
        return c.rng.chance(0.6) ? 'zu_fremd' : 'offen';
      }
      if (c.category === 'pol') return c.facts.weapon === true ? 'zu_gefahr' : 'zu';
      if (isInsider(c)) return 'auf_ich';
      if (isPassant(c)) return 'unbekannt';
      return c.facts.trapped === true ? 'zu_fremd' : 'zu';
    },
    answer: (v, c) => {
      const s = str(v);
      if (s.startsWith('haus:')) return `Das ist ein Einzelhaus, da gibt es nur die Haustür. ${haustuerAnswer(s.slice(5), c)}`;
      switch (s) {
        case 'zu_ich':
          return 'Ich habe die Tür hinter mir zugezogen, als ich raus bin.';
        case 'zu_drin':
          return 'Die Wohnungstür ist zu, und ich komme nicht mehr rein!';
        case 'zu_fremd':
          return 'Die Wohnungstür ist zu, da macht keiner auf.';
        case 'offen':
          return 'Die Wohnungstür steht offen, da kommt der Rauch raus.';
        case 'auf_ich':
          return 'Die mache ich Ihnen auf, die lasse ich dann offen.';
        case 'zu':
          return 'Die Wohnungstür ist zu.';
        case 'zu_gefahr':
          return 'Die Wohnungstür ist zu, da gehe ich bestimmt nicht hin!';
        default:
          return 'Das weiß ich nicht, ich war nicht im Haus.';
      }
    },
    unknown: (c) => (bld(c) === null ? NOT_HOUSE() : !inside(c) ? NOT_INSIDE() : 'Das ist keine Wohnung, da gibt es nur die Eingangstür.'),
  },
  {
    id: 'x_gas',
    label: 'Gasanschluss / Gasflaschen',
    patterns: [
      w('gasanschluss|gasleitung|gasleitungen|gasheizung|gasherd|gasflasche|gasflaschen|gastherme|gasversorgung|propangas|propan|gaskartusche|gaskartuschen|gaszaehler|gastank|fluessiggas'),
      p(' (hat|haben) (das haus|das gebaeude|die wohnung|die bewohner) (\\w+ )?gas '),
      p(' (gibt es|gibts) (da |dort |denn |so |auch )*gas (im|in der|in dem) (haus|wohnung|gebaeude|keller) '),
    ],
    examples: ['Gibt es einen Gasanschluss im Haus?', 'sind da gasflaschen drin', 'Hat das Haus eine Gasheizung?', 'äh lagern da irgendwo propangas flaschen', 'gibt es so eine gasleitung', 'hat das haus gas', 'äh gibts da gas im haus'],
    applies: (c) => bld(c) !== null,
    generate: (c) => {
      const t = factText(c);
      if (/gasflasche|propan|campinggas|gaskartusch/.test(t)) return 'flaschen';
      if (/gastherme|gasheizung|gasherd|erdgas|gasleitung|gasgeruch|\bgas\b/.test(t)) return 'leitung';
      if (isPassant(c)) return 'unbekannt';
      const kind = bld(c)!.kind;
      if (kind === 'scheune') return c.rng.pick(['keins', 'keins', 'flaschen']);
      if (kind === 'gewerbe') return c.rng.pick(['flaschen', 'leitung', 'keins']);
      if (isHouse(kind)) return c.rng.pick(['leitung', 'keins', 'keins', 'tank', 'grill']);
      return c.rng.pick(['leitung', 'leitung', 'keins']);
    },
    answer: (v, c) => {
      const res = residential(c);
      switch (str(v)) {
        case 'flaschen':
          return 'Ja, da stehen Gasflaschen drin, das weiß ich!';
        case 'leitung':
          return res ? 'Ja, das Haus hat Gas, eine Gasheizung.' : 'Ja, das Gebäude hat einen Gasanschluss.';
        case 'tank':
          return 'Im Garten steht ein Flüssiggastank für die Heizung.';
        case 'grill':
          return 'Gasanschluss nicht, aber auf der Terrasse steht ein Gasgrill mit Flasche.';
        case 'keins':
          return res ? 'Nein, Gas gibt es da nicht, die heizen mit Fernwärme.' : 'Nein, Gas gibt es da nicht.';
        default:
          return 'Das weiß ich nicht, ich kenne das Haus nicht.';
      }
    },
    unknown: NOT_HOUSE,
  },
  {
    id: 'x_photovoltaik',
    label: 'Photovoltaik / Solaranlage / Speicher',
    patterns: [
      w('photovoltaik|photovoltaikanlage|fotovoltaik|pv anlage|pv|solaranlage|solarzellen|solarmodule|solarpanele|solarpanels|solardach|balkonkraftwerk|stromspeicher|batteriespeicher|hausspeicher'),
      p(' solar'),
    ],
    examples: ['Ist eine Photovoltaikanlage auf dem Dach?', 'gibt es eine solaranlage', 'äh haben die so pv auf dem dach', 'Gibt es einen Batteriespeicher im Haus?', 'sind da solarmodule drauf'],
    applies: (c) => bld(c) !== null,
    generate: (c) => {
      const kind = bld(c)!.kind;
      if (c.get('x_dach') === 'reet') return 'nein';
      if (isHouse(kind)) {
        if (!c.rng.chance(0.4)) return 'nein';
        return c.rng.chance(0.4) && !isPassant(c) ? 'speicher' : 'ja';
      }
      if (kind === 'gewerbe' || kind === 'scheune') return c.rng.chance(0.5) ? 'ja' : 'nein';
      if (kind === 'mfh') return c.rng.chance(0.15) ? 'ja' : 'nein';
      return c.rng.chance(0.1) ? 'ja' : 'nein';
    },
    answer: (v, c) => {
      const b = bld(c)!;
      switch (str(v)) {
        case 'ja':
          if (b.kind === 'gewerbe') return 'Ja, das ganze Hallendach ist voller Solarplatten.';
          if (b.kind === 'scheune') return `Ja, auf dem Dach ${sch(b).des} sind lauter Solarplatten.`;
          return 'Ja, auf dem Dach sind Solarplatten.';
        case 'speicher':
          return `Ja, Solar auf dem Dach und ${kellerOf(c) ? 'unten im Keller' : 'im Hauswirtschaftsraum'} so ein Batteriespeicher.`;
        default:
          return 'Nein, Solarplatten sehe ich da keine.';
      }
    },
    unknown: NOT_HOUSE,
  },
  {
    id: 'x_haustiere',
    label: 'Haustiere in der Wohnung',
    categories: ['brand', 'th', 'rd', 'ktp', 'abc', 'wasser', 'pol', 'sonstiges', 'vu'],
    patterns: [
      w('haustiere|haustier'),
      p(' tiere (\\w+ ){0,2}(in der wohnung|im haus|in dem haus|drin|drinnen) '),
      p(' (hund|hunde|katze|katzen) (\\w+ ){0,2}(in der wohnung|im haus|in dem haus|drin|drinnen) '),
    ],
    examples: ['Sind Haustiere in der Wohnung?', 'gibt es tiere im haus', 'äh haben die so haustiere', 'Ist ein Hund in der Wohnung?', 'sind noch katzen drin', 'äh sind da tiere drin'],
    applies: (c) => residential(c) && inside(c),
    generate: (c) => {
      const t = scenText(c);
      if (/\bhund/.test(t)) return 'hund';
      if (/katze/.test(t)) return 'katze';
      if (isPassant(c)) return 'unbekannt';
      return c.rng.pick(['keine', 'keine', 'katze', 'hund', 'katzen', 'vogel']);
    },
    answer: (v, c) => {
      const brand = c.category === 'brand';
      switch (str(v)) {
        case 'katze':
          return `Ja, eine Katze.${brand ? ' Die ist bestimmt noch drin!' : ''}`;
        case 'katzen':
          return `Ja, zwei Katzen.${brand ? ' Die sind bestimmt noch drin!' : ''}`;
        case 'hund':
          if (brand) return 'Ja, ein Hund, ich höre ihn bellen!';
          return /bellt/.test(scenText(c)) ? 'Ja, ein Hund, der bellt die ganze Zeit.' : 'Ja, ein Hund, aber der ist lieb.';
        case 'vogel':
          return 'Nur ein Wellensittich.';
        case 'keine':
          return 'Nein, Haustiere gibt es da nicht.';
        default:
          return 'Das weiß ich nicht, ich kenne die Leute nicht.';
      }
    },
    unknown: (c) => {
      const b = bld(c);
      if (b?.kind === 'scheune' || (!b && /scheune|stall/.test(scenText(c))))
        return /stall|vieh|kuehe|kühe|pferde|schweine|rinder/.test(scenText(c)) ? 'Im Stall stehen Tiere, ja!' : 'Ob da Tiere drin sind, weiß ich nicht, da lagert eigentlich nur Heu und Stroh.';
      if (!b) return NOT_HOUSE();
      if (!inside(c)) return NOT_INSIDE();
      return 'Das ist keine Wohnung, Tiere gibt es da nicht.';
    },
  },
  {
    id: 'x_rauchmelder',
    label: 'Rauchmelder / Brandmelder ausgelöst',
    categories: ['brand'],
    patterns: [w('rauchmelder|rauchwarnmelder|brandmelder|heimrauchmelder|brandmeldeanlage|bma|feueralarm|piepen|piept|piepsen|piepst')],
    examples: ['Hat der Rauchmelder ausgelöst?', 'piept da ein rauchmelder', 'Hören Sie einen Feueralarm?', 'äh geht da so ein rauchwarnmelder', 'hat die brandmeldeanlage ausgelöst'],
    applies: (c) => inside(c),
    generate: (c) => {
      const t = factText(c);
      if (/brandmeldeanlage|\bbma\b/.test(t)) return 'bma';
      if (/rauchmelder|piept|melder/.test(t)) return 'ja';
      if (isPassant(c)) return 'unbekannt';
      if (/kein rauch/.test(t)) return 'nein';
      return c.rng.chance(0.7) ? 'ja' : 'nein';
    },
    answer: (v, c) => {
      switch (str(v)) {
        case 'bma':
          return 'Ja, die Brandmeldeanlage hat ausgelöst, die Hupen gehen im ganzen Gebäude.';
        case 'ja':
          return residential(c) ? 'Ja, der Rauchmelder piept die ganze Zeit!' : 'Ja, drinnen geht der Feueralarm, das hört man bis hier.';
        case 'nein':
          return 'Nein, einen Rauchmelder höre ich nicht.';
        default:
          return 'Das kann ich von draußen nicht hören.';
      }
    },
    unknown: (c) => (bld(c) === null ? NOT_HOUSE() : 'Das ist ja draußen, da gibt es keinen Rauchmelder.'),
  },
  {
    id: 'x_zufahrt',
    label: 'Zufahrt für große Fahrzeuge / Parksituation',
    patterns: [
      w('zufahrt|zufahrtsweg|feuerwehrzufahrt|aufstellflaeche|parksituation|zugeparkt|durchfahrt|wendemoeglichkeit|drehleiter'),
      p(' (kommt|kommen) (\\w+ ){0,3}(grosse[nm]? |grosses )?(fahrzeug|fahrzeuge|fahrzeugen|lkw|loeschfahrzeug|loeschfahrzeuge|feuerwehrauto|feuerwehrautos) (\\w+ ){0,2}(ran|hin|durch|dran) '),
      p(' (ist|sind) die strasse (\\w+ )?(eng|schmal|zugeparkt|frei)'),
    ],
    examples: ['Wie ist die Zufahrt?', 'kommen große fahrzeuge da ran', 'Ist die Straße zugeparkt?', 'äh kommt die drehleiter da so ran', 'ist die strasse eng'],
    generate: (c) => {
      const d = low(c.facts._detail);
      if (c.location === 'land') return 'feldweg';
      if (c.location === 'wasser') return 'ufer';
      if (c.location === 'strasse') return 'strasse';
      if (/hinterhaus|ueber den hof|über den hof/.test(d)) return 'hof';
      if (/baustelle/.test(d)) return 'baustelle';
      if (/park\b|stadtpark/.test(d)) return 'park';
      const b = bld(c);
      if (b?.kind === 'klinik') return 'klinik';
      if (b?.kind === 'mfh' || b?.kind === 'hochhaus') return c.rng.pick(['zugeparkt', 'gut', 'eng']);
      if (b && isHouse(b.kind)) return c.rng.pick(['gut', 'eng', 'gut']);
      return c.rng.pick(['gut', 'gut', 'eng']);
    },
    answer: (v) =>
      ({
        hof: 'Das ist ein Hinterhaus, man muss durch die Toreinfahrt in den Hof, die ist ziemlich schmal.',
        feldweg: 'Das geht nur über einen Feldweg, der ist unbefestigt.',
        strasse: 'Das ist direkt an der Straße, da kommen Sie gut ran.',
        ufer: 'Mit dem Auto kommt man bis zum Parkplatz, dann sind es noch ein paar Meter zu Fuß.',
        baustelle: 'Das ist eine Baustelle, der Weg ist matschig, aber breit genug.',
        park: 'Das ist im Park, mit dem Auto kommen Sie nur bis zum Eingang, dann über den Fußweg.',
        klinik: 'Sie können direkt vor den Haupteingang fahren.',
        zugeparkt: 'Die Straße ist ziemlich zugeparkt, auf beiden Seiten stehen Autos.',
        eng: 'Das ist eine enge Straße, mit großen Autos wird das knapp.',
        gut: 'Da kommen Sie gut ran, die Straße ist breit genug.',
      })[str(v)] ?? 'Da kommen Sie gut ran.',
  },
  {
    id: 'x_wer_drin',
    label: 'Wer genau noch im Gebäude ist',
    categories: ['brand'],
    patterns: [
      p(' (wissen sie|weiss man|ist bekannt|koennen sie sagen) (\\w+ )?wer (\\w+ ){0,4}(drin|drinnen|in der wohnung|im haus|eingeschlossen|vermisst)( (ist|sind|wohnt|wohnen|sein koennte))? '),
      p(' wer (wohnt|lebt) (denn |da |dort |genau )*(in der|in dem|in dieser) (wohnung|haus)'),
      p(' um wen (genau )?handelt es sich'),
      p(' wer genau (ist|sind) (das|die person|die personen|die leute) '),
    ],
    examples: ['Wissen Sie, wer noch drin ist?', 'wer wohnt in der wohnung', 'Um wen handelt es sich?', 'äh wissen sie so wer da drinnen ist', 'wer genau ist das'],
    generate: (c) => {
      const t = factText(c);
      const ev = eventText(c);
      const b = bld(c);
      if (c.facts.trapped !== true) {
        if ((!b || !inside(c)) && /schiff|boot|kutter|yacht|fähre|faehre/.test(ev)) return 'niemand_bord';
        if (!b || !inside(c)) return /\bpkw\b|\bauto\b|\blkw\b|fahrzeug|kleinwagen|\bbus\b|elektroauto/.test(ev) ? 'niemand_fzg' : 'niemand_frei';
        if (/rauchmelder|ob es (ueberhaupt|überhaupt) brennt/.test(ev) && residential(c) && !(isResident(c) && isHouse(b.kind))) return 'rm_keiner';
        if (/brandmeldeanlage/.test(ev)) return b.kind === 'klinik' ? 'bma_klinik' : 'bma_firma';
        return 'niemand';
      }
      if (/fahrgaest|fahrgäst|triebwagen|ausflugsschiff/.test(t)) return 'fahrgaeste';
      if (/schiffer|kutter|unter deck|besatzung/.test(t)) return 'schiffer';
      if (/yacht|segel|boot/.test(ev)) return 'segler';
      if (/camping/.test(t)) return 'camper';
      if (/bewohnerin|bettlaegerig|bettlägerig/.test(t) || b?.label === 'Pflegeheim') return 'heimbewohnerin';
      if (/erntehelfer/.test(t)) return 'erntehelfer';
      if (b?.label === 'Gästehaus') return 'gaeste';
      if (/trecker|schuppen|scheune|landwirt/.test(ev)) return 'landwirt';
      if (/kind/.test(t) || /kind/.test(c.scenarioId)) return 'kind';
      if (b?.kind === 'gewerbe' || c.location === 'gewerbe') return 'mitarbeiter';
      if (isPassant(c) || !residential(c)) return 'unbekannt';
      if (isResident(c) && b && isHouse(b.kind)) return c.rng.pick(['mutter', 'ehemann', 'opa']);
      return c.rng.pick(['seniorin', 'senior', 'mann', 'familie']);
    },
    answer: (v, c) => {
      const b = bld(c);
      const own = isResident(c) && b !== null && isHouse(b.kind);
      return (
        ({
          niemand: isPassant(c) ? 'Soweit ich weiß, ist niemand mehr drin.' : 'Soweit ich weiß, ist niemand mehr drin, die sind alle draußen.',
          niemand_frei: 'Da ist niemand in Gefahr, soweit ich sehe.',
          niemand_fzg: 'Im Fahrzeug sitzt keiner mehr, soweit ich sehe.',
          niemand_bord: 'An Bord ist keiner mehr, soweit ich sehe.',
          rm_keiner: 'Ich glaube, da ist keiner zu Hause, es macht niemand auf.',
          bma_klinik: 'In Gefahr ist niemand, soweit ich weiß, das Personal ist dabei.',
          bma_firma: 'Die Mitarbeiter stehen draußen, vermisst wird wohl keiner.',
          fahrgaeste: 'Fahrgäste, ein paar sind noch drin und kommen nicht raus!',
          schiffer: 'Der Schiffer, der ist noch unter Deck!',
          segler: 'Der Segler, der ist noch an Bord!',
          camper: 'Leute vom Campingplatz, die sind da noch zwischen den Zelten!',
          heimbewohnerin: 'Eine Bewohnerin, die ist bettlägerig und kommt allein nicht raus!',
          erntehelfer: 'Ein paar Erntehelfer, die haben da drin geschlafen!',
          gaeste: 'Gäste aus den Zimmern oben, wie viele, weiß ich nicht genau!',
          landwirt: 'Der Bauer, der wollte noch den Trecker rausholen!',
          kind: own ? 'Mein Sohn, er ist sechs, er ist noch drin!' : 'Ein Kind, der kleine Junge, ungefähr sechs Jahre!',
          mitarbeiter: 'Ein Mitarbeiter, der war hinten im Lager, der ist nicht rausgekommen!',
          mutter: 'Meine Mutter, die kann nicht gut laufen, die ist noch drin!',
          ehemann: 'Mein Mann, der wollte noch was holen und ist nicht wieder rausgekommen!',
          opa: 'Mein Opa, der sitzt im Rollstuhl!',
          seniorin: 'Die ältere Dame, die wohnt allein und kann nicht gut laufen!',
          senior: 'Der alte Herr, der sitzt im Rollstuhl!',
          mann: 'Ein Mann, Mitte vierzig, der hat wohl geschlafen!',
          familie: 'Eine Mutter mit ihrem Baby, die sind noch in der Wohnung!',
        } as Record<string, string>)[str(v)] ?? 'Ich weiß nicht, wer, aber ich habe jemanden rufen hören!'
      );
    },
  },
  {
    id: 'x_kinder',
    label: 'Kinder im Haus / Haushalt',
    categories: ['brand', 'th', 'rd', 'abc', 'pol', 'sonstiges'],
    patterns: [
      p(' (wohnen|leben) (da |dort |hier |so |in dem haus |im haus |in der wohnung )*(auch |denn |noch )?(kleine )?kinder '),
      p(' gibt es (\\w+ ){0,2}kinder( (im|in) (haus|der wohnung|dem haus|haushalt))? '),
      p(' (hat|haben) (die familie|die bewohner|die leute|die) (\\w+ )?kinder '),
      w('kinder im haushalt'),
    ],
    examples: ['Wohnen da Kinder?', 'gibt es kinder im haus', 'Haben die Bewohner Kinder?', 'äh leben da so kinder', 'wohnen in dem haus auch kinder'],
    applies: (c) => residential(c),
    generate: (c) => {
      const drin = c.category === 'brand' ? c.get('x_wer_drin') : undefined;
      if (drin === 'kind') return 'ja_drin';
      if (drin === 'familie') return 'baby';
      const t = scenText(c);
      if (/kinder wohnen weit weg|kinder sind (aus dem haus|erwachsen)/.test(t)) return 'erwachsen';
      if (/\bkind|säugling|saeugling|baby|geschwister|kinderzimmer/.test(t) || (typeof c.facts.age === 'number' && c.facts.age < 14)) return 'ja';
      const kind = bld(c)!.kind;
      if (isHouse(kind) && (drin === 'seniorin' || drin === 'senior' || drin === 'opa')) return 'nein';
      if (isPassant(c)) return 'unbekannt';
      return c.rng.chance(isHouse(kind) ? 0.5 : 0.6) ? 'ja' : 'nein';
    },
    answer: (v, c) => {
      switch (str(v)) {
        case 'ja_drin':
          return 'Ja, und ein Kind ist noch drin!';
        case 'baby':
          return 'Ja, ein Baby, das ist noch mit der Mutter drin!';
        case 'erwachsen':
          return 'Die Kinder sind erwachsen und wohnen weit weg.';
        case 'ja': {
          const own = isResident(c) && isHouse(bld(c)!.kind);
          if (c.category === 'brand') {
            if (c.get('x_wer_drin') === 'rm_keiner') return 'Ja, da wohnen Kinder, aber ich glaube, die sind gerade nicht da.';
            if (own) return 'Ja, unsere Kinder, die sind hier bei mir draußen.';
            return c.facts.trapped === true ? 'Ja, im Haus wohnen Kinder, die stehen aber hier draußen bei ihren Eltern.' : 'Ja, im Haus wohnen Kinder, die sind aber alle mit draußen.';
          }
          return own ? 'Ja, wir haben Kinder.' : 'Ja, im Haus wohnen Kinder.';
        }
        case 'nein':
          return 'Nein, Kinder wohnen da keine.';
        default:
          return 'Das weiß ich nicht, ich kenne die Leute nicht.';
      }
    },
    unknown: (c) => (bld(c) === null ? 'Hier ist kein Wohnhaus.' : 'Das ist kein Wohnhaus.'),
  },
  {
    id: 'x_gefahrstoffe',
    label: 'Gefährliche Stoffe im Gebäude',
    categories: ['brand', 'th'],
    patterns: [
      w('gefahrstoffe|gefahrstofflager|gefahrgut'),
      p(' (gefaehrliche|brennbare|explosive|giftige) (stoffe|sachen|dinge|fluessigkeiten|materialien|gueter) '),
      p(' (lagern|gelagert|lagert) (\\w+ ){0,3}(gefaehrlich|brennbar|explosiv|chemisch|chemikalien|giftig)'),
      p(' (was|etwas|irgendwas) gefaehrliches'),
      p(' (chemikalien|gefahrstoffe) (\\w+ ){0,2}gelagert '),
    ],
    examples: ['Gibt es gefährliche Stoffe im Haus?', 'sind da brennbare flüssigkeiten gelagert', 'äh lagern da so gefährliche sachen', 'Gibt es dort Gefahrstoffe?', 'äh gibts da was gefährliches', 'werden da chemikalien gelagert'],
    applies: (c) => bld(c) !== null,
    generate: (c) => {
      const t = factText(c);
      const kind = bld(c)!.kind;
      if (/gasflasche/.test(t)) return 'gasflaschen';
      if (/kunststoff/.test(t)) return 'kunststoff';
      if (/harz|lack|lösungsmittel|loesungsmittel/.test(t)) return 'loesemittel';
      if (/pflanzenschutz|spritzmittel/.test(t)) return 'pflanzenschutz';
      if (/kanister/.test(t)) return 'kanister';
      if (/säure|saeure|lauge/.test(t)) return 'saeure';
      if (/gefahrstoff|chemikalie/.test(t) && !residential(c)) return 'chemie';
      if (isPassant(c)) return 'unbekannt';
      if (c.get('x_gas') === 'flaschen') return 'gasflaschen';
      if (kind === 'gewerbe') return c.rng.pick(['loesemittel', 'gasflaschen', 'nichts', 'saeure']);
      if (kind === 'scheune') return c.rng.pick(['diesel', 'nichts']);
      if (kind === 'klinik') return c.rng.pick(['sauerstoff', 'nichts']);
      if (kind === 'oeffentlich') return 'nichts_oeff';
      return c.rng.pick(['nichts', 'nichts', 'benzin', 'farbe']);
    },
    answer: (v, c) => {
      const b = bld(c)!;
      const lager = isHouse(b.kind) ? 'In der Garage' : kellerOf(c) ? 'Im Keller' : 'Im Abstellraum';
      return (
        ({
          gasflaschen: 'Ja, da stehen Gasflaschen, Propan und Acetylen, glaube ich!',
          kunststoff: 'Da lagern jede Menge Kunststoffe, das qualmt richtig giftig.',
          loesemittel: 'Da stehen Fässer mit Lösungsmitteln und Lacken.',
          pflanzenschutz: 'Da stehen Kanister mit Pflanzenschutzmitteln, das Zeug ist giftig!',
          chemie: 'Ja, das ist ein Betrieb mit Chemikalien, die haben ein Gefahrstofflager.',
          kanister: 'Da ist wohl ein Kanister mit irgendwas Chemischem umgekippt.',
          saeure: 'Da gibt es Säure und Lauge, die Behälter haben so orange Schilder.',
          sauerstoff: 'Hier gibt es Sauerstoffflaschen für die Patienten.',
          diesel: 'Da steht ein Dieseltank für die Trecker.',
          benzin: `${lager} stehen ein paar Benzinkanister für den Rasenmäher.`,
          farbe: `${lager} sind ein paar Farbeimer und Spraydosen, sonst nichts.`,
          nichts: residential(c) ? 'Nein, nichts Besonderes, ganz normaler Haushalt.' : 'Nein, nichts Besonderes, soweit ich weiß.',
          nichts_oeff: 'Nein, nichts Besonderes, soweit ich weiß.',
        } as Record<string, string>)[str(v)] ?? 'Das weiß ich nicht, ich kenne das Gebäude nicht.'
      );
    },
    unknown: NOT_HOUSE,
  },
  {
    id: 'x_strom',
    label: 'Strom / Licht im Gebäude',
    patterns: [
      p(' (ist|gibt es|hat das haus|haben sie|haben die) (noch |denn )?(\\w+ ){0,2}(strom|licht) (im haus|in der wohnung|im gebaeude|an|da|drin|drauf) '),
      p(' brennt (\\w+ ){0,2}(noch )?licht '),
      p(' ist (im haus|in der wohnung|im gebaeude|drinnen|da|dort) (noch )?licht '),
      p(' ist (da |dort |drinnen )?(noch )?licht (an )?(im haus|in der wohnung|im gebaeude|drinnen|in den fenstern) '),
      w('stromausfall|sicherungskasten|hauptschalter|stromzaehler|hauptsicherung'),
      p(' wo (genau )?(ist|sind|befindet sich) (der|die) (sicherungskasten|hauptschalter|stromzaehler|hauptsicherung|sicherungen) '),
    ],
    examples: ['Ist noch Strom im Haus?', 'brennt da noch licht im haus', 'Wo ist der Sicherungskasten?', 'äh gibt es so einen stromausfall', 'ist im haus noch licht an', 'äh ist da noch strom drauf'],
    applies: (c) => bld(c) !== null,
    generate: (c) => {
      const t = scenText(c);
      if (/sicherung ist raus|freigeschaltet|stromausfall|notstrom/.test(t)) return 'aus_fest';
      if (/explosion|einsturz|eingestürzt|eingestuerzt|trümmer|truemmer/.test(t)) return 'unklar';
      if (/strom|steckdose/.test(low(c.facts.hazard))) return 'gefahr';
      if (c.category === 'brand' && inside(c) && c.facts.spreading === true) return c.rng.chance(0.5) ? 'aus' : 'an';
      return 'an';
    },
    answer: (v, c) => {
      const b = bld(c)!;
      switch (str(v)) {
        case 'aus':
          return `Das Licht ist eben ausgegangen, ${b.kind === 'scheune' ? 'drinnen' : `im ganzen ${isHouse(b.kind) || residential(c) ? 'Haus' : 'Gebäude'}`} ist es dunkel.`;
        case 'aus_fest':
          return 'Nein, der Strom ist weg, da ist kein Saft mehr drauf.';
        case 'gefahr':
          return 'Da ist irgendwas mit dem Strom, es knistert und funkt!';
        case 'unklar':
          return 'Keine Ahnung, ob da noch Strom drauf ist, das sieht ganz schlimm aus.';
        default:
          if (residential(c) ? isInsider(c) : isStaff(c))
            return `Ja, Strom ist da, ${residential(c) ? 'der Sicherungskasten' : 'die Hauptverteilung'} ist ${kellerOf(c) ? 'im Keller' : isHouse(b.kind) ? 'im Hauswirtschaftsraum' : residential(c) ? 'im Flur' : 'im Technikraum'}.`;
          if (!residential(c) && isInsider(c)) return 'Ja, hier ist alles normal, das Licht ist an.';
          return b.kind === 'scheune' ? 'Ich glaube schon, drinnen brennt Licht.' : 'Ja, in den Fenstern ist Licht an.';
      }
    },
    unknown: NOT_HOUSE,
  },
];
