import type { FactValue, Pick as PickFn } from '../data/questions';
import type { DiasNode } from '../dias/model';
import { findScenario } from '../data/scenarios';
import { resolveDetail, type DetailSource } from './details';
import { hashSeed, zahl } from './details/types';
import { normalize } from './intents';

/**
 * Antworten des simulierten Anrufers auf Fragen der Notrufabfrage (SNA/DIAS) und auf allgemeine
 * Abfragefragen ohne eigenes Muster ("Sind Sie bei der Person?", "Gab es einen Krampfanfall?").
 *
 * Grundsätze:
 *  - Kritische Angaben (Bewusstsein, Atmung, eingeklemmt, Anzahl Betroffene, Gefahr) kommen immer aus
 *    den Szenariofakten. Fehlt ein Fakt, wird er widerspruchsfrei aus Kategorie, Eröffnung und den
 *    übrigen Fakten abgeleitet – nie zufällig.
 *  - Alles andere ohne Szenarioangabe legt der Anrufer einmal plausibel fest (deterministisch je Anruf
 *    und Thema/Frage) und merkt es sich als Fakt x_dias_<key> – er bleibt dabei.
 *  - Keine DIAS-Texte: Die Zuordnung Frage → Thema läuft über eine eigene Stichworttabelle.
 */

export interface SnaSource extends DetailSource {
  /** Eröffnungssatz des Anrufers */
  opening: string;
  /** Seed des Anrufs (callSeed) */
  seed: string;
}

type Val = FactValue;

interface SnaTopic {
  /** beginnt mit "sna_" */
  id: string;
  /** erkennt das Thema in einer (normalisierten) Frage */
  keys: RegExp;
  /** Wert aus den Fakten (oder einmal plausibel festgelegt) */
  value: (s: SnaSource, q: string) => Val;
  /** Ja/Nein-Frage beantworten (null = unklar); Standard: Wert "ja" */
  yes?: (v: Val, q: string, s: SnaSource) => boolean | null;
  /** passt der Wert zur Antwortmöglichkeit (normalisierte Beschriftung)? */
  option?: (v: Val, label: string) => boolean;
  /** Anzahl (für Zahl-Antworten) */
  count?: (v: Val) => number | null;
  /** Antwortsatz */
  say: (v: Val, pick: PickFn, s: SnaSource, q: string) => string;
}

// ------------------------------------------------------------------ Hilfen

const DONT_KNOW = ['Das weiß ich nicht genau.', 'Weiß ich nicht genau, ehrlich gesagt.', 'Das kann ich nicht genau sagen.'];
const JA = ['Ja.', 'Ja, ich glaube schon.', 'Ja, das schon.'];
const NEIN = ['Nein.', 'Nein, glaube nicht.', 'Nein, eher nicht.'];

const str = (v: Val | undefined) => (v === undefined ? '' : String(v));
const medical = (s: SnaSource) => s.category === 'rd' || s.category === 'ktp';
const injuredN = (s: SnaSource) => (typeof s.facts.injured === 'number' ? s.facts.injured : undefined);
/** Verneinte Angaben entfernen ("keine Atmung" zählt nicht als "Atmung") */
const pos = (t: string) => t.replace(/ (kein|keine|keinen|keinem|keiner|nicht|ohne|nichts) \w+/g, ' ');
/** Szenariotext (normalisiert, ohne Verneintes) */
function sceneText(s: SnaSource, withHistory = false): string {
  const keys = ['what', 'symptoms', 'object', 'help', 'situation', 'hazard', 'smoke', 'leak', 'persons', 'substance', '_detail', ...(withHistory ? ['history'] : [])];
  const name = findScenario(s.scenarioId)?.name ?? '';
  return pos(normalize([s.opening, name, ...keys.map((k) => str(s.facts[k]))].join(' . ')));
}
const has = (s: SnaSource, re: RegExp, withHistory = false) => re.test(sceneText(s, withHistory));
/** Niemand verletzt oder in Not (Brand, TH … ohne Personenschaden) */
const nobodyHurt = (s: SnaSource) => !medical(s) && s.category !== 'wasser' && (injuredN(s) ?? 0) === 0 && s.facts.trapped !== true;
/** Der Anrufer kommt nicht an die Person heran (eingeschlossen im Brand/Gebäude, im Wasser) */
const outOfReach = (s: SnaSource) => (s.facts.trapped === true && (s.category === 'brand' || s.category === 'th')) || (s.category === 'wasser' && s.facts.conscious === undefined);
const OUT_OF_REACH = ['Das weiß ich nicht, an die Person komme ich nicht ran!', 'Keine Ahnung, ich komme da nicht hin!'];
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const asSentence = (t: string) => (/[.!?]$/.test(t.trim()) ? t.trim() : `${t.trim()}.`);

/**
 * Einmal festgelegte, plausible Angabe (gemerkt als x_dias_<key>).
 * choices: [Wert, Gewicht]
 */
export function plausible(s: SnaSource, key: string, choices: [Val, number][]): Val {
  const fk = `x_dias_${key}`;
  const known = s.facts[fk];
  if (known !== undefined) return known;
  const total = choices.reduce((a, [, w]) => a + w, 0);
  let r = (hashSeed(`${s.seed}|${key}`) / 0x100000000) * total;
  let v = choices[choices.length - 1][0];
  for (const [c, w] of choices) {
    if (r < w) {
      v = c;
      break;
    }
    r -= w;
  }
  s.facts[fk] = v;
  return v;
}

