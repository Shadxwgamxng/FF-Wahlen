import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import type { Area, CenterConfig, GameState, LatLng, OrgKind, Organization, RadioGroup, StatusDef, VehicleType } from '../../model/types';
import { EntityEditor } from '../components/EntityEditor';
import { confirmDialog, Tabs } from '../components/common';
import { LatLngPicker } from '../components/LatLngPicker';
import { safeRemoveMap, TILE_ATTRIBUTION, TILE_URL } from '../components/mapConfig';
import { store } from '../../store/gameStore';
import { newId } from '../../model/ids';
import { CAPABILITIES } from '../../data/vehicleTypes';
import {
  deleteArea,
  deleteOrganization,
  deleteVehicleType,
  saveArea,
  saveOrganization,
  saveStatusDef,
  saveVehicleType,
} from '../../sim/editorOps';

export const ORG_KINDS: [OrgKind, string][] = [
  ['feuerwehr', 'Feuerwehr'],
  ['berufsfeuerwehr', 'Berufsfeuerwehr'],
  ['freiwillige_feuerwehr', 'Freiwillige Feuerwehr'],
  ['rettungsdienst', 'Rettungsdienst'],
  ['krankentransport', 'Krankentransport'],
  ['notarzt', 'Notarztwesen'],
  ['polizei', 'Polizei'],
  ['thw', 'Technische Hilfsorganisation (THW)'],
  ['katastrophenschutz', 'Katastrophenschutz'],
  ['werkfeuerwehr', 'Werkfeuerwehr'],
  ['sonstige', 'Sonstige'],
];

type Tab = 'allgemein' | 'gebiete' | 'orgs' | 'typen' | 'status' | 'strassen';

export function EditorView({ game }: { game: GameState }) {
  const [tab, setTab] = useState<Tab>('allgemein');
  return (
    <div className="page">
      <Tabs
        tabs={[
          ['allgemein', 'Allgemein'],
          ['gebiete', 'Einsatzgebiete'],
          ['orgs', 'Organisationen'],
          ['typen', 'Fahrzeugtypen'],
          ['status', 'Fahrzeugstatus'],
          ['strassen', 'Adressen'],
        ]}
        value={tab}
        onChange={setTab}
      />
      <div className="small muted" style={{ marginBottom: 10 }}>
        Wachen, Fahrzeuge, Stichwörter/AAO und Kliniken bearbeitest du in den gleichnamigen Bereichen oben. Alle Änderungen wirken sofort im laufenden Spiel und werden automatisch gespeichert.
      </div>
      {tab === 'allgemein' && <GeneralForm center={game.center} />}
      {tab === 'gebiete' && <AreasEditor game={game} />}
      {tab === 'orgs' && <OrgsEditor game={game} />}
      {tab === 'typen' && <TypesEditor game={game} />}
      {tab === 'status' && <StatusEditor game={game} />}
      {tab === 'strassen' && <StreetsEditor center={game.center} />}
    </div>
  );
}

