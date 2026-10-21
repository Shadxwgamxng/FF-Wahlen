import { describe, expect, it } from 'vitest';
import { createSampleCenter } from '../data/sampleCenter';
import { createGame } from './engine';
import { execCommand } from '../store/commands';
import { withActor } from './actor';

const host = { id: 'h', name: 'Gastgeber', host: true };
const anna = { id: 'a', name: 'Anna', host: false };
const ben = { id: 'b', name: 'Ben', host: false };

describe('Mehrspieler: Zuständigkeit', () => {
  it('wer annimmt, ist zuständig; andere müssen übernehmen', () => {
    const g = createGame(createSampleCenter());
    withActor(host, () => execCommand(g, 'injectScenarioCall', ['brand_kueche']));
    const c = g.runtime.calls.at(-1)!;
    expect(withActor(anna, () => execCommand(g, 'acceptCall', [c.id])).ok).toBe(true);
    expect(c.owner).toEqual({ id: 'a', name: 'Anna' });
    const r = withActor(ben, () => execCommand(g, 'updateCallMask', [c.id, { info: 'x' }]));
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/Anna/);
    expect(withActor(ben, () => execCommand(g, 'takeOver', ['call', c.id])).ok).toBe(true);
    expect(withActor(ben, () => execCommand(g, 'updateCallMask', [c.id, { info: 'x' }])).ok).toBe(true);
    expect(withActor(anna, () => execCommand(g, 'updateCallMask', [c.id, { info: 'y' }])).ok).toBe(false);
  });

  it('Übernahme nur mit Genehmigung des Zuständigen (solange er online ist)', () => {
    const g = createGame(createSampleCenter());
    withActor(host, () => execCommand(g, 'injectScenarioCall', ['brand_kueche']));
    const c = g.runtime.calls.at(-1)!;
    withActor(anna, () => execCommand(g, 'acceptCall', [c.id]));
    for (const p of [host, anna, ben]) withActor(p, () => execCommand(g, 'playerSeen', [1000]));
    // Anfrage: Zuständigkeit bleibt bei Anna
    expect(withActor(ben, () => execCommand(g, 'takeOver', ['call', c.id])).ok).toBe(true);
    expect(c.owner?.name).toBe('Anna');
    expect(c.takeOverRequest?.from).toEqual({ id: 'b', name: 'Ben' });
    // nur eine Anfrage je Notruf
    const r2 = withActor(host, () => execCommand(g, 'takeOver', ['call', c.id]));
    expect(!r2.ok && r2.error).toMatch(/Anfrage läuft bereits/);
    // nur der Zuständige darf antworten
    expect(withActor(ben, () => execCommand(g, 'answerTakeOver', ['call', c.id, true])).ok).toBe(false);
    expect(withActor(host, () => execCommand(g, 'answerTakeOver', ['call', c.id, true])).ok).toBe(false);
    // Ablehnung: Hinweis für Ben
    expect(withActor(anna, () => execCommand(g, 'answerTakeOver', ['call', c.id, false])).ok).toBe(true);
    expect(c.owner?.name).toBe('Anna');
    expect(c.takeOverRequest).toBeUndefined();
    expect(c.takeOverDeclined).toMatchObject({ id: 'b', by: 'Anna' });
    // Zurückziehen nur durch den Anfragenden
    withActor(ben, () => execCommand(g, 'takeOver', ['call', c.id]));
    expect(withActor(anna, () => execCommand(g, 'cancelTakeOver', ['call', c.id])).ok).toBe(false);
    expect(withActor(ben, () => execCommand(g, 'cancelTakeOver', ['call', c.id])).ok).toBe(true);
    expect(c.takeOverRequest).toBeUndefined();
    // Genehmigung: neuer Zuständiger ist der Anfragende (nicht der Antwortende)
    withActor(ben, () => execCommand(g, 'takeOver', ['call', c.id]));
    expect(withActor(anna, () => execCommand(g, 'answerTakeOver', ['call', c.id, true])).ok).toBe(true);
    expect(c.owner).toEqual({ id: 'b', name: 'Ben' });
    expect(g.runtime.events.some((e) => e.text.includes('übergibt den Notruf an Ben'))).toBe(true);
  });

  it('offene Anfrage auf einem Notruf geht beim Anlegen des Einsatzes auf den Einsatz über', () => {
    const g = createGame(createSampleCenter());
    withActor(host, () => execCommand(g, 'injectScenarioCall', ['brand_kueche']));
    const c = g.runtime.calls.at(-1)!;
    withActor(anna, () => execCommand(g, 'acceptCall', [c.id]));
    for (const p of [host, anna, ben]) withActor(p, () => execCommand(g, 'playerSeen', [1000]));
    withActor(ben, () => execCommand(g, 'takeOver', ['call', c.id]));
    withActor(anna, () => execCommand(g, 'askQuestion', [c.id, 'ort']));
    withActor(anna, () => execCommand(g, 'setCallKeyword', [c.id, g.center.keywords.find((k) => k.category === 'brand')!.id]));
    expect(withActor(anna, () => execCommand(g, 'createIncidentFromCall', [c.id])).ok).toBe(true);
    const inc = g.runtime.incidents.at(-1)!;
    expect(c.takeOverRequest).toBeUndefined();
    expect(inc.takeOverRequest?.from.name).toBe('Ben');
    // abgeschlossener Notruf: nichts mehr zu übernehmen
    expect(withActor(anna, () => execCommand(g, 'answerTakeOver', ['call', c.id, true])).ok).toBe(false);
    expect(withActor(anna, () => execCommand(g, 'answerTakeOver', ['incident', inc.id, true])).ok).toBe(true);
    expect(inc.owner?.name).toBe('Ben');
  });

  it('Einsatz: Zuständiger offline (> 15 s still) – sofortige Übernahme', () => {
    const g = createGame(createSampleCenter());
    const kw = g.center.keywords[0];
    expect(withActor(anna, () => execCommand(g, 'createManualIncident', [kw.id, g.center.mapCenter, 'Kirchhofsallee 10, 23730 Neustadt in Holstein', 'Test'])).ok).toBe(true);
    const inc = g.runtime.incidents.at(-1)!;
    expect(inc.owner?.name).toBe('Anna');
    withActor(anna, () => execCommand(g, 'playerSeen', [1000]));
    withActor(ben, () => execCommand(g, 'playerSeen', [10_000]));
    // Anna noch online: nur Anfrage
    withActor(ben, () => execCommand(g, 'takeOver', ['incident', inc.id]));
    expect(inc.owner?.name).toBe('Anna');
    withActor(ben, () => execCommand(g, 'cancelTakeOver', ['incident', inc.id]));
    // Anna 17 s still: sofort
    withActor(ben, () => execCommand(g, 'playerSeen', [18_000]));
    expect(withActor(ben, () => execCommand(g, 'takeOver', ['incident', inc.id])).ok).toBe(true);
    expect(inc.owner?.name).toBe('Ben');
  });

  it('Zeit und Übungsszenarien nur für den Gastgeber', () => {
    const g = createGame(createSampleCenter());
    expect(withActor(anna, () => execCommand(g, 'toggleRunning', [])).ok).toBe(false);
    expect(withActor(anna, () => execCommand(g, 'injectScenarioCall', ['brand_kueche'])).ok).toBe(false);
    expect(withActor(host, () => execCommand(g, 'toggleRunning', [])).ok).toBe(true);
  });

  it('Spielerliste mit Lebenszeichen', () => {
    const g = createGame(createSampleCenter());
    withActor(host, () => execCommand(g, 'playerSeen', [1000]));
    withActor(anna, () => execCommand(g, 'playerSeen', [2000]));
    expect(g.runtime.players!.map((p) => p.name)).toEqual(['Gastgeber', 'Anna']);
    withActor(host, () => execCommand(g, 'playerSeen', [40_000]));
    expect(g.runtime.players!.map((p) => p.name)).toEqual(['Gastgeber']);
  });
});