/** Alter der betroffenen Person in Jahren (null = unbekannt, Text-Angaben wie "Neugeborenes" → 0) */
function ageOf(s: SnaSource): number | null {
  const a = s.facts.age;
  if (typeof a === 'number') return a;
  if (typeof a === 'string') {
    if (/früh|neugeboren|säugling|baby/i.test(a)) return 0;
    const m = /(\d+)/.exec(a);
    if (m) return Number(m[1]);
    if (/kind/i.test(a)) return 8;
  }
  if (s.category === 'ktp') {
    const v = resolveDetail(s, 'x_patientenalter').value;
    if (typeof v === 'number') return v;
  }
  return null;
}

const yn = (b: boolean): Val => (b ? 'ja' : 'nein');
/** Alter ohne Szenarioangabe: einmal festgelegt */
const plausibleAge = (s: SnaSource) => plausible(s, 'alter', (medical(s) ? [34, 52, 67, 78, 84] : [28, 41, 55, 63]).map((a) => [a, 1] as [Val, number]));

// ------------------------------------------------------------------ Themen

/** Reihenfolge = Vorrang bei der Zuordnung einer Frage */
const TOPICS: SnaTopic[] = [
  {
    id: 'sna_selbst',
    keys: / (sind|ist|bist) (sie|es) (\w+ )?selbst (\w+ )?(betroffen|verletzt|erkrankt|krank)| sind sie (der|die) (patient|patientin|betroffene)| geht es um sie | betrifft es sie | (sie|ihnen) selbst (betroffen|verletzt|schlecht)/,
    value: (s) => {
      if (/betroffen/i.test(s.relation) && s.category === 'rd' && s.facts.conscious !== false && s.facts.breathing !== 'nein') return 'ja';
      if (/unfallbeteilig/i.test(s.relation)) return 'beteiligt';
      return 'nein';
    },
    yes: (v) => v !== 'nein',
    say: (v, pick, s) =>
      v === 'ja'
        ? pick(['Ja, es geht um mich selbst.', 'Ja, ich bin das selbst.'])
        : v === 'beteiligt'
          ? 'Ich war selbst an dem Unfall beteiligt.'
          : medical(s)
            ? pick(['Nein, ich rufe für jemand anderen an.', 'Nein, nicht ich – es geht um jemand anderen.'])
            : pick(['Nein, ich selbst nicht.', 'Nein, mir geht es gut.']),
  },
  {
    id: 'sna_bei_person',
    keys: / (sind|bist|bleiben) sie (\w+ ){0,2}(bei|neben|an) (der|dem|ihm|ihr|ihrem|ihrer|den)( | (person|patient\w*|verletzte\w*|betroffene\w*|mann|frau|kind) )| bei (der person|dem patienten|der patientin|dem verletzten) (sind|bleiben)| direkt bei /,
    value: (s) => {
      if (/betroffen/i.test(s.relation) && s.category === 'rd') return 'selbst';
      if (nobodyHurt(s)) return 'niemand';
      if (medical(s)) return /passant/i.test(s.relation) ? plausible(s, 'bei_person', [['ja', 7], ['nein', 3]]) : 'ja';
      if (s.category === 'wasser') return 'nein';
      if (s.facts.trapped === true && s.category !== 'vu') return 'nein';
      if (/ersthelfer|unfallbeteilig/i.test(s.relation)) return 'ja';
      return plausible(s, 'bei_person', [['ja', 5], ['nein', 5]]);
    },
    yes: (v) => v === 'ja' || v === 'selbst',
    say: (v, pick, s) =>
      v === 'ja'
        ? pick(['Ja, ich bin direkt bei ihr.', 'Ja, ich bin hier neben ihr.'])
        : v === 'selbst'
          ? 'Es geht ja um mich selbst.'
          : v === 'niemand'
            ? pick(['Verletzt ist ja niemand. Ich stehe hier draußen.', 'Es ist ja keiner verletzt, ich stehe davor.'])
            : s.category === 'wasser'
              ? 'Nein, ich stehe am Ufer.'
              : s.facts.trapped === true
                ? 'Nein, da komme ich nicht hin.'
                : pick(['Nein, ich stehe etwas weiter weg.', 'Nein, nicht direkt.']),
  },
  {
    id: 'sna_medizinisch',
    keys: / medizinisch| (erkrankt|erkrankung|krank) | rettungsdienst | notarzt | krankenwagen /,
    value: (s) => yn(medical(s) || (injuredN(s) ?? 0) > 0 || s.facts.trapped === true || s.category === 'wasser'),
    say: (v, pick, s) =>
      v === 'ja'
        ? medical(s)
          ? pick(['Ja, es geht um jemanden, dem es nicht gut geht.', 'Ja, medizinisch, es geht ihr nicht gut.'])
          : pick(['Ja, hier ist auch jemand betroffen.', 'Ja, es ist auch jemand betroffen.'])
        : pick(['Nein, verletzt oder krank ist hier niemand.', 'Nein, medizinisch ist hier nichts.']),
  },
  {
    id: 'sna_anzahl',
    keys: / (wie ?viele|anzahl)( \w+){0,3} \w*(person|leute|menschen|patient|verletzt|betroffen|kinder|insassen|beteiligt|erkrankt)/,
    value: (s) => {
      const n = injuredN(s);
      if (medical(s)) return Math.max(1, n ?? 1);
      if (s.category === 'wasser') return Math.max(1, n ?? 1);
      return Math.max(n ?? 0, s.facts.trapped === true ? 1 : 0);
    },
    count: (v) => Number(v),
    yes: (v) => Number(v) > 0,
    say: (v, pick, s) => {
      const n = Number(v);
      if (n <= 0) return pick(['Niemand, hier ist keiner verletzt.', 'Keiner, verletzt ist niemand.']);
      if (n === 1) return medical(s) ? pick(['Nur eine Person.', 'Eine, nur sie.']) : pick(['Eine Person.', 'Einer.']);
      return pick([`${cap(zahl(n))} Personen.`, `Ich sehe ${zahl(n)}.`]);
    },
  },
  {
    id: 'sna_alter_grenze',
    keys: / (ueber|unter|aelter als|juenger als|mindestens) \d+/,
    value: (s) => ageOf(s) ?? plausibleAge(s),
    yes: (v, q) => {
      const m = / (ueber|unter|aelter als|juenger als|mindestens) (\d+)/.exec(q);
      if (!m) return null;
      const n = Number(v);
      const lim = Number(m[2]);
      return m[1] === 'unter' || m[1] === 'juenger als' ? n < lim : m[1] === 'mindestens' ? n >= lim : n > lim;
    },
    say: (v, pick, s, q) => {
      const ok = TOPIC_BY_ID.sna_alter_grenze.yes!(v, q, s);
      return `${ok ? 'Ja' : 'Nein'}, ${pick(['sie ist', 'die ist'])} ${Number(v) < 1 ? 'ein Baby' : `${v}`}.`;
    },
  },
  {
    id: 'sna_alter',
    keys: / wie alt | alter | geburtsjahr| jahrgang/,
    value: (s) => ageOf(s) ?? (typeof s.facts.age === 'string' ? s.facts.age : plausibleAge(s)),
    count: (v) => (typeof v === 'number' ? v : null),
    say: (v, pick) => (typeof v === 'number' ? (v < 1 ? 'Ein Baby, ganz klein.' : pick([`Etwa ${v} Jahre.`, `So um die ${v}.`, `${v}, ungefähr.`])) : asSentence(str(v))),
  },
  {
    id: 'sna_eingeklemmt',
    keys: / eingeklemmt| eingeschlossen| eingesperrt| verschuettet| kommt nicht (mehr )?(raus|heraus)| befrei| gefangen/,
    value: (s) => (typeof s.facts.trapped === 'boolean' ? yn(s.facts.trapped) : yn(has(s, / (eingeklemmt|eingeschlossen|eingesperrt|verschuettet)| kommt nicht (mehr )?raus/))),
    say: (v, pick, s) =>
      v === 'ja'
        ? s.category === 'vu'
          ? pick(['Ja, da ist jemand eingeklemmt!', 'Ja! Der kommt nicht aus dem Auto raus!'])
          : s.category === 'brand'
            ? pick(['Ja, da ist noch jemand drin, der kommt nicht raus!', 'Ja! Da ist noch jemand drin!'])
            : pick(['Ja, da kommt jemand nicht raus!', 'Ja, die Person kommt da nicht raus!'])
        : s.category === 'vu'
          ? pick(['Nein, eingeklemmt ist keiner.', 'Nein, die sind alle raus.'])
          : s.category === 'brand'
            ? pick(['Nein, eingeschlossen ist keiner, alle sind draußen.', 'Nein, alle sind draußen.'])
            : pick(['Nein, eingeklemmt oder eingeschlossen ist niemand.', 'Nein, das nicht.']),
  },
  {
    id: 'sna_gefahrstoff',
    keys: /gefahrstoff|gefahrgut|chemikal|gasflasche|warntafel| auslauf| laeuft (\w+ ){0,2}aus|betriebsstoff/,
    value: (s) => yn(s.category === 'abc' || has(s, /gasflasche|chemik|gefahrgut|gefahrstoff|warntafel| benzin| diesel| oel /) || (str(s.facts.leak) !== '' && !/^(nein|nichts|kein)/i.test(str(s.facts.leak)))),
    say: (v, pick, s) =>
      v === 'ja'
        ? s.facts.substance
          ? `Ja. ${asSentence(str(s.facts.substance))}`
          : s.facts.leak
            ? `Ja. ${asSentence(str(s.facts.leak))}`
            : pick(['Ja, ich glaube schon.', 'Ja, da ist sowas.'])
        : pick(['Nein, sowas sehe ich nicht.', 'Nein, nicht dass ich wüsste.']),
  },
  {
    id: 'sna_gefahr',
    keys: / gefahr| bedroht| gefaehrd/,
    value: (s, q) => {
      // nach dem Anrufer selbst gefragt: er ist in Sicherheit (sonst würde er es sagen)
      if (/ (sind|bist) sie (\w+ )?(selbst |selber )?in gefahr| ihnen gefahr/.test(q)) return 'selbst_nein';
      if (s.facts.trapped === true || s.category === 'wasser' || s.facts.weapon === true) return 'ja';
      if (s.facts.conscious === false || s.facts.breathing === 'nein') return 'ja';
      const hz = str(s.facts.hazard);
      if (hz && !/^(nein|nicht|kein)/i.test(hz)) return 'ja';
      return 'nein';
    },
    say: (v, pick, s) => {
      if (v === 'selbst_nein') return pick(['Nein, ich bin hier sicher.', 'Nein, mir passiert hier nichts.']);
      if (v === 'nein') return pick(['Nein, in Gefahr ist im Moment niemand.', 'Nein, ich glaube nicht.']);
      if (s.category === 'wasser') return 'Ja, die Person ist doch im Wasser!';
      if (s.facts.trapped === true) return pick(['Ja, da kommt jemand nicht raus!', 'Ja! Da ist noch jemand drin!']);
      if (s.facts.weapon === true) return 'Ja, der hat ein Messer!';
      if (str(s.facts.hazard)) return `Ja. ${asSentence(str(s.facts.hazard))}`;
      return pick(['Ja, das sieht richtig schlimm aus!', 'Ja, ich glaube schon!']);
    },
  },
  {
    id: 'sna_atmung',
    keys: / atm| atem|luftnot| luft (bekommt|kriegt)| (bekommt|kriegt) (\w+ )?luft| schnapp/,
    value: (s) => {
      const b = s.facts.breathing;
      if (b === 'nein' || b === 'schwer' || b === 'normal') return b;
      if (outOfReach(s)) return 'unklar';
      if (s.facts.conscious === false && has(s, /leblos| atmet nicht| keine atmung|atemstillstand/)) return 'nein';
      if (has(s, /leblos|atemstillstand|atmet nicht mehr/)) return 'nein';
      if (has(s, /atemnot|luftnot|keine luft|pfeif|erstick|rauch eingeatmet|rauchvergiftung/)) return 'schwer';
      if (s.facts.intensive === true) return 'beatmet';
      if (nobodyHurt(s)) return 'niemand';
      return 'normal';
    },
    yes: (v, q) => {
      if (v === 'unklar') return null;
      if (/ schnapp/.test(q)) return v === 'nein';
      if (/ atmet (\w+ ){0,2}(nicht|gar nicht|kaum)| atemstillstand/.test(q)) return v === 'nein';
      if (/atemnot|luftnot|schwer|pfeif|keine luft|probleme/.test(q)) return v === 'schwer' || v === 'nein';
      if (/ normal| regelmaessig| ruhig/.test(q)) return v === 'normal' || v === 'niemand';
      return v !== 'nein';
    },
    option: (v, l) =>
      v === 'normal' || v === 'niemand' ? /normal/.test(l) : v === 'schwer' ? /erschwert|schwer|pfeif|unregel/.test(l) : v === 'nein' ? /gar nicht|schnapp|keine| nicht /.test(l) : /beatm/.test(l),
    say: (v, pick) =>
      v === 'unklar'
        ? pick(OUT_OF_REACH)
        : v === 'nein'
          ? pick(['Ich glaube, sie atmet nicht mehr!', 'Ich … ich seh nichts, ich glaub, sie atmet nicht!'])
        : v === 'schwer'
          ? pick(['Sie bekommt ganz schwer Luft!', 'Schwer, sie ringt richtig nach Luft.'])
          : v === 'beatmet'
            ? 'Der Patient wird beatmet.'
            : v === 'niemand'
              ? pick(['Hier hat keiner Probleme mit dem Atmen.', 'Atmen tun alle normal.'])
              : pick(['Ja, sie atmet normal.', 'Atmen tut sie ganz normal, ja.']),
  },
  {
    id: 'sna_bewusst',
    keys: / wach | ansprechbar| bewusst| reagiert| reagieren| reaktion| bei sich | ansprache| augen (auf|offen|geoeffnet)/,
    value: (s) => {
      if (typeof s.facts.conscious === 'boolean') return yn(s.facts.conscious);
      if (outOfReach(s)) return 'unklar';
      if (s.facts.intensive === true) return 'nein';
      if (has(s, /bewusstlos|reagiert nicht|leblos|regungslos|keine reaktion/)) return 'nein';
      if (s.category === 'wasser' && s.facts.visible === false) return 'unklar';
      if (nobodyHurt(s)) return 'niemand';
      return 'ja';
    },
    yes: (v, q) => (v === 'unklar' ? null : / bewusstlos| nicht (wach|ansprechbar)/.test(q) ? v === 'nein' : v === 'ja' || v === 'niemand'),
    say: (v, pick, s) =>
      v === 'ja'
        ? pick(['Ja, sie ist wach und reagiert.', 'Ja, wach ist sie, sie redet auch.'])
        : v === 'nein'
          ? s.facts.intensive === true
            ? 'Nein, der Patient ist sediert.'
            : pick(['Nein! Sie reagiert überhaupt nicht!', 'Nein, da kommt keine Reaktion!'])
          : v === 'niemand'
            ? pick(['Verletzt ist hier niemand, alle sind ansprechbar.', 'Alle sind wach, verletzt ist keiner.'])
            : pick(outOfReach(s) ? OUT_OF_REACH : DONT_KNOW),
  },
  {
    id: 'sna_krampf',
    keys: /krampf|gekrampft| zuck|epilep/,
    value: (s) => yn(has(s, /krampf|epilep| zuck/, true)),
    say: (v, pick) => (v === 'ja' ? pick(['Ja, sie hat gekrampft.', 'Ja, sie hatte einen Krampfanfall.']) : pick(['Nein, gekrampft hat sie nicht.', 'Nein, einen Krampfanfall hatte sie nicht.'])),
  },
  {
    id: 'sna_schwanger',
    keys: /schwanger|geburt| wehen|entbind|fruchtblase/,
    value: (s) => yn(has(s, /schwanger|geburt| wehen|entbind|fruchtblase/)),
    say: (v, pick) => (v === 'ja' ? pick(['Ja, sie ist schwanger.', 'Ja, schwanger ist sie.']) : pick(['Nein, schwanger ist sie nicht.', 'Nein, das nicht.'])),
  },
  {
    id: 'sna_blutung',
    keys: / blut/,
    value: (s) => (has(s, / blut|platzwunde|schnitt|stich/) ? (has(s, /stark|spritz|viel blut/) ? 'stark' : 'ja') : 'nein'),
    yes: (v, q) => (/ stark| viel| spritz| nicht aufhoer/.test(q) ? v === 'stark' : v !== 'nein'),
    say: (v, pick) => (v === 'stark' ? pick(['Ja, es blutet stark!', 'Ja, das blutet richtig stark!']) : v === 'ja' ? pick(['Ein bisschen, nicht so stark.', 'Etwas, aber nicht schlimm.']) : pick(['Nein, da blutet nichts.', 'Nein, Blut sehe ich keins.'])),
  },
  {
    id: 'sna_brust',
    keys: / brust| herz/,
    value: (s) => yn(has(s, / brust| herz|infarkt|angina/)),
    say: (v, pick) => (v === 'ja' ? pick(['Ja, sie hat Druck auf der Brust.', 'Ja, sie klagt über die Brust.']) : pick(['Nein, über die Brust klagt sie nicht.', 'Nein, das nicht.'])),
  },
  {
    id: 'sna_sturz',
    keys: /gestuerzt| sturz|gefallen|abgestuerzt/,
    value: (s) => yn(has(s, /gestuerzt| sturz|gefallen|abgestuerzt/)),
    say: (v, pick) => (v === 'ja' ? pick(['Ja, sie ist gestürzt.', 'Ja, sie ist hingefallen.']) : pick(['Nein, gestürzt ist sie nicht.', 'Nein, hingefallen ist sie nicht.'])),
  },
  {
    id: 'sna_verletzt',
    keys: /verletz| wunde/,
    value: (s) => {
      const n = injuredN(s);
      if (n !== undefined) return yn(n > 0);
      if (medical(s)) return yn(has(s, /verletz|wunde|bruch| blut|sturz|gestuerzt|unfall|schnitt|stich|platz|verbrenn/));
      return yn(s.facts.trapped === true);
    },
    say: (v, pick, s) => {
      const n = injuredN(s) ?? 1;
      if (v === 'ja') return n > 1 ? `Ja, ${zahl(n)} Verletzte.` : medical(s) ? pick(['Ja, verletzt ist sie.', 'Ja, sie hat sich verletzt.']) : pick(['Ja, eine Person ist verletzt.', 'Ja, einer ist verletzt.']);
      return medical(s) ? pick(['Verletzt ist sie nicht, nein.', 'Nein, verletzt nicht.']) : pick(['Nein, verletzt ist niemand.', 'Nein, keiner ist verletzt.']);
    },
  },
  {
    id: 'sna_sprechen',
    keys: / (sprechen|spricht|reden|redet|antwortet|antworten) /,
    value: (s) => {
      const b = TOPIC_BY_ID.sna_bewusst.value(s, '');
      if (b === 'nein' || s.facts.breathing === 'nein') return 'nein';
      if (has(s, /sprachstoer|satzfetzen|lallt|verwaschen/)) return 'eingeschraenkt';
      return 'ja';
    },
    yes: (v) => v !== 'nein',
    say: (v, pick) => (v === 'nein' ? pick(['Nein, sie sagt gar nichts!', 'Nein, sie spricht nicht!']) : v === 'eingeschraenkt' ? pick(['Kaum, sie bringt nur Wortfetzen raus.', 'Nur ganz undeutlich.']) : pick(['Ja, sie redet mit mir.', 'Ja, sprechen kann sie.'])),
  },
  {
    id: 'sna_kind',
    keys: / (kind|kinder|baby|saeugling|kleinkind|jugendlich\w*|minderjaehrig\w*) /,
    value: (s) => {
      const a = ageOf(s);
      if (a !== null) return yn(a < 14);
      return yn(has(s, / (kind|kinder|baby|saeugling) /));
    },
    say: (v, pick) => (v === 'ja' ? pick(['Ja, ein Kind.', 'Ja, es ist ein Kind.']) : pick(['Nein, Kinder sind nicht dabei.', 'Nein, kein Kind.'])),
  },
  {
    id: 'sna_brand',
    keys: / (brennt|brennen|feuer|brand|rauch|flammen|qualm|qualmt)/,
    value: (s) => yn(s.category === 'brand' || has(s, / (brennt|feuer|brand|rauch\w*|flammen|qualm\w*) /)),
    say: (v, pick, s) => (v === 'ja' ? (s.facts.smoke ? asSentence(str(s.facts.smoke)) : pick(['Ja, da brennt es.', 'Ja, da qualmt es.'])) : pick(['Nein, da brennt nichts.', 'Nein, Feuer oder Rauch sehe ich nicht.'])),
  },
  {
    id: 'sna_verkehr',
    keys: /verkehrsunfall|verunfallt| unfall| zusammenstoss| kollision| fahrzeug| auto | pkw| lkw| motorrad/,
    value: (s) => yn(s.category === 'vu' || has(s, /verkehrsunfall| unfall mit| (auto|pkw|lkw|motorrad) /)),
    say: (v, pick, s) => (v === 'ja' ? (s.category === 'vu' && s.facts.what ? `Ja. ${asSentence(str(s.facts.what))}` : pick(['Ja.', 'Ja, genau.'])) : pick(['Nein, mit einem Fahrzeug hat das nichts zu tun.', 'Nein, ein Unfall ist das nicht.'])),
  },
  {
    id: 'sna_wasser',
    keys: / (wasser|ertrunken|ertrinken|ertrinkt|untergegangen) /,
    value: (s) => yn(s.category === 'wasser' || has(s, / wasser |ertrunk|ertrink/)),
    say: (v, pick) => (v === 'ja' ? pick(['Ja, im Wasser!', 'Ja, die Person ist im Wasser.']) : pick(['Nein, mit Wasser hat das nichts zu tun.', 'Nein.'])),
  },
  {
    id: 'sna_fieber',
    keys: / fieber/,
    value: (s) => yn(has(s, / fieber/)),
    say: (v, pick) => (v === 'ja' ? pick(['Ja, sie hat Fieber.', 'Ja, sie glüht richtig.']) : pick(['Nein, Fieber hat sie nicht, glaube ich.', 'Nein, Fieber nicht.'])),
  },
  {
    id: 'sna_schmerz',
    keys: / schmerz| tut (\w+ )?weh/,
    value: (s) => yn(has(s, / schmerz| weh | druck/)),
    say: (v, pick, s) => (v === 'ja' ? (s.facts.symptoms ? asSentence(str(s.facts.symptoms)) : pick(['Ja, Schmerzen hat sie.', 'Ja, ihr tut was weh.'])) : pick(['Nein, Schmerzen hat sie keine, sagt sie.', 'Nein, von Schmerzen hat sie nichts gesagt.'])),
  },
];

