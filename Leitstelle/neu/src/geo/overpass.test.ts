import { beforeEach, describe, expect, it } from 'vitest';
import { clearOverpassCache, OVERPASS_URLS, runOverpass } from './osm';

const ok = (elements: unknown[]) => new Response(JSON.stringify({ elements }), { status: 200, headers: { 'Content-Type': 'application/json' } });
const noSleep = async () => undefined;

describe('Overpass-Abfrage mit Ausweichservern', () => {
  beforeEach(() => clearOverpassCache());

  it('weicht bei "Failed to fetch" und Serverfehlern auf den nächsten Server aus', async () => {
    const calls: string[] = [];
    const fetchFn = (async (url: string) => {
      calls.push(url);
      if (calls.length === 1) throw new TypeError('Failed to fetch');
      if (calls.length === 2) return new Response('', { status: 504 });
      return ok([{ type: 'node', id: 1 }]);
    }) as unknown as typeof fetch;
    const status: string[] = [];
    const els = await runOverpass('q1', { fetchFn, sleep: noSleep, onStatus: (t) => status.push(t) });
    expect(els).toHaveLength(1);
    expect(calls).toEqual(OVERPASS_URLS.slice(0, 3));
    expect(status.length).toBeGreaterThanOrEqual(3);
  });

  it('wartet nach einem erfolglosen Durchgang und versucht es erneut', async () => {
    let n = 0;
    const waits: number[] = [];
    const fetchFn = (async () => {
      n++;
      if (n <= OVERPASS_URLS.length) throw new TypeError('Failed to fetch');
      return ok([]);
    }) as unknown as typeof fetch;
    await runOverpass('q2', { fetchFn, sleep: async (ms) => void waits.push(ms), backoffMs: [5, 9] });
    expect(waits).toEqual([5]);
    expect(n).toBe(OVERPASS_URLS.length + 1);
  });

  it('meldet verständlich, wenn alle Server in allen Durchgängen scheitern', async () => {
    const fetchFn = (async () => new Response('', { status: 429 })) as unknown as typeof fetch;
    await expect(runOverpass('q3', { fetchFn, sleep: noSleep, rounds: 2 })).rejects.toThrow(/nicht erreichbar oder überlastet.*429/);
  });

  it('erkennt abgebrochene Abfragen (remark) als Fehler', async () => {
    let n = 0;
    const fetchFn = (async () => {
      n++;
      return n === 1 ? new Response(JSON.stringify({ elements: [], remark: 'runtime error: Query timed out' })) : ok([{ type: 'node', id: 2 }]);
    }) as unknown as typeof fetch;
    expect(await runOverpass('q4', { fetchFn, sleep: noSleep })).toHaveLength(1);
  });

  it('lädt bereits erfolgreiche Abfragen beim erneuten Versuch nicht noch einmal', async () => {
    let n = 0;
    const fetchFn = (async () => {
      n++;
      return ok([{ type: 'node', id: 3 }]);
    }) as unknown as typeof fetch;
    await runOverpass('q5', { fetchFn, sleep: noSleep });
    await runOverpass('q5', { fetchFn, sleep: noSleep });
    expect(n).toBe(1);
  });
});
