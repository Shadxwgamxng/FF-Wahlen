import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { Organization, PlaceIndex } from '../../model/types';
import { extractFacilities, fetchCountyAt, overpassQueries, runOverpass, type County, type Facility } from '../../geo/osm';
import { buildPlaceIndex, type OverpassElement } from '../../geo/places';
import { extractPois, poiQuery, POI_GROUP_LABEL } from '../../geo/pois';
import type { Poi, PoiGroup } from '../../model/types';
import { buildCenter, defaultOrganizations, validateWizard } from '../../data/centerFactory';
import { CATALOGS } from '../../data/catalogs';
import { pointInArea } from '../../sim/geo';
import { store } from '../../store/gameStore';
import { safeRemoveMap, TILE_ATTRIBUTION, TILE_URL } from '../components/mapConfig';
import { RadioGroupFields } from './EditorView';

type Step = 'grund' | 'kreise' | 'orgs' | 'daten' | 'fertig';
const STEPS: [Step, string][] = [
  ['grund', '1. Grunddaten'],
  ['kreise', '2. Landkreise'],
  ['orgs', '3. Organisationen'],
  ['daten', '4. Kartendaten'],
  ['fertig', '5. Erstellen'],
];

const FAC_LABEL: Record<Facility['kind'], string> = { feuerwehr: 'Feuerwehr', rettungswache: 'Rettungswachen', polizei: 'Polizei', krankenhaus: 'Krankenhäuser' };