const TOPIC_BY_ID = Object.fromEntries(TOPICS.map((t) => [t.id, t])) as Record<string, SnaTopic>;

export const isSnaTopic = (id: string) => id in TOPIC_BY_ID;
export const SNA_TOPIC_IDS = TOPICS.map((t) => t.id);

/** Thema einer Frage (normalisiert oder roh) – null, wenn keins passt */
export function topicOf(question: string): string | null {
  const q = question.startsWith(' ') ? question : normalize(question);
  return TOPICS.find((t) => t.keys.test(q))?.id ?? null;
}

/** Antwortsatz zu einem Thema (Fakten zuerst, sonst einmal festgelegt) */
export function answerTopic(s: SnaSource, topicId: string, pick: PickFn, question = ''): string {
  const t = TOPIC_BY_ID[topicId];
  const q = normalize(question);
  return sayPolar(t, t.value(s, q), pick, s, q);
}

/**
 * Antwortsatz passend zur Polung der Frage: "Ist die Person bewusstlos?" bei wacher Person →
 * "Nein, sie ist wach …" statt "Ja, …". Nur Themen mit eigener yes()-Auswertung; ohne Frage unverändert.
 */
function sayPolar(t: SnaTopic, v: Val, pick: PickFn, s: SnaSource, q: string): string {
  const text = t.say(v, pick, s, q);
  if (!t.yes || !q.trim()) return text;
  const y = t.yes(v, q, s);
  if (y === null) return text;
  const word = y ? 'Ja' : 'Nein';
  return text.replace(/^(Ja|Nein)\b/, word).replace(/, (ja|nein)([.!])$/, (_m, _w, end: string) => `, ${word.toLowerCase()}${end}`);
}

