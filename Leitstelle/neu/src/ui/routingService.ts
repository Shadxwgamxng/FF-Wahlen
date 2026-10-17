import { useSyncExternalStore } from 'react';
import { markFailed, onRouteRequest, parseKey, putRoute, resetFailures, takePending } from '../sim/routing';
import { applyRoutes } from '../sim/engine';
import { store } from '../store/gameStore';
import { getPrefs } from './prefs';
import type { LatLng } from '../model/types';

/**
 * Lädt Straßenrouten von einem OSRM-Server (Standard: lokal unter http://localhost:5000,
 * Einrichtung siehe docs/ROUTING.md). Nutzt nur die dokumentierte OSRM-HTTP-API:
 *   GET /route/v1/driving/{lng},{lat};{lng},{lat}?overview=full&geometries=geojson
 */

export type RoutingState = 'aus' | 'unbekannt' | 'ok' | 'fehler';
let state: RoutingState = 'unbekannt';
let lastError = '';
const listeners = new Set<() => void>();
const setState = (s: RoutingState, err = '') => {
  if (s === state && err === lastError) return;
  state = s;
  lastError = err;
  listeners.forEach((l) => l());
};

export function useRoutingState(): { state: RoutingState; error: string } {
  const s = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => state,
  );
  return { state: s, error: lastError };
}

export async function fetchOsrmRoute(base: string, from: LatLng, to: LatLng, fetchFn: typeof fetch = fetch) {
  const url = `${base.replace(/\/$/, '')}/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}?overview=full&geometries=geojson`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const j = await res.json();
  if (j.code !== 'Ok' || !j.routes?.length) throw new Error(j.message ?? j.code ?? 'keine Route');
  const r = j.routes[0];
  const path = (r.geometry.coordinates as [number, number][]).map(([lng, lat]) => [lat, lng] as LatLng);
  // Start/Ziel exakt anhängen (OSRM schnappt auf die nächste Straße)
  return { path: [from, ...path, to], durationS: r.duration as number, distanceM: r.distance as number };
}

let running = false;
async function pump() {
  if (running) return;
  const p = getPrefs();
  if (!p.routingEnabled) {
    takePending(10_000);
    setState('aus');
    return;
  }
  running = true;
  try {
    let any = false;
    for (let batch = takePending(6); batch.length; batch = takePending(6)) {
      const results = await Promise.all(
        batch.map(async (k) => {
          const [a, b] = parseKey(k);
          try {
            putRoute(k, await fetchOsrmRoute(p.routingUrl, a, b));
            return true;
          } catch (e) {
            markFailed(k);
            setState('fehler', (e as Error).message);
            return false;
          }
        }),
      );
      if (results.some(Boolean)) {
        any = true;
        setState('ok');
      }
    }
    if (any && store.state) store.run((s) => applyRoutes(s), { toast: false });
  } finally {
    running = false;
  }
}

export function installRouting() {
  const off = onRouteRequest(() => void pump());
  const t = setInterval(() => void pump(), 1000);
  return () => {
    off();
    clearInterval(t);
  };
}

/** Verbindung zum OSRM-Server prüfen (Einstellungen) */
export async function testRouting(url: string): Promise<string> {
  resetFailures();
  try {
    const r = await fetchOsrmRoute(url, [54.137, 10.617], [54.093, 10.81]);
    setState('ok');
    return `OK – Testroute Eutin → Neustadt: ${(r.distanceM / 1000).toFixed(1)} km, ${Math.round(r.durationS / 60)} min.`;
  } catch (e) {
    setState('fehler', (e as Error).message);
    return `Fehler: ${(e as Error).message}. Läuft der OSRM-Server? (siehe docs/ROUTING.md)`;
  }
}
