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
