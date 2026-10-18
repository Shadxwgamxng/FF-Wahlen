import type { FactValue } from '../../data/questions';
import type { DetailContext, DetailTopic } from './types';
import { p, w, zahl, storeyOf } from './types';

/* ------------------------------------------------------------------ Hilfen */

/** Alle Szenariotexte (klein) – für Hinweise wie "Reetdach", "Gasflaschen", "Küche" */
const factText = (c: DetailContext) =>
  ['what', 'object', 'smoke', 'floor', 'hazard', 'help', 'situation', '_detail']
    .map((k) => String(c.facts[k] ?? ''))
    .join(' ')
    .toLowerCase();

/** Das Ereignis spielt draußen (Hof, Pier …), obwohl am Ort ein Gebäude steht */
const outsideHint = (c: DetailContext) => /draußen|draussen|im hof|im freien|kaimauer|pier|garten|straßenrand/.test(String(c.facts.floor ?? '').toLowerCase());

/** Einsatz in einem Gebäude */
const inside = (c: DetailContext) => c.building !== null && !outsideHint(c);

/** Wohngebäude (Wohnung/Haus mit Bewohnern) */
const residential = (c: DetailContext) => c.building !== null && ['efh', 'rh', 'mfh', 'hochhaus'].includes(c.building.kind);

const isPassant = (c: DetailContext) => /passant/i.test(c.relation);
/** Anrufer gehört zum Haus/zur Familie/zum Betrieb */
const isInsider = (c: DetailContext) => /bewohner|angeh|betroffen|hausmeister|pflege|station|kolleg|betrieb/i.test(c.relation);

const NOT_HOUSE = () => 'Hier ist kein Gebäude, das ist im Freien.';
const NOT_INSIDE = () => 'Das betrifft hier kein Haus, das ist draußen.';

const str = (v: FactValue) => String(v);

/* ------------------------------------------------------------------ Themen */

