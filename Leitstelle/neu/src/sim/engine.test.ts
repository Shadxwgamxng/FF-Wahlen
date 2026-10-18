import { describe, expect, it } from 'vitest';
import { createSampleCenter } from '../data/sampleCenter';
import { findScenario, SCENARIOS, scenariosForCatalog } from '../data/scenarios';
import { KEYWORD_SEEDS } from '../data/keywords';
import { CATEGORY_QUESTIONS } from '../data/questions';
import { CAPABILITIES } from '../data/vehicleTypes';
import type { GameState } from '../model/types';
import { Rng } from './rng';
import { generateCall } from './callgen';
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
  keywordHint,
  linkCallToIncident,
  releaseAllOnScene,
  releaseVehicle,
  setCallKeyword,
  setVehicleServiceStatus,
  tick,
  truthKeywordCode,
} from './engine';
import { suggestForIncident, hospitalOptions } from './dispatch';
import { vehicleAvailability } from './availability';
import { hospitalOptions as ho } from './dispatch';

const SEC = 1000;
const MIN = 60 * SEC;

function newGame(seed = 1): GameState {
  const c = createSampleCenter();
  c.settings.seed = seed;
  c.settings.randomBreakdowns = false;
  const g = createGame(c);
  // Keine automatischen Notrufe in den Tests, außer explizit gewünscht
  g.runtime.nextCallAt = Number.MAX_SAFE_INTEGER;
  return g;
}

function injectCall(g: GameState, scenarioId: string, variantIdx?: number) {
  const sc = findScenario(scenarioId)!;
  const rng = new Rng(99);
  g.runtime.counters.call++;
  const call = generateCall(g, rng, `c_${g.runtime.counters.call}`, g.runtime.clock.now, sc)!;
  if (variantIdx !== undefined) call.variantIdx = variantIdx;
  g.runtime.calls.push(call);
  return call;
}

function runUntil(g: GameState, cond: () => boolean, maxMs = 6 * 3600 * SEC, step = 5 * SEC) {
  let t = 0;
  while (!cond() && t < maxMs) {
    tick(g, step);
    t += step;
  }
  return cond();
}

/** Spielt einen Einsatz komplett durch, wie es ein Disponent tun würde */
function playIncident(g: GameState, incidentId: string) {
  const inc = () => g.runtime.incidents.find((i) => i.id === incidentId);
  const sug = suggestForIncident(g, inc()!);
  const r = alarmVehicles(g, incidentId, sug.proposal.map((p) => p.vehicleId));
  expect(r.ok).toBe(true);
  const done = runUntil(g, () => {
    const i = inc();
    if (!i) return true;
    // offene Funkmeldungen bearbeiten
    for (const m of g.runtime.radio.filter((x) => !x.handled && x.incidentId === incidentId)) {
      if (m.kind === 'transportziel') {
        const p = i.patients.find((x) => x.id === m.patientId)!;
        const v = g.center.vehicles.find((x) => x.id === m.vehicleId)!;
        assignHospital(g, m.id, ho(g, p, v.rt.position)[0].hospital.id);
      } else {
        acknowledgeRadio(g, m.id);
        if (m.kind === 'nachforderung') {
          const s = suggestForIncident(g, i);
          if (s.proposal.length) alarmVehicles(g, incidentId, s.proposal.map((p) => p.vehicleId));
        }
      }
    }
    if (i.state === 'abarbeitung_beendet') {
      if (i.activeVehicleIds.some((id) => {
        const v = g.center.vehicles.find((x) => x.id === id)!;
        return v.rt.status !== 'transport' && v.rt.status !== 'am_ziel';
      })) releaseAllOnScene(g, incidentId);
      if (i.activeVehicleIds.length === 0) closeIncident(g, incidentId);
    }
    return false;
  });
  expect(done).toBe(true);
}

