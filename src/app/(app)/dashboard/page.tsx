import Link from "next/link";
import { ArrowRight, Award, BadgeCheck, CalendarClock, Truck, Users, Vote, History, ScrollText } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { db } from "@/lib/db";
import { isEligible } from "@/lib/eligibility";
import { votedInOpenRound } from "@/lib/access";
import { fmtDateTime } from "@/lib/utils";
import { Countdown } from "@/components/Countdown";
import { Flash, PageHeader, Pill, SecretBadge, Stat, StatusBadge } from "@/components/ui";

export const metadata = { title: "Dashboard" };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const ff = user.firefighter;
  const manager = user.can("elections.view_all");

  const candidates = await db.election.findMany({
    where: { status: { in: ["ACTIVE", "SCHEDULED"] } },
    orderBy: { endsAt: "asc" },
  });
  const mine = [];
  for (const e of candidates) {
    const eligible = ff ? await isEligible(e.id, ff.id) : false;
    if (!eligible && !manager) continue;
    const voted = ff ? await votedInOpenRound(e.id, ff.id) : false;
    mine.push({ e, eligible, voted });
  }
  const active = mine.filter((m) => m.e.status === "ACTIVE");
  const upcoming = mine.filter((m) => m.e.status === "SCHEDULED");

  const showStats = user.can("members.view") || user.can("units.view") || user.can("elections.view_all");
  const stats = showStats
    ? await Promise.all([
        db.firefighter.count(), db.firefighter.count({ where: { status: "AKTIV" } }), db.fireUnit.count({ where: { active: true } }),
        db.election.count({ where: { status: "ACTIVE" } }), db.election.count({ where: { status: { in: ["ENDED", "CANCELLED"] } } }),
      ])
    : null;

  const primaryUnit = ff?.units.find((u) => u.isPrimary)?.unit ?? ff?.units[0]?.unit;

  return (
    <>
      <PageHeader eyebrow="Leitstelle" title={`Willkommen zurück, ${ff?.firstName ?? user.name}`}
        subtitle={ff ? `${ff.rank?.name ?? "Feuerwehrmitglied"}${primaryUnit ? " · " + primaryUnit.name : ""}` : `Angemeldet als ${user.role.name}`} />
      <Flash error={sp.error} ok={sp.ok} />

      {stats && (
        <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Mitglieder" value={stats[0]} icon={<Users className="h-4 w-4" />} />
          <Stat label="Aktive Mitglieder" value={stats[1]} icon={<BadgeCheck className="h-4 w-4" />} />
          <Stat label="Löschzüge" value={stats[2]} icon={<Truck className="h-4 w-4" />} />
          <Stat label="Aktive Wahlen" value={stats[3]} icon={<Vote className="h-4 w-4" />} />
          <Stat label="Vergangene Wahlen" value={stats[4]} icon={<History className="h-4 w-4" />} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section className="space-y-4">
          <h2 className="card-title">Aktive Wahlen</h2>
          {active.length === 0 && (
            <div className="card card-pad text-sm text-slate-400">Aktuell läuft keine Wahl, an der du teilnehmen kannst.</div>
          )}
          {active.map(({ e, eligible, voted }) => (
            <div key={e.id} className="card card-pad relative overflow-hidden animate-fadeUp">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-white">{e.name}</h3>
                  <div className="mt-2 flex flex-wrap gap-2"><StatusBadge status={e.status} /><SecretBadge secret={e.secret} /></div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">Endet in</div>
                  <Countdown to={e.endsAt.toISOString()} className="font-mono text-2xl font-bold text-white" />
                </div>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                {eligible && !voted && <Link href={`/wahlen/${e.id}`} className="btn-primary w-full sm:w-auto">Jetzt abstimmen <ArrowRight className="h-4 w-4" /></Link>}
                {eligible && voted && <Pill tone="green"><BadgeCheck className="h-3.5 w-3.5" /> Du hast in diesem Wahlgang abgestimmt</Pill>}
                {!eligible && <Pill>Nicht wahlberechtigt</Pill>}
                {(!eligible || voted) && <Link href={`/wahlen/${e.id}`} className="btn-ghost btn-sm">Details</Link>}
              </div>
            </div>
          ))}

          {upcoming.length > 0 && (
            <>
              <h2 className="card-title pt-4">Geplante Wahlen</h2>
              {upcoming.map(({ e }) => (
                <Link key={e.id} href={`/wahlen/${e.id}`} className="card card-pad flex items-center justify-between gap-3 transition hover:border-white/20">
                  <div>
                    <div className="font-semibold text-white">{e.name}</div>
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-slate-400"><CalendarClock className="h-3.5 w-3.5" /> Start {fmtDateTime(e.startsAt)}</div>
                  </div>
                  <StatusBadge status={e.status} />
                </Link>
              ))}
            </>
          )}
        </section>

        <aside className="space-y-4">
          <h2 className="card-title">Meine Informationen</h2>
          <div className="card card-pad space-y-4">
            {ff ? (
              <>
                <Info icon={<Truck className="h-4 w-4" />} label="Löschzug"
                  value={ff.units.map((u) => u.unit.name).join(", ") || "–"} />
                <Info icon={<Award className="h-4 w-4" />} label="Dienstgrad" value={ff.rank?.name ?? "–"} />
                <Info icon={<BadgeCheck className="h-4 w-4" />} label="Funktion"
                  value={ff.offices.map((o) => o.office.name).join(", ") || "–"} />
                {ff.callSign && <Info icon={<ScrollText className="h-4 w-4" />} label="Funkrufname" value={ff.callSign} />}
              </>
            ) : (
              <p className="text-sm text-slate-400">Dein Konto ist keinem Feuerwehrmitglied zugeordnet (Administrator-Zugang).</p>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}

function Info({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-fire-500/10 text-fire-400">{icon}</div>
      <div className="min-w-0">
        <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
        <div className="truncate font-semibold text-white">{value}</div>
      </div>
    </div>
  );
}
