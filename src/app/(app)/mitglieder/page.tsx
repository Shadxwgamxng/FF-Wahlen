import Link from "next/link";
import { Plus, Search, Link2, Link2Off } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { memberNo } from "@/lib/utils";
import { Avatar, Empty, Flash, PageHeader, Pill } from "@/components/ui";
import type { Prisma } from "@prisma/client";

export const metadata = { title: "Mitglieder" };

const STATUS = { AKTIV: ["Aktiv", "green"], BEURLAUBT: ["Beurlaubt", "amber"], INAKTIV: ["Inaktiv", "red"] } as const;
const SORTS: Record<string, Prisma.FirefighterOrderByWithRelationInput[]> = {
  name: [{ lastName: "asc" }, { firstName: "asc" }],
  rank: [{ rank: { sortOrder: "desc" } }, { lastName: "asc" }],
  joined: [{ joinedAt: "asc" }],
  number: [{ memberNumber: "asc" }],
};

export default async function MembersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const user = await requirePermission("members.view");
  const q = sp.q?.trim() ?? "";
  const where: Prisma.FirefighterWhereInput = {
    ...(q ? { OR: [
      { displayName: { contains: q, mode: "insensitive" } }, { firstName: { contains: q, mode: "insensitive" } },
      { lastName: { contains: q, mode: "insensitive" } }, { callSign: { contains: q, mode: "insensitive" } },
    ] } : {}),
    ...(sp.status && sp.status in STATUS ? { status: sp.status as keyof typeof STATUS } : {}),
    ...(sp.unit ? { units: { some: { unitId: sp.unit } } } : {}),
  };
  const [members, units] = await Promise.all([
    db.firefighter.findMany({ where, orderBy: SORTS[sp.sort ?? "name"] ?? SORTS.name, include: { rank: true, units: { include: { unit: true } }, user: { include: { discordAccount: true } } } }),
    db.fireUnit.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  return (
    <>
      <PageHeader title="Mitglieder" subtitle={`${members.length} Einträge`}
        actions={user.can("members.manage") && <Link href="/mitglieder/neu" className="btn-primary"><Plus className="h-4 w-4" /> Mitglied hinzufügen</Link>} />
      <Flash error={sp.error} ok={sp.ok} />
      <form className="card card-pad mb-4 grid gap-3 sm:grid-cols-[1fr_180px_180px_180px_auto]">
        <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input name="q" defaultValue={q} className="input pl-9" placeholder="Name oder Funkrufname suchen …" /></div>
        <select name="unit" defaultValue={sp.unit ?? ""} className="input"><option value="">Alle Löschzüge</option>{units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
        <select name="status" defaultValue={sp.status ?? ""} className="input"><option value="">Alle Status</option><option value="AKTIV">Aktiv</option><option value="BEURLAUBT">Beurlaubt</option><option value="INAKTIV">Inaktiv</option></select>
        <select name="sort" defaultValue={sp.sort ?? "name"} className="input"><option value="name">Sortierung: Name</option><option value="rank">Dienstgrad</option><option value="joined">Eintritt</option><option value="number">Mitgliedsnr.</option></select>
        <button className="btn-ghost">Filtern</button>
      </form>
      <div className="card overflow-hidden">
        {members.length === 0 ? <Empty>Keine Mitglieder gefunden.</Empty> : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Mitglied</th><th>Dienstgrad</th><th>Löschzug</th><th>Status</th><th>Discord</th></tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/mitglieder/${m.id}`} className="flex items-center gap-3">
                        <Avatar first={m.firstName} last={m.lastName} url={m.avatarUrl} />
                        <span><span className="block font-semibold text-white hover:text-fire-300">{m.displayName}</span>
                          <span className="block text-xs text-slate-500">{memberNo(m.memberNumber)}{m.callSign ? ` · ${m.callSign}` : ""}</span></span>
                      </Link>
                    </td>
                    <td>{m.rank?.abbreviation ?? m.rank?.name ?? "–"}</td>
                    <td>{m.units.map((u) => u.unit.name).join(", ") || "–"}</td>
                    <td><Pill tone={STATUS[m.status][1]}>{STATUS[m.status][0]}</Pill></td>
                    <td>{m.user?.discordAccount ? <span className="inline-flex items-center gap-1.5 text-emerald-300"><Link2 className="h-4 w-4" /> verknüpft</span> : <span className="inline-flex items-center gap-1.5 text-slate-500"><Link2Off className="h-4 w-4" /> offen</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
