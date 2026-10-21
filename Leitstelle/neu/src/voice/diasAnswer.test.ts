import { describe, expect, it } from 'vitest';
import type { KeywordCategory } from '../model/types';
import type { Facts } from '../data/questions';
import type { DiasNode } from '../dias/model';
import { SCENARIOS } from '../data/scenarios';
import { resolveFact } from '../sim/callgen';
import { Rng } from '../sim/rng';
import { CallerSim, type VoiceCall } from './caller';
import { allPhrases } from './style';
import { answerDiasNode, answerKindOf, answerTopic, classifyFree, similarToQuestion, type SnaSource } from './diasAnswer';

/** Notruf einer Fachrichtung wie im Spiel (Szenario, Variante, Ort) */
function callOf(category: KeywordCategory, nth = 0, seed = 1, variant = -1): VoiceCall {
  const sc = SCENARIOS.filter((s) => s.category === category)[nth];
  const v = variant >= 0 ? sc.variants?.[variant] : undefined;
  const rng = new Rng(seed * 31 + nth);
  const facts: Facts = {};
  for (const [k, spec] of Object.entries({ ...sc.facts, ...(v?.facts ?? {}) })) facts[k] = resolveFact(spec, rng);
  facts._address = `Teststraße ${seed}, 23701 Eutin`;
  facts._detail = 'Mehrfamilienhaus, Eingang links';
  facts._phone = `04521 ${100000 + seed}`;
  const relation = { brand: 'Nachbar/-in', vu: 'Zeuge/Zeugin', rd: 'Angehörige/-r', ktp: 'Pflegekraft' }[category as string] ?? 'Anrufer/-in';
  return {
    scenarioId: sc.id,
    scenarioName: sc.name,
    variantIdx: variant,
    category,
    opening: sc.openings[0],
    caller: { name: 'Petersen', relation, phone: String(facts._phone) },
    facts,
    location: { position: [54.1, 10.6], address: String(facts._address), areaId: 'a', detail: String(facts._detail), street: 'Teststraße', houseNumber: String(seed), postcode: '23701', city: 'Eutin' },
  };
}

/** Anrufer nach der Eröffnung */
function simOf(call: VoiceCall): CallerSim {
  const sim = new CallerSim(call);
  sim.respond('Notruf Feuerwehr und Rettungsdienst.');
  return sim;
}

const RUECKFRAGE = [...allPhrases('nichtVerstanden'), ...allPhrases('nichtVerstanden2')];
const isRueckfrage = (t: string) => RUECKFRAGE.some((p) => t.includes(p));

/** Eigener kleiner Testknoten – keine echten DIAS-Texte */
const node = (id: string, question: string, labels: string[], kind: DiasNode['kind'] = 'frage'): DiasNode => ({
  id,
  question,
  html: question,
  kind,
  options: labels.map((label, i) => ({ code: String(i + 1), label, to: `z${i}` })),
  dialog: null,
  result: null,
});

describe('Allgemeine Abfragefragen', () => {
  const QUESTIONS = [
    'Sind Sie bei der Person?',
    'Sind Sie selbst betroffen?',
    'Weshalb rufen Sie an?',
    'Handelt es sich um einen medizinischen Notfall?',
    'Gab es einen Krampfanfall?',
    'Wie viele Personen sind betroffen?',
    'Ist die Person in Gefahr?',
    'Atmet die Person normal?',
    'Ist die Person wach?',
    'Sind Kinder beteiligt?',
    'Hat die Person Fieber?',
    'Ist die Person über 16 Jahre alt?',
  ];
  for (const cat of ['brand', 'vu', 'rd', 'ktp'] as KeywordCategory[])
    it(`${cat}: keine Rückfrage, sondern eine Antwort`, () => {
      const sim = simOf(callOf(cat));
      for (const q of QUESTIONS) {
        const r = sim.respond(q);
        expect(isRueckfrage(r.text), `${cat}: "${q}" → "${r.text}"`).toBe(false);
        expect(r.understood, q).toBe(true);
        expect(r.content.length, q).toBeGreaterThan(0);
      }
    });
});

const nthOf = (category: KeywordCategory, f: (facts: Record<string, unknown>) => boolean) => SCENARIOS.filter((s) => s.category === category).findIndex((s) => f(s.facts as Record<string, unknown>));

