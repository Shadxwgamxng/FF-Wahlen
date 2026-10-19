import type { KeywordCategory } from '../model/types';

export type FactValue = string | number | boolean;
export type Facts = Record<string, FactValue>;

/** Wählt eine von mehreren gleichwertigen Formulierungen (Standard: die erste) */
export type Pick = <T>(alts: readonly T[]) => T;
export const firstPick: Pick = (alts) => alts[0];

export interface QuestionDef {
  id: string;
  text: string;
  /**
   * Erzeugt die Antwort des Anrufers aus den (verdeckten) Fakten des Notrufs.
   * pick wählt zwischen gleichwertigen Formulierungen – der Inhalt ist in jeder Variante derselbe.
   */
  answer: (facts: Facts, pick?: Pick) => string;
}

const yesNo = (v: FactValue | undefined, pick: Pick, yes: readonly string[], no: readonly string[], unknown: readonly string[] = DONT_KNOW) =>
  pick(v === true ? yes : v === false ? no : unknown);

const DONT_KNOW = ['Das weiß ich nicht genau.', 'Weiß ich nicht genau, ehrlich gesagt.', 'Hm … das kann ich Ihnen nicht sagen.'];
const CANT_SAY = ['Das kann ich nicht sagen.', 'Kann ich nicht sagen.', 'Das weiß ich leider nicht.'];

const count = (v: FactValue | undefined, pick: Pick, none: readonly string[], one: readonly string[], many: (n: number) => readonly string[]) => {
  const n = typeof v === 'number' ? v : 0;
  return pick(n <= 0 ? none : n === 1 ? one : many(n));
};

/** Fakt als Satz – mit wechselndem Einstieg ("Also, …", "Na, …") nur, wo der Fakt ein ganzer Satz ist */
const text = (v: FactValue | undefined, pick: Pick, fallback: readonly string[] = CANT_SAY) => (v === undefined || v === '' ? pick(fallback) : String(v));

/** Fragen, die in jedem Notruf gestellt werden können */
export const COMMON_QUESTIONS: QuestionDef[] = [
  {
    id: 'ort',
    text: 'Wo genau ist der Notfallort? (Ort, Straße, Hausnummer)',
    answer: (f, pick = firstPick) => pick([`${text(f._address, pick)}${f._detail ? ` – ${f._detail}` : ''}.`, `Das ist ${text(f._address, pick)}${f._detail ? `, ${f._detail}` : ''}.`, `Wir sind hier ${text(f._address, pick)}${f._detail ? ` – ${f._detail}` : ''}.`]),
  },
  { id: 'was', text: 'Was ist genau passiert?', answer: (f, pick = firstPick) => text(f.what, pick) },
  { id: 'rueckruf', text: 'Unter welcher Nummer sind Sie erreichbar?', answer: (f, pick = firstPick) => pick([`Meine Nummer ist ${text(f._phone, pick)}.`, `${text(f._phone, pick)}, das ist mein Handy.`, `Unter ${text(f._phone, pick)}.`]) },
];

const injured: QuestionDef = {
  id: 'verletzt',
  text: 'Gibt es Verletzte? Wie viele?',
  answer: (f, pick = firstPick) =>
    count(
      f.injured,
      pick,
      ['Nein, verletzt ist niemand – soweit ich sehe.', 'Nein, ich glaub nicht. Verletzt ist keiner, soweit ich sehe.', 'Verletzt? Nein … nein, soweit ich sehe, niemand.'],
      ['Ja, eine Person ist verletzt.', 'Ja, einer ist verletzt.', 'Eine Person ist verletzt, ja.'],
      (n) => [`Ja, ich sehe ${n} Verletzte!`, `${n} Verletzte, ich seh ${n} Verletzte!`, `Ja! ${n} Verletzte, mindestens!`],
    ),
};

