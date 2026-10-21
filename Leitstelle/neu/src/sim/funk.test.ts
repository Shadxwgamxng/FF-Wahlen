import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createOstholsteinCenter } from '../data/ostholstein';
import type { OverpassElement } from '../geo/places';
import type { GameState, RadioMessage, Vehicle } from '../model/types';
import { radioGroupOf } from '../model/radio';
import { createGame, createManualIncident } from './engine';
import { detectOrder, findCallsign, matchHospital, normalizeFunk, numberToWords, numberWord, radioCall, radioTalk, spokenNumbers, toSpeech } from './funk';

const ELEMENTS: OverpassElement[] = JSON.parse(readFileSync(new URL('../../e2e/fixtures/overpass-ostholstein-sued.json', import.meta.url), 'utf8')).elements;

function game(): GameState {
  const c = createOstholsteinCenter(ELEMENTS);
  c.settings.randomBreakdowns = false;
  return createGame(c);
}
const hlf = (g: GameState) => g.center.vehicles.find((v) => v.callsign === 'Florian Ostholstein 61-48-01')!;
const lines = (g: GameState) => g.runtime.funk?.log ?? [];
const last = (g: GameState) => lines(g)[lines(g).length - 1];

function sprechwunsch(g: GameState, v: Vehicle, msg: Partial<RadioMessage>): RadioMessage {
  g.runtime.counters.radio++;
  const m: RadioMessage = { id: `r_${g.runtime.counters.radio}`, at: g.runtime.clock.now, vehicleId: v.id, incidentId: null, kind: 'lage', text: 'Test.', handled: false, revealed: false, ...msg };
  g.runtime.radio.push(m);
  return m;
}

describe('Funk: Zahlen und Rufnamen', () => {
  it('liest gesprochene Zahlenfolgen', () => {
    expect(spokenNumbers('Florian Ostholstein 61-48-01')).toEqual([61, 48, 1]);
    expect(spokenNumbers('61 48 1 kommen')).toEqual([61, 48, 1]);
    expect(spokenNumbers('614801')).toEqual([61, 48, 1]);
    expect(spokenNumbers('einundsechzig achtundvierzig null eins')).toEqual([61, 48, 1]);
    expect(spokenNumbers('Christoph zwölf')).toEqual([12]);
  });

  it('erkennt den Rufnamen in verschiedenen Schreibweisen', () => {
    const g = game();
    const v = hlf(g);
    for (const t of [
      'Florian Ostholstein 61-48-01 von Leitstelle, kommen',
      'Florian 61 48 1',
      'Florian Ostholstein 61 48 eins von Leitstelle kommen',
      'einundsechzig achtundvierzig eins kommen',
      'einundsechzig achtundvierzig null eins kommen',
      'Florian Ostholstein 614801',
      'Florian Ostholstein 6148 1 kommen',
      'Florian Ostholstein 61481',
      'Florian Ostholstein 61-48-1',
    ])
      expect(findCallsign(g, t)?.id, t).toBe(v.id);
    // "61-48-11" ist ein anderes Fahrzeug als "61-48-1"
    expect(findCallsign(g, 'Florian Ostholstein 6148 11')?.callsign ?? null).not.toBe(v.callsign);
    expect(findCallsign(g, 'Leitstelle an alle')).toBeNull();
    // kurze Rufnamen nur mit Organisationswort
    expect(findCallsign(g, 'zwölf')).toBeNull();
    expect(findCallsign(g, 'Christoph 12 kommen')?.callsign).toBe('Christoph 12');
  });

  it('Sprachausgabe liest Rufnamen als Zahlwörter', () => {
    expect(toSpeech('Hier Florian Ostholstein 61-48-01, hört, kommen.')).toBe('Hier Florian Ostholstein einundsechzig achtundvierzig eins, hört, kommen.');
    expect(toSpeech('Rettung Ostholstein 76-83-02 an 3 Einsatzstellen')).toBe('Rettung Ostholstein sechsundsiebzig dreiundachtzig zwo an 3 Einsatzstellen');
    expect(toSpeech('Heros 3/11')).toBe('Heros drei elf');
  });

  it('Zahlwörter 0–99', () => {
    expect([0, 1, 2, 11, 12, 20, 21, 22, 30, 55, 67, 99].map(numberToWords)).toEqual(['null', 'eins', 'zwo', 'elf', 'zwölf', 'zwanzig', 'einundzwanzig', 'zweiundzwanzig', 'dreißig', 'fünfundfünfzig', 'siebenundsechzig', 'neunundneunzig']);
    for (let n = 0; n <= 99; n++) expect(numberWord(numberToWords(n)), String(n)).toBe(n);
  });

  it('Round-Trip: Sprachausgabe ergibt wieder die Rufnamenzahlen', () => {
    for (const [cs, seq] of [
      ['Florian Ostholstein 61-48-01', [61, 48, 1]],
      ['Florian Ostholstein 76-48-02', [76, 48, 2]],
      ['Rettung Ostholstein 83-21-12', [83, 21, 12]],
      ['Florian Ostholstein 10-30-99', [10, 30, 99]],
      ['Heros 3/11', [3, 11]],
    ] as const)
      expect(spokenNumbers(toSpeech(cs)), cs).toEqual(seq);
  });

  it('erkennt ziffernweise gesprochene Rufnamen', () => {
    const g = game();
    const v = hlf(g);
    for (const t of ['sechs eins vier acht null eins kommen', 'Florian Ostholstein sechs eins vier acht null eins von Leitstelle', 'Florian 6 1 4 8 0 1'])
      expect(findCallsign(g, t)?.id, t).toBe(v.id);
    // exakte Gruppen haben Vorrang, ziffernweise ändert bestehende Treffer nicht
    expect(findCallsign(g, 'Florian Ostholstein 61-48-01')?.id).toBe(v.id);
  });
});