// ------------------------------------------------------------------ DIAS-Knoten

export type DiasAnswerKind = 'janein' | 'zahl' | 'auswahl' | 'alter' | 'freitext' | 'keine';

/** Beschriftung ohne Hinweise in Klammern */
const cleanLabel = (l: string) =>
  l
    .replace(/\s*\[[^\]]*\]\s*/g, ' ')
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
const isUnklar = (l: string) => /^\s*(unklar|unbekannt|weiss nicht|weiß nicht|keine angabe|nicht bekannt)/i.test(l);
const isJa = (l: string) => /^\s*ja\b/i.test(l);
const isNein = (l: string) => /^\s*nein\b/i.test(l);

/** Zahlbereich einer Antwortmöglichkeit ("Keine", "2", "3-6", "16-N", "mehr als 50", "1 Person") */
function rangeOf(label: string): [number, number] | null {
  const l = cleanLabel(label).toLowerCase().replace(/–/g, '-');
  if (/^keine?$/.test(l)) return [0, 0];
  let m = /^(\d+)( personen?)?$/.exec(l);
  if (m) return [Number(m[1]), Number(m[1])];
  m = /^(\d+)\s*-\s*(\d+)$/.exec(l);
  if (m) return [Number(m[1]), Number(m[2])];
  m = /^(?:(\d+)\s*-\s*n|mehr als (\d+)|>\s*(\d+)|(\d+) oder mehr|(\d+)\+)$/.exec(l);
  if (m) {
    const n = Number(m[1] ?? m[2] ?? m[3] ?? m[4] ?? m[5]);
    return [m[2] || m[3] ? n + 1 : n, Infinity];
  }
  return null;
}

