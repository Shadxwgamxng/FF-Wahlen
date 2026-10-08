import { Trash2 } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { createOffice, deleteOffice, updateOffice } from "@/actions/structure";
import { Flash, PageHeader, Pill } from "@/components/ui";

export const metadata = { title: "Ämter" };

export default async function Offices({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const user = await requirePermission("offices.view");
  const offices = await db.office.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { holders: { include: { firefighter: true } } } });
  const canEdit = user.can("offices.manage");
  return (
    <>
      <PageHeader title="Ämter" subtitle="Ämter sind frei konfigurierbar und können in Wahlen als zu besetzende Positionen verwendet werden." />
      <Flash error={sp.error} ok={sp.ok} />
      {canEdit && (
        <form action={createOffice} className="card card-pad mb-6 grid gap-3 md:grid-cols-[1fr_1.5fr_auto]">
          <input name="name" className="input" placeholder="Neues Amt, z. B. Atemschutzgerätewart" required />
          <input name="description" className="input" placeholder="Beschreibung (optional)" />
          <button className="btn-primary">Amt erstellen</button>
        </form>
      )}
      <div className="space-y-3">
        {offices.map((o) => (
          <div key={o.id} className="card card-pad">
            {canEdit ? (
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                <form action={updateOffice.bind(null, o.id)} className="grid flex-1 gap-3 md:grid-cols-[1fr_1.5fr_90px_auto_auto] md:items-end">
                  <div><label className="label">Name</label><input name="name" className="input" defaultValue={o.name} required /></div>
                  <div><label className="label">Beschreibung</label><input name="description" className="input" defaultValue={o.description ?? ""} /></div>
                  <div><label className="label">Reihenf.</label><input name="sortOrder" type="number" min={0} className="input" defaultValue={o.sortOrder} /></div>
                  <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={o.active} className="h-5 w-5 accent-[#f03a2e]" /> Aktiv</label>
                  <button className="btn-ghost">Speichern</button>
                </form>
                <form action={deleteOffice.bind(null, o.id)}><button className="btn-danger" data-confirm={`Amt „${o.name}“ löschen?`} aria-label="Löschen"><Trash2 className="h-4 w-4" /></button></form>
              </div>
            ) : (
              <div><div className="font-semibold text-white">{o.name}</div><div className="text-sm text-slate-400">{o.description}</div></div>
            )}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              {!o.active && <Pill tone="red">Deaktiviert</Pill>}
              {o.holders.length ? o.holders.map((h) => <Pill key={h.firefighterId}>{h.firefighter.displayName}</Pill>) : <span>Aktuell nicht besetzt</span>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
