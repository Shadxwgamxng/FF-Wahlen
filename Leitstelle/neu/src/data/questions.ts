import type { KeywordCategory } from '../model/types';

export type FactValue = string | number | boolean;
export type Facts = Record<string, FactValue>;

export interface QuestionDef {
  id: string;
  text: string;
  /** Erzeugt die Antwort des Anrufers aus den (verdeckten) Fakten des Notrufs */
  answer: (facts: Facts) => string;
}

const yesNo = (v: FactValue | undefined, yes: string, no: string, unknown = 'Das weiß ich nicht genau.') =>
  v === true ? yes : v === false ? no : unknown;

const count = (v: FactValue | undefined, none: string, one: string, many: (n: number) => string) => {
  const n = typeof v === 'number' ? v : 0;
  return n <= 0 ? none : n === 1 ? one : many(n);
};

const text = (v: FactValue | undefined, fallback = 'Das kann ich nicht sagen.') =>
  v === undefined || v === '' ? fallback : String(v);

/** Fragen, die in jedem Notruf gestellt werden können */
export const COMMON_QUESTIONS: QuestionDef[] = [
  {
    id: 'ort',
    text: 'Wo genau ist der Notfallort? (Ort, Straße, Hausnummer)',
    answer: (f) => `${text(f._address)}${f._detail ? ` – ${f._detail}` : ''}.`,
  },
  { id: 'was', text: 'Was ist genau passiert?', answer: (f) => text(f.what) },
  { id: 'rueckruf', text: 'Unter welcher Nummer sind Sie erreichbar?', answer: (f) => `Meine Nummer ist ${text(f._phone)}.` },
];

const injured: QuestionDef = {
  id: 'verletzt',
  text: 'Gibt es Verletzte? Wie viele?',
  answer: (f) =>
    count(f.injured, 'Nein, verletzt ist niemand – soweit ich sehe.', 'Ja, eine Person ist verletzt.', (n) => `Ja, ich sehe ${n} Verletzte!`),
};

