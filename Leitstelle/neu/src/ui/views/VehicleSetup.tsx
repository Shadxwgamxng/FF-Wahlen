import { useMemo, useState } from 'react';
import type { GameState, ServiceWindow, Station, Vehicle } from '../../model/types';
import { newId } from '../../model/ids';
import { radioGroupOf } from '../../model/radio';
import { emptyVehicleRuntime } from '../../data/sampleCenter';
import { store } from '../../store/gameStore';
import { setVehicleImage } from '../vehicleImages';

/**
 * Fahrzeuge an den Wachen anlegen – direkt nach dem Erstellen einer Leitstelle und im Bearbeitungsmodus.
 * Jede Angabe ist Pflicht: Fahrzeugtyp, Funkrufname, Kennzeichen, Funkrufgruppe und Dienstzeit.
 */

interface Draft {
  typeId: string;
  callsign: string;
  identifier: string;
  groupCode: string;
  groupName: string;
  allDay: boolean;
  from: number;
  to: number;
}

const emptyDraft = (): Draft => ({ typeId: '', callsign: '', identifier: '', groupCode: '', groupName: '', allDay: true, from: 7, to: 19 });

export function draftErrors(d: Draft, vehicles: Vehicle[]): string[] {
  const e: string[] = [];
  if (!d.typeId) e.push('Fahrzeugtyp wählen');
  if (!d.callsign.trim()) e.push('Funkrufname angeben');
  else if (vehicles.some((v) => v.callsign.trim().toLowerCase() === d.callsign.trim().toLowerCase())) e.push('Funkrufname ist schon vergeben');
  if (!d.identifier.trim()) e.push('Kennzeichen angeben');
  if (!d.groupCode.trim() || !d.groupName.trim()) e.push('Funkrufgruppe (Kürzel und Name) angeben');
  if (!d.allDay && (d.from < 0 || d.from > 23 || d.to < 1 || d.to > 24 || d.from === d.to)) e.push('Dienstzeit prüfen');
  return e;
}

export function VehicleSetup({ game }: { game: GameState }) {
  const c = game.center;
  const [filter, setFilter] = useState('');
  const [onlyEmpty, setOnlyEmpty] = useState(false);
  const stations = useMemo(
    () =>
      c.stations
        .filter((s) => !filter || s.name.toLowerCase().includes(filter.toLowerCase()))
        .filter((s) => !onlyEmpty || !c.vehicles.some((v) => v.stationId === s.id))
        .sort((a, b) => a.name.localeCompare(b.name, 'de')),
    [c.stations, c.vehicles, filter, onlyEmpty],
  );
  const empty = c.stations.filter((s) => !c.vehicles.some((v) => v.stationId === s.id)).length;
  return (
    <div className="page col" data-testid="vehicle-setup">
      <div className="row wrap" style={{ alignItems: 'center' }}>
        <h2 className="grow" style={{ margin: 0 }}>Fahrzeuge je Wache</h2>
        <input placeholder="Wache suchen …" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ width: 220 }} />
        <label className="check small">
          <input type="checkbox" checked={onlyEmpty} onChange={(e) => setOnlyEmpty(e.target.checked)} /> nur ohne Fahrzeuge ({empty})
        </label>
      </div>
      {c.stations.length === 0 && <div className="empty">Keine Wachen angelegt.</div>}
      {stations.map((s) => (
        <StationCard key={s.id} game={game} station={s} />
      ))}
    </div>
  );
}

