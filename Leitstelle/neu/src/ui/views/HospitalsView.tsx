import { useState } from 'react';
import type { GameState, Hospital, NeighborCenter } from '../../model/types';
import { EntityEditor } from '../components/EntityEditor';
import { Tabs } from '../components/common';
import { store } from '../../store/gameStore';
import { newId } from '../../model/ids';
import { deleteHospital, deleteNeighbor, saveHospital, saveNeighbor } from '../../sim/editorOps';

export const DEPARTMENTS: [string, string][] = [
  ['allgemein', 'Allgemeine Aufnahme'],
  ['innere', 'Innere Medizin'],
  ['kardiologie', 'Kardiologie (Herzkatheter)'],
  ['neurologie', 'Neurologie (Stroke Unit)'],
  ['unfallchirurgie', 'Unfallchirurgie / Traumazentrum'],
  ['verbrennung', 'Schwerbrandverletzte'],
  ['paediatrie', 'Kinderheilkunde'],
  ['gynaekologie', 'Gynäkologie / Geburtshilfe'],
  ['psychiatrie', 'Psychiatrie'],
  ['intensiv', 'Intensivmedizin'],
];

export function HospitalsView({ game }: { game: GameState }) {
  const [tab, setTab] = useState<'kh' | 'nb'>('kh');
  const c = game.center;
  return (
    <div className="page">
      <Tabs tabs={[['kh', 'Krankenhäuser & Ziele'], ['nb', 'Nachbarleitstellen & externe Kräfte']]} value={tab} onChange={setTab} />
      {tab === 'kh' && (
        <EntityEditor<Hospital>
          title="Krankenhäuser"
          items={c.hospitals}
          searchText={(h) => `${h.name} | ${h.departments.join(' ')}`}
          intro={<div className="infobox small">Die Zielauswahl richtet sich ausschließlich nach den hier hinterlegten Spieldaten (Fachrichtung, freie Betten, geschätzte Fahrzeit). Sie ist keine medizinische Entscheidungshilfe.</div>}
          columns={[
            { label: 'Name', render: (h) => <b>{h.name}</b> },
            { label: 'Fachrichtungen', render: (h) => <span className="small">{h.departments.map((d) => DEPARTMENTS.find((x) => x[0] === d)?.[1] ?? d).join(', ')}</span> },
            { label: 'Belegung', render: (h) => `${h.occupied} / ${h.capacity}` },
            { label: 'Status', render: (h) => (h.available ? <span style={{ color: 'var(--ok)' }}>aufnahmebereit</span> : <span className="field-error">abgemeldet</span>) },
            {
              label: '',
              render: (h) => (
                <button className="btn small" onClick={() => store.edit((cc) => void (cc.hospitals.find((x) => x.id === h.id)!.available = !h.available), h.available ? `${h.name} abgemeldet.` : `${h.name} wieder aufnahmebereit.`)}>
                  {h.available ? 'Abmelden' : 'Anmelden'}
                </button>
              ),
            },
          ]}
          fields={[
            { key: 'name', label: 'Name', type: 'text', required: true },
            { key: 'capacity', label: 'Aufnahmekapazität (Patienten gleichzeitig)', type: 'number', min: 0, max: 500, required: true },
            { key: 'available', label: 'Aufnahmebereit', type: 'checkbox' },
            { key: 'departments', label: 'Fachrichtungen', type: 'multi', options: DEPARTMENTS },
            { key: 'position', label: 'Standort', type: 'latlng', required: true, center: c.mapCenter },
          ]}
          create={() => ({ id: newId('kh'), name: '', position: [...c.mapCenter], departments: ['allgemein', 'innere'], capacity: 6, occupied: 0, available: true })}
          duplicate={(h) => ({ ...h, id: newId('kh'), name: `${h.name} (Kopie)`, occupied: 0 })}
          onSave={(h, isNew) => store.edit((_, g) => saveHospital(g, h, isNew) ?? undefined, 'Krankenhaus gespeichert.')}
          onDelete={(h) => store.edit((_, g) => deleteHospital(g, h.id) ?? undefined, 'Krankenhaus gelöscht.')}
        />
      )}
      {tab === 'nb' && (
        <div className="col">
          <EntityEditor<NeighborCenter>
            title="Nachbarleitstellen"
            items={c.neighbors}
            searchText={(n) => n.name}
            columns={[
              { label: 'Name', render: (n) => <b>{n.name}</b> },
              { label: 'Externe Fahrzeuge', render: (n) => c.vehicles.filter((v) => v.external?.neighborId === n.id).map((v) => v.callsign).join(', ') || <span className="dim">–</span> },
              { label: 'Hinweis', render: (n) => <span className="small muted">{n.note}</span> },
            ]}
            fields={[
              { key: 'name', label: 'Name', type: 'text', required: true },
              { key: 'note', label: 'Hinweis', type: 'textarea' },
              { key: 'position', label: 'Standort', type: 'latlng', required: true, center: c.mapCenter },
            ]}
            create={() => ({ id: newId('nb'), name: '', position: [...c.mapCenter], note: '' })}
            onSave={(n, isNew) => store.edit((_, g) => saveNeighbor(g, n, isNew) ?? undefined, 'Nachbarleitstelle gespeichert.')}
            onDelete={(n) => store.edit((_, g) => deleteNeighbor(g, n.id) ?? undefined, 'Nachbarleitstelle gelöscht.')}
            intro={
              <div className="small muted">
                Externe Einsatzmittel (z. B. Rettungshubschrauber) werden unter <b>Fahrzeuge</b> angelegt und dort einer Nachbarleitstelle zugeordnet. Sie erscheinen im Einsatzmittelvorschlag mit zusätzlichem Anforderungsverzug. Eine echte Kommunikation mit anderen Leitstellen findet nicht statt.
              </div>
            }
          />
        </div>
      )}
    </div>
  );
}