export function CreateWizard({ onCancel }: { onCancel: () => void }) {
  const [step, setStep] = useState<Step>('grund');
  const [name, setName] = useState('');
  const [operator, setOperator] = useState('');
  const [catalogId, setCatalogId] = useState('sh');
  const [counties, setCounties] = useState<County[]>([]);
  const [orgs, setOrgs] = useState<Organization[]>(defaultOrganizations());
  const [orgOn, setOrgOn] = useState<Record<string, boolean>>(Object.fromEntries(defaultOrganizations().map((o) => [o.id, true])));
  const [places, setPlaces] = useState<PlaceIndex | null>(null);
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [facOn, setFacOn] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [skipData, setSkipData] = useState(false);
  // Übernahme aus OpenStreetMap (ohne Fahrzeuge)
  const [takeStations, setTakeStations] = useState(true);
  const [takeHospitals, setTakeHospitals] = useState(true);
  const [pois, setPois] = useState<Poi[]>([]);
  const [poiGroups, setPoiGroups] = useState<Record<PoiGroup, boolean>>({ pflege: true, handel: true, oeffentlich: true, gewerbe: true });

  const activeOrgs = orgs.filter((o) => orgOn[o.id]);
  const input = {
    catalogId,
    name,
    operator,
    counties,
    organizations: activeOrgs,
    places,
    facilities: facilities.filter((f) => facOn[f.osmId] && (f.kind === 'krankenhaus' ? takeHospitals : takeStations)),
    pois: pois.filter((p) => poiGroups[p.group]),
  };
  const errors = validateWizard(input);

  const loadData = async () => {
    setError(null);
    const all: OverpassElement[] = [];
    try {
      const qs = [...overpassQueries(counties.map((c) => c.osmRelationId)), poiQuery(counties.map((c) => c.osmRelationId))];
      for (let i = 0; i < qs.length; i++) {
        const label = `Lade ${qs[i].label} (${i + 1}/${qs.length})`;
        setLoading(`${label} …`);
        all.push(...(await runOverpass(qs[i].query, { onStatus: (t) => setLoading(`${label}: ${t}`) })));
      }
      setLoading('Werte Daten aus …');
      await new Promise((r) => setTimeout(r, 20));
      const ix = buildPlaceIndex(all, { areas: counties, maxPerKind: { w: 30000, g: 6000, o: 4000, k: 1500, s: 8000, b: 2000, l: 4000, x: 2500 } });
      const fac = extractFacilities(all).filter((f) => counties.some((c) => pointInArea(f.position, c)));
      setPlaces(ix);
      setPois(extractPois(all, undefined, (p) => counties.some((c) => pointInArea(p, c))));
      setFacilities(fac);
      setFacOn(Object.fromEntries(fac.map((f) => [f.osmId, true])));
    } catch (e) {
      setError(`Laden fehlgeschlagen: ${(e as Error).message}`);
    } finally {
      setLoading(null);
    }
  };

  const create = async () => {
    if (errors.length) return;
    await store.newProject(buildCenter(input));
    // danach: Fahrzeuge an den Wachen anlegen
    store.setMode('bearbeiten');
  };

  const canNext: Record<Step, boolean> = {
    grund: name.trim().length > 0,
    kreise: counties.length > 0,
    orgs: activeOrgs.length > 0 && activeOrgs.every((o) => o.radioGroup.name.trim() && o.radioGroup.code.trim()),
    daten: Boolean(places) || skipData,
    fertig: errors.length === 0,
  };
  const idx = STEPS.findIndex((s) => s[0] === step);

  return (
    <div className="start" style={{ maxWidth: 1200 }} data-testid="create-wizard">
      <div className="row">
        <h2 className="grow">Neue Leitstelle erstellen</h2>
        <button className="btn" onClick={onCancel}>Abbrechen</button>
      </div>
      <div className="tabs">
        {STEPS.map(([k, l], i) => (
          <button key={k} className={k === step ? 'active' : ''} disabled={i > idx && !STEPS.slice(0, i).every(([s]) => canNext[s])} onClick={() => setStep(k)}>
            {l}
          </button>
        ))}
      </div>

      {step === 'grund' && (
        <div className="card col" style={{ maxWidth: 640 }}>
          <label className="field">
            <span className="req">Name der Leitstelle</span>
            <input type="text" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. IRLS Süd" />
          </label>
          <label className="field">
            <span>Betreiber / Träger</span>
            <input type="text" value={operator} onChange={(e) => setOperator(e.target.value)} placeholder="z. B. Kreis Ostholstein" />
          </label>
          <div className="field">
            <span>Stichwörter (Katalog)</span>
            {CATALOGS.map((c) => (
              <label key={c.id} className="check" style={{ alignItems: 'flex-start' }}>
                <input type="radio" name="catalog" checked={catalogId === c.id} onChange={() => setCatalogId(c.id)} data-testid={`catalog-${c.id}`} />
                <span>
                  <b>{c.label}</b> <span className="dim small">({c.keywords.length} Stichwörter{c.meldebilder.length ? `, ${c.meldebilder.length} Meldebilder` : ''})</span>
                  <br />
                  <span className="small muted">{c.description}</span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {step === 'kreise' && <CountyPicker counties={counties} onChange={setCounties} />}

      {step === 'orgs' && (
        <div className="card col">
          <table className="grid">
            <thead>
              <tr><th>Aktiv</th><th>Organisation</th><th>Funkrufgruppe</th></tr>
            </thead>
            <tbody>
              {orgs.map((o, i) => (
                <tr key={o.id} className={orgOn[o.id] ? '' : 'unavailable'}>
                  <td><input type="checkbox" checked={Boolean(orgOn[o.id])} onChange={(e) => setOrgOn({ ...orgOn, [o.id]: e.target.checked })} aria-label={`${o.name} aktiv`} /></td>
                  <td>
                    <input type="text" value={o.name} onChange={(e) => setOrgs(orgs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} aria-label="Name der Organisation" />
                  </td>
                  <td>{orgOn[o.id] && <RadioGroupFields value={o.radioGroup} onChange={(radioGroup) => setOrgs(orgs.map((x, j) => (j === i ? { ...x, radioGroup } : x)))} invalid />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {step === 'daten' && (
        <div className="card col">
          <div className="dim small">Kartendaten © OpenStreetMap-Mitwirkende (ODbL)</div>
          <div className="row wrap">
            <button className="btn primary" disabled={Boolean(loading)} onClick={loadData}>{places ? 'Erneut laden' : 'Kartendaten laden'}</button>
            <label className="check small">
              <input type="checkbox" checked={skipData} onChange={(e) => setSkipData(e.target.checked)} /> ohne Kartendaten
            </label>
          </div>
          {loading && <div className="infobox">{loading}</div>}
          {error && <div className="errbox">{error}</div>}
          {places && (
            <div className="hint small">
              {places.places.length.toLocaleString('de-DE')} Einsatzorte geladen ({countKinds(places)}).
            </div>
          )}
          {places && (
            <div className="col" data-testid="takeover">
              <h4>Übernahme</h4>
              <label className="check">
                <input type="checkbox" checked={takeStations} onChange={(e) => setTakeStations(e.target.checked)} data-testid="take-stations" /> Wachen ({facilities.filter((f) => f.kind !== 'krankenhaus').length})
              </label>
              <label className="check">
                <input type="checkbox" checked={takeHospitals} onChange={(e) => setTakeHospitals(e.target.checked)} data-testid="take-hospitals" /> Krankenhäuser ({facilities.filter((f) => f.kind === 'krankenhaus').length})
              </label>
              <div className="row wrap">
                <b className="small">POIs:</b>
                {(Object.keys(POI_GROUP_LABEL) as PoiGroup[]).map((g) => (
                  <label key={g} className="check small">
                    <input type="checkbox" checked={poiGroups[g]} onChange={(e) => setPoiGroups({ ...poiGroups, [g]: e.target.checked })} /> {POI_GROUP_LABEL[g]} ({pois.filter((p) => p.group === g).length})
                  </label>
                ))}
              </div>
            </div>
          )}
          {facilities.length > 0 && (
            <div className="col">
              <h4>Standorte</h4>
              {(['feuerwehr', 'rettungswache', 'polizei', 'krankenhaus'] as Facility['kind'][]).map((k) => {
                const list = facilities.filter((f) => f.kind === k);
                if (!list.length) return null;
                const allOn = list.every((f) => facOn[f.osmId]);
                return (
                  <details key={k} open={k !== 'polizei'}>
                    <summary>
                      {FAC_LABEL[k]} ({list.filter((f) => facOn[f.osmId]).length}/{list.length}){' '}
                      <button className="btn small" onClick={(e) => (e.preventDefault(), setFacOn({ ...facOn, ...Object.fromEntries(list.map((f) => [f.osmId, !allOn])) }))}>
                        {allOn ? 'keine' : 'alle'}
                      </button>
                    </summary>
                    <div className="row wrap" style={{ maxHeight: 220, overflow: 'auto', padding: 6 }}>
                      {list.map((f) => (
                        <label key={f.osmId} className="check small" style={{ minWidth: 300 }}>
                          <input type="checkbox" checked={Boolean(facOn[f.osmId])} onChange={(e) => setFacOn({ ...facOn, [f.osmId]: e.target.checked })} />
                          {f.name} <span className="dim">{f.address}</span>
                        </label>
                      ))}
                    </div>
                  </details>
                );
              })}
            </div>
          )}
        </div>
      )}

      {step === 'fertig' && (
        <div className="card col" style={{ maxWidth: 760 }}>
          <div><b>{name}</b> {operator && <span className="muted">({operator})</span>}</div>
          <div>Katalog: {CATALOGS.find((c) => c.id === catalogId)?.label}</div>
          <div>Landkreise: {counties.map((c) => c.name).join(', ')}</div>
          <div>Organisationen: {activeOrgs.map((o) => `${o.name} [${o.radioGroup.code}]`).join(', ')}</div>
          <div>Einsatzorte: {places ? places.places.length.toLocaleString('de-DE') : 'keine'}</div>
          <div>Standorte: {input.facilities.filter((f) => f.kind !== 'krankenhaus').length} Wachen, {input.facilities.filter((f) => f.kind === 'krankenhaus').length} Kliniken, {input.pois.length} POIs</div>
          {errors.length > 0 && (
            <div className="errbox">
              {errors.map((e) => (
                <div key={e}>{e}</div>
              ))}
            </div>
          )}
          <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={errors.length > 0} onClick={create} data-testid="wizard-create">Leitstelle erstellen</button>
        </div>
      )}

      <div className="row">
        <button className="btn" disabled={idx === 0} onClick={() => setStep(STEPS[idx - 1][0])}>Zurück</button>
        <span className="spacer" />
        {idx < STEPS.length - 1 && (
          <button className="btn primary" disabled={!canNext[step]} onClick={() => setStep(STEPS[idx + 1][0])} data-testid="wizard-next">Weiter</button>
        )}
      </div>
    </div>
  );
}

const KIND_SHORT: Record<string, string> = { w: 'Wohnhäuser', g: 'Gewerbe', o: 'öffentlich', k: 'Gesundheit', s: 'Straßen', b: 'Schnellstraßen', l: 'Wald/Feld', x: 'Gewässer' };
function countKinds(ix: PlaceIndex) {
  const m = new Map<string, number>();
  for (const p of ix.places) m.set(p[0], (m.get(p[0]) ?? 0) + 1);
  return [...m.entries()].map(([k, n]) => `${KIND_SHORT[k]} ${n.toLocaleString('de-DE')}`).join(', ');
}

/** Karte: Klick in einen Landkreis lädt dessen echte Grenze aus OpenStreetMap */
function CountyPicker({ counties, onChange }: { counties: County[]; onChange: (c: County[]) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const ref = useRef({ counties, onChange, busy });
  ref.current = { counties, onChange, busy };
  const lastReq = useRef(0);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current).setView([54.2, 10.2], 8);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION, maxZoom: 18 }).addTo(m);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', async (e: L.LeafletMouseEvent) => {
      if (ref.current.busy) return;
      // Nominatim: höchstens 1 Anfrage pro Sekunde
      const wait = 1100 - (Date.now() - lastReq.current);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      lastReq.current = Date.now();
      setBusy(true);
      setMsg('Suche Landkreis …');
      try {
        const c = await fetchCountyAt([e.latlng.lat, e.latlng.lng]);
        if (ref.current.counties.some((x) => x.osmRelationId === c.osmRelationId)) setMsg(`${c.name} bereits gewählt.`);
        else {
          ref.current.onChange([...ref.current.counties, c]);
          setMsg(`${c.name} hinzugefügt.`);
        }
      } catch (err) {
        setMsg((err as Error).message);
      } finally {
        setBusy(false);
      }
    });
    map.current = m;
    setTimeout(() => map.current === m && m.invalidateSize(), 50);
    return () => {
      safeRemoveMap(m);
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const lg = layer.current;
    if (!lg || !map.current) return;
    lg.clearLayers();
    for (const c of counties) {
      L.polygon(c.polygons, { color: '#f5a524', weight: 2.5, fillOpacity: 0.12 }).bindTooltip(c.name, { sticky: true }).addTo(lg);
    }
    if (counties.length) map.current.fitBounds(L.featureGroup(lg.getLayers() as L.Polygon[]).getBounds(), { padding: [20, 20], maxZoom: 10 });
  }, [counties]);

  return (
    <div className="card col">
      <div className="row wrap">
        {counties.map((c) => (
          <span key={c.osmRelationId} className="chip">
            {c.name} <span className="dim">({c.state})</span>
            <button className="btn ghost small" aria-label={`${c.name} entfernen`} onClick={() => onChange(counties.filter((x) => x.osmRelationId !== c.osmRelationId))}>✕</button>
          </span>
        ))}
        {counties.length === 0 && <span className="dim small">Kein Kreis gewählt</span>}
        {busy && <span className="chip warn">lädt …</span>}
        {msg && !busy && <span className="small">{msg}</span>}
      </div>
      <div ref={el} className="map-dark" style={{ height: 520, borderRadius: 6, border: '1px solid var(--line)', cursor: 'crosshair' }} data-testid="county-map" />
      <div className="dim small">Kartendaten © OpenStreetMap-Mitwirkende (ODbL)</div>
    </div>
  );
}