describe('Katalog', () => {
  it('enthält mindestens 50 Szenarien mit gültigen Stichwörtern und Fragen', () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(50);
    const codes = new Set(KEYWORD_SEEDS.map((k) => k.code));
    for (const sc of scenariosForCatalog('standard')) {
      const kws = [sc.keyword, ...(sc.variants ?? []).map((v) => v.keyword).filter(Boolean)];
      for (const k of kws) expect(k === '-' || codes.has(k!), `${sc.id}: ${k}`).toBe(true);
      const qids = new Set(['ort', 'was', 'rueckruf', ...CATEGORY_QUESTIONS[sc.category].map((q) => q.id)]);
      for (const q of sc.keyQuestions) expect(qids.has(q), `${sc.id}: ${q}`).toBe(true);
      expect(sc.openings.length).toBeGreaterThan(0);
    }
  });
  it('alle Bedarfe nutzen bekannte Fähigkeiten, die von mindestens einem Fahrzeug der Beispielleitstelle erfüllt werden', () => {
    const c = createSampleCenter();
    const provided = new Set(c.vehicles.flatMap((v) => c.vehicleTypes.find((t) => t.id === v.typeId)!.capabilities));
    for (const k of KEYWORD_SEEDS) for (const [cap] of k.needs) {
      expect(CAPABILITIES[cap], cap).toBeDefined();
      expect(provided.has(cap), cap).toBe(true);
    }
  });
});

describe('Notrufannahme', () => {
  it('erfordert Ortsabfrage und Stichwort vor Einsatzanlage', () => {
    const g = newGame();
    const call = injectCall(g, 'brand_kueche', -1);
    expect(acceptCall(g, call.id).ok).toBe(true);
    expect(createIncidentFromCall(g, call.id)).toMatchObject({ ok: false });
    askQuestion(g, call.id, 'ort');
    expect(createIncidentFromCall(g, call.id)).toMatchObject({ ok: false, error: expect.stringContaining('Einsatzstichwort') });
    setCallKeyword(g, call.id, 'kw_b_3');
    const r = createIncidentFromCall(g, call.id);
    expect(r.ok).toBe(true);
    expect(g.runtime.incidents).toHaveLength(1);
    expect(g.runtime.calls.find((c) => c.id === call.id)!.state).toBe('abgeschlossen');
  });

  it('beantwortet Fragen situationsabhängig aus den Fakten', () => {
    const g = newGame();
    const call = injectCall(g, 'vu_eingeklemmt');
    acceptCall(g, call.id);
    expect(askQuestion(g, call.id, 'vu_eingeklemmt').ok).toBe(true);
    expect(call.dialog[0].answer).toContain('eingeklemmt');
    expect(askQuestion(g, call.id, 'vu_eingeklemmt').ok).toBe(false);
    // Kategorie-fremde Frage ist nicht verfügbar
    expect(askQuestion(g, call.id, 'b_objekt').ok).toBe(false);
  });

  it('Abfragehilfe schlägt Stichwort erst nach Schlüsselfragen vor', () => {
    const g = newGame();
    const call = injectCall(g, 'rd_rea');
    acceptCall(g, call.id);
    expect(keywordHint(g, call.id)).toBeNull();
    askQuestion(g, call.id, 'rd_bewusst');
    askQuestion(g, call.id, 'rd_atmung');
    expect(keywordHint(g, call.id)?.keywordId).toBe('kw_rd_rea');
  });

  it('nicht angenommene Notrufe werden aufgelegt und erneut gewählt', () => {
    const g = newGame();
    const call = injectCall(g, 'rd_sturz');
    runUntil(g, () => call.state === 'aufgelegt', 20 * MIN);
    expect(call.state).toBe('aufgelegt');
    expect(g.runtime.stats.callsMissed).toBe(1);
    expect(g.runtime.calls.some((c) => c.redialOf === call.id)).toBe(true);
  });

  it('Fehlanruf kann ohne Einsatz beendet werden', () => {
    const g = newGame();
    const call = injectCall(g, 'son_fehlanruf');
    acceptCall(g, call.id);
    expect(closeCallWithoutIncident(g, call.id, 'Hosentaschenanruf').ok).toBe(true);
    expect(g.runtime.incidents).toHaveLength(0);
  });

  it('Folgeanruf kann mit bestehendem Einsatz verknüpft werden', () => {
    const g = newGame();
    const call = injectCall(g, 'brand_pkw');
    acceptCall(g, call.id);
    askQuestion(g, call.id, 'ort');
    setCallKeyword(g, call.id, 'kw_b_1');
    const r = createIncidentFromCall(g, call.id);
    const call2 = injectCall(g, 'brand_pkw');
    call2.duplicateOfIncidentId = r.ok ? r.id! : null;
    acceptCall(g, call2.id);
    expect(linkCallToIncident(g, call2.id, r.ok ? r.id! : '').ok).toBe(true);
    expect(g.runtime.events.at(-1)!.kind).toBe('notruf');
  });
});