describe('Funk: Sprechwunsch (Status 5)', () => {
  it('Inhalt erst nach Ansprechen, dann quittieren', () => {
    const g = game();
    const v = hlf(g);
    const m = sprechwunsch(g, v, { kind: 'nachforderung', text: 'Nachforderung: 1× Streife', requirements: [{ capability: 'polizei', count: 1 }] });
    const grp = radioGroupOf(g.center, v)!.code;
    expect(radioTalk(g, 'Florian Ostholstein 61-48-01 von Leitstelle, kommen', grp).ok).toBe(true);
    expect(m.revealed).toBe(true);
    expect(last(g).from).toBe('fahrzeug');
    expect(last(g).text).toBe('Hier Florian Ostholstein 61-48-01, Nachforderung: Polizei zur Einsatzstelle, kommen.');
    expect(last(g).speech).toContain('einundsechzig achtundvierzig eins,');
    radioTalk(g, 'Verstanden, Polizei wird alarmiert, Ende.', grp);
    expect(m.handled).toBe(true);
    // auf "Ende" antwortet das Fahrzeug nicht mehr
    expect(last(g).from).toBe('leitstelle');
  });

  it('Fahrzeug in anderer Rufgruppe antwortet nicht', () => {
    const g = game();
    const m = sprechwunsch(g, hlf(g), {});
    radioTalk(g, 'Florian Ostholstein 61-48-01 kommen', 'RD_OH');
    expect(m.revealed).toBe(false);
    expect(last(g).from).toBe('system');
    expect(last(g).text).toMatch(/Keine Antwort/);
  });

  it('Knopf "Ansprechen" wirkt wie der Funkspruch', () => {
    const g = game();
    const m = sprechwunsch(g, hlf(g), { text: 'Einsatzstelle abgearbeitet, Kräfte können entlassen werden.' });
    expect(radioCall(g, hlf(g).id).ok).toBe(true);
    expect(m.revealed).toBe(true);
    expect(last(g).text).toBe('Hier Florian Ostholstein 61-48-01, Einsatzstelle abgearbeitet, Kräfte können entlassen werden, kommen.');
  });

  it('Antwort nach "Ansprechen" per Klick bleibt ohne Rufgruppe (für jeden PC hörbar)', () => {
    const g = game();
    sprechwunsch(g, hlf(g), {});
    radioCall(g, hlf(g).id);
    expect(last(g).from).toBe('fahrzeug');
    expect(last(g).group).toBeUndefined();
    // per Sprechtaste: Antwort in der geschalteten Gruppe
    radioTalk(g, 'Florian Ostholstein 61-48-01, Lagemeldung', 'FW_OH');
    expect(last(g).group).toBe('FW_OH');
  });

  it('liefert den Einsatz nur, wenn ein Sprechwunsch aufgedeckt wurde', () => {
    const g = game();
    const v = hlf(g);
    const kw = g.center.keywords.find((k) => k.category === 'brand')!;
    expect(createManualIncident(g, kw.id, v.rt.position, 'Kirchhofsallee 10, 23730 Neustadt in Holstein', 'Test').ok).toBe(true);
    const inc = g.runtime.incidents[0];
    const grp = radioGroupOf(g.center, v)!.code;
    // ohne Sprechwunsch: kein Einsatz
    const r0 = radioTalk(g, 'Florian Ostholstein 61-48-01 von Leitstelle, kommen', grp);
    expect(r0.ok && r0.id).toBeFalsy();
    sprechwunsch(g, v, { incidentId: inc.id });
    const r1 = radioTalk(g, 'Florian Ostholstein 61-48-01 von Leitstelle, kommen', grp);
    expect(r1.ok && r1.id).toBe(inc.id);
    // Folgesatz deckt nichts mehr auf
    const r2 = radioTalk(g, 'Verstanden, Ende', grp);
    expect(r2.ok && r2.id).toBeFalsy();
    // falsche Rufgruppe: nichts aufgedeckt
    sprechwunsch(g, v, { incidentId: inc.id });
    const r3 = radioTalk(g, 'Florian Ostholstein 61-48-01 kommen', 'RD_OH');
    expect(r3.ok && r3.id).toBeFalsy();
  });

  it('Sprechwunsch ohne Einsatzbezug (Defekt): Einsatz des Fahrzeugs, sonst keiner', () => {
    const g = game();
    const v = hlf(g);
    sprechwunsch(g, v, { kind: 'defekt', text: 'Fahrzeug defekt.' });
    const r0 = radioCall(g, v.id);
    expect(r0.ok && r0.id).toBeFalsy();
    const kw = g.center.keywords.find((k) => k.category === 'brand')!;
    createManualIncident(g, kw.id, v.rt.position, 'Kirchhofsallee 10, 23730 Neustadt in Holstein', 'Test');
    v.rt.incidentId = g.runtime.incidents[0].id;
    sprechwunsch(g, v, { kind: 'defekt', text: 'Fahrzeug defekt.' });
    const r1 = radioCall(g, v.id);
    expect(r1.ok && r1.id).toBe(g.runtime.incidents[0].id);
  });

  it('ohne Rufnamen: Hinweis; danach gilt das zuletzt angesprochene Fahrzeug', () => {
    const g = game();
    radioTalk(g, 'Kommen Sie mal bitte', 'FW_OH');
    expect(last(g).from).toBe('system');
    radioTalk(g, 'Florian Ostholstein 61-48-01 von Leitstelle', 'FW_OH');
    expect(last(g).text).toBe('Hier Florian Ostholstein 61-48-01, hört, kommen.');
    radioTalk(g, 'Geben Sie mir Ihren Status', 'FW_OH');
    expect(last(g).text).toMatch(/^Status 2, /);
  });
});