function GeneralForm({ center }: { center: CenterConfig }) {
  const pick = (c: CenterConfig) => ({ name: c.name, description: c.description, operator: c.operator, country: c.country, state: c.state, district: c.district, city: c.city, mapCenter: c.mapCenter, mapZoom: c.mapZoom, sharing: c.sharing });
  const [f, setF] = useState(pick(center));
  const dirty = JSON.stringify(f) !== JSON.stringify(pick(center));
  const text = (k: 'name' | 'description' | 'operator' | 'country' | 'state' | 'district' | 'city', label: string, req = false) => (
    <label className="field">
      <span className={req ? 'req' : ''}>{label}</span>
      <input type="text" className={req && !f[k].trim() ? 'invalid' : ''} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );
  return (
    <div className="card col" style={{ maxWidth: 900 }}>
      <div className="form-grid">
        {text('name', 'Name der Leitstelle', true)}
        {text('operator', 'Betreiber / Träger')}
        {text('country', 'Land')}
        {text('state', 'Bundesland')}
        {text('district', 'Landkreis / Kreis')}
        {text('city', 'Sitz (Stadt / Gemeinde)')}
      </div>
      <label className="field">
        <span>Beschreibung</span>
        <textarea rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </label>
      <div className="field">
        <span>Kartenmittelpunkt (Startansicht)</span>
        <LatLngPicker value={f.mapCenter} onChange={(mapCenter) => setF({ ...f, mapCenter })} />
      </div>
      <div className="form-grid">
        <label className="field">
          <span>Zoomstufe (6–16)</span>
          <input type="number" min={6} max={16} value={f.mapZoom} onChange={(e) => setF({ ...f, mapZoom: Number(e.target.value) })} />
        </label>
        <label className="field">
          <span>Sichtbarkeit (für spätere Community-Bibliothek)</span>
          <select value={f.sharing.visibility} onChange={(e) => setF({ ...f, sharing: { ...f.sharing, visibility: e.target.value as CenterConfig['sharing']['visibility'] } })}>
            <option value="privat">privat</option>
            <option value="geteilt">geteilt</option>
            <option value="oeffentlich">öffentlich</option>
          </select>
          <span className="dim small">Wird nur gespeichert; eine Online-Bibliothek gibt es noch nicht.</span>
        </label>
        <label className="field">
          <span>Autor/-in</span>
          <input type="text" value={f.sharing.author} onChange={(e) => setF({ ...f, sharing: { ...f.sharing, author: e.target.value } })} />
        </label>
      </div>
      <div className="row">
        <button
          className="btn primary"
          disabled={!dirty || !f.name.trim()}
          onClick={() => store.edit((c) => void Object.assign(c, f), 'Leitstellendaten gespeichert.')}
        >
          Speichern
        </button>
        <button className="btn" disabled={!dirty} onClick={() => setF(pick(center))}>Änderungen verwerfen</button>
        {dirty && <span className="small" style={{ color: 'var(--warn)' }}>Ungespeicherte Änderungen</span>}
      </div>
    </div>
  );
}

