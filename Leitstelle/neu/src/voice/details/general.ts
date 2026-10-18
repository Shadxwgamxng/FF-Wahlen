import type { KeywordCategory } from '../../model/types';
import type { FactSpec, ScenarioDef } from '../../data/scenarios';
import { findScenario } from '../../data/scenarios';
import type { FactValue } from '../../data/questions';
import type { DetailContext, DetailTopic } from './types';
import { p, w, zahl } from './types';

/* ------------------------------------------------------------------ Hilfen */

const str = (v: FactValue | undefined) => (v === undefined ? '' : String(v));
const low = (v: FactValue | undefined) => str(v).toLowerCase();

/** Alle Szenariotexte (klein) – für Hinweise */
const factText = (c: DetailContext) =>
  ['what', 'object', 'help', 'situation', 'persons', 'animal', 'hazard', 'floor', 'water', '_detail']
    .map((k) => str(c.facts[k]))
    .join(' ')
    .toLowerCase();

/** Rolle des Anrufers, grob eingeteilt */
type Role =
  | 'passant'
  | 'nachbar'
  | 'bewohner'
  | 'angehoerig'
  | 'betroffen'
  | 'kollege'
  | 'pflege'
  | 'zeuge'
  | 'beteiligt'
  | 'ersthelfer'
  | 'betrieb'
  | 'fahrer'
  | 'spaziergaenger'
  | 'badegast'
  | 'angler'
  | 'tierhalter'
  | 'wirt'
  | 'anwohner'
  | 'hausmeister'
  | 'weitere'
  | 'autofahrer'
  | 'geschaedigt'
  | 'anrufer';

function roleOf(c: DetailContext): Role {
  const r = c.relation.toLowerCase();
  if (/passant/.test(r)) return 'passant';
  if (/nachbar/.test(r)) return 'nachbar';
  if (/bewohner/.test(r)) return 'bewohner';
  if (/angeh(ö|oe)rige/.test(r) && !/betrieb/.test(r)) return 'angehoerig';
  if (/betroffen/.test(r)) return 'betroffen';
  if (/kolleg/.test(r)) return 'kollege';
  if (/pflege|station/.test(r)) return 'pflege';
  if (/zeug/.test(r)) return 'zeuge';
  if (/unfallbeteilig/.test(r)) return 'beteiligt';
  if (/ersthelfer/.test(r)) return 'ersthelfer';
  if (/betrieb/.test(r)) return 'betrieb';
  if (/autofahrer/.test(r)) return 'autofahrer';
  if (/fahrer/.test(r)) return 'fahrer';
  if (/spazierg/.test(r)) return 'spaziergaenger';
  if (/badegast/.test(r)) return 'badegast';
  if (/angler/.test(r)) return 'angler';
  if (/tierhalter/.test(r)) return 'tierhalter';
  if (/wirt/.test(r)) return 'wirt';
  if (/anwohner/.test(r)) return 'anwohner';
  if (/hausmeister/.test(r)) return 'hausmeister';
  if (/weitere/.test(r)) return 'weitere';
  return 'anrufer';
}

/** Anrufer weiß wenig über die Beteiligten (zufällig vorbeigekommen) */
const isStranger = (c: DetailContext) => ['passant', 'spaziergaenger', 'badegast', 'angler', 'fahrer', 'autofahrer', 'weitere', 'zeuge'].includes(effRole(c));

/** Anruf von einer Behörde/Fachkraft (Polizei-Leitstelle, Bundespolizei, RTW-Besatzung …) */
const isOfficial = (c: DetailContext) => /^sh_pol_|^sh_psnv/.test(c.scenarioId);

/** Einsatzort draußen (kein Gebäude oder Ereignis im Freien) */
const isOutdoor = (c: DetailContext) =>
  c.building === null ||
  ['strasse', 'land', 'wasser', 'oeffentlich'].includes(c.location) ||
  /draußen|draussen|im hof|im freien|garten/.test(low(c.facts.floor)) ||
  /container|mülltonne|müllhaufen|pkw|lkw|im freien|wald|böschung|feld/.test(low(c.facts.what));

const num = (v: FactValue | undefined) => (typeof v === 'number' ? v : 0);

const RESIDENTIAL = ['efh', 'rh', 'mfh', 'hochhaus'];
/** Wohngebäude am Einsatzort */
const isResidential = (c: DetailContext) => c.building !== null && RESIDENTIAL.includes(c.building.kind);
/** "dem Haus" / "dem Gebäude" */
const houseWord = (c: DetailContext) => (isResidential(c) ? 'Haus' : 'Gebäude');

/** Kann der Patient selbst anrufen? (wach, atmet, kein Kind, kein Massenanfall) */
function patientCanCall(c: DetailContext): boolean {
  if (c.facts.conscious === false || low(c.facts.breathing) === 'nein') return false;
  const age = c.facts.age;
  if (typeof age !== 'number' || age < 14) return false;
  return num(c.facts.injured) <= 3;
}

/** Winterlage (Eis/Schnee) – niemand ist "zum Baden" da */
const isWinter = (c: DetailContext) => /eis/.test(low(c.facts.what)) || (findScenario(c.scenarioId)?.weather?.schnee ?? 0) >= 2;

/**
 * Rolle des Anrufers, passend gemacht: Die Rolle wird beim Anruf zufällig je Kategorie gewählt
 * und passt nicht immer zur Lage (z. B. "Bewohner" bei einem Brand im Gewerbegebiet, "Betroffene/-r"
 * bei einer bewusstlosen Person). Hier wird sie auf eine glaubwürdige Rolle abgebildet.
 */
function effRole(c: DetailContext): Role {
  const r = roleOf(c);
  const loc = c.location;
  if (c.category === 'pol' && ['diebstahl', 'parken', 'unfallflucht'].includes(polKind(c))) return 'geschaedigt';
  if (c.category === 'tier' && openingsFor(c).some((o) => /^unser/i.test(o))) return 'tierhalter';
  switch (r) {
    case 'betroffen':
      if (c.category !== 'rd' || patientCanCall(c)) return r;
      return loc === 'wohn' ? 'angehoerig' : loc === 'klinik' ? 'pflege' : loc === 'gewerbe' ? 'kollege' : 'passant';
    case 'passant':
      return loc === 'klinik' ? 'pflege' : r;
    case 'bewohner':
      return isResidential(c) ? r : 'anwohner';
    case 'nachbar':
      return loc === 'wohn' ? r : 'anwohner';
    case 'hausmeister':
      return c.building !== null && loc !== 'strasse' && loc !== 'land' && loc !== 'wasser' ? r : 'passant';
    case 'betrieb':
      return loc === 'gewerbe' ? r : isResidential(c) ? 'bewohner' : 'passant';
    case 'fahrer':
      return loc === 'strasse' || loc === 'gewerbe' ? r : isResidential(c) ? 'bewohner' : 'passant';
    case 'wirt':
      return c.category === 'pol' && polKind(c) === 'schlaegerei' ? r : 'anwohner';
    case 'badegast':
      return isWinter(c) ? 'spaziergaenger' : r;
    case 'tierhalter':
      if (['reh', 'hirsch', 'wildschwein', 'schwan', 'voegel'].includes(animalKind(c))) return loc === 'strasse' ? 'autofahrer' : 'spaziergaenger';
      return r;
    default:
      return r;
  }
}

/** Passt eine Faktvorgabe des Szenarios zum tatsächlichen Wert? */
function specMatches(spec: FactSpec, v: FactValue | undefined): boolean {
  if (typeof spec === 'object' && spec !== null) {
    if ('oneOf' in spec) return spec.oneOf.some((x) => x === v);
    if ('range' in spec) return typeof v === 'number' && v >= spec.range[0] && v <= spec.range[1];
  }
  return spec === v;
}