describe('Funk: Aufträge der Leitstelle', () => {
  it('erkennt Aufträge', () => {
    const g = game();
    expect(detectOrder(g, 'Florian 61-48-01, Status?')?.k).toBe('status');
    expect(detectOrder(g, 'geben Sie eine Lagemeldung')?.k).toBe('lage');
    expect(detectOrder(g, 'Sie können einrücken')?.k).toBe('einruecken');
    expect(detectOrder(g, 'verstanden, Ende')?.k).toBe('quittung');
    expect(detectOrder(g, 'Florian 61-48-01 kommen')).toBeNull();
  });

  it('Einsatz übernehmen, Lagemeldung, Einrücken', () => {
    const g = game();
    const v = hlf(g);
    const kw = g.center.keywords.find((k) => k.category === 'brand')!;
    expect(createManualIncident(g, kw.id, v.rt.position, 'Kirchhofsallee 10, 23730 Neustadt in Holstein', 'Test').ok).toBe(true);
    const inc = g.runtime.incidents[0];
    radioTalk(g, 'Florian Ostholstein 61-48-01, übernehmen Sie den Einsatz in der Kirchhofsallee, kommen', 'FW_OH');
    expect(v.rt.incidentId).toBe(inc.id);
    expect(last(g).text).toMatch(/übernehmen Einsatz Kirchhofsallee 10.*Ende\.$/);
    radioTalk(g, 'Florian Ostholstein 61-48-01, Lagemeldung', 'FW_OH');
    expect(last(g).text).toMatch(/Anfahrt zur Einsatzstelle Kirchhofsallee 10/);
    radioTalk(g, 'Florian Ostholstein 61-48-01, rücken Sie ein', 'FW_OH');
    expect(v.rt.incidentId).toBeNull();
    expect(last(g).text).toMatch(/rücken ein, Ende\.$/);
  });
});

