/**
 * Kartenquelle: OpenStreetMap-Standardkacheln (© OpenStreetMap-Mitwirkende, ODbL).
 * Nutzungsbedingungen: https://operations.osmfoundation.org/policies/tiles/
 * – Quellenangabe ist Pflicht und wird in jeder Karte angezeigt.
 * – Für intensive Nutzung/Veröffentlichung sollte ein eigener oder kommerzieller Kachelserver
 *   eingetragen werden (hier zentral änderbar).
 * Ohne Internetverbindung bleibt das Spiel spielbar; die Karte zeigt dann nur Objekte ohne Hintergrund.
 */
export const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a>-Mitwirkende';

/**
 * Entfernt eine Leaflet-Karte sicher. Leaflet startet am Ende einer Zoom-Animation einen
 * Timer, der nach dem Entfernen der Karte auf nicht mehr vorhandene DOM-Elemente zugreift.
 */
export function safeRemoveMap(m: { remove: () => void; stop?: () => unknown }) {
  const anyMap = m as unknown as Record<string, unknown>;
  anyMap._onZoomTransitionEnd = () => {};
  anyMap._catchTransitionEnd = () => {};
  m.stop?.();
  m.remove();
}
