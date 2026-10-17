import type { GameState, MaintenanceWindow, ServiceWindow, Station, Vehicle } from '../../model/types';
import { EntityEditor } from '../components/EntityEditor';
import { store } from '../../store/gameStore';
import { newId } from '../../model/ids';
import { deleteStation, deleteVehicle, saveStation, saveVehicle } from '../../sim/editorOps';
import { vehicleAvailability } from '../../sim/availability';
import { emptyVehicleRuntime } from '../../data/sampleCenter';
import { fmtDateTime, StatusBadge } from '../components/common';
import { radioGroupOf } from '../../model/radio';
import { RadioGroupFields } from './EditorView';

export const STATION_KINDS: [Station['kind'], string][] = [
  ['feuerwache', 'Feuerwache (hauptamtlich)'],
  ['feuerwehrhaus', 'Feuerwehrhaus (ehrenamtlich)'],
  ['rettungswache', 'Rettungswache'],
  ['notarztstandort', 'Notarztstandort'],
  ['polizei', 'Polizeidienststelle'],
  ['thw', 'THW-Unterkunft'],
  ['kats', 'Katastrophenschutz'],
  ['werkfeuerwehr', 'Werkfeuerwehr'],
  ['sonstige', 'Sonstiger Standort'],
];

export function StationsView({ game }: { game: GameState }) {
  const c = game.center;
  return (
    <div className="page">
      <EntityEditor<Station>
        title="Wachen & Standorte"
        items={c.stations}
        searchText={(s) => `${s.name} | ${s.address}`}
        columns={[
          { label: 'Name', render: (s) => <b>{s.name}</b> },
          { label: 'Art', render: (s) => STATION_KINDS.find((k) => k[0] === s.kind)?.[1] },
          { label: 'Organisation', render: (s) => c.organizations.find((o) => o.id === s.organizationId)?.name },
          { label: 'Fahrzeuge / Plätze', render: (s) => `${c.vehicles.filter((v) => v.stationId === s.id).length} / ${s.capacity}` },
          { label: 'Ausrückzeit', render: (s) => `${s.turnoutSeconds} s` },
          { label: 'Adresse', render: (s) => <span className="small muted">{s.address}</span> },
        ]}
        fields={[
          { key: 'name', label: 'Name', type: 'text', required: true },
          { key: 'kind', label: 'Art', type: 'select', options: STATION_KINDS, required: true },
          { key: 'organizationId', label: 'Organisation', type: 'select', options: c.organizations.map((o) => [o.id, o.name]), required: true },
          { key: 'address', label: 'Adresse', type: 'text' },
          { key: 'capacity', label: 'Stellplätze', type: 'number', min: 0, max: 100, required: true },
          { key: 'turnoutSeconds', label: 'Ausrückzeit (Sekunden)', type: 'number', min: 0, max: 3600, required: true, help: 'Zeit von Alarm bis Status 3. Ehrenamtlich typisch 240–420 s.' },
          { key: 'position', label: 'Standort', type: 'latlng', required: true, center: c.mapCenter },
        ]}
        create={() => ({ id: newId('st'), name: '', kind: 'feuerwache', organizationId: c.organizations[0]?.id ?? '', position: [...c.mapCenter], address: '', capacity: 4, turnoutSeconds: 60 })}
        duplicate={(s) => ({ ...s, id: newId('st'), name: `${s.name} (Kopie)` })}
        onSave={(s, isNew) => store.edit((_, g) => saveStation(g, s, isNew) ?? undefined, 'Wache gespeichert.')}
        onDelete={(s) => store.edit((_, g) => deleteStation(g, s.id) ?? undefined, 'Wache gelöscht.')}
      />
    </div>
  );
}

const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