describe('Disposition und Einsatzlebenszyklus', () => {
  it('spielt einen Brandeinsatz vom Notruf bis zum Archiv vollständig durch', () => {
    const g = newGame(7);
    const call = injectCall(g, 'brand_kueche', 0); // Variante: Person in Wohnung -> B 3 Y
    acceptCall(g, call.id);
    askQuestion(g, call.id, 'ort');
    askQuestion(g, call.id, 'b_personen');
    setCallKeyword(g, call.id, 'kw_b_3_y');
    const r = createIncidentFromCall(g, call.id);
    expect(r.ok).toBe(true);
    const id = r.ok ? r.id! : '';
    const inc = g.runtime.incidents.find((i) => i.id === id)!;
    expect(inc.keywordCorrect).toBe(true);

    const sug = suggestForIncident(g, inc);
    expect(sug.unfilled).toEqual([]);
    expect(sug.proposal.length).toBeGreaterThanOrEqual(5);

    playIncident(g, id);
    expect(g.runtime.incidents.find((i) => i.id === id)).toBeUndefined();
    const arch = g.runtime.archive.find((a) => a.id === id)!;
    expect(arch.firstAlarmAt).not.toBeNull();
    expect(arch.firstArrivalAt).toBeGreaterThan(arch.firstAlarmAt!);
    // Alle Fahrzeuge kehren zurück und sind wieder verfügbar
    runUntil(g, () => g.center.vehicles.every((v) => !v.rt.move), 3 * 3600 * SEC);
    for (const vid of arch ? g.center.vehicles.filter((v) => v.rt.alarms > 0).map((v) => v.id) : []) {
      const v = g.center.vehicles.find((x) => x.id === vid)!;
      expect(v.rt.incidentId).toBeNull();
      expect(['frei_wache', 'ausser_dienst']).toContain(v.rt.status);
    }
  });

  it('durchläuft die Statusfolge Alarm -> 3 -> 4 -> 7 -> 8 -> 1 -> 2 beim RTW', () => {
    const g = newGame(3);
    const call = injectCall(g, 'rd_sturz', -1);
    call.facts.conscious = true;
    acceptCall(g, call.id);
    askQuestion(g, call.id, 'ort');
    setCallKeyword(g, call.id, 'kw_rd_1');
    const r = createIncidentFromCall(g, call.id);
    const id = r.ok ? r.id! : '';
    const inc = g.runtime.incidents.find((i) => i.id === id)!;
    inc.patients.forEach((p) => {
      p.department = 'unfallchirurgie';
      p.needsDoctor = false;
    });
    const sug = suggestForIncident(g, inc);
    const rtwId = sug.proposal[0].vehicleId;
    alarmVehicles(g, id, [rtwId]);
    const rtw = g.center.vehicles.find((v) => v.id === rtwId)!;
    const seen: string[] = [rtw.rt.status];
    runUntil(g, () => {
      if (seen.at(-1) !== rtw.rt.status) seen.push(rtw.rt.status);
      const m = g.runtime.radio.find((x) => !x.handled && x.kind === 'transportziel');
      if (m) assignHospital(g, m.id, 'kh_klinikum');
      return rtw.rt.status === 'frei_wache';
    });
    expect(seen).toEqual(['alarmiert', 'anfahrt', 'einsatzort', 'sprechwunsch', 'transport', 'am_ziel', 'frei_funk', 'frei_wache']);
    // Rein medizinischer Einsatz ist nach Übergabe abgearbeitet und abschließbar
    expect(g.runtime.incidents.find((i) => i.id === id)!.state).toBe('abarbeitung_beendet');
    expect(closeIncident(g, id).ok).toBe(true);
    expect(g.runtime.archive.map((a) => a.id)).toContain(id);
    expect(g.center.hospitals.find((h) => h.id === 'kh_klinikum')!.occupied).toBe(1);
  });

  it('verhindert die Doppelbindung eines Fahrzeugs an zwei Einsätze', () => {
    const g = newGame();
    const ids: string[] = [];
    for (const sc of ['rd_sturz', 'rd_diabetes']) {
      const call = injectCall(g, sc);
      acceptCall(g, call.id);
      askQuestion(g, call.id, 'ort');
      setCallKeyword(g, call.id, 'kw_rd_1');
      const r = createIncidentFromCall(g, call.id);
      ids.push(r.ok ? r.id! : '');
    }
    const v = g.center.vehicles.find((x) => x.typeId === 'rtw')!;
    expect(alarmVehicles(g, ids[0], [v.id]).ok).toBe(true);
    const second = alarmVehicles(g, ids[1], [v.id]);
    expect(second.ok).toBe(false);
    expect(v.rt.incidentId).toBe(ids[0]);
    // Vorschlag für zweiten Einsatz nutzt das gebundene Fahrzeug nicht
    const inc2 = g.runtime.incidents.find((i) => i.id === ids[1])!;
    expect(suggestForIncident(g, inc2).proposal.map((p) => p.vehicleId)).not.toContain(v.id);
  });

  it('erkennt Unterdisposition: Kräfte vor Ort fordern nach', () => {
    const g = newGame(11);
    const call = injectCall(g, 'brand_kueche', 0); // eigentlich B 3 Y
    acceptCall(g, call.id);
    askQuestion(g, call.id, 'ort');
    setCallKeyword(g, call.id, 'kw_b_1'); // falsches, zu kleines Stichwort
    const r = createIncidentFromCall(g, call.id);
    const id = r.ok ? r.id! : '';
    const inc = g.runtime.incidents.find((i) => i.id === id)!;
    expect(inc.keywordCorrect).toBe(false);
    alarmVehicles(g, id, suggestForIncident(g, inc).proposal.map((p) => p.vehicleId));
    runUntil(g, () => g.runtime.radio.some((m) => m.kind === 'nachforderung' && m.incidentId === id), 60 * MIN);
    const m = g.runtime.radio.find((x) => x.kind === 'nachforderung' && x.incidentId === id)!;
    expect(m).toBeDefined();
    expect(inc.backupRequests.length).toBeGreaterThan(0);
    // Vorschlag berücksichtigt die Nachforderung
    expect(suggestForIncident(g, inc).proposal.length).toBeGreaterThan(0);
  });

  it('wiederholte Nachforderungen summieren sich nicht auf, wenn keine Kräfte verfügbar sind', () => {
    const g = newGame(5);
    const call = injectCall(g, 'abc_co');
    acceptCall(g, call.id);
    askQuestion(g, call.id, 'ort');
    setCallKeyword(g, call.id, 'kw_rd_1'); // zu klein: Feuerwehr fehlt
    const r = createIncidentFromCall(g, call.id);
    const id = r.ok ? r.id! : '';
    const inc = g.runtime.incidents.find((i) => i.id === id)!;
    // alle Löschfahrzeuge außer Dienst
    for (const v of g.center.vehicles) if (g.center.vehicleTypes.find((t) => t.id === v.typeId)!.capabilities.includes('loeschen')) setVehicleServiceStatus(g, v.id, false);
    alarmVehicles(g, id, suggestForIncident(g, inc).proposal.map((p) => p.vehicleId));
    runUntil(g, () => false, 90 * MIN, 10 * SEC);
    for (const m of g.runtime.radio.filter((x) => !x.handled)) acknowledgeRadio(g, m.id);
    runUntil(g, () => false, 60 * MIN, 10 * SEC);
    const requested = inc.backupRequests.flatMap((b) => b.requirements).filter((q) => q.capability === 'loeschen').reduce((a, b) => a + b.count, 0);
    expect(requested).toBe(1);
  });

  it('Entlassen eines Fahrzeugs während der Anfahrt macht es wieder verfügbar', () => {
    const g = newGame();
    const call = injectCall(g, 'th_oel');
    acceptCall(g, call.id);
    askQuestion(g, call.id, 'ort');
    setCallKeyword(g, call.id, 'kw_th_oel');
    const r = createIncidentFromCall(g, call.id);
    const id = r.ok ? r.id! : '';
    const inc = g.runtime.incidents.find((i) => i.id === id)!;
    const vid = suggestForIncident(g, inc).proposal[0].vehicleId;
    alarmVehicles(g, id, [vid]);
    runUntil(g, () => g.center.vehicles.find((v) => v.id === vid)!.rt.status === 'anfahrt');
    expect(releaseVehicle(g, vid).ok).toBe(true);
    const v = g.center.vehicles.find((x) => x.id === vid)!;
    expect(v.rt.status).toBe('frei_funk');
    expect(vehicleAvailability(g, v).available).toBe(true);
    expect(inc.activeVehicleIds).toEqual([]);
  });

  it('Einsatz kann nicht abgeschlossen werden, solange Fahrzeuge gebunden sind', () => {
    const g = newGame();
    const call = injectCall(g, 'th_baum', -1);
    acceptCall(g, call.id);
    askQuestion(g, call.id, 'ort');
    setCallKeyword(g, call.id, 'kw_th_1');
    const r = createIncidentFromCall(g, call.id);
    const id = r.ok ? r.id! : '';
    const inc = g.runtime.incidents.find((i) => i.id === id)!;
    alarmVehicles(g, id, suggestForIncident(g, inc).proposal.map((p) => p.vehicleId));
    expect(closeIncident(g, id).ok).toBe(false);
  });
});

