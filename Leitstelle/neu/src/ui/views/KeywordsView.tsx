import { useState } from 'react';
import type { AaoRequirement, AaoRule, GameState, Keyword } from '../../model/types';
import { EntityEditor } from '../components/EntityEditor';
import { Tabs } from '../components/common';
import { store } from '../../store/gameStore';
import { newId } from '../../model/ids';
import { CATEGORY_LABELS } from '../../data/keywords';
import { CAPABILITIES } from '../../data/vehicleTypes';
import { deleteAao, deleteKeyword, saveAao, saveKeyword } from '../../sim/editorOps';
import { reqText } from '../../sim/engine';
import { capsOf } from '../../sim/dispatch';

export function RequirementsEditor({ value, onChange }: { value: AaoRequirement[]; onChange: (v: AaoRequirement[]) => void }) {
  return (
    <div className="col" style={{ gap: 4 }}>
      {value.map((r, i) => (
        <div key={i} className="row">
          <input type="number" min={1} max={20} value={r.count} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, count: Number(e.target.value) } : x)))} style={{ width: 64 }} aria-label="Anzahl" />
          <span>×</span>
          <select value={r.capability} onChange={(e) => onChange(value.map((x, j) => (j === i ? { ...x, capability: e.target.value } : x)))} aria-label="Fähigkeit">
            {Object.entries(CAPABILITIES).map(([k, l]) => (
              <option key={k} value={k}>{l}</option>
            ))}
            {!CAPABILITIES[r.capability] && <option value={r.capability}>{r.capability} (benutzerdefiniert)</option>}
          </select>
          <button className="btn small danger" onClick={() => onChange(value.filter((_, j) => j !== i))}>Entfernen</button>
        </div>
      ))}
      <button className="btn small" style={{ alignSelf: 'flex-start' }} onClick={() => onChange([...value, { capability: 'loeschen', count: 1 }])}>+ Anforderung</button>
    </div>
  );
}

export function KeywordsView({ game }: { game: GameState }) {
  const [tab, setTab] = useState<'kw' | 'aao' | 'caps'>('kw');
  const c = game.center;
  const provided = (cap: string) => c.vehicles.filter((v) => capsOf(game, v).includes(cap)).length;
  return (
    <div className="page">
      <Tabs tabs={[['kw', 'Einsatzstichwörter'], ['aao', 'AAO'], ['caps', 'Fähigkeiten']]} value={tab} onChange={setTab} />
      {tab === 'kw' && (
        <EntityEditor<Keyword>
          title="Einsatzstichwörter"
          items={c.keywords}
          searchText={(k) => `${k.code} | ${k.label}`}
          columns={[
            { label: 'Code', render: (k) => <b className="mono">{k.code}</b> },
            { label: 'Bezeichnung', render: (k) => k.label },
            { label: 'Kategorie', render: (k) => CATEGORY_LABELS[k.category] },
            { label: 'Priorität', render: (k) => <span className={`chip`} style={{ borderColor: `var(--prio${k.priority})` }}>P{k.priority}</span> },
            { label: 'AAO', render: (k) => <span className="small">{reqText(c.aao.find((a) => a.keywordId === k.id)?.requirements ?? []) || <span className="field-error">keine AAO</span>}</span> },
          ]}
          fields={[
            { key: 'code', label: 'Code', type: 'text', required: true, placeholder: 'B 3' },
            { key: 'label', label: 'Bezeichnung', type: 'text', required: true },
            { key: 'category', label: 'Kategorie', type: 'select', options: Object.entries(CATEGORY_LABELS), required: true },
            { key: 'priority', label: 'Priorität', type: 'select', options: [['1', '1 – Sonderrechte'], ['2', '2 – dringend'], ['3', '3 – nicht zeitkritisch']], required: true },
          ]}
          create={() => ({ id: newId('kw'), code: '', label: '', category: 'brand', priority: 2 })}
          duplicate={(k) => ({ ...k, id: newId('kw'), code: `${k.code} (Kopie)` })}
          onSave={(k, isNew) => store.edit((_, g) => saveKeyword(g, { ...k, priority: Number(k.priority) as 1 | 2 | 3 }, isNew) ?? undefined, 'Stichwort gespeichert.')}
          onDelete={(k) => store.edit((_, g) => deleteKeyword(g, k.id) ?? undefined, 'Stichwort gelöscht.')}
          deleteWarning={() => 'AAO-Regel wird mitgelöscht.'}
        />
      )}
      {tab === 'aao' && (
        <EntityEditor<AaoRule>
          title="AAO-Regeln"
          items={c.aao}
          searchText={(a) => {
            const k = c.keywords.find((x) => x.id === a.keywordId);
            return `${k?.code} | ${k?.label}`;
          }}
          columns={[
            { label: 'Stichwort', render: (a) => <b className="mono">{c.keywords.find((k) => k.id === a.keywordId)?.code}</b> },
            { label: 'Bezeichnung', render: (a) => c.keywords.find((k) => k.id === a.keywordId)?.label },
            { label: 'Einsatzmittel', render: (a) => reqText(a.requirements) || <span className="dim">–</span> },
            {
              label: 'Abdeckung',
              render: (a) => {
                const missing = a.requirements.filter((r) => provided(r.capability) < r.count);
                return missing.length ? <span className="field-error small">fehlt: {reqText(missing)}</span> : <span style={{ color: 'var(--ok)' }}>✓</span>;
              },
            },
            { label: 'Hinweis', render: (a) => <span className="small muted">{a.note}</span> },
          ]}
          fields={[
            { key: 'keywordId', label: 'Stichwort', type: 'select', options: c.keywords.map((k) => [k.id, `${k.code} – ${k.label}`]), required: true },
            { key: 'note', label: 'Hinweis', type: 'text' },
            { key: 'requirements', label: 'Einsatzmittel', type: 'custom', render: (d, set) => <RequirementsEditor value={d.requirements} onChange={(requirements) => set({ requirements })} /> },
          ]}
          create={() => ({ id: newId('aao'), keywordId: c.keywords.find((k) => !c.aao.some((a) => a.keywordId === k.id))?.id ?? '', requirements: [], note: '' })}
          onSave={(a, isNew) => store.edit((_, g) => saveAao(g, a, isNew) ?? undefined, 'AAO gespeichert.')}
          onDelete={(a) => store.edit((_, g) => deleteAao(g, a.id) ?? undefined, 'AAO-Regel gelöscht.')}
        />
      )}
      {tab === 'caps' && (
        <div className="card">
          <table className="grid">
            <thead>
              <tr><th>Fähigkeit</th><th>Kürzel</th><th>Fahrzeugtypen</th><th>Fahrzeuge</th></tr>
            </thead>
            <tbody>
              {Object.entries(CAPABILITIES).map(([k, l]) => (
                <tr key={k}>
                  <td>{l}</td>
                  <td className="mono small">{k}</td>
                  <td className="small">{c.vehicleTypes.filter((t) => t.capabilities.includes(k)).map((t) => t.code).join(', ')}</td>
                  <td>{provided(k)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
