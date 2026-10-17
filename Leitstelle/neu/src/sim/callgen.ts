import type { Call, GameState, KeywordCategory, LatLng, Weather } from '../model/types';
import { SCENARIOS, type FactSpec, type LocationKind, type ScenarioDef, type VariantDef } from '../data/scenarios';
import type { Facts, FactValue } from '../data/questions';
import { Rng } from './rng';
import { pointInPolygon, polygonBounds } from './geo';
import { hourOf } from './availability';
import { DIFFICULTY, isNight } from './difficulty';

/** Wählt ein Szenario unter Berücksichtigung von Kategoriegewichten, Tageszeit und Wetter */
export function pickScenario(state: GameState, rng: Rng): ScenarioDef | undefined {
  const s = state.center.settings;
  const now = state.runtime.clock.now;
  const night = isNight(hourOf(now));
  const weather = state.runtime.weather;
  const pool = SCENARIOS.filter((sc) => !s.disabledScenarioIds.includes(sc.id));
  return rng.weighted(pool, (sc) => scenarioWeight(sc, s.categoryWeights, night, weather, s.useTimeOfDay, s.useWeather));
}

export function scenarioWeight(
  sc: ScenarioDef,
  catWeights: Partial<Record<KeywordCategory, number>>,
  night: boolean,
  weather: Weather,
  useTime: boolean,
  useWeather: boolean,
): number {
  let w = sc.weight * (catWeights[sc.category] ?? 1);
  if (useTime) w *= (night ? sc.time?.night : sc.time?.day) ?? 1;
  if (useWeather) w *= sc.weather?.[weather] ?? 1;
  return w;
}

export function resolveFact(spec: FactSpec, rng: Rng): FactValue {
  if (typeof spec === 'object' && spec !== null) {
    if ('oneOf' in spec) return rng.pick(spec.oneOf);
    if ('range' in spec) return rng.int(spec.range[0], spec.range[1]);
  }
  return spec as FactValue;
}

export function pickVariant(sc: ScenarioDef, rng: Rng): { idx: number; variant: VariantDef | null } {
  if (!sc.variants || sc.variants.length === 0) return { idx: -1, variant: null };
  // Basisvariante hat Gewicht 1, sofern keine Variante ein eigenes Gewicht >1 hat
  const options: { idx: number; w: number }[] = [{ idx: -1, w: 1 }, ...sc.variants.map((v, i) => ({ idx: i, w: v.weight ?? 0.5 }))];
  const chosen = rng.weighted(options, (o) => o.w)!;
  return { idx: chosen.idx, variant: chosen.idx >= 0 ? sc.variants[chosen.idx] : null };
}

const DETAILS: Record<LocationKind, string[]> = {
  wohn: ['Mehrfamilienhaus, Eingang links', 'Einfamilienhaus mit Garten', 'Wohnblock, Klingel "Müller"', 'Reihenhaus am Ende der Straße', 'Hinterhaus, Zufahrt über den Hof'],
  strasse: ['Höhe Tankstelle', 'an der Ampelkreuzung', 'kurz nach dem Ortsausgang', 'vor der Bushaltestelle', 'in der Kurve am Wald'],
  land: ['Feldweg hinter dem Aussiedlerhof', 'am Waldrand', 'Zufahrt über den Wirtschaftsweg', 'neben der Bahnlinie'],
  gewerbe: ['Werkstor 2', 'Lagerhalle hinten links', 'Firmengelände, Pforte', 'Baustelle mit Kran'],
  wasser: ['am Ufer unterhalb der Brücke', 'Badestelle am Nordufer', 'am Wehr'],
  oeffentlich: ['vor dem Supermarkt', 'im Stadtpark', 'am Bahnhofsvorplatz', 'auf dem Marktplatz', 'vor der Gaststätte'],
  klinik: ['Station 4b', 'Pflegeheim Sonnenhof, Wohnbereich 2', 'Dialysezentrum', 'Notaufnahme'],
};

