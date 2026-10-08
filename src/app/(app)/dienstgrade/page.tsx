import { Trash2 } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { createRank, deleteRank, updateRank } from "@/actions/structure";
import { Flash, PageHeader } from "@/components/ui";

export const metadata = { title: "Dienstgrade" };

export default async function Ranks({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  await requirePermission("ranks.manage");
  const ranks = await db.rank.findMany({ orderBy: { sortOrder: "asc" }, include: { _count: { select: { firefighters: true } } } });
  return (
    <>
      <PageHeader title="Dienstgrade" subtitle="Aufsteigend nach Reihenfolge. Dienstgrade sind unabhängig von Ämtern." />
      <Flash error={sp.error} ok={sp.ok} />
      <form action={createRank} className="card card-pad mb-6 grid gap-3 md:grid-cols-[1fr_140px_auto]">
        <input name="name" className="input" placeholder="Neuer Dienstgrad" required />
        <input name="abbreviation" className="input" placeholder="Kürzel" maxLength={10} />
        <button className="btn-primary">Erstellen</button>
      </form>
      <div className="space-y-3">
        {ranks.map((r) => (
          <div key={r.id} className="card card-pad flex flex-col gap-3 lg:flex-row lg:items-end">
            <form action={updateRank.bind(null, r.id)} className="grid flex-1 gap-3 md:grid-cols-[1fr_120px_90px_auto_auto] md:items-end">
              <div><label className="label">Name ({r._count.firefighters} Mitglieder)</label><input name="name" className="input" defaultValue={r.name} required /></div>
              <div><label className="label">Kürzel</label><input name="abbreviation" className="input" defaultValue={r.abbreviation ?? ""} maxLength={10} /></div>
              <div><label className="label">Reihenf.</label><input name="sortOrder" type="number" min={0} className="input" defaultValue={r.sortOrder} /></div>
              <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={r.active} className="h-5 w-5 accent-[#f03a2e]" /> Aktiv</label>
              <button className="btn-ghost">Speichern</button>
            </form>
            <form action={deleteRank.bind(null, r.id)}><button className="btn-danger" data-confirm={`Dienstgrad „${r.name}“ löschen?`} aria-label="Löschen"><Trash2 className="h-4 w-4" /></button></form>
          </div>
        ))}
      </div>
    </>
  );
}
