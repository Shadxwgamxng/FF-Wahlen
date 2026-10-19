import { afterEach, describe, expect, it } from 'vitest';
import { createSampleCenter } from '../data/sampleCenter';
import { alarmVehicles, applyRoutes, createGame, createManualIncident, tick } from './engine';
import { clearRoutes, cumulative, pointAlong, putRoute, routeKey, takePending } from './routing';
import { etaFor } from './dispatch';
import type { LatLng } from '../model/types';
import { fetchOsrmRoute } from '../ui/routingService';

afterEach(() => clearRoutes());

describe('Straßenrouting', () => {
  it('interpoliert entlang eines Pfads', () => {
    const path: LatLng[] = [[0, 0], [0, 1], [1, 1]];
    const cum = cumulative(path);
    expect(pointAlong(path, cum, 0.5)).toEqual([0, 1]);
    expect(pointAlong(path, cum, 0.75)[0]).toBeCloseTo(0.5);
  });

  it('fährt ohne Route die Näherung, merkt die Route vor und stellt nach Eintreffen der Route um', () => {
    const c = createSampleCenter();
    c.settings.randomBreakdowns = false;
    const g = createGame(c);
    g.runtime.nextCallAt = Number.MAX_SAFE_INTEGER;
    const r = createManualIncident(g, 'kw_th_1', [50.6, 9.6], 'Teststraße 1', '');
    const id = r.ok ? r.id! : '';
    const v = g.center.vehicles.find((x) => x.stationId === 'st_ff_wie' && x.typeId === 'lf10')!;
    alarmVehicles(g, id, [v.id]);
    for (let i = 0; i < 60 && !v.rt.move; i++) tick(g, 10_000);
    expect(v.rt.move!.routed).toBe(false);
    const pending = takePending(10);
    expect(pending).toContain(routeKey(v.rt.move!.from, v.rt.move!.to));
    // Route liefern: Umweg über einen Zwischenpunkt, 10 min Fahrzeit
    const m = v.rt.move!;
    const via: LatLng = [m.from[0] + 0.05, m.from[1]];
    putRoute(routeKey(m.from, m.to), { path: [m.from, via, m.to], durationS: 600, distanceM: 9000 });
    applyRoutes(g);
    expect(v.rt.move!.routed).toBe(true);
    expect(v.rt.move!.arriveAt - v.rt.move!.departAt).toBe(600 * 1000 * 0.75);
    tick(g, 100_000);
    // Fahrzeug fährt auf dem ersten Abschnitt der Route genau nach Norden (gleiche Länge wie der Start)
    expect(v.rt.position[1]).toBeCloseTo(m.from[1], 6);
    expect(v.rt.position[0]).toBeGreaterThan(m.from[0]);
    tick(g, 400_000);
    // eingetroffen (Status 4, als erstes Fahrzeug gleich Status 5 für die Lagemeldung)
    expect(['einsatzort', 'sprechwunsch']).toContain(v.rt.status);
  });

  it('nutzt eine vorhandene Route bereits beim Losfahren und für die Eintreffzeit', () => {
    const g = createGame(createSampleCenter());
    const v = g.center.vehicles[0];
    const target: LatLng = [50.6, 9.6];
    putRoute(routeKey(v.rt.position, target), { path: [v.rt.position, target], durationS: 1200, distanceM: 15000 });
    const eta = etaFor(g, v, target);
    expect(eta.routed).toBe(true);
    expect(eta.distanceM).toBe(15000);
  });
});

describe.skipIf(!process.env.LIVE)('OSRM live (öffentlicher Demo-Server mit identischer API)', () => {
  it('liefert eine Straßenroute Eutin → Neustadt in Holstein', async () => {
    const r = await fetchOsrmRoute('https://router.project-osrm.org', [54.137, 10.617], [54.093, 10.81]);
    console.log('OSRM', r.distanceM, r.durationS, r.path.length);
    expect(r.path.length).toBeGreaterThan(20);
    expect(r.distanceM).toBeGreaterThan(14000);
  }, 30000);
});
