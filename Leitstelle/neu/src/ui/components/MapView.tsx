import { useVehicleImages } from '../vehicleImages';
import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { GameState, LatLng } from '../../model/types';
import { statusDef } from '../../sim/engine';
import { safeRemoveMap, TILE_ATTRIBUTION, TILE_URL } from './mapConfig';
import { usePrefs } from '../prefs';

interface Props {
  game: GameState;
  selectedIncidentId: string | null;
  selectedVehicleId: string | null;
  onSelectIncident: (id: string) => void;
  onSelectVehicle: (id: string) => void;
  onMapClick?: (ll: LatLng) => void;
  pickHint?: string | null;
  focus?: { pos: LatLng; key: number } | null;
}

const PRIO_COLOR = { 1: '#f2555a', 2: '#f5a524', 3: '#3d8bfd' } as const;

const POI_COLOR = { pflege: '#e5484d', handel: '#f5a524', oeffentlich: '#3d8bfd', gewerbe: '#8e4ec6' } as const;

export function MapView(p: Props) {
  const vimg = useVehicleImages();
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layers = useRef<Record<string, L.LayerGroup>>({});
  const markers = useRef<Map<string, { m: L.Marker; sig: string }>>(new Map());
  const lines = useRef<Map<string, L.Polyline>>(new Map());
  const cbs = useRef(p);
  cbs.current = p;
  const [show, setShow] = useState({ areas: true, stations: true, hospitals: true, pois: false, vehicles: true, freeVehicles: false, routes: true });

  // Initialisierung
  useEffect(() => {
    if (!el.current || map.current) return;
    const c = p.game.center;
    const m = L.map(el.current, { zoomControl: true, preferCanvas: false }).setView(c.mapCenter, c.mapZoom);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 19 }).addTo(m);
    for (const k of ['areas', 'pois', 'stations', 'hospitals', 'routes', 'incidents', 'vehicles']) layers.current[k] = L.layerGroup().addTo(m);
    m.on('click', (e: L.LeafletMouseEvent) => cbs.current.onMapClick?.([e.latlng.lat, e.latlng.lng]));
    map.current = m;
    const ro = new ResizeObserver(() => m.invalidateSize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      safeRemoveMap(m);
      map.current = null;
      markers.current.clear();
      lines.current.clear();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Statische Ebenen (Gebiete, Wachen, Kliniken) – nur bei Konfigurationsänderung neu zeichnen
  const center = p.game.center;
  useEffect(() => {
    const L_ = layers.current;
    if (!map.current) return;
    L_.areas.clearLayers();
    if (show.areas)
      for (const a of center.areas) {
        L.polygon(a.polygons, { color: a.kind === 'landkreis' ? '#f5a524' : '#3d8bfd', weight: a.kind === 'landkreis' ? 2.5 : 1.5, fillOpacity: 0.03, dashArray: a.kind === 'landkreis' ? undefined : '4 4' })
          .bindTooltip(`${a.name} (${a.kind})`, { sticky: true })
          .addTo(L_.areas);
      }
    L_.stations.clearLayers();
    if (show.stations)
      for (const s of center.stations) {
        const org = center.organizations.find((o) => o.id === s.organizationId);
        const n = center.vehicles.filter((v) => v.stationId === s.id).length;
        L.marker(s.position, { icon: L.divIcon({ className: '', html: `<div class="st-marker" style="background:${org?.color ?? '#888'}"></div>`, iconSize: [14, 14] }) })
          .bindTooltip(`<b>${esc(s.name)}</b><br>${esc(org?.name ?? '')}<br>${n} Fahrzeuge`)
          .addTo(L_.stations);
      }
    L_.pois.clearLayers();
    if (show.pois)
      for (const poi of center.pois ?? []) {
        L.circleMarker(poi.position, { radius: 4, color: POI_COLOR[poi.group], weight: 1, fillOpacity: 0.7 })
          .bindTooltip(`<b>${esc(poi.name)}</b><br>${esc(poi.type)}${poi.address ? `<br>${esc(poi.address)}` : ''}`)
          .addTo(L_.pois);
      }
    L_.hospitals.clearLayers();
    if (show.hospitals) {
      for (const h of center.hospitals) {
        L.marker(h.position, { icon: L.divIcon({ className: '', html: `<div class="hosp-marker" style="${h.available ? '' : 'opacity:.4'}">H</div>`, iconSize: [16, 16] }) })
          .bindTooltip(`<b>${esc(h.name)}</b><br>Belegt ${h.occupied}/${h.capacity}${h.available ? '' : '<br>ABGEMELDET'}`)
          .addTo(L_.hospitals);
      }
      for (const n of center.neighbors) {
        L.circleMarker(n.position, { radius: 7, color: '#12a594', fillOpacity: 0.3 }).bindTooltip(`<b>${esc(n.name)}</b><br>Nachbarleitstelle`).addTo(L_.hospitals);
      }
    }
  }, [center.areas, center.stations, center.hospitals, center.neighbors, center.organizations, center.vehicles.length, center.pois, show.areas, show.stations, show.hospitals, show.pois]);

  // Dynamische Ebenen (Einsätze, Fahrzeuge, Routen)
  useEffect(() => {
    if (!map.current) return;
    const g = p.game;
    const seen = new Set<string>();
    const upsert = (key: string, pos: LatLng, html: string, size: [number, number], tooltip: string, onClick: () => void, layer: L.LayerGroup, z = 0) => {
      seen.add(key);
      const sig = html + tooltip;
      const ex = markers.current.get(key);
      if (ex) {
        ex.m.setLatLng(pos);
        if (ex.sig !== sig) {
          ex.m.setIcon(L.divIcon({ className: '', html, iconSize: size }));
          ex.m.setTooltipContent(tooltip);
          ex.sig = sig;
        }
        return;
      }
      const m = L.marker(pos, { icon: L.divIcon({ className: '', html, iconSize: size }), zIndexOffset: z }).bindTooltip(tooltip).on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        onClick();
      });
      m.addTo(layer);
      markers.current.set(key, { m, sig });
    };

    for (const inc of g.runtime.incidents) {
      const kw = g.center.keywords.find((k) => k.id === inc.keywordId);
      const sel = inc.id === p.selectedIncidentId;
      const color = PRIO_COLOR[inc.priority];
      upsert(
        `i:${inc.id}`,
        inc.position,
        `<div class="inc-marker ${inc.state === 'neu' ? 'pulse' : ''}" style="background:${color};color:${color};${sel ? 'outline:3px solid #fff;outline-offset:2px' : ''}"></div>`,
        [22, 22],
        `<b>${esc(kw?.code ?? '')}</b> ${esc(kw?.label ?? '')}<br>${esc(inc.address)}`,
        () => cbs.current.onSelectIncident(inc.id),
        layers.current.incidents,
        1000,
      );
    }
    if (show.vehicles) {
      for (const v of g.center.vehicles) {
        const free = v.rt.status === 'frei_wache' || v.rt.status === 'ausser_dienst';
        if (free && !show.freeVehicles && v.id !== p.selectedVehicleId) continue;
        const d = statusDef(g, v.rt.status);
        const type = g.center.vehicleTypes.find((t) => t.id === v.typeId);
        const short = v.callsign.split(' ').slice(-1)[0];
        const sel = v.id === p.selectedVehicleId;
        const img = vimg.urls[v.id];
        const base = img?.normal ?? img?.blaulicht;
        // mit Sondersignal unterwegs: Bild ohne/mit Blaulicht wechseln (Blinken)
        const blink = !!(img?.normal && img?.blaulicht && v.rt.move?.emergency && v.rt.move.purpose !== 'rueckfahrt');
        upsert(
          `v:${v.id}`,
          v.rt.position,
          base
            ? `<div class="veh-img ${blink ? 'blink' : ''} ${sel ? 'sel' : ''}"><img src="${base}" alt="">${blink ? `<img class="bl" src="${img!.blaulicht}" alt="">` : ''}<span class="veh-tag" style="background:${d.color}">${esc(d.code)} ${esc(short)}</span></div>`
            : `<div class="veh-marker" style="background:${d.color};${sel ? 'outline:2px solid #fff' : ''}">${esc(d.code)} ${esc(type?.code ?? '')} ${esc(short)}</div>`,
          [0, 0],
          `<b>${esc(v.callsign)}</b><br>${esc(d.code)} – ${esc(d.label)}`,
          () => cbs.current.onSelectVehicle(v.id),
          layers.current.vehicles,
          sel ? 2000 : 500,
        );
      }
    }
    for (const [k, m] of markers.current) {
      if (!seen.has(k)) {
        m.m.remove();
        markers.current.delete(k);
      }
    }
    // Routen (Luftlinien-Näherung)
    const seenLines = new Set<string>();
    if (show.routes)
      for (const v of g.center.vehicles) {
        if (!v.rt.move) continue;
        seenLines.add(v.id);
        const color = v.rt.move.purpose === 'rueckfahrt' ? '#30a46c' : v.rt.move.purpose === 'transport' ? '#8e4ec6' : '#f76b15';
        const m = v.rt.move;
        let pts: LatLng[] = [v.rt.position, m.to];
        if (m.path && m.cum) {
          // verbleibender Teil der Straßenroute
          const t = m.arriveAt > m.departAt ? (g.runtime.clock.now - m.departAt) / (m.arriveAt - m.departAt) : 1;
          const i = m.cum.findIndex((c) => c > t);
          pts = i < 0 ? [v.rt.position, m.to] : [v.rt.position, ...m.path.slice(i)];
        }
        const ex = lines.current.get(v.id);
        if (ex) {
          ex.setLatLngs(pts);
          ex.setStyle({ color });
          ex.setStyle({ dashArray: m.routed ? '' : '6 6', weight: m.routed ? 3 : 2 });
        } else lines.current.set(v.id, L.polyline(pts, { color, weight: m.routed ? 3 : 2, dashArray: m.routed ? undefined : '6 6', opacity: 0.85 }).addTo(layers.current.routes));
      }
    for (const [k, l] of lines.current) {
      if (!seenLines.has(k)) {
        l.remove();
        lines.current.delete(k);
      }
    }
  });

  useEffect(() => {
    if (p.focus && map.current) map.current.setView(p.focus.pos, Math.max(map.current.getZoom(), 13), { animate: false });
  }, [p.focus]);

  const prefs = usePrefs();
  const toggle = (k: keyof typeof show) => setShow((s) => ({ ...s, [k]: !s[k] }));
  return (
    <>
      <div ref={el} className={`map ${prefs.mapDark && prefs.uiStyle === 'modern' ? 'map-dark' : ''}`} style={{ cursor: p.onMapClick ? 'crosshair' : undefined }} data-testid="map" />
      <div className="map-tools">
        {(
          [
            ['areas', 'Gebiete'],
            ['stations', 'Wachen'],
            ['hospitals', 'Kliniken'],
            ['pois', 'POIs'],
            ['vehicles', 'Fahrzeuge'],
            ['freeVehicles', 'auch freie'],
            ['routes', 'Routen'],
          ] as [keyof typeof show, string][]
        ).map(([k, l]) => (
          <button key={k} className={`btn small ${show[k] ? 'active' : ''}`} onClick={() => toggle(k)} aria-pressed={show[k]}>
            {l}
          </button>
        ))}
        {p.pickHint && <span className="chip warn">{p.pickHint}</span>}
      </div>
      <div className="map-legend">
        <div><b>Routen:</b> durchgezogen = Straßenroute (OSRM), gestrichelt gerade = Näherung (Luftlinie). Keine Verkehrsdaten.</div>
      </div>
    </>
  );
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
