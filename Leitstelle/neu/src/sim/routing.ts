import type { LatLng } from '../model/types';

/**
 * Routen-Zwischenspeicher der Simulation.
 *
 * Die Engine arbeitet synchron und deterministisch. Echte Straßenrouten liefert ein
 * OSRM-Server asynchron (siehe ui/routingService.ts). Ablauf:
 *  1. Die Engine fragt getRoute(); fehlt die Route, merkt sie sie per requestRoute() vor
 *     und fährt vorläufig mit der gekennzeichneten Luftlinien-Näherung.
 *  2. Der Routing-Dienst lädt vorgemerkte Routen und legt sie mit putRoute() ab.
 *  3. Der Befehl applyRoutes() (engine.ts) stellt laufende Fahrten auf die echte Route um.
 * Ohne Routing-Dienst (z. B. in Tests) bleibt alles bei der Näherung.
 */

export interface Route {
  path: LatLng[];
  /** Fahrzeit laut OSRM ohne Sonderrechte (Sekunden) */
  durationS: number;
  distanceM: number;
}

const cache = new Map<string, Route>();
const pending = new Set<string>();
const failed = new Set<string>();
const listeners = new Set<() => void>();

const r5 = (x: number) => x.toFixed(5);
export const routeKey = (from: LatLng, to: LatLng) => `${r5(from[0])},${r5(from[1])};${r5(to[0])},${r5(to[1])}`;
export const parseKey = (k: string): [LatLng, LatLng] => {
  const [a, b] = k.split(';').map((s) => s.split(',').map(Number) as LatLng);
  return [a, b];
};

export function getRoute(from: LatLng, to: LatLng): Route | undefined {
  return cache.get(routeKey(from, to));
}

export function requestRoute(from: LatLng, to: LatLng) {
  const k = routeKey(from, to);
  if (cache.has(k) || failed.has(k) || pending.has(k)) return;
  pending.add(k);
  listeners.forEach((l) => l());
}

export function takePending(max: number): string[] {
  const out = [...pending].slice(0, max);
  for (const k of out) pending.delete(k);
  return out;
}

export function putRoute(key: string, r: Route) {
  cache.set(key, r);
  if (cache.size > 5000) cache.delete(cache.keys().next().value!);
}

export function markFailed(key: string) {
  failed.add(key);
}

/** Nach Änderung der Server-Adresse: Fehlversuche vergessen */
export function resetFailures() {
  failed.clear();
}

export function onRouteRequest(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Nur für Tests */
export function clearRoutes() {
  cache.clear();
  pending.clear();
  failed.clear();
}

/** Fahrzeitfaktor mit Sonderrechten gegenüber normaler Fahrt (Erfahrungswert, Näherung) */
export const EMERGENCY_FACTOR = 0.75;

/** Kumulierte Streckenanteile 0..1 je Stützpunkt */
export function cumulative(path: LatLng[]): number[] {
  const d = [0];
  for (let i = 1; i < path.length; i++) {
    const dy = path[i][0] - path[i - 1][0];
    const dx = (path[i][1] - path[i - 1][1]) * Math.cos((path[i][0] * Math.PI) / 180);
    d.push(d[i - 1] + Math.hypot(dx, dy));
  }
  const total = d[d.length - 1] || 1;
  return d.map((x) => x / total);
}

export function pointAlong(path: LatLng[], cum: number[], t: number): LatLng {
  if (t <= 0) return path[0];
  if (t >= 1) return path[path.length - 1];
  let lo = 0;
  let hi = cum.length - 1;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] <= t) lo = mid;
    else hi = mid;
  }
  const f = (t - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return [path[lo][0] + (path[hi][0] - path[lo][0]) * f, path[lo][1] + (path[hi][1] - path[lo][1]) * f];
}
