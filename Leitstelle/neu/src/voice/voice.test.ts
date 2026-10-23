import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { createSampleCenter } from '../data/sampleCenter';
import { questionsFor, type Facts, type QuestionDef } from '../data/questions';
import { createGame } from '../sim/engine';
import { matchIntents } from './intents';
import { CallerSim, spellWord, initialEmotion } from './caller';
import { buildVoiceTestCall, emptyVoiceEntry, evaluateVoiceTest } from './testCall';
import { allPhrases, CallerVoice, type Emotion, type Personality } from './style';
import { speakAs, stopSpeaking } from './speech';
import { deleteAllTranscripts, deleteTranscript, getConsent, giveConsent, listTranscripts, MAX_TRANSCRIPTS, saveTranscript, setVoiceStorage, withdrawConsent } from './transcripts';

const game = () => createGame(createSampleCenter());

/** nur Buchstaben und Ziffern – Füllwörter, Pausen und Satzzeichen fallen weg */
const bare = (s: string) => s.toLowerCase().replace(/[^a-z0-9äöüß]+/g, '');
/** alle Formulierungen einer Antwort */
const variants = (q: QuestionDef, f: Facts) => new Set([0, 1, 2, 3, 4, 5].map((i) => q.answer(f, (alts) => alts[i % alts.length])));
const startsWithPhrase = (text: string, key: Parameters<typeof allPhrases>[0]) => allPhrases(key).some((p) => text.startsWith(p));

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

  // Fälle aus dem Review (gesprochene Sprache, ohne Satzzeichen)
  const review: [string, Parameters<typeof matchIntents>[1], string[]][] = [
    ['gehen sie nicht zurück in die wohnung wenn noch jemand drin ist', 'brand', []],
    ['verlassen sie die wohnung sind noch personen drin', 'brand', ['b_personen']],
    ['ist noch wer drin', 'brand', ['b_personen']],
    ['sind alle aus dem haus raus', 'brand', ['b_personen']],
    ['wohnt da jemand drüber', 'brand', ['b_personen']],
    ['können sie die straße buchstabieren', 'brand', []],
    ['ist der täter noch vor ort', 'pol', []],
    ['alles klar ich weiß wo das ist', 'brand', []],
    ['ist noch jemand im auto', 'vu', ['vu_eingeklemmt']],
    ['läuft da was aus', 'vu', ['vu_auslauf']],
    ['wie viele personen sind betroffen', 'abc', ['verletzt']],
    ['was ist da los', 'abc', ['was']],
    ['wie groß ist das feuer', 'brand', ['b_ausbreitung']],
    ['steckt jemand im aufzug fest', 'th', ['th_personen']],
    ['in welche klinik soll er', 'ktp', ['ktp_ziel']],
    ['was ist das transportziel', 'ktp', ['ktp_ziel']],
    ['wie lautet die zieladresse', 'ktp', ['ktp_ziel']],
    ['wo soll es hingehen', 'ktp', ['ktp_ziel']],
    ['wo muss der patient hin', 'ktp', ['ktp_ziel']],
    ['wo soll die patientin hingebracht werden', 'ktp', ['ktp_ziel']],
    ['muss er liegend transportiert werden', 'ktp', ['ktp_mobil']],
    ['ist er zuckerkrank', 'rd', ['rd_vorerkrankung']],
    ['blutet er stark', 'rd', ['rd_beschwerden']],
    ['hat jemand rauch eingeatmet', 'brand', ['verletzt']],
  ];
  for (const [text, cat, expected] of review)
    it(`Review: "${text}" → ${expected.join(', ') || 'keine Frage'}`, () => {
      expect(matchIntents(text, cat).questions).toEqual(expected);
    });

  it('erkennt Beruhigung in üblichen Formulierungen, aber nicht "schicken Sie jemanden"', () => {
    for (const t of ['die feuerwehr kommt gleich', 'der rettungsdienst kommt sofort', 'es ist schon jemand unterwegs', 'die polizei ist informiert', 'wir sind gleich da', 'ich hab die feuerwehr alarmiert'])
      expect(matchIntents(t, 'brand').intents, t).toContain('beruhigen');
    expect(matchIntents('schicken sie jemanden', 'brand').intents).not.toContain('beruhigen');
    expect(matchIntents('sagen sie das noch mal', 'brand').intents).toContain('wiederholen');
  });

  it('erkennt Gesprächsabsichten ohne Faktenbezug', () => {
    expect(matchIntents('Bleiben Sie ruhig, die Feuerwehr ist unterwegs.', 'brand').intents).toContain('beruhigen');
    expect(matchIntents('Können Sie die Straße buchstabieren?', 'brand').intents).toContain('buchstabieren');
    expect(matchIntents('Wie heißen Sie?', 'brand').intents).toContain('name');
    expect(matchIntents('Wie bitte?', 'brand').intents).toContain('wiederholen');
    expect(matchIntents('Verlassen Sie die Wohnung und schließen Sie die Tür.', 'brand').intents).toContain('anweisung');
    expect(matchIntents('Auf Wiederhören.', 'brand').intents).toContain('ende');
  });

  it('Ankündigungen und Hinweise des Disponenten werden verstanden (kein „Wie bitte?“)', () => {
    for (const t of ['Alles klar, ich schick den Rettungsdienst vorbei.', 'Der Rettungsdienst kommt.', 'Die Feuerwehr kommt', 'Wir schicken Ihnen einen Rettungswagen.', 'Der RTW ist gleich bei Ihnen.', 'Ich habe die Feuerwehr alarmiert.', 'Hilfe ist unterwegs.'])
      expect(matchIntents(t, 'rd').intents, t).toContain('beruhigen');
    for (const t of ['Stellen Sie sich an die Straße und machen auf sich aufmerksam.', 'Machen Sie sich bemerkbar.', 'Sperren Sie die Haustür auf.', 'Schalten Sie das Licht an.', 'Weisen Sie die Kollegen ein.'])
      expect(matchIntents(t, 'rd').intents, t).toContain('anweisung');
    // Fragen bleiben Fragen
    for (const t of ['Ist jemand verletzt?', 'Wo genau ist der Notfallort?', 'Atmet die Person normal?', 'Kommt jemand nicht mehr raus?'])
      expect(matchIntents(t, 'brand').intents, t).not.toContain('beruhigen');
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
    expect(bare(first.text)).toContain(bare(call.opening));
    expect(first.text).toContain(call.location.street);
    expect(first.questions).toEqual(['ort']);
    const pers = sim.respond('Sind noch Personen in der Wohnung?');
    expect(variants(questionsFor('brand').find((q) => q.id === 'b_personen')!, call.facts)).toContain(pers.content[0]);
    expect(bare(pers.text)).toContain(bare(pers.content[0]));
    expect([...sim.asked].sort()).toEqual(['b_personen', 'ort']);
  });

  it('erfindet nichts: jede Antwort besteht aus Fragenantworten oder festen Floskeln', () => {
    const g = game();
    const call = buildVoiceTestCall(g, 7);
    const sim = new CallerSim(call);
    const answers = new Set(questionsFor('brand').flatMap((q) => [...variants(q, call.facts)]));
    const turns = ['Notruf, was ist passiert?', 'Was brennt genau?', 'In welchem Stockwerk?', 'Breitet sich das aus?', 'Gibt es Verletzte?', 'Sehen Sie Rauch?'];
    for (const t of turns) {
      const r = sim.respond(t);
      expect(r.content.length, t).toBeGreaterThan(0);
      for (const c of r.content) {
        expect(answers.has(c), `"${c}" stammt nicht aus den Fakten`).toBe(true);
        expect(bare(r.text), 'Inhalt bleibt in der gesprochenen Fassung erhalten').toContain(bare(c));
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
    expect(startsWithPhrase(unk.text, 'nichtVerstanden'), unk.text).toBe(true);
    expect(startsWithPhrase(sim.respond('Wo genau ist das?').text, 'schonGesagt')).toBe(true);
  });

  it('beruhigt sich, wenn Hilfe zugesagt wird, und legt nach Verabschiedung auf', () => {
    const call = buildVoiceTestCall(game(), 1);
    const sim = new CallerSim(call);
    expect(sim.emotion).toBe(initialEmotion(call.facts, sim.personality));
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

  it('buchstabiert, was gefragt ist, und sagt bei Anweisungen nichts zu', () => {
    const call = buildVoiceTestCall(game(), 4);
    const sim = new CallerSim(call);
    sim.respond('Notruf');
    const name = sim.respond('Buchstabieren Sie bitte Ihren Namen.').text;
    expect(name).toContain(spellWord(call.caller.name));
    expect(name).not.toContain(spellWord(call.location.street));
    const ack = sim.respond('Gehen Sie in die Wohnung und holen Sie die Person raus.');
    expect(startsWithPhrase(ack.text, 'verstanden'), ack.text).toBe(true);
    expect(ack.content).toEqual([]);
  });

  it('Eröffnung "Wohnung über mir" passt zu den Fakten (Obergeschoss, Mehrfamilienhaus)', () => {
    const g = game();
    for (let seed = 1; seed <= 20; seed++) {
      const c = buildVoiceTestCall(g, seed);
      expect(String(c.facts.floor), `Fall ${seed}`).toMatch(/Obergeschoss/);
      expect(String(c.facts._detail), `Fall ${seed}`).toMatch(/Mehrfamilienhaus|Wohnblock/);
    }
  });

  it('klingt nicht künstlich: verschiedene Persönlichkeiten und Formulierungen', () => {
    const g = game();
    const personalities = new Set<string>();
    const persAnswers = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const sim = new CallerSim(buildVoiceTestCall(g, seed));
      personalities.add(sim.personality);
      sim.respond('Notruf Feuerwehr.');
      persAnswers.add(sim.respond('Ist noch jemand in der Wohnung?').text);
    }
    expect(personalities.size).toBeGreaterThanOrEqual(4);
    expect(persAnswers.size).toBeGreaterThanOrEqual(8);
  });

  it('natürliche Sprechweise verändert keine Fakten und schreibt "Sie" nie klein', () => {
    const samples = ['Sie reagiert überhaupt nicht!', 'Etwa 45 Jahre.', 'Ja, da ist noch jemand drin, ich höre Rufe!', '2. Obergeschoss.', 'Der Fahrer ist eingeklemmt, die Tür geht nicht auf!'];
    for (const p of ['ruhig', 'aufgeregt', 'aelter', 'knapp', 'redselig'] as Personality[])
      for (let seed = 1; seed <= 40; seed++) {
        const v = new CallerVoice(p, seed);
        for (const e of [0, 1, 2] as Emotion[])
          for (const t of samples) {
            const out = v.naturalize(t, e);
            expect(bare(out), `${p}/${e}: ${out}`).toContain(bare(t).slice(2));
            expect(out).not.toMatch(/(^|[,–…] )sie reagiert/);
          }
      }
  });

  it('Adressen am Satzanfang bleiben unverändert (z. B. "Am Markt")', () => {
    for (const p of ['ruhig', 'aufgeregt', 'aelter', 'knapp', 'redselig'] as Personality[])
      for (let seed = 1; seed <= 30; seed++)
        for (const e of [0, 1, 2] as Emotion[]) expect(new CallerVoice(p, seed).naturalize('Am Markt 5, Eutin.', e, true)).toMatch(/Am Markt 5/);
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

describe('Sprachausgabe: gemeinsame Warteschlange', () => {
  /** nachgebildete speechSynthesis: merkt sich, was übergeben wurde; Sprechen endet erst auf finish() */
  interface FakeUtterance {
    text: string;
    onstart?: () => void;
    onend?: () => void;
    onerror?: () => void;
  }
  let handed: FakeUtterance[];
  let current: FakeUtterance | null;
  const finish = () => {
    const u = current;
    current = null;
    u?.onend?.();
  };
  const p = { rate: 1, pitch: 1 };

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    handed = [];
    current = null;
    const synth = {
      speak: (u: FakeUtterance) => {
        // nie zwei Äußerungen gleichzeitig beim Browser
        expect(current).toBeNull();
        handed.push(u);
        current = u;
        u.onstart?.();
      },
      cancel: () => {
        const u = current;
        current = null;
        u?.onerror?.();
      },
      getVoices: () => [],
    };
    vi.stubGlobal('window', { speechSynthesis: synth });
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        text: string;
        constructor(t: string) {
          this.text = t;
        }
      },
    );
  });
  afterEach(() => {
    stopSpeaking();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('spricht nacheinander in Reihenfolge des Eintreffens (Funk und Anrufer abwechselnd)', async () => {
    const done: string[] = [];
    void speakAs('Anrufer 1', p, undefined, 'telefon').then(() => done.push('t1'));
    void speakAs('Anrufer 2', p, undefined, 'telefon').then(() => done.push('t2'));
    void speakAs('Funk', p, undefined, 'funk').then(() => done.push('f'));
    // der angefangene Satz läuft weiter, nur er ist beim Browser
    expect(handed.map((u) => u.text)).toEqual(['Anrufer 1']);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(handed.map((u) => u.text)).toEqual(['Anrufer 1', 'Anrufer 2']);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    finish();
    await vi.advanceTimersByTimeAsync(0);
    expect(handed.map((u) => u.text)).toEqual(['Anrufer 1', 'Anrufer 2', 'Funk']);
    expect(done).toEqual(['t1', 't2', 'f']);
  });

  it('stopSpeaking(kanal) bricht nur diesen Kanal ab', async () => {
    const done: string[] = [];
    void speakAs('Funk 1', p, undefined, 'funk').then(() => done.push('f1'));
    void speakAs('Anrufer', p, undefined, 'telefon').then(() => done.push('t'));
    void speakAs('Funk 2', p, undefined, 'funk').then(() => done.push('f2'));
    stopSpeaking('telefon');
    await vi.advanceTimersByTimeAsync(0);
    // Funk läuft ungestört weiter, der wartende Anrufer ist raus
    expect(done).toEqual(['t']);
    expect(current?.text).toBe('Funk 1');
    finish();
    await vi.advanceTimersByTimeAsync(0);
    stopSpeaking('funk');
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toEqual(['t', 'f1', 'f2']);
    expect(handed.map((u) => u.text)).toEqual(['Funk 1', 'Funk 2']);
    expect(current).toBeNull();
  });

  it('Ersatz-Timer zählt erst ab Übergabe, nicht ab Einreihen', async () => {
    const done: string[] = [];
    // 2 s + 10 Zeichen / 10 pro s = 3 s Ersatzdauer je Äußerung
    void speakAs('aaaaaaaaaa', p, undefined, 'funk').then(() => done.push('1'));
    void speakAs('bbbbbbbbbb', p, undefined, 'telefon').then(() => done.push('2'));
    await vi.advanceTimersByTimeAsync(2500);
    expect(done).toEqual([]);
    // erste Äußerung liefert kein "end": Ersatz greift nach 3 s
    current = null;
    await vi.advanceTimersByTimeAsync(600);
    expect(done).toEqual(['1']);
    expect(handed.map((u) => u.text)).toEqual(['aaaaaaaaaa', 'bbbbbbbbbb']);
    // die zweite hat ihre volle Zeit ab Übergabe
    await vi.advanceTimersByTimeAsync(2500);
    expect(done).toEqual(['1']);
    await vi.advanceTimersByTimeAsync(600);
    expect(done).toEqual(['1', '2']);
  });
});