/** Gebäude, Zugang, Brandumfeld */
export const BUILDING_TOPICS: DetailTopic[] = [
  {
    id: 'x_etagen',
    label: 'Anzahl der Etagen',
    patterns: [
      p(' wie ?viele (etagen|stockwerke|stockwerk|geschosse|obergeschosse|stock) '),
      p(' wie hoch ist (das|der) (haus|gebaeude|block|wohnblock)'),
      p(' (etagen|stockwerke|geschosse) hat '),
    ],
    examples: ['Wie viele Etagen hat das Gebäude?', 'wie viele stockwerke hat das haus', 'Wie hoch ist das Haus?', 'wieviele geschosse hat der block', 'äh wie viele obergeschosse hat das so'],
    applies: (c) => c.building !== null,
    generate: (c) => c.rng.int(c.building!.minFloors, c.building!.maxFloors),
    answer: (v, c) => {
      const n = Number(v);
      if (n <= 1) return `Das ist ein flaches ${c.building!.kind === 'efh' ? 'Haus, nur Erdgeschoss' : 'Gebäude, nur Erdgeschoss'}.`;
      return `Das Haus hat ${zahl(n)} Etagen, also Erdgeschoss und ${zahl(n - 1)} ${n - 1 === 1 ? 'Obergeschoss' : 'Obergeschosse'}.`;
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
      w('gebaeudeart|gebaeudetyp|haustyp|bauweise|baujahr'),
      p(' wie alt ist (das|der) (haus|gebaeude|block|bau)'),
    ],
    examples: ['Was für ein Haus ist das?', 'ist das ein einfamilienhaus oder ein mehrfamilienhaus', 'Wie alt ist das Gebäude ungefähr?', 'äh altbau oder neubau', 'was ist das denn für ein gebäude'],
    applies: (c) => c.building !== null,
    generate: (c) => {
      const t = factText(c);
      if (/reet|friesen|kate/.test(t)) return 'reet';
      return c.rng.pick(['alt', 'nachkrieg', 'siebziger', 'neu']);
    },
    answer: (v, c) => {
      const label = c.building!.label;
      switch (str(v)) {
        case 'reet':
          return 'Ein altes Friesenhaus mit Reetdach, bestimmt über hundert Jahre alt.';
        case 'alt':
          return `Ein ${label}, ziemlich alter Bau, Altbau mit Holzdecken, glaube ich.`;
        case 'nachkrieg':
          return `Ein ${label}, so aus den Fünfzigern, Klinkerbau.`;
        case 'siebziger':
          return `Ein ${label}, ich schätze aus den Siebzigern.`;
        default:
          return `Ein ${label}, noch ziemlich neu.`;
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
    ],
    examples: ['Was für ein Dach hat das Haus?', 'ist das ein reetdach', 'Hat das Gebäude ein Flachdach?', 'äh womit ist das dach gedeckt', 'wie sieht das dach so aus'],
    applies: (c) => c.building !== null,
    generate: (c) => {
      const t = factText(c);
      if (/reet/.test(t)) return 'reet';
      const kind = c.building!.kind;
      if (kind === 'hochhaus' || kind === 'klinik') return 'flach';
      if (kind === 'gewerbe') return c.rng.chance(0.7) ? 'flach' : 'blech';
      if (/dachstuhl/.test(t)) return c.rng.chance(0.85) ? 'ziegel' : 'reet';
      if (kind === 'efh' && c.rng.chance(0.1)) return 'reet';
      if (kind === 'mfh' && c.rng.chance(0.25)) return 'flach';
      return 'ziegel';
    },
    answer: (v) =>
      ({
        reet: 'Das ist ein Reetdach, also Stroh, das brennt wie Zunder!',
        flach: 'Ein Flachdach.',
        blech: 'Ein flaches Blechdach, so Trapezblech.',
        ziegel: 'Ein ganz normales Spitzdach mit Ziegeln.',
      })[str(v)] ?? 'Ein ganz normales Dach.',
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
    applies: (c) => c.building !== null,
    generate: (c) => {
      const kind = c.building!.kind;
      if (kind === 'hochhaus' || kind === 'klinik') return true;
      if (kind === 'efh' || kind === 'rh') return false;
      const floors = Number(c.get('x_etagen') ?? c.building!.minFloors);
      if (floors <= 2) return false;
      if (kind === 'mfh') return floors >= 5 ? c.rng.chance(0.7) : c.rng.chance(0.15);
      return c.rng.chance(0.5);
    },
    answer: (v, c) =>
      v === true
        ? c.building!.kind === 'klinik'
          ? 'Ja, es gibt einen Bettenaufzug.'
          : 'Ja, es gibt einen Aufzug.'
        : c.building!.kind === 'efh' || c.building!.kind === 'rh'
          ? 'Nein, das ist ein normales Wohnhaus, da gibt es keinen Aufzug.'
          : 'Nein, einen Aufzug gibt es nicht, nur das Treppenhaus.',
    unknown: NOT_HOUSE,
  },
  {
    id: 'x_keller',
    label: 'Keller vorhanden',
    patterns: [
      p(' (gibt es|gibts|hat das haus|hat das gebaeude|hat es|hat der block|ist da) (\\w+ ){0,2}(einen |ein )?(keller|kellergeschoss|untergeschoss) '),
      w('unterkellert'),
    ],
    examples: ['Hat das Haus einen Keller?', 'ist das gebäude unterkellert', 'gibt es da einen keller', 'äh hat das haus so einen keller'],
    applies: (c) => c.building !== null,
    generate: (c) => {
      if (storeyOf(c.facts.floor) === -1 || /keller/.test(factText(c))) return true;
      const kind = c.building!.kind;
      if (kind === 'mfh' || kind === 'hochhaus' || kind === 'klinik') return c.rng.chance(0.9);
      if (kind === 'gewerbe') return c.rng.chance(0.3);
      return c.rng.chance(0.65);
    },
    answer: (v) => (v === true ? 'Ja, das Haus hat einen Keller.' : 'Nein, keinen Keller, das ist auf einer Bodenplatte gebaut.'),
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
      const t = factText(c);
      if (/treppenhaus|flur/.test(String(c.facts.smoke ?? '').toLowerCase()) && !/kein rauch/.test(t)) return 'verraucht';
      if (storeyOf(c.facts.floor) === -1 && c.facts.spreading === true) return 'verraucht';
      if (/kein rauch|nicht, ob es (ueberhaupt|überhaupt) brennt/.test(t)) return 'frei';
      if (c.facts.spreading === true) return c.rng.chance(0.6) ? 'verraucht' : 'leicht';
      return c.rng.chance(0.7) ? 'frei' : 'leicht';
    },
    answer: (v, c) => {
      const efh = c.building!.kind === 'efh' || c.building!.kind === 'rh';
      if (str(v) === 'verraucht') return efh ? 'Die Treppe im Haus ist voller Rauch, da kommt keiner mehr runter!' : 'Das Treppenhaus ist komplett verraucht, da sieht man die Hand vor Augen nicht!';
      if (str(v) === 'leicht') return 'Es zieht schon etwas Rauch rein, aber man kommt noch durch.';
      return efh ? 'Die Treppe ist frei, da ist kein Rauch.' : 'Das Treppenhaus ist frei, da ist kein Rauch.';
    },
    unknown: (c) => (isPassant(c) && inside(c) ? 'Das kann ich von draußen nicht sehen, ich bin nur vorbeigekommen.' : NOT_INSIDE()),
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
    applies: (c) => c.building !== null,
    generate: (c) => {
      if (isInsider(c)) return 'insider';
      if (c.building!.kind === 'gewerbe' || c.building!.kind === 'klinik' || c.building!.kind === 'oeffentlich') return c.rng.chance(0.7) ? 'offen' : 'zu';
      if (isPassant(c)) return 'zu';
      return c.rng.pick(['offen', 'zu', 'zu', 'nachbar']);
    },
    answer: (v, c) => {
      switch (str(v)) {
        case 'insider':
          return 'Ich gehe runter und mache Ihnen die Tür auf, wenn Sie da sind.';
        case 'offen':
          return 'Die Haustür steht offen, da kommen Sie rein.';
        case 'nachbar':
          return 'Die Haustür ist zu, aber ich habe einen Türöffner, ich drücke auf, wenn Sie klingeln.';
        default:
          return isPassant(c) ? 'Die Haustür ist zu, ich komme da auch nicht rein.' : 'Die Haustür ist zu, da müssen Sie klingeln.';
      }
    },
    unknown: NOT_HOUSE,
  },
  {
    id: 'x_schluessel',
    label: 'Schlüssel vorhanden',
    patterns: [w('schluessel|ersatzschluessel|zweitschluessel|hausschluessel|wohnungsschluessel|generalschluessel')],
    examples: ['Haben Sie einen Schlüssel?', 'hat jemand einen ersatzschlüssel', 'äh haben sie so einen schlüssel für die wohnung', 'Gibt es einen Zweitschlüssel?'],
    applies: (c) => c.building !== null,
    generate: (c) => {
      if (/bewohner|angeh|hausmeister|pflege|station|betrieb/i.test(c.relation)) return 'ja';
      if (isPassant(c)) return 'nein';
      return c.rng.pick(['nein', 'nein', 'nachbar', 'ja']);
    },
    answer: (v, c) => {
      switch (str(v)) {
        case 'ja':
          return /hausmeister|betrieb/i.test(c.relation) ? 'Ja, ich habe den Generalschlüssel dabei.' : 'Ja, ich habe einen Schlüssel.';
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
      p(' (welcher|was fuer ein) name (steht|ist) (\\w+ ){0,4}(tuer|wohnung|klingel)'),
      p(' wie heissen die (bewohner|leute|nachbarn|mieter)'),
    ],
    examples: ['Welcher Name steht an der Klingel?', 'was steht auf dem klingelschild', 'Wie heißen die Bewohner?', 'äh welcher name steht da so an der tür'],
    applies: (c) => c.building !== null,
    generate: (c) => {
      const m = /klingel\s*["„“]?([A-ZÄÖÜ][a-zäöüß]+)/i.exec(String(c.facts._detail ?? ''));
      if (m) return m[1];
      if (isPassant(c)) return '';
      if (c.building!.kind === 'gewerbe') return 'firma';
      return c.rng.pick(['Petersen', 'Hansen', 'Jensen', 'Schröder', 'Brandt', 'Lorenzen', 'Thomsen', 'Wulf', 'Carstensen', 'Möller']);
    },
    answer: (v, c) => {
      const s = str(v);
      if (!s) return 'Das kann ich von hier nicht lesen, ich bin nur Passant.';
      if (s === 'firma') return 'Da steht nur der Firmenname dran, Eingang ist vorne beim Schild.';
      if (/bewohner|betroffen/i.test(c.relation)) return `An der Klingel steht ${s}, das sind wir.`;
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
      if (c.building!.kind === 'efh' || c.building!.kind === 'rh') return 'einzig';
      const t = `${String(c.facts.floor ?? '')} ${String(c.facts._detail ?? '')}`.toLowerCase();
      if (/links/.test(t)) return 'links';
      if (/rechts/.test(t)) return 'rechts';
      if (/mitte/.test(t)) return 'mitte';
      return c.rng.pick(['links', 'rechts', 'links', 'rechts', 'mitte']);
    },
    answer: (v) => {
      switch (str(v)) {
        case 'einzig':
          return 'Das ist ein Haus für eine Familie, da gibt es nur die eine Wohnung.';
        case 'mitte':
          return 'Die mittlere Wohnung, direkt gegenüber der Treppe.';
        default:
          return `Vom Treppenhaus aus ${str(v)}.`;
      }
    },
    unknown: (c) => (c.building === null ? NOT_HOUSE() : 'Das ist keine Wohnung, das ist ein Betrieb.'),
  },
  {
    id: 'x_brandursache',
    label: 'Wie das Feuer entstanden ist',
    categories: ['brand'],
    patterns: [
      w('brandursache|ursache'),
      p(' wie (ist|kam) (es|das|der brand|das feuer) (\\w+ ){0,2}(entstanden|ausgebrochen|zustande|dazu)'),
      p(' (wodurch|wie|womit) hat (es|das|das feuer|der brand) (\\w+ )?angefangen'),
      p(' was hat (den brand|das feuer) (ausgeloest|verursacht)'),
      p(' (wissen sie|weiss man) (\\w+ )?(wie|wodurch|warum) (es|das feuer|der brand) (\\w+ ){0,2}(angefangen|entstanden|ausgebrochen)'),
    ],
    examples: ['Wie ist das Feuer entstanden?', 'wissen sie wie es angefangen hat', 'Was hat den Brand ausgelöst?', 'äh kennen sie die ursache', 'wodurch hat es so angefangen'],
    generate: (c) => {
      const t = factText(c);
      if (/herd|pfanne|fett|küche|kueche/.test(t)) return 'herd';
      if (/schornstein|kamin|holzofen/.test(t)) return 'ofen';
      if (/blitz|reet/.test(t)) return c.rng.chance(0.5) ? 'blitz' : 'funken';
      if (/elektroauto|akku|batterie/.test(t)) return 'akku';
      if (/brandmeldeanlage|rauchmelder|piept|melder/.test(t)) return 'unklar';
      if (/feld|wald|böschung|boeschung|heide|moor|unterholz|getreide/.test(t)) return c.rng.pick(['zigarette', 'maschine', 'unklar']);
      if (/pkw|auto|lkw|motor|reifen|kombi|kleinwagen|sattelzug/.test(t)) return 'technik';
      if (/müll|muell|tonne|container/.test(t)) return c.rng.pick(['zigarette', 'unklar', 'asche']);
      if (isPassant(c)) return 'unklar';
      return c.rng.pick(['kerze', 'elektro', 'unklar', 'unklar', 'zigarette']);
    },
    answer: (v, c) =>
      ({
        herd: 'Da war wohl Essen auf dem Herd, das Fett hat Feuer gefangen.',
        ofen: 'Wir haben den Holzofen angeheizt, und dann fing es im Schornstein an zu knistern.',
        blitz: 'Ich glaube, da hat vorhin der Blitz eingeschlagen.',
        funken: 'Keine Ahnung, vielleicht Funkenflug, das Reet ist ja knochentrocken.',
        akku: 'Ich glaube, das kam von der Batterie, es hat erst gezischt und dann gebrannt.',
        technik: 'Ich weiß nicht, ich glaube, das kam aus dem Motorraum.',
        zigarette: 'Keine Ahnung, vielleicht hat jemand eine Zigarette weggeworfen.',
        maschine: 'Da war vorhin ein Mähdrescher unterwegs, vielleicht kam es davon.',
        asche: 'Vielleicht hat jemand heiße Asche in die Tonne gekippt.',
        kerze: 'Ich glaube, da war eine Kerze an.',
        elektro: 'Es hat erst nach verschmortem Kabel gerochen, vielleicht was Elektrisches.',
      })[str(v)] ?? (isPassant(c) ? 'Das weiß ich nicht, ich habe nur den Rauch gesehen.' : 'Das weiß ich nicht, auf einmal hat es gebrannt.'),
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
      const t = factText(c);
      if (/keiner macht auf|macht keiner auf/.test(t)) return 'zu_fremd';
      if (/bewohner|betroffen|angeh/i.test(c.relation) && c.facts.trapped !== true) return 'zu_ich';
      if (isPassant(c)) return 'unbekannt';
      if (c.facts.trapped === true) return 'zu_fremd';
      return c.rng.chance(0.6) ? 'zu_fremd' : 'offen';
    },
    answer: (v) =>
      ({
        zu_ich: 'Ich habe die Tür hinter mir zugezogen, als ich raus bin.',
        zu_fremd: 'Die Wohnungstür ist zu, da macht keiner auf.',
        offen: 'Die Wohnungstür steht offen, da kommt der Rauch raus.',
      })[str(v)] ?? 'Das weiß ich nicht, ich war nicht im Haus.',
    unknown: (c) => (c.building === null ? NOT_HOUSE() : 'Das ist keine Wohnung, da gibt es nur die Eingangstür.'),
  },
  {
    id: 'x_gas',
    label: 'Gasanschluss / Gasflaschen',
    patterns: [
      w('gasanschluss|gasleitung|gasleitungen|gasheizung|gasherd|gasflasche|gasflaschen|gastherme|gasversorgung|propangas|propan|gaskartusche|gaskartuschen|gaszaehler|gastank|fluessiggas'),
    ],
    examples: ['Gibt es einen Gasanschluss im Haus?', 'sind da gasflaschen drin', 'Hat das Haus eine Gasheizung?', 'äh lagern da irgendwo propangas flaschen', 'gibt es so eine gasleitung'],
    applies: (c) => c.building !== null,
    generate: (c) => {
      const t = factText(c);
      if (/gasflasche|propan/.test(t)) return 'flaschen';
      if (/gas/.test(String(c.facts.hazard ?? '').toLowerCase())) return 'leitung';
      if (isPassant(c)) return 'unbekannt';
      const kind = c.building!.kind;
      if (kind === 'gewerbe') return c.rng.pick(['flaschen', 'leitung', 'keins']);
      if (kind === 'efh' || kind === 'rh') return c.rng.pick(['leitung', 'keins', 'keins', 'tank', 'grill']);
      return c.rng.pick(['leitung', 'leitung', 'keins']);
    },
    answer: (v) =>
      ({
        flaschen: 'Ja, da stehen Gasflaschen drin, das weiß ich!',
        leitung: 'Ja, das Haus hat Gas, eine Gasheizung.',
        tank: 'Im Garten steht ein Flüssiggastank für die Heizung.',
        grill: 'Gasanschluss nicht, aber auf der Terrasse steht ein Gasgrill mit Flasche.',
        keins: 'Nein, Gas gibt es da nicht, das läuft alles mit Strom und Fernwärme.',
      })[str(v)] ?? 'Das weiß ich nicht, ich wohne da nicht.',
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
    applies: (c) => c.building !== null,
    generate: (c) => {
      const kind = c.building!.kind;
      const dach = c.get('x_dach');
      if (dach === 'reet') return 'nein';
      if (kind === 'efh' || kind === 'rh') return c.rng.chance(0.4) ? (c.rng.chance(0.4) ? 'speicher' : 'ja') : 'nein';
      if (kind === 'gewerbe') return c.rng.chance(0.5) ? 'ja' : 'nein';
      if (kind === 'mfh') return c.rng.chance(0.15) ? 'ja' : 'nein';
      return c.rng.chance(0.1) ? 'ja' : 'nein';
    },
    answer: (v, c) =>
      ({
        ja: c.building!.kind === 'gewerbe' ? 'Ja, das ganze Hallendach ist voller Solarplatten.' : 'Ja, auf dem Dach sind Solarplatten.',
        speicher: 'Ja, Solar auf dem Dach und unten im Keller so ein Batteriespeicher.',
        nein: 'Nein, Solarplatten sehe ich da keine.',
      })[str(v)] ?? 'Das kann ich nicht sehen.',
    unknown: NOT_HOUSE,
  },
  {
    id: 'x_haustiere',
    label: 'Haustiere in der Wohnung',
    categories: ['brand', 'th', 'rd', 'ktp', 'abc', 'wasser', 'pol', 'sonstiges', 'vu'],
    patterns: [
      w('haustiere|haustier|tiere'),
      p(' (hund|hunde|katze|katzen) (\\w+ ){0,2}(in der wohnung|im haus|in dem haus|drin|drinnen) '),
    ],
    examples: ['Sind Haustiere in der Wohnung?', 'gibt es tiere im haus', 'äh haben die so haustiere', 'Ist ein Hund in der Wohnung?', 'sind noch katzen drin'],
    applies: (c) => residential(c) && inside(c),
    generate: (c) => {
      if (isPassant(c)) return 'unbekannt';
      return c.rng.pick(['keine', 'keine', 'katze', 'hund', 'katzen', 'vogel']);
    },
    answer: (v, c) => {
      const s = str(v);
      const drin = c.category === 'brand' ? ' Die ist bestimmt noch drin!' : '';
      switch (s) {
        case 'katze':
          return `Ja, eine Katze.${drin}`;
        case 'katzen':
          return `Ja, zwei Katzen.${c.category === 'brand' ? ' Die sind bestimmt noch drin!' : ''}`;
        case 'hund':
          return c.category === 'brand' ? 'Ja, ein Hund, ich höre ihn bellen!' : 'Ja, ein Hund, aber der ist lieb.';
        case 'vogel':
          return 'Nur einen Wellensittich.';
        case 'keine':
          return 'Nein, Haustiere gibt es da nicht.';
        default:
          return 'Das weiß ich nicht, ich kenne die Leute nicht.';
      }
    },
    unknown: (c) => (c.building === null ? NOT_HOUSE() : 'Das ist keine Wohnung, Tiere gibt es da nicht.'),
  },
  {
    id: 'x_rauchmelder',
    label: 'Rauchmelder / Brandmelder ausgelöst',
    categories: ['brand'],
    patterns: [w('rauchmelder|rauchwarnmelder|brandmelder|heimrauchmelder|feueralarm|piepen|piept|piepsen|piepst')],
    examples: ['Hat der Rauchmelder ausgelöst?', 'piept da ein rauchmelder', 'Hören Sie einen Feueralarm?', 'äh geht da so ein rauchwarnmelder'],
    applies: (c) => inside(c),
    generate: (c) => {
      const t = factText(c);
      if (/brandmeldeanlage|bma/.test(t)) return 'bma';
      if (/rauchmelder|piept/.test(t)) return 'ja';
      if (isPassant(c)) return 'unbekannt';
      if (/kein rauch/.test(t)) return 'nein';
      return c.rng.chance(0.7) ? 'ja' : 'nein';
    },
    answer: (v) =>
      ({
        bma: 'Ja, die Brandmeldeanlage hat ausgelöst, die Hupen gehen im ganzen Gebäude.',
        ja: 'Ja, der Rauchmelder piept die ganze Zeit!',
        nein: 'Nein, einen Rauchmelder höre ich nicht.',
      })[str(v)] ?? 'Das kann ich von draußen nicht hören.',
    unknown: (c) => (c.building === null ? NOT_HOUSE() : 'Das ist ja draußen, da gibt es keinen Rauchmelder.'),
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
      const d = String(c.facts._detail ?? '').toLowerCase();
      if (/hinterhaus|hof/.test(d)) return 'hof';
      if (c.location === 'land') return 'feldweg';
      if (c.location === 'strasse') return 'strasse';
      if (c.location === 'wasser') return 'ufer';
      if (c.building?.kind === 'mfh' || c.building?.kind === 'hochhaus') return c.rng.pick(['zugeparkt', 'gut', 'eng']);
      if (c.building?.kind === 'efh' || c.building?.kind === 'rh') return c.rng.pick(['gut', 'eng', 'gut']);
      return c.rng.pick(['gut', 'gut', 'eng']);
    },
    answer: (v) =>
      ({
        hof: 'Das ist ein Hinterhaus, man muss durch die Toreinfahrt in den Hof, die ist ziemlich schmal.',
        feldweg: 'Das geht nur über einen Feldweg, der ist unbefestigt.',
        strasse: 'Das ist direkt an der Straße, da kommen Sie gut ran.',
        ufer: 'Mit dem Auto kommt man bis zum Parkplatz, dann sind es noch ein paar Meter zu Fuß.',
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
      if (c.facts.trapped !== true) return 'niemand';
      if (/kind/.test(t) || /kind/.test(c.scenarioId)) return 'kind';
      if (/schiffer|besatzung|unter deck/.test(t)) return 'schiffer';
      if (c.building?.kind === 'gewerbe' || c.location === 'gewerbe') return 'mitarbeiter';
      if (isPassant(c)) return 'unbekannt';
      return c.rng.pick(['seniorin', 'senior', 'mann', 'familie']);
    },
    answer: (v) =>
      ({
        niemand: 'Soweit ich weiß, ist niemand mehr drin, die sind alle draußen.',
        kind: 'Ein Kind, der kleine Junge, ungefähr sechs Jahre!',
        schiffer: 'Der Schiffer, der ist noch unter Deck!',
        mitarbeiter: 'Ein Mitarbeiter, der war hinten im Lager, der ist nicht rausgekommen!',
        seniorin: 'Die ältere Dame, die wohnt allein und kann nicht gut laufen!',
        senior: 'Der alte Herr, der sitzt im Rollstuhl!',
        mann: 'Ein Mann, Mitte vierzig, der hat wohl geschlafen!',
        familie: 'Eine Mutter mit ihrem Baby, die sind noch in der Wohnung!',
      })[str(v)] ?? 'Ich weiß nicht, wer, aber ich habe jemanden rufen hören!',
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
      if (isPassant(c)) return 'unbekannt';
      const kind = c.building!.kind;
      return c.rng.chance(kind === 'efh' || kind === 'rh' ? 0.5 : 0.6) ? 'ja' : 'nein';
    },
    answer: (v, c) => {
      switch (str(v)) {
        case 'ja_drin':
          return 'Ja, und ein Kind ist noch drin!';
        case 'baby':
          return 'Ja, ein Baby, das ist noch mit der Mutter drin!';
        case 'ja':
          if (c.category === 'brand') return c.facts.trapped === true ? 'Ja, im Haus wohnen Kinder, die stehen aber hier draußen bei ihren Eltern.' : 'Ja, im Haus wohnen Kinder, die sind aber alle mit draußen.';
          return 'Ja, im Haus wohnen Kinder.';
        case 'nein':
          return 'Nein, Kinder wohnen da keine.';
        default:
          return 'Das weiß ich nicht, ich kenne die Leute nicht.';
      }
    },
    unknown: (c) => (c.building === null ? 'Hier ist kein Wohnhaus.' : 'Das ist kein Wohnhaus.'),
  },
  {
    id: 'x_gefahrstoffe',
    label: 'Gefährliche Stoffe im Gebäude',
    categories: ['brand', 'th'],
    patterns: [
      w('gefahrstoffe|gefahrstofflager|gefahrgut'),
      p(' (gefaehrliche|brennbare|explosive|giftige) (stoffe|sachen|dinge|fluessigkeiten|materialien|gueter) '),
      p(' (lagern|gelagert|lagert) (\\w+ ){0,3}(gefaehrlich|brennbar|explosiv|chemisch|giftig)'),
    ],
    examples: ['Gibt es gefährliche Stoffe im Haus?', 'sind da brennbare flüssigkeiten gelagert', 'äh lagern da so gefährliche sachen', 'Gibt es dort Gefahrstoffe?'],
    applies: (c) => c.building !== null,
    generate: (c) => {
      const t = factText(c);
      if (/gasflasche/.test(t)) return 'gasflaschen';
      if (/kunststoff/.test(t)) return 'kunststoff';
      if (isPassant(c)) return 'unbekannt';
      if (c.get('x_gas') === 'flaschen') return 'gasflaschen';
      const kind = c.building!.kind;
      if (kind === 'gewerbe') return c.rng.pick(['loesemittel', 'gasflaschen', 'nichts', 'saeure']);
      if (kind === 'klinik') return c.rng.pick(['sauerstoff', 'nichts']);
      return c.rng.pick(['nichts', 'nichts', 'benzin', 'farbe']);
    },
    answer: (v) =>
      ({
        gasflaschen: 'Ja, da stehen Gasflaschen, Propan und Acetylen, glaube ich!',
        kunststoff: 'Da lagern jede Menge Kunststoffe, das qualmt richtig giftig.',
        loesemittel: 'In der Halle stehen Fässer mit Lösungsmitteln und Lacken.',
        saeure: 'Im Lager stehen Kanister mit Säure, die haben so orange Schilder.',
        sauerstoff: 'Hier gibt es Sauerstoffflaschen für die Patienten.',
        benzin: 'In der Garage stehen ein paar Benzinkanister für den Rasenmäher.',
        farbe: 'Im Keller sind ein paar Farbeimer und Spraydosen, sonst nichts.',
        nichts: 'Nein, nichts Besonderes, ganz normaler Haushalt.',
      })[str(v)] ?? 'Das weiß ich nicht, ich kenne das Gebäude nicht.',
    unknown: NOT_HOUSE,
  },
  {
    id: 'x_strom',
    label: 'Strom / Licht im Gebäude',
    patterns: [
      p(' (ist|gibt es|hat das haus|haben sie|haben die) (noch |denn )?(\\w+ ){0,2}(strom|licht) (im haus|in der wohnung|im gebaeude|an|da|drin) '),
      p(' (brennt|ist) (\\w+ ){0,2}(noch )?licht (an |im |in |da )'),
      w('stromausfall|sicherungskasten|hauptschalter|stromzaehler|hauptsicherung'),
      p(' wo (genau )?(ist|sind|befindet sich) (der|die) (sicherungskasten|hauptschalter|stromzaehler|hauptsicherung|sicherungen) '),
    ],
    examples: ['Ist noch Strom im Haus?', 'brennt da noch licht im haus', 'Wo ist der Sicherungskasten?', 'äh gibt es so einen stromausfall', 'ist im haus noch licht an'],
    applies: (c) => c.building !== null,
    generate: (c) => {
      if (c.category === 'brand' && inside(c) && c.facts.spreading === true) return c.rng.chance(0.5) ? 'aus' : 'an';
      if (/strom/.test(String(c.facts.hazard ?? '').toLowerCase())) return 'gefahr';
      return 'an';
    },
    answer: (v, c) =>
      ({
        aus: 'Das Licht ist eben ausgegangen, im ganzen Haus ist es dunkel.',
        gefahr: 'Da ist irgendwas mit dem Strom, es knistert und funkt!',
        an: isInsider(c) ? 'Ja, Strom ist da, der Sicherungskasten ist im Keller.' : 'Ja, in den Fenstern ist Licht an.',
      })[str(v)] ?? 'Ja, Strom ist da.',
    unknown: NOT_HOUSE,
  },
];
