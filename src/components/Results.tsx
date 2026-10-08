import { Crown, Users, Vote, BarChart3 } from "lucide-react";
import { db } from "@/lib/db";
import { cn, pct } from "@/lib/utils";
import { leaders } from "@/lib/elections";

/** Zeigt das eingefrorene Ergebnis einer beendeten Wahl (nur aggregierte Daten). */
export async function Results({ electionId }: { electionId: string }) {
  const election = await db.election.findUniqueOrThrow({
    where: { id: electionId },
    include: { positions: { orderBy: { sortOrder: "asc" }, include: { results: { orderBy: { sortOrder: "asc" } } } } },
  });
  const eligible = election.eligibleSnapshot ?? 0;
  const participants = election.participantsSnapshot ?? 0;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi icon={<Users className="h-4 w-4" />} label="Wahlberechtigte" value={eligible} />
        <Kpi icon={<Vote className="h-4 w-4" />} label="Abgegebene Stimmen" value={participants} />
        <Kpi icon={<BarChart3 className="h-4 w-4" />} label="Wahlbeteiligung" value={`${pct(participants, eligible)} %`} />
        <Kpi icon={<Users className="h-4 w-4" />} label="Nicht abgestimmt" value={Math.max(0, eligible - participants)} />
      </div>

      {election.positions.map((pos) => {
        const cands = pos.results.filter((r) => !r.isAbstention);
        const abst = pos.results.find((r) => r.isAbstention)?.votes ?? 0;
        const total = cands.reduce((s, r) => s + r.votes, 0) + abst;
        const win = leaders(cands);
        const sorted = [...cands].sort((a, b) => b.votes - a.votes);
        return (
          <section key={pos.id} className="card card-pad animate-fadeUp">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-bold text-white">{pos.title}</h3>
              {win.length > 1 && <span className="badge border-amber-500/30 bg-amber-500/10 text-amber-300">Stimmengleichheit</span>}
              {win.length === 0 && <span className="badge border-white/10 text-slate-400">Keine gültigen Stimmen</span>}
            </div>
            <ul className="space-y-4">
              {sorted.map((r) => {
                const isWin = win.some((w) => w.id === r.id);
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
              <span>Enthaltungen: <b className="text-slate-300">{abst}</b></span>
              <span>Gültige Stimmen: <b className="text-slate-300">{cands.reduce((s, r) => s + r.votes, 0)}</b></span>
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
