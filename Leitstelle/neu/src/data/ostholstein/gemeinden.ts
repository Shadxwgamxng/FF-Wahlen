import type { LatLng, Station } from '../../model/types';
import { distanceMeters, pointInArea } from '../../sim/geo';
import gemeindenData from './gemeinden.json';

/**
 * Gemeinden des Kreises Ostholstein mit Ortskennziffer (OKZ) im Funkrufnamen.
 * Gemeindegrenzen aus OpenStreetMap, vereinfacht (gemeinden.json).
 */

export interface Gemeinde {
  name: string;
  /** Ortskennziffer im Funkrufnamen */
  okz: string;
  polygons: [number, number][][][];
}
export const GEMEINDEN = gemeindenData as Gemeinde[];

/** Gemeinde an einer Position; liegt sie knapp außerhalb aller (vereinfachten) Grenzen, die nächstgelegene */
export function gemeindeOf(p: LatLng): Gemeinde | undefined {
  const hit = GEMEINDEN.find((g) => pointInArea(p, g));
  if (hit) return hit;
  let best: Gemeinde | undefined;
  let bestD = 3000;
  for (const g of GEMEINDEN)
    for (const rings of g.polygons)
      for (const q of rings[0] ?? []) {
        const d = distanceMeters(p, q);
        if (d < bestD) [best, bestD] = [g, d];
      }
  return best;
}

/** Gemeinden mit dieser Ortskennziffer (mehrere bei Ämtern, z. B. 42, 47, 50) */
export const gemeindenByOkz = (okz: string) => GEMEINDEN.filter((g) => g.okz === okz);

/** Ortskennziffer einer Wache */
export function okzOf(st: Pick<Station, 'name' | 'position'>): string {
  if (/Kreisfeuerwehrverband|Feuerwehrtechnische Zentrale|\bFTZ\b/i.test(st.name)) return '01';
  const g = gemeindeOf(st.position);
  // Fehmarn: alle Wehren 30, nur Burg auf Fehmarn 33
  if (g?.name === 'Fehmarn' && /\bBurg\b/.test(st.name)) return '33';
  return g?.okz ?? '00';
}

/** Mittelpunkt (Schwerpunkt der Eckpunkte) der größten Teilfläche einer Gemeinde – Rückfallposition */
export function gemeindeCenter(g: Gemeinde): LatLng {
  const ring = [...g.polygons].map((p) => p[0] ?? []).sort((a, b) => b.length - a.length)[0] ?? [];
  if (!ring.length) return [54.2, 10.85];
  const lat = ring.reduce((s, p) => s + p[0], 0) / ring.length;
  const lng = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  return [Math.round(lat * 1e5) / 1e5, Math.round(lng * 1e5) / 1e5];
}