describe('Verfügbarkeit', () => {
  it('KTW ist außerhalb der Dienstzeit nicht verfügbar', () => {
    const g = newGame();
    const ktw = g.center.vehicles.find((v) => v.typeId === 'ktw')!;
    expect(vehicleAvailability(g, ktw).available).toBe(true); // Montag 07:30
    runUntil(g, () => new Date(g.runtime.clock.now).getUTCHours() === 20, 24 * 3600 * SEC, MIN);
    expect(ktw.rt.status).toBe('ausser_dienst');
    expect(vehicleAvailability(g, ktw).reason).toContain('Dienstzeit');
  });

  it('Wartungsfenster setzt Fahrzeug außer Dienst und danach wieder in Dienst', () => {
    const g = newGame();
    const gwt = g.center.vehicles.find((v) => v.typeId === 'gwt')!;
    runUntil(g, () => new Date(g.runtime.clock.now).getUTCHours() === 10, 6 * 3600 * SEC, MIN);
    expect(gwt.rt.status).toBe('ausser_dienst');
    runUntil(g, () => new Date(g.runtime.clock.now).getUTCHours() === 14, 6 * 3600 * SEC, MIN);
    expect(gwt.rt.status).toBe('frei_wache');
  });

  it('manuell außer Dienst gestellte Fahrzeuge werden nicht vorgeschlagen', () => {
    const g = newGame();
    const v = g.center.vehicles.find((x) => x.typeId === 'rtw')!;
    expect(setVehicleServiceStatus(g, v.id, false).ok).toBe(true);
    tick(g, 10 * SEC);
    expect(v.rt.status).toBe('ausser_dienst');
    expect(vehicleAvailability(g, v).available).toBe(false);
    expect(setVehicleServiceStatus(g, v.id, true).ok).toBe(true);
    expect(vehicleAvailability(g, v).available).toBe(true);
  });
});

