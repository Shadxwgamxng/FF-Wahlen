import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createOstholsteinCenter } from '../data/ostholstein';
import type { OverpassElement } from '../geo/places';
import type { GameState, RadioMessage, Vehicle } from '../model/types';
import { radioGroupOf } from '../model/radio';
import { createGame, createManualIncident } from './engine';
import { detectOrder, findCallsign, matchHospital, normalizeFunk, radioCall, radioTalk, spokenNumbers, toSpeech } from './funk';

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
    for (const t of ['Florian Ostholstein 61-48-01 von Leitstelle, kommen', 'Florian 61 48 1', 'einundsechzig achtundvierzig null eins kommen', 'Florian Ostholstein 614801']) expect(findCallsign(g, t)?.id, t).toBe(v.id);
    expect(findCallsign(g, 'Leitstelle an alle')).toBeNull();
    // kurze Rufnamen nur mit Organisationswort
    expect(findCallsign(g, 'zwölf')).toBeNull();
    expect(findCallsign(g, 'Christoph 12 kommen')?.callsign).toBe('Christoph 12');
  });

  it('Sprachausgabe liest Rufnamen ziffernweise', () => {
    expect(toSpeech('Hier Florian Ostholstein 61-48-01, hört, kommen.')).toBe('Hier Florian Ostholstein 61 48 null 1, hört, kommen.');
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
    expect(last(g).speech).toContain('61 48 null 1');
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
    radioTalk(g, 'Florian Ostholstein 7148 01, rücken Sie ein', 'FW_OH');
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

