import Link from "next/link";
import { CalendarClock, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isEligible } from "@/lib/eligibility";
import { fmtDateTime } from "@/lib/utils";
import { Flash, PageHeader, Pill, SecretBadge, StatusBadge } from "@/components/ui";

export const metadata = { title: "Wahlen" };

export default async function ElectionsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const manager = user.can("elections.view_all");
  const all = await db.election.findMany({
    where: { status: { notIn: ["ENDED", "CANCELLED"] }, ...(manager ? {} : { status: { in: ["SCHEDULED", "ACTIVE"] } }) },
    orderBy: [{ status: "asc" }, { startsAt: "asc" }],
    include: { _count: { select: { positions: true } } },
  });
  const rows = [];
  for (const e of all) {
    const eligible = user.firefighter ? await isEligible(e.id, user.firefighter.id) : false;
    if (!manager && !eligible) continue;
    const voted = user.firefighter ? !!(await db.electionVoter.findUnique({ where: { electionId_firefighterId: { electionId: e.id, firefighterId: user.firefighter.id } } })) : false;
    rows.push({ e, eligible, voted });
  }

  return (
    <>
      <PageHeader title="Wahlen" subtitle="Laufende, geplante und in Vorbereitung befindliche Wahlen. Abgeschlossene findest du in der Wahlhistorie."
        actions={user.can("elections.manage") && <Link href="/wahlen/neu" className="btn-primary"><Plus className="h-4 w-4" /> Neue Wahl</Link>} />
      <Flash error={sp.error} ok={sp.ok} />
      {rows.length === 0 ? (
        <div className="card card-pad text-center text-sm text-slate-400">Derzeit gibt es keine Wahlen für dich.</div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {rows.map(({ e, eligible, voted }) => (
            <Link key={e.id} href={`/wahlen/${e.id}`} className="card card-pad group transition hover:-translate-y-0.5 hover:border-white/20">
              <div className="flex items-start justify-between gap-3">
                <h2 className="text-lg font-bold text-white group-hover:text-fire-300">{e.name}</h2>
                <StatusBadge status={e.status} />
              </div>
              {e.description && <p className="mt-2 line-clamp-2 text-sm text-slate-400">{e.description}</p>}
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <SecretBadge secret={e.secret} />
                <Pill>{e._count.positions} {e._count.positions === 1 ? "Amt" : "Ämter"}</Pill>
                {e.status === "ACTIVE" && eligible && (voted ? <Pill tone="green">Abgestimmt</Pill> : <Pill tone="amber">Stimme offen</Pill>)}
              </div>
              <div className="mt-4 flex items-center gap-1.5 text-xs text-slate-500">
                <CalendarClock className="h-3.5 w-3.5" /> {fmtDateTime(e.startsAt)} – {fmtDateTime(e.endsAt)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