describe('Simulation', () => {
  it('ist mit gleichem Seed reproduzierbar', () => {
    const run = () => {
      const c = createSampleCenter();
      c.settings.seed = 12345;
      const g = createGame(c);
      for (let i = 0; i < 720; i++) tick(g, 10 * SEC);
      return g.runtime.calls.map((c) => `${c.scenarioId}@${c.receivedAt}:${c.location.address}`);
    };
    const a = run();
    expect(a.length).toBeGreaterThan(3);
    expect(run()).toEqual(a);
  });

  it('erzeugt parallele Notrufe und respektiert Aufkommen', () => {
    const c = createSampleCenter();
    c.settings.callsPerHour = 30;
    const g = createGame(c);
    for (let i = 0; i < 360; i++) tick(g, 10 * SEC); // 1 h
    expect(g.runtime.stats.callsTotal).toBeGreaterThan(15);
  });

  it('hält ohne Ticks den Zustand an (Pause)', () => {
    const g = newGame();
    const before = JSON.stringify(g);
    tick(g, 0);
    expect(JSON.stringify(g)).toEqual(before);
  });

  it('wahres Stichwort einer Variante wird korrekt ermittelt', () => {
    expect(truthKeywordCode('brand_kueche', -1)).toBe('B 3');
    expect(truthKeywordCode('brand_kueche', 0)).toBe('B 3 Y');
  });

  it('Krankenhausvorschlag bevorzugt passende Fachrichtung', () => {
    const g = newGame();
    const opts = hospitalOptions(g, { id: 'x', label: 'P1', needsDoctor: false, department: 'paediatrie', state: 'versorgt', vehicleId: null, hospitalId: null, readyAt: null }, [50.55, 9.68]);
    expect(opts[0].suitable).toBe(true);
    expect(opts[0].hospital.departments).toContain('paediatrie');
  });

  it('Langlauf: 12 Stunden Simulation mit automatischem Spieler bleibt konsistent', () => {
    const c = createSampleCenter();
    c.settings.seed = 777;
    const g = createGame(c);
    for (let i = 0; i < 12 * 360; i++) {
      tick(g, 10 * SEC);
      // einfacher Bot: Anrufe annehmen, korrektes Stichwort, Vorschlag alarmieren
      for (const call of g.runtime.calls.filter((x) => x.state === 'klingelt' && x.receivedAt <= g.runtime.clock.now)) {
        acceptCall(g, call.id);
        askQuestion(g, call.id, 'ort');
        if (call.duplicateOfIncidentId && g.runtime.incidents.some((x) => x.id === call.duplicateOfIncidentId)) {
          linkCallToIncident(g, call.id, call.duplicateOfIncidentId);
          continue;
        }
        const code = truthKeywordCode(call.scenarioId, call.variantIdx);
        const kw = g.center.keywords.find((k) => k.code === code);
        if (!kw) {
          closeCallWithoutIncident(g, call.id, 'kein Einsatz');
          continue;
        }
        setCallKeyword(g, call.id, kw.id);
        createIncidentFromCall(g, call.id);
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
            assignHospital(g, m.id, ho(g, p, v.rt.position)[0].hospital.id);
          } else acknowledgeRadio(g, m.id);
        }
        if (inc.state === 'abarbeitung_beendet') {
          releaseAllOnScene(g, inc.id);
          closeIncident(g, inc.id);
        }
      }
      // Invarianten
      for (const v of g.center.vehicles) {
        if (v.rt.incidentId) {
          const inc = g.runtime.incidents.find((x) => x.id === v.rt.incidentId);
          expect(inc, `${v.callsign} an nicht existierenden Einsatz gebunden`).toBeDefined();
          expect(inc!.activeVehicleIds).toContain(v.id);
        }
      }
      for (const inc of g.runtime.incidents) {
        for (const vid of inc.activeVehicleIds) expect(g.center.vehicles.find((v) => v.id === vid)!.rt.incidentId).toBe(inc.id);
      }
    }
    expect(g.runtime.archive.length).toBeGreaterThan(20);
    // Kein Einsatz bleibt dauerhaft hängen
    const stale = g.runtime.incidents.filter((i) => g.runtime.clock.now - i.createdAt > 3 * 3600 * SEC);
    if (stale.length) console.log("NOW", g.runtime.clock.now, JSON.stringify(stale.map((i) => ({ created: i.createdAt, firstArr: i.firstArrivalAt, moves: g.center.vehicles.filter((v) => v.rt.incidentId === i.id && v.rt.move).map((v) => [v.rt.move!.departAt, v.rt.move!.arriveAt]).slice(0, 3), sc: i.scenarioId, st: i.state, kw: i.keywordId, needs: i.needs, act: i.activeVehicleIds.map((id) => { const v = g.center.vehicles.find((x) => x.id === id)!; return `${v.callsign}:${v.rt.status}:${v.rt.move ? 'move' : ''}:${v.rt.phaseUntil}`; }), pats: i.patients.map((p) => `${p.state}:${p.vehicleId}:${p.needsDoctor}`), work: `${i.workDoneMs}/${i.workTotalMs}`, log: i.log.slice(-6).map((l) => l.text) })), null, 1));
    expect(stale.map((i) => `${i.scenarioId}:${i.state}`)).toEqual([]);
  }, 120_000);
});