/** Welche Art Antwort erwartet der Knoten? */
export function answerKindOf(node: Pick<DiasNode, 'kind' | 'options'>): DiasAnswerKind {
  if (node.kind === 'alter') return 'alter';
  if (node.kind === 'freitext' || node.kind === 'eingabe' || node.kind === 'koerperschema') return 'freitext';
  if (node.kind === 'ergebnis' || node.kind === 'ende' || !node.options.length) return 'keine';
  const labels = node.options.map((o) => o.label);
  const rest = labels.filter((l) => !isUnklar(l));
  if (labels.some(isJa) && labels.some(isNein) && rest.every((l) => isJa(l) || isNein(l))) return 'janein';
  if (rest.length && rest.every((l) => rangeOf(l) !== null)) return 'zahl';
  return 'auswahl';
}

export interface DiasReply {
  text: string;
  /** gewählte Antwortmöglichkeit (Index in options), null bei Eingaben oder unklar ohne Option */
  option: number | null;
  /** zugeordnetes Thema (sna_…) oder null */
  topic: string | null;
}

/** Inhaltswörter einer Frage (normalisiert, ohne Füllwörter) */
const STOP = new Set(
  'der die das den dem des ein eine einer einen einem sie ihr ihre ihnen ist sind war hat haben gibt es noch schon auch oder und mit von bei aus fuer auf ueber unter wie was wer wo wann welche welcher welches kann koennen nicht kein keine person patient patientin jemand denn mal bitte gerade jetzt sich'.split(
    ' ',
  ),
);
const contentWords = (t: string) =>
  normalize(t)
    .split(' ')
    .filter((x) => x.length >= 3 && !STOP.has(x));
