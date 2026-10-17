import { useMemo, useState, type ReactNode } from 'react';
import { confirmDialog, Modal } from './common';
import { LatLngPicker } from './LatLngPicker';
import type { LatLng } from '../../model/types';

/**
 * Generischer, deklarativer CRUD-Editor (Liste + Formular) für alle Stammdaten.
 * Bietet Suchen, Anlegen, Bearbeiten, Duplizieren, Löschen (mit Bestätigung),
 * Formularvalidierung und Schutz vor Verlust ungespeicherter Eingaben.
 */

export type FieldDef<T> =
  | { key: keyof T & string; label: string; type: 'text' | 'textarea' | 'color'; required?: boolean; placeholder?: string; help?: string }
  | { key: keyof T & string; label: string; type: 'number'; required?: boolean; min?: number; max?: number; step?: number; help?: string }
  | { key: keyof T & string; label: string; type: 'select'; options: [string, string][]; required?: boolean; help?: string }
  | { key: keyof T & string; label: string; type: 'multi'; options: [string, string][]; help?: string }
  | { key: keyof T & string; label: string; type: 'checkbox'; help?: string }
  | { key: keyof T & string; label: string; type: 'latlng'; required?: boolean; help?: string; center?: LatLng }
  | { key: string; label: string; type: 'custom'; render: (draft: T, set: (patch: Partial<T>) => void) => ReactNode; help?: string };

export interface Column<T> {
  label: string;
  render: (item: T) => ReactNode;
  className?: string;
}

interface Props<T extends { id: string }> {
  title: string;
  items: T[];
  columns: Column<T>[];
  fields: FieldDef<T>[];
  searchText: (item: T) => string;
  create: () => T;
  onSave: (item: T, isNew: boolean) => string | null;
  onDelete?: (item: T) => string | null;
  /** Hinweis vor dem Löschen (z. B. abhängige Fahrzeuge) */
  deleteWarning?: (item: T) => string | null;
  duplicate?: (item: T) => T;
  validate?: (draft: T, isNew: boolean) => Record<string, string | undefined>;
  toolbar?: ReactNode;
  rowClass?: (item: T) => string;
  intro?: ReactNode;
}

export function EntityEditor<T extends { id: string }>(p: Props<T>) {
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<{ draft: T; isNew: boolean; original: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return s ? p.items.filter((i) => p.searchText(i).toLowerCase().includes(s)) : p.items;
  }, [q, p]);

  const open = (draft: T, isNew: boolean) => {
    const copy = structuredClone(draft);
    setEdit({ draft: copy, isNew, original: JSON.stringify(copy) });
    setErrors({});
  };

  const set = (patch: Partial<T>) => setEdit((e) => (e ? { ...e, draft: { ...e.draft, ...patch } } : e));

  const validateDraft = (d: T, isNew: boolean) => {
    const errs: Record<string, string> = {};
    for (const f of p.fields) {
      if (f.type === 'custom' || f.type === 'checkbox' || f.type === 'multi') continue;
      const v = (d as Record<string, unknown>)[f.key];
      if ('required' in f && f.required && (v === undefined || v === null || (typeof v === 'string' && !v.trim()))) errs[f.key] = 'Pflichtfeld';
      if (f.type === 'number' && v !== undefined && v !== null && v !== '') {
        const n = Number(v);
        if (!Number.isFinite(n)) errs[f.key] = 'Keine gültige Zahl';
        else if (f.min !== undefined && n < f.min) errs[f.key] = `Mindestens ${f.min}`;
        else if (f.max !== undefined && n > f.max) errs[f.key] = `Höchstens ${f.max}`;
      }
      if (f.type === 'latlng' && v) {
        const [a, b] = v as LatLng;
        if (!Number.isFinite(a) || !Number.isFinite(b) || Math.abs(a) > 90 || Math.abs(b) > 180) errs[f.key] = 'Ungültige Koordinaten';
      }
    }
    for (const [k, v] of Object.entries(p.validate?.(d, isNew) ?? {})) if (v) errs[k] = v;
    return errs;
  };

  const save = () => {
    if (!edit) return;
    const errs = validateDraft(edit.draft, edit.isNew);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const err = p.onSave(edit.draft, edit.isNew);
    if (!err) setEdit(null);
  };

  const cancel = async () => {
    if (edit && JSON.stringify(edit.draft) !== edit.original) {
      if (!(await confirmDialog('Ungespeicherte Änderungen verwerfen?', { confirmLabel: 'Verwerfen' }))) return;
    }
    setEdit(null);
  };

  const remove = async (item: T) => {
    const warn = p.deleteWarning?.(item);
    const ok = await confirmDialog(`"${p.searchText(item).split('|')[0].trim()}" wirklich löschen?${warn ? `\n\n${warn}` : ''}\n\nDiese Aktion kann nicht rückgängig gemacht werden.`, { confirmLabel: 'Löschen' });
    if (ok) p.onDelete?.(item);
  };

  return (
    <div className="col" style={{ gap: 10 }}>
      <div className="row wrap">
        <h2 className="grow">{p.title} <span className="count">{p.items.length}</span></h2>
        <input type="search" placeholder="Suchen …" value={q} onChange={(e) => setQ(e.target.value)} aria-label={`${p.title} durchsuchen`} />
        {p.toolbar}
        <button className="btn primary" onClick={() => open(p.create(), true)}>+ Neu</button>
      </div>
      {p.intro}
      <div className="card" style={{ padding: 0, overflow: 'auto', maxHeight: 'calc(100vh - 240px)' }}>
        <table className="grid">
          <thead>
            <tr>
              {p.columns.map((c) => (
                <th key={c.label}>{c.label}</th>
              ))}
              <th className="right">Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id} className={p.rowClass?.(item)}>
                {p.columns.map((c) => (
                  <td key={c.label} className={c.className}>
                    {c.render(item)}
                  </td>
                ))}
                <td className="right nowrap">
                  <button className="btn small" onClick={() => open(item, false)}>Bearbeiten</button>{' '}
                  {p.duplicate && (
                    <button className="btn small" onClick={() => open(p.duplicate!(item), true)} title="Als Kopie anlegen">Duplizieren</button>
                  )}{' '}
                  {p.onDelete && (
                    <button className="btn small danger" onClick={() => remove(item)}>Löschen</button>
                  )}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={p.columns.length + 1} className="empty">{p.items.length ? 'Keine Treffer.' : 'Noch keine Einträge – mit „+ Neu“ anlegen.'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {edit && (
        <Modal
          title={`${p.title}: ${edit.isNew ? 'Neu anlegen' : 'Bearbeiten'}`}
          onClose={cancel}
          wide
          footer={
            <>
              {Object.keys(errors).length > 0 && <span className="field-error grow">Bitte die markierten Felder korrigieren.</span>}
              <button className="btn" onClick={cancel}>Abbrechen</button>
              <button className="btn primary" onClick={save}>Speichern</button>
            </>
          }
        >
          <div className="form-grid">
            {p.fields.map((f) => (
              <FieldInput key={f.key} field={f} draft={edit.draft} set={set} error={errors[f.key]} />
            ))}
          </div>
          {errors._ && <div className="errbox">{errors._}</div>}
        </Modal>
      )}
    </div>
  );
}

