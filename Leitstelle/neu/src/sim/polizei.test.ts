import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createOstholsteinCenter } from '../data/ostholstein';
import type { OverpassElement } from '../geo/places';
import { alarmVehicles, createGame, createManualIncident, tick } from './engine';
import { isPoliceVehicle, suggestForIncident } from './dispatch';
import { policeAnswer, policeCallOpen, policeShare, policeTalk, requestedPatrols } from './polizei';

const ELEMENTS: OverpassElement[] = JSON.parse(readFileSync(new URL('../../e2e/fixtures/overpass-ostholstein-sued.json', import.meta.url), 'utf8')).elements;

function setup() {
  const g = createGame(createOstholsteinCenter(ELEMENTS));
  const kw = g.center.keywords.find((k) => k.category === 'pol') ?? g.center.keywords[0];
  const pos = g.center.stations.find((s) => s.kind === 'polizei')!.position;
  createManualIncident(g, kw.id, [pos[0] + 0.01, pos[1]], 'Kirchhofsallee 10, 23730 Neustadt in Holstein', 'Person aggressiv');
  return { g, inc: g.runtime.incidents[0] };
}

describe('Polizei per Telefon', () => {
  it('Polizei wird nicht selbst disponiert', () => {
    const { g, inc } = setup();
    expect(suggestForIncident(g, inc).candidates.some((c) => isPoliceVehicle(g, c.vehicle))).toBe(false);
    const pol = g.center.vehicles.find((v) => isPoliceVehicle(g, v))!;
    const r = alarmVehicles(g, inc.id, [pol.id]);
    expect(r.ok).toBe(false);
  });

  it('anrufen, Einsatz teilen, Streifen anfordern', () => {
    const { g, inc } = setup();
    policeCallOpen(g, inc.id);
    expect(inc.police!.lines[0].from).toBe('polizei');
    policeTalk(g, inc.id, 'Wir brauchen zwei Streifen');
    expect(inc.police!.sent).toHaveLength(0);
    expect(inc.police!.lines.at(-1)!.text).toMatch(/teilen/);
    policeShare(g, inc.id);
    policeTalk(g, inc.id, 'Wir brauchen zwei Streifen, Person ist aggressiv');
    expect(inc.police!.sent.length).toBeGreaterThanOrEqual(1);
    expect(inc.police!.lines.at(-1)!.text).toMatch(/aggressive Person.*Minuten/);
    for (const id of inc.police!.sent) expect(g.center.vehicles.find((v) => v.id === id)!.rt.incidentId).toBe(inc.id);
    policeTalk(g, inc.id, 'Danke, tschüss');
    expect(inc.police!.open).toBe(false);
  });

  it('liest die Anzahl', () => {
    expect(requestedPatrols('wir brauchen zwei streifen')).toBe(2);
    expect(requestedPatrols('3 Streifenwagen bitte')).toBe(3);
    expect(requestedPatrols('schicken Sie bitte eine Streife')).toBe(1);
    expect(requestedPatrols('Polizei bitte')).toBe(1);
  });

  it('schickt zugesagte Streifen nach, sobald welche frei werden', () => {
    const { g, inc } = setup();
    const pols = g.center.vehicles.filter((v) => isPoliceVehicle(g, v));
    const saved = pols.map((v) => v.rt.status);
    for (const v of pols) v.rt.status = 'ausser_dienst';
    policeShare(g, inc.id);
    policeTalk(g, inc.id, 'Wir brauchen eine Streife');
    expect(inc.police!.sent).toHaveLength(0);
    expect(inc.police!.pending?.count).toBe(1);
    pols.forEach((v, i) => (v.rt.status = saved[i]));
    tick(g, 10_000);
    expect(inc.police!.sent.length).toBe(1);
    expect(inc.police!.pending).toBeUndefined();
  });

  it('Streifen funken nicht bei uns; zuerst vor Ort und kritisch: Polizeileitstelle ruft an', () => {
    for (const critical of [false, true]) {
      const { g, inc } = setup();
      inc.patients = critical ? [{ id: 'p1', label: 'Patient 1', needsDoctor: true, department: 'Innere', state: 'wartet', vehicleId: null, hospitalId: null, readyAt: null }] : [];
      policeShare(g, inc.id);
      policeTalk(g, inc.id, 'Wir brauchen eine Streife');
      const sent = inc.police!.sent;
      expect(sent.length).toBeGreaterThan(0);
      policeTalk(g, inc.id, 'Danke, tschüss');
      for (let i = 0; i < 400 && !inc.firstArrivalAt; i++) tick(g, 5000);
      expect(inc.firstArrivalAt).toBeTruthy();
      // kein Sprechwunsch, kein Funk von der Polizei
      expect(g.runtime.radio.some((r) => sent.includes(r.vehicleId))).toBe(false);
      for (const id of sent) expect(g.center.vehicles.find((v) => v.id === id)!.rt.status).not.toBe('sprechwunsch');
      expect(!!inc.police!.incoming, `kritisch=${critical}`).toBe(critical);
      if (critical) {
        expect(inc.police!.open).toBe(true);
        expect(inc.police!.lines.at(-1)!.text).toMatch(/Polizeileitstelle hier.*Streife ist als Erste vor Ort/);
        policeAnswer(g, inc.id);
        expect(inc.police!.incoming).toBe(false);
      }
    }
  });
});