function WindowsEditor({ value, onChange }: { value: ServiceWindow[]; onChange: (v: ServiceWindow[]) => void }) {
  return (
    <div className="col" style={{ gap: 4 }}>
      {value.length === 0 && <span className="dim small">Rund um die Uhr im Dienst.</span>}
      {value.map((w, i) => (
        <div key={i} className="row wrap">
          <input type="number" min={0} max={23} value={w.fromHour} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, fromHour: Number(e.target.value) } : x)))} style={{ width: 64 }} aria-label="Beginn (Stunde)" />
          <span>bis</span>
          <input type="number" min={1} max={24} value={w.toHour} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, toHour: Number(e.target.value) } : x)))} style={{ width: 64 }} aria-label="Ende (Stunde)" />
          <span>Uhr an</span>
          {WD.map((d, wd) => (
            <label key={wd} className="check small">
              <input
                type="checkbox"
                checked={w.weekdays.includes(wd)}
                onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, weekdays: e.target.checked ? [...x.weekdays, wd].sort() : x.weekdays.filter((y) => y !== wd) } : x)))}
              />
              {d}
            </label>
          ))}
          <span className="dim small">{w.weekdays.length === 0 ? '(täglich)' : ''}</span>
          <button className="btn small danger" onClick={() => onChange(value.filter((_, j) => j !== i))}>Entfernen</button>
        </div>
      ))}
      <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...value, { fromHour: 7, toHour: 19, weekdays: [1, 2, 3, 4, 5] }])}>+ Dienstzeit</button>
    </div>
  );
}

const toLocalInput = (t: number) => new Date(t).toISOString().slice(0, 16);
const fromLocalInput = (s: string) => Date.parse(`${s}:00Z`);

export function PeriodsEditor<T extends { id: string; from: number; to: number; reason: string }>({ value, onChange, now, label }: { value: T[]; onChange: (v: T[]) => void; now: number; label: string }) {
  return (
    <div className="col" style={{ gap: 4 }}>
      {value.length === 0 && <span className="dim small">Keine Einträge.</span>}
      {value.map((m, i) => (
        <div key={m.id} className="row wrap">
          <input type="datetime-local" value={toLocalInput(m.from)} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, from: fromLocalInput(e.target.value) } : x)))} aria-label="Beginn" />
          <span>bis</span>
          <input type="datetime-local" value={toLocalInput(m.to)} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, to: fromLocalInput(e.target.value) } : x)))} aria-label="Ende" />
          <input type="text" value={m.reason} placeholder="Grund" onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, reason: e.target.value } : x)))} />
          {m.to <= now && <span className="dim small">vergangen</span>}
          <button className="btn small danger" onClick={() => onChange(value.filter((_, j) => j !== i))}>Entfernen</button>
        </div>
      ))}
      <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...value, { id: newId('per'), from: now, to: now + 4 * 3600_000, reason: '' } as T])}>
        + {label}
      </button>
      <span className="dim small">Zeiten in Simulationszeit.</span>
    </div>
  );
}

