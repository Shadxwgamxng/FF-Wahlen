import type { FactValue } from '../../data/questions';
import type { DetailContext, DetailTopic } from './types';
import { p, w, zahl } from './types';

/* ------------------------------------------------------------------ Hilfen */

const str = (v: FactValue) => String(v);
const low = (v: FactValue | undefined) => String(v ?? '').toLowerCase();

/** Alle Szenariotexte (klein) */
const factText = (c: DetailContext) =>
  ['what', 'vehicles', 'leak', 'road', 'help', 'hazard', 'substance', 'amount', 'cloud', 'water', '_detail'].map((k) => low(c.facts[k])).join(' ');

const vehiclesText = (c: DetailContext) => `${low(c.facts.vehicles)} ${low(c.facts.what)}`;
const injuredCount = (c: DetailContext) => (typeof c.facts.injured === 'number' ? c.facts.injured : 0);
const isPassant = (c: DetailContext) => /passant|spaziergaenger|spaziergänger/i.test(c.relation);
/** Nur Zweirad (Motorrad/Fahrrad) ohne PKW/LKW/Bus */
const onlyTwoWheel = (c: DetailContext) => /motorrad|fahrrad|roller/.test(vehiclesText(c)) && !/pkw|lkw|bus|transporter|wagen|auto/.test(low(c.facts.vehicles));
const hasCar = (c: DetailContext) => /pkw|kleinwagen|auto|transporter|wohnmobil|kleinbus/.test(low(c.facts.vehicles));
const isBus = (c: DetailContext) => /bus/.test(low(c.facts.vehicles)) && !/kleinbus/.test(low(c.facts.vehicles));
const isAutobahn = (c: DetailContext) => /autobahn|a1|a7|a21|a23|a24|a210|a215/.test(`${low(c.facts.road)} ${low(c.facts.what)}`);
const isGefahrgut = (c: DetailContext) => /gefahrgut|tankwagen|tank-lkw|fass|fässer|düngemittel|warntafel/.test(`${low(c.facts.what)} ${low(c.facts.vehicles)}`);
const isIndoor = (c: DetailContext) => c.location === 'wohn' || /kohlenmonoxid|co-melder|co-warnmelder|gastherme/.test(factText(c));
/** Genau ein Fahrzeug beteiligt ("Ein PKW, überschlagen.") */
const singleVehicle = (c: DetailContext) => {
  const v = low(c.facts.vehicles);
  return /^(ein|eine|einen) /.test(v) && !/ und |zwei|drei|vier|fünf|mehrere/.test(v);
};
const isEis = (c: DetailContext) => /eis(einbruch|fläche|decke)|ins eis|eingebrochen/.test(low(c.facts.what));
const isKenterung = (c: DetailContext) => /kenter|gekentert|segler/.test(`${low(c.facts.what)} ${low(c.facts.water)}`);
/** Boot, das selbst in Not ist (nicht gekentert) */
const isBootInNot = (c: DetailContext) => /boot/.test(`${low(c.facts.what)} ${low(c.facts.water)}`) && !isKenterung(c);

/* ------------------------------------------------------------------ Themen */