const CALLER_NAMES = ['Meier', 'Schulze', 'Öztürk', 'Lehmann', 'Krüger', 'Haas', 'Peters', 'Jung', 'Wolf', 'Nowak', 'Graf', 'Simon', 'Berg', 'Hahn'];
const RELATIONS: Record<KeywordCategory, string[]> = {
  brand: ['Nachbar/-in', 'Passant/-in', 'Bewohner/-in'],
  th: ['Bewohner/-in', 'Passant/-in', 'Hausmeister/-in'],
  vu: ['Unfallbeteiligte/-r', 'Zeuge/Zeugin', 'Ersthelfer/-in'],
  rd: ['Angehörige/-r', 'Betroffene/-r', 'Passant/-in', 'Kollege/Kollegin'],
  ktp: ['Pflegekraft', 'Station', 'Angehörige/-r'],
  abc: ['Betriebsangehörige/-r', 'Passant/-in', 'Fahrer/-in'],
  wasser: ['Spaziergänger/-in', 'Badegast', 'Angler/-in'],
  tier: ['Tierhalter/-in', 'Autofahrer/-in', 'Spaziergänger/-in'],
  pol: ['Zeuge/Zeugin', 'Wirt/-in', 'Anwohner/-in'],
  sonstiges: ['Anrufer/-in'],
};

export function randomLocation(state: GameState, rng: Rng, kind: LocationKind) {
  const c = state.center;
  if (kind === 'klinik' && c.hospitals.length > 0) {
    const h = rng.pick(c.hospitals);
    return { position: [...h.position] as LatLng, address: h.name, areaId: areaAt(state, h.position), detail: rng.pick(DETAILS.klinik) };
  }
  let position: LatLng = [...c.mapCenter] as LatLng;
  let areaId: string | null = null;
  if (c.areas.length > 0) {
    const area = rng.pick(c.areas);
    const b = polygonBounds(area.polygon);
    for (let i = 0; i < 50; i++) {
      const p: LatLng = [rng.range(b.minLat, b.maxLat), rng.range(b.minLng, b.maxLng)];
      if (pointInPolygon(p, area.polygon)) {
        position = p;
        break;
      }
    }
    areaId = area.id;
  } else {
    // Ohne definierte Gebiete: Umkreis ~6 km um den Kartenmittelpunkt
    position = [c.mapCenter[0] + rng.range(-0.05, 0.05), c.mapCenter[1] + rng.range(-0.08, 0.08)];
  }
  const areaName = c.areas.find((a) => a.id === areaId)?.name ?? c.city ?? '';
  const street = c.streetNames.length ? rng.pick(c.streetNames) : 'Hauptstraße';
  const address = `${street} ${rng.int(1, 120)}, ${areaName}`.trim();
  return { position, address, areaId, detail: rng.pick(DETAILS[kind]) };
}

export function areaAt(state: GameState, p: LatLng): string | null {
  return state.center.areas.find((a) => pointInPolygon(p, a.polygon))?.id ?? null;
}

/** Erzeugt einen neuen Notruf (ohne ihn in den Zustand einzufügen) */
export function generateCall(state: GameState, rng: Rng, id: string, at: number, scenario?: ScenarioDef): Call | null {
  const sc = scenario ?? pickScenario(state, rng);
  if (!sc) return null;
  const { idx, variant } = pickVariant(sc, rng);
  const factSpecs = { ...sc.facts, ...(variant?.facts ?? {}) };
  const facts: Facts = {};
  for (const [k, spec] of Object.entries(factSpecs)) facts[k] = resolveFact(spec, rng);
  const loc = randomLocation(state, rng, sc.location);
  const phone = `0${rng.int(1500, 1799)} ${rng.int(100000, 999999)}`;
  facts._address = loc.address;
  facts._detail = loc.detail;
  facts._phone = phone;
  const diff = DIFFICULTY[state.center.settings.difficulty];
  return {
    id,
    receivedAt: at,
    acceptedAt: null,
    closedAt: null,
    state: 'klingelt',
    caller: { name: `${rng.pick(CALLER_NAMES)}`, phone, relation: rng.pick(RELATIONS[sc.category]) },
    opening: rng.pick(variant?.openings ?? sc.openings),
    scenarioId: sc.id,
    variantIdx: idx,
    category: sc.category,
    location: loc,
    facts,
    dialog: [],
    notes: '',
    keywordId: null,
    incidentId: null,
    hangupAt: at + diff.hangupSeconds * 1000 * rng.range(0.7, 1.3),
    redialOf: null,
    duplicateOfIncidentId: null,
  };
}