const stem = (x: string) => x.slice(0, Math.min(x.length, 5));

/** Ähnelt das Gesagte der Frage? (Wortüberlappung, robust gegen Endungen) */
export function similarToQuestion(said: string, question: string): boolean {
  const qw = [...new Set(contentWords(question).map(stem))];
  if (!qw.length) return false;
  const sw = new Set(contentWords(said).map(stem));
  const hits = qw.filter((w) => sw.has(w)).length;
  const ratio = hits / qw.length;
  return (hits >= 2 && ratio >= 0.4) || (hits >= 1 && ratio >= 0.6);
}

/** Antwortmöglichkeit natürlich formulieren */
function sayOption(label: string, pick: PickFn): string {
  if (isUnklar(label)) return pick(DONT_KNOW);
  const l = cleanLabel(label).replace(/\s*\/\s*/g, ' oder ');
  if (!l) return pick(DONT_KNOW);
  return pick([asSentence(l), `${l}, würde ich sagen.`, `Ich würde sagen: ${l}.`]);
}

function sayRange(r: [number, number], pick: PickFn): string {
  if (r[1] === 0) return pick(['Keine.', 'Niemand.']);
  if (r[0] === r[1]) return pick([`${cap(r[0] === 1 ? 'eine' : zahl(r[0]))}.`, `Ungefähr ${r[0] === 1 ? 'eine' : zahl(r[0])}.`]);
  if (r[1] === Infinity) return `Mehr als ${zahl(Math.max(0, r[0] - 1))}, viele.`;
  return pick([`So ${zahl(r[0])} bis ${zahl(r[1])}.`, `Ungefähr ${zahl(Math.round((r[0] + r[1]) / 2))}.`]);
}

