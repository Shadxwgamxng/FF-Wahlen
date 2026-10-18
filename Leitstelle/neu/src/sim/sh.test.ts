import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createOstholsteinCenter } from '../data/ostholstein';
import type { OverpassElement } from '../geo/places';
import type { GameState } from '../model/types';
import {
  acceptCall,
  acknowledgeRadio,
  alarmVehicles,
  askQuestion,
  assignHospital,
  closeCallWithoutIncident,
  closeIncident,
  createGame,
  createIncidentFromCall,
  linkCallToIncident,
  releaseAllOnScene,
  setCallKeyword,
  setCallMeldebild,
  tick,
  truthKeywordCode,
  truthMeldebild,
} from './engine';
import { hospitalOptions, suggestForIncident } from './dispatch';

const SEC = 1000;
/** Echte OSM-Daten aus dem Süden des Kreises (siehe e2e/fixtures/README.md) */
const ELEMENTS: OverpassElement[] = JSON.parse(readFileSync(new URL('../../e2e/fixtures/overpass-ostholstein-sued.json', import.meta.url), 'utf8')).elements;

function ostholstein(seed: number): GameState {
  const c = createOstholsteinCenter(ELEMENTS);
  c.settings.seed = seed;
  c.settings.randomBreakdowns = false;
  return createGame(c);
}

describe('Katalog Schleswig-Holstein in der Beispielleitstelle Ostholstein', () => {
  it('jede im SH-Katalog geforderte Fähigkeit ist mit Fahrzeugen der Leitstelle abgedeckt', () => {
    const g = ostholstein(1);
    expect(g.center.catalogId).toBe('sh');
    const provided = new Set(g.center.vehicles.flatMap((v) => g.center.vehicleTypes.find((t) => t.id === v.typeId)?.capabilities ?? []));
    const missing = new Set<string>();
    for (const r of g.center.aao) for (const { capability } of r.requirements) if (!provided.has(capability)) missing.add(`${capability} (${g.center.keywords.find((k) => k.id === r.keywordId)?.code})`);
    expect([...missing]).toEqual([]);
  });

  it('Weiterleitung beendet den Notruf ohne Einsatz', () => {
    const g = ostholstein(2);
    while (!g.runtime.calls.some((c) => c.state === 'klingelt')) tick(g, 10 * SEC);
    const call = g.runtime.calls.find((c) => c.state === 'klingelt')!;
    acceptCall(g, call.id);
    const fwd = g.center.keywords.find((k) => k.forward)!;
    expect(fwd).toBeDefined();
    expect(setCallKeyword(g, call.id, fwd.id).ok).toBe(true);
    expect(createIncidentFromCall(g, call.id).ok).toBe(true);
    expect(g.runtime.incidents).toHaveLength(0);
    expect(call.state).not.toBe('in_abfrage');
  });

  it('Langlauf: 8 Stunden mit SH-Stichworten und Meldebildern bleibt konsistent', () => {
    const g = ostholstein(4242);
    let incidents = 0;
    for (let i = 0; i < 8 * 360; i++) {
      tick(g, 10 * SEC);
      for (const call of g.runtime.calls.filter((x) => x.state === 'klingelt' && x.receivedAt <= g.runtime.clock.now)) {
        acceptCall(g, call.id);
        askQuestion(g, call.id, 'ort');
        if (call.duplicateOfIncidentId && g.runtime.incidents.some((x) => x.id === call.duplicateOfIncidentId)) {
          linkCallToIncident(g, call.id, call.duplicateOfIncidentId);
          continue;
        }
        const mbLabel = truthMeldebild(call.scenarioId, call.variantIdx, 'sh');
        const mb = mbLabel ? g.center.meldebilder.find((m) => m.label === mbLabel) : undefined;
        if (mbLabel) expect(mb, `Meldebild ${mbLabel}`).toBeDefined();
        if (mb) expect(setCallMeldebild(g, call.id, mb.id).ok).toBe(true);
        const code = truthKeywordCode(call.scenarioId, call.variantIdx, 'sh');
        const kw = g.center.keywords.find((k) => k.code === code);
        if (!kw) {
          closeCallWithoutIncident(g, call.id, 'kein Einsatz');
          continue;
        }
        setCallKeyword(g, call.id, kw.id);
        expect(createIncidentFromCall(g, call.id).ok, `${call.scenarioId} -> ${code}`).toBe(true);
        if (!kw.forward) incidents++;
      }
      for (const inc of [...g.runtime.incidents]) {
        if (i % 6 === 0) {
          const s = suggestForIncident(g, inc);
          if (s.proposal.length) alarmVehicles(g, inc.id, s.proposal.map((p) => p.vehicleId));
        }
        for (const m of g.runtime.radio.filter((x) => !x.handled && x.incidentId === inc.id)) {
          if (m.kind === 'transportziel') {
            const p = inc.patients.find((x) => x.id === m.patientId)!;
            const v = g.center.vehicles.find((x) => x.id === m.vehicleId)!;
            assignHospital(g, m.id, hospitalOptions(g, p, v.rt.position)[0].hospital.id);
          } else acknowledgeRadio(g, m.id);
        }
        if (inc.state === 'abarbeitung_beendet') {
          releaseAllOnScene(g, inc.id);
          closeIncident(g, inc.id);
        }
      }
      for (const v of g.center.vehicles) {
        if (!v.rt.incidentId) continue;
        const inc = g.runtime.incidents.find((x) => x.id === v.rt.incidentId);
        expect(inc, `${v.callsign} an nicht existierenden Einsatz gebunden`).toBeDefined();
        expect(inc!.activeVehicleIds).toContain(v.id);
      }
    }
    expect(incidents).toBeGreaterThan(15);
    expect(g.runtime.archive.length).toBeGreaterThan(10);
    const stale = g.runtime.incidents.filter((i) => g.runtime.clock.now - i.createdAt > 3 * 3600 * SEC);
    expect(stale.map((i) => `${i.scenarioId}:${i.state}`)).toEqual([]);
  }, 120_000);
});