export function VehiclesView({ game }: { game: GameState }) {
  const c = game.center;
  const now = game.runtime.clock.now;
  return (
    <div className="page">
      <EntityEditor<Vehicle>
        title="Fahrzeuge"
        items={c.vehicles}
        searchText={(v) => `${v.callsign} | ${c.vehicleTypes.find((t) => t.id === v.typeId)?.code} ${c.stations.find((s) => s.id === v.stationId)?.name} ${v.identifier}`}
        rowClass={(v) => (vehicleAvailability(game, v).available ? '' : 'unavailable')}
        columns={[
          { label: 'St.', render: (v) => <StatusBadge game={game} meaning={v.rt.status} /> },
          { label: 'Funkrufname', render: (v) => <b>{v.callsign}</b> },
          { label: 'Typ', render: (v) => c.vehicleTypes.find((t) => t.id === v.typeId)?.code },
          { label: 'Wache', render: (v) => c.stations.find((s) => s.id === v.stationId)?.name },
          { label: 'Kennung', render: (v) => <span className="mono small">{v.identifier}</span> },
          { label: 'Funkrufgruppe', render: (v) => <span className="mono small">{radioGroupOf(c, v)?.code ?? '–'}</span> },
          {
            label: 'Dienstzeit',
            render: (v) =>
              v.serviceWindows.length === 0 ? <span className="dim">24/7</span> : v.serviceWindows.map((w) => `${w.fromHour}–${w.toHour} ${w.weekdays.length ? w.weekdays.map((d) => WD[d]).join('') : 'tgl.'}`).join(', '),
          },
          {
            label: 'Verfügbarkeit',
            render: (v) => {
              const a = vehicleAvailability(game, v);
              return a.available ? <span style={{ color: 'var(--ok)' }}>verfügbar</span> : <span className="small">{a.reason}</span>;
            },
          },
          { label: 'Wartung', render: (v) => <span className="small">{v.maintenance.filter((m) => m.to > now).map((m) => `${fmtDateTime(m.from)} ${m.reason}`).join('; ')}</span> },
        ]}
        fields={[
          { key: 'callsign', label: 'Funkrufname', type: 'text', required: true, placeholder: 'z. B. Florian Musterstadt 1/46-1' },
          { key: 'typeId', label: 'Fahrzeugtyp', type: 'select', options: c.vehicleTypes.map((t) => [t.id, `${t.code} – ${t.name}`]), required: true },
          { key: 'stationId', label: 'Wache', type: 'select', options: c.stations.map((s) => [s.id, s.name]), required: true },
          { key: 'organizationId', label: 'Organisation (leer = wie Wache)', type: 'select', options: c.organizations.map((o) => [o.id, o.name]) },
          { key: 'identifier', label: 'Kennzeichen / Kennung', type: 'text' },
          {
            key: 'radioGroup',
            label: 'Funkrufgruppe',
            type: 'custom',
            render: (d, set) => {
              const org = c.organizations.find((o) => o.id === (d.organizationId || c.stations.find((s) => s.id === d.stationId)?.organizationId));
              return (
                <div className="col" style={{ gap: 4 }}>
                  <label className="check small">
                    <input type="checkbox" checked={!d.radioGroup} onChange={(e) => set({ radioGroup: e.target.checked ? undefined : { ...(org?.radioGroup ?? { name: '', code: '' }) } })} />
                    wie Organisation: <span className="mono">{org ? `${org.radioGroup.code} – ${org.radioGroup.name}` : '–'}</span>
                  </label>
                  {d.radioGroup && <RadioGroupFields value={d.radioGroup} onChange={(radioGroup) => set({ radioGroup })} invalid />}
                </div>
              );
            },
          },
          {
            key: 'equipment',
            label: 'Zusatzausrüstung (kommagetrennt)',
            type: 'custom',
            render: (d, set) => <input type="text" value={d.equipment.join(', ')} onChange={(e) => set({ equipment: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })} />,
            help: 'Informativ; die Disposition nutzt die Fähigkeiten des Fahrzeugtyps.',
          },
          { key: 'serviceWindows', label: 'Dienstzeiten', type: 'custom', render: (d, set) => <WindowsEditor value={d.serviceWindows} onChange={(serviceWindows) => set({ serviceWindows })} /> },
          {
            key: 'maintenance',
            label: 'Geplante Wartung / Ausfall',
            type: 'custom',
            render: (d, set) => <PeriodsEditor<MaintenanceWindow> value={d.maintenance} onChange={(maintenance) => set({ maintenance })} now={now} label="Wartung" />,
          },
          {
            key: 'external',
            label: 'Externes Einsatzmittel (Anforderung über Nachbarleitstelle)',
            type: 'custom',
            render: (d, set) => (
              <div className="row wrap">
                <select value={d.external?.neighborId ?? ''} onChange={(e) => set({ external: e.target.value ? { neighborId: e.target.value, requestDelaySeconds: d.external?.requestDelaySeconds ?? 120 } : undefined })} aria-label="Nachbarleitstelle">
                  <option value="">– eigenes Fahrzeug –</option>
                  {c.neighbors.map((n) => (
                    <option key={n.id} value={n.id}>{n.name}</option>
                  ))}
                </select>
                {d.external && (
                  <label className="row small">
                    Anforderungsverzug (s)
                    <input type="number" min={0} value={d.external.requestDelaySeconds} onChange={(e) => set({ external: { ...d.external!, requestDelaySeconds: Number(e.target.value) } })} style={{ width: 80 }} />
                  </label>
                )}
              </div>
            ),
          },
        ]}
        create={() => {
          const st = c.stations[0];
          return {
            id: newId('v'),
            callsign: '',
            typeId: c.vehicleTypes[0]?.id ?? '',
            organizationId: '',
            stationId: st?.id ?? '',
            identifier: '',
            equipment: [],
            serviceWindows: [],
            maintenance: [],
            rt: emptyVehicleRuntime(st?.position ?? c.mapCenter, now),
          };
        }}
        duplicate={(v) => ({ ...v, id: newId('v'), callsign: `${v.callsign} (Kopie)`, maintenance: [] })}
        validate={(v) => (c.stations.length === 0 ? { stationId: 'Bitte zuerst eine Wache anlegen.' } : !v.stationId ? { stationId: 'Pflichtfeld' } : {})}
        onSave={(v, isNew) => store.edit((_, g) => saveVehicle(g, v, isNew) ?? undefined, 'Fahrzeug gespeichert.')}
        onDelete={(v) => store.edit((_, g) => deleteVehicle(g, v.id) ?? undefined, 'Fahrzeug gelöscht.')}
      />
    </div>
  );
}
