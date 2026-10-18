import { describe, expect, it } from 'vitest';
import { catalogById } from '../catalogs';
import { CAPABILITIES } from '../vehicleTypes';
import { findQuestion } from '../questions';
import { NO_INCIDENT_KEYWORD, SCENARIOS, scenariosForCatalog, type ScenarioDef } from '../scenarios';
import { SH_SCENARIOS } from './scenarios';
import { truthKeywordCode, truthMeldebild } from '../../sim/engine';

const sh = catalogById('sh');
const codes = new Set(sh.keywords.map((k) => k.code));
const meldebilder = new Set(sh.meldebilder.map((m) => m.label));
const DEPARTMENTS = new Set(['allgemein', 'innere', 'kardiologie', 'unfallchirurgie', 'neurologie', 'gynaekologie', 'intensiv', 'paediatrie', 'psychiatrie', 'verbrennung']);

const variantsOf = (sc: ScenarioDef) => [-1, ...(sc.variants ?? []).map((_, i) => i)];

describe('Szenarien im Katalog Schleswig-Holstein', () => {
  it('jedes allgemeine Szenario hat eine SH-Lösung', () => {
    const missing = SCENARIOS.filter((s) => !s.catalogs && !s.sh).map((s) => s.id);
    expect(missing).toEqual([]);
  });

  it('SH-spezifische Szenarien sind vorhanden und eindeutig', () => {
    expect(SH_SCENARIOS.length).toBeGreaterThan(20);
    const ids = SCENARIOS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SH_SCENARIOS) expect(scenariosForCatalog('standard').includes(s)).toBe(false);
  });

  it('Lösungsstichworte und Meldebilder existieren im SH-Katalog', () => {
    for (const sc of scenariosForCatalog('sh'))
      for (const v of variantsOf(sc)) {
        const code = truthKeywordCode(sc.id, v, 'sh');
        expect(code === NO_INCIDENT_KEYWORD || codes.has(code), `${sc.id}[${v}] -> ${code}`).toBe(true);
        const mb = truthMeldebild(sc.id, v, 'sh');
        if (mb) expect(meldebilder.has(mb), `${sc.id}[${v}] -> Meldebild "${mb}"`).toBe(true);
      }
  });

  it('Varianten SH-spezifischer Szenarien mit eigenem Stichwort haben eine passende SH-Lösung', () => {
    for (const sc of SH_SCENARIOS)
      for (const [i, v] of (sc.variants ?? []).entries())
        if (v.keyword && v.keyword !== sc.keyword) expect(v.sh?.keyword, `${sc.id}[${i}]`).toBe(v.keyword);
  });

  it('Szenariodaten sind in sich stimmig (Fragen, Fähigkeiten, Fachabteilungen)', () => {
    for (const sc of SH_SCENARIOS) {
      expect(sc.openings.length, sc.id).toBeGreaterThan(0);
      for (const q of sc.keyQuestions) expect(findQuestion(sc.category, q), `${sc.id}: Frage ${q}`).toBeDefined();
      const escalations = [sc.escalation, ...(sc.variants ?? []).map((v) => v.escalation)];
      for (const e of escalations) for (const n of e?.needs ?? []) expect(CAPABILITIES[n.capability], `${sc.id}: ${n.capability}`).toBeDefined();
      const patients = [sc.patients, ...(sc.variants ?? []).map((v) => v.patients)];
      for (const p of patients) for (const d of p?.departments ?? []) expect(DEPARTMENTS.has(d), `${sc.id}: Abteilung ${d}`).toBe(true);
      expect(sc.workMin[0]).toBeLessThanOrEqual(sc.workMin[1]);
    }
  });
});
