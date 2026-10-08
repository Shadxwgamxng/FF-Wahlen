import Link from "next/link";
import { Plus, Truck } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { createUnit } from "@/actions/structure";
import { Flash, PageHeader, Pill } from "@/components/ui";

export const metadata = { title: "Löschzüge" };

export default async function Units({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const user = await requirePermission("units.view");
  const units = await db.fireUnit.findMany({ orderBy: [{ sortOrder: "asc" }, { name: "asc" }], include: { leader: true, _count: { select: { members: true } } } });
  return (
    <>
      <PageHeader title="Löschzüge" subtitle="Löschzüge und Sonderfunktionen sind frei konfigurierbar und dienen u. a. der Wahlberechtigung." />
      <Flash error={sp.error} ok={sp.ok} />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {units.map((u) => (
          <Link key={u.id} href={`/loeschzuege/${u.id}`} className="card card-pad group transition hover:-translate-y-0.5 hover:border-white/20">
            <div className="flex items-start justify-between">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-fire-500/10 text-fire-400"><Truck className="h-5 w-5" /></div>
              {!u.active && <Pill tone="red">Deaktiviert</Pill>}
              {u.kind === "FUNKTION" && <Pill tone="blue">Sonderfunktion</Pill>}
            </div>
            <h2 className="mt-4 text-lg font-bold text-white group-hover:text-fire-300">{u.name}</h2>
            <p className="mt-1 text-sm text-slate-400">{u.leader ? `Zugführer: ${u.leader.displayName}` : "Kein Zugführer festgelegt"}</p>
            <p className="mt-3 text-xs text-slate-500">{u._count.members} Mitglieder</p>
          </Link>
        ))}
      </div>
      {user.can("units.manage") && (
        <form action={createUnit} className="card card-pad mt-6 grid gap-3 sm:grid-cols-[1fr_200px_auto]">
          <input name="name" className="input" placeholder="Neuer Löschzug / neue Gruppe, z. B. Löschzug 41" required />
          <select name="kind" className="input"><option value="LOESCHZUG">Löschzug</option><option value="FUNKTION">Sonderfunktion</option></select>
          <button className="btn-primary"><Plus className="h-4 w-4" /> Anlegen</button>
        </form>
      )}
    </>
  );
}
