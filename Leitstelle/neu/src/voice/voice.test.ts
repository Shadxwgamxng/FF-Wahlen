import { describe, expect, it, beforeEach } from 'vitest';
import { createSampleCenter } from '../data/sampleCenter';
import { questionsFor } from '../data/questions';
import { createGame } from '../sim/engine';
import { matchIntents } from './intents';
import { CallerSim, spellWord, initialEmotion } from './caller';
import { buildVoiceTestCall, emptyVoiceEntry, evaluateVoiceTest } from './testCall';
import { deleteAllTranscripts, deleteTranscript, getConsent, giveConsent, listTranscripts, MAX_TRANSCRIPTS, saveTranscript, setVoiceStorage, withdrawConsent } from './transcripts';

const game = () => createGame(createSampleCenter());

describe('Absichtserkennung', () => {
  const cases: [string, Parameters<typeof matchIntents>[1], string[]][] = [
    ['Notruf Feuerwehr und Rettungsdienst, wo genau ist der Notfallort?', 'brand', ['ort']],
    ['Wie lautet die genaue Adresse?', 'rd', ['ort']],
    ['Was ist passiert?', 'th', ['was']],
    ['Was brennt denn genau?', 'brand', ['b_objekt']],
    ['Sind noch Personen in der Wohnung?', 'brand', ['b_personen']],
    ['In welchem Stockwerk ist das?', 'brand', ['b_stock']],
    ['Breitet sich das Feuer aus?', 'brand', ['b_ausbreitung']],
    ['Sehen Sie Rauch oder Flammen?', 'brand', ['b_rauch']],
    ['Ist jemand verletzt?', 'brand', ['verletzt']],
    ['Wie alt ist der Patient ungefähr?', 'rd', ['rd_alter']],
    ['Ist er wach und ansprechbar?', 'rd', ['rd_bewusst']],
    ['Atmet die Person normal?', 'rd', ['rd_atmung']],
    ['Ist jemand eingeklemmt?', 'vu', ['vu_eingeklemmt']],
    ['Wie viele Fahrzeuge sind beteiligt?', 'vu', ['vu_fzg']],
    ['Unter welcher Nummer kann ich Sie zurückrufen?', 'rd', ['rueckruf']],
    ['Wo genau ist das, und ist jemand verletzt?', 'brand', ['ort', 'verletzt']],
  ];
  for (const [text, cat, expected] of cases)
    it(`"${text}" → ${expected.join(', ')}`, () => {
      expect(matchIntents(text, cat).questions).toEqual(expected);
    });

  it('erkennt Gesprächsabsichten ohne Faktenbezug', () => {
    expect(matchIntents('Bleiben Sie ruhig, die Feuerwehr ist unterwegs.', 'brand').intents).toContain('beruhigen');
    expect(matchIntents('Können Sie die Straße buchstabieren?', 'brand').intents).toContain('buchstabieren');
    expect(matchIntents('Wie heißen Sie?', 'brand').intents).toContain('name');
    expect(matchIntents('Wie bitte?', 'brand').intents).toContain('wiederholen');
    expect(matchIntents('Verlassen Sie die Wohnung und schließen Sie die Tür.', 'brand').intents).toContain('anweisung');
    expect(matchIntents('Auf Wiederhören.', 'brand').intents).toContain('ende');
  });

  it('jede Abfragefrage des Spiels wird über ihren eigenen Fragetext erkannt', () => {
    for (const cat of ['brand', 'th', 'vu', 'rd', 'ktp', 'abc', 'wasser', 'tier', 'pol', 'sonstiges'] as const)
      for (const q of questionsFor(cat)) expect(matchIntents(q.text, cat).questions, `${cat}: ${q.text}`).toContain(q.id);
  });
});

