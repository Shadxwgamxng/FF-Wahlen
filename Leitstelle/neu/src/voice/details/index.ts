import type { KeywordCategory } from '../../model/types';
import type { FactValue, Facts } from '../../data/questions';
import type { LocationKind } from '../../data/scenarios';
import { findScenario } from '../../data/scenarios';
import { Rng } from '../../sim/rng';
import type { DetailContext, DetailTopic } from './types';
import { deriveBuilding, hashSeed } from './types';
import { BUILDING_TOPICS } from './building';
import { MEDICAL_TOPICS } from './medical';
import { TRAFFIC_TOPICS } from './traffic';
import { GENERAL_TOPICS } from './general';

export type { DetailTopic, DetailContext } from './types';

export const DETAIL_TOPICS: DetailTopic[] = [...BUILDING_TOPICS, ...MEDICAL_TOPICS, ...TRAFFIC_TOPICS, ...GENERAL_TOPICS];
const byId = new Map(DETAIL_TOPICS.map((t) => [t.id, t]));
export const findDetail = (id: string) => byId.get(id);

export interface SpanHit {
  id: string;
  at: number;
  end: number;
}

/** Detailthemen in einem normalisierten Text, mit Fundstelle (category null: alle Kategorien) */
export function matchDetails(text: string, category: KeywordCategory | null): SpanHit[] {
  const hits: SpanHit[] = [];
  for (const t of DETAIL_TOPICS) {
    if (category && t.categories?.length && !t.categories.includes(category)) continue;
    let best: SpanHit | null = null;
    for (const re of t.patterns) {
      const m = re.exec(text);
      if (m && (!best || m.index < best.at || (m.index === best.at && m.index + m[0].length > best.end))) best = { id: t.id, at: m.index, end: m.index + m[0].length };
    }
    if (best) hits.push(best);
  }
  return hits;
}

export interface DetailSource {
  scenarioId: string;
  category: KeywordCategory;
  facts: Facts;
  relation: string;
}

/**
 * Wert eines Detailthemas. Beim ersten Mal festgelegt und in facts (x_<id>) gespeichert –
 * dadurch bleibt der Anrufer im ganzen Gespräch bei derselben Angabe.
 */
export function resolveDetail(src: DetailSource, topicId: string, depth = 0): { value: FactValue | undefined; ctx: DetailContext; applies: boolean } {
  const topic = byId.get(topicId);
  if (!topic) throw new Error(`Unbekanntes Detailthema ${topicId}`);
  const sc = findScenario(src.scenarioId);
  const location: LocationKind = sc?.location ?? 'wohn';
  const base = `${src.scenarioId}|${String(src.facts._phone ?? '')}|${String(src.facts._address ?? '')}`;
  const ctx: DetailContext = {
    category: src.category,
    location,
    scenarioId: src.scenarioId,
    facts: src.facts,
    building: deriveBuilding(location, src.facts, new Rng(hashSeed(`${base}|gebaeude`))),
    rng: new Rng(hashSeed(`${base}|${topicId}`)),
    get: (other) => (depth > 4 || other === topicId ? undefined : resolveDetail(src, other, depth + 1).value),
    relation: src.relation,
  };
  const applies = topic.applies ? topic.applies(ctx) : true;
  if (!applies) return { value: undefined, ctx, applies };
  if (src.facts[topicId] === undefined) src.facts[topicId] = topic.generate(ctx);
  return { value: src.facts[topicId], ctx, applies };
}

/** Antwortsatz des Anrufers zu einem Detailthema */
export function answerDetail(src: DetailSource, topicId: string): string {
  const topic = byId.get(topicId)!;
  const { value, ctx, applies } = resolveDetail(src, topicId);
  if (!applies || value === undefined) return topic.unknown ? topic.unknown(ctx) : 'Das kann ich nicht sagen.';
  return topic.answer(value, ctx);
}
