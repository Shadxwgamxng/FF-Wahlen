import type { Area, LatLng, Movement } from '../model/types';

/**
 * Geografie und Fahrzeit-Näherung.
 *
 * WICHTIG: LEITWARTE nutzt in Version 1 KEINEN Routingdienst und KEINE Verkehrsdaten.
 * Fahrzeiten werden als Luftlinie × Umwegfaktor ÷ Durchschnittsgeschwindigkeit geschätzt.
 * Fahrzeuge bewegen sich auf der Karte entlang der Luftlinie. Dies ist in der Oberfläche
 * als "Näherung" gekennzeichnet.
 */

const R = 6371000;
const toRad = (d: number) => (d * Math.PI) / 180;

export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b[0] - a[0]);
  const dLng = toRad(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export interface TravelParams {
  speedKmh: number;
  detourFactor: number;
  airborne?: boolean;
  emergency: boolean;
}

/** Geschätzte Fahrzeit in Millisekunden */
export function travelTimeMs(from: LatLng, to: LatLng, p: TravelParams): number {
  const dist = distanceMeters(from, to) * (p.airborne ? 1 : p.detourFactor);
  // ohne Sonderrechte ~25 % langsamer
  const speed = (p.speedKmh * (p.emergency ? 1 : 0.75) * 1000) / 3600; // m/s
  const base = dist / Math.max(speed, 1);
  // Luftfahrzeuge: Start/Landung pauschal 3 Minuten
  return Math.round((base + (p.airborne ? 180 : 0)) * 1000);
}

export function interpolate(m: Movement, now: number): LatLng {
  if (now <= m.departAt) return m.from;
  if (now >= m.arriveAt) return m.to;
  const t = (now - m.departAt) / (m.arriveAt - m.departAt);
  return [m.from[0] + (m.to[0] - m.from[0]) * t, m.from[1] + (m.to[1] - m.from[1]) * t];
}

export function pointInPolygon(p: LatLng, poly: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [yi, xi] = poly[i];
    const [yj, xj] = poly[j];
    const intersect = yi > p[0] !== yj > p[0] && p[1] < ((xj - xi) * (p[0] - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

export function polygonBounds(poly: LatLng[]): { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  return {
    minLat: Math.min(...poly.map((p) => p[0])),
    maxLat: Math.max(...poly.map((p) => p[0])),
    minLng: Math.min(...poly.map((p) => p[1])),
    maxLng: Math.max(...poly.map((p) => p[1])),
  };
}

export function formatDuration(ms: number): string {
  if (!Number.isFinite(ms)) return '–';
  const s = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  if (h > 0) return `${h}:${String(m % 60).padStart(2, '0')} h`;
  return `${m}:${String(s % 60).padStart(2, '0')} min`;
}

export function formatKm(m: number): string {
  return `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

// ---------------------------------------------------------------------------
// Gebiete (Multipolygone mit Löchern)
// ---------------------------------------------------------------------------


export function pointInArea(p: LatLng, area: Pick<Area, 'polygons'>): boolean {
  return area.polygons.some((rings) => rings.length > 0 && pointInPolygon(p, rings[0]) && !rings.slice(1).some((hole) => pointInPolygon(p, hole)));
}

export function areaBounds(area: Pick<Area, 'polygons'>) {
  const pts = area.polygons.flatMap((r) => r[0] ?? []);
  return pts.length ? polygonBounds(pts) : null;
}

/** Douglas-Peucker-Vereinfachung eines Rings (Toleranz in Grad) */
export function simplifyRing(ring: LatLng[], tol: number): LatLng[] {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = keep[ring.length - 1] = 1;
  const stack: [number, number][] = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let maxD = 0;
    let idx = -1;
    const [ay, ax] = ring[a];
    const [by, bx] = ring[b];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1e-12;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dy * ring[i][1] - dx * ring[i][0] + bx * ay - by * ax) / len;
      if (d > maxD) {
        maxD = d;
        idx = i;
      }
    }
    if (maxD > tol && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out = ring.filter((_, i) => keep[i]);
  return out.length >= 4 ? out : ring;
}