/** Stichwörter je Fachrichtung (für Auswahlfragen nach der Art des Notfalls) */
const CATEGORY_WORDS: Record<SnaSource['category'], string> = {
  brand: 'brand feuer brandschutz rauch',
  th: 'technisch hilfe notlage',
  vu: 'verkehrsunfall unfall fahrzeug',
  rd: 'medizinisch med notfall erkrankung',
  ktp: 'krankentransport transport',
  abc: 'gefahrstoff gefahrgut chemie',
  wasser: 'wasser wassernotfall',
  tier: 'tier tierrettung',
  pol: 'polizei',
  sonstiges: 'sonstiges',
};

/** Schlüssel für einmal festgelegte Antworten zu einem Knoten */
const nodeKey = (node: DiasNode) => `n_${node.id.replace(/[^a-zA-Z0-9_]/g, '_')}`;

/**
 * Beantwortet den aktuellen Abfrageknoten. Liefert null, wenn es dort nichts zu beantworten gibt
 * (Ergebnisseite, Ende).
 */
export function answerDiasNode(s: SnaSource, node: DiasNode, pick: PickFn): DiasReply | null {
  const kind = answerKindOf(node);
  if (kind === 'keine') return null;
  const q = normalize(node.question);
  const topicId = topicOf(q);
  const t = topicId ? TOPIC_BY_ID[topicId] : null;
  const opts = node.options;
  const idx = (f: (l: string) => boolean) => {
    const i = opts.findIndex((o) => f(o.label));
    return i >= 0 ? i : null;
  };

  if (kind === 'alter') return { text: answerTopic(s, 'sna_alter', pick), option: null, topic: 'sna_alter' };
  if (kind === 'freitext') {
    const what = node.kind === 'koerperschema' ? (s.facts.symptoms ?? s.facts.what) : s.facts.what;
    return { text: what ? asSentence(str(what)) : pick(DONT_KNOW), option: null, topic: null };
  }

  if (kind === 'janein') {
    if (t) {
      const v = t.value(s, q);
      const y = t.yes ? t.yes(v, q, s) : v === 'ja';
      return { text: sayPolar(t, v, pick, s, q), option: y === null ? idx(isUnklar) : idx(y ? isJa : isNein), topic: t.id };
    }
    const unk = idx(isUnklar);
    const v = plausible(s, nodeKey(node), [['nein', 5], ['ja', 3], ...(unk !== null ? ([['unklar', 2]] as [Val, number][]) : [])]);
    return { text: pick(v === 'ja' ? JA : v === 'nein' ? NEIN : DONT_KNOW), option: v === 'ja' ? idx(isJa) : v === 'nein' ? idx(isNein) : unk, topic: null };
  }

  if (kind === 'zahl') {
    const ranges = opts.map((o) => rangeOf(o.label));
    if (t && (t.count || t.yes)) {
      const v = t.value(s, q);
      const n = t.count ? t.count(v) : t.yes!(v, q, s) ? 1 : 0;
      if (n !== null) {
        const i = ranges.findIndex((r) => r !== null && n >= r[0] && n <= r[1]);
        return { text: t.say(v, pick, s, q), option: i >= 0 ? i : idx(isUnklar), topic: t.id };
      }
    }
    // ohne Fakt: eher kleine Zahlen
    const choices = ranges.map((r, i) => [String(i), r ? 1 / (i + 1) : 0] as [Val, number]).filter(([, w]) => w > 0);
    const i = Number(plausible(s, nodeKey(node), choices));
    return { text: sayRange(ranges[i]!, pick), option: i, topic: null };
  }

  // Auswahl: Thema → Option, sonst Überlappung mit den Szenariotexten, sonst einmal festgelegt
  if (t?.option) {
    const v = t.value(s, q);
    const i = idx((l) => t.option!(v, normalize(cleanLabel(l))));
    if (i !== null) return { text: t.say(v, pick, s, q), option: i, topic: t.id };
  }
  const known = s.facts[`x_dias_${nodeKey(node)}`];
  if (known === undefined) {
    const scene = [...new Set([...contentWords(sceneText(s, true)), ...CATEGORY_WORDS[s.category].split(' ')].map(stem))];
    const near = (w: string) => scene.some((x) => x === stem(w) || (Math.min(x.length, w.length) >= 3 && (x.startsWith(w) || w.startsWith(x))));
    let best = -1;
    let bestScore = 0;
    opts.forEach((o, i) => {
      if (isUnklar(o.label)) return;
      const score = contentWords(cleanLabel(o.label)).filter(near).length;
      if (score > bestScore) {
        best = i;
        bestScore = score;
      }
    });
    if (best >= 0) s.facts[`x_dias_${nodeKey(node)}`] = String(best);
  }
  const choices = opts.map((o, i) => [String(i), isUnklar(o.label) ? 0.5 : 2] as [Val, number]);
  const i = Number(plausible(s, nodeKey(node), choices));
  return { text: sayOption(opts[i].label, pick), option: i, topic: null };
}