/** Eröffnungssätze, die zu den Fakten dieses Anrufs passen (Basis oder Variante) */
function openingsFor(c: DetailContext): string[] {
  const sc: ScenarioDef | undefined = findScenario(c.scenarioId);
  if (!sc) return [];
  const out: string[] = [];
  const candidates = [{ facts: sc.facts, openings: sc.openings }, ...(sc.variants ?? []).map((v) => ({ facts: { ...sc.facts, ...(v.facts ?? {}) }, openings: v.openings ?? sc.openings }))];
  for (const cand of candidates) if (Object.entries(cand.facts).every(([k, spec]) => specMatches(spec, c.facts[k]))) out.push(...cand.openings);
  return out;
}

/** Wetterlage, die zum Szenario passt (nur bei deutlicher Wetterabhängigkeit), sonst null */
function scenarioWeather(c: DetailContext): string | null {
  const wt = findScenario(c.scenarioId)?.weather;
  if (!wt) return null;
  const strong = Object.entries(wt).filter(([, f]) => (f ?? 0) >= 2) as [string, number][];
  if (!strong.length) return null;
  return c.rng.weighted(strong, ([, f]) => f)?.[0] ?? null;
}

const DIRS = ['Norden', 'Osten', 'Süden', 'Westen', 'Nordwesten', 'Südwesten', 'Nordosten', 'Südosten'];

const ALL_BUT_MED: KeywordCategory[] = ['brand', 'th', 'vu', 'abc', 'wasser', 'tier', 'pol', 'sonstiges'];
/** wie ALL_BUT_MED, ohne Wasser (dort: x_dauer_wasser) */
const SEIT_CATS: KeywordCategory[] = ['brand', 'th', 'vu', 'abc', 'tier', 'pol', 'sonstiges'];
const POL: KeywordCategory[] = ['pol'];
const TIER: KeywordCategory[] = ['tier'];

/** Polizeilage einordnen */
type PolKind = 'schlaegerei' | 'diebstahl' | 'unfallflucht' | 'parken' | 'verkehr' | 'suizid' | 'behoerde' | 'sonst';
function polKind(c: DetailContext): PolKind {
  const what = low(c.facts.what);
  if (isOfficial(c)) return 'behoerde';
  if (/schlägerei|schlaegerei|prügel/.test(what)) return 'schlaegerei';
  if (/diebstahl/.test(what)) return 'diebstahl';
  if (/unfallflucht/.test(what)) return 'unfallflucht';
  if (/zugeparkt|ausfahrt/.test(what)) return 'parken';
  if (/verkehrsbehinderung/.test(what)) return 'verkehr';
  if (/suizid/.test(what)) return 'suizid';
  return 'sonst';
}

/** Tierart grob */
type AnimalKind = 'katze' | 'hund' | 'pferd' | 'kuh' | 'reh' | 'wildschwein' | 'hirsch' | 'schwan' | 'schaf' | 'voegel' | 'sonst';
function animalKind(c: DetailContext): AnimalKind {
  const a = low(c.facts.animal);
  if (/katze/.test(a)) return 'katze';
  if (/hund/.test(a)) return 'hund';
  if (/pferd/.test(a)) return 'pferd';
  if (/kuh|rind/.test(a)) return 'kuh';
  if (/wildschwein/.test(a)) return 'wildschwein';
  if (/hirsch/.test(a)) return 'hirsch';
  if (/\breh/.test(a)) return 'reh';
  if (/schwan|schwäne/.test(a)) return 'schwan';
  if (/schaf/.test(a)) return 'schaf';
  if (/möwe|moewe|ente|vogel|vögel/.test(a)) return 'voegel';
  return 'sonst';
}
/** Tiere sind laut Lage schon tot */
const animalsDead = (c: DetailContext) => /\btot\b|tote|sind schon tot|leblos/.test(`${low(c.facts.situation)} ${low(c.facts.what)}`);

/* ------------------------------------------------------------------ Themen */

