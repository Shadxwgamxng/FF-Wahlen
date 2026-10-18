import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createOstholsteinCenter } from '../data/ostholstein';
import type { OverpassElement } from '../geo/places';
import type { GameState } from '../model/types';
import {
  acceptCall,
  acknowledgeRadio,
  alarmGroups,
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
import { groupDeployment, isGroupVehicle, proposalWithGroups, turnoutFactor } from './alarmGroups';
import { injectScenarioCall } from './engine';

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
          // wie in der Oberfläche: Freiwillige Feuerwehren über Alarmgruppen, alle anderen fahrzeugweise
          const plan = proposalWithGroups(g, inc, s);
          if (plan.groups.length) alarmGroups(g, inc.id, plan.groups.map((x) => x.station.id));
          if (plan.vehicleIds.length) alarmVehicles(g, inc.id, plan.vehicleIds);
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

  it('Alarmgruppe: die Wehr rückt nach Lage aus, später zur Tageszeit passend, mit Funkrückmeldung', () => {
    const g = ostholstein(9);
    tick(g, SEC);
    expect(injectScenarioCall(g, 'brand_kueche').ok).toBe(true);
    const call = g.runtime.calls[g.runtime.calls.length - 1];
    acceptCall(g, call.id);
    askQuestion(g, call.id, 'ort');
    const kw = g.center.keywords.find((k) => k.code === 'FEU 00')!;
    setCallKeyword(g, call.id, kw.id);
    expect(createIncidentFromCall(g, call.id).ok).toBe(true);
    const inc = g.runtime.incidents[0];
    const plan = proposalWithGroups(g, inc, suggestForIncident(g, inc));
    expect(plan.groups.length).toBeGreaterThan(0);
    // FF-Fahrzeuge stehen nicht mehr einzeln im Vorschlag
    for (const id of plan.vehicleIds) expect(isGroupVehicle(g, g.center.vehicles.find((v) => v.id === id)!)).toBe(false);
    const first = plan.groups[0];
    const dep = groupDeployment(g, inc, first.station);
    expect(dep.length).toBeGreaterThan(0);
    // Die Wehr rückt nicht mit allen Fahrzeugen aus, wenn der Bedarf kleiner ist (MTF bleibt z. B. stehen)
    const stationVehicles = g.center.vehicles.filter((v) => v.stationId === first.station.id);
    if (stationVehicles.some((v) => v.typeId === 'mtf')) expect(dep.some((v) => v.typeId === 'mtf')).toBe(false);
    expect(alarmGroups(g, inc.id, [first.station.id]).ok).toBe(true);
    const alarmed = g.center.vehicles.filter((v) => v.rt.incidentId === inc.id && v.stationId === first.station.id);
    expect(alarmed.map((v) => v.id).sort()).toEqual(dep.map((v) => v.id).sort());
    // Ausrückzeit mit Tageszeitfaktor, Fahrzeuge rücken nacheinander aus
    const f = turnoutFactor(g.runtime.clock.now).factor;
    const times = alarmed.map((v) => v.rt.phaseUntil! - g.runtime.clock.now).sort((a, b) => a - b);
    expect(times[0]).toBeGreaterThanOrEqual(first.station.turnoutSeconds * 1000 * f * 0.8 - 1);
    for (let i = 1; i < times.length; i++) expect(times[i]).toBeGreaterThan(times[i - 1]);
    // Funkrückmeldung beim Ausrücken – genau eine je Wehr
    for (let i = 0; i < 120 && !alarmed.every((v) => v.rt.status !== 'alarmiert'); i++) tick(g, 10 * SEC);
    const reports = g.runtime.radio.filter((r) => r.incidentId === inc.id && r.kind === 'lage' && r.text.includes('rückt aus mit'));
    expect(reports).toHaveLength(1);
    // Zweite Alarmierung derselben Gruppe ohne offenen Bedarf: es rückt noch ein Fahrzeug aus (Verstärkung) oder es gibt eine klare Meldung
    const again = alarmGroups(g, inc.id, [first.station.id]);
    if (!again.ok) expect(again.error).toMatch(/keine einsatzbereiten Fahrzeuge/);
  });

  it('Tageszeitfaktor der Ausrückzeit', () => {
    const at = (iso: string) => Date.parse(iso);
    expect(turnoutFactor(at('2026-10-19T10:00:00Z')).factor).toBe(1.4); // Montag Vormittag
    expect(turnoutFactor(at('2026-10-19T20:00:00Z')).factor).toBe(1); // Montag Abend
    expect(turnoutFactor(at('2026-10-20T03:00:00Z')).factor).toBe(1.15); // Nacht
    expect(turnoutFactor(at('2026-10-18T10:00:00Z')).factor).toBe(1); // Sonntag
  });
});