describe('Funk: keine Aufträge an das falsche Fahrzeug', () => {
  it('unbekannter oder unklarer Rufname fällt nicht auf das letzte Fahrzeug zurück', () => {
    const g = game();
    const v = hlf(g);
    const kw = g.center.keywords.find((k) => k.category === 'brand')!;
    createManualIncident(g, kw.id, v.rt.position, 'Kirchhofsallee 10, 23730 Neustadt in Holstein', 'Test');
    radioTalk(g, 'Florian Ostholstein 61-48-01, übernehmen Sie den Einsatz in der Kirchhofsallee', 'FW_OH');
    expect(v.rt.incidentId).not.toBeNull();
    radioTalk(g, 'Florian Ostholstein 9948 01, rücken Sie ein', 'FW_OH');
    expect(v.rt.incidentId).not.toBeNull();
    expect(last(g).from).toBe('system');
    expect(last(g).text).toMatch(/Rufname nicht erkannt/);
  });

  it('Fragen nach Verfügbarkeit oder Lage entlassen nicht', () => {
    const g = game();
    expect(detectOrder(g, 'Florian 61-48-01, sind Sie frei für einen neuen Einsatz?')?.k).not.toBe('einruecken');
    expect(detectOrder(g, 'Florian 61-48-01, wie ist die Lage am Einsatz Kirchhofsallee?')?.k).toBe('lage');
    expect(detectOrder(g, 'Sie sind entlassen, rücken Sie ein')?.k).toBe('einruecken');
  });

  it('Ortsname allein ist kein Transportziel', () => {
    const g = game();
    const h = g.center.hospitals[0];
    const town = h.name.split(/\s+/).pop()!;
    expect(detectOrder(g, `Fahren Sie zur Einsatzstelle nach ${town}`)?.k).not.toBe('transport');
    // mit wartendem Patienten oder Klinikwort schon
    expect(detectOrder(g, `Fahren Sie ${h.name} an`, true)).toEqual({ k: 'transport', hospital: h });
    expect(matchHospital(g, normalizeFunk(`Transportziel ${h.name}`)).hospital?.id).toBe(h.id);
  });
});


describe('Freisprechen beim Notruf', () => {
  it('gesprochener Wortwechsel zählt als gestellte Frage und merkt neue Detailangaben', async () => {
    const { acceptCall, askQuestion, askedQuestions, injectScenarioCall, voiceTurn } = await import('./engine');
    const g = game();
    injectScenarioCall(g, 'brand_kueche');
    const c = g.runtime.calls[g.runtime.calls.length - 1];
    acceptCall(g, c.id);
    expect(voiceTurn(g, c.id, 'Wo genau ist das, wie viele Etagen hat das Haus?', 'Antwort', ['ort', 'x_etagen'], { x_etagen: 4, ort: 'x' }).ok).toBe(true);
    expect(askedQuestions(c).has('ort')).toBe(true);
    expect(askQuestion(g, c.id, 'ort').ok).toBe(false);
    expect(c.facts.x_etagen).toBe(4);
    expect(c.facts.ort).toBeUndefined();
    expect(c.dialog[0].questionId).toBe('sprache_1');
  });
});