/** Verkehrsunfall, Technische Hilfe, Gefahrstoffe, Wasser */
export const TRAFFIC_TOPICS: DetailTopic[] = [
  /* ---------------------------------------------------------- VU */
  {
    id: 'x_fahrbahn',
    label: 'Fahrbahn blockiert / befahrbar',
    categories: ['vu'],
    patterns: [
      p(' (fahrbahn|fahrbahnen|spur|spuren|fahrspur|fahrspuren|fahrstreifen) (\\w+ ){0,3}(blockiert|gesperrt|dicht|frei|befahrbar|versperrt|zu) '),
      p(' (blockiert|blockieren|versperrt|versperren) (\\w+ ){0,3}(die )?(fahrbahn|strasse|spur|spuren|fahrspur|kreuzung) '),
      p(' (kommt|kommen) (man|die autos|der verkehr|andere autos|andere) (\\w+ ){0,2}(noch )?(vorbei|durch) '),
      p(' (ist|sind) (die )?(strasse|kreuzung) (\\w+ ){0,2}(blockiert|gesperrt|dicht|versperrt|befahrbar) '),
    ],
    examples: ['Ist die Fahrbahn blockiert?', 'kommen die autos noch vorbei', 'äh sind alle spuren dicht', 'ist die strasse komplett blockiert', 'blockieren die fahrzeuge die fahrbahn'],
    generate: (c) => {
      const t = factText(c);
      if (/alle(n)? spuren|trümmerteile auf allen/.test(t)) return 'komplett';
      if (/graben/.test(t) && !/pkw/.test(low(c.facts.vehicles))) return 'rand';
      if (/lkw|sattelzug|bus|frontal|überschlagen|auf der seite/.test(vehiclesText(c))) return 'komplett';
      if (onlyTwoWheel(c) || /fahrrad/.test(vehiclesText(c))) return c.rng.pick(['halb', 'halb', 'komplett']);
      if (/stauende|vier pkw|drei pkw/.test(t)) return 'komplett';
      return c.rng.pick(['halb', 'komplett', 'halb']);
    },
    answer: (v, c) =>
      ({
        komplett: isAutobahn(c) ? 'Die Fahrbahn ist komplett dicht, da kommt keiner mehr vorbei.' : 'Die Straße ist komplett blockiert, da kommt keiner durch.',
        halb: 'Eine Spur ist frei, die Autos fahren langsam vorbei.',
        rand: 'Die Fahrbahn selbst ist frei, das Fahrzeug liegt neben der Straße.',
      })[str(v)] ?? 'Die Straße ist teilweise blockiert.',
  },
  {
    id: 'x_stau',
    label: 'Stau / Verkehrslage',
    categories: ['vu'],
    patterns: [w('stau|staus|staut|rueckstau|verkehrslage|stockt|stauende'), p(' (viel|starker|dichter|stockender) verkehr '), p(' (staut|stauen) sich '), p(' wie (ist|sieht) (es )?(mit )?(dem|der) verkehr ')],
    examples: ['Gibt es schon Stau?', 'staut sich der verkehr', 'äh ist da viel verkehr', 'wie ist die verkehrslage', 'gibt es da so einen rückstau'],
    generate: (c) => {
      if (/stauende/.test(low(c.facts.what))) return 'lang';
      const block = c.get('x_fahrbahn');
      if (isAutobahn(c)) return block === 'komplett' ? 'lang' : c.rng.pick(['lang', 'zaeh']);
      if (/bundesstra|küste|ausflug/.test(low(c.facts.road))) return block === 'komplett' ? 'lang' : 'zaeh';
      if (block === 'komplett') return c.rng.pick(['kurz', 'lang']);
      return c.rng.pick(['kein', 'zaeh', 'kein']);
    },
    answer: (v) =>
      ({
        lang: 'Ja, hinter uns staut es sich schon ziemlich weit zurück.',
        kurz: 'Es stehen schon ein paar Autos auf beiden Seiten, aber noch kein langer Stau.',
        zaeh: 'Der Verkehr ist zäh, es geht nur langsam vorbei.',
        kein: 'Nein, hier ist kaum Verkehr.',
      })[str(v)] ?? 'Ein bisschen Stau gibt es.',
  },
  {
    id: 'x_rettungsgasse',
    label: 'Rettungsgasse gebildet',
    categories: ['vu'],
    patterns: [w('rettungsgasse|rettungsgassen'), p(' (autos|fahrzeuge|leute|die) (\\w+ ){0,2}(platz gemacht|eine gasse gebildet|eine gasse gemacht|platz machen) ')],
    examples: ['Wird eine Rettungsgasse gebildet?', 'ist die rettungsgasse frei', 'äh machen die so eine rettungsgasse', 'kommen wir durch die rettungsgasse durch'],
    generate: (c) => {
      const stau = c.get('x_stau');
      if (stau === 'kein') return 'unnoetig';
      if (isAutobahn(c)) return c.rng.pick(['ja', 'teils', 'nein']);
      if (stau === 'lang') return c.rng.pick(['teils', 'ja']);
      return 'platz';
    },
    answer: (v) =>
      ({
        ja: 'Ja, die Autos haben eine Gasse gebildet, da kommen Sie durch.',
        teils: 'Teilweise, ein paar stehen quer, das wird eng.',
        nein: 'Nein, die stehen alle kreuz und quer, da ist keine Gasse.',
        unnoetig: 'Hier staut sich nichts groß, eine Rettungsgasse braucht es nicht.',
        platz: 'Eine richtige Gasse nicht, aber es stehen nur ein paar Autos, die machen bestimmt Platz.',
      })[str(v)] ?? 'Das kann ich von hier nicht sehen.',
  },
  {
    id: 'x_airbag',
    label: 'Airbags ausgelöst',
    categories: ['vu'],
    patterns: [w('airbag|airbags')],
    examples: ['Sind die Airbags ausgelöst?', 'ist der airbag aufgegangen', 'äh haben die airbags so ausgelöst', 'hat das fahrzeug airbags ausgelöst'],
    generate: (c) => {
      if (onlyTwoWheel(c)) return 'zweirad';
      if (isBus(c)) return 'bus';
      // Zusammenstoß PKW–Fahrrad: Frontairbags lösen dabei praktisch nie aus
      if (/fahrrad/.test(vehiclesText(c)) && !/frontal/.test(vehiclesText(c))) return 'rad';
      if (/frontal|überschlagen|baum|leitplanke|schutzplanke|lkw|seite/.test(`${vehiclesText(c)} ${low(c.facts.what)}`)) return 'ja';
      if (c.facts.trapped === true) return 'ja';
      if (/auffahr/.test(vehiclesText(c))) return c.rng.pick(['ja', 'nein']);
      return c.rng.pick(['ja', 'nein', 'ja']);
    },
    answer: (v) =>
      ({
        zweirad: 'Das ist ein Motorrad, da gibt es keine Airbags.',
        bus: 'Das ist ein Bus, ob da Airbags drin sind, weiß ich nicht.',
        rad: 'Im Auto sind keine Airbags aufgegangen, glaube ich.',
        ja: 'Ja, die Airbags sind aufgegangen, da hängen die weißen Säcke raus.',
        nein: 'Nein, die Airbags sind nicht aufgegangen, glaube ich.',
      })[str(v)] ?? 'Das sehe ich von hier nicht.',
  },
  {
    id: 'x_fzg_lage',
    label: 'Lage des Fahrzeugs (Dach, Seite, Räder)',
    categories: ['vu'],
    patterns: [
      p(' (liegt|liegen|steht|stehen|ist|sind) (\\w+ )?(es|er|auto|autos|wagen|fahrzeug|fahrzeuge|pkw|lkw|bus|transporter|motorrad) (\\w+ ){0,2}(auf dem dach|auf der seite|auf den raedern|auf allen vier raedern|ueberschlagen|umgekippt|im graben) '),
      w('ueberschlagen|ueberschlag|umgekippt|kopfueber'),
      p(' in welche[rm]? (lage|position) (ist|liegt|steht|befindet sich) '),
    ],
    examples: ['Liegt das Auto auf dem Dach?', 'hat sich der wagen überschlagen', 'äh steht das fahrzeug noch auf den rädern', 'ist der lkw umgekippt', 'liegt es so auf der seite'],
    generate: (c) => {
      const t = vehiclesText(c);
      if (/überschlagen/.test(t)) return 'dach';
      if (/umgekippt|auf der seite/.test(t)) return /graben/.test(t) ? 'seite_graben' : 'seite';
      if (/graben/.test(t)) return 'graben';
      if (onlyTwoWheel(c)) return 'motorrad';
      if (/fahrrad/.test(t)) return 'rad';
      if (/baum/.test(low(c.facts.what))) return 'baum';
      return singleVehicle(c) ? 'raeder_eins' : 'raeder';
    },
    answer: (v) =>
      ({
        dach: 'Das Auto liegt auf dem Dach, die Räder zeigen nach oben!',
        seite: 'Der liegt auf der Seite.',
        seite_graben: 'Der ist in den Graben gekippt und liegt auf der Seite.',
        graben: 'Der ist in den Graben gerutscht, steht aber noch auf den Rädern.',
        motorrad: 'Das Motorrad liegt auf der Straße, der Fahrer liegt ein Stück daneben.',
        rad: 'Das Auto steht noch normal da, das Fahrrad liegt verbogen davor auf der Straße.',
        baum: 'Das Auto steht noch auf den Rädern, vorne ganz eingedrückt am Baum.',
        raeder_eins: 'Der steht noch auf den Rädern.',
        raeder: 'Die stehen alle noch auf den Rädern.',
      })[str(v)] ?? 'Die stehen noch auf den Rädern.',
  },
  {
    id: 'x_kinder_fzg',
    label: 'Kinder im Fahrzeug',
    categories: ['vu'],
    patterns: [w('kinder|kind|baby|babys|kleinkind|kleinkinder|kindersitz|kindersitze|saeugling'), p(' (kinder|kind) (mit )?beteiligt ')],
    examples: ['Sind Kinder im Auto?', 'sitzt da ein kind mit drin', 'äh ist ein kindersitz im wagen', 'waren kinder dabei', 'ist ein baby an bord'],
    generate: (c) => {
      if (onlyTwoWheel(c)) return 'nein';
      if (/fahrrad/.test(vehiclesText(c))) return c.rng.chance(0.2) ? 'rad_kind' : 'nein';
      if (/wohnmobil/.test(low(c.facts.vehicles))) return c.rng.chance(0.5) ? 'wohnmobil' : 'nein';
      if (isBus(c) || /kleinbus/.test(low(c.facts.vehicles))) {
        if (!c.rng.chance(0.6)) return 'bus_nein';
        return injuredCount(c) >= 2 ? 'bus_verletzt' : 'bus';
      }
      if (/tankwagen|tank-lkw|sattelzug|transporter/.test(low(c.facts.vehicles)) && !hasCar(c)) return 'nein';
      if (!c.rng.chance(0.3)) return 'nein';
      return injuredCount(c) >= 2 ? 'ja_verletzt' : 'ja_ok';
    },
    answer: (v) =>
      ({
        nein: 'Nein, Kinder sehe ich keine.',
        rad_kind: 'Das ist ein Kind auf dem Fahrrad, vielleicht zwölf Jahre alt.',
        bus: 'Im Bus sind auch ein paar Kinder, die sind aber schon draußen.',
        bus_verletzt: 'Ja, im Bus waren auch Kinder, ein paar davon weinen und bluten.',
        bus_nein: 'Kinder habe ich im Bus keine gesehen, das sind fast nur Erwachsene.',
        wohnmobil: 'Im Wohnmobil war eine Familie, zwei Kinder sind dabei, die stehen schon draußen bei der Mutter.',
        ja_ok: 'Ja, hinten sitzt ein Kind im Kindersitz, das weint, scheint aber okay.',
        ja_verletzt: 'Ja, hinten war ein Kind drin, das ist auch verletzt!',
      })[str(v)] ?? 'Das weiß ich nicht genau.',
  },
  {
    id: 'x_absicherung',
    label: 'Unfallstelle abgesichert',
    categories: ['vu'],
    patterns: [w('abgesichert|warndreieck|warndreiecke|warnblinker|warnblinkanlage|warnblinklicht|absicherung|abgesperrt'), p(' (unfallstelle|stelle) (\\w+ ){0,2}gesichert ')],
    examples: ['Ist die Unfallstelle abgesichert?', 'steht ein warndreieck', 'äh ist die warnblinkanlage an', 'haben sie die stelle gesichert', 'hat jemand abgesichert'],
    generate: (c) => {
      if (isAutobahn(c)) return c.rng.pick(['blinker', 'blinker_dreieck']);
      if (onlyTwoWheel(c)) return /zeug|ersthelf|passant/i.test(c.relation) ? c.rng.pick(['auto_blinker', 'nein']) : 'nein';
      if (/zeuge/i.test(c.relation)) return c.rng.pick(['nein', 'blinker', 'dreieck']);
      return c.rng.pick(['blinker_dreieck', 'blinker', 'dreieck']);
    },
    answer: (v, c) =>
      ({
        blinker: isAutobahn(c) ? 'Die Warnblinker sind an, ein Warndreieck hat sich bei dem Verkehr keiner getraut.' : 'Die Warnblinker sind an, ein Warndreieck steht noch nicht.',
        blinker_dreieck: 'Ja, Warnblinker sind an und ein Warndreieck steht.',
        dreieck: 'Ein Warndreieck steht, ob die Warnblinker gehen, sehe ich nicht.',
        auto_blinker: 'Ich habe mein Auto mit Warnblinker davor gestellt.',
        nein: 'Nein, abgesichert hat noch keiner.',
      })[str(v)] ?? 'Ich glaube nicht.',
  },
  {
    id: 'x_glaette',
    label: 'Straßenzustand / Glätte / Wetter',
    categories: ['vu'],
    patterns: [w('glatt|glaette|glatteis|strassenzustand|fahrbahnzustand|nass|rutschig|regnet|regen|schnee|schneit|vereist|nebel'), p(' wie ist (das wetter|die sicht) ')],
    examples: ['Ist es glatt?', 'wie ist der straßenzustand', 'äh ist die fahrbahn so nass', 'regnet es bei ihnen', 'ist es rutschig'],
    generate: (c) => {
      const t = factText(c);
      if (/regen/.test(t)) return 'regen';
      // nur echte Betriebsstoffe auf der Fahrbahn (nicht "gerutscht", nicht "etwas Öl")
      const leak = low(c.facts.leak);
      if (/diesel|(^|\s)öl|ölspur|granulat/.test(leak) && !/etwas öl/.test(leak)) return 'oel';
      // keine erfundene Glätte: das Wetter des Spiels ist hier nicht bekannt
      return c.rng.pick(['trocken', 'trocken', 'nass', 'feucht']);
    },
    answer: (v) =>
      ({
        regen: 'Es regnet, die Straße ist richtig nass.',
        oel: 'Jetzt ist es rutschig, da läuft ja Zeug aus, sonst war die Straße trocken.',
        trocken: 'Nein, die Straße ist trocken.',
        nass: 'Die Straße ist nass, es hat vorhin geregnet.',
        feucht: 'Ein bisschen feucht, aber nicht glatt.',
        glatt: 'Ja, es ist ziemlich glatt, da ist überfrierende Nässe.',
      })[str(v)] ?? 'Die Straße ist trocken.',
  },

  /* ---------------------------------------------------------- TH */
  {
    id: 'x_strom_ab',
    label: 'Strom abgeschaltet',
    categories: ['th'],
    patterns: [
      p(' (der |den )?strom (\\w+ ){0,2}(abgeschaltet|abgestellt|abgedreht|ausgeschaltet|abgeklemmt|abschalten|abstellen|ausgemacht) '),
      p(' (die |eine )?sicherung(en)? (\\w+ ){0,2}(raus|rausgedreht|rausgenommen|ausgeschaltet|abgeschaltet|abgestellt) '),
      p(' (leitung|oberleitung|freileitung) (\\w+ ){0,2}(abgeschaltet|stromlos|spannungsfrei|geerdet) '),
      w('stromlos|spannungsfrei'),
      p(' (der |den )?strom (schon |jetzt |denn |mal |ueberall )*(aus|ab|weg) $'),
    ],
    examples: ['Ist der Strom abgeschaltet?', 'haben sie die sicherung rausgedreht', 'äh ist der strom schon abgestellt', 'ist das stromlos', 'ist die leitung schon abgeschaltet'],
    generate: (c) => {
      const t = factText(c);
      if (/nicht elektrifiziert/.test(t)) return 'keine_leitung';
      if (/oberleitung/.test(t)) return 'oberleitung';
      if (/kabel funkt|freileitung/.test(t)) return 'leitung_aktiv';
      if (/windkraft|windpark|gondel/.test(t)) return 'wka';
      if (/stromausfall/.test(t)) return 'ausfall';
      if (/maschine ist abgeschaltet/.test(t)) return 'maschine';
      if (c.building === null) return 'draussen';
      if (isPassant(c)) return 'weissnicht';
      if (/steckdose|heizung steht im wasser|überflut|keller/.test(t)) return c.rng.pick(['ab', 'nicht', 'ab']);
      return c.rng.pick(['nicht', 'nicht', 'ab']);
    },
    answer: (v, c) =>
      ({
        keine_leitung: 'Hier gibt es keine Oberleitung, das ist eine Dieselstrecke.',
        leitung_aktiv: 'Nein! Da funkt es noch, der Netzbetreiber ist noch nicht da.',
        oberleitung: 'Das weiß ich nicht, ob die Oberleitung schon abgeschaltet ist, geerdet hat sie jedenfalls noch keiner.',
        wka: 'Die Anlage ist angehalten, ob da oben alles spannungsfrei ist, weiß ich nicht.',
        ausfall: 'Strom ist hier sowieso überall weg, das ist ja das Problem.',
        maschine: 'Die Maschine ist aus, den Not-Aus hat ein Kollege gedrückt.',
        draussen: 'Hier draußen gibt es nichts mit Strom, was man abschalten müsste.',
        weissnicht: 'Das weiß ich nicht, ich bin nur vorbeigekommen.',
        ab: `Ja, die Sicherungen sind raus, ${c.building && /efh|rh|mfh|hochhaus/.test(c.building.kind) ? 'im Haus' : 'im Gebäude'} ist der Strom aus.`,
        nicht: 'Nein, abgeschaltet hat noch keiner was.',
      })[str(v)] ?? 'Das weiß ich nicht.',
  },
  {
    id: 'x_wasserstand',
    label: 'Wasserstand (Keller, Überflutung)',
    categories: ['th'],
    patterns: [
      p(' wie (hoch|tief|viel) (steht|ist|sind|stehen) (\\w+ ){0,2}wasser '),
      p(' wie (hoch|tief) steht (es|das) '),
      p(' wie ?viel wasser '),
      w('wasserstand|wasserhoehe|pegelstand'),
    ],
    examples: ['Wie hoch steht das Wasser im Keller?', 'wie tief ist das wasser', 'äh wie hoch steht es so ungefähr', 'wie ist der wasserstand', 'wie viel wasser ist im keller'],
    applies: (c) => /wasser|überflut|flut/.test(`${low(c.facts.what)} ${low(c.facts.hazard)} ${low(c.facts.help)}`) && c.location !== 'wasser',
    generate: (c) => {
      const t = factText(c);
      if (/halben meter/.test(t)) return 50;
      if (/wasserschaden/.test(t)) return c.rng.int(1, 5);
      if (/überflutung mehrerer|sturmflut|keller der ganzen/.test(t)) return c.rng.int(40, 90);
      if (/heizung steht im wasser/.test(t)) return c.rng.int(30, 60);
      if (/keller/.test(t)) return c.rng.int(10, 40);
      if (/ohne die pumpe/.test(t)) return 0;
      return c.rng.int(5, 30);
    },
    answer: (v, c) => {
      const n = Number(v);
      const steigt = /steigt/.test(factText(c)) ? ' Und es steigt weiter!' : '';
      if (n <= 0) return 'Noch steht hier nichts, aber ohne die Pumpe läuft das Wasser bald in die Häuser.';
      if (n <= 5) return `Nur ein paar Zentimeter, das läuft aber überall hin.${steigt}`;
      if (n < 30) return `So etwa ${n} Zentimeter, knöcheltief.${steigt}`;
      if (n < 60) return `Bestimmt ${n} Zentimeter, fast bis zum Knie.${steigt}`;
      return `Fast ein Meter, so ${n} Zentimeter.${steigt}`;
    },
    unknown: () => 'Hier steht kein Wasser.',
  },
  {
    id: 'x_aufzug_lage',
    label: 'Wo steckt der Aufzug',
    categories: ['th'],
    patterns: [
      p(' (wo|in welche[rnm]? (etage|stock|stockwerk|geschoss)|zwischen welchen (etagen|stockwerken|stoecken|geschossen)) (\\w+ ){0,2}(steckt|haengt|steht|haelt|ist) (\\w+ ){0,2}(aufzug|fahrstuhl|lift|kabine) '),
      p(' (aufzug|fahrstuhl|lift|kabine) (\\w+ ){0,2}(steckt|haengt|stecken|haengen|stehengeblieben|steckengeblieben|haengengeblieben) '),
    ],
    examples: ['Wo steckt der Aufzug?', 'zwischen welchen etagen hängt der fahrstuhl', 'äh in welchem stock steht die kabine', 'wo hängt der lift denn', 'wo ist der aufzug stehengeblieben'],
    applies: (c) => /aufzug|fahrstuhl/.test(low(c.facts.what)),
    generate: (c) => {
      const floors = Math.max(2, Number(c.get('x_etagen') ?? c.building?.maxFloors ?? 4) || 4);
      return c.rng.int(0, floors - 2);
    },
    answer: (v, c) => {
      const n = Number(v);
      if (isPassant(c)) return 'Ich glaube irgendwo in der Mitte, genau weiß ich das nicht.';
      if (n <= 0) return 'Der hängt zwischen Erdgeschoss und erstem Stock.';
      return `Der hängt zwischen dem ${n}. und dem ${n + 1}. Stock, die Anzeige zeigt ${zahl(n)}.`;
    },
    unknown: () => 'Hier steckt kein Aufzug fest.',
  },
  {
    id: 'x_baum',
    label: 'Baum / Ast: Größe und was blockiert ist',
    categories: ['th'],
    patterns: [w('baum|baeume|ast|aeste|baumstamm|stamm|umgestuerzt')],
    examples: ['Wie groß ist der Baum?', 'blockiert der baum die ganze straße', 'äh liegt der ast quer', 'wie dick ist der stamm', 'ist der baum umgestürzt'],
    applies: (c) => /baum|ast/.test(low(c.facts.what)),
    generate: (c) => {
      const t = factText(c);
      if (/wohnhaus|dach/.test(t)) return 'haus';
      if (c.facts.trapped === true) return 'auto';
      if (/gehweg/.test(t)) return 'halb';
      return c.rng.pick(['ganz', 'ganz', 'halb']);
    },
    answer: (v) =>
      ({
        haus: 'Ein großer Baum, bestimmt zwanzig Meter, der liegt quer auf dem Dach.',
        auto: 'Ein dicker Baum, der liegt genau auf dem Auto, das Dach ist eingedrückt!',
        halb: 'Ein ziemlich großer Baum, der liegt halb auf der Straße, die Autos fahren über den Gehweg.',
        ganz: 'Der Baum liegt quer über die ganze Straße, da kommt keiner mehr durch, der Stamm ist richtig dick.',
      })[str(v)] ?? 'Ein großer Baum.',
    unknown: () => 'Ein Baum ist hier nicht im Spiel.',
  },
  {
    id: 'x_oelspur',
    label: 'Länge der Ölspur',
    categories: ['th'],
    patterns: [
      p(' (wie )?(lang|weit|gross|breit) (\\w+ ){0,3}(oelspur|spur|oelfleck|oelfilm|oelteppich|film|teppich) '),
      p(' (oelspur|spur) (\\w+ ){0,3}(lang|weit|ueber|bis|zieht) '),
      p(' zieht sich (\\w+ ){0,2}(oelspur|spur) '),
    ],
    examples: ['Wie lang ist die Ölspur?', 'wie weit geht die ölspur', 'äh wie lang ist die spur so ungefähr', 'zieht sich die ölspur durch den ganzen ort', 'wie groß ist der ölfilm'],
    applies: (c) => /ölspur/.test(low(c.facts.what)) || /hafenbecken|wasseroberfläche|ölfilm/.test(low(c.facts.what)),
    generate: (c) => {
      if (!/ölspur/.test(low(c.facts.what))) {
        const m = /(\d+) mal (\d+) meter/.exec(low(c.facts.hazard));
        if (m) return `film:${m[1]}x${m[2]}`;
        if (/streifen/.test(low(c.facts.hazard))) return `streifen:${c.rng.pick([10, 15, 20, 30])}`;
        return `film:${c.rng.pick([10, 15, 20])}x${c.rng.pick([5, 10])}`;
      }
      return c.rng.pick([100, 200, 300, 500, 1000]);
    },
    answer: (v) => {
      const s = str(v);
      const film = /^film:(\d+)x(\d+)$/.exec(s);
      if (film) return `Der Ölfilm ist ungefähr ${film[1]} mal ${film[2]} Meter groß.`;
      const streifen = /^streifen:(\d+)$/.exec(s);
      if (streifen) return `Ein Streifen an der Kaimauer, so ${streifen[1]} Meter lang, aber es kommt immer mehr nach.`;
      const n = Number(v);
      return n >= 1000 ? 'Die zieht sich bestimmt einen Kilometer durch den ganzen Ort.' : `So etwa ${n} Meter, quer über beide Spuren.`;
    },
    unknown: () => 'Eine Ölspur sehe ich hier nicht.',
  },

  /* ---------------------------------------------------------- ABC */
  {
    id: 'x_wind',
    label: 'Windrichtung',
    categories: ['abc', 'vu'],
    patterns: [
      p(' (aus )?welche[rnm]? richtung (\\w+ ){0,2}(kommt|weht|blaest|zieht) (\\w+ ){0,2}(der )?wind '),
      w('windrichtung|wind|windig|weht'),
    ],
    examples: ['Aus welcher Richtung kommt der Wind?', 'wie ist die windrichtung', 'äh ist es windig', 'wohin weht der wind', 'weht da wind'],
    applies: (c) => !isIndoor(c),
    generate: (c) => c.rng.pick(['west', 'west', 'suedwest', 'ost', 'nord', 'still']),
    answer: (v, c) => {
      const zug = c.category === 'abc' && !/^nein/.test(low(c.facts.cloud)) ? ' Der Geruch zieht von uns weg, glaube ich.' : '';
      return (
        {
          west: `Der Wind kommt von Westen, so mittelstark.${zug}`,
          suedwest: `Aus Südwest, ziemlich böig.${zug}`,
          ost: `Der Wind kommt von Osten, eher schwach.${zug}`,
          nord: `Von Norden, frischer Wind.${zug}`,
          still: 'Es ist fast windstill.',
        }[str(v)] ?? 'Kaum Wind.'
      );
    },
    unknown: () => 'Wir sind drinnen, Wind spielt hier keine Rolle.',
  },
  {
    id: 'x_abc_symptome',
    label: 'Beschwerden bei Anwesenden',
    categories: ['abc'],
    patterns: [
      w('kopfschmerzen|kopfweh|schwindelig|schwindel|uebelkeit|uebel|husten|hustet|reizhusten|augenbrennen|traenen|atemnot|atembeschwerden|kratzen im hals|brennen die augen'),
      p(' (geht es|gehts) (\\w+ ){0,2}(jemandem|wem|den leuten|ihnen) (\\w+ ){0,2}schlecht '),
      p(' (brennen|traenen|jucken) (\\w+ ){0,2}(die )?augen '),
    ],
    examples: ['Hat jemand Kopfschmerzen?', 'ist jemandem schwindelig', 'äh husten die leute', 'brennen die augen', 'geht es jemandem schlecht'],
    generate: (c) => {
      const n = injuredCount(c);
      const t = factText(c);
      if (n <= 0) return /schwindelig/.test(t) ? 'selbst' : isIndoor(c) ? 'keine_drinnen' : 'keine';
      if (/kohlenmonoxid/.test(t)) return 'co';
      if (/ammoniak|chlor|salzsäure|stechend/.test(t)) return 'reiz';
      return 'husten';
    },
    answer: (v, c) => {
      const n = injuredCount(c);
      const wer = n === 1 ? 'Einer hat' : `${zahl(n).replace(/^ein$/, 'Ein')} Leute haben`;
      return (
        {
          keine: 'Nein, keinem geht es schlecht, wir stehen aber auch weit weg.',
          keine_drinnen: 'Nein, uns geht es allen gut, soweit ich das merke.',
          selbst: 'Mir selbst wird ein bisschen schwindelig, sonst niemandem.',
          co: n === 1 ? 'Einer hat Kopfschmerzen und ihm ist richtig übel.' : `${wer} Kopfschmerzen und Übelkeit, einem ist richtig schwindelig.`,
          reiz: `${wer} brennende Augen und husten ganz stark.`,
          husten: `${wer} Husten und Kratzen im Hals.`,
        }[str(v)] ?? 'Ich glaube nicht.'
      ).replace(/^(\w)/, (m) => m.toUpperCase());
    },
  },
  {
    id: 'x_behaelter',
    label: 'Behälterart und Größe',
    categories: ['abc', 'vu'],
    patterns: [
      p(' (was fuer (ein|eine|einen)|welche[rnms]? (art|sorte)( von)?) (behaelter|behaeltnis|gebinde|tank|fass|kanister|container) '),
      p(' wie gross (ist|sind) (der|die|das) (behaelter|gebinde|tank|fass|faesser|kanister|container|tankwagen) '),
      p(' (ist es|ist das) (ein |eine )?(fass|tank|kanister|flasche|container) oder (ein |eine )?(fass|tank|kanister|flasche|container|sack) '),
      w('behaeltergroesse|behaelterart|gebinde'),
    ],
    examples: ['Was für ein Behälter ist das?', 'wie groß ist der tank', 'äh ist das ein fass oder ein kanister', 'welche art von behälter ist das', 'was für ein gebinde'],
    applies: (c) => c.category === 'abc' || isGefahrgut(c),
    generate: (c) => {
      // ohne Ortsbeschreibung ("Höhe Tankstelle" ist kein Tank)
      const t = factText(c).replace(low(c.facts._detail), '');
      if (/kohlenmonoxid/.test(t)) return /therme|heizung|ofen/.test(t) ? 'therme' : 'co';
      if (/chlorgas|druckgas|gasflasche/.test(t)) return 'gasflasche';
      if (/säcke|granulat|duengemittel|düngemittel/.test(t)) return 'saecke';
      if (/fass|fässer/.test(t)) return 'faesser';
      if (/tankwagen|tank-lkw|aus dem tank/.test(t)) return 'tankwagen';
      if (/lkw/.test(t)) return c.rng.pick(['tankwagen', 'ibc']);
      if (/hundert liter|produktion|chemikal/.test(t)) return c.rng.pick(['ibc', 'lagertank']);
      return c.rng.pick(['kanister', 'ibc']);
    },
    answer: (v) =>
      ({
        therme: 'Da ist kein Behälter, das kommt wohl aus der Gastherme.',
        co: 'Da ist kein Behälter, der Melder hat einfach angeschlagen, wo das herkommt, weiß ich nicht.',
        gasflasche: 'Das sind so große Gasflaschen, die stehen in einem Raum neben der Halle.',
        saecke: 'Das sind große Säcke auf Paletten, mehrere sind aufgeplatzt.',
        faesser: 'Das sind blaue Kunststofffässer, so 200 Liter jedes.',
        tankwagen: 'Das ist ein Tankwagen, der Tank ist richtig groß, mehrere Kammern.',
        ibc: 'So ein weißer Kunststoffcontainer im Gitter, etwa tausend Liter.',
        lagertank: 'Das ist ein fest eingebauter Lagertank in der Halle.',
        kanister: 'Ein paar Kanister, so zwanzig Liter jeder.',
      })[str(v)] ?? 'Das kann ich nicht genau erkennen.',
    unknown: () => 'Nein, da sind keine Fässer oder Tanks, nur die kaputten Fahrzeuge.',
  },

  /* ---------------------------------------------------------- Wasser */
  {
    id: 'x_kleidung',
    label: 'Kleidung / Farbe der Person',
    categories: ['wasser'],
    patterns: [
      w('kleidung|anhat|angezogen|jacke|schwimmweste|schwimmwesten|badekappe|badesachen'),
      p(' was (hat|haben|traegt|tragen) (die person|die personen|er|sie|der mann|die frau|das kind|die leute) (\\w+ )?(an|fuer kleidung) '),
      p(' welche farbe (hat|haben|ist) '),
      p(' (traegt|tragen) (\\w+ ){0,2}(eine |einen )?(weste|rettungsweste|jacke|muetze) '),
    ],
    examples: ['Was hat die Person an?', 'welche farbe hat die kleidung', 'äh trägt sie eine schwimmweste', 'was trägt der mann so an', 'welche farbe hat die jacke'],
    generate: (c) => {
      const t = factText(c);
      if (/boot|kenterung|segler/.test(t)) return 'westen';
      if (isEis(c)) return 'winter';
      if (/bade|strand/.test(t)) return 'bade';
      return c.rng.pick(['rot', 'dunkel', 'gelb']);
    },
    answer: (v) =>
      ({
        westen: 'Die haben orange Schwimmwesten an, das sieht man gut.',
        winter: 'Eine dunkelblaue Winterjacke und eine rote Mütze.',
        bade: 'Nur Badesachen, eine grüne Badehose oder so, und eine gelbe Badekappe.',
        rot: 'Eine rote Jacke, das sieht man im Wasser ganz gut.',
        dunkel: 'Dunkle Sachen, schwarz oder dunkelblau, schwer zu sehen.',
        gelb: 'Eine gelbe Regenjacke.',
      })[str(v)] ?? 'Dunkle Kleidung.',
  },
  {
    id: 'x_dauer_wasser',
    label: 'Wie lange schon im Wasser',
    categories: ['wasser'],
    patterns: [
      p(' (wie lange|seit wann|wie viele minuten) (\\w+ ){0,4}(im wasser|eingebrochen|drin|draussen|weg|unter wasser|gekentert|abgetrieben|in not|auf dem wasser|treibt|treiben) '),
      p(' (wann|wie lange her) (\\w+ ){0,2}(eingebrochen|gekentert|reingefallen|ins wasser gefallen|gesprungen) '),
    ],
    examples: ['Wie lange ist die Person schon im Wasser?', 'seit wann ist er im wasser', 'äh wann ist sie eingebrochen', 'wie lange sind die schon gekentert', 'seit wann treiben die so auf dem wasser'],
    generate: (c) => {
      if (isBootInNot(c)) return c.rng.int(20, 45);
      if (c.facts.visible === false) return c.rng.int(3, 8);
      return c.rng.int(1, 5);
    },
    answer: (v, c) => {
      const n = Number(v);
      if (isBootInNot(c)) return `Die treiben schon seit ungefähr ${n} Minuten, der Motor springt nicht an.`;
      if (n <= 2) return 'Gerade eben, vielleicht ein, zwei Minuten.';
      if (n <= 5) return `Seit ${zahl(n)} Minuten ungefähr, ich habe sofort angerufen.`;
      return `Vielleicht seit ${zahl(n)} Minuten, ich habe es nicht sofort gesehen.`;
    },
  },
  {
    id: 'x_stroemung',
    label: 'Strömung / Wellen',
    categories: ['wasser'],
    patterns: [w('stroemung|stroemt|reissend|wellen|wellengang|seegang'), p(' wie (stark|schnell) (\\w+ ){0,2}(fliesst|stroemt|treibt das wasser)( (das wasser|der fluss|der bach|der kanal|es))? '), p(' fliesst (das wasser|der fluss) ')],
    examples: ['Gibt es eine Strömung?', 'wie stark ist die strömung', 'äh hat es so wellen', 'fließt das wasser schnell', 'ist das reißend'],
    generate: (c) => {
      const t = low(c.facts.water);
      if (isEis(c)) return 'eis';
      if (/fluss|schlei|engstelle/.test(t)) return c.rng.pick(['stark', 'mittel']);
      if (/ostsee|förde|auflandig/.test(t)) return c.rng.pick(['wellen', 'leicht']);
      return 'still';
    },
    answer: (v) =>
      ({
        eis: 'Strömung gibt es keine, das ist ja alles zugefroren, nur da, wo er eingebrochen ist, ist ein Loch.',
        stark: 'Ja, die Strömung ist ziemlich stark, es treibt alles flussabwärts.',
        mittel: 'Etwas Strömung gibt es, das treibt langsam weg.',
        wellen: 'Es gibt ordentlich Wellen, so einen halben Meter.',
        leicht: 'Leichte Wellen, nicht schlimm.',
        still: 'Nein, das Wasser ist ganz ruhig.',
      })[str(v)] ?? 'Ein bisschen Strömung.',
  },
  {
    id: 'x_boot',
    label: 'Boot in der Nähe',
    categories: ['wasser'],
    patterns: [w('boot|boote|ruderboot|schlauchboot|kanu|tretboot|paddelboot|motorboot')],
    examples: ['Ist ein Boot in der Nähe?', 'gibt es da ein boot', 'äh hat jemand so ein ruderboot', 'liegt da ein schlauchboot'],
    generate: (c) => {
      const t = factText(c);
      if (isBootInNot(c)) return 'andere';
      if (isKenterung(c)) return c.rng.pick(['gekentert', 'gekentert_hilfe']);
      if (isEis(c) || /weiher/.test(t)) return 'nein';
      if (/hafen|förde|fähr/.test(t)) return c.rng.pick(['hafen', 'andere']);
      if (/strand|bade/.test(t)) return c.rng.pick(['tretboot', 'nein']);
      return c.rng.pick(['nein', 'nein', 'angler']);
    },
    answer: (v) =>
      ({
        andere: 'Ein anderes Boot sehe ich gerade nicht in der Nähe.',
        gekentert: 'Nur das gekenterte Boot, das treibt kieloben daneben, ein anderes sehe ich nicht.',
        gekentert_hilfe: 'Das gekenterte Boot treibt daneben, und ein anderes Segelboot dreht gerade dahin.',
        nein: 'Nein, ein Boot ist hier nicht.',
        hafen: 'Im Hafen liegen Boote, aber da ist keiner drauf.',
        tretboot: 'Am Steg liegen Tretboote, da läuft gerade einer hin.',
        angler: 'Ein Angler hat ein kleines Ruderboot, der versucht gerade, es loszumachen.',
      })[str(v)] ?? 'Nein.',
  },
  {
    id: 'x_rettungsring',
    label: 'Rettungsring / Rettungsmittel in der Nähe',
    categories: ['wasser'],
    patterns: [w('rettungsring|rettungsringe|rettungsboje|wurfleine|rettungsleine|rettungsmittel|rettungsstange|eisleiter|leiter')],
    examples: ['Gibt es einen Rettungsring in der Nähe?', 'haben sie eine wurfleine', 'äh ist da so ein rettungsring', 'gibt es da eine leiter'],
    generate: (c) => {
      const t = factText(c);
      if (isBootInNot(c)) return 'boot';
      if (isEis(c) || /weiher/.test(t)) return c.rng.pick(['leiter', 'nein']);
      if (/brücke|hafen|förde|kai/.test(t)) return c.rng.pick(['ring', 'ring_weg']);
      if (/strand|bade/.test(t)) return 'dlrg';
      return c.rng.pick(['nein', 'ring']);
    },
    answer: (v) =>
      ({
        leiter: 'Am Ufer hängt so eine Eisleiter, die holen wir gerade.',
        nein: 'Nein, ich sehe keinen Rettungsring.',
        ring: 'Ja, da hängt ein Rettungsring an einem Pfahl.',
        ring_weg: 'Da ist ein Halter für einen Rettungsring, aber der Ring fehlt.',
        dlrg: 'Am Rettungsturm hängt ein Ring, aber der Turm ist nicht besetzt.',
        boot: 'Die haben auf dem Boot bestimmt Rettungswesten, sonst sehe ich nichts.',
      })[str(v)] ?? 'Nein.',
  },
  {
    id: 'x_ufer_abstand',
    label: 'Entfernung vom Ufer',
    categories: ['wasser'],
    patterns: [
      p(' wie (weit|viele meter|viel meter) (\\w+ ){0,4}(vom ufer|vom strand|von land|vom rand|raus|draussen|entfernt|weg|bis zum ufer|bis zum strand|bis zum land) '),
      p(' (abstand|entfernung) (\\w+ ){0,2}(zum|vom) (ufer|strand|land|rand) '),
    ],
    examples: ['Wie weit ist die Person vom Ufer weg?', 'wie weit draußen ist er', 'äh wie viele meter vom ufer ist das so', 'wie weit ist das boot entfernt', 'wie ist der abstand zum ufer'],
    generate: (c) => {
      const t = low(c.facts.water);
      const m = /(\d+)\s*meter/.exec(t);
      if (m) return Number(m[1]);
      if (isEis(c)) return c.rng.int(4, 12);
      if (/fluss/.test(t)) return c.rng.int(8, 25);
      if (/baggersee/.test(t)) return c.rng.int(20, 60);
      if (/mitte|insel/.test(t)) return c.rng.int(200, 400);
      if (/förde|schlei/.test(t)) return c.rng.int(100, 300);
      return c.rng.int(20, 80);
    },
    answer: (v, c) => {
      const raw = Number(v);
      // Schätzungen klingen rund: "ungefähr 300 Meter", nicht "334 Meter"
      const n = raw >= 100 ? Math.round(raw / 50) * 50 : raw > 30 ? Math.round(raw / 10) * 10 : raw;
      const zuletzt = c.facts.visible === false ? 'Zuletzt war das' : 'Das ist';
      return `${zuletzt} ungefähr ${n} Meter vom Ufer.`;
    },
  },
];