/** Polygon-Zeichnen per Klick in die Karte */
function PolygonEditor({ value, onChange }: { value: LatLng[]; onChange: (v: LatLng[]) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const poly = useRef<L.Polygon | null>(null);
  const cb = useRef({ value, onChange });
  cb.current = { value, onChange };
  useEffect(() => {
    if (!el.current) return;
    const c = value[0] ?? store.state?.center.mapCenter ?? [51, 10];
    const m = L.map(el.current).setView(c, 11);
    L.tileLayer(TILE_URL, { attribution: TILE_ATTRIBUTION }).addTo(m);
    poly.current = L.polygon(value, { color: '#3d8bfd' }).addTo(m);
    if (value.length > 2) m.fitBounds(poly.current.getBounds(), { padding: [20, 20] });
    m.on('click', (e: L.LeafletMouseEvent) => cb.current.onChange([...cb.current.value, [Math.round(e.latlng.lat * 1e5) / 1e5, Math.round(e.latlng.lng * 1e5) / 1e5]]));
    map.current = m;
    setTimeout(() => map.current === m && m.invalidateSize(), 50);
    return () => {
      safeRemoveMap(m);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    poly.current?.setLatLngs(value);
  }, [value]);
  return (
    <div className="col" style={{ gap: 6 }}>
      <div className="row">
        <span className="small muted grow">{value.length} Eckpunkte – Klick in die Karte fügt einen Punkt hinzu.</span>
        <button className="btn small" disabled={!value.length} onClick={() => onChange(value.slice(0, -1))}>Letzten Punkt entfernen</button>
        <button className="btn small danger" disabled={!value.length} onClick={() => onChange([])}>Alle Punkte löschen</button>
      </div>
      <div ref={el} className="map-dark" style={{ height: 320, borderRadius: 6, border: '1px solid var(--line)' }} />
    </div>
  );
}

function AreasEditor({ game }: { game: GameState }) {
  const c = game.center;
  return (
    <EntityEditor<Area>
      title="Einsatzgebiete (Gemeinden & Teilgebiete)"
      items={c.areas}
      searchText={(a) => a.name}
      intro={<div className="small muted">Notrufe entstehen zufällig innerhalb der Gebiete. Die zuständigen Wachen werden im Einsatzmittelvorschlag bevorzugt (Fahrzeuge anderer Wachen erhalten einen Zeitmalus).</div>}
      columns={[
        { label: 'Name', render: (a) => <b>{a.name}</b> },
        { label: 'Art', render: (a) => a.kind },
        { label: 'Grenze', render: (a) => (a.kind === 'landkreis' ? `OSM-Relation ${a.osmRelationId ?? '–'} (${a.polygons.length} Teilfläche(n))` : `${a.polygons[0]?.[0]?.length ?? 0} Eckpunkte`) },
        { label: 'Zuständige Wachen', render: (a) => <span className="small">{a.responsibleStationIds.map((id) => c.stations.find((s) => s.id === id)?.name).join(', ') || <span className="dim">keine</span>}</span> },
      ]}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'kind', label: 'Art', type: 'select', options: [['landkreis', 'Landkreis (OSM)'], ['gemeinde', 'Gemeinde'], ['teilgebiet', 'Teilgebiet'], ['stadtteil', 'Stadtteil']], required: true },
        { key: 'responsibleStationIds', label: 'Zuständige Wachen', type: 'multi', options: c.stations.map((s) => [s.id, s.name]) },
        { key: 'polygon', label: 'Gebietsgrenze', type: 'custom', render: (d, set) => (d.kind === 'landkreis' ? <span className="small muted">Echte Kreisgrenze aus OpenStreetMap – nicht von Hand bearbeitbar.</span> : <PolygonEditor value={d.polygons[0]?.[0] ?? []} onChange={(ring) => set({ polygons: [[ring]] })} />) },
      ]}
      validate={(a) => (a.kind !== 'landkreis' && (a.polygons[0]?.[0]?.length ?? 0) < 3 ? { polygon: 'Mindestens 3 Eckpunkte setzen.', _: 'Die Gebietsgrenze braucht mindestens 3 Eckpunkte.' } : {})}
      create={() => ({ id: newId('area'), name: '', kind: 'teilgebiet', polygons: [], responsibleStationIds: [] })}
      duplicate={(a) => ({ ...a, id: newId('area'), name: `${a.name} (Kopie)` })}
      onSave={(a, isNew) => store.edit((_, g) => saveArea(g, a, isNew) ?? undefined, 'Gebiet gespeichert.')}
      onDelete={(a) => store.edit((_, g) => deleteArea(g, a.id) ?? undefined, 'Gebiet gelöscht.')}
    />
  );
}

export function RadioGroupFields({ value, onChange, invalid }: { value: RadioGroup; onChange: (v: RadioGroup) => void; invalid?: boolean }) {
  return (
    <div className="row wrap">
      <input type="text" placeholder="Name, z. B. Rettungsdienst Ostholstein" value={value.name} className={invalid && !value.name.trim() ? 'invalid' : ''} onChange={(e) => onChange({ ...value, name: e.target.value })} aria-label="Name der Funkrufgruppe" style={{ minWidth: 260 }} />
      <input type="text" placeholder="Kürzel, z. B. RD_OH" value={value.code} className={invalid && !value.code.trim() ? 'invalid' : ''} onChange={(e) => onChange({ ...value, code: e.target.value.toUpperCase() })} aria-label="Kürzel der Funkrufgruppe" style={{ width: 140 }} />
    </div>
  );
}