describe('Funk: Lagemitteilung an ein Fahrzeug', () => {
  it('Besatzung wiederholt die Mitteilung sinngemäß und bestätigt', () => {
    const g = game();
    const nef = g.center.vehicles.find((v) => v.callsign === 'Rettung Ostholstein 61-82-01')!;
    expect(nef).toBeDefined();
    radioTalk(g, 'Rettung Ostholstein 61-82-01 von Leitstelle, Anrufer meldet Person aus Wasser geborgen, jetzt unter Reanimationsmaßnahmen, kommen', 'RD_OH');
    expect(last(g).from).toBe('fahrzeug');
    expect(last(g).text).toBe('Hier Rettung Ostholstein 61-82-01, Person aus Wasser geborgen, wird nun reanimiert, ' + last(g).text.split(', ').slice(-2).join(', '));
    expect(last(g).text).toMatch(/wird nun reanimiert, (das haben wir verstanden|verstanden|haben wir mitgeschrieben|ist verstanden), kommen\.$/);
  });

  it('auch als Folgesatz nach dem Anruf; Ankunftszeit auf Anfahrt', () => {
    const g = game();
    const nef = g.center.vehicles.find((v) => v.callsign === 'Rettung Ostholstein 61-82-01')!;
    const kw = g.center.keywords.find((k) => k.category === 'rd')!;
    createManualIncident(g, kw.id, [nef.rt.position[0] + 0.03, nef.rt.position[1]], 'Kirchhofsallee 10, 23730 Neustadt in Holstein', 'Test');
    radioTalk(g, 'Rettung Ostholstein 61-82-01, übernehmen Sie den Einsatz Kirchhofsallee', 'RD_OH');
    expect(nef.rt.incidentId).not.toBeNull();
    radioTalk(g, 'Rettung Ostholstein 61-82-01 von Leitstelle kommen', 'RD_OH');
    expect(last(g).text).toMatch(/hört, kommen\.$/);
    radioTalk(g, 'Zur Info: Patient ist jetzt wieder ansprechbar, kommen', 'RD_OH');
    expect(last(g).text).toMatch(/^Patient ist nun wieder ansprechbar, .*(vor Ort|rücken gleich aus), kommen\.$/);
    const inc = g.runtime.incidents[0];
    expect(inc.log.some((l) => /Leitstelle an Rettung Ostholstein 61-82-01: Zur Info: Patient ist jetzt wieder ansprechbar/.test(l.text))).toBe(true);
  });
});

describe('Erste Lagemeldung beim Eintreffen', () => {
  it('erstes Fahrzeug drückt Status 5 und meldet nach dem Ansprechen die tatsächliche Lage', async () => {
    const E = await import('./engine');
    const { suggestForIncident } = await import('./dispatch');
    const g = game();
    E.injectScenarioCall(g, 'rd_rea');
    const c = g.runtime.calls.at(-1)!;
    E.acceptCall(g, c.id);
    E.askQuestion(g, c.id, 'ort');
    // absichtlich falsches Stichwort (Brand) – die Lagemeldung beschreibt trotzdem die echte Lage
    E.setCallKeyword(g, c.id, g.center.keywords.find((k) => k.category === 'brand')!.id);
    E.createIncidentFromCall(g, c.id);
    const inc = g.runtime.incidents[0];
    E.alarmVehicles(g, inc.id, suggestForIncident(g, inc).proposal.map((p) => p.vehicleId));
    for (let i = 0; i < 300 && !inc.firstArrivalAt; i++) E.tick(g, 10_000);
    const m = g.runtime.radio.find((r) => r.incidentId === inc.id && r.kind === 'lage')!;
    expect(m.revealed).toBe(false);
    const v = g.center.vehicles.find((x) => x.id === m.vehicleId)!;
    expect(v.rt.status).toBe('sprechwunsch');
    radioCall(g, v.id);
    expect(last(g).text).toMatch(/^Hier .*, eingetroffen\. .*Reanimation eingeleitet/);
    expect(last(g).text).not.toMatch(/\b(ich|mein)\b/i);
    radioTalk(g, 'Verstanden, Ende');
    expect(m.handled).toBe(true);
    expect(v.rt.status).toBe('einsatzort');
  });
});
