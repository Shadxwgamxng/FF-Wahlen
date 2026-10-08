import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Trash2, UserMinus, UserPlus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { addUnitMembers, deleteUnit, removeUnitMember, updateUnit } from "@/actions/structure";
import { MultiPick } from "@/components/MultiPick";
import { Avatar, Flash, PageHeader, Pill } from "@/components/ui";

export const metadata = { title: "Löschzug" };

export default async function UnitPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("units.view");
  const unit = await db.fireUnit.findUnique({
    where: { id },
    include: { members: { include: { firefighter: { include: { rank: true, offices: { include: { office: true } } } } } } },
  });
  if (!unit) notFound();
  const all = await db.firefighter.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }] });
  const memberIds = new Set(unit.members.map((m) => m.firefighterId));
  const canEdit = user.can("units.manage");
  const members = [...unit.members].sort((a, b) => a.firefighter.lastName.localeCompare(b.firefighter.lastName));

  return (
    <>
      <Link href="/loeschzuege" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Alle Löschzüge</Link>
      <PageHeader eyebrow={unit.kind === "FUNKTION" ? "Sonderfunktion" : "Löschzug"} title={unit.name} subtitle={unit.description ?? undefined}
        actions={!unit.active && <Pill tone="red">Deaktiviert</Pill>} />
      <Flash error={sp.error} ok={sp.ok} />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <section className="card overflow-hidden">
          <div className="border-b border-white/[0.07] p-5"><h2 className="font-bold text-white">Mitglieder ({members.length})</h2></div>
          <ul className="divide-y divide-white/[0.05]">
            {members.map(({ firefighter: f, isPrimary }) => (
              <li key={f.id} className="flex items-center gap-3 px-5 py-3">
                <Avatar first={f.firstName} last={f.lastName} url={f.avatarUrl} />
                <div className="min-w-0 flex-1">
                  <Link href={user.can("members.view") ? `/mitglieder/${f.id}` : "#"} className="block truncate font-semibold text-white">{f.displayName}{unit.leaderId === f.id && <span className="ml-2 text-xs text-amber-300">Zugführer</span>}</Link>
                  <div className="truncate text-xs text-slate-500">{f.rank?.name ?? "–"}{f.offices.length ? " · " + f.offices.map((o) => o.office.name).join(", ") : ""}{isPrimary ? " · Hauptzuordnung" : ""}</div>
                </div>
                {canEdit && <form action={removeUnitMember.bind(null, id, f.id)}><button className="grid h-10 w-10 place-items-center rounded-lg text-slate-400 hover:bg-white/10 hover:text-red-300" aria-label="Entfernen"><UserMinus className="h-4 w-4" /></button></form>}
              </li>
            ))}
            {members.length === 0 && <li className="px-5 py-8 text-center text-sm text-slate-500">Keine Mitglieder zugeordnet.</li>}
          </ul>
        </section>

        {canEdit && (
          <aside className="space-y-6">
            <form action={addUnitMembers.bind(null, id)} className="card card-pad space-y-3">
              <div className="card-title">Mitglieder zuordnen</div>
              <MultiPick name="memberIds" items={all.filter((m) => !memberIds.has(m.id)).map((m) => ({ id: m.id, label: m.displayName }))} />
              <button className="btn-primary w-full"><UserPlus className="h-4 w-4" /> Zuordnen</button>
            </form>
            <form action={updateUnit.bind(null, id)} className="card card-pad space-y-3">
              <div className="card-title">Einstellungen</div>
              <div><label className="label">Name</label><input name="name" className="input" defaultValue={unit.name} required /></div>
              <div><label className="label">Beschreibung</label><textarea name="description" className="input" defaultValue={unit.description ?? ""} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Art</label><select name="kind" className="input" defaultValue={unit.kind}><option value="LOESCHZUG">Löschzug</option><option value="FUNKTION">Sonderfunktion</option></select></div>
                <div><label className="label">Reihenfolge</label><input name="sortOrder" type="number" min={0} className="input" defaultValue={unit.sortOrder} /></div>
              </div>
              <div><label className="label">Zugführer</label>
                <select name="leaderId" className="input" defaultValue={unit.leaderId ?? ""}><option value="">– keiner –</option>{members.map(({ firefighter: f }) => <option key={f.id} value={f.id}>{f.displayName}</option>)}</select></div>
              <label className="flex min-h-[44px] items-center gap-3 text-sm"><input type="checkbox" name="active" defaultChecked={unit.active} className="h-5 w-5 accent-[#f03a2e]" /> Aktiv</label>
              <button className="btn-primary w-full">Speichern</button>
            </form>
            <form action={deleteUnit.bind(null, id)} className="card card-pad border-red-500/20">
              <button className="btn-danger w-full" data-confirm={`„${unit.name}“ löschen? Zuordnungen und Wahl-Berechtigungen für diese Gruppe entfallen.`}><Trash2 className="h-4 w-4" /> Löschen</button>
            </form>
          </aside>
        )}
      </div>
    </>
  );
}