function OrgsEditor({ game }: { game: GameState }) {
  const c = game.center;
  return (
    <EntityEditor<Organization>
      title="Organisationen"
      items={c.organizations}
      searchText={(o) => o.name}
      columns={[
        { label: '', render: (o) => <span className="st-marker" style={{ display: 'inline-block', background: o.color }} /> },
        { label: 'Name', render: (o) => <b>{o.name}</b> },
        { label: 'Art', render: (o) => ORG_KINDS.find((k) => k[0] === o.kind)?.[1] },
        { label: 'Funkrufgruppe', render: (o) => <span className="mono small">{o.radioGroup.code} – {o.radioGroup.name}</span> },
        { label: 'Wachen', render: (o) => c.stations.filter((s) => s.organizationId === o.id).length },
        { label: 'Zuständigkeit', render: (o) => <span className="small muted">{o.responsibilities}</span> },
      ]}
      fields={[
        { key: 'name', label: 'Name', type: 'text', required: true },
        { key: 'kind', label: 'Art', type: 'select', options: ORG_KINDS, required: true },
        { key: 'color', label: 'Farbe (Karte)', type: 'color' },
        { key: 'radioGroup', label: 'Funkrufgruppe (Pflicht)', type: 'custom', render: (d, set) => <RadioGroupFields value={d.radioGroup} onChange={(radioGroup) => set({ radioGroup })} /> },
        { key: 'responsibilities', label: 'Zuständigkeiten', type: 'textarea' },
      ]}
      validate={(o) => ({ radioGroup: !o.radioGroup.name.trim() || !o.radioGroup.code.trim() ? 'Name und Kürzel der Funkrufgruppe sind Pflicht.' : undefined })}
      create={() => ({ id: newId('org'), name: '', kind: 'sonstige', responsibilities: '', color: '#12a594', radioGroup: { name: '', code: '' } })}
      duplicate={(o) => ({ ...o, id: newId('org'), name: `${o.name} (Kopie)` })}
      onSave={(o, isNew) => store.edit((_, g) => saveOrganization(g, o, isNew) ?? undefined, 'Organisation gespeichert.')}
      onDelete={(o) => store.edit((_, g) => deleteOrganization(g, o.id) ?? undefined, 'Organisation gelöscht.')}
    />
  );
}

function TypesEditor({ game }: { game: GameState }) {
  const c = game.center;
  return (
    <EntityEditor<VehicleType>
      title="Fahrzeugtypen"
      items={c.vehicleTypes}
      searchText={(t) => `${t.code} | ${t.name}`}
      columns={[
        { label: 'Kürzel', render: (t) => <b>{t.code}</b> },
        { label: 'Bezeichnung', render: (t) => t.name },
        { label: 'Organisation', render: (t) => ORG_KINDS.find((k) => k[0] === t.orgKind)?.[1] },
        { label: 'Fähigkeiten', render: (t) => <span className="small">{t.capabilities.join(', ')}</span> },
        { label: 'km/h', render: (t) => t.speedKmh },
        { label: 'Fahrzeuge', render: (t) => c.vehicles.filter((v) => v.typeId === t.id).length },
      ]}
      fields={[
        { key: 'code', label: 'Kürzel', type: 'text', required: true },
        { key: 'name', label: 'Bezeichnung', type: 'text', required: true },
        { key: 'orgKind', label: 'Organisationsart', type: 'select', options: ORG_KINDS, required: true },
        { key: 'seats', label: 'Sitzplätze', type: 'number', min: 1, max: 60, required: true },
        { key: 'speedKmh', label: 'Ø Geschwindigkeit mit Sonderrechten (km/h)', type: 'number', min: 5, max: 400, required: true },
        { key: 'canTransport', label: 'Patiententransport möglich', type: 'checkbox' },
        { key: 'airborne', label: 'Luftfahrzeug (Luftlinie)', type: 'checkbox' },
        { key: 'capabilities', label: 'Fähigkeiten', type: 'multi', options: Object.entries(CAPABILITIES) },
      ]}
      create={() => ({ id: newId('vt'), code: '', name: '', orgKind: 'feuerwehr', capabilities: [], seats: 2, speedKmh: 55 })}
      duplicate={(t) => ({ ...t, id: newId('vt'), code: `${t.code} (Kopie)` })}
      onSave={(t, isNew) => store.edit((_, g) => saveVehicleType(g, t, isNew) ?? undefined, 'Fahrzeugtyp gespeichert.')}
      onDelete={(t) => store.edit((_, g) => deleteVehicleType(g, t.id) ?? undefined, 'Fahrzeugtyp gelöscht.')}
    />
  );
}

