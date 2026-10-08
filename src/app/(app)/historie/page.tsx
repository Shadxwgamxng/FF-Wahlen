import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, pct } from "@/lib/utils";
import { PageHeader, Pill, SecretBadge, StatusBadge, Empty } from "@/components/ui";

export const metadata = { title: "Wahlhistorie" };

export default async function History() {
  await requireUser();
  const items = await db.election.findMany({
    where: { status: { in: ["ENDED", "CANCELLED"] } },
    orderBy: { endsAt: "desc" },
  });
  return (
    <>
      <PageHeader title="Wahlhistorie" subtitle="Alle abgeschlossenen und abgebrochenen Wahlen. Bei geheimen Wahlen sind keine Einzelstimmen einsehbar." />
      <div className="card overflow-hidden">
        {items.length === 0 ? <Empty>Noch keine abgeschlossenen Wahlen.</Empty> : (
          <ul className="divide-y divide-white/[0.06]">
            {items.map((e) => (
              <li key={e.id}>
                <Link href={`/wahlen/${e.id}`} className="flex flex-col gap-3 p-5 transition hover:bg-white/[0.03] sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="font-semibold text-white">{e.name}</div>
                    <div className="mt-1 text-sm text-slate-500">{fmtDate(e.endedAt ?? e.endsAt)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={e.status} /><SecretBadge secret={e.secret} />
                    {e.status === "ENDED" && e.eligibleSnapshot != null && (
                      <Pill>Wahlbeteiligung {pct(e.participantsSnapshot ?? 0, e.eligibleSnapshot).toString().replace(".", ",")} %</Pill>
                    )}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