export const CATEGORY_QUESTIONS: Record<KeywordCategory, QuestionDef[]> = {
  brand: [
    { id: 'b_objekt', text: 'Was brennt genau?', answer: (f, pick = firstPick) => text(f.object, pick) },
    { id: 'b_rauch', text: 'Sehen Sie Rauch oder Flammen? Wo?', answer: (f, pick = firstPick) => text(f.smoke, pick) },
    {
      id: 'b_personen',
      text: 'Sind noch Personen im Gebäude oder im Gefahrenbereich?',
      answer: (f, pick = firstPick) =>
        yesNo(f.trapped, pick, ['Ja! Da ist noch jemand drin, ich höre Rufe!', 'Ja, da ist noch jemand drin! Ich hör den rufen!', 'Ja … ja, da ruft noch jemand, die Person ist noch drin!'], ['Nein, alle sind draußen.', 'Nein, nein, wir sind alle raus.', 'Nein, alle sind draußen, wir stehen auf der Straße.']),
    },
    injured,
    { id: 'b_stock', text: 'In welchem Stockwerk / Gebäudeteil?', answer: (f, pick = firstPick) => text(f.floor, pick, ['Das kann ich von hier nicht sehen.', 'Kann ich von hier nicht erkennen.']) },
    {
      id: 'b_ausbreitung',
      text: 'Breitet sich das Feuer aus?',
      answer: (f, pick = firstPick) =>
        yesNo(f.spreading, pick, ['Ja, es wird immer schlimmer, die Flammen schlagen schon raus!', 'Ja! Das wird immer mehr, jetzt kommen schon Flammen raus!', 'Ja, es wird schlimmer … die Flammen schlagen jetzt raus!'], ['Nein, es scheint begrenzt zu sein.', 'Nee, es wird nicht mehr, glaub ich. Scheint begrenzt zu sein.', 'Nein, sieht nicht so aus, es bleibt da, wo es ist.']),
    },
  ],
  th: [
    { id: 'th_hilfe', text: 'Welche Hilfe wird genau benötigt?', answer: (f, pick = firstPick) => text(f.help, pick, [text(f.what, pick)]) },
    {
      id: 'th_personen',
      text: 'Sind Personen in Gefahr, eingeschlossen oder eingeklemmt?',
      answer: (f, pick = firstPick) => yesNo(f.trapped, pick, ['Ja, da ist jemand gefangen und kommt nicht raus!', 'Ja! Da kommt jemand nicht raus, der ist gefangen!'], ['Nein, niemand ist in Gefahr.', 'Nein, in Gefahr ist keiner.']),
    },
    { id: 'th_gefahr', text: 'Besteht eine akute Gefahr (Strom, Gas, Einsturz, Wasser)?', answer: (f, pick = firstPick) => text(f.hazard, pick, ['Nicht dass ich wüsste.', 'Nee, nicht dass ich wüsste.', 'Ich glaube nicht, nein.']) },
    injured,
  ],
  vu: [
    { id: 'vu_fzg', text: 'Wie viele und welche Fahrzeuge sind beteiligt?', answer: (f, pick = firstPick) => text(f.vehicles, pick) },
    {
      id: 'vu_eingeklemmt',
      text: 'Ist jemand eingeklemmt oder kommt nicht aus dem Fahrzeug?',
      answer: (f, pick = firstPick) =>
        yesNo(f.trapped, pick, ['Ja, der Fahrer ist eingeklemmt, die Tür geht nicht auf!', 'Ja! Der Fahrer ist eingeklemmt, wir kriegen die Tür nicht auf!', 'Der Fahrer … der ist eingeklemmt, ja, die Tür geht nicht auf!'], ['Nein, alle sind ausgestiegen.', 'Nein, eingeklemmt ist keiner, die sind alle raus.', 'Nee, ausgestiegen sind alle.']),
    },
    injured,
    { id: 'vu_auslauf', text: 'Laufen Betriebsstoffe aus, raucht oder brennt etwas?', answer: (f, pick = firstPick) => text(f.leak, pick, ['Nein, nichts zu sehen.', 'Nee, da sehe ich nichts.', 'Nein, da läuft nichts aus, soweit ich sehe.']) },
    { id: 'vu_strasse', text: 'Auf welcher Straße, in welche Fahrtrichtung?', answer: (f, pick = firstPick) => text(f.road, pick, ['Auf der Hauptstraße, mitten im Ort.']) },
  ],
  rd: [
    {
      id: 'rd_alter',
      text: 'Wie alt ist die betroffene Person ungefähr?',
      answer: (f, pick = firstPick) => (typeof f.age === 'number' ? pick([`Etwa ${f.age} Jahre.`, `So um die ${f.age}.`, `${f.age}, ungefähr.`, `Ich schätze mal ${f.age}.`]) : text(f.age, pick)),
    },
    {
      id: 'rd_bewusst',
      text: 'Ist die Person wach und ansprechbar?',
      answer: (f, pick = firstPick) => yesNo(f.conscious, pick, ['Ja, sie redet mit mir.', 'Ja, ja, sie spricht mit mir.', 'Ja, die Person ist wach, sie redet.'], ['Nein! Sie reagiert überhaupt nicht!', 'Nein, sie reagiert gar nicht! Überhaupt nicht!', 'Nein … nein, da kommt keine Reaktion!']),
    },
    {
      id: 'rd_atmung',
      text: 'Atmet die Person normal?',
      answer: (f, pick = firstPick) =>
        pick(
          f.breathing === 'nein'
            ? ['Ich glaube, sie atmet nicht mehr!', 'Ich … ich glaub, sie atmet nicht mehr!', 'Ich seh nichts, ich glaube, sie atmet nicht!']
            : f.breathing === 'schwer'
              ? ['Sie bekommt ganz schwer Luft, es pfeift richtig.', 'Ganz schwer, sie kriegt kaum Luft, das pfeift richtig.', 'Schwer … sie ringt richtig nach Luft, es pfeift.']
              : ['Ja, sie atmet.', 'Ja, sie atmet normal, glaub ich.', 'Ja, atmen tut sie.'],
        ),
    },
    { id: 'rd_beschwerden', text: 'Welche Beschwerden hat die Person?', answer: (f, pick = firstPick) => text(f.symptoms, pick) },
    { id: 'rd_vorerkrankung', text: 'Sind Vorerkrankungen oder Medikamente bekannt?', answer: (f, pick = firstPick) => text(f.history, pick, ['Davon weiß ich nichts.', 'Weiß ich nicht, davon hat sie mir nie was erzählt.', 'Keine Ahnung, ehrlich.']) },
  ],
  ktp: [
    { id: 'ktp_ziel', text: 'Von wo nach wo soll der Transport gehen?', answer: (f, pick = firstPick) => text(f.target, pick) },
    { id: 'ktp_mobil', text: 'Kann der Patient sitzen oder muss er liegend transportiert werden?', answer: (f, pick = firstPick) => text(f.mobility, pick) },
    { id: 'ktp_infekt', text: 'Liegt eine Infektionskrankheit vor?', answer: (f, pick = firstPick) => yesNo(f.infection, pick, [`Ja: ${text(f.pathogen, pick, ['multiresistente Keime'])}.`, `Ja, ${text(f.pathogen, pick, ['multiresistente Keime'])}.`], ['Nein, nichts bekannt.', 'Nein, ist nichts bekannt.']) },
    { id: 'ktp_zeit', text: 'Wann soll der Transport erfolgen?', answer: (f, pick = firstPick) => text(f.when, pick, ['So bald wie möglich.', 'Am besten so bald wie möglich.']) },
    { id: 'ktp_intensiv', text: 'Ist der Patient beatmet oder intensivpflichtig?', answer: (f, pick = firstPick) => yesNo(f.intensive, pick, ['Ja, beatmet mit laufenden Perfusoren.', 'Ja, der ist beatmet, Perfusoren laufen.'], ['Nein, stabil.', 'Nein, der ist stabil.']) },
  ],
  abc: [
    { id: 'abc_stoff', text: 'Um welchen Stoff handelt es sich? Gibt es Warntafeln oder Kennzeichnungen?', answer: (f, pick = firstPick) => text(f.substance, pick) },
    { id: 'abc_menge', text: 'Wie viel tritt aus?', answer: (f, pick = firstPick) => text(f.amount, pick, ['Das kann ich nicht einschätzen.', 'Kann ich echt nicht einschätzen.']) },
    { id: 'abc_wolke', text: 'Gibt es Geruch oder eine sichtbare Wolke?', answer: (f, pick = firstPick) => text(f.cloud, pick, ['Es riecht etwas komisch.', 'Riecht irgendwie komisch hier.']) },
    injured,
  ],
  wasser: [
    { id: 'w_sicht', text: 'Ist die Person noch zu sehen?', answer: (f, pick = firstPick) => yesNo(f.visible, pick, ['Ja, sie treibt noch an der Oberfläche!', 'Ja! Ich seh sie noch, sie treibt oben!'], ['Nein, ich sehe sie nicht mehr!', 'Nein! Sie ist weg, ich seh sie nicht mehr!']) },
    { id: 'w_gewaesser', text: 'Welches Gewässer, wo genau?', answer: (f, pick = firstPick) => text(f.water, pick) },
    injured,
  ],
  tier: [
    { id: 't_tier', text: 'Um welches Tier handelt es sich?', answer: (f, pick = firstPick) => text(f.animal, pick) },
    { id: 't_lage', text: 'Wo befindet sich das Tier, ist es verletzt?', answer: (f, pick = firstPick) => text(f.situation, pick) },
  ],
  pol: [
    { id: 'p_beteiligte', text: 'Wer ist beteiligt, wie viele Personen?', answer: (f, pick = firstPick) => text(f.persons, pick) },
    { id: 'p_waffe', text: 'Sind Waffen im Spiel oder wird jemand bedroht?', answer: (f, pick = firstPick) => yesNo(f.weapon, pick, ['Ja, einer hat ein Messer!', 'Ja! Einer hat ein Messer in der Hand!'], ['Nein, Waffen sehe ich keine.', 'Nee, Waffen seh ich keine.']) },
    injured,
  ],
  sonstiges: [
    { id: 's_lage', text: 'Was sehen oder hören Sie genau?', answer: (f, pick = firstPick) => text(f.help, pick, [text(f.what, pick)]) },
    injured,
  ],
};

export function questionsFor(category: KeywordCategory): QuestionDef[] {
  return [...COMMON_QUESTIONS, ...CATEGORY_QUESTIONS[category]];
}

export function findQuestion(category: KeywordCategory, id: string): QuestionDef | undefined {
  return questionsFor(category).find((q) => q.id === id);
}