const MEANING_TEXT: Record<StatusDef['meaning'], string> = {
  frei_funk: 'Einsatzbereit, unterwegs (alarmierbar)',
  frei_wache: 'Einsatzbereit auf Wache (alarmierbar)',
  alarmiert: 'Alarm empfangen, rückt aus',
  anfahrt: 'Auf Anfahrt zum Einsatzort',
  einsatzort: 'Am Einsatzort',
  sprechwunsch: 'Sprechwunsch / Rückmeldung',
  ausser_dienst: 'Nicht einsatzbereit',
  transport: 'Patiententransport',
  am_ziel: 'Am Transportziel',
};

function StatusEditor({ game }: { game: GameState }) {
  const [defs, setDefs] = useState(game.center.statusDefs);
  const dirty = JSON.stringify(defs) !== JSON.stringify(game.center.statusDefs);
  const save = () => {
    store.edit((_, g) => {
      for (const d of defs) {
        const e = saveStatusDef(g, d);
        if (e) return e;
      }
    }, 'Statusdefinitionen gespeichert.');
  };
  return (
    <div className="card col" style={{ maxWidth: 900 }}>
      <div className="small muted">Statussysteme unterscheiden sich regional. Code, Bezeichnung und Farbe sind frei wählbar; die Spielbedeutung (rechts) ist fest, damit die Simulation den Status versteht.</div>
      <table className="grid">
        <thead>
          <tr><th>Code</th><th>Bezeichnung</th><th>Farbe</th><th>Bedeutung in der Simulation</th></tr>
        </thead>
        <tbody>
          {defs.map((d, i) => (
            <tr key={d.meaning}>
              <td><input type="text" value={d.code} style={{ width: 60 }} aria-label={`Code ${d.meaning}`} onChange={(e) => setDefs(defs.map((x, j) => (j === i ? { ...x, code: e.target.value } : x)))} /></td>
              <td><input type="text" value={d.label} style={{ width: '100%' }} aria-label={`Bezeichnung ${d.meaning}`} onChange={(e) => setDefs(defs.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} /></td>
              <td><input type="color" value={d.color} aria-label={`Farbe ${d.meaning}`} onChange={(e) => setDefs(defs.map((x, j) => (j === i ? { ...x, color: e.target.value } : x)))} /></td>
              <td className="small muted">{MEANING_TEXT[d.meaning]}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="row">
        <button className="btn primary" disabled={!dirty} onClick={save}>Speichern</button>
        <button className="btn" disabled={!dirty} onClick={() => setDefs(game.center.statusDefs)}>Verwerfen</button>
      </div>
    </div>
  );
}

function StreetsEditor({ center }: { center: CenterConfig }) {
  const [text, setText] = useState(center.streetNames.join('\n'));
  const list = text.split('\n').map((s) => s.trim()).filter(Boolean);
  return (
    <div className="card col" style={{ maxWidth: 640 }}>
      <h3>Straßennamen für generierte Einsatzadressen</h3>
      <div className="small muted">Ein Name pro Zeile. Einsatzadressen werden zufällig aus diesen Namen, einer Hausnummer und dem Gebietsnamen gebildet.</div>
      <textarea rows={14} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <button
          className="btn primary"
          disabled={list.length === 0}
          onClick={async () => {
            if (list.length < 5 && !(await confirmDialog('Weniger als 5 Straßennamen führen zu sehr ähnlichen Adressen. Trotzdem speichern?', { confirmLabel: 'Speichern', danger: false }))) return;
            store.edit((c) => void (c.streetNames = list), `${list.length} Straßennamen gespeichert.`);
          }}
        >
          Speichern
        </button>
        <span className="small dim">{list.length} Einträge</span>
      </div>
    </div>
  );
}
