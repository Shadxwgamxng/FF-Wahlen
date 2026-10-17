import { useEffect, useRef } from 'react';
import L from 'leaflet';
import type { LatLng } from '../../model/types';
import { store } from '../../store/gameStore';
import { safeRemoveMap, TILE_ATTRIBUTION, TILE_URL } from './mapConfig';

/** Koordinateneingabe mit Mini-Karte: Klick auf die Karte setzt die Position */
export function LatLngPicker({ value, onChange, center, invalid }: { value: LatLng | null; onChange: (v: LatLng) => void; center?: LatLng; invalid?: boolean }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const marker = useRef<L.CircleMarker | null>(null);
  const cb = useRef(onChange);
  cb.current = onChange;

  useEffect(() => {
    if (!el.current || map.current) return;
    const c = value ?? center ?? store.state?.center.mapCenter ?? [51.16, 10.45];
    const m = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(c, value ? 13 : 11);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => cb.current([round(e.latlng.lat), round(e.latlng.lng)]));
    map.current = m;
    setTimeout(() => map.current === m && m.invalidateSize(), 50);
    return () => {
      safeRemoveMap(m);
      map.current = null;
      marker.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!map.current) return;
    if (value && Number.isFinite(value[0]) && Number.isFinite(value[1])) {
      if (!marker.current) marker.current = L.circleMarker(value, { radius: 8, color: '#fff', fillColor: '#3d8bfd', fillOpacity: 1 }).addTo(map.current);
      else marker.current.setLatLng(value);
    }
  }, [value]);

  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="row">
        <input type="number" step="0.0001" aria-label="Breitengrad" className={invalid ? 'invalid' : ''} value={value?.[0] ?? ''} onChange={(e) => onChange([Number(e.target.value), value?.[1] ?? 0])} style={{ width: 140 }} />
        <input type="number" step="0.0001" aria-label="Längengrad" className={invalid ? 'invalid' : ''} value={value?.[1] ?? ''} onChange={(e) => onChange([value?.[0] ?? 0, Number(e.target.value)])} style={{ width: 140 }} />
        <span className="dim small">Breite / Länge (WGS84) – oder in die Karte klicken</span>
      </div>
      <div ref={el} className="map-dark" style={{ height: 220, borderRadius: 6, border: '1px solid var(--line)' }} />
    </div>
  );
}

const round = (x: number) => Math.round(x * 100000) / 100000;