export const CATEGORY_QUESTIONS: Record<KeywordCategory, QuestionDef[]> = {
  brand: [
    { id: 'b_objekt', text: 'Was brennt genau?', answer: (f) => text(f.object) },
    { id: 'b_rauch', text: 'Sehen Sie Rauch oder Flammen? Wo?', answer: (f) => text(f.smoke) },
    {
      id: 'b_personen',
      text: 'Sind noch Personen im Gebäude oder im Gefahrenbereich?',
      answer: (f) => yesNo(f.trapped, 'Ja! Da ist noch jemand drin, ich höre Rufe!', 'Nein, alle sind draußen.'),
    },
    injured,
    { id: 'b_stock', text: 'In welchem Stockwerk / Gebäudeteil?', answer: (f) => text(f.floor, 'Das kann ich von hier nicht sehen.') },
    {
      id: 'b_ausbreitung',
      text: 'Breitet sich das Feuer aus?',
      answer: (f) => yesNo(f.spreading, 'Ja, es wird immer schlimmer, die Flammen schlagen schon raus!', 'Nein, es scheint begrenzt zu sein.'),
    },
  ],
  th: [
    { id: 'th_hilfe', text: 'Welche Hilfe wird genau benötigt?', answer: (f) => text(f.help, text(f.what)) },
    {
      id: 'th_personen',
      text: 'Sind Personen in Gefahr, eingeschlossen oder eingeklemmt?',
      answer: (f) => yesNo(f.trapped, 'Ja, da ist jemand gefangen und kommt nicht raus!', 'Nein, niemand ist in Gefahr.'),
    },
    { id: 'th_gefahr', text: 'Besteht eine akute Gefahr (Strom, Gas, Einsturz, Wasser)?', answer: (f) => text(f.hazard, 'Nicht dass ich wüsste.') },
    injured,
  ],
  vu: [
    { id: 'vu_fzg', text: 'Wie viele und welche Fahrzeuge sind beteiligt?', answer: (f) => text(f.vehicles) },
    {
      id: 'vu_eingeklemmt',
      text: 'Ist jemand eingeklemmt oder kommt nicht aus dem Fahrzeug?',
      answer: (f) => yesNo(f.trapped, 'Ja, der Fahrer ist eingeklemmt, die Tür geht nicht auf!', 'Nein, alle sind ausgestiegen.'),
    },
    injured,
    { id: 'vu_auslauf', text: 'Laufen Betriebsstoffe aus, raucht oder brennt etwas?', answer: (f) => text(f.leak, 'Nein, nichts zu sehen.') },
    { id: 'vu_strasse', text: 'Auf welcher Straße, in welche Fahrtrichtung?', answer: (f) => text(f.road, 'Auf der Hauptstraße, mitten im Ort.') },
  ],
  rd: [
    { id: 'rd_alter', text: 'Wie alt ist die betroffene Person ungefähr?', answer: (f) => (typeof f.age === 'number' ? `Etwa ${f.age} Jahre.` : text(f.age)) },
    {
      id: 'rd_bewusst',
      text: 'Ist die Person wach und ansprechbar?',
      answer: (f) => yesNo(f.conscious, 'Ja, sie redet mit mir.', 'Nein! Sie reagiert überhaupt nicht!'),
    },
    {
      id: 'rd_atmung',
      text: 'Atmet die Person normal?',
      answer: (f) => (f.breathing === 'nein' ? 'Ich glaube, sie atmet nicht mehr!' : f.breathing === 'schwer' ? 'Sie bekommt ganz schwer Luft, es pfeift richtig.' : 'Ja, sie atmet.'),
    },
    { id: 'rd_beschwerden', text: 'Welche Beschwerden hat die Person?', answer: (f) => text(f.symptoms) },
    { id: 'rd_vorerkrankung', text: 'Sind Vorerkrankungen oder Medikamente bekannt?', answer: (f) => text(f.history, 'Davon weiß ich nichts.') },
  ],
  ktp: [
    { id: 'ktp_ziel', text: 'Von wo nach wo soll der Transport gehen?', answer: (f) => text(f.target) },
    { id: 'ktp_mobil', text: 'Kann der Patient sitzen oder muss er liegend transportiert werden?', answer: (f) => text(f.mobility) },
    { id: 'ktp_infekt', text: 'Liegt eine Infektionskrankheit vor?', answer: (f) => yesNo(f.infection, `Ja: ${text(f.pathogen, 'multiresistente Keime')}.`, 'Nein, nichts bekannt.') },
    { id: 'ktp_zeit', text: 'Wann soll der Transport erfolgen?', answer: (f) => text(f.when, 'So bald wie möglich.') },
    { id: 'ktp_intensiv', text: 'Ist der Patient beatmet oder intensivpflichtig?', answer: (f) => yesNo(f.intensive, 'Ja, beatmet mit laufenden Perfusoren.', 'Nein, stabil.') },
  ],
  abc: [
    { id: 'abc_stoff', text: 'Um welchen Stoff handelt es sich? Gibt es Warntafeln oder Kennzeichnungen?', answer: (f) => text(f.substance) },
    { id: 'abc_menge', text: 'Wie viel tritt aus?', answer: (f) => text(f.amount, 'Das kann ich nicht einschätzen.') },
    { id: 'abc_wolke', text: 'Gibt es Geruch oder eine sichtbare Wolke?', answer: (f) => text(f.cloud, 'Es riecht etwas komisch.') },
    injured,
  ],
  wasser: [
    { id: 'w_sicht', text: 'Ist die Person noch zu sehen?', answer: (f) => yesNo(f.visible, 'Ja, sie treibt noch an der Oberfläche!', 'Nein, ich sehe sie nicht mehr!') },
    { id: 'w_gewaesser', text: 'Welches Gewässer, wo genau?', answer: (f) => text(f.water) },
    injured,
  ],
  tier: [
    { id: 't_tier', text: 'Um welches Tier handelt es sich?', answer: (f) => text(f.animal) },
    { id: 't_lage', text: 'Wo befindet sich das Tier, ist es verletzt?', answer: (f) => text(f.situation) },
  ],
  pol: [
    { id: 'p_beteiligte', text: 'Wer ist beteiligt, wie viele Personen?', answer: (f) => text(f.persons) },
    { id: 'p_waffe', text: 'Sind Waffen im Spiel oder wird jemand bedroht?', answer: (f) => yesNo(f.weapon, 'Ja, einer hat ein Messer!', 'Nein, Waffen sehe ich keine.') },
    injured,
  ],
  sonstiges: [
    { id: 's_lage', text: 'Was sehen oder hören Sie genau?', answer: (f) => text(f.help, text(f.what)) },
    injured,
  ],
};

export function questionsFor(category: KeywordCategory): QuestionDef[] {
  return [...COMMON_QUESTIONS, ...CATEGORY_QUESTIONS[category]];
}

export function findQuestion(category: KeywordCategory, id: string): QuestionDef | undefined {
  return questionsFor(category).find((q) => q.id === id);
}