describe('Simulierter Anrufer', () => {
  it('beginnt mit dem Eröffnungssatz und beantwortet Fragen nur aus den Szenariofakten', () => {
    const g = game();
    const call = buildVoiceTestCall(g, 1);
    const sim = new CallerSim(call);
    const first = sim.respond('Notruf Feuerwehr und Rettungsdienst, wo genau ist der Notfallort?');
    expect(first.text.startsWith(call.opening)).toBe(true);
    expect(first.text).toContain(call.location.address);
    expect(first.questions).toEqual(['ort']);
    const pers = sim.respond('Sind noch Personen in der Wohnung?');
    expect(pers.text).toContain(questionsFor('brand').find((q) => q.id === 'b_personen')!.answer(call.facts));
    expect([...sim.asked].sort()).toEqual(['b_personen', 'ort']);
  });

  it('erfindet nichts: jede Antwort besteht aus Fragenantworten oder festen Floskeln', () => {
    const g = game();
    const call = buildVoiceTestCall(g, 7);
    const sim = new CallerSim(call);
    const answers = new Set(questionsFor('brand').map((q) => q.answer(call.facts)));
    const turns = ['Notruf, was ist passiert?', 'Was brennt genau?', 'In welchem Stockwerk?', 'Breitet sich das aus?', 'Gibt es Verletzte?', 'Sehen Sie Rauch?'];
    for (const t of turns) {
      const r = sim.respond(t);
      const rest = r.text
        .replace(call.opening, '')
        .split(/(?<=[.!?])\s+/)
        .map((x) => x.trim())
        .filter(Boolean);
      for (const sentence of rest) {
        const ok = [...answers].some((a) => a.includes(sentence) || sentence.includes(a)) || /^(Bitte beeilen Sie sich!|Kommt denn jetzt jemand\?)$/.test(sentence);
        expect(ok, `"${sentence}" stammt nicht aus den Fakten`).toBe(true);
      }
    }
  });

  it('wiederholt, buchstabiert, nennt den Namen und bleibt bei Unverständlichem bei Nachfragen', () => {
    const call = buildVoiceTestCall(game(), 3);
    const sim = new CallerSim(call);
    sim.respond('Notruf Feuerwehr.');
    const ort = sim.respond('Wo genau ist das?');
    expect(sim.respond('Wie bitte?').text).toContain(ort.text);
    expect(sim.respond('Können Sie die Straße buchstabieren?').text).toContain(spellWord(call.location.street));
    expect(sim.respond('Wie heißen Sie?').text).toContain(call.caller.name);
    const unk = sim.respond('Blablabla');
    expect(unk.understood).toBe(false);
    expect(unk.text).toMatch(/Wie bitte/);
    expect(sim.respond('Wo genau ist das?').text).toMatch(/schon gesagt/);
  });

  it('beruhigt sich, wenn Hilfe zugesagt wird, und legt nach Verabschiedung auf', () => {
    const call = buildVoiceTestCall(game(), 1);
    const sim = new CallerSim(call);
    expect(sim.emotion).toBe(initialEmotion(call.facts));
    expect(sim.emotion).toBe(2); // Person in der Wohnung
    sim.respond('Notruf Feuerwehr.');
    sim.respond('Bleiben Sie ruhig, die Feuerwehr ist unterwegs.');
    expect(sim.emotion).toBe(1);
    const bye = sim.respond('Auf Wiederhören.');
    expect(bye.ended).toBe(true);
    expect(sim.respond('Hallo?').text).toBe('');
  });

  it('ist deterministisch: gleicher Fall, gleiche Antworten', () => {
    const a = buildVoiceTestCall(game(), 5);
    const b = buildVoiceTestCall(game(), 5);
    expect(a).toEqual(b);
    const s1 = new CallerSim(a);
    const s2 = new CallerSim(b);
    for (const t of ['Notruf', 'Wo?', 'Was brennt?', 'Xyz', 'Xyz']) expect(s1.respond(t)).toEqual(s2.respond(t));
  });

  it('buchstabiert nach DIN 5009', () => {
    expect(spellWord('Haß-Weg 3')).toBe('H wie Hamburg, A wie Aachen, ß wie Eszett, Bindestrich, W wie Wuppertal, E wie Essen, G wie Goslar, Leerzeichen, 3');
  });
});

describe('Auswertung des Testanrufs', () => {
  it('bewertet nur die eigenen Eingaben des Disponenten', () => {
    const g = game();
    const call = buildVoiceTestCall(g, 2);
    expect(call.variantIdx).toBe(0);
    expect(call.facts.trapped).toBe(true);
    const empty = evaluateVoiceTest(g, call, emptyVoiceEntry(), [], 30);
    expect(empty.score).toBe(0);
    const kw = g.center.keywords.find((k) => k.code === 'B 3 Y')!;
    const full = evaluateVoiceTest(
      g,
      call,
      { ...emptyVoiceEntry(), street: call.location.street, houseNumber: call.location.houseNumber, city: call.location.city, trapped: 'ja', injured: String(call.facts.injured), keywordId: kw.id },
      ['ort', 'b_personen', 'b_stock'],
      95.4,
    );
    expect(full.items.filter((i) => !i.ok)).toEqual([]);
    expect(full.score).toBe(full.total);
    expect(full.durationSeconds).toBe(95);
  });
});

describe('Einwilligung und Transkripte (nur lokal)', () => {
  beforeEach(() => {
    const m = new Map<string, string>();
    setVoiceStorage({ getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) });
  });
  const session = (id: string) => ({ id, startedAt: 1, endedAt: 2, scenario: 'Test', lines: [{ who: 'disponent' as const, text: 'Hallo', at: 1 }] });

  it('speichert ohne Einwilligung nichts', () => {
    expect(getConsent()).toBeNull();
    expect(saveTranscript(session('a'))).toBe(false);
    expect(listTranscripts()).toEqual([]);
  });

  it('speichert, löscht einzeln und alle, begrenzt die Anzahl', () => {
    giveConsent('text', 123);
    expect(getConsent()).toEqual({ version: 1, at: 123, mode: 'text' });
    for (let i = 0; i < MAX_TRANSCRIPTS + 5; i++) saveTranscript(session(`s${i}`));
    expect(listTranscripts()).toHaveLength(MAX_TRANSCRIPTS);
    expect(listTranscripts()[0].id).toBe(`s${MAX_TRANSCRIPTS + 4}`);
    deleteTranscript(`s${MAX_TRANSCRIPTS + 4}`);
    expect(listTranscripts().some((s) => s.id === `s${MAX_TRANSCRIPTS + 4}`)).toBe(false);
    deleteAllTranscripts();
    expect(listTranscripts()).toEqual([]);
  });

  it('Widerruf löscht Einwilligung und Transkripte', () => {
    giveConsent('geraet');
    saveTranscript(session('x'));
    withdrawConsent();
    expect(getConsent()).toBeNull();
    expect(listTranscripts()).toEqual([]);
  });
});
