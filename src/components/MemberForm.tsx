import { fmtInputDate } from "@/lib/utils-date";

type Opt = { id: string; name: string; abbreviation?: string | null };
export type MemberFormData = {
  firstName?: string; lastName?: string; displayName?: string; callSign?: string | null; rankId?: string | null;
  avatarUrl?: string | null; status?: string; joinedAt?: Date; notes?: string | null;
  unitIds?: string[]; primaryUnitId?: string; officeIds?: string[];
};

export function MemberForm({ ranks, units, offices, value = {}, submitLabel }: { ranks: Opt[]; units: Opt[]; offices: Opt[]; value?: MemberFormData; submitLabel: string }) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div><label className="label" htmlFor="firstName">Vorname</label><input id="firstName" name="firstName" className="input" required defaultValue={value.firstName} placeholder="Max" /></div>
        <div><label className="label" htmlFor="lastName">Nachname</label><input id="lastName" name="lastName" className="input" required defaultValue={value.lastName} placeholder="Mustermann" /></div>
        <div><label className="label" htmlFor="displayName">Anzeigename</label><input id="displayName" name="displayName" className="input" defaultValue={value.displayName} placeholder="Leer = Vorname Nachname" /></div>
        <div><label className="label" htmlFor="callSign">Funkrufname</label><input id="callSign" name="callSign" className="input" defaultValue={value.callSign ?? ""} placeholder="Florian Muster 11/01" /></div>
        <div><label className="label" htmlFor="rankId">Dienstgrad</label>
          <select id="rankId" name="rankId" className="input" defaultValue={value.rankId ?? ""}>
            <option value="">– keiner –</option>{ranks.map((r) => <option key={r.id} value={r.id}>{r.name}{r.abbreviation ? ` (${r.abbreviation})` : ""}</option>)}
          </select></div>
        <div><label className="label" htmlFor="status">Status</label>
          <select id="status" name="status" className="input" defaultValue={value.status ?? "AKTIV"}>
            <option value="AKTIV">Aktiv</option><option value="BEURLAUBT">Beurlaubt</option><option value="INAKTIV">Inaktiv</option>
          </select></div>
        <div><label className="label" htmlFor="joinedAt">Eintrittsdatum</label><input id="joinedAt" type="date" name="joinedAt" className="input" defaultValue={fmtInputDate(value.joinedAt ?? new Date())} /></div>
        <div><label className="label" htmlFor="avatarUrl">Profilbild-URL</label><input id="avatarUrl" type="url" name="avatarUrl" className="input" defaultValue={value.avatarUrl ?? ""} placeholder="https://…" /></div>
      </div>

      <div>
        <div className="label">Löschzüge / Gruppen</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {units.map((u) => (
            <label key={u.id} className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-white/10 px-3 text-sm has-[:checked]:border-fire-500/60 has-[:checked]:bg-fire-500/10">
              <input type="checkbox" name="unitIds" value={u.id} defaultChecked={value.unitIds?.includes(u.id)} className="h-5 w-5 accent-[#f03a2e]" />
              <span className="flex-1">{u.name}</span>
              <input type="radio" name="primaryUnitId" value={u.id} defaultChecked={value.primaryUnitId === u.id} title="Hauptzuordnung" className="h-4 w-4 accent-[#f03a2e]" />
            </label>
          ))}
        </div>
        <p className="hint">Mehrfachzuordnung möglich. Der Radio-Punkt markiert die Hauptzuordnung.</p>
      </div>

      <div>
        <div className="label">Ämter / Funktionen</div>
        <div className="grid gap-2 sm:grid-cols-3">
          {offices.map((o) => (
            <label key={o.id} className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-xl border border-white/10 px-3 text-sm has-[:checked]:border-fire-500/60 has-[:checked]:bg-fire-500/10">
              <input type="checkbox" name="officeIds" value={o.id} defaultChecked={value.officeIds?.includes(o.id)} className="h-5 w-5 accent-[#f03a2e]" />{o.name}
            </label>
          ))}
        </div>
      </div>

      <div><label className="label" htmlFor="notes">Interne Notizen</label><textarea id="notes" name="notes" className="input" defaultValue={value.notes ?? ""} /></div>
      <div className="flex justify-end"><button className="btn-primary">{submitLabel}</button></div>
    </div>
  );
}
