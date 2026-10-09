import { Crown, Users, Vote, BarChart3, Hourglass } from "lucide-react";
import { db } from "@/lib/db";
import { cn, pct } from "@/lib/utils";
import { leaders } from "@/lib/elections";
import { getEligibleMembers } from "@/lib/eligibility";

/**
 * Zeigt Ergebnisse abgeschlossener Wahlgänge (nur aggregierte Daten).
 * Während der Wahl: nur bereits beendete Wahlgänge. Nach der Wahl: Kennzahlen + alle Wahlgänge.
 */
export async function Results({ electionId }: { electionId: string }) {
  const election = await db.election.findUniqueOrThrow({
    where: { id: electionId },
    include: { positions: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], include: { results: { orderBy: { sortOrder: "asc" } } } } },
  });
  const ended = election.status === "ENDED";
  const eligible = election.eligibleSnapshot ?? (await getEligibleMembers(electionId)).length;
  const participants = election.participantsSnapshot ?? 0;
  const shown = election.positions.filter((p) => p.status === "CLOSED" || (ended && p.status === "PENDING"));

  return (
    <div className="space-y-6">
      {ended && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Kpi icon={<Users className="h-4 w-4" />} label="Wahlberechtigte" value={eligible} />
          <Kpi icon={<Vote className="h-4 w-4" />} label="Teilgenommen (mind. 1 Wahlgang)" value={participants} />
          <Kpi icon={<BarChart3 className="h-4 w-4" />} label="Beteiligung gesamt" value={`${pct(participants, eligible)} %`.replace(".", ",")} />
          <Kpi icon={<Users className="h-4 w-4" />} label="Nie abgestimmt" value={Math.max(0, eligible - participants)} />
        </div>
      )}

      {shown.length === 0 && <div className="card card-pad text-sm text-slate-400">Noch kein Wahlgang abgeschlossen.</div>}

      {shown.map((pos, idx) => {
        if (pos.status === "PENDING")
          return (
            <section key={pos.id} className="card card-pad opacity-70">
              <h3 className="text-lg font-bold text-white">{pos.title}</h3>
              <p className="mt-1 flex items-center gap-2 text-sm text-slate-400"><Hourglass className="h-4 w-4" /> Wahlgang wurde nicht durchgeführt.</p>
            </section>
          );
        const cands = pos.results.filter((r) => !r.isAbstention);
        const abst = pos.results.find((r) => r.isAbstention)?.votes ?? 0;
        const total = cands.reduce((s, r) => s + r.votes, 0) + abst;
        const lead = leaders(cands);
        const winnerId = pos.winnerCandidateId ?? (lead.length === 1 ? lead[0].candidateId : null);
        const tie = !winnerId && lead.length > 1;
        const sorted = [...cands].sort((a, b) => b.votes - a.votes);
        const part = pos.participantsSnapshot ?? 0;
        return (
          <section key={pos.id} className="card card-pad animate-fadeUp">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="card-title">Wahlgang {idx + 1}</div>
                <h3 className="text-lg font-bold text-white">{pos.title}</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {pos.winnerLabel && <span className="badge border-amber-500/30 bg-amber-500/10 text-amber-300"><Crown className="h-3.5 w-3.5" /> Gewählt: {pos.winnerLabel}{pos.tieDecided ? " (Entscheidung)" : ""}</span>}
                {tie && <span className="badge border-red-500/30 bg-red-500/10 text-red-300">Stimmengleichheit – keine Entscheidung</span>}
                {!winnerId && !tie && <span className="badge border-white/10 text-slate-400">Kein Gewinner</span>}
              </div>
            </div>
            <ul className="space-y-4">
              {sorted.map((r) => {
                const isWin = r.candidateId === winnerId;
                const p = pct(r.votes, total);
                return (
                  <li key={r.id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3">
                      <span className={cn("flex items-center gap-2 font-semibold", isWin ? "text-white" : "text-slate-300")}>
                        {isWin && <Crown className="h-4 w-4 text-amber-400" />}{r.label}
                      </span>
                      <span className="shrink-0 text-sm tabular-nums text-slate-400">
                        <b className="text-white">{r.votes}</b> {r.votes === 1 ? "Stimme" : "Stimmen"} · {p.toString().replace(".", ",")} %
                      </span>
                    </div>
                    <div className="h-3 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label={`${r.label}: ${p} Prozent`}>
                      <div className={cn("h-full rounded-full transition-all", isWin ? "bg-gradient-to-r from-fire-600 to-fire-400" : "bg-slate-500/70")} style={{ width: `${p}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 border-t border-white/[0.06] pt-3 text-xs text-slate-500">
              <span>Beteiligung: <b className="text-slate-300">{part}{eligible ? ` von ${eligible} (${pct(part, eligible).toString().replace(".", ",")} %)` : ""}</b></span>
              <span>Enthaltungen: <b className="text-slate-300">{abst}</b></span>
              <span>Ungültige Stimmen: <b className="text-slate-300">0</b></span>
            </div>
          </section>
        );
      })}
    </div>
  );
}

function Kpi({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-fire-400">{icon}<span className="card-title">{label}</span></div>
      <div className="mt-2 text-2xl font-bold text-white">{value}</div>
    </div>
  );
}
