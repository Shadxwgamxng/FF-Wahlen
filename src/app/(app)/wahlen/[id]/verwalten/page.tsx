import Link from "next/link";
import { notFound } from "next/navigation";
import { AlertTriangle, ArrowDown, ArrowLeft, ArrowUp, Ban, ChevronsRight, CheckCircle2, Play, Rocket, Square, Trash2, Undo2, UserPlus, X } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { getEligibleMembers, loadEligibilityConfig, resolveEligibility } from "@/lib/eligibility";
import { cn, fmtDateTime, toLocalInput } from "@/lib/utils";
import {
  addCandidates, addPosition, advanceRound, cancelElection, deleteElection, endElection, publishElection, removeCandidate,
  movePosition, removePosition, saveEligibility, startElection, unpublishElection, updateElection,
} from "@/actions/elections";
import { ElectionGeneralFields } from "@/components/ElectionGeneralFields";
import { MultiPick } from "@/components/MultiPick";
import { Avatar, Flash, PageHeader, Pill, SecretBadge, StatusBadge } from "@/components/ui";

export const metadata = { title: "Wahl verwalten" };

export default async function ManageElection({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("elections.manage", "elections.control", "elections.view_all");
  const e = await db.election.findUnique({
    where: { id },
    include: {
      positions: { orderBy: { sortOrder: "asc" }, include: { candidates: { orderBy: { sortOrder: "asc" }, include: { firefighter: { include: { rank: true } } } } } },
    },
  });
  if (!e) notFound();

  const [members, units, offices, cfg, eligible, voters] = await Promise.all([
    db.firefighter.findMany({ orderBy: [{ lastName: "asc" }, { firstName: "asc" }], include: { units: true, rank: true } }),
    db.fireUnit.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    db.office.findMany({ where: { active: true }, orderBy: { sortOrder: "asc" } }),
    loadEligibilityConfig(id),
    getEligibleMembers(id),
    db.electionVoter.findMany({ where: { electionId: id, position: { status: "OPEN" } }, include: { firefighter: true }, orderBy: { votedAt: "asc" } }),
  ]);

  const draft = e.status === "DRAFT";
  const canEdit = draft && user.can("elections.manage");
  const canControl = user.can("elections.control");
  const items = members.map((m) => ({ id: m.id, label: m.displayName, sub: m.rank?.abbreviation ?? undefined }));
  const votedIds = new Set(voters.map((v) => v.firefighterId));
  const notVoted = eligible.filter((m) => !votedIds.has(m.id));
  const openPos = e.positions.find((p) => p.status === "OPEN");
  const openIdx = openPos ? e.positions.indexOf(openPos) : -1;
  const nextPos = e.positions.slice(openIdx + 1).find((p) => p.status === "PENDING");
  // Person → Titel aller Ämter, für die sie kandidiert (für den Hinweis „kandidiert auch für …“)
  const alsoFor = new Map<string, string[]>();
  for (const p of e.positions) for (const c of p.candidates) alsoFor.set(c.firefighterId, [...(alsoFor.get(c.firefighterId) ?? []), p.title]);

  return (
    <>
      <Link href={`/wahlen/${id}`} className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Zur Wahlansicht</Link>
      <PageHeader eyebrow="Wahl verwalten" title={e.name} actions={<><StatusBadge status={e.status} /><SecretBadge secret={e.secret} /></>} />
      <Flash error={sp.error} ok={sp.ok} />

      {/* Status & Aktionen */}
      <section className="card card-pad mb-6">
        <div className="card-title mb-3">Ablauf</div>
        <ol className="mb-5 grid grid-cols-5 gap-1 text-center text-[11px] font-semibold uppercase tracking-wider sm:text-xs">
          {(["DRAFT", "SCHEDULED", "ACTIVE", "ENDED"] as const).map((s, i) => {
            const order = { DRAFT: 0, SCHEDULED: 1, ACTIVE: 2, ENDED: 3, CANCELLED: 3 }[e.status];
            return <li key={s} className={`col-span-1 rounded-lg px-1 py-2 ${i <= order && e.status !== "CANCELLED" ? "bg-fire-500/15 text-fire-300" : "bg-white/[0.03] text-slate-500"}`}>{["Entwurf", "Geplant", "Aktiv", "Beendet"][i]}</li>;
          })}
          <li className={`rounded-lg px-1 py-2 ${e.status === "CANCELLED" ? "bg-red-500/15 text-red-300" : "bg-white/[0.03] text-slate-500"}`}>Abbruch</li>
        </ol>
        {canControl && (
          <div className="flex flex-wrap gap-2">
            {draft && <form action={publishElection.bind(null, id)}><button className="btn-primary"><Rocket className="h-4 w-4" /> Veröffentlichen</button></form>}
            {draft && <form action={startElection.bind(null, id)}><button className="btn-ghost" data-confirm="Wahl jetzt sofort starten?"><Play className="h-4 w-4" /> Sofort starten</button></form>}
            {e.status === "SCHEDULED" && <form action={unpublishElection.bind(null, id)}><button className="btn-ghost"><Undo2 className="h-4 w-4" /> Zurück in Entwurf</button></form>}
            {e.status === "SCHEDULED" && <form action={startElection.bind(null, id)}><button className="btn-primary" data-confirm="Wahl jetzt sofort starten?"><Play className="h-4 w-4" /> Jetzt starten</button></form>}
            {e.status === "ACTIVE" && <form action={endElection.bind(null, id)}><button className="btn-primary" data-confirm="Wahl jetzt beenden und Ergebnis berechnen?"><Square className="h-4 w-4" /> Wahl beenden</button></form>}
            {(e.status === "SCHEDULED" || e.status === "ACTIVE") && (
              <form action={cancelElection.bind(null, id)} className="flex flex-1 flex-wrap gap-2">
                <input name="reason" className="input min-w-[200px] flex-1" placeholder="Grund des Abbruchs (optional)" />
                <button className="btn-danger" data-confirm="Wahl wirklich abbrechen?"><Ban className="h-4 w-4" /> Abbrechen</button>
              </form>
            )}
          </div>
        )}
        {canControl && e.status === "ACTIVE" && (
          <form action={advanceRound.bind(null, id)} className="mt-4 rounded-xl border border-fire-500/30 bg-fire-500/[0.06] p-4">
            {openPos ? (
              <>
                <div className="text-sm text-slate-300">Läuft: <b className="text-white">Wahlgang {openIdx + 1} – {openPos.title}</b>. Danach {nextPos ? <>folgt <b className="text-white">{nextPos.title}</b>.</> : "endet die Wahl."}</div>
                <p className="hint">Wird ein Kandidat gewählt, der auch für spätere Ämter kandidiert, wird er dort automatisch zurückgezogen.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <select name="tieWinner" className="input min-w-[240px] flex-1" defaultValue="">
                    <option value="">Bei Stimmengleichheit: Abschluss verweigern</option>
                    {openPos.candidates.filter((c) => !c.withdrawn).map((c) => <option key={c.id} value={c.id}>Bei Gleichstand entscheidet: {c.firefighter.displayName}</option>)}
                  </select>
                  <button className="btn-primary" data-confirm={`Wahlgang „${openPos.title}“ jetzt abschließen?`}><ChevronsRight className="h-4 w-4" /> Wahlgang abschließen</button>
                </div>
              </>
            ) : <div className="text-sm text-slate-400">Kein Wahlgang offen.</div>}
          </form>
        )}
        {!draft && <p className="hint mt-3">Ämter, Kandidaten und Wahlberechtigung sind nur im Entwurf bearbeitbar.{e.status === "SCHEDULED" && " Setze die Wahl zurück in den Entwurf, um sie zu ändern."}</p>}
      </section>

      {/* Allgemein */}
      <section className="card card-pad mb-6">
        <div className="card-title mb-4">Allgemeine Informationen</div>
        <form action={updateElection.bind(null, id)} className="space-y-5">
          <ElectionGeneralFields disabled={!canEdit} defaults={{
            name: e.name, description: e.description, startsAt: toLocalInput(e.startsAt), endsAt: toLocalInput(e.endsAt),
            type: e.secret ? "secret" : "public", resultsPublic: e.resultsPublic,
          }} />
          {canEdit && <div className="flex justify-end"><button className="btn-primary">Speichern</button></div>}
        </form>
      </section>

      {/* Ämter & Kandidaten */}
      <section className="card card-pad mb-6">
        <div className="card-title mb-4">Ämter & Kandidaten</div>
        <div className="space-y-5">
          {e.positions.length === 0 && <p className="text-sm text-slate-500">Noch keine Ämter hinzugefügt.</p>}
          {e.positions.length > 1 && <p className="text-xs text-slate-500">Die Ämter werden nacheinander gewählt – in dieser Reihenfolge. Wer in einem Wahlgang gewählt wird, wird aus den späteren Ämtern automatisch zurückgezogen.</p>}
          {e.positions.map((p, pi) => (
            <div key={p.id} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-bold text-white"><span className="mr-2 text-fire-400">{pi + 1}.</span>{p.title}
                  {p.status === "OPEN" && <Pill tone="green">läuft</Pill>}{p.status === "CLOSED" && <Pill>abgeschlossen{p.winnerLabel ? ` · ${p.winnerLabel}` : ""}</Pill>}</h3>
                <div className="flex items-center gap-1">
                {canEdit && e.positions.length > 1 && <>
                  <form action={movePosition.bind(null, id, p.id, "up")}><button disabled={pi === 0} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-white/10 disabled:opacity-30" aria-label="Nach oben"><ArrowUp className="h-4 w-4" /></button></form>
                  <form action={movePosition.bind(null, id, p.id, "down")}><button disabled={pi === e.positions.length - 1} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-white/10 disabled:opacity-30" aria-label="Nach unten"><ArrowDown className="h-4 w-4" /></button></form>
                </>}
                {canEdit && <form action={removePosition.bind(null, id, p.id)}><button className="btn-ghost btn-sm text-red-300" data-confirm={`Amt „${p.title}“ samt Kandidaten entfernen?`}><Trash2 className="h-3.5 w-3.5" /> Amt entfernen</button></form>}
                </div>
              </div>
              <ul className="mb-3 space-y-2">
                {p.candidates.map((c) => (
                  <li key={c.id} className={cn("flex items-start gap-3 rounded-lg bg-ink-900/60 p-2.5", c.withdrawn && "opacity-50")}>
                    <Avatar first={c.firefighter.firstName} last={c.firefighter.lastName} size={32} />
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-sm font-semibold text-white", c.withdrawn && "line-through")}>{c.firefighter.displayName}</div>
                      {c.withdrawn && <div className="text-xs text-amber-300">Zurückgezogen: {c.withdrawnNote}</div>}
                      {(alsoFor.get(c.firefighterId)?.length ?? 0) > 1 && !c.withdrawn && <div className="text-xs text-sky-300">kandidiert auch für: {alsoFor.get(c.firefighterId)!.filter((t) => t !== p.title).join(", ")}</div>}
                      {c.statement && <div className="text-xs italic text-slate-400">„{c.statement}“</div>}
                    </div>
                    {canEdit && <form action={removeCandidate.bind(null, id, c.id)}><button className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-white/10" aria-label="Kandidat entfernen"><X className="h-4 w-4" /></button></form>}
                  </li>
                ))}
                {p.candidates.length === 0 && <li className="text-xs text-amber-300">Noch keine Kandidaten.</li>}
              </ul>
              {canEdit && (
                <form action={addCandidates.bind(null, id, p.id)} className="grid gap-2 sm:grid-cols-[1.4fr_1fr_auto]">
                  <MultiPick name="firefighterIds" items={items.filter((i) => !p.candidates.some((c) => c.firefighterId === i.id))} placeholder="Kandidaten suchen – mehrere möglich …" />
                  <input name="statement" className="input" maxLength={300} placeholder="Vorstellung (nur bei einer Person)" />
                  <button className="btn-primary"><UserPlus className="h-4 w-4" /> Hinzufügen</button>
                </form>
              )}
            </div>
          ))}
          {canEdit && (
            <form action={addPosition.bind(null, id)} className="grid gap-2 border-t border-white/[0.06] pt-5 sm:grid-cols-[1fr_1fr_auto]">
              <select name="officeId" className="input" defaultValue="">
                <option value="">Amt aus Liste wählen …</option>
                {offices.filter((o) => !e.positions.some((p) => p.officeId === o.id)).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <input name="title" className="input" placeholder="… oder eigene Bezeichnung (z. B. Vertrauensfrage)" />
              <button className="btn-primary">Amt hinzufügen</button>
            </form>
          )}
        </div>
      </section>

      {/* Wahlberechtigung */}
      <section className="card card-pad mb-6">
        <div className="card-title mb-1">Wahlberechtigung</div>
        <p className="mb-4 text-xs text-slate-500">Priorität: 1. Ausschluss · 2. Einzelberechtigung · 3. Löschzug · 4. keine Berechtigung. Nur aktive Mitglieder können abstimmen.</p>
        <form action={saveEligibility.bind(null, id)} className="space-y-5">
          <fieldset disabled={!canEdit} className="space-y-5 disabled:opacity-70">
            <div>
              <div className="label">Wahlberechtigte Gruppen</div>
              <div className="grid gap-2 sm:grid-cols-3">
                {units.map((u) => (
                  <label key={u.id} className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border border-white/10 px-3 text-sm has-[:checked]:border-fire-500/60 has-[:checked]:bg-fire-500/10">
                    <input type="checkbox" name="unitIds" value={u.id} defaultChecked={cfg.unitIds.has(u.id)} className="h-5 w-5 accent-[#f03a2e]" />
                    {u.name}
                  </label>
                ))}
              </div>
            </div>
            <div><div className="label">Einzelne Mitglieder zusätzlich berechtigen</div><MultiPick name="includeIds" items={items} initial={[...cfg.includeIds]} /></div>
            <div><div className="label text-red-300">Ausnahmen – von der Wahl ausschließen</div><MultiPick name="excludeIds" items={items} initial={[...cfg.excludeIds]} placeholder="Mitglied ausschließen …" /></div>
          </fieldset>
          {canEdit && <div className="flex justify-end"><button className="btn-primary">Wahlberechtigung speichern</button></div>}
        </form>
        <details className="mt-5 rounded-xl border border-white/[0.07] bg-white/[0.02]">
          <summary className="cursor-pointer px-4 py-3 text-sm font-semibold text-white">Vorschau: {eligible.length} Wahlberechtigte</summary>
          <ul className="grid gap-1 px-4 pb-4 text-sm text-slate-300 sm:grid-cols-2">
            {members.map((m) => {
              const r = resolveEligibility({ id: m.id, status: m.status, unitIds: m.units.map((u) => u.unitId) }, cfg);
              if (r.reason === "NONE") return null;
              return (
                <li key={m.id} className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 hover:bg-white/[0.04]">
                  <span>{m.displayName}</span>
                  <span className="text-xs">{r.eligible ? <Pill tone="green">{r.reason === "INCLUDED" ? "einzeln" : "Gruppe"}</Pill> : <Pill tone="red">{r.reason === "EXCLUDED" ? "ausgeschlossen" : "inaktiv"}</Pill>}</span>
                </li>
              );
            })}
          </ul>
        </details>
      </section>

      {/* Beteiligung */}
      {openPos && (
        <section className="card card-pad mb-6">
          <div className="card-title mb-1">Beteiligung{openPos ? ` – Wahlgang ${openIdx + 1}: ${openPos.title}` : ""}</div>
          <p className="mb-4 text-xs text-slate-500">{e.secret ? "Geheime Wahl: Es wird nur angezeigt, wer abgestimmt hat – nicht wie." : "Öffentliche Wahl."}</p>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><CheckCircle2 className="h-4 w-4 text-emerald-400" /> Abgestimmt ({voters.length})</div>
              <ul className="space-y-1 text-sm">
                {voters.map((v) => <li key={v.id} className="flex justify-between rounded-lg bg-white/[0.03] px-3 py-1.5"><span>{v.firefighter.displayName}</span><span className="text-xs text-slate-500">{fmtDateTime(v.votedAt)}</span></li>)}
                {voters.length === 0 && <li className="text-slate-500">Noch niemand.</li>}
              </ul>
            </div>
            <div>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-white"><AlertTriangle className="h-4 w-4 text-amber-400" /> Noch offen ({notVoted.length})</div>
              <ul className="space-y-1 text-sm">
                {notVoted.map((m) => <li key={m.id} className="rounded-lg bg-white/[0.03] px-3 py-1.5">{m.displayName}</li>)}
              </ul>
            </div>
          </div>
        </section>
      )}

      {user.can("elections.delete") && e.status !== "ACTIVE" && (
        <section className="card card-pad border-red-500/20">
          <div className="card-title mb-3 text-red-300">Gefahrenzone</div>
          <form action={deleteElection.bind(null, id)}>
            <button className="btn-danger" data-confirm="Wahl samt allen Stimmen und Ergebnissen unwiderruflich löschen?"><Trash2 className="h-4 w-4" /> Wahl löschen</button>
          </form>
        </section>
      )}
    </>
  );
}