// ------------------------------------------------------------------ freie Fragen und Anweisungen

const W_QUESTION = /^ (wo|wie|was|wer|wann|warum|weshalb|wieso|weswegen|welche\w*|wohin|woher|wieviel\w*|womit|wodurch) /;
const V_QUESTION = /^ (ist|sind|war|waren|hat|haben|hatte|hatten|gibt|gab|kann|koennen|konnte|muss|muessen|wird|werden|wurde|wurden|darf|duerfen|soll|sollen|atmet|blutet|liegt|steht|brennt|sehen|hoeren|wissen|kennen|riecht|reagiert|spricht|nimmt|leidet|befindet|bewegt|klagt) \w/;
const INSTRUCTION = /^ (?:\w+ )?(gehen|schauen|gucken|sehen|verlassen|schliessen|bleiben|legen|machen|oeffnen|halten|warten|druecken|stellen|bringen|holen|schicken|loeschen|beginnen|fangen|nehmen|lassen|sagen|rufen|pruefen|kontrollieren|versuchen|achten|setzen|drehen|ziehen|sorgen|fassen|beruhigen|decken|kuemmern) sie /;
const FILL = /^ (?:(?:ok|okay|so|aeh|aehm|gut|also|bitte|dann|jetzt|und|ja|na|hm) )*/;
const INSTR_TAIL = / (mal|bitte|nach|hin|raus|rein|herum|ab|zu|auf|nach ob|ob) /;

export type FreeKind = 'frage_w' | 'frage_janein' | 'anweisung' | null;

/** Erkennbare Frage (Fragewort oder Verb vorn) oder Anweisung ("Schauen Sie nach …") */
export function classifyFree(utterance: string): FreeKind {
  const raw = utterance.trim();
  const t = normalize(raw).replace(FILL, ' ');
  if (t.trim().split(' ').length < 2) return null;
  const isQ = raw.endsWith('?');
  if (W_QUESTION.test(t)) return 'frage_w';
  if (INSTRUCTION.test(t) && !isQ && (INSTR_TAIL.test(t) || !/^ (sehen|hoeren) sie /.test(t))) return 'anweisung';
  if (V_QUESTION.test(t) || isQ) return 'frage_janein';
  return null;
}

/**
 * Letzte Rückfallebene für eine erkennbare Frage ohne Muster: Thema aus der Stichworttabelle,
 * sonst bei Ja/Nein-Fragen eine einmal festgelegte plausible Antwort, sonst "weiß ich nicht genau".
 */
export function answerFree(s: SnaSource, utterance: string, kind: Exclude<FreeKind, null>, pick: PickFn): { text: string; topic: string | null } {
  if (kind === 'anweisung') return { text: pick(['Okay, mach ich.', 'Ja, okay, mach ich.', 'Gut, mach ich.']), topic: null };
  const q = normalize(utterance);
  const topicId = topicOf(q);
  if (topicId) return { text: answerTopic(s, topicId, pick, utterance), topic: topicId };
  if (kind === 'frage_w') return { text: pick(DONT_KNOW), topic: null };
  const key = `f_${hashSeed([...new Set(contentWords(utterance))].sort().join(' ')).toString(36)}`;
  const v = plausible(s, key, [['nein', 5], ['ja', 3], ['unklar', 2]]);
  return { text: pick(v === 'ja' ? JA : v === 'nein' ? NEIN : DONT_KNOW), topic: null };
}
