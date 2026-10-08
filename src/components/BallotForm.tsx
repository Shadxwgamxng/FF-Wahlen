"use client";
import { useState } from "react";
import { ArrowLeft, Check, Lock, ShieldAlert } from "lucide-react";
import { cn } from "@/lib/utils";

type Cand = { id: string; name: string; sub?: string; statement?: string | null };
type Pos = { id: string; title: string; candidates: Cand[] };

/**
 * Zweistufige Stimmabgabe: Auswahl → Zusammenfassung → endgültig abgeben.
 * Die Auswahl existiert nur im Browser, bis das Formular abgeschickt wird.
 */
export function BallotForm({ positions, secret, action }: { positions: Pos[]; secret: boolean; action: (fd: FormData) => Promise<void> }) {
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [step, setStep] = useState<"pick" | "review">("pick");
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const complete = positions.every((p) => choice[p.id]);

  const label = (p: Pos) => {
    const c = choice[p.id];
    return c === "ABSTAIN" ? "Enthaltung" : (p.candidates.find((x) => x.id === c)?.name ?? "–");
  };

  if (step === "review") {
    return (
      <form action={async (fd) => { setPending(true); await action(fd); }} className="space-y-5">
        {positions.map((p) => <input key={p.id} type="hidden" name={`pos_${p.id}`} value={choice[p.id]} />)}
        <input type="hidden" name="confirm" value={confirmed ? "yes" : "no"} />
        <div className="card card-pad">
          <div className="card-title mb-4">Zusammenfassung deiner Stimme</div>
          <dl className="divide-y divide-white/[0.06]">
            {positions.map((p) => (
              <div key={p.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between">
                <dt className="text-sm text-slate-400">{p.title}</dt>
                <dd className={cn("font-semibold", choice[p.id] === "ABSTAIN" ? "text-slate-300" : "text-white")}>{label(p)}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-100">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0" />
          <span>Nach der Bestätigung kann deine Stimme <b>nicht mehr geändert</b> werden.{secret && " Die Wahl ist geheim – deine Entscheidung wird niemals mit deinem Namen gespeichert."}</span>
        </div>
        <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} className="h-5 w-5 accent-[#f03a2e]" />
          Ich habe meine Auswahl geprüft und möchte sie endgültig abgeben.
        </label>
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-between">
          <button type="button" onClick={() => setStep("pick")} className="btn-ghost"><ArrowLeft className="h-4 w-4" /> Zurück</button>
          <button type="submit" disabled={!confirmed || pending} className="btn-primary sm:min-w-[260px]"><Lock className="h-4 w-4" /> Stimme endgültig abgeben</button>
        </div>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      {positions.map((p) => (
        <fieldset key={p.id} className="card card-pad">
          <legend className="sr-only">{p.title}</legend>
          <h3 className="mb-4 text-lg font-bold text-white">{p.title}</h3>
          <div className="space-y-2.5">
            {[...p.candidates, { id: "ABSTAIN", name: "Enthaltung", sub: "Ich möchte mich bei diesem Amt enthalten." } as Cand].map((c) => {
              const on = choice[p.id] === c.id;
              return (
                <label key={c.id} className={cn(
                  "flex min-h-[60px] cursor-pointer items-center gap-4 rounded-xl border p-4 transition active:scale-[0.99]",
                  on ? "border-fire-500/70 bg-fire-500/10 shadow-[0_0_0_1px_rgba(240,58,46,.4)]" : "border-white/10 bg-white/[0.02] hover:border-white/25",
                  c.id === "ABSTAIN" && "border-dashed",
                )}>
                  <input type="radio" name={`p_${p.id}`} className="sr-only" checked={on} onChange={() => setChoice({ ...choice, [p.id]: c.id })} />
                  <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full border-2", on ? "border-fire-500 bg-fire-500" : "border-slate-500")}>
                    {on && <Check className="h-3.5 w-3.5 text-white" />}
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block font-semibold", c.id === "ABSTAIN" ? "text-slate-300" : "text-white")}>{c.name}</span>
                    {c.sub && <span className="block text-xs text-slate-500">{c.sub}</span>}
                    {c.statement && <span className="mt-1.5 block text-sm italic text-slate-400">„{c.statement}“</span>}
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <button type="button" disabled={!complete} onClick={() => { setStep("review"); window.scrollTo({ top: 0, behavior: "smooth" }); }}
        className="btn-primary w-full sm:w-auto sm:min-w-[260px]">
        Weiter zur Zusammenfassung
      </button>
      {!complete && <p className="hint">Bitte triff für jedes Amt eine Auswahl.</p>}
    </div>
  );
}
