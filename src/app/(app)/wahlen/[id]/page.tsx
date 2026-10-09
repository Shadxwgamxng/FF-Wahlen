import Link from "next/link";
import { notFound } from "next/navigation";
import { BadgeCheck, Ban, CalendarClock, CheckCircle2, Circle, Hourglass, Lock, PlayCircle, Settings2, ShieldCheck } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { loadElectionForUser } from "@/lib/access";
import { db } from "@/lib/db";
import { cn, fmtDateTime } from "@/lib/utils";
import { submitBallot } from "@/actions/elections";
import { BallotForm } from "@/components/BallotForm";
import { Countdown } from "@/components/Countdown";
import { Results } from "@/components/Results";
import { Flash, PageHeader, Pill, SecretBadge, StatusBadge } from "@/components/ui";

export default async function ElectionPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser();
  const data = await loadElectionForUser(user, id);
  if (!data) notFound();
  const { election: e, eligible, voted, manager, openPosition } = data;

  const resultsAllowed = e.resultsPublic || user.can("elections.results");
  const hasClosed = e.positions.some((p) => p.status === "CLOSED");
  const canSeeResults = resultsAllowed && (e.status === "ENDED" || (e.status === "ACTIVE" && hasClosed));
  const canSeeVotes = !e.secret && user.can("elections.view_votes") && ["ACTIVE", "ENDED"].includes(e.status);
  const publicVotes = canSeeVotes
    ? await db.vote.findMany({
        where: { electionId: id },
        orderBy: [{ castAt: "asc" }],
        include: { voter: true, position: true, candidate: { include: { firefighter: true } } },
      })
    : [];
  const myVoteAt = voted && user.firefighter && openPosition
    ? (await db.electionVoter.findUnique({ where: { positionId_firefighterId: { positionId: openPosition.id, firefighterId: user.firefighter.id } } }))?.votedAt
    : null;

  const showBallot = e.status === "ACTIVE" && eligible && !voted && !!openPosition;
  const openIdx = openPosition ? e.positions.findIndex((p) => p.id === openPosition.id) : -1;
  const openCands = openPosition?.candidates.filter((c) => !c.withdrawn) ?? [];

  return (
    <>
      <PageHeader eyebrow="Wahl" title={e.name} subtitle={e.description ?? undefined}
        actions={manager && user.can("elections.manage") && (
          <Link href={`/wahlen/${id}/verwalten`} className="btn-ghost"><Settings2 className="h-4 w-4" /> Verwalten</Link>
        )} />
      <Flash error={sp.error} ok={sp.ok} />

      <div className="mb-6 flex flex-wrap items-center gap-2">
        <StatusBadge status={e.status} /><SecretBadge secret={e.secret} />
        <Pill><CalendarClock className="h-3.5 w-3.5" /> {fmtDateTime(e.startsAt)} – {fmtDateTime(e.endsAt)}</Pill>
        {e.status === "ACTIVE" && <Pill tone="green">Endet in <Countdown to={e.endsAt.toISOString()} className="font-mono" /></Pill>}
      </div>

      {e.secret && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] p-4 text-sm text-amber-100/90">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <span>Geheime Wahl: Es wird nur gespeichert, <b>dass</b> abgestimmt wurde – nicht, <b>wie</b>.</span>
        </div>
      )}

      {/* Ablauf der Wahlgänge */}
      {e.positions.length > 0 && e.status !== "DRAFT" && (
        <ol className="mb-6 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {e.positions.map((p, i) => {
            const Icon = p.status === "CLOSED" ? CheckCircle2 : p.status === "OPEN" ? PlayCircle : Circle;
            return (
              <li key={p.id} className={cn("flex items-center gap-3 rounded-xl border p-3 text-sm",
                p.status === "OPEN" ? "border-fire-500/50 bg-fire-500/10" : "border-white/[0.07] bg-white/[0.02]")}>
                <Icon className={cn("h-5 w-5 shrink-0", p.status === "CLOSED" ? "text-emerald-400" : p.status === "OPEN" ? "text-fire-400" : "text-slate-600")} />
                <div className="min-w-0">
                  <div className="text-[11px] uppercase tracking-wider text-slate-500">Wahlgang {i + 1}</div>
                  <div className="truncate font-semibold text-white">{p.title}</div>
                  {p.status === "CLOSED" && resultsAllowed && <div className="truncate text-xs text-slate-400">{p.winnerLabel ? `Gewählt: ${p.winnerLabel}` : "kein Gewinner"}</div>}
                  {p.status === "OPEN" && <div className="text-xs text-fire-300">läuft jetzt</div>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {e.status === "CANCELLED" && (
        <div className="card card-pad mb-6 flex items-start gap-3 border-red-500/30">
          <Ban className="mt-0.5 h-5 w-5 text-red-400" />
          <div><div className="font-semibold text-white">Diese Wahl wurde abgebrochen.</div>{e.cancelReason && <p className="mt-1 text-sm text-slate-400">Grund: {e.cancelReason}</p>}</div>
        </div>
      )}

      {openPosition && voted && (
        <div className="card card-pad mb-6 flex items-center gap-3 border-emerald-500/30">
          <BadgeCheck className="h-6 w-6 shrink-0 text-emerald-400" />
          <div><div className="font-semibold text-white">Du hast im Wahlgang „{openPosition.title}“ abgestimmt.</div>
            <div className="text-sm text-slate-400">Abgegeben am {fmtDateTime(myVoteAt)}. Sobald der nächste Wahlgang beginnt, kannst du hier erneut abstimmen.</div></div>
        </div>
      )}
      {e.status === "ACTIVE" && !eligible && user.firefighter && (
        <div className="card card-pad mb-6 text-sm text-slate-400"><Lock className="mr-2 inline h-4 w-4" />Du bist für diese Wahl nicht wahlberechtigt.</div>
      )}
      {e.status === "ACTIVE" && !openPosition && (
        <div className="card card-pad mb-6 text-sm text-slate-400"><Hourglass className="mr-2 inline h-4 w-4" />Gerade läuft kein Wahlgang.</div>
      )}

      {showBallot && openPosition && (
        <div className="mb-8">
          <div className="mb-3 text-sm text-slate-400">Wahlgang {openIdx + 1} von {e.positions.length}</div>
          <BallotForm secret={e.secret} action={submitBallot.bind(null, id)}
            position={{
              id: openPosition.id, title: openPosition.title,
              candidates: openCands.map((c) => ({ id: c.id, name: c.firefighter.displayName, sub: c.firefighter.rank?.name, statement: c.statement })),
            }} />
        </div>
      )}

      {canSeeResults && <Results electionId={id} />}

      {!showBallot && !canSeeResults && e.status !== "CANCELLED" && (
        <div className="grid gap-4 md:grid-cols-2">
          {e.positions.map((p) => (
            <section key={p.id} className="card card-pad">
              <h3 className="mb-3 font-bold text-white">{p.title}</h3>
              <ul className="space-y-2">
                {p.candidates.map((c) => (
                  <li key={c.id} className={cn("rounded-lg bg-white/[0.03] px-3 py-2 text-sm", c.withdrawn && "opacity-50")}>
                    <div className={cn("font-medium text-slate-200", c.withdrawn && "line-through")}>{c.firefighter.displayName} <span className="text-xs text-slate-500">{c.firefighter.rank?.abbreviation}</span></div>
                    {c.withdrawn && <div className="text-xs text-slate-500">{c.withdrawnNote}</div>}
                    {c.statement && !c.withdrawn && <div className="mt-0.5 text-xs italic text-slate-500">„{c.statement}“</div>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {e.status === "ENDED" && !resultsAllowed && <div className="card card-pad text-sm text-slate-400">Das Ergebnis wird nicht veröffentlicht.</div>}
        </div>
      )}

      {canSeeVotes && (
        <section className="card mt-8 overflow-hidden">
          <div className="border-b border-white/[0.07] p-5"><h2 className="font-bold text-white">Einzelstimmen (öffentliche Wahl)</h2>
            <p className="mt-1 text-xs text-slate-500">Nur für berechtigte Administratoren sichtbar.</p></div>
          <div className="overflow-x-auto">
            <table className="tbl"><thead><tr><th>Mitglied</th><th>Amt</th><th>Stimme</th><th>Zeitpunkt</th></tr></thead>
              <tbody>
                {publicVotes.map((v) => (
                  <tr key={v.id}>
                    <td>{v.voter?.displayName ?? "(gelöscht)"}</td><td>{v.position.title}</td>
                    <td>{v.abstain ? <span className="text-slate-500">Enthaltung</span> : (v.candidate?.firefighter.displayName ?? "–")}</td>
                    <td className="whitespace-nowrap text-slate-400">{fmtDateTime(v.castAt)}</td>
                  </tr>
                ))}
                {publicVotes.length === 0 && <tr><td colSpan={4} className="py-8 text-center text-slate-500">Noch keine Stimmen.</td></tr>}
              </tbody></table>
          </div>
        </section>
      )}
    </>
  );
}