describe('Antworten auf die Frage im Abfragefeld (DIAS)', () => {
  // eigene Testknoten, keine DIAS-Texte
  const wach = node('t_wach', 'Ist die Testperson ansprechbar?', ['Ja', 'Nein', 'Unklar']);
  const atmung = node('t_atm', 'Atmet die Testperson normal?', ['Ja', 'Nein']);
  const unbekannt = node('t_mond', 'Hat die Testperson Zahnweh am Mond?', ['Ja', 'Nein', 'Unklar']);
  const anzahl = node('t_anz', 'Wie viele Testpersonen sind betroffen?', ['Keine', '1', '2', '3-6', '16-N', 'Unklar']);
  const farbe = node('t_farbe', 'Welche Testfarbe trifft zu?', ['Grün [Hinweis]', 'Blau / Lila', 'Unbekannt']);
  const art = node('t_art', 'Was liegt vor?', ['Medizinischer Testfall', 'Brandschutz Testfall', 'Verkehrsunfall Testfall']);
  const alter = node('t_alter', 'Alterseingabe', [], 'alter');

  it('erkennt den Antworttyp aus den Antwortmöglichkeiten', () => {
    expect(answerKindOf(wach)).toBe('janein');
    expect(answerKindOf(anzahl)).toBe('zahl');
    expect(answerKindOf(farbe)).toBe('auswahl');
    expect(answerKindOf(alter)).toBe('alter');
    expect(answerKindOf(node('t_end', 'Ende', [], 'ende'))).toBe('keine');
  });

  it('kritische Angaben kommen aus den Szenariofakten', () => {
    const leblos = callOf('rd', nthOf('rd', (f) => f.conscious === false && f.breathing === 'nein'));
    const sim = simOf(leblos);
    expect(sim.respond('Ist die Testperson ansprechbar?', { dias: wach }).dias).toEqual({ nodeId: 't_wach', option: 1 });
    expect(sim.respond('Atmet die Testperson normal?', { dias: atmung }).dias?.option).toBe(1);
    const wachePerson = simOf(callOf('rd', nthOf('rd', (f) => f.conscious === true && f.breathing === 'normal')));
    expect(wachePerson.respond('Ist die Testperson ansprechbar?', { dias: wach }).dias?.option).toBe(0);
    expect(wachePerson.respond('Atmet die Testperson normal?', { dias: atmung }).dias?.option).toBe(0);
    // Brand ohne Verletzte: niemand betroffen, wird nicht erfunden
    const brand = simOf(callOf('brand', nthOf('brand', (f) => f.injured === 0 && f.trapped === false)));
    expect(brand.respond('Wie viele Testpersonen sind betroffen?', { dias: anzahl }).dias?.option).toBe(0);
    // Rettungsdienst: es gibt die eine Patientin
    expect(simOf(callOf('rd')).respond('Wie viele Testpersonen sind betroffen?', { dias: anzahl }).dias?.option).toBe(1);
  });

  it('ohne Fakt: einmal plausibel festgelegt, deterministisch und gleichbleibend', () => {
    for (const cat of ['brand', 'vu', 'rd', 'ktp'] as KeywordCategory[]) {
      const call = callOf(cat);
      const a = simOf(call);
      const first = [unbekannt, farbe, art].map((n) => a.respond(n.question, { dias: n }).dias?.option);
      for (const o of first) expect(o).not.toBeNull();
      // gleiche Frage nochmal: gleiche Antwort ("wie gesagt")
      const again = a.respond(unbekannt.question, { dias: unbekannt });
      expect(again.dias?.option).toBe(first[0]);
      expect(allPhrases('schonGesagt').some((p) => again.text.includes(p)), again.text).toBe(true);
      // neuer Anrufer-Simulator für denselben Notruf: gleiche Festlegung
      const b = simOf(callOf(cat));
      expect([unbekannt, farbe, art].map((n) => b.respond(n.question, { dias: n }).dias?.option)).toEqual(first);
      // Festlegung liegt als Fakt x_dias_… vor (wird im Spielstand gemerkt)
      expect(Object.keys(a.call.facts).some((k) => k.startsWith('x_dias_')), cat).toBe(true);
    }
  });

  it('wählt bei der Art des Notfalls die passende Fachrichtung', () => {
    expect(simOf(callOf('rd')).respond('Was liegt vor?', { dias: art }).dias?.option).toBe(0);
    expect(simOf(callOf('brand')).respond('Was liegt vor?', { dias: art }).dias?.option).toBe(1);
    expect(simOf(callOf('vu')).respond('Was liegt vor?', { dias: art }).dias?.option).toBe(2);
  });

  it('beantwortet die offene Abfragefrage auch bei freier Formulierung, Eingaben mit Alter', () => {
    const sim = simOf(callOf('rd'));
    const r = sim.respond('und wie ist das mit dem testzahnweh', { dias: unbekannt });
    expect(r.dias?.nodeId).toBe('t_mond');
    expect(isRueckfrage(r.text)).toBe(false);
    const age = sim.respond('Alter bitte', { dias: alter });
    expect(age.content[0]).toMatch(/\d+|Baby/);
  });

  it('Fragewort-Fragen ohne Muster: kurze Antwort; Anweisungen: Zusage; Unverständliches: Rückfrage', () => {
    const sim = simOf(callOf('rd'));
    expect(isRueckfrage(sim.respond('Hat die Person heute schon etwas gegessen?').text)).toBe(false);
    expect(isRueckfrage(sim.respond('Womit hat sie sich zugedeckt?').text)).toBe(false);
    expect(sim.respond('Schauen Sie mal nach, ob die Haustür offen ist').content[0]).toMatch(/mach ich/i);
    const unk = sim.respond('Blablabla');
    expect(unk.understood).toBe(false);
    expect(isRueckfrage(unk.text)).toBe(true);
  });

  it('Hilfsfunktionen: Frageähnlichkeit und Art der Äußerung', () => {
    expect(similarToQuestion('ist die testperson denn ansprechbar', wach.question)).toBe(true);
    expect(similarToQuestion('wo genau ist das', wach.question)).toBe(false);
    expect(classifyFree('Gehen Sie bitte nach unten')).toBe('anweisung');
    expect(classifyFree('Hat sie Diabetes')).toBe('frage_janein');
    expect(classifyFree('Wann war das')).toBe('frage_w');
    expect(classifyFree('Blablabla')).toBeNull();
  });
});

