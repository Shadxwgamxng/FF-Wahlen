import { describe, expect, it } from 'vitest';
import type { KeywordCategory } from '../../model/types';
import type { Facts } from '../../data/questions';
import { SCENARIOS } from '../../data/scenarios';
import { resolveFact } from '../../sim/callgen';
import { Rng } from '../../sim/rng';
import { matchIntents } from '../intents';
import { answerDetail, DETAIL_TOPICS, resolveDetail } from './index';
import { storeyOf } from './types';

const ALL: KeywordCategory[] = ['brand', 'th', 'vu', 'rd', 'ktp', 'abc', 'wasser', 'tier', 'pol', 'sonstiges'];
const DETAILS_BY_LOCATION: Record<string, string[]> = {
  wohn: ['Mehrfamilienhaus, Eingang links', 'Einfamilienhaus mit Garten', 'Wohnblock, Klingel "Müller"', 'Reihenhaus am Ende der Straße', 'Hinterhaus, Zufahrt über den Hof'],
  strasse: ['Höhe Tankstelle', 'an der Ampelkreuzung', 'kurz nach dem Ortsausgang'],
  land: ['Feldweg hinter dem Aussiedlerhof', 'am Waldrand'],
  gewerbe: ['Werkstor 2', 'Lagerhalle hinten links'],
  wasser: ['am Ufer unterhalb der Brücke', 'Badestelle am Nordufer'],
  oeffentlich: ['vor dem Supermarkt', 'im Stadtpark'],
  klinik: ['Station 4b', 'Pflegeheim Sonnenhof, Wohnbereich 2'],
};

/** Fakten wie in einem echten Anruf (Szenario, Variante, Ort) */
function factsFor(scIdx: number, variant: number, seed: number): { facts: Facts; scenarioId: string; category: KeywordCategory } {
  const sc = SCENARIOS[scIdx];
  const v = variant >= 0 ? sc.variants?.[variant] : undefined;
  const rng = new Rng(seed * 7919 + scIdx);
  const facts: Facts = {};
  for (const [k, spec] of Object.entries({ ...sc.facts, ...(v?.facts ?? {}) })) facts[k] = resolveFact(spec, rng);
  facts._address = `Teststraße ${seed}, 23701 Eutin`;
  facts._detail = rng.pick(DETAILS_BY_LOCATION[sc.location]);
  facts._phone = `04521 ${100000 + seed}`;
  return { facts, scenarioId: sc.id, category: sc.category };
}

const catsOf = (t: (typeof DETAIL_TOPICS)[number]) => (t.categories?.length ? t.categories : ALL);

describe('Detailthemen', () => {
  it('haben eindeutige IDs mit x_ und mindestens drei Beispielfragen', () => {
    const ids = DETAIL_TOPICS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const t of DETAIL_TOPICS) {
      expect(t.id, t.id).toMatch(/^x_[a-z0-9_]+$/);
      expect(t.examples.length, t.id).toBeGreaterThanOrEqual(3);
    }
  });

  it('jede Beispielfrage wird genau als ihr Thema erkannt (ohne Nebentreffer)', () => {
    const errors: string[] = [];
    for (const t of DETAIL_TOPICS)
      for (const cat of catsOf(t))
        for (const ex of t.examples) {
          const q = matchIntents(ex, cat).questions;
          if (q.length !== 1 || q[0] !== t.id) errors.push(`${t.id} [${cat}] "${ex}" → ${JSON.stringify(q)}`);
        }
    expect(errors).toEqual([]);
  });

  it('liefert in allen Szenarien eine sinnvolle, gleichbleibende Antwort', () => {
    const errors: string[] = [];
    for (let i = 0; i < SCENARIOS.length; i++) {
      const sc = SCENARIOS[i];
      for (const variant of [-1, ...(sc.variants ?? []).map((_, k) => k)])
        for (const seed of [1, 2, 3]) {
          const { facts, scenarioId, category } = factsFor(i, variant, seed);
          for (const t of DETAIL_TOPICS) {
            if (t.categories?.length && !t.categories.includes(category)) continue;
            const src = { scenarioId, category, facts, relation: 'Nachbar/-in' };
            let a: string;
            try {
              a = answerDetail(src, t.id);
            } catch (e) {
              errors.push(`${t.id} in ${sc.id}[${variant}]: Ausnahme ${(e as Error).message}`);
              continue;
            }
            const again = answerDetail(src, t.id);
            if (a !== again) errors.push(`${t.id} in ${sc.id}: nicht gleichbleibend`);
            if (!a || a.length < 4 || /undefined|NaN|\[object|null/.test(a) || !/[.!?…]$/.test(a)) errors.push(`${t.id} in ${sc.id}[${variant}]: "${a}"`);
          }
        }
    }
    expect(errors.slice(0, 40)).toEqual([]);
  });

  it('ist unabhängig von der Fragereihenfolge', () => {
    const { facts, scenarioId, category } = factsFor(0, -1, 5);
    const a = { ...facts };
    const b = { ...facts };
    const ids = DETAIL_TOPICS.filter((t) => !t.categories?.length || t.categories.includes(category)).map((t) => t.id);
    for (const id of ids) resolveDetail({ scenarioId, category, facts: a, relation: 'Nachbar/-in' }, id);
    for (const id of [...ids].reverse()) resolveDetail({ scenarioId, category, facts: b, relation: 'Nachbar/-in' }, id);
    for (const id of ids) expect(a[id], id).toEqual(b[id]);
  });

  it('Etagen: das Haus hat mindestens so viele Geschosse, wie das Brandstockwerk verlangt', () => {
    for (let i = 0; i < SCENARIOS.length; i++)
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const { facts, scenarioId, category } = factsFor(i, -1, seed);
        const r = resolveDetail({ scenarioId, category, facts, relation: 'Nachbar/-in' }, 'x_etagen');
        const st = storeyOf(facts.floor);
        if (r.applies && st !== null && st !== 99) expect(Number(r.value), `${scenarioId} ${String(facts.floor)}`).toBeGreaterThanOrEqual(st + 1);
      }
  });
});