function FieldInput<T>({ field: f, draft, set, error }: { field: FieldDef<T>; draft: T; set: (p: Partial<T>) => void; error?: string }) {
  const v = (draft as Record<string, unknown>)[f.key];
  const upd = (val: unknown) => set({ [f.key]: val } as Partial<T>);
  const req = 'required' in f && f.required;
  const wide = f.type === 'textarea' || f.type === 'multi' || f.type === 'latlng' || f.type === 'custom';
  let input: ReactNode;
  switch (f.type) {
    case 'text':
      input = <input type="text" className={error ? 'invalid' : ''} value={String(v ?? '')} placeholder={f.placeholder} onChange={(e) => upd(e.target.value)} />;
      break;
    case 'textarea':
      input = <textarea rows={3} className={error ? 'invalid' : ''} value={String(v ?? '')} onChange={(e) => upd(e.target.value)} />;
      break;
    case 'color':
      input = <input type="color" value={String(v ?? '#888888')} onChange={(e) => upd(e.target.value)} style={{ height: 30, width: 60, padding: 0, background: 'none', border: 'none' }} />;
      break;
    case 'number':
      input = (
        <input
          type="number"
          className={error ? 'invalid' : ''}
          value={v === undefined || v === null ? '' : String(v)}
          min={f.min}
          max={f.max}
          step={f.step ?? 1}
          onChange={(e) => upd(e.target.value === '' ? '' : Number(e.target.value))}
        />
      );
      break;
    case 'select':
      input = (
        <select className={error ? 'invalid' : ''} value={String(v ?? '')} onChange={(e) => upd(e.target.value)}>
          {!req && <option value="">– keine –</option>}
          {req && !v && <option value="">– bitte wählen –</option>}
          {f.options.map(([k, l]) => (
            <option key={k} value={k}>{l}</option>
          ))}
        </select>
      );
      break;
    case 'multi': {
      const arr = (v as string[]) ?? [];
      input = (
        <div className="row wrap" style={{ maxHeight: 160, overflow: 'auto', padding: 6, border: '1px solid var(--line)', borderRadius: 6 }}>
          {f.options.map(([k, l]) => (
            <label key={k} className="check small" style={{ minWidth: 180 }}>
              <input type="checkbox" checked={arr.includes(k)} onChange={(e) => upd(e.target.checked ? [...arr, k] : arr.filter((x) => x !== k))} /> {l}
            </label>
          ))}
        </div>
      );
      break;
    }
    case 'checkbox':
      input = (
        <label className="check">
          <input type="checkbox" checked={Boolean(v)} onChange={(e) => upd(e.target.checked)} /> aktiv
        </label>
      );
      break;
    case 'latlng':
      input = <LatLngPicker value={(v as LatLng) ?? null} onChange={(ll) => upd(ll)} center={f.center} invalid={Boolean(error)} />;
      break;
    case 'custom':
      input = f.render(draft, set);
      break;
  }
  // Komplexe Felder enthalten eigene Bedienelemente und dürfen nicht in ein <label> geschachtelt werden
  const Wrap = f.type === 'multi' || f.type === 'custom' || f.type === 'latlng' || f.type === 'checkbox' ? 'div' : 'label';
  return (
    <Wrap className="field" style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <span className={req ? 'req' : ''}>{f.label}</span>
      {input}
      {f.help && <span className="dim small">{f.help}</span>}
      {error && <span className="field-error">{error}</span>}
    </Wrap>
  );
}
