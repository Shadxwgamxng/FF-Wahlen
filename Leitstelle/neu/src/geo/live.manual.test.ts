/**
 * Live-Tests gegen echte OSM-Dienste. Laufen nur mit LIVE=1 (Netzwerkzugriff nötig):
 *   LIVE=1 npx vitest run src/geo/live.manual.test.ts
 */
import { writeFileSync } from 'node:fs';
import { fetchCountyAt } from './osm';

const ua: typeof fetch = (u, init) => fetch(u, { ...init, headers: { ...(init?.headers ?? {}), 'User-Agent': 'LEITWARTE-dev-test (leitwarte local development)' } });

describe.skipIf(!process.env.LIVE)('OSM live', () => {
  it('Nominatim: Kreis Ostholstein per Klick', async () => {
    const c = await fetchCountyAt([54.13, 10.75], ua);
    expect(c.name).toContain('Ostholstein');
    expect(c.polygons.length).toBeGreaterThanOrEqual(2); // Festland + Fehmarn
    if (process.env.SAVE) writeFileSync('src/data/ostholstein/boundary.json', JSON.stringify(c));
  }, 30000);
});
