"use client";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";

export type PickItem = { id: string; label: string; sub?: string };

/** Suchbare Mehrfachauswahl. Gibt die Auswahl als versteckte Felder `name` an das Formular. */
export function MultiPick({
  name, items, initial = [], placeholder = "Mitglied suchen …", single = false,
}: { name: string; items: PickItem[]; initial?: string[]; placeholder?: string; single?: boolean }) {
  const [selected, setSelected] = useState<string[]>(initial);
  const [q, setQ] = useState("");
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const matches = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return items.filter((i) => !selected.includes(i.id) && (i.label + " " + (i.sub ?? "")).toLowerCase().includes(s)).slice(0, 8);
  }, [q, items, selected]);

  const add = (id: string) => { setSelected(single ? [id] : [...selected, id]); setQ(""); };
  return (
    <div>
      {selected.map((id) => <input key={id} type="hidden" name={name} value={id} />)}
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {selected.map((id) => (
            <span key={id} className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.05] py-1 pl-2.5 pr-1 text-xs text-slate-200">
              {byId.get(id)?.label ?? id}
              <button type="button" aria-label="Entfernen" onClick={() => setSelected(selected.filter((s) => s !== id))}
                className="grid h-6 w-6 place-items-center rounded-md hover:bg-white/10"><X className="h-3.5 w-3.5" /></button>
            </span>
          ))}
        </div>
      )}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input className="input pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} autoComplete="off" />
        {matches.length > 0 && (
          <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded-xl border border-white/10 bg-ink-800 p-1 shadow-2xl">
            {matches.map((m) => (
              <li key={m.id}>
                <button type="button" onClick={() => add(m.id)} className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-left text-sm hover:bg-white/[0.07]">
                  <span>{m.label}</span><span className="text-xs text-slate-500">{m.sub}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