/** Allgemeine Fragen (alle Kategorien), Polizei und Tier */
export const GENERAL_TOPICS: DetailTopic[] = [
  {
    id: 'x_seit_wann_lage',
    label: 'Seit wann besteht die Lage',
    categories: SEIT_CATS,
    patterns: [
      p(' seit wann(?!(?: \\w+){0,4} (?:schmerzen|beschwerden|atemnot|luftnot|fieber|krampf\\w*|blutung|uebelkeit) )( \\w+){0,5} '),
      p(' wie lange (geht das|ist das|brennt (es|das)|liegt (es|das|der|die|das tier)|sitzt (es|das|der|die|das tier)) (\\w+ ){0,3}(schon )?'),
      p(' wann (ist|hat) (das|es) (\\w+ ){0,2}(passiert|angefangen|begonnen|losgegangen) '),
      p(' wann haben sie (das|es) (\\w+ ){0,3}(bemerkt|entdeckt|gemerkt|mitbekommen|gesehen) '),
    ],
    examples: ['Seit wann ist das so?', 'wann ist das passiert', 'äh seit wann geht das denn schon', 'Wann haben Sie das bemerkt?', 'wie lange geht das schon so', 'wann haben sie das zum ersten mal gemerkt'],
    generate: (c) => {
      if (/^sh_psnv/.test(c.scenarioId)) return 'psnv';
      // Zeitangabe aus dem Eröffnungssatz übernehmen ("seit gestern", "seit zwei Stunden")
      for (const o of openingsFor(c)) {
        const m = /seit (gestern|heute früh|dem frühen Morgen|Stunden|zwei Stunden|einer Stunde|Tagen)/i.exec(o);
        if (m) return `seit:${m[1]}`;
      }
      if (c.category === 'tier' && animalsDead(c)) return 'gefunden';
      if (c.category === 'sonstiges' && /musik|laut|bellt|lärm/.test(factText(c))) return 'seit:stunden';
      if (c.category === 'pol' && polKind(c) === 'diebstahl') return 'diebstahl';
      if (isOfficial(c)) return c.rng.pick(['min:10', 'min:15', 'min:20']);
      // Akute Lagen: wenige Minuten
      const spreading = c.facts.spreading === true;
      const mins = spreading ? c.rng.pick([5, 10]) : c.rng.pick([1, 2, 5, 5, 10, 15]);
      return `min:${mins}`;
    },
    answer: (v, c) => {
      const s = str(v);
      if (s.startsWith('seit:')) {
        const t = s.slice(5);
        return t.toLowerCase() === 'stunden' ? 'Das geht schon seit Stunden so.' : `Seit ${t} schon.`;
      }
      if (s === 'psnv') return 'Wir sind seit etwa einer halben Stunde hier, die Angehörigen brauchen jetzt dringend Betreuung.';
      if (s === 'gefunden') return 'Wir haben die vor einer halben Stunde gefunden. Wie lange die da schon liegen, weiß ich nicht.';
      if (s === 'diebstahl') return 'Ich hab das Rad heute Morgen abgestellt, gerade eben hab ich gemerkt, dass es weg ist.';
      const n = Number(s.slice(4));
      const t = n <= 1 ? 'gerade eben, vor einer Minute' : n <= 2 ? 'vor ein, zwei Minuten' : `vor ungefähr ${zahl(n)} Minuten`;
      if (isStranger(c) && !isOfficial(c)) return `Ich hab es ${t} bemerkt. Wie lange vorher schon, weiß ich nicht.`;
      return `Das ist ${t} passiert.`;
    },
  },
  {
    id: 'x_standort_anrufer',
    label: 'Wo ist der Anrufer gerade',
    patterns: [
      p(' wo (genau )?(sind|befinden) sie (sich )?(denn )?(selbst |selber )?(gerade|jetzt|grad|im moment|momentan|selbst|selber) '),
      p(' wo (stehen|halten) sie (sich )?(denn )?(gerade|jetzt|grad|im moment|selbst|selber) (auf )?'),
      w('ihr standort|ihren standort|ihrem standort'),
      p(' sind sie (denn )?(noch |jetzt |gerade |selbst )*(vor ort|an der einsatzstelle|an der unfallstelle) '),
    ],
    examples: ['Wo sind Sie gerade?', 'wo befinden sie sich jetzt', 'äh wo stehen sie gerade', 'Was ist Ihr Standort?', 'wo sind sie denn selbst', 'sind sie noch vor ort'],
    generate: (c) => {
      if (isOfficial(c)) return 'dienst';
      const role = effRole(c);
      const loc = c.location;
      const insider = ['bewohner', 'hausmeister', 'betrieb', 'kollege', 'angehoerig', 'pflege'].includes(role);
      if (c.category === 'ktp') return loc === 'klinik' && role === 'pflege' ? 'station' : 'beim_patienten';
      if (c.category === 'rd') return role === 'betroffen' ? 'selbst' : role === 'passant' ? 'daneben' : 'beim_patienten';
      if (c.category === 'pol') {
        const k = polKind(c);
        if (c.facts.weapon === true) return 'abstand';
        if (k === 'suizid') return 'unten';
        if (k === 'parken') return 'einfahrt';
        if (k === 'unfallflucht') return 'eigenes_auto';
        if (k === 'diebstahl') return 'tatort_rad';
        if (role === 'wirt') return 'lokal';
      }
      if (c.category === 'tier' && /baum|birke|ast/.test(low(c.facts.situation))) return 'baum';
      if (c.category === 'wasser' || loc === 'wasser') return 'ufer';
      if (c.category === 'vu') return role === 'beteiligt' ? 'rand_beteiligt' : c.rng.pick(['auto_rand', 'daneben']);
      if (c.category === 'tier' && loc === 'strasse') return role === 'autofahrer' ? 'auto_rand' : 'daneben';
      if (c.category === 'abc') return !isOutdoor(c) && insider ? 'vor_haus' : 'abstand_abc';
      if (c.category === 'sonstiges' && loc === 'wohn') return 'zuhause';
      if ((c.category === 'brand' || c.category === 'th') && !isOutdoor(c)) {
        if (c.category === 'th' && insider && !/gas|einsturz|rauch|co |kohlenmonoxid/.test(factText(c))) return 'im_haus';
        return insider ? 'vor_haus' : c.rng.pick(['vor_gebaeude', 'gegenueber']);
      }
      if (loc === 'land') return c.rng.pick(['weg', 'daneben']);
      return c.rng.pick(['daneben', 'gegenueber']);
    },
    answer: (v, c) =>
      ({
        dienst: 'Ich bin dienstlich hier, bei den Kollegen an der Einsatzstelle.',
        station: 'Ich bin hier bei uns auf der Station.',
        beim_patienten: c.location === 'klinik' ? 'Ich bin hier im Zimmer beim Patienten.' : 'Ich bin direkt beim Patienten.',
        selbst: c.location === 'wohn' ? 'Ich bin bei mir zu Hause, mir geht es ja selbst so schlecht.' : 'Ich bin noch hier, wo es passiert ist, mir geht es ja selbst so schlecht.',
        daneben: 'Ich stehe direkt daneben, ein paar Meter weg.',
        weg: 'Ich stehe am Weg, ein Stück entfernt.',
        vor_haus: `Ich bin raus und stehe jetzt vor dem ${houseWord(c)}.`,
        vor_gebaeude: `Ich stehe vor dem ${houseWord(c)} auf dem Gehweg.`,
        im_haus: 'Ich bin hier im Haus.',
        gegenueber: 'Ich stehe auf der anderen Straßenseite.',
        ufer: 'Ich stehe am Ufer und hab die Stelle im Blick.',
        auto_rand: 'Ich hab am Rand angehalten, ich stehe neben meinem Auto.',
        rand_beteiligt: 'Ich bin ausgestiegen und stehe am Straßenrand.',
        abstand: 'Ich hab mich ein Stück zurückgezogen, ich stehe hinter einem Auto.',
        abstand_abc: 'Ich bin ein gutes Stück weggegangen und stehe jetzt weiter weg.',
        unten: 'Ich stehe unten vor dem Haus und sehe ihn da oben.',
        einfahrt: 'Ich stehe hier an meiner Einfahrt, direkt bei dem Auto.',
        eigenes_auto: 'Ich stehe bei meinem Auto, da wo es angefahren wurde.',
        tatort_rad: 'Ich stehe hier, wo das Rad angeschlossen war.',
        lokal: 'Ich bin in meinem Lokal, an der Tür.',
        baum: 'Ich stehe unten am Baum.',
        zuhause: 'Ich bin bei mir zu Hause, direkt nebenan.',
      })[str(v)] ?? 'Ich bin hier vor Ort.',
  },
  {
    id: 'x_sicherheit',
    label: 'Ist der Anrufer selbst in Sicherheit',
    patterns: [
      p(' (sind|bist) (sie|du) (denn )?(selbst |selber |auch |jetzt )*(in sicherheit|sicher|ausser gefahr|in gefahr|gefaehrdet) '),
      p(' (geht es|gehts) ihnen (selbst |selber )(gut|soweit gut) '),
      p(' (haben|halten) sie (genug|ausreichend) abstand '),
    ],
    examples: ['Sind Sie selbst in Sicherheit?', 'sind sie in gefahr', 'äh sind sie selber sicher', 'Haben Sie genug Abstand?', 'geht es ihnen selbst gut'],
    generate: (c) => {
      if (c.category === 'rd' && effRole(c) === 'betroffen') return 'selbst_patient';
      if (isOfficial(c)) return 'dienst';
      if (c.category === 'pol' && c.facts.weapon === true) return 'abstand_waffe';
      if (c.category === 'brand' || c.category === 'abc') {
        // passend zum Standort des Anrufers
        const st = str(c.get('x_standort_anrufer'));
        return st === 'vor_haus' || st === 'daneben' ? 'draussen' : 'abstand';
      }
      if (c.category === 'vu') return 'rand';
      if (c.category === 'wasser') return 'ufer';
      return 'ja';
    },
    answer: (v) =>
      ({
        selbst_patient: 'Mir geht es ja nicht gut, deshalb rufe ich ja an!',
        dienst: 'Ja, wir sind außerhalb des Gefahrenbereichs.',
        abstand_waffe: 'Ja, ich bin weit genug weg, die sehen mich nicht.',
        draussen: 'Ja, ich bin draußen, mir ist nichts passiert.',
        abstand: 'Ja, ich bin ein gutes Stück weg, ich hab Abstand.',
        rand: 'Ja, ich stehe am Rand, weg von der Fahrbahn.',
        ufer: 'Ja, ich stehe am Ufer, ich bin nicht reingegangen.',
        ja: 'Ja, mir geht es gut, ich bin in Sicherheit.',
      })[str(v)] ?? 'Ja, ich bin in Sicherheit.',
  },
  {
    id: 'x_rolle',
    label: 'Wer ist der Anrufer / Verhältnis zum Geschehen',
    patterns: [
      p(' wer sind sie (denn )?(eigentlich |ueberhaupt |genau )?'),
      p(' (in welchem|welches) verhaeltnis '),
      p(' (in welcher beziehung|wie) stehen sie zu '),
      p(' (sind sie) (ein |eine |der |die )?(angehoerige[rn]?|nachbar\\w*|passant\\w*|bewohner\\w*|verwandt\\w*|familienangehoerig\\w*) '),
      p(' (kennen sie|woher kennen sie) (die|den|das) (person|patienten|patientin|betroffenen|leute|bewohner|mann|frau) '),
      p(' (gehoeren|wohnen) sie (\\w+ )?(dazu|da|dort) '),
    ],
    examples: ['Wer sind Sie?', 'in welchem verhältnis stehen sie zu der person', 'sind sie angehörige', 'äh kennen sie die person', 'wer sind sie denn eigentlich'],
    generate: (c) => (isOfficial(c) ? 'dienst' : effRole(c)),
    answer: (v, c) => {
      const k = polKind(c);
      return (
        {
          dienst: 'Ich rufe dienstlich an, wir sind hier im Einsatz.',
          passant: 'Ich bin nur zufällig vorbeigekommen, ich kenne hier niemanden.',
          nachbar: 'Ich wohne nebenan, ich bin der Nachbar.',
          bewohner: 'Ich wohne hier im Haus.',
          angehoerig: 'Ich gehöre zur Familie.',
          betroffen: 'Es geht um mich selbst.',
          kollege: c.location === 'wohn' ? 'Ich bin ein Arbeitskollege, ich war gerade zu Besuch.' : 'Wir arbeiten zusammen, ich bin ein Kollege.',
          pflege: c.location === 'klinik' ? 'Ich rufe von der Station an, ich betreue den Patienten.' : 'Ich bin vom Pflegedienst, ich betreue den Patienten.',
          zeuge: 'Ich habe das nur gesehen, ich hab mit denen nichts zu tun.',
          beteiligt: 'Ich war selbst an dem Unfall beteiligt.',
          ersthelfer: 'Ich bin nur angehalten, um zu helfen.',
          betrieb: 'Ich arbeite hier im Betrieb.',
          fahrer: c.location === 'gewerbe' ? 'Ich bin Fahrer, ich war hier gerade zum Abladen.' : 'Ich bin der Fahrer, ich hab hier angehalten.',
          autofahrer: 'Ich bin hier mit dem Auto vorbeigekommen.',
          spaziergaenger: 'Ich war hier nur spazieren.',
          badegast: 'Ich bin hier zum Baden, ich kenne die Person nicht.',
          angler: 'Ich sitze hier zum Angeln, ich kenne die Leute nicht.',
          tierhalter: 'Das Tier gehört zu uns.',
          wirt: 'Mir gehört die Kneipe hier.',
          anwohner: c.location === 'wohn' || c.location === 'strasse' ? 'Ich wohne hier in der Straße.' : 'Ich wohne hier in der Nähe.',
          hausmeister: 'Ich bin der Hausmeister hier.',
          geschaedigt:
            k === 'diebstahl' ? 'Das ist mein Fahrrad, das geklaut wurde.' : k === 'parken' ? 'Das ist meine Einfahrt, ich wohne hier.' : 'Das ist mein Auto, das angefahren wurde.',
          weitere: 'Ich hab das nur mitbekommen und wollte sichergehen, dass Sie Bescheid wissen.',
        } as Record<string, string>
      )[str(v)] ?? 'Ich habe das nur gesehen und rufe deshalb an.';
    },
  },
  {
    id: 'x_wetter',
    label: 'Wetter am Einsatzort',
    categories: ['brand', 'th', 'rd', 'ktp', 'abc', 'wasser', 'tier', 'pol', 'sonstiges'],
    patterns: [
      w('wetter|wetterlage|das wetter'),
      p(' (regnet|schneit|hagelt|gewittert|stuermt) es '),
      p(' wie (ist|sieht) (es )?(das )?wetter '),
      p(' (ist es|ist das|ist die strasse|sind die strassen|ist der boden) (da |dort |draussen |bei ihnen )?(sehr )?(glatt|rutschig|vereist|glatteis) '),
    ],
    examples: ['Wie ist das Wetter bei Ihnen?', 'regnet es da gerade', 'äh wie ist so das wetter', 'Schneit es bei Ihnen?', 'wie sieht das wetter aus', 'ist es da glatt'],
    generate: (c) => scenarioWeather(c) ?? 'normal',
    answer: (v) =>
      ({
        gewitter: 'Es gewittert ziemlich heftig, Sturm und Regen.',
        regen: 'Es regnet ordentlich.',
        schnee: 'Es schneit, alles ist glatt.',
        hitze: 'Brütend heiß, alles knochentrocken.',
        nebel: 'Ziemlich neblig, man sieht nicht weit.',
        klar: 'Trocken und klar.',
        bewoelkt: 'Bewölkt, aber trocken.',
      })[str(v)] ?? 'Das Wetter ist hier nicht das Problem, nichts Besonderes.',
  },
  {
    id: 'x_wind_lage',
    label: 'Wind am Einsatzort',
    categories: ['brand', 'th', 'rd', 'ktp', 'wasser', 'tier', 'pol', 'sonstiges'],
    patterns: [
      p(' (aus )?welche[rnm]? richtung (\\w+ ){0,2}(kommt|weht|blaest) (\\w+ ){0,2}(der )?wind '),
      p(' woher (kommt|weht) (\\w+ ){0,2}(der )?wind '),
      w('windrichtung|wind|windig|stuermisch'),
    ],
    examples: ['Ist es windig?', 'aus welcher richtung kommt der wind', 'äh weht da viel wind', 'Wie stark ist der Wind?', 'ist es stürmisch', 'woher kommt der wind'],
    generate: (c) => {
      // gleiche Wetterlage wie bei der Frage nach dem Wetter
      const wt = str(c.get('x_wetter'));
      const dir = c.rng.pick(DIRS);
      if (wt === 'gewitter') return `sturm:${dir}`;
      return `${c.rng.pick(['still', 'leicht', 'leicht', 'frisch'])}:${dir}`;
    },
    answer: (v) => {
      const [k, dir] = str(v).split(':');
      if (k === 'still') return 'Kaum Wind, es ist fast windstill.';
      if (k === 'sturm') return `Sehr stürmisch, der Wind kommt aus ${dir}, es reißt einem fast die Jacke weg.`;
      if (k === 'frisch') return `Ziemlich frischer Wind, ich glaube aus ${dir}.`;
      return `Ein leichter Wind, so aus ${dir}.`;
    },
  },
  {
    id: 'x_zeugen',
    label: 'Weitere Personen/Zeugen vor Ort',
    categories: ALL_BUT_MED,
    patterns: [
      w('zeugen|augenzeugen|augenzeuge|schaulustige|gaffer'),
      p(' (sind|ist) (da |dort |sonst |ausser ihnen |bei ihnen |noch )*(andere|weitere|mehr) (leute|menschen|personen|passanten|helfer) (\\w+ )?(vor ort|da|dort|bei ihnen|in der naehe) '),
      p(' (sind|ist) sie (da |dort )?(ganz )?(allein|alleine) '),
      p(' (hat|haben) (das |es )?(noch )?(sonst )?(jemand|wer|irgendwer|irgendjemand|andere)( anderes?)? (das |es |was )?(\\w+ )?(gesehen|beobachtet|mitbekommen) '),
    ],
    examples: ['Gibt es Zeugen?', 'sind da noch andere leute vor ort', 'Sind Sie alleine?', 'äh sind noch weitere personen da', 'haben das augenzeugen mitbekommen', 'hat das sonst jemand gesehen'],
    generate: (c) => {
      if (isOfficial(c)) return 'dienst';
      const t = factText(c);
      if (c.category === 'pol' && /niemand|nur ich|ich alleine/.test(low(c.facts.persons))) return 0;
      if (c.category === 'pol' && polKind(c) === 'schlaegerei') return c.rng.int(5, 15);
      if (/(\d+) (reisende|schüler|beschäftigte)/.test(t)) return 'viele';
      if (['oeffentlich', 'strasse'].includes(c.location)) return c.rng.int(1, 6);
      if (c.location === 'land') return c.rng.int(0, 1);
      return c.rng.int(0, 3);
    },
    answer: (v, c) => {
      if (v === 'dienst') return 'Ja, wir sind mehrere Kollegen hier vor Ort.';
      if (v === 'viele') return 'Ja, hier sind jede Menge Leute.';
      const n = num(v);
      if (n <= 0) return c.category === 'vu' || (c.category === 'pol' && polKind(c) === 'verkehr') ? 'Außer den Beteiligten ist hier sonst keiner.' : 'Nein, sonst ist hier keiner, nur ich.';
      if (n === 1) return 'Ja, noch eine Person ist hier bei mir.';
      if (n >= 8) return 'Hier stehen ganz viele Leute rum und gucken.';
      return `Ja, hier sind noch ${zahl(n)} andere Leute.`;
    },
  },
  {
    id: 'x_kraefte_da',
    label: 'Sind schon Einsatzkräfte vor Ort',
    patterns: [
      p(' (ist|sind) (die |der )?(polizei|feuerwehr|rettungsdienst|krankenwagen|rettungswagen|notarzt|kollegen|einsatzkraefte) (\\w+ ){0,2}(schon|bereits) (da|vor ort|eingetroffen|dort) '),
      p(' (ist|sind) (denn )?(schon|bereits) (die |der |ein |eine |jemand von der )?(polizei|feuerwehr|rettungsdienst|krankenwagen|rettungswagen|notarzt|kollegen|einsatzkraefte) (da|vor ort|eingetroffen|dort) '),
      p(' (ist|war) (schon|bereits) (jemand|irgendjemand) (von der polizei|von der feuerwehr|vom rettungsdienst) (da|vor ort) '),
    ],
    examples: ['Ist die Polizei schon da?', 'ist schon die feuerwehr vor ort', 'äh sind die einsatzkräfte schon da', 'Ist der Rettungsdienst bereits vor Ort?', 'ist schon jemand von der polizei da'],
    generate: (c) => {
      if (isOfficial(c)) return /psnv/.test(c.scenarioId) ? 'rd_da' : 'polizei_da';
      if ((c.category === 'pol' || c.category === 'vu') && c.rng.chance(0.15)) return 'polizei_unterwegs';
      return 'niemand';
    },
    answer: (v) =>
      ({
        rd_da: 'Der Rettungsdienst ist hier, sonst noch niemand.',
        polizei_da: 'Die Polizei ist vor Ort, ja, Feuerwehr und Rettungsdienst noch nicht.',
        polizei_unterwegs: 'Nein, noch niemand. Jemand anderes hat wohl auch die Polizei angerufen.',
      })[str(v)] ?? 'Nein, hier ist noch niemand.',
  },
  {
    id: 'x_einweisen',
    label: 'Kann jemand die Kräfte einweisen',
    patterns: [
      w('einweisen|einweist|eingewiesen|lotsen|einwinken'),
      p(' (kann|koennte) (jemand|einer|wer) (\\w+ ){0,3}(an die strasse|nach vorne|an der strasse|an der einfahrt|am eingang|an der ecke) (\\w+ ){0,2}(warten|stehen|kommen|gehen) '),
      p(' (kann|koennte) (jemand|einer|wer) (die|den) (feuerwehr|rettungsdienst|rettungswagen|kollegen|einsatzkraefte|polizei) (\\w+ ){0,2}(empfangen|abholen|winken) '),
    ],
    examples: ['Kann jemand die Kräfte einweisen?', 'kann jemand an die straße gehen und winken', 'äh kann einer die kollegen empfangen', 'Könnte jemand die Feuerwehr unten abholen?', 'kann uns jemand einweisen'],
    generate: (c) => {
      if (isOfficial(c)) return 'kollege';
      const role = effRole(c);
      if (c.category === 'rd' && role === 'betroffen') return 'nein';
      if (c.location === 'klinik' && (c.category === 'ktp' || c.category === 'rd')) return 'pforte';
      if (c.category === 'ktp') return 'ich';
      if (c.category === 'rd' && role !== 'passant' && c.location === 'wohn' && (c.facts.conscious === false || low(c.facts.breathing) === 'nein')) return 'tuer_auf';
      if (c.category === 'pol' && c.facts.weapon === true) return 'abstand';
      const others = c.category === 'rd' ? 0 : num(c.get('x_zeugen'));
      if (others > 0 && c.rng.chance(0.5)) return 'jemand';
      // am Wasser die Stelle nicht aus den Augen lassen
      if (c.category === 'wasser') return 'beobachten';
      return 'ich';
    },
    answer: (v, c) =>
      ({
        kollege: 'Ja, ein Kollege steht vorne an der Zufahrt und weist ein.',
        nein: `Ich kann nicht aufstehen, das schaffe ich nicht.${c.location === 'wohn' ? ' Die Tür ist aber nur angelehnt.' : ''}`,
        tuer_auf: 'Ich kann hier nicht weg, ich bleibe beim Patienten. Die Haustür mache ich aber auf und das Licht an.',
        pforte: 'Die Kollegen sollen sich an der Pforte melden, dann holen wir sie dort ab.',
        abstand: 'Ich stelle mich vorne an die Ecke, aber näher geh ich da nicht ran.',
        jemand: 'Ja, ich schick jemanden vor, der winkt dann.',
        beobachten: 'Ich kann hier nicht weg, sonst verliere ich die Stelle aus den Augen. Die sollen einfach direkt zum Ufer kommen.',
      })[str(v)] ?? 'Ja, das mache ich, ich warte vorne und winke.',
  },
  {
    id: 'x_orientierung',
    label: 'Orientierungspunkt / Wegbeschreibung',
    patterns: [
      w('orientierungspunkt|orientierungspunkte|markanten punkt|anhaltspunkt|wegbeschreibung|auffaelliges'),
      p(' woran (erkennen|finden) (wir|die kollegen|die einsatzkraefte) '),
      p(' woran (erkennt|findet) man '),
      p(' wie (finden|kommen) (wir|die kollegen|die einsatzkraefte|man) (da |dort |am besten )*hin '),
      p(' (was|gibt es) (ist )?(da |dort )?(etwas |was )?(auffaelliges |markantes )?in der naehe '),
    ],
    examples: ['Gibt es einen Orientierungspunkt?', 'woran erkennen wir die stelle', 'äh wie finden wir da am besten hin', 'Was ist da in der Nähe?', 'gibt es da was auffälliges'],
    generate: (c) => {
      const opts: Record<string, string[]> = {
        wohn: ['ein gelbes Haus mit grünen Fensterläden', 'eine große Hecke vorne am Grundstück', 'die Bushaltestelle direkt vor dem Haus', 'ein Spielplatz gegenüber'],
        strasse: ['eine Bushaltestelle', 'eine Tankstelle ein Stück weiter', 'eine Ampel', 'ein großes Werbeschild'],
        land: ['ein Hochsitz am Feldrand', 'ein Strommast', 'eine große alte Eiche', 'ein Funkmast'],
        gewerbe: ['ein großes Firmenschild an der Einfahrt', 'ein blaues Hallentor', 'ein Schornstein'],
        wasser: ['ein Bootssteg', 'eine Bank am Ufer', 'ein Parkplatz am Weg zum Wasser'],
        oeffentlich: ['der Parkplatz vorne', 'ein Brunnen', 'die Haltestelle direkt davor'],
        klinik: ['der Haupteingang mit dem Vordach', 'die Liegendanfahrt hinten'],
      };
      return c.rng.pick(opts[c.location] ?? opts.wohn);
    },
    answer: (v, c) => {
      const d = str(c.facts._detail);
      return d ? `${d.charAt(0).toUpperCase()}${d.slice(1).replace(/[.!]$/, '')}. Da ist ${str(v)}, daran erkennen Sie es.` : `Da ist ${str(v)}, daran erkennen Sie es.`;
    },
  },
  {
    id: 'x_hund_gefahr',
    label: 'Gefährlicher Hund vor Ort',
    categories: ['brand', 'th', 'vu', 'rd', 'ktp', 'abc', 'wasser', 'pol', 'sonstiges'],
    patterns: [
      p(' (gefaehrliche[rn]?|bissige[rn]?|freilaufende[rn]?|scharfe[rn]?|aggressive[rn]?) (hund|hunde|tiere?) '),
      p(' (laeuft|laufen) (da |dort )?(ein |irgendwelche )?(hund|hunde) (\\w+ )?(frei|herum|rum) '),
      p(' (ist|sind) (der|die) (hund|hunde) (\\w+ )?(angeleint|weggesperrt|eingesperrt) '),
    ],
    examples: ['Ist da ein gefährlicher Hund?', 'gibt es bissige hunde', 'äh läuft da ein hund frei rum', 'Ist der Hund weggesperrt?', 'gibt es da aggressive tiere'],
    generate: (c) => {
      if (/hund/.test(factText(c)) && /bellt/.test(factText(c))) return 'nachbar_hund';
      if ((c.building?.kind === 'efh' || c.building?.kind === 'rh') && c.rng.chance(0.15)) return 'hund_drin';
      if (c.location === 'land' && c.rng.chance(0.1)) return 'hofhund';
      return 'nein';
    },
    answer: (v, c) => {
      const own = ['bewohner', 'angehoerig', 'betroffen'].includes(effRole(c));
      return (
        {
          nachbar_hund: 'Der Hund vom Nachbarn ist im Haus, raus kommt der nicht.',
          hund_drin: own ? 'Wir haben einen Hund, der ist aber ganz lieb. Ich halte ihn fest.' : 'Die haben einen Schäferhund, der ist aber im Zwinger hinten im Garten.',
          hofhund: 'Auf dem Hof gibt es einen Hofhund, der ist angekettet.',
        } as Record<string, string>
      )[str(v)] ?? 'Nein, ich sehe hier keinen Hund.';
    },
  },
  {
    id: 'x_licht',
    label: 'Beleuchtung am Einsatzort',
    patterns: [
      w('beleuchtet|beleuchtung|strassenbeleuchtung|laterne|laternen|stockdunkel'),
      p(' (ist es|ist das) (da |dort |bei ihnen )?(sehr )?(hell|dunkel) '),
      p(' (gibt es|ist) (da |dort )?(irgendwo )?(licht|lampen) '),
    ],
    examples: ['Ist es da beleuchtet?', 'ist es dort dunkel', 'äh gibt es da eine laterne', 'Wie ist die Beleuchtung?', 'ist es bei ihnen hell'],
    applies: (c) => isOutdoor(c),
    generate: (c) => {
      if (c.location === 'land' || c.location === 'wasser') return c.rng.chance(0.8) ? 'keine' : 'wenig';
      if (c.location === 'strasse') return c.rng.pick(['laterne', 'laterne', 'wenig', 'keine']);
      return c.rng.pick(['laterne', 'laterne', 'wenig']);
    },
    answer: (v) =>
      ({
        keine: 'Hier gibt es überhaupt keine Beleuchtung. Wenn es dunkel ist, sieht man nichts, ich leuchte dann mit dem Handy.',
        wenig: 'Nur eine Laterne ein Stück weiter, ziemlich schummrig.',
        laterne: 'Ja, da sind Straßenlaternen, das ist gut beleuchtet.',
      })[str(v)] ?? 'Ein bisschen Licht ist hier schon.',
    unknown: (c) => (isResidential(c) ? 'Am Haus ist Licht, das finden Sie schon.' : 'Das Gebäude ist beleuchtet, das finden Sie schon.'),
  },
  {
    id: 'x_akku',
    label: 'Akkustand des Anrufer-Handys',
    patterns: [
      w('akku|akkustand|handyakku|ladestand'),
      p(' (ist|wie ist) ihr (handy|telefon) (\\w+ )?(geladen|voll|leer) '),
      p(' wie ?viel (\\w+ )?(akku|prozent akku|akkuladung) '),
    ],
    examples: ['Wie voll ist Ihr Akku?', 'haben sie noch genug akku', 'äh wie ist der akkustand', 'Ist Ihr Handy geladen?', 'wie viel akku haben sie noch'],
    generate: (c) => ((c.category === 'ktp' && effRole(c) === 'pflege') || isOfficial(c) ? 'festnetz' : c.rng.pick([15, 30, 45, 60, 75, 90])),
    answer: (v) => {
      if (v === 'festnetz') return 'Ich rufe vom Dienstapparat an, das ist kein Problem.';
      const n = num(v);
      if (n <= 20) return `Nicht mehr viel, so ${n} Prozent.`;
      return `Der Akku ist noch bei ungefähr ${n} Prozent.`;
    },
  },
  {
    id: 'x_bleiben',
    label: 'Kann der Anrufer vor Ort bleiben',
    patterns: [
      p(' (koennen|koennten) sie (\\w+ ){0,2}(vor ort|da|dort|in der naehe) (\\w+ )?bleiben '),
      p(' (bleiben|warten) sie (\\w+ )?(vor ort|da|dort) bis (wir|die kollegen|die einsatzkraefte|die polizei|jemand) (\\w+ )?(da|kommen|eintreffen) (ist|sind)? ?'),
      p(' (koennen|koennten) sie (\\w+ ){0,2}(dort |da |vor ort )?warten bis '),
    ],
    examples: ['Können Sie vor Ort bleiben?', 'können sie da bleiben bis die kollegen da sind', 'äh könnten sie noch in der nähe bleiben', 'Könnten Sie bitte dort bleiben?', 'können sie warten bis die polizei kommt'],
    generate: (c) => {
      if (isOfficial(c)) return 'ja_dienst';
      const role = effRole(c);
      if (c.category === 'rd' && role === 'betroffen') return 'selbst';
      // nur wenn niemand verletzt/eingeschlossen ist, hat ein Passant es eilig
      const harmless = c.category !== 'rd' && num(c.facts.injured) === 0 && c.facts.trapped !== true;
      if (harmless && ['passant', 'fahrer', 'autofahrer', 'weitere'].includes(role) && c.rng.chance(0.3)) return 'kurz';
      return 'ja';
    },
    answer: (v) =>
      ({
        ja_dienst: 'Natürlich, wir bleiben hier.',
        selbst: 'Ich kann ja eh nicht weg.',
        kurz: 'Ein paar Minuten geht, ich hab aber einen Termin.',
      })[str(v)] ?? 'Ja, ich bleibe hier, bis jemand kommt.',
  },

  /* ---------------------------------------------------------------- Polizei */
  {
    id: 'x_taeter',
    label: 'Täter-/Personenbeschreibung',
    categories: POL,
    patterns: [
      w('taeterbeschreibung|personenbeschreibung|signalement'),
      p(' wer (ist|war|sind|waren) (der|die) (taeter|tatverdaechtige|verdaechtige)\\w* '),
      p(' wie (sah|sahen|sieht|sehen) (er|der|die|der mann|die person|der typ|der kerl|die typen|die maenner|der taeter|die taeter) (\\w+ )?aus '),
      p(' (koennen|koennten) sie (ihn|sie|den (taeter|mann|typ|kerl|verdaechtigen|tatverdaechtigen)|die (taeter|person|frau|maenner|typen|leute|verdaechtigen|tatverdaechtigen)) (\\w+ ){0,2}beschreiben '),
      p(' (wie|was) (hat|hatte|trug|traegt) (er|der|die) ((taeter|typ|kerl|mann) )?(\\w+ )?(an|getragen) '),
    ],
    examples: ['Können Sie den Täter beschreiben?', 'wie sah der typ aus', 'äh gibt es eine täterbeschreibung', 'Wer ist der Täter?', 'können sie ihn mal beschreiben', 'was hatte der täter an'],
    generate: (c) => {
      const k = polKind(c);
      if (k === 'behoerde') return 'behoerde';
      if (k === 'diebstahl') return 'nicht_gesehen';
      if (k === 'unfallflucht') return 'fahrer_kaum';
      if (k === 'parken') return 'parken';
      if (k === 'verkehr') return 'kein';
      const age = c.rng.pick(['zwanzig', 'dreißig', 'vierzig', 'fünfzig']);
      const top = c.rng.pick(['einer schwarzen Kapuzenjacke', 'einer hellen Jeansjacke', 'einer roten Trainingsjacke', 'einer dunklen Lederjacke', 'einem grauen Pullover']);
      const hair = c.rng.pick(['hat eine Glatze', 'hat kurze dunkle Haare', 'hat blonde Haare', 'trägt eine Mütze']);
      const size = c.rng.pick(['groß und kräftig', 'eher klein', 'schlank, normal groß']);
      return `b:${k}|${age}|${top}|${hair}|${size}`;
    },
    answer: (v, c) => {
      const s = str(v);
      if (s === 'behoerde') return 'Die Personalien hat die Polizei, dazu kann ich am Telefon nichts sagen.';
      if (s === 'nicht_gesehen') return 'Den habe ich gar nicht gesehen, der war schon weg.';
      if (s === 'fahrer_kaum') return 'Den Fahrer hab ich nicht richtig gesehen, das ging alles viel zu schnell.';
      if (s === 'parken') return 'Den Fahrer hab ich nicht gesehen, das Auto steht hier einfach rum.';
      if (s === 'kein') return 'Einen Täter gibt es hier nicht, das Auto ist einfach liegen geblieben.';
      const [head, age, top, hair, size] = s.split('|');
      const k = head.slice(2);
      const clothes = top;
      if (k === 'suizid') return `Einen Täter gibt es nicht. Der Mann da oben ist so um die ${age}, ${size}, ${hair}, mit ${clothes}.`;
      const many = /mehrere|männer|fünf|sechs|leute/.test(low(c.facts.persons));
      return `${many ? 'Der Schlimmste von denen' : 'Er'} ist so um die ${age}, ${size}, ${hair}, mit ${clothes}.`;
    },
  },
  {
    id: 'x_fluchtrichtung',
    label: 'Fluchtrichtung',
    categories: POL,
    patterns: [
      w('fluchtrichtung|geflohen|gefluechtet|abgehauen|weggelaufen|weggerannt|entkommen|davongelaufen'),
      p(' wohin (ist|sind) (er|sie|der|die|der taeter|die taeter|die typen) (\\w+ )?(gelaufen|gerannt|gefahren|verschwunden|gegangen) '),
      p(' (ist|sind) (der|die) (taeter|typen|kerle|maenner) (\\w+ )?(weg|abgehauen|geflohen|gefluechtet|weggelaufen|weggerannt|entkommen) '),
      p(' in welche richtung (ist|sind) (\\w+ ){0,2}(gelaufen|gerannt|gefahren|verschwunden|weg|hin|abgehauen) '),
      p(' wo (ist|sind) (er|sie|der|die|der taeter|die taeter|die typen) (\\w+ )?hin '),
    ],
    examples: ['In welche Richtung ist er geflohen?', 'wohin ist der täter gelaufen', 'äh sind die typen schon weg', 'Ist der Täter abgehauen?', 'in welche richtung sind die gerannt'],
    generate: (c) => {
      const k = polKind(c);
      const dir = c.rng.pick(['Richtung Bahnhof', 'Richtung Innenstadt', 'Richtung Hafen', 'Richtung Park', 'in eine Seitenstraße']);
      if (k === 'behoerde') return 'behoerde';
      if (k === 'schlaegerei') return c.rng.chance(0.6) ? 'noch_da' : `teil:${dir}`;
      if (k === 'unfallflucht') return `auto:${dir}`;
      if (k === 'diebstahl') return 'unbekannt';
      if (k === 'suizid') return 'oben';
      if (k === 'parken' || k === 'verkehr') return 'auto_steht';
      return 'kein';
    },
    answer: (v) => {
      const s = str(v);
      if (s === 'behoerde') return 'Der ist nach unserem Kenntnisstand noch im Objekt.';
      if (s === 'noch_da') return 'Die sind noch alle hier und gehen weiter aufeinander los!';
      if (s.startsWith('teil:')) return `Zwei sind weggerannt, ${s.slice(5)}, die anderen sind noch hier.`;
      if (s.startsWith('auto:')) return `Der ist mit dem Auto weg, ${s.slice(5)}.`;
      if (s === 'unbekannt') return 'Keine Ahnung, das hat ja keiner gesehen.';
      if (s === 'oben') return 'Der steht immer noch oben, der ist nicht weg.';
      if (s === 'auto_steht') return 'Abgehauen ist keiner, das Auto steht ja noch hier.';
      return 'Hier ist niemand abgehauen.';
    },
  },
  {
    id: 'x_fluchtfahrzeug',
    label: 'Fluchtfahrzeug / Kennzeichen',
    categories: POL,
    patterns: [
      w('fluchtfahrzeug|fluchtauto|fluchtwagen|kennzeichen|nummernschild|autokennzeichen'),
      p(' (mit )?(was fuer einem|welchem) (auto|fahrzeug|wagen) '),
      p(' was fuer (ein|einen) (auto|fahrzeug|wagen) '),
      p(' welche (farbe|marke) (hat|hatte) (das|der) (auto|fahrzeug|wagen) '),
      p(' (war|ist|sind) (er|sie|der|die|der taeter|die taeter) (mit dem|mit einem|im) (auto|wagen|fahrrad|roller|motorrad) '),
    ],
    examples: ['Gab es ein Fluchtfahrzeug?', 'haben sie das kennzeichen', 'äh mit was für einem auto', 'War der Täter mit einem Auto da?', 'haben sie sich das nummernschild gemerkt'],
    generate: (c) => {
      const k = polKind(c);
      const color = c.rng.pick(['silberner', 'schwarzer', 'weißer', 'dunkelblauer', 'roter']);
      const type = c.rng.pick(['Kombi', 'Kleinwagen', 'Transporter', 'SUV']);
      const plate = `${c.rng.pick(['OH', 'HL', 'PLÖ', 'SE', 'KI'])}-${c.rng.pick(['A', 'K', 'M', 'T'])}${c.rng.pick(['B', 'L', 'R', 'S'])}`;
      if (k === 'behoerde') return 'behoerde';
      if (k === 'unfallflucht') return `flucht:${color} ${type}|${plate}`;
      if (k === 'parken' || k === 'verkehr') return `steht:${color} ${type}|${plate}`;
      if (k === 'schlaegerei') return 'zu_fuss';
      if (k === 'suizid') return 'kein_bezug';
      return 'keins';
    },
    answer: (v) => {
      const s = str(v);
      if (s === 'behoerde') return 'Das liegt der Polizei vor, das kann ich hier nicht sagen.';
      if (s === 'zu_fuss') return 'Nein, die sind alle zu Fuß.';
      if (s === 'kein_bezug') return 'Ein Auto spielt hier keine Rolle.';
      if (s === 'keins') return 'Ein Auto hab ich nicht gesehen.';
      const [kind, rest] = s.split(':');
      const [car, plate] = rest.split('|');
      if (kind === 'flucht') return `Ein ${car}, das Kennzeichen fing mit ${plate} an, den Rest hab ich nicht.`;
      return `Ein ${car}, Kennzeichen ${plate} und dann ein paar Zahlen, die kann ich Ihnen vorlesen.`;
    },
  },
  {
    id: 'x_pol_alkohol',
    label: 'Alkohol im Spiel',
    categories: POL,
    patterns: [w('alkohol|getrunken|betrunken|besoffen|angetrunken|alkoholisiert|drogen|zugedroehnt'), p(' (unter|im) (alkohol|drogen)einfluss ')],
    examples: ['Ist Alkohol im Spiel?', 'sind die betrunken', 'äh haben die was getrunken', 'Sind Drogen im Spiel?'],
    generate: (c) => {
      const k = polKind(c);
      if (k === 'behoerde') return 'behoerde';
      if (k === 'schlaegerei') return 'ja';
      if (k === 'suizid') return c.rng.pick(['unbekannt', 'vielleicht']);
      return 'kein';
    },
    answer: (v, c) =>
      ({
        behoerde: 'Dazu liegen uns keine Erkenntnisse vor.',
        ja: effRole(c) === 'wirt' ? 'Ja, die haben bei mir den ganzen Abend getrunken.' : 'Ja, die sind alle ziemlich betrunken.',
        unbekannt: 'Das kann ich von hier unten nicht beurteilen.',
        vielleicht: 'Kann sein, der wirkt ziemlich durcheinander, aber ich weiß es nicht.',
      })[str(v)] ?? 'Nein, das hat damit nichts zu tun.',
  },

  /* ---------------------------------------------------------------- Tier */
  {
    id: 'x_tier_groesse',
    label: 'Größe des Tiers',
    categories: TIER,
    patterns: [
      p(' wie (gross|schwer) (ist )?(denn )?(das tier|die tiere|der hund|die katze|das pferd|die kuh|das reh|es) '),
      p(' wie ?viel wiegt (das tier|der hund|die katze|das pferd|die kuh|das reh|es) '),
      w('groesse des tieres|groesse des tiers|tiergroesse|gewicht des tieres'),
      p(' (ist|sind) (das|es|die) (ein |eine )?(grosse[rsn]?|kleine[rsn]?|ausgewachsene[rsn]?) (tier|tiere|hund|katze|pferd|kuh|reh) '),
    ],
    examples: ['Wie groß ist das Tier?', 'wie schwer ist es ungefähr', 'äh wie viel wiegt das tier', 'Wie groß ist die Katze?', 'wie groß ist denn das reh', 'ist das ein großes tier'],
    generate: (c) => {
      switch (animalKind(c)) {
        case 'wildschwein':
          return `wildschwein:${c.rng.pick([60, 80, 100])}`;
        case 'hirsch':
          return `hirsch:${c.rng.pick([80, 100, 120])}`;
        case 'katze':
          return `katze:${c.rng.int(3, 6)}`;
        case 'hund':
          return `hund:${c.rng.pick([8, 15, 30, 40])}`;
        case 'pferd':
          return `pferd:${c.rng.pick([450, 500, 550, 600])}`;
        case 'kuh':
          return `kuh:${c.rng.pick([550, 600, 700])}`;
        case 'reh':
          return `reh:${c.rng.int(15, 25)}`;
        case 'schwan':
          return 'schwan';
        case 'schaf':
          return `schaf:${c.rng.pick([50, 60, 70])}`;
        case 'voegel':
          return 'voegel';
        default:
          return 'mittel';
      }
    },
    answer: (v) => {
      const [k, n] = str(v).split(':');
      switch (k) {
        case 'katze':
          return `Eine ganz normale Hauskatze, so ${zahl(Number(n))} Kilo vielleicht.`;
        case 'hund':
          return Number(n) >= 30 ? `Ein großer Hund, bestimmt ${n} Kilo.` : `Eher ein kleinerer Hund, so ${n} Kilo.`;
        case 'pferd':
          return `Ein ausgewachsenes Pferd, das wiegt bestimmt ${n} Kilo.`;
        case 'kuh':
          return `Eine ausgewachsene Kuh, sicher ${n} Kilo.`;
        case 'reh':
          return `Ein normales Reh, so ${n} Kilo schätze ich.`;
        case 'wildschwein':
          return `Ein ziemlich großes Wildschwein, bestimmt ${n} Kilo.`;
        case 'hirsch':
          return `Ein ausgewachsener Hirsch, sicher ${n} Kilo.`;
        case 'schwan':
          return 'Ausgewachsene Schwäne, ziemlich große Vögel.';
        case 'schaf':
          return `Normale Schafe, so ${n} Kilo jedes.`;
        case 'voegel':
          return 'Normale Möwen und Enten, nicht besonders groß.';
        default:
          return 'Mittelgroß, ungefähr wie ein Hund.';
      }
    },
  },
  {
    id: 'x_tier_besitzer',
    label: 'Besitzer des Tiers bekannt',
    categories: TIER,
    patterns: [
      w('besitzer|besitzerin|halter|halterin|tierhalter|tierhalterin|eigentuemer|eigentuemerin'),
      p(' wem gehoer(t|en) (denn )?(das tier|die tiere|der hund|die katze|das pferd|die kuh|die schafe|es) '),
      p(' (ist|sind) (das|es|die) (\\w+ )?(ihr|ihre|ihres) (tier|tiere|katze|hund|pferd|kuh) '),
      p(' gehoer(t|en) (das tier|die tiere|der hund|die katze|das pferd|die kuh|es|die) (denn )?ihnen '),
    ],
    examples: ['Wem gehört das Tier?', 'ist der besitzer bekannt', 'äh wissen sie wer der halter ist', 'Ist das Ihr Tier?', 'wem gehören die tiere', 'gehört das tier ihnen'],
    generate: (c) => {
      const a = animalKind(c);
      if (['reh', 'hirsch', 'wildschwein', 'schwan', 'voegel'].includes(a)) return 'wild';
      if (effRole(c) === 'tierhalter') return 'selbst';
      if (/besitzer ist nirgends|kein besitzer/i.test(openingsFor(c).join(' '))) return 'unbekannt';
      if (a === 'pferd' || a === 'kuh' || a === 'schaf') return c.rng.chance(0.6) ? 'bauer' : 'unbekannt';
      return 'unbekannt';
    },
    answer: (v) =>
      ({
        wild: 'Das ist ein Wildtier, das gehört niemandem.',
        selbst: 'Das ist unser eigenes Tier.',
        bauer: 'Das gehört dem Bauern vom Hof hier gleich nebenan, den erreiche ich aber nicht.',
      })[str(v)] ?? 'Das weiß ich nicht, ein Besitzer ist nirgends zu sehen.',
  },
  {
    id: 'x_tier_verhalten',
    label: 'Ist das Tier aggressiv',
    categories: TIER,
    patterns: [
      w('aggressiv|bissig|beisst|gefaehrlich|scheu|panisch'),
      p(' (beisst|kratzt|tritt) (der|die|das|es)( hund| katze| pferd| kuh| tier| reh)? '),
      p(' (schlaegt|keilt) (es|das pferd|die kuh|das tier) (\\w+ )?aus '),
      p(' (kann|koennte) man (sich )?(dem tier |ihm |ihr |den tieren )?(naehern|nahe kommen|rangehen|anfassen) '),
      p(' wie (verhaelt|benimmt) sich (das tier|der hund|die katze|das pferd|die kuh|das reh|es) '),
      p(' (ist|sind) (das tier|die tiere|der hund|die katze|das pferd|die kuh|das reh|es) (\\w+ )?(ruhig|unruhig|zahm|zutraulich) '),
    ],
    examples: ['Ist das Tier aggressiv?', 'kann man sich dem tier nähern', 'äh wie verhält sich das tier', 'Ist es gefährlich?', 'beißt der', 'ist das tier ruhig', 'beißt der hund'],
    generate: (c) => {
      if (animalsDead(c)) return 'tot';
      switch (animalKind(c)) {
        case 'katze':
          return 'katze';
        case 'pferd':
        case 'kuh':
          return /erschöpft|schwach/.test(low(c.facts.situation)) ? 'grosstier' : 'grosstier_unruhig';
        case 'reh':
        case 'hirsch':
        case 'wildschwein':
          return /tot\b/.test(low(c.facts.situation)) ? 'tot' : 'panisch';
        case 'hund':
          return c.rng.chance(0.4) ? 'knurrt' : 'aengstlich';
        default:
          return 'ruhig';
      }
    },
    answer: (v, c) =>
      ({
        tot: /^(ein|eine) /i.test(str(c.facts.animal)) ? 'Das Tier ist tot, da tut sich nichts mehr.' : 'Die sind tot, da tut sich nichts mehr. Angefasst haben wir nichts.',
        katze: 'Nicht aggressiv, die ist nur total verängstigt und miaut die ganze Zeit.',
        aengstlich: 'Nicht aggressiv, eher ängstlich. Er zittert und zieht den Schwanz ein.',
        grosstier: 'Es ist ziemlich erschöpft, aber wenn es strampelt, würde ich da nicht hingehen.',
        grosstier_unruhig: 'Es ist ziemlich unruhig, da würde ich nicht hingehen, das tritt sonst.',
        panisch: 'Das ist total panisch und zappelt, ich gehe da lieber nicht ran.',
        knurrt: 'Der knurrt, wenn man näherkommt, ich hab Abstand gehalten.',
      })[str(v)] ?? 'Es ist eher ruhig.',
  },
];