function StationCard({ game, station }: { game: GameState; station: Station }) {
  const c = game.center;
  const vehicles = c.vehicles.filter((v) => v.stationId === station.id);
  const org = c.organizations.find((o) => o.id === station.organizationId);
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Draft>(() => ({ ...emptyDraft(), groupCode: org?.radioGroup.code ?? '', groupName: org?.radioGroup.name ?? '' }));
  const [tried, setTried] = useState(false);
  const [imgs, setImgs] = useState<{ normal?: File; blaulicht?: File }>({});
  const [imgKey, setImgKey] = useState(0);
  const errors = draftErrors(d, c.vehicles);
  const set = (p: Partial<Draft>) => setD({ ...d, ...p });

  const add = () => {
    setTried(true);
    if (errors.length) return;
    const windows: ServiceWindow[] = d.allDay ? [] : [{ fromHour: d.from, toHour: d.to, weekdays: [] }];
    const sameAsOrg = org && org.radioGroup.code === d.groupCode.trim() && org.radioGroup.name === d.groupName.trim();
    const id = newId('v');
    const err = store.edit((center) => {
      center.vehicles.push({
        id,
        callsign: d.callsign.trim(),
        typeId: d.typeId,
        organizationId: station.organizationId,
        stationId: station.id,
        identifier: d.identifier.trim(),
        equipment: [],
        serviceWindows: windows,
        maintenance: [],
        radioGroup: sameAsOrg ? undefined : { code: d.groupCode.trim(), name: d.groupName.trim() },
        rt: emptyVehicleRuntime(station.position, game.runtime.clock.now),
      });
    }, `${d.callsign.trim()} angelegt.`);
    if (!err) {
      // Bilder für die Karte (ohne / mit Blaulicht) gleich mitspeichern
      for (const k of ['normal', 'blaulicht'] as const) {
        const f = imgs[k];
        if (f) void setVehicleImage(id, k, f).catch((e) => store.toast('fehler', (e as Error).message));
      }
      setImgs({});
      setImgKey((x) => x + 1);
      setD({ ...emptyDraft(), groupCode: d.groupCode, groupName: d.groupName, typeId: d.typeId });
      setTried(false);
    }
  };

  return (
    <div className="card col" style={{ gap: 6 }} data-testid="station-card">
      <div className="row" style={{ alignItems: 'center' }}>
        <b className="grow">{station.name}</b>
        <span className="small muted">{org?.name}</span>
        <span className={`chip small ${vehicles.length ? 'ok' : 'warn'}`}>{vehicles.length} Fahrzeug(e)</span>
        <button className="btn small" onClick={() => setOpen(!open)} data-testid="station-add-toggle">
          {open ? 'Schließen' : '+ Fahrzeug'}
        </button>
      </div>
      {vehicles.length > 0 && (
        <div className="row wrap small">
          {vehicles.map((v) => (
            <span key={v.id} className="chip small" title={`${v.identifier} · ${radioGroupOf(c, v)?.code ?? ''}`}>
              {c.vehicleTypes.find((t) => t.id === v.typeId)?.code} · {v.callsign}
            </span>
          ))}
        </div>
      )}
      {open && (
        <div className="col" style={{ gap: 6 }}>
          <div className="form-grid">
            <label>
              Fahrzeugtyp*
              <select value={d.typeId} onChange={(e) => set({ typeId: e.target.value })} data-testid="vs-type">
                <option value="">wählen</option>
                {c.vehicleTypes.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.code} – {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Funkrufname*
              <input value={d.callsign} onChange={(e) => set({ callsign: e.target.value })} placeholder="z. B. Florian Ostholstein 61-48-01" data-testid="vs-callsign" />
            </label>
            <label>
              Kennzeichen*
              <input value={d.identifier} onChange={(e) => set({ identifier: e.target.value })} placeholder="z. B. OH-FW 4801" data-testid="vs-identifier" />
            </label>
            <label>
              Funkrufgruppe (Kürzel)*
              <input value={d.groupCode} onChange={(e) => set({ groupCode: e.target.value })} placeholder="z. B. FW_OH" />
            </label>
            <label>
              Funkrufgruppe (Name)*
              <input value={d.groupName} onChange={(e) => set({ groupName: e.target.value })} placeholder="z. B. Feuerwehren Ostholstein" />
            </label>
            <label>
              Dienstzeit*
              <span className="row">
                <label className="check small">
                  <input type="checkbox" checked={d.allDay} onChange={(e) => set({ allDay: e.target.checked })} /> rund um die Uhr
                </label>
                {!d.allDay && (
                  <>
                    <input type="number" min={0} max={23} value={d.from} onChange={(e) => set({ from: Number(e.target.value) })} style={{ width: 60 }} aria-label="von Uhr" />–
                    <input type="number" min={1} max={24} value={d.to} onChange={(e) => set({ to: Number(e.target.value) })} style={{ width: 60 }} aria-label="bis Uhr" /> Uhr
                  </>
                )}
              </span>
            </label>
            <label>
              Bild normal
              <input key={`n${imgKey}`} type="file" accept="image/*" onChange={(e) => setImgs({ ...imgs, normal: e.target.files?.[0] })} data-testid="vs-img-normal" />
            </label>
            <label>
              Bild Sondersignal
              <input key={`b${imgKey}`} type="file" accept="image/*" onChange={(e) => setImgs({ ...imgs, blaulicht: e.target.files?.[0] })} data-testid="vs-img-blaulicht" />
            </label>
          </div>
          {tried && errors.length > 0 && <div className="errbox small">{errors.join(' · ')}</div>}
          <div className="row">
            <button className="btn primary small" onClick={add} data-testid="vs-add">
              Fahrzeug anlegen
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
