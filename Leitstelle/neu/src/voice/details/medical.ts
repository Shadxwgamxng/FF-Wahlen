import type { FactValue } from '../../data/questions';
import { findScenario } from '../../data/scenarios';
import type { DetailContext, DetailTopic } from './types';
import { p, w } from './types';

/**
 * Rettungsdienst und Krankentransport: Detailfragen zum Patienten.
 * Alle Werte richten sich nach den Szenariofakten (conscious, breathing, symptoms, history, age,
 * mobility, infection, intensive, weight) und nach der Rolle des Anrufers.
 */

// ------------------------------------------------------------------ Hilfen

const RD: DetailTopic['categories'] = ['rd'];
const KTP: DetailTopic['categories'] = ['ktp'];
const RD_KTP: DetailTopic['categories'] = ['rd', 'ktp'];

const str = (v: FactValue | undefined) => (typeof v === 'string' ? v : '');
const lc = (v: FactValue | undefined) => str(v).toLowerCase();
/** Verneinte Angaben entfernen ("kein Fieber", "bisher keine Blutungen", "war nicht bewusstlos") */
const pos = (s: string) => s.replace(/(^|[^a-zäöüß])(kein|keine|keinen|keinem|keiner|nicht|ohne)\s+[a-zäöüß-]+/g, '$1');
const symptoms = (c: DetailContext) => pos(lc(c.facts.symptoms));
const history = (c: DetailContext) => pos(lc(c.facts.history));
/** Fakten-Text des Szenarios (ohne Vorgeschichte) */
const scText = (c: DetailContext) => `${lc(c.facts.what)} ${symptoms(c)} ${(findScenario(c.scenarioId)?.name ?? '').toLowerCase()}`;

/** Mehrere Patienten (MANV, Festival …): personenbezogene Fragen lassen sich nicht beantworten */
function isMulti(c: DetailContext): boolean {
  const inj = c.facts.injured;
  if (typeof inj === 'number' && inj >= 2) return true;
  return typeof c.facts.age === 'string' && /alle|überwiegend|viele|mehrere/i.test(c.facts.age);
}

/** Alter in Jahren (0 = Neugeborenes), null wenn unbekannt */
function ageOf(c: DetailContext): number | null {
  const a = c.facts.age;
  if (typeof a === 'number') return a;
  if (typeof a === 'string') {
    if (/früh|neugeboren|abgenabelt|säugling/i.test(a)) return 0;
    const m = /(\d+)\s*jahr/i.exec(a);
    if (m) return Number(m[1]);
  }
  if (c.category === 'ktp') {
    const v = c.get('x_patientenalter');
    if (typeof v === 'number') return v;
  }
  return null;
}

const isPassant = (c: DetailContext) => /^passant/i.test(c.relation);
const isKollege = (c: DetailContext) => /^kolleg/i.test(c.relation);
const isClinic = (c: DetailContext) => /^(pflegekraft|station)/i.test(c.relation);
/** Anruf aus Klinik/Pflegeeinrichtung: Fachpersonal am Patienten */
const atClinic = (c: DetailContext) => c.location === 'klinik' || isClinic(c);
/** Der Anrufer ist selbst der Patient (nur wenn das zur Lage passt) */
function isSelf(c: DetailContext): boolean {
  if (!/^betroffen/i.test(c.relation) || c.category !== 'rd') return false;
  if (c.facts.conscious === false || c.facts.breathing === 'nein' || isMulti(c)) return false;
  const a = ageOf(c);
  return a === null || a >= 12;
}

interface Pron {
  er: string;
  Er: string;
  ihm: string;
  ihn: string;
  sein: string;
  Patient: string;
}
function pr(c: DetailContext): Pron {
  const f = c.get('x_geschlecht') === 'w';
  const a = ageOf(c);
  const kind = a !== null && a < 14;
  return {
    er: f ? 'sie' : 'er',
    Er: f ? 'Sie' : 'Er',
    ihm: f ? 'ihr' : 'ihm',
    ihn: f ? 'sie' : 'ihn',
    sein: f ? 'ihr' : 'sein',
    Patient: kind ? 'Das Kind' : f ? 'Die Patientin' : 'Der Patient',
  };
}

const MULTI_UNKNOWN = 'Das sind so viele Verletzte, das kann ich nicht für jeden Einzelnen sagen.';
const PASSANT_UNKNOWN = 'Das weiß ich nicht, ich kenne die Person nicht – ich bin nur zufällig vorbeigekommen.';

const MALE = /\b(mann|vater|sohn|bruder|opa|großvater|lebensgefährte|kollege|jugendlicher|landwirt|herr|junge|ehemann|fahrer)\b/;
const FEMALE = /\b(frau|mutter|tochter|schwester|oma|großmutter|freundin|patientin|dame|mädchen|ehefrau|lebensgefährtin|mama)\b/;

function genderHint(text: string, pronouns = ''): 'm' | 'w' | null {
  const m = MALE.test(text) || /\b(er (ist|kann|hat|wird|muss|liegt|soll)|ihn)\b/.test(pronouns);
  const f = FEMALE.test(text) || /\bsie (ist|kann|hat|wird|muss|liegt|soll)\b/.test(pronouns);
  return m && !f ? 'm' : f && !m ? 'w' : null;
}

/** Krankentransport: Angaben aus Transportziel, Mobilität und Zeit */
const ktpText = (c: DetailContext) => `${lc(c.facts.what)} ${lc(c.facts.target)} ${lc(c.facts.mobility)} ${lc(c.facts.when)}`;

const NAMES_M_OLD = ['Klaus', 'Jürgen', 'Hans-Werner', 'Uwe', 'Peter', 'Manfred', 'Dieter', 'Horst', 'Rolf', 'Günter'];
const NAMES_W_OLD = ['Ingrid', 'Helga', 'Karin', 'Monika', 'Renate', 'Gisela', 'Brigitte', 'Ursula', 'Elke', 'Heike'];
const NAMES_M_YOUNG = ['Jan', 'Finn', 'Lukas', 'Tim', 'Niklas', 'Jonas', 'Paul', 'Ben', 'Malte', 'Ole'];
const NAMES_W_YOUNG = ['Lea', 'Anna', 'Lena', 'Marie', 'Julia', 'Hannah', 'Sophie', 'Mia', 'Svenja', 'Jana'];
const NAMES_M_MID = ['Thomas', 'Stefan', 'Michael', 'Andreas', 'Frank', 'Sven', 'Holger', 'Kai', 'Torsten', 'Lars'];
const NAMES_W_MID = ['Sabine', 'Petra', 'Andrea', 'Nicole', 'Kerstin', 'Silke', 'Anja', 'Katrin', 'Tanja', 'Birte'];
const SURNAMES = ['Petersen', 'Hansen', 'Jensen', 'Schröder', 'Möller', 'Lorenzen', 'Carstensen', 'Thomsen', 'Rathje', 'Schulz', 'Brandt', 'Wulf', 'Ehlers', 'Clausen', 'Voß', 'Martens'];
const DOCTORS = ['Dr. Hansen', 'Dr. Albers', 'Dr. Jessen', 'Dr. Behrens', 'Dr. Kock', 'Dr. Stoltenberg', 'Frau Dr. Lüders', 'Frau Dr. Hinrichsen'];
const PRAXIS = ['hier im Ort', 'in der Bahnhofstraße', 'im Ärztehaus am Markt', 'drüben in der Nachbargemeinde'];

const komma = (n: number) => n.toFixed(1).replace('.', ',');

// ------------------------------------------------------------------ Themen

