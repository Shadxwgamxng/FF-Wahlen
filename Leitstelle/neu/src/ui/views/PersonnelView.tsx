import { useMemo, useState } from 'react';
import type { GameState, Person, ShiftKind } from '../../model/types';
import { EntityEditor } from '../components/EntityEditor';
import { Tabs } from '../components/common';
import { store } from '../../store/gameStore';
import { newId } from '../../model/ids';
import { deletePerson, savePerson } from '../../sim/editorOps';
import { allocateCrew, busyPersonIds, personOnDuty } from '../../sim/availability';
import { PeriodsEditor } from './StationsVehicles';

const SHIFTS: [ShiftKind, string][] = [
  ['tag', 'Tagdienst'],
  ['nacht', 'Nachtdienst'],
  ['24h', '24-Stunden-Dienst'],
  ['ehrenamt', 'Ehrenamtlich (Rufbereitschaft)'],
];

export function PersonnelView({ game }: { game: GameState }) {
  const [tab, setTab] = useState<'personal' | 'wachen' | 'schicht'>('wachen');
  const c = game.center;
  const now = game.runtime.clock.now;
  const busy = useMemo(() => busyPersonIds(game), [game]);
  return (
    <div className="page">
      <Tabs tabs={[['wachen', 'Besetzung je Wache (jetzt)'], ['personal', 'Personal'], ['schicht', 'Schichtmodell']]} value={tab} onChange={setTab} />
      {tab === 'personal' && (
        <EntityEditor<Person>
          title="Personal"
          items={c.personnel}
          searchText={(p) => `${p.name} | ${c.stations.find((s) => s.id === p.stationId)?.name} ${p.qualifications.join(' ')}`}
          columns={[
            { label: 'Name', render: (p) => p.name },
            { label: 'Wache', render: (p) => c.stations.find((s) => s.id === p.stationId)?.name },
            { label: 'Qualifikationen', render: (p) => <span className="small">{p.qualifications.map((q) => c.qualifications.find((x) => x.id === q)?.name.split(' ')[0] ?? q).join(', ')}</span> },
            { label: 'Dienst', render: (p) => SHIFTS.find((s) => s[0] === p.shift)?.[1] },
            {
              label: 'Jetzt',
              render: (p) =>
                busy.has(p.id) ? <span style={{ color: 'var(--warn)' }}>im Einsatz</span> : personOnDuty(p, c, now) ? <span style={{ color: 'var(--ok)' }}>im Dienst</span> : <span className="dim">frei / abwesend</span>,
            },
            { label: 'Abwesenheiten', render: (p) => <span className="small">{p.absences.filter((a) => a.to > now).map((a) => a.reason || 'abwesend').join(', ')}</span> },
          ]}
          fields={[
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'stationId', label: 'Wache', type: 'select', options: c.stations.map((s) => [s.id, s.name]), required: true },
            { key: 'shift', label: 'Dienstform', type: 'select', options: SHIFTS, required: true },
            { key: 'qualifications', label: 'Qualifikationen', type: 'multi', options: c.qualifications.map((q) => [q.id, q.name]) },
            { key: 'absences', label: 'Abwesenheiten (Urlaub, Krankheit, Fortbildung)', type: 'custom', render: (d, set) => <PeriodsEditor value={d.absences} onChange={(absences) => set({ absences })} now={now} label="Abwesenheit" /> },
          ]}
          create={() => ({ id: newId('p'), name: '', stationId: c.stations[0]?.id ?? '', qualifications: [], shift: 'tag', absences: [] })}
          duplicate={(p) => ({ ...p, id: newId('p'), name: `${p.name} (Kopie)`, absences: [] })}
          onSave={(p, isNew) => store.edit((_, g) => savePerson(g, p, isNew) ?? undefined, 'Person gespeichert.')}
          onDelete={(p) => store.edit((_, g) => deletePerson(g, p.id) ?? undefined, 'Person gelöscht.')}
        />
      )}
      {tab === 'wachen' && (
        <div className="col">
          <div className="small muted">Aktuelle Besetzbarkeit der Fahrzeuge aus dem diensthabenden, nicht gebundenen Personal. Fahrzeuge ohne vollständige Besatzung können nicht alarmiert werden.</div>
          {c.stations.map((s) => {
            const persons = c.personnel.filter((p) => p.stationId === s.id);
            const onDuty = persons.filter((p) => personOnDuty(p, c, now));
            const vs = c.vehicles.filter((v) => v.stationId === s.id);
            return (
              <div key={s.id} className="card col" style={{ gap: 6 }}>
                <div className="row">
                  <h3 className="grow">{s.name}</h3>
                  <span className="small muted">Personal: {onDuty.length} im Dienst / {persons.length} gesamt · {onDuty.filter((p) => busy.has(p.id)).length} im Einsatz</span>
                </div>
                <div className="row wrap">
                  {vs.map((v) => {
                    const t = c.vehicleTypes.find((x) => x.id === v.typeId);
                    const crew = v.rt.crewIds.length ? { ok: true, missing: [] } : allocateCrew(game, v, t, now, busy);
                    return (
                      <span key={v.id} className={`chip ${crew.ok ? 'ok' : 'alarm'}`} title={crew.ok ? 'besetzbar' : `fehlt: ${crew.missing.map((m) => `${m.count}× ${m.qualification}`).join(', ')}`}>
                        {t?.code} {v.callsign.split(' ').slice(-1)[0]} {v.rt.crewIds.length ? '(besetzt, im Einsatz)' : crew.ok ? '✓' : '✗'}
                      </span>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {tab === 'schicht' && <ShiftModelEditor game={game} />}
    </div>
  );
}

function ShiftModelEditor({ game }: { game: GameState }) {
  const [m, setM] = useState(game.center.shiftModel);
  const valid = m.dayStart >= 0 && m.dayEnd <= 24 && m.dayStart < m.dayEnd && m.volunteerDayAvailability >= 0 && m.volunteerDayAvailability <= 1 && m.volunteerNightAvailability >= 0 && m.volunteerNightAvailability <= 1;
  return (
    <div className="card col" style={{ maxWidth: 640 }}>
      <h3>Schichtmodell</h3>
      <div className="form-grid">
        <label className="field"><span>Tagdienst Beginn (Uhr)</span><input type="number" min={0} max={23} value={m.dayStart} onChange={(e) => setM({ ...m, dayStart: Number(e.target.value) })} /></label>
        <label className="field"><span>Tagdienst Ende (Uhr)</span><input type="number" min={1} max={24} value={m.dayEnd} onChange={(e) => setM({ ...m, dayEnd: Number(e.target.value) })} /></label>
        <label className="field"><span>Erreichbarkeit Ehrenamt tagsüber (0–1)</span><input type="number" step={0.05} min={0} max={1} value={m.volunteerDayAvailability} onChange={(e) => setM({ ...m, volunteerDayAvailability: Number(e.target.value) })} /></label>
        <label className="field"><span>Erreichbarkeit Ehrenamt nachts (0–1)</span><input type="number" step={0.05} min={0} max={1} value={m.volunteerNightAvailability} onChange={(e) => setM({ ...m, volunteerNightAvailability: Number(e.target.value) })} /></label>
      </div>
      {!valid && <div className="field-error">Bitte gültige Werte eingeben (Beginn vor Ende, Anteile zwischen 0 und 1).</div>}
      <div className="small muted">Tagdienst-Personal ist zwischen Beginn und Ende im Dienst, Nachtdienst-Personal in der übrigen Zeit. Ehrenamtliche sind mit der angegebenen Wahrscheinlichkeit je Halbtag erreichbar (deterministisch je Person).</div>
      <button className="btn primary" style={{ alignSelf: 'flex-start' }} disabled={!valid} onClick={() => store.edit((c) => void (c.shiftModel = m), 'Schichtmodell gespeichert.')}>Speichern</button>
    </div>
  );
}