describe('Polung der Frage', () => {
  const first = <T,>(alts: readonly T[]) => alts[0];
  const src = (facts: Facts): SnaSource => ({ scenarioId: 'x', category: 'vu', facts, relation: 'Zeuge/Zeugin', opening: 'Unfall', seed: 's' });

  it('verneinte oder umgekehrte Fragen: Ja/Nein passt zur Lage', () => {
    const ok = src({ conscious: true, breathing: 'normal' });
    expect(answerTopic(ok, 'sna_bewusst', first, 'Ist die Person bewusstlos?')).toMatch(/^Nein, sie ist wach/);
    expect(answerTopic(ok, 'sna_bewusst', first, 'Ist die Person nicht ansprechbar?')).toMatch(/^Nein/);
    expect(answerTopic(ok, 'sna_bewusst', first, 'Ist die Person wach?')).toMatch(/^Ja/);
    expect(answerTopic(ok, 'sna_atmung', first, 'Hat die Person Atemnot?')).toMatch(/^Nein, sie atmet normal/);
    expect(answerTopic(ok, 'sna_atmung', first, 'Atmet die Person nicht?')).toMatch(/^Nein/);
    expect(answerTopic(ok, 'sna_atmung', first, 'Atmet die Person normal?')).toMatch(/^Ja/);
    const krit = src({ conscious: false, breathing: 'normal' });
    expect(answerTopic(krit, 'sna_bewusst', first, 'Ist die Person bewusstlos?')).toMatch(/^Ja/);
    expect(answerTopic(krit, 'sna_bewusst', first, 'Ist die Person wach?')).toMatch(/^Nein/);
  });

  it('DIAS-Knoten: gewählte Option und gesprochener Text stimmen überein', () => {
    const r = answerDiasNode(src({ conscious: true, breathing: 'normal' }), node('t_atemnot', 'Hat die Testperson Atemnot?', ['Ja', 'Nein', 'Unklar']), first)!;
    expect(r.option).toBe(1);
    expect(r.text).toMatch(/^Nein/);
  });
});