export const MEDICAL_TOPICS: DetailTopic[] = [
  // ---------------------------------------------------------------- Person
  {
    id: 'x_geschlecht',
    label: 'Geschlecht des Patienten',
    categories: RD_KTP,
    patterns: [p(' (ein )?(mann|junge|herr) oder (eine? )?(frau|maedchen|dame) '), p(' (eine )?(frau|maedchen|dame) oder (ein )?(mann|junge|herr) '), w('geschlecht|maennlich oder weiblich|weiblich oder maennlich'), p(' (ist|sind) (er|sie|es|der patient|die patientin|die person|das kind) (maennlich|weiblich) ')],
    examples: ['Ist es ein Mann oder eine Frau?', 'männlich oder weiblich', 'Welches Geschlecht hat der Patient?', 'äh is das ein junge oder ein mädchen', 'so mann oder frau'],
    applies: (c) => !isMulti(c),
    generate: (c) => {
      if (c.scenarioId === 'rd_geburt' || /schwanger|geburt hat|wehen/.test(scText(c))) return 'w';
      const fromFacts = genderHint(`${lc(c.facts.what)} ${symptoms(c)} ${lc(c.facts.target)} ${lc(c.facts.mobility)}`, `${lc(c.facts.target)} ${lc(c.facts.mobility)} ${lc(c.facts.when)}`);
      if (fromFacts) return fromFacts;
      const sc = findScenario(c.scenarioId);
      const hints = [...(sc?.openings ?? []), ...(sc?.variants ?? []).flatMap((v) => v.openings ?? [])].map((o) => genderHint(o.toLowerCase())).filter((h): h is 'm' | 'w' => h !== null);
      if (hints.length && hints.every((h) => h === hints[0])) return hints[0];
      return c.rng.chance(0.5) ? 'm' : 'w';
    },
    answer: (v, c) => {
      const f = v === 'w';
      const a = ageOf(c);
      if (isSelf(c)) return f ? 'Ich bin eine Frau.' : 'Ich bin ein Mann.';
      if (a !== null && a < 1) return f ? 'Ein Mädchen.' : 'Ein Junge.';
      if (a !== null && a < 14) return f ? 'Ein Mädchen.' : 'Ein Junge.';
      if (c.category === 'ktp') return f ? 'Eine Patientin.' : 'Ein Patient.';
      return f ? 'Eine Frau.' : 'Ein Mann.';
    },
    unknown: () => 'Das sind mehrere Verletzte, Männer wie Frauen.',
  },
  {
    id: 'x_patientenalter',
    label: 'Alter des Patienten (Krankentransport)',
    categories: KTP,
    patterns: [p(' wie alt '), w('alter|geburtsdatum|geburtsjahr|jahrgang|geboren'), p(' wann ist (er|sie|es|der patient|die patientin|das kind) geboren ')],
    examples: ['Wie alt ist der Patient?', 'wie alt ist die patientin denn', 'Welches Geburtsdatum hat der Patient?', 'äh wie alt is er so ungefähr', 'Welcher Jahrgang?', 'wann ist die patientin geboren'],
    generate: (c) => {
      if (typeof c.facts.age === 'number') return c.facts.age;
      if (/kind/.test(`${lc(c.facts.what)} ${lc(c.facts.target)}`)) return c.rng.int(2, 12);
      if (/dame|bettlägerig|pflegeheim|palliativ|hospiz/.test(ktpText(c))) return c.rng.int(72, 94);
      if (c.facts.intensive === true) return c.rng.int(38, 82);
      return c.rng.int(56, 94);
    },
    answer: (v, c) => {
      const n = Number(v);
      const f = c.get('x_geschlecht') === 'w';
      if (/^angehörig/i.test(c.relation)) return `${f ? 'Sie' : 'Er'} ist ${n} Jahre alt.`;
      return `${n < 14 ? 'Das Kind' : f ? 'Die Patientin' : 'Der Patient'} ist ${n} Jahre alt.`;
    },
  },
  {
    id: 'x_name',
    label: 'Name des Patienten',
    categories: RD_KTP,
    patterns: [
      p(' wie heisst (denn )?(der|die|das|ihr|ihre) (patient|patientin|betroffene|betroffenen|verletzte|person|mann|frau|junge|maedchen|kind|dame|herr|mutter|vater) '),
      p(' (wie heisst|wie heissen) (denn )?(die )?betroffene person '),
      p(' namen? (des|der|vom|von der) (patienten|patientin|betroffenen|verletzten|person) '),
      p(' (vor|nach)namen? (des|der) (patienten|patientin) '),
      p(' wie (der patient|die patientin|die person|der mann|die frau|das kind|er|sie) heisst '),
    ],
    examples: ['Wie heißt der Patient?', 'wie heisst die patientin', 'Den Namen des Patienten bitte.', 'äh wie heißt denn die betroffene person', 'Wissen Sie den Namen der Patientin?'],
    applies: (c) => !isMulti(c) && !isPassant(c) && !isSelf(c),
    generate: (c) => {
      const f = c.get('x_geschlecht') === 'w';
      const a = ageOf(c);
      const nach = c.rng.pick(SURNAMES);
      if (a === 0) return `Baby ${nach}`;
      const list = a !== null && a < 30 ? (f ? NAMES_W_YOUNG : NAMES_M_YOUNG) : a !== null && a < 60 ? (f ? NAMES_W_MID : NAMES_M_MID) : f ? NAMES_W_OLD : NAMES_M_OLD;
      return `${c.rng.pick(list)} ${nach}`;
    },
    answer: (v, c) => {
      const name = String(v);
      if (name.startsWith('Baby ')) return `Das Kind hat noch keinen Vornamen, der Nachname ist ${name.slice(5)}.`;
      if (isClinic(c)) return `${pr(c).Patient} heißt ${name}.`;
      return `${pr(c).Er} heißt ${name}.`;
    },
    unknown: (c) => (isMulti(c) ? 'Das sind mehrere Verletzte, die Namen kenne ich nicht.' : isSelf(c) ? 'Na, ich bin das doch selbst – um mich geht es!' : 'Keine Ahnung, ich kenne die Person nicht.'),
  },
  {
    id: 'x_gewicht',
    label: 'Gewicht und Statur',
    categories: RD_KTP,
    patterns: [p(' wie ?viel (\\w+ )?wiegt '), p(' wie schwer ist '), w('gewicht|wiegt|statur|uebergewichtig|korpulent|kraeftig gebaut|dick|schlank|koerpergewicht')],
    examples: ['Wie viel wiegt der Patient ungefähr?', 'wie schwer ist er denn so', 'Ist die Person übergewichtig?', 'äh was hat die patientin für eine statur', 'Wissen Sie das Gewicht?'],
    applies: (c) => !isMulti(c),
    generate: (c) => {
      if (typeof c.facts.weight === 'string' && c.facts.weight) return c.facts.weight;
      if (typeof c.facts.weight === 'number') return c.facts.weight;
      const kilo = /(\d+) kilo/.exec(`${ktpText(c)} ${symptoms(c)}`);
      if (kilo) return `Etwa ${kilo[1]} Kilo.`;
      if (/schwergewichtig|stark übergewichtig|adipös/.test(`${ktpText(c)} ${symptoms(c)}`)) return `Etwa ${c.rng.int(16, 23) * 10} Kilo.`;
      const a = ageOf(c);
      if (a === 0) {
        const cap = /unter (\d+) gramm/.exec(`${scText(c)} ${lc(c.facts.age)}`);
        const woche = /(\d+)\.\s*(schwangerschafts)?woche/.exec(lc(c.facts.age));
        const mitte = woche ? Math.min(34, Math.max(6, 34 - (40 - Number(woche[1])) * 2)) : 33;
        let max = mitte + 3;
        if (cap) max = Math.min(max, Math.floor(Number(cap[1]) / 100) - 1);
        const min = Math.max(5, Math.min(mitte - 3, max));
        return `${c.rng.int(min, max) * 100} Gramm`;
      }
      if (a !== null && a < 14) return Math.round(a * 2.6 + 8 + c.rng.int(-2, 3));
      if (a !== null && a < 18) return c.rng.int(48, 72);
      const f = c.get('x_geschlecht') === 'w';
      return f ? c.rng.int(54, 96) : c.rng.int(68, 118);
    },
    answer: (v, c) => {
      const p0 = pr(c);
      if (typeof v === 'string') {
        if (/gramm/i.test(v)) return `Etwa ${v}, ganz winzig.`;
        return `${v.replace(/[.!]$/, '')}, ${isSelf(c) ? 'ich bin' : `${p0.er} ist`} wirklich sehr schwer.`;
      }
      const kg = Number(v);
      const a = ageOf(c);
      const statur = a !== null && a < 14 ? 'ganz normal für das Alter' : kg >= 105 ? 'ziemlich kräftig' : kg < 60 ? 'eher zierlich' : 'normal gebaut';
      if (isSelf(c)) return `Ich wiege so um die ${kg} Kilo.`;
      if (isPassant(c)) return `Schätzungsweise ${kg} Kilo, ${statur}.`;
      return `So um die ${kg} Kilo, ${statur}.`;
    },
    unknown: () => MULTI_UNKNOWN,
  },

  // ---------------------------------------------------------------- Hergang und Verletzungen
  {
    id: 'x_gestuerzt',
    label: 'Gestürzt oder zusammengebrochen',
    categories: RD,
    patterns: [w('gestuerzt|hingestuerzt|abgestuerzt|hingefallen|umgefallen|gefallen|runtergefallen|heruntergefallen|hinuntergefallen|sturz|gestolpert|ausgerutscht|zusammengesackt|zusammengebrochen|umgekippt')],
    examples: ['Ist er gestürzt?', 'ist die person hingefallen', 'Gab es einen Sturz?', 'äh ist sie umgefallen oder hat sie sich hingesetzt', 'Ist er einfach zusammengebrochen?'],
    generate: (c) => {
      const t = scText(c);
      if (/kopfsprung/.test(t)) return 'nein';
      if (/stürz|sturz|gestürzt|gefallen|gerutscht|runtergefallen|vom pferd|vom pony|anhänger|heuboden|tribüne|eingestürzt/.test(t)) return 'ja';
      if (c.facts.conscious === false || /kollab|zusammengesackt|zusammengebrochen|umgekippt|leblos/.test(t)) return 'umgekippt';
      return 'nein';
    },
    answer: (v, c) => {
      const p0 = pr(c);
      if (isMulti(c)) return v === 'ja' ? 'Ja, viele sind gestürzt oder umgerissen worden.' : 'Nein, gestürzt ist da keiner.';
      if (v === 'ja') return isSelf(c) ? 'Ja, ich bin hingefallen.' : `Ja, ${p0.er} ist gestürzt.`;
      if (v === 'umgekippt') return `${p0.Er} ist einfach umgekippt – ob ${p0.er} sich dabei was getan hat, weiß ich nicht.`;
      return isSelf(c) ? 'Nein, hingefallen bin ich nicht.' : `Nein, gestürzt ist ${p0.er} nicht.`;
    },
  },
  {
    id: 'x_kopf',
    label: 'Kopfverletzung',
    categories: RD,
    patterns: [
      p(' (\\w+ ){0,3}(am|den|an den|an dem|mit dem) kopf (\\w+ ){0,2}(verletzt|angeschlagen|angestossen|gestossen|aufgeschlagen|getroffen) '),
      p(' kopf (\\w+ ){0,2}(angeschlagen|angestossen|gestossen|aufgeschlagen) '),
      w('kopfverletzung|kopfverletzungen|platzwunde|platzwunde am kopf|beule|kopfwunde'),
      p(' (wunde|verletzung|blut|beule) (am|an dem) kopf '),
      p(' blutet (er|sie|es|der patient|die patientin|das kind) (am|aus dem) kopf '),
    ],
    examples: ['Hat er sich am Kopf verletzt?', 'hat sie sich den kopf angeschlagen', 'Ist eine Kopfverletzung zu sehen?', 'äh hat der patient ne platzwunde am kopf', 'Hat er eine Beule?'],
    applies: (c) => !isMulti(c),
    generate: (c) => {
      const s = symptoms(c);
      if (/blut aus dem ohr/.test(s)) return 'ohr';
      if (/platzwunde/.test(s)) return 'platzwunde';
      if (/beule|hinterkopf/.test(s)) return 'beule';
      if (/kopfverletzung|kopfwunde|stirn|schädel/.test(s)) return 'beule';
      const st = c.get('x_gestuerzt');
      if (st === 'ja') return c.rng.pick(['nein', 'nein', 'beule']);
      if (st === 'umgekippt') return c.rng.pick(['nein', 'unklar']);
      return 'nein';
    },
    answer: (v, c) => {
      const p0 = pr(c);
      const self = isSelf(c);
      switch (v) {
        case 'ohr':
          return 'Ja, aus dem Ohr kommt Blut!';
        case 'platzwunde':
          return self ? 'Ja, ich hab eine Platzwunde am Kopf.' : `Ja, ${p0.er} hat eine Platzwunde am Kopf.`;
        case 'beule':
          return self ? 'Ich hab eine dicke Beule am Kopf.' : `${p0.Er} hat eine dicke Beule am Kopf.`;
        case 'unklar':
          return 'Kann ich nicht genau sehen, Blut sehe ich am Kopf jedenfalls nicht.';
        default:
          return self ? 'Nein, den Kopf hab ich mir nicht angeschlagen.' : 'Nein, am Kopf sehe ich nichts.';
      }
    },
    unknown: () => MULTI_UNKNOWN,
  },
  {
    id: 'x_blutung',
    label: 'Stärke der Blutung',
    categories: RD,
    patterns: [
      p(' wie (stark|sehr|doll|schlimm|heftig) (blutet|blutung)\\w*( \\w+)? '),
      p(' (spritzt|spritzend|pulsierend|pulsiert) '),
      p(' (die |der |eine )?blutung (\\w+ ){0,3}(stoppen|stillen|gestillt|gestoppt|aufgehoert|steht|auf|unter kontrolle) '),
      p(' (hoert|hat) (die )?blutung (\\w+ ){0,2}auf '),
      p(' wie ?viel blut (\\w+ ){0,3}'),
      p(' blutet (es|er|sie|das|die wunde) (immer )?noch '),
    ],
    examples: ['Wie stark blutet es?', 'spritzt das blut', 'Konnten Sie die Blutung stoppen?', 'äh hört die blutung auf wenn sie draufdrücken', 'Wie viel Blut hat er verloren?'],
    applies: (c) => !isMulti(c),
    generate: (c) => {
      const s = symptoms(c);
      if (/zahnfleisch/.test(s)) return 'zahnfleisch';
      if (/erbrechen mit blut/.test(s)) return 'erbrochen';
      if (/blut aus dem ohr/.test(s)) return 'ohr';
      if (/blutet stark/.test(s)) return 'stark';
      if (/druckverband/.test(s)) return 'verband';
      if (/abgedrückt|tuch/.test(s)) return 'gestillt';
      if (/schnitt|wunde an der hand|aufgerissen|blutet|blutung/.test(s)) return 'maessig';
      const k = c.get('x_kopf');
      if (k === 'platzwunde') return 'platzwunde';
      return 'keine';
    },
    answer: (v, c) => {
      const p0 = pr(c);
      switch (v) {
        case 'stark':
          return 'Es blutet richtig stark, das hört gar nicht auf!';
        case 'gestillt':
          return 'Wir drücken ein Tuch drauf, jetzt blutet es kaum noch.';
        case 'verband':
          return 'Der Druckverband hält, es blutet kaum noch durch.';
        case 'maessig':
          return 'Es blutet schon ordentlich, aber es spritzt nicht.';
        case 'platzwunde':
          return 'Die Platzwunde am Kopf blutet, aber nicht dramatisch.';
        case 'ohr':
          return 'Aus dem Ohr kommt Blut, sonst sehe ich keine Blutung.';
        case 'zahnfleisch':
          return 'Das Zahnfleisch blutet, sonst sehe ich nichts.';
        case 'erbrochen':
          return `${p0.Er} hat Blut erbrochen, sonst blutet nichts.`;
        default:
          return 'Nein, Blut sehe ich keins.';
      }
    },
    unknown: () => MULTI_UNKNOWN,
  },
  {
    id: 'x_hautfarbe',
    label: 'Hautfarbe (blass, bläulich)',
    categories: RD,
    patterns: [
      w('hautfarbe|gesichtsfarbe|blass|bleich|blau|blau angelaufen|blau im gesicht|blaeulich|blaue lippen|lila lippen|grau im gesicht|rot im gesicht'),
      p(' (wie )?sieht (er|sie|es|der patient|die patientin|die person|das kind) (denn |so )?(im gesicht |von der farbe )?aus '),
      p(' farbe (im gesicht|der haut|der lippen) '),
    ],
    examples: ['Wie ist die Hautfarbe?', 'ist er blass', 'Sind die Lippen bläulich?', 'äh wie sieht sie denn im gesicht aus', 'Ist er blau angelaufen?'],
    applies: (c) => !isMulti(c),
    generate: (c) => {
      const s = symptoms(c);
      if (c.facts.breathing === 'nein' || /gesicht (ganz )?blau|blau angelaufen/.test(s)) return 'blau';
      if (/bläulich|sättigung/.test(s)) return 'lippen';
      if (/heiße trockene|fieber|überwärmt/.test(s)) return 'rot';
      if (/kaltschweißig|schwitzig|brust|kollab|kreislauf|schwach|apathisch|blutet stark/.test(s) || c.facts.conscious === false) return 'blass';
      if (c.facts.breathing === 'schwer') return c.rng.pick(['blass', 'lippen']);
      return c.rng.chance(0.7) ? 'normal' : 'leicht';
    },
    answer: (v, c) => {
      const p0 = pr(c);
      const self = isSelf(c);
      switch (v) {
        case 'blau':
          return `${p0.Er} ist ganz blau im Gesicht, die Lippen sind lila!`;
        case 'lippen':
          return self ? 'Meine Lippen sind wohl etwas bläulich.' : 'Die Lippen sind etwas bläulich.';
        case 'blass':
          return self ? 'Ich glaube, ich bin ziemlich blass.' : `${p0.Er} ist kreidebleich.`;
        case 'leicht':
          return self ? 'Vielleicht etwas blass.' : `${p0.Er} ist etwas blass um die Nase.`;
        case 'rot':
          return self ? 'Mir ist total heiß, ich bin bestimmt ganz rot.' : `${p0.Er} ist ganz rot im Gesicht und fühlt sich heiß an.`;
        default:
          return self ? 'Ich glaube, ganz normal.' : 'Eigentlich normal, nicht auffällig blass.';
      }
    },
    unknown: () => MULTI_UNKNOWN,
  },
  {
    id: 'x_schweiss',
    label: 'Kaltschweißig',
    categories: RD,
    patterns: [w('kaltschweissig|schweissig|schwitzt|schwitzen|schweiss|geschwitzt|verschwitzt|nass geschwitzt|kalt und feucht|feuchte haut'), p(' kalte?n? schweiss '), p(' haut (\\w+ ){0,2}(feucht|nass) ')],
    examples: ['Ist er kaltschweißig?', 'schwitzt die patientin', 'Ist die Haut kalt und feucht?', 'äh hat er so kalten schweiss auf der stirn', 'Hat sie geschwitzt?'],
    applies: (c) => !isMulti(c),
    generate: (c) => {
      const s = symptoms(c);
      if (/kaltschweißig|schwitzig|schweiß/.test(s)) return 'ja';
      if (/heiße trockene/.test(s)) return 'trocken';
      if (/fieber/.test(s)) return 'warm';
      const a = ageOf(c);
      if (a !== null && a < 3) return 'nein';
      if (c.get('x_hautfarbe') === 'blass' && c.rng.chance(0.4)) return 'ja';
      return 'nein';
    },
    answer: (v, c) => {
      const p0 = pr(c);
      const self = isSelf(c);
      if (v === 'ja') return self ? 'Ja, ich bin ganz nass geschwitzt, aber mir ist kalt.' : `Ja, ${p0.er} ist ganz nass geschwitzt, die Haut ist kalt.`;
      if (v === 'trocken') return 'Nein, die Haut ist heiß und ganz trocken.';
      if (v === 'warm') return self ? 'Ich schwitze etwas, mir ist heiß.' : `${p0.Er} schwitzt etwas, fühlt sich aber warm an.`;
      return self ? 'Nein, geschwitzt hab ich nicht.' : `Nein, geschwitzt hat ${p0.er} nicht.`;
    },
    unknown: () => MULTI_UNKNOWN,
  },
  {
    id: 'x_ausstrahlung',
    label: 'Ausstrahlung des Schmerzes',
    categories: RD,
    patterns: [p(' (strahlt|strahlen|strahlte) (\\w+ ){0,5}aus '), p(' ausstrahl\\w* '), p(' (wohin|wo hin) (strahlt|strahlen|zieht) (\\w+ ){0,3}'), p(' (strahlt|strahlen) (es|das|der schmerz|die schmerzen) (\\w+ ){0,2}(in|bis) (den|die|das) \\w+ '), p(' zieht (es|das|der schmerz|die schmerzen) (\\w+ ){0,3}(arm|kiefer|ruecken|schulter|hals|bauch) ')],
    examples: ['Strahlt der Schmerz aus?', 'strahlen die schmerzen in den arm aus', 'Zieht es in den linken Arm?', 'äh strahlt das irgendwo hin aus', 'Gibt es eine Ausstrahlung?'],
    applies: (c) => !isMulti(c),
    generate: (c) => {
      const s = symptoms(c);
      if (c.facts.conscious === false) return 'bewusstlos';
      const a = ageOf(c);
      if (a !== null && a <= 3) return 'baby';
      if (/ausstrahlung in den arm|arm kribbelt/.test(s)) return 'arm';
      if (/stechend.*bewegung/.test(s)) return 'bewegung';
      if (/brust|herz/.test(s)) return c.rng.pick(['arm', 'arm', 'kiefer', 'ruecken', 'nein']);
      if (!/schmerz|weh|stech|druck|spannt|sonnenbrand|wunde|schnitt|verbrenn|verbrüh|sturz|bruch|prellung|platzwunde|gelenk|bein|hüfte|arm/.test(`${s} ${scText(c)}`)) return 'keinschmerz';
      return 'lokal';
    },
    answer: (v, c) => {
      const p0 = pr(c);
      const self = isSelf(c);
      switch (v) {
        case 'arm':
          return self ? 'Ja, es zieht bis in meinen linken Arm.' : 'Ja, es zieht bis in den linken Arm.';
        case 'kiefer':
          return 'Ja, es zieht bis hoch in den Kiefer.';
        case 'ruecken':
          return 'Es zieht in den Rücken, zwischen die Schulterblätter.';
        case 'nein':
          return 'Nein, der Schmerz bleibt in der Brust.';
        case 'bewegung':
          return self ? 'Nein, es sticht nur, wenn ich mich bewege.' : `Nein, es sticht nur, wenn ${p0.er} sich bewegt.`;
        case 'bewusstlos':
          return `Das kann ${p0.er} mir nicht sagen, ${p0.er} reagiert ja nicht.`;
        case 'baby':
          return 'Das Kind ist noch so klein, das kann es nicht sagen.';
        case 'keinschmerz':
          return self ? 'Schmerzen hab ich eigentlich keine.' : `Schmerzen hat ${p0.er} eigentlich keine.`;
        default:
          return 'Nein, da strahlt nichts aus.';
      }
    },
    unknown: () => MULTI_UNKNOWN,
  },

  // ---------------------------------------------------------------- Vorgeschichte
  {
    id: 'x_schonmal',
    label: 'Schon einmal passiert',
    categories: RD,
    patterns: [
      p(' (schon )?(mal|einmal|oefter|frueher) (\\w+ ){0,3}(passiert|gehabt|vorgekommen) '),
      p(' (hatte|hat) (er|sie|der patient|die patientin|ihr mann|ihre frau|ihr vater|ihre mutter) das (\\w+ ){0,2}(schon )?(mal|einmal|oefter|frueher) '),
      p(' kennt (er|sie|der patient|die patientin) das (schon|von frueher) '),
      w('das erste mal|zum ersten mal|erstmalig|erstmals'),
      p(' (so ?was|so etwas|sowas) (\\w+ ){0,2}(schon )?(mal|einmal|oefter|frueher) '),
    ],
    examples: ['Ist das schon einmal passiert?', 'hatte sie das schon mal', 'Ist das zum ersten Mal?', 'äh kennt er das schon von früher', 'Hatte er das früher schon mal gehabt?'],
    applies: (c) => !isMulti(c),
    generate: (c) => {
      if (isPassant(c)) return 'unbekannt';
      const h = history(c);
      if (/zweites kind/.test(h)) return 'geburt';
      const t = scText(c);
      // Vorgeschichte zählt nur, wenn sie zum jetzigen Notfall passt
      const passt: [RegExp, RegExp][] = [
        [/schon mal/, /./],
        [/epilepsie/, /krampf|zuckt/],
        [/asthma|copd|herzschwäche/, /atem|luft/],
        [/herzinfarkt|stents|herzkrank|herzprobleme/, /brust|herz/],
        [/diabetes|insulin/, /zucker|verwirrt|zittrig/],
        [/psychiatrische|depression/, /psych|stimmen|intox|vergiftung/],
        [/allergie bekannt/, /allerg/],
      ];
      if (passt.some(([hr, tr]) => hr.test(h) && tr.test(t))) return 'ja';
      const a = ageOf(c);
      if (a === 0) return 'nein';
      if (c.get('x_gestuerzt') === 'ja' && a !== null && a >= 75 && c.rng.chance(0.4)) return 'gestuerzt';
      return 'nein';
    },
    answer: (v, c) => {
      const p0 = pr(c);
      const self = isSelf(c);
      switch (v) {
        case 'ja':
          return self ? 'Ja, so was hatte ich schon mal.' : `Ja, das kennt ${p0.er} leider schon.`;
        case 'geburt':
          return 'Es ist das zweite Kind, beim ersten ging es auch so schnell.';
        case 'gestuerzt':
          return self ? 'Ich bin in letzter Zeit öfter mal hingefallen.' : `${p0.Er} ist in letzter Zeit öfter mal hingefallen.`;
        case 'unbekannt':
          return 'Das weiß ich nicht, ich kenne die Person ja gar nicht.';
        default:
          return self ? 'Nein, so etwas hatte ich noch nie.' : `Nein, so etwas hatte ${p0.er} noch nie.`;
      }
    },
    unknown: () => MULTI_UNKNOWN,
  },
  {
    id: 'x_medikamente_heute',
    label: 'Medikamente heute genommen',
    categories: RD_KTP,
    patterns: [
      p(' (heute|vorhin|eben|heute morgen|heute frueh) (\\w+ ){0,3}(medikamente|tabletten|insulin|spritze|pillen) '),
      p(' (medikamente|tabletten|insulin|pillen) (\\w+ ){0,3}(genommen|eingenommen|gespritzt|vergessen|bekommen|verabreicht) '),
    ],
    examples: ['Hat er heute seine Tabletten genommen?', 'hat sie ihre medikamente genommen', 'Wurden die Medikamente heute eingenommen?', 'äh hat er heute schon insulin gespritzt', 'Hat sie die Tabletten vergessen?'],
    applies: (c) => !isMulti(c),
    generate: (c) => {
      if (isPassant(c)) return 'unbekannt';
      const a = ageOf(c);
      if (a !== null && a < 12) return 'kind';
      if (c.category === 'ktp') return isClinic(c) ? 'station' : 'ja';
      const h = history(c);
      if (/ausgegangen|aufgebraucht|alle sind/.test(symptoms(c))) return 'ausgegangen';
      if (c.scenarioId === 'rd_intox') return c.facts.conscious === false ? 'zuviel' : 'unklar';
      if (/insulin/.test(h) && /verwirrt|zittrig/.test(symptoms(c))) return 'insulin';
      if (/blutverdünner|tabletten|medikament|herz|bluthochdruck|vorhofflimmern|diabetes|epilepsie|copd|asthma|wassertabletten|demenz|niere/.test(h)) return c.rng.chance(0.75) ? 'ja' : 'vergessen';
      return 'keine';
    },
    answer: (v, c) => {
      const p0 = pr(c);
      const self = isSelf(c);
      switch (v) {
        case 'ja':
          return self ? 'Ja, die hab ich heute früh ganz normal genommen.' : `Ja, die hat ${p0.er} heute früh ganz normal genommen.`;
        case 'vergessen':
          return self ? 'Ehrlich gesagt hab ich sie heute vergessen.' : `Ich glaube, ${p0.er} hat sie heute vergessen.`;
        case 'insulin':
          return self ? 'Insulin hab ich gespritzt, aber kaum was gegessen.' : `Insulin hat ${p0.er} gespritzt, aber kaum was gegessen.`;
        case 'zuviel':
          return `Ich glaube, ${p0.er} hat viel zu viele Tabletten genommen, die Packungen liegen hier leer rum!`;
        case 'unklar':
          return 'Ob da Tabletten im Spiel sind, weiß ich nicht genau.';
        case 'kind':
          return 'Nein, das Kind bekommt sonst keine Medikamente.';
        case 'ausgegangen':
          return self ? 'Nein, die sind mir ja ausgegangen, deswegen rufe ich an.' : `Nein, die sind ${p0.ihm} ausgegangen.`;
        case 'station':
          return `Die Medikamente hat ${p0.er} heute nach Plan bekommen, das steht alles im Bogen.`;
        case 'unbekannt':
          return 'Das weiß ich nicht, ich kenne die Person nicht.';
        default:
          return self ? 'Ich nehme gar keine Medikamente.' : `${p0.Er} nimmt eigentlich gar keine Medikamente.`;
      }
    },
    unknown: () => MULTI_UNKNOWN,
  },
  {
    id: 'x_alkohol',
    label: 'Alkohol oder Drogen',
    categories: RD,
    patterns: [w('alkohol|getrunken|betrunken|alkoholisiert|drogen|rauschgift|alkoholgeruch|fahne|gekifft|intus'), p(' (was|etwas) (\\w+ )?(genommen|eingeworfen|konsumiert) ')],
    examples: ['Hat er Alkohol getrunken?', 'ist die person betrunken', 'Sind Drogen im Spiel?', 'äh hat sie irgendwas genommen alkohol oder drogen', 'Hat er was eingeworfen?'],
    generate: (c) => {
      if (isMulti(c)) return /festival/.test(scText(c)) ? 'teilweise' : 'multi';
      const a = ageOf(c);
      if (a !== null && a < 14) return 'kind';
      if (c.scenarioId === 'rd_intox') return 'ja';
      if (isPassant(c)) return c.rng.chance(0.2) ? 'geruch' : 'unbekannt';
      if ((a !== null && a < 18) || /schwanger|wehen|geburt/.test(scText(c))) return 'nein';
      return c.rng.chance(0.1) ? 'bisschen' : 'nein';
    },
    answer: (v, c) => {
      const p0 = pr(c);
      const self = isSelf(c);
      switch (v) {
        case 'ja':
          return 'Ja, da ist auf jeden Fall was im Spiel – was genau alles, weiß ich nicht.';
        case 'teilweise':
          return 'Einige haben bestimmt getrunken, das ist ja ein Festival.';
        case 'multi':
          return 'Davon merke ich hier nichts.';
        case 'kind':
          return 'Nein, das ist doch noch ein Kind!';
        case 'geruch':
          return 'Es riecht ein bisschen nach Alkohol, sicher bin ich mir aber nicht.';
        case 'unbekannt':
          return 'Kann ich nicht sagen, ich kenne die Person nicht.';
        case 'bisschen':
          return self ? 'Ich hatte ein Bier zum Essen, mehr nicht.' : `${p0.Er} hatte ein Glas Wein zum Essen, mehr nicht.`;
        default:
          return self ? 'Nein, ich hab nichts getrunken.' : `Nein, ${p0.er} trinkt nichts und Drogen schon gar nicht.`;
      }
    },
  },
  {
    id: 'x_blutzucker',
    label: 'Blutzucker gemessen',
    categories: RD_KTP,
    patterns: [w('blutzucker|zuckerwert|blutzuckerwert|zuckermessgeraet|blutzuckermessgeraet|messgeraet'), p(' (der |den )?zucker (\\w+ ){0,3}(gemessen|messen|gecheckt|geprueft) '), p(' (wie hoch|wie viel|wieviel|was) (ist|war|hat|sagt) (der|sein|ihr|denn der) zucker ')],
    examples: ['Wurde der Blutzucker gemessen?', 'haben sie den zucker gemessen', 'Wie ist der Blutzucker?', 'äh gibt es ein zuckermessgerät', 'Kennen Sie den Zuckerwert?'],
    applies: (c) => !isMulti(c),
    generate: (c) => {
      if (c.category === 'ktp') return isClinic(c) ? c.rng.int(95, 165) : 'kein';
      if (atClinic(c)) return c.rng.int(70, 140);
      if (isPassant(c)) return 'kein';
      const h = history(c);
      if (/insulin|diabet/.test(h)) {
        if (/verwirrt|zittrig|kaltschweißig/.test(symptoms(c))) return c.rng.int(28, 48);
        return c.rng.chance(0.5) ? c.rng.int(110, 280) : 'nicht';
      }
      return 'kein';
    },
    answer: (v, c) => {
      if (typeof v === 'number') {
        if (c.category === 'ktp' || (atClinic(c) && v >= 60)) return `Zuletzt ${v}, ganz unauffällig.`;
        if (v < 60) return `Ja, gerade eben – das Gerät zeigt nur ${v}!`;
        return `Ja, vorhin, da war der Wert bei ${v}.`;
      }
      if (v === 'nicht') return 'Ein Messgerät haben wir, aber gemessen haben wir noch nicht.';
      return 'Nein, ein Messgerät haben wir hier nicht.';
    },
    unknown: () => MULTI_UNKNOWN,
  },
  {
    id: 'x_schwanger',
    label: 'Schwangerschaft',
    categories: RD_KTP,
    patterns: [w('schwanger|schwangerschaft|schwangere|hochschwanger|schwangerschaftswoche|ssw')],
    examples: ['Ist sie schwanger?', 'besteht eine schwangerschaft', 'Ist die Patientin schwanger?', 'äh könnte die frau schwanger sein', 'In welcher Schwangerschaftswoche?'],
    applies: (c) => !isMulti(c),
    generate: (c) => {
      if (c.scenarioId === 'rd_geburt' || /wehen|fruchtblase/.test(symptoms(c))) return 'geburt';
      const a = ageOf(c);
      if (a === 0) return 'baby';
      if (c.get('x_geschlecht') !== 'w') return 'mann';
      if (a !== null && (a < 13 || a > 52)) return 'alter';
      if (isPassant(c)) return 'unbekannt';
      return c.rng.chance(0.05) ? 'vielleicht' : 'nein';
    },
    answer: (v, c) => {
      const self = isSelf(c);
      switch (v) {
        case 'geburt':
          return self ? 'Ja, das Baby kommt ja gerade – ich bin in der 39. Woche!' : 'Ja, das Baby kommt ja gerade – sie ist in der 39. Woche!';
        case 'baby':
          return 'Das ist doch das Neugeborene.';
        case 'mann':
          return self ? 'Ich bin ein Mann.' : 'Das ist ein Mann.';
        case 'alter':
          return 'Nein, ausgeschlossen.';
        case 'unbekannt':
          return 'Das weiß ich nicht, ich kenne die Frau nicht.';
        case 'vielleicht':
          return self ? 'Könnte sein, ich bin überfällig.' : 'Könnte sein, das weiß ich nicht sicher.';
        default:
          return self ? 'Nein, schwanger bin ich nicht.' : 'Nein, schwanger ist sie nicht.';
      }
    },
    unknown: () => MULTI_UNKNOWN,
  },
  {
    id: 'x_allergien',
    label: 'Allergien',
    categories: RD_KTP,
    patterns: [p(' (\\w+ ){0,3}allergi\\w*( gegen \\w+)? '), w('allergisch|unvertraeglichkeit|unvertraeglichkeiten')],
    examples: ['Hat er Allergien?', 'ist sie gegen irgendwas allergisch', 'Sind Allergien bekannt?', 'äh hat sie irgendwelche allergien', 'Gibt es Unverträglichkeiten?'],
    applies: (c) => !isMulti(c),
    generate: (c) => {
      if (/allergie bekannt/.test(history(c)) || c.scenarioId === 'rd_allergie') return 'wespen';
      if (isPassant(c)) return 'unbekannt';
      if (ageOf(c) === 0) return 'keine';
      return c.rng.chance(0.75) ? 'keine' : c.rng.pick(['penicillin', 'pflaster', 'nuesse', 'kontrastmittel']);
    },
    answer: (v, c) => {
      const self = isSelf(c);
      const p0 = pr(c);
      const hat = self ? 'Ich bin' : `${p0.Er} ist`;
      switch (v) {
        case 'wespen':
          return self ? 'Ja, ich bin gegen Wespen allergisch, das Notfallset hab ich vergessen.' : `Ja, gegen Wespenstiche, ${p0.sein} Notfallset liegt leider zu Hause.`;
        case 'penicillin':
          return `${hat} gegen Penicillin allergisch.`;
        case 'pflaster':
          return `${hat} gegen Pflaster allergisch, das gibt immer Ausschlag.`;
        case 'nuesse':
          return `${hat} gegen Nüsse allergisch.`;
        case 'kontrastmittel':
          return `${hat} gegen Kontrastmittel allergisch.`;
        case 'unbekannt':
          return 'Das weiß ich nicht, ich kenne die Person nicht.';
        default:
          return self ? 'Nein, Allergien hab ich keine.' : 'Nein, Allergien sind keine bekannt.';
      }
    },
    unknown: () => MULTI_UNKNOWN,
  },
  {
    id: 'x_hausarzt',
    label: 'Hausarzt',
    categories: RD_KTP,
    patterns: [w('hausarzt|hausaerztin|hausarztes|hausarztpraxis|behandelnde arzt|behandelnden arzt|behandelnde aerztin'), p(' welche[rnm]? (arzt|aerztin) (\\w+ ){0,2}(behandelt|betreut) ')],
    examples: ['Wer ist der Hausarzt?', 'haben sie einen hausarzt', 'Wie heißt die Hausärztin?', 'äh welcher hausarzt behandelt ihn denn', 'Wer ist der behandelnde Arzt?'],
    applies: (c) => !isMulti(c) && !isPassant(c),
    generate: (c) => {
      if (isKollege(c)) return 'unbekannt';
      if (c.category === 'ktp' && isClinic(c)) return 'brief';
      const a = ageOf(c);
      if (a === 0) return 'neugeboren';
      const doc = `${c.rng.pick(DOCTORS)}|${c.rng.pick(PRAXIS)}`;
      if (c.scenarioId === 'sh_notf_k_hausarzt') return `einweisung|${doc}`;
      if (a !== null && a < 14) return `kinderarzt|${doc}`;
      return doc;
    },
    answer: (v) => {
      const s = String(v);
      if (s === 'unbekannt') return 'Das weiß ich nicht, ich bin nur ein Arbeitskollege.';
      if (s === 'brief') return 'Der Hausarzt steht im Arztbrief, der liegt den Unterlagen bei.';
      if (s === 'neugeboren') return 'Einen Kinderarzt hat das Baby noch nicht, es ist ja gerade erst geboren.';
      const parts = s.split('|');
      if (parts[0] === 'kinderarzt') return `Der Kinderarzt ist ${parts[1]}, ${parts[2]}.`;
      if (parts[0] === 'einweisung') return `${parts[1]} ${parts[2]} – die Praxis war heute schon hier und hat die Einweisung geschrieben.`;
      return `Das ist ${parts[0]}, ${parts[1]}.`;
    },
    unknown: (c) => (isMulti(c) ? MULTI_UNKNOWN : PASSANT_UNKNOWN),
  },
  {
    id: 'x_pflege',
    label: 'Pflegegrad und Pflegedienst',
    categories: RD_KTP,
    patterns: [w('pflegegrad|pflegestufe|pflegedienst|pflegedienstes|pflegebeduerftig|pflegefall|ambulante pflege|ambulanten pflegedienst|gepflegt')],
    examples: ['Hat er einen Pflegegrad?', 'kommt ein pflegedienst', 'Ist die Patientin pflegebedürftig?', 'äh wird sie von einem pflegedienst betreut', 'Welche Pflegestufe hat er?'],
    applies: (c) => !isMulti(c),
    generate: (c) => {
      const a0 = ageOf(c);
      if (a0 !== null && a0 < 14) return 'kind';
      if (/pflegeheim/.test(lc(c.facts._detail)) || /pflegeheim/.test(lc(c.facts.target))) return 'heim';
      if (/pflegedienst/.test(history(c))) return 'dienst';
      if (isPassant(c)) return 'unbekannt';
      const a = ageOf(c);
      if (a !== null && a < 14) return 'kind';
      if (a === null || a < 65) return 'nein';
      if (a >= 80) return c.rng.pick(['dienst', 'dienst', 'grad', 'nein']);
      return c.rng.chance(0.25) ? 'grad' : 'nein';
    },
    answer: (v, c) => {
      const p0 = pr(c);
      const self = isSelf(c);
      switch (v) {
        case 'heim':
          return 'Ja, Pflegegrad 4, wohnt hier bei uns im Pflegeheim.';
        case 'kind':
          return 'Nein, das Kind ist nicht pflegebedürftig.';
        case 'dienst':
          return self ? 'Ja, ich hab Pflegegrad 3, morgens und abends kommt der Pflegedienst.' : `Ja, Pflegegrad 3, morgens und abends kommt der Pflegedienst zu ${p0.ihm}.`;
        case 'grad':
          return self ? 'Ich hab Pflegegrad 2, aber einen Pflegedienst haben wir nicht.' : `${p0.Er} hat Pflegegrad 2, einen Pflegedienst haben wir aber nicht.`;
        case 'unbekannt':
          return 'Das weiß ich nicht, ich kenne die Person nicht.';
        default:
          return self ? 'Nein, ich komme alleine zurecht.' : `Nein, ${p0.er} kommt eigentlich alleine zurecht.`;
      }
    },
    unknown: () => MULTI_UNKNOWN,
  },

  // ---------------------------------------------------------------- Lage beim Patienten
  {
    id: 'x_ersthelfer',
    label: 'Ersthelfer vor Ort',
    categories: RD,
    patterns: [
      w('ersthelfer|ersthelferin|ersthelfern|erste hilfe|kuemmert sich|kuemmern sich'),
      p(' (ist|sind) (noch |schon |gerade )?(jemand|wer|leute|andere|helfer) (\\w+ )?bei (ihm|ihr|der person|dem patienten|der patientin|dem mann|der frau|dem kind) '),
    ],
    examples: ['Ist jemand bei ihm?', 'sind ersthelfer vor ort', 'Leistet jemand Erste Hilfe?', 'äh kümmert sich schon jemand um die frau', 'Ist schon wer bei der Patientin?'],
    generate: (c) => {
      const s = symptoms(c);
      if (/rettungsschwimmer/.test(s)) return 'schwimmer';
      if (isMulti(c)) return 'viele';
      if (atClinic(c)) return 'team';
      if (c.location === 'wasser') return c.rng.chance(0.5) ? 'schwimmer' : 'leute';
      if (isSelf(c)) return c.rng.chance(0.5) ? 'allein' : 'familie';
      if (isPassant(c)) return c.rng.chance(0.5) ? 'leute' : 'ich';
      if (isKollege(c)) return 'kollegen';
      return 'ich';
    },
    answer: (v, c) => {
      const p0 = pr(c);
      switch (v) {
        case 'schwimmer':
          return 'Ja, die Rettungsschwimmer sind schon da und kümmern sich.';
        case 'viele':
          return 'Hier helfen viele mit, aber das reicht vorne und hinten nicht.';
        case 'team':
          return `Ja, wir sind hier ein ganzes Team bei ${p0.ihm}.`;
        case 'leute':
          return 'Ja, hier sind noch ein paar Leute, die helfen.';
        case 'allein':
          return 'Nein, ich bin ganz alleine zu Hause.';
        case 'familie':
          return 'Ja, meine Tochter ist hier bei mir.';
        case 'kollegen':
          return `Ja, ein paar Kollegen sind bei ${p0.ihm}, einer hat einen Erste-Hilfe-Kurs.`;
        default:
          return `Ja, ich bin bei ${p0.ihm}, sonst ist keiner da.`;
      }
    },
  },
  {
    id: 'x_aed',
    label: 'Defibrillator in der Nähe',
    categories: RD,
    patterns: [w('defi|defis|defibrillator|aed|laiendefi|laiendefibrillator|schockgeraet'), p(' (gibt es|ist|sind|haengt|haben sie) (\\w+ ){0,5}(defi|defis|defibrillator|aed|laiendefi|laiendefibrillator) ')],
    examples: ['Gibt es einen Defibrillator in der Nähe?', 'ist ein aed vor ort', 'Haben Sie einen Defi da?', 'äh gibt es da irgendwo so einen laiendefi'],
    generate: (c) => {
      const d = lc(c.facts._detail);
      switch (c.location) {
        case 'oeffentlich':
          if (/supermarkt|bahnhof|schule|halle|rathaus|markt|festival|tribüne/.test(`${d} ${scText(c)}`)) return 'eingang';
          return c.rng.chance(0.3) ? 'apotheke' : 'unklar';
        case 'gewerbe':
          return c.rng.chance(0.7) ? 'buero' : 'unklar';
        case 'klinik':
          return 'klinik';
        case 'wasser':
          return c.rng.chance(0.6) ? 'dlrg' : 'unklar';
        case 'land':
          return c.rng.chance(0.3) ? 'feuerwehrhaus' : 'nein';
        default:
          return c.rng.chance(0.15) ? 'apotheke' : 'nein';
      }
    },
    answer: (v) => {
      switch (v) {
        case 'eingang':
          return 'Ja, vorne am Eingang hängt einer, ich schick jemanden los!';
        case 'apotheke':
          return 'An der Apotheke um die Ecke hängt einer, glaube ich.';
        case 'buero':
          return 'Ja, im Büro an der Wand hängt einer.';
        case 'klinik':
          return 'Ja, wir haben hier einen.';
        case 'dlrg':
          return 'Die Rettungsschwimmer haben einen in ihrer Station.';
        case 'feuerwehrhaus':
          return 'Am Feuerwehrhaus im Dorf hängt einer, das ist aber ein Stück weg.';
        case 'unklar':
          return 'Weiß ich nicht, ich sehe hier keinen.';
        default:
          return 'Nein, so ein Gerät haben wir hier nicht.';
      }
    },
  },
  {
    id: 'x_bewegung',
    label: 'Bewegt sich',
    categories: RD,
    patterns: [
      p(' bewegt (er|sie|es|der patient|die patientin|die person|der mann|die frau|das kind)? ?sich '),
      p(' (arme|beine|arm|bein|haende|finger|fuesse|zehen) (\\w+ ){0,2}bewegen '),
      p(' (ruehrt|regt) (er|sie|es|der patient|die patientin|die person|das kind)? ?sich '),
      p(' (kann|koennen) (er|sie|es|der patient|die patientin|die person|das kind) (sich )?(\\w+ ){0,3}bewegen '),
      w('bewegungen'),
    ],
    examples: ['Bewegt er sich?', 'bewegt sich die person noch', 'Kann sie Arme und Beine bewegen?', 'äh rührt sie sich noch', 'Macht er irgendwelche Bewegungen?'],
    applies: (c) => !isMulti(c),
    generate: (c) => {
      const s = symptoms(c);
      if (c.facts.breathing === 'nein') return 'nein';
      if (/zuckt|krampf/.test(s)) return 'krampf';
      if (c.facts.conscious === false) return 'kaum';
      if (/lähmung|kraftlos|arm nicht/.test(s) || c.scenarioId === 'rd_schlaganfall') return 'halbseitig';
      if (/nacken|kopfsprung/.test(s)) return 'nacken';
      if (/hüfte|bein verkürzt|bein nach außen|fuß steht schief|unterschenkel/.test(s)) return 'bein';
      if (/handgelenk/.test(s)) return 'hand';
      if (/apathisch|schläfrig|sehr schwach/.test(s)) return 'wenig';
      return 'ja';
    },
    answer: (v, c) => {
      const p0 = pr(c);
      const self = isSelf(c);
      switch (v) {
        case 'nein':
          return `Nein, ${p0.er} rührt sich überhaupt nicht!`;
        case 'krampf':
          return `${p0.Er} zuckt am ganzen Körper, richtig bewegen kann man das nicht nennen.`;
        case 'kaum':
          return `Kaum, ${p0.er} liegt einfach da.`;
        case 'halbseitig':
          return self ? 'Eine Seite geht nicht richtig, der Arm ist ganz schwer.' : 'Die eine Seite bewegt sich nicht richtig, der Arm hängt einfach runter.';
        case 'nacken':
          return self ? 'Ich traue mich nicht, der Nacken tut so weh.' : `${p0.Er} bewegt Arme und Beine, aber der Nacken tut ${p0.ihm} sehr weh.`;
        case 'bein':
          return self ? 'Das Bein kann ich nicht bewegen, alles andere geht.' : `Das Bein kann ${p0.er} nicht bewegen, sonst schon.`;
        case 'hand':
          return self ? 'Die Hand kann ich vor Schmerzen kaum bewegen.' : `Die Hand kann ${p0.er} vor Schmerzen kaum bewegen, sonst geht alles.`;
        case 'wenig':
          return `${p0.Er} bewegt sich nur ganz wenig.`;
        default:
          return self ? 'Ja, bewegen kann ich mich.' : `Ja, ${p0.er} bewegt sich.`;
      }
    },
    unknown: () => MULTI_UNKNOWN,
  },
  {
    id: 'x_sprechen',
    label: 'Kann sprechen',
    categories: RD,
    patterns: [
      p(' (kann|koennen) (er|sie|es|der patient|die patientin|die person|der mann|die frau|das kind)? ?(normal |noch |deutlich |richtig |ganz )*(sprechen|reden) '),
      p(' (spricht|redet) (er|sie|es|der patient|die patientin|die person|das kind)? ?(normal|noch|deutlich|klar|verwaschen|komisch|undeutlich) '),
      w('verwaschen|lallt|lallen|ganze saetze|ganzen saetzen|sprachstoerung|sprachstoerungen'),
      p(' (spricht|redet) (er|sie|es|der patient|die patientin|die person|das kind) (noch |mit ihnen |mit ihm |mit ihr )?$'),
    ],
    examples: ['Kann er normal sprechen?', 'redet sie noch', 'Spricht der Patient deutlich?', 'äh kann sie in ganzen sätzen sprechen', 'Lallt er?'],
    applies: (c) => !isMulti(c),
    generate: (c) => {
      const s = symptoms(c);
      const a = ageOf(c);
      if (c.facts.conscious === false || c.facts.breathing === 'nein') return 'nein';
      if (a !== null && a <= 2) return 'baby';
      if (/sprachstörung|mundwinkel/.test(s) || c.scenarioId === 'rd_schlaganfall') return 'verwaschen';
      if (/satzfetzen|kaum sprechen/.test(s)) return 'satzfetzen';
      if (c.facts.breathing === 'schwer') return 'kurz';
      if (/verwirrt|stimmen|unruhig|durcheinander/.test(s)) return 'wirr';
      if (/benommen|schläfrig/.test(s)) return 'lallt';
      if (/apathisch|sehr schwach/.test(s)) return 'leise';
      return 'ja';
    },
    answer: (v, c) => {
      const p0 = pr(c);
      switch (v) {
        case 'nein':
          return `Nein, ${p0.er} sagt gar nichts.`;
        case 'baby':
          return 'Das Kind ist noch zu klein zum Sprechen, es weint nur.';
        case 'verwaschen':
          return `${p0.Er} redet ganz verwaschen, man versteht ${p0.ihn} kaum.`;
        case 'satzfetzen':
          return `Nur ein paar Worte, dann muss ${p0.er} wieder nach Luft schnappen.`;
        case 'kurz':
          return `${p0.Er} kann reden, aber nur kurze Sätze.`;
        case 'wirr':
          return `${p0.Er} redet, aber ziemlich wirres Zeug.`;
        case 'lallt':
          return `${p0.Er} lallt nur noch.`;
        case 'leise':
          return `${p0.Er} sagt kaum was, nur ganz leise.`;
        default:
          return isSelf(c) ? 'Ja, reden kann ich.' : `Ja, ${p0.er} redet ganz normal.`;
      }
    },
    unknown: () => MULTI_UNKNOWN,
  },
  {
    id: 'x_erbrechen',
    label: 'Übelkeit und Erbrechen',
    categories: RD_KTP,
    patterns: [
      w('erbrochen|erbricht|erbrechen|uebergeben|uebergibt|gekotzt|kotzt|uebelkeit|uebel|gespuckt|spuckt'),
      p(' (musste|muss) (er|sie|es|der patient|die patientin|das kind) (sich )?(\\w+ )?(brechen|spucken) '),
      p(' ist (ihm|ihr|dem patienten|der patientin|dem kind) (\\w+ )?(schlecht|uebel) '),
    ],
    examples: ['Hat er erbrochen?', 'musste sie sich übergeben', 'Ist ihm übel?', 'äh hat das kind gespuckt', 'Hat die Patientin Übelkeit?'],
    applies: (c) => !isMulti(c),
    generate: (c) => {
      const s = symptoms(c);
      if (/erbrechen mit blut/.test(s)) return 'blut';
      if (/erbricht|übergeben|erbrechen/.test(s)) return 'ja';
      if (/durchfall/.test(s)) return 'durchfall';
      if (c.category === 'rd' && /brust/.test(s)) return c.rng.chance(0.35) ? 'uebel' : 'nein';
      return 'nein';
    },
    answer: (v, c) => {
      const p0 = pr(c);
      const self = isSelf(c);
      switch (v) {
        case 'blut':
          return `Ja, ${p0.er} hat Blut erbrochen!`;
        case 'ja':
          return self ? 'Ja, ich hab mich schon übergeben.' : `Ja, ${p0.er} hat sich schon übergeben.`;
        case 'durchfall':
          return self ? 'Erbrochen nicht, aber ich hab seit Tagen Durchfall.' : `Erbrochen nicht, aber ${p0.er} hat seit Tagen Durchfall.`;
        case 'uebel':
          return self ? 'Mir ist übel, gebrochen hab ich aber nicht.' : `${p0.Er} sagt, ${p0.ihm} ist übel, gebrochen hat ${p0.er} aber nicht.`;
        default:
          return isPassant(c) ? 'Hab ich nicht gesehen.' : self ? 'Nein, übel ist mir nicht.' : `Nein, erbrochen hat ${p0.er} nicht.`;
      }
    },
    unknown: () => MULTI_UNKNOWN,
  },
  {
    id: 'x_fieber',
    label: 'Fieber',
    categories: RD_KTP,
    patterns: [w('fieber|fiebrig|fieber gemessen|koerpertemperatur|temperatur|erhoehte temperatur|fieberthermometer'), p(' (fuehlt|fuehlen) (er|sie|es|das kind|der patient|die patientin) sich (\\w+ )?(heiss|warm) ')],
    examples: ['Hat er Fieber?', 'wurde fieber gemessen', 'Wie hoch ist die Körpertemperatur?', 'äh fühlt sie sich heiß an', 'Ist sie fiebrig?'],
    applies: (c) => !isMulti(c),
    generate: (c) => {
      const s = `${symptoms(c)} ${history(c)} ${c.category === 'ktp' ? pos(ktpText(c)) : ''}`;
      const m = /fieber (?:von )?(\d{2}(?:[.,]\d)?)(?: grad)?/.exec(s);
      if (m) return Number(m[1].replace(',', '.'));
      if (/fieber über 40/.test(s)) return 40.4;
      if (/leichte[mn]? fieber/.test(s)) return 38.2;
      if (/hohes fieber/.test(s)) return isPassant(c) ? 'heiss' : Math.round(c.rng.range(39.2, 40.1) * 10) / 10;
      if (/fieber/.test(s)) return isPassant(c) ? 'heiss' : Math.round(c.rng.range(38.4, 39.6) * 10) / 10;
      if (/heiße trockene haut|überwärmt/.test(s)) return 'heiss';
      return 'nein';
    },
    answer: (v, c) => {
      const p0 = pr(c);
      if (typeof v === 'number') return c.category === 'ktp' ? `Zuletzt ${komma(v)} Grad gemessen.` : `Ja, wir haben gerade ${komma(v)} Grad gemessen.`;
      if (v === 'heiss') return `${p0.Er} fühlt sich ganz heiß an, gemessen haben wir nicht.`;
      if (c.category === 'ktp') return `Nein, ${p0.er} ist fieberfrei.`;
      return isSelf(c) ? 'Nein, Fieber hab ich nicht.' : `Nein, Fieber hat ${p0.er} nicht.`;
    },
    unknown: () => MULTI_UNKNOWN,
  },
  {
    id: 'x_seit_wann',
    label: 'Seit wann die Beschwerden bestehen',
    categories: RD_KTP,
    patterns: [p(' seit wann(?! (wohn|arbeit|kenn|leb))( \\w+){0,5} '), p(' wann (fing|ging|begann) (das|es|der schmerz|die schmerzen|die beschwerden) (\\w+ ){0,2}(an|los) '), p(' wie lange (schon |geht das|hat (er|sie) )(\\w+ ){0,4}'), p(' wann (hat|haben) (das|es|die beschwerden|die schmerzen) (\\w+ ){0,2}(angefangen|begonnen) ')],
    examples: ['Seit wann hat er die Schmerzen?', 'seit wann geht das so', 'Wann hat das angefangen?', 'äh wie lange schon hat sie die beschwerden', 'Seit wann besteht das?'],
    generate: (c) => {
      const s = `${symptoms(c)} ${history(c)}`;
      const m = /seit (?:etwa |ungefähr )?(\d+) minuten/.exec(s);
      if (m) return `min:${m[1]}`;
      const t = scText(c);
      if (c.category === 'rd' && ageOf(c) !== 0 && (c.facts.breathing === 'nein' || /krampf|zuckt|sturz|gestürzt|schnitt|verbrenn|verbrüh|strom|wespe|allergisch|unfall|tribüne|gefallen/.test(t))) return `akut:${c.rng.int(3, 12)}`;
      if (/seit (ein paar |einigen |mehreren |wenigen )?tagen|vor (ein paar |einigen |wenigen )?tagen|vorgestern|letzte woche/.test(s)) return 'tage';
      if (/sonnenbrand/.test(s)) return 'heute';
      if (/ausgegangen/.test(s)) return 'gestern';
      if (/seit gestern/.test(s)) return 'gestern';
      if (/seit stunden/.test(s)) return 'stunden';
      if (c.category === 'ktp') return c.facts.intensive === true ? 'tage' : 'ktp';
      if (ageOf(c) === 0) return 'geboren';
      if (/wehen|geburt/.test(t)) return `wehen:${c.rng.pick(['einer halben Stunde', 'einer Stunde', 'zwei Stunden'])}`;
      if (isPassant(c)) return 'unbekannt';
      if (/zustand|schwach|trinkt kaum|durchfall|harnweg/.test(t)) return 'tage';
      if (/infekt|husten|grippe|gliederschmerz|fieber/.test(t)) return c.rng.chance(0.5) ? 'gestern' : 'tage';
      return c.rng.chance(0.6) ? `min:${c.rng.pick([20, 30, 45])}` : 'stunde';
    },
    answer: (v, c) => {
      const p0 = pr(c);
      const s = String(v);
      const [kind, n] = s.split(':');
      switch (kind) {
        case 'min':
          return `Seit etwa ${n} Minuten.`;
        case 'akut':
          return `Das ist gerade erst passiert, vor vielleicht ${n} Minuten.`;
        case 'stunde':
          return 'Seit ungefähr einer Stunde, es wird immer schlimmer.';
        case 'stunden':
          return 'Schon seit Stunden.';
        case 'tage':
          return 'Das geht jetzt schon ein paar Tage so.';
        case 'gestern':
          return 'Seit gestern.';
        case 'heute':
          return 'Seit heute Nachmittag.';
        case 'geboren':
          return 'Seit der Geburt.';
        case 'wehen':
          return `Die Wehen gingen vor ${n} los, jetzt kommen sie ganz schnell hintereinander.`;
        case 'ktp':
          return /^angehörig/i.test(c.relation) ? `Das besteht schon länger, deswegen ist ${p0.er} ja in Behandlung.` : `Das besteht schon länger, deswegen ist ${p0.er} ja bei uns in Behandlung.`;
        default:
          return 'Das weiß ich nicht, ich bin gerade erst dazugekommen.';
      }
    },
  },

  // ---------------------------------------------------------------- Krankentransport
  {
    id: 'x_sauerstoff',
    label: 'Sauerstoffbedarf',
    categories: RD_KTP,
    patterns: [w('sauerstoff|sauerstoffpflichtig|sauerstoffbedarf|sauerstoffgeraet|sauerstoffflasche|heimsauerstoff|o2|sauerstoffbrille')],
    examples: ['Braucht der Patient Sauerstoff?', 'ist sie sauerstoffpflichtig', 'Wie viel Sauerstoff bekommt er?', 'äh läuft da sauerstoff', 'Hat er zu Hause ein Sauerstoffgerät?'],
    applies: (c) => !isMulti(c),
    generate: (c) => {
      if (c.facts.intensive === true) return 'beatmet';
      const s = symptoms(c);
      const h = history(c);
      if (/sauerstoff/.test(s)) return 'bekommt';
      if (atClinic(c) && (/sättigung/.test(s) || c.facts.breathing === 'schwer')) return 'bekommt';
      if (/sauerstoff zuhause/.test(h)) return 'heim';
      if (/maske|schlafapnoe/.test(h)) return 'cpap';
      if (c.category === 'ktp') return c.rng.chance(0.25) ? 'liter' : 'nein';
      return 'nein';
    },
    answer: (v, c) => {
      const p0 = pr(c);
      switch (v) {
        case 'beatmet':
          return `${p0.Er} ist beatmet, das läuft über das Beatmungsgerät.`;
        case 'bekommt':
          return `Ja, ${p0.er} bekommt schon Sauerstoff.`;
        case 'heim':
          return isSelf(c) ? 'Ich hab zu Hause Sauerstoff, zwei Liter, aber das reicht nicht mehr.' : `Ja, ${p0.er} hat zu Hause Sauerstoff, zwei Liter, aber das reicht nicht mehr.`;
        case 'cpap':
          return `Nachts hat ${p0.er} so eine Maske, sonst keinen Sauerstoff.`;
        case 'liter':
          return 'Ja, zwei Liter über die Nasenbrille.';
        default:
          return c.category === 'ktp' || atClinic(c) ? `Nein, Sauerstoff braucht ${p0.er} im Moment nicht.` : 'Nein, Sauerstoff haben wir hier nicht.';
      }
    },
    unknown: () => MULTI_UNKNOWN,
  },
  {
    id: 'x_begleitperson',
    label: 'Begleitperson',
    categories: KTP,
    patterns: [w('begleitperson|begleitung|mitfahren|mitfahrt|mitkommen|begleiten|begleitet'), p(' (kommt|faehrt|fahren) (\\w+ ){0,2}mit ')],
    examples: ['Fährt eine Begleitperson mit?', 'kommt jemand mit', 'Gibt es eine Begleitung?', 'äh will die tochter mitfahren', 'Wird der Patient begleitet?'],
    generate: (c) => {
      if (c.facts.intensive === true || /ärztliche[rn]? begleitung|notarzt/.test(lc(c.facts.what))) return 'arzt';
      if (/kind/.test(`${lc(c.facts.what)} ${lc(c.facts.target)}`)) return 'mutter';
      if (c.facts.infection === true) return 'nein';
      if (/^angehörig/i.test(c.relation)) return 'ich';
      return c.rng.chance(0.3) ? 'angehoerig' : 'nein';
    },
    answer: (v, c) => {
      switch (v) {
        case 'arzt':
          return 'Unser Arzt fährt mit, Angehörige kommen selbst nach.';
        case 'mutter':
          return 'Ja, die Mutter möchte mitfahren.';
        case 'ich':
          return 'Ja, ich würde gerne mitfahren.';
        case 'angehoerig':
          return c.get('x_geschlecht') === 'w' ? 'Ja, der Ehemann möchte mitfahren.' : 'Ja, die Ehefrau möchte mitfahren.';
        default:
          return 'Nein, eine Begleitperson fährt nicht mit.';
      }
    },
  },
  {
    id: 'x_unterlagen',
    label: 'Unterlagen und Arztbrief',
    categories: KTP,
    patterns: [w('unterlagen|arztbrief|verlegungsbrief|befunde|transportschein|verordnung|ueberweisung|papiere|einweisung|einweisungsschein|entlassbrief|entlassungsbrief|krankenakte|akte')],
    examples: ['Sind die Unterlagen fertig?', 'gibt es einen arztbrief', 'Liegt ein Transportschein vor?', 'äh hat er seine papiere dabei', 'Ist die Verordnung ausgestellt?'],
    generate: (c) => {
      if (/^angehörig/i.test(c.relation)) return 'dabei';
      if (c.facts.intensive === true) return 'verlegung';
      return c.rng.chance(0.8) ? 'fertig' : 'schein';
    },
    answer: (v) => {
      switch (v) {
        case 'dabei':
          return 'Ja, den Arztbrief und den Transportschein hab ich hier.';
        case 'verlegung':
          return 'Verlegungsbrief, Befunde und die Bilder auf CD liegen bereit.';
        case 'schein':
          return 'Der Arztbrief ist fertig, den Transportschein unterschreibt der Arzt gerade noch.';
        default:
          return 'Ja, Arztbrief und Transportschein liegen fertig am Bett.';
      }
    },
  },
  {
    id: 'x_station',
    label: 'Station und Zimmer',
    categories: KTP,
    patterns: [p(' (auf |in |von )?welche[rnm]? (station|zimmer|wohnbereich|bereich) '), w('zimmer|zimmernummer|stationsnummer|bettnummer|wohnbereich')],
    examples: ['Auf welcher Station liegt der Patient?', 'welches zimmer', 'Welche Zimmernummer?', 'äh in welchem zimmer liegt sie denn', 'Von welcher Station kommt der Patient?'],
    applies: (c) => {
      const t = lc(c.facts.target);
      if (/von zu ?hause|aus der (dach)?wohnung|von der wohnung/.test(t)) return false;
      return c.location === 'klinik' || /^(vom|von der|aus dem) (pflegeheim|heim|station|klinik)/.test(t);
    },
    generate: (c) => {
      const d = lc(c.facts._detail);
      if (/pflegeheim/.test(lc(c.facts.target)) && !/station|wohnbereich/.test(d)) return `Wohnbereich ${c.rng.int(1, 4)}|${c.rng.int(1, 38)}`;
      const zimmer = c.rng.int(1, 38);
      const st = /station (\w+)/.exec(d);
      if (st) return `Station ${st[1]}|${zimmer}`;
      const wb = /wohnbereich (\w+)/.exec(d);
      if (wb) return `Wohnbereich ${wb[1]}|${zimmer}`;
      if (/dialyse/.test(d)) return `Dialyse|Platz ${c.rng.int(1, 12)}`;
      if (/notaufnahme/.test(d)) return `Notaufnahme|Behandlungsraum ${c.rng.int(1, 8)}`;
      if (c.facts.intensive === true) return `Intensivstation|Bett ${c.rng.int(1, 12)}`;
      return `Station ${c.rng.int(1, 8)}${c.rng.pick(['a', 'b', 'c'])}|${zimmer}`;
    },
    answer: (v) => {
      const [bereich, platz] = String(v).split('|');
      if (/^\d+$/.test(platz)) return `${bereich}, Zimmer ${platz}.`;
      return `${bereich}, ${platz}.`;
    },
    unknown: (c) => `${pr(c).Patient} wird zu Hause abgeholt, nicht auf einer Station.`,
  },
];
