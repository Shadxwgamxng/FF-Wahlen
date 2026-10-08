import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, Link2, Trash2, Unlink, KeyRound } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDate, memberNo } from "@/lib/utils";
import { createInvite, deleteMember, linkDiscordById, setMemberStatus, unlinkDiscord, updateMember } from "@/actions/members";
import { MemberForm } from "@/components/MemberForm";
import { Avatar, Flash, PageHeader, Pill } from "@/components/ui";

export const metadata = { title: "Mitglied" };

export default async function MemberPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; ok?: string; invite?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requirePermission("members.view");
  const m = await db.firefighter.findUnique({
    where: { id },
    include: { rank: true, units: true, offices: true, user: { include: { role: true, discordAccount: true } } },
  });
  if (!m) notFound();
  const [ranks, units, offices] = await Promise.all([
    db.rank.findMany({ where: { OR: [{ active: true }, { id: m.rankId ?? "" }] }, orderBy: { sortOrder: "asc" } }),
    db.fireUnit.findMany({ where: { OR: [{ active: true }, { id: { in: m.units.map((u) => u.unitId) } }] }, orderBy: { sortOrder: "asc" } }),
    db.office.findMany({ where: { OR: [{ active: true }, { id: { in: m.offices.map((o) => o.officeId) } }] }, orderBy: { sortOrder: "asc" } }),
  ]);
  const canEdit = user.can("members.manage");
  const canDiscord = user.can("members.discord");
  const h = await headers();
  const origin = process.env.APP_URL ?? `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;
  const da = m.user?.discordAccount;

  return (
    <>
      <Link href="/mitglieder" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white"><ArrowLeft className="h-4 w-4" /> Alle Mitglieder</Link>
      <PageHeader eyebrow={memberNo(m.memberNumber)} title={m.displayName} subtitle={`${m.firstName} ${m.lastName}${m.callSign ? " · " + m.callSign : ""} · Eintritt ${fmtDate(m.joinedAt)}`}
        actions={<Avatar first={m.firstName} last={m.lastName} url={m.avatarUrl} size={56} />} />
      <Flash error={sp.error} ok={sp.ok} />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="card card-pad">
          <div className="card-title mb-4">Stammdaten</div>
          {canEdit ? (
            <form action={updateMember.bind(null, id)}>
              <MemberForm ranks={ranks} units={units} offices={offices} submitLabel="Änderungen speichern" value={{
                ...m, unitIds: m.units.map((u) => u.unitId), primaryUnitId: m.units.find((u) => u.isPrimary)?.unitId,
                officeIds: m.offices.map((o) => o.officeId),
              }} />
            </form>
          ) : (
            <dl className="grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Dienstgrad</dt><dd className="text-white">{m.rank?.name ?? "–"}</dd></div>
              <div><dt className="text-slate-500">Status</dt><dd className="text-white">{m.status}</dd></div>
            </dl>
          )}
        </section>

        <aside className="space-y-6">
          <section className="card card-pad">
            <div className="card-title mb-4">Discord-Verknüpfung</div>
            {da ? (
              <div className="space-y-3">
                <Pill tone="green"><Link2 className="h-3.5 w-3.5" /> Verknüpft</Pill>
                <div className="text-sm text-slate-400">Discord-ID: <code className="rounded bg-white/[0.06] px-1.5 py-0.5 text-slate-200">{da.discordId}</code></div>
                <div className="text-xs text-slate-500">Rolle: {m.user?.role.name}. Der Discord-Name dient nur der Anmeldung und wird nicht als Feuerwehrname verwendet.</div>
                {canDiscord && <form action={unlinkDiscord.bind(null, id)}><button className="btn-danger btn-sm" data-confirm="Verknüpfung entfernen? Das Mitglied kann sich dann nicht mehr anmelden."><Unlink className="h-3.5 w-3.5" /> Verknüpfung lösen</button></form>}
              </div>
            ) : canDiscord ? (
              <div className="space-y-5">
                <Pill>Nicht verknüpft</Pill>
                <div>
                  <form action={createInvite.bind(null, id)}><button className="btn-primary w-full"><KeyRound className="h-4 w-4" /> Verknüpfungslink erzeugen</button></form>
                  <p className="hint">Das Mitglied öffnet den Link und authentifiziert sich per Discord (7 Tage gültig, einmalig).</p>
                  {sp.invite && (
                    <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3">
                      <div className="mb-1 text-xs text-emerald-200">Link an das Mitglied senden:</div>
                      <input readOnly className="input !min-h-[40px] font-mono text-xs" value={`${origin}/link/${sp.invite}`} />
                    </div>
                  )}
                </div>
                <form action={linkDiscordById.bind(null, id)} className="space-y-2 border-t border-white/[0.06] pt-4">
                  <label className="label" htmlFor="discordId">… oder Discord-ID direkt eintragen</label>
                  <input id="discordId" name="discordId" className="input font-mono" inputMode="numeric" placeholder="123456789012345678" required />
                  <button className="btn-ghost w-full">Verknüpfen</button>
                </form>
              </div>
            ) : <Pill>Nicht verknüpft</Pill>}
          </section>

          {canEdit && (
            <section className="card card-pad">
              <div className="card-title mb-4">Status</div>
              <form action={setMemberStatus.bind(null, id)} className="flex gap-2">
                <select name="status" className="input" defaultValue={m.status}><option value="AKTIV">Aktiv</option><option value="BEURLAUBT">Beurlaubt</option><option value="INAKTIV">Inaktiv</option></select>
                <button className="btn-ghost">Setzen</button>
              </form>
              <p className="hint">Nur aktive Mitglieder sind wahlberechtigt.</p>
            </section>
          )}

          {user.can("members.delete") && (
            <section className="card card-pad border-red-500/20">
              <div className="card-title mb-3 text-red-300">Gefahrenzone</div>
              <form action={deleteMember.bind(null, id)}>
                <button className="btn-danger" data-confirm={`Mitglied „${m.displayName}“ endgültig löschen?`}><Trash2 className="h-4 w-4" /> Mitglied löschen</button>
              </form>
            </section>
          )}
        </aside>
      </div>
    </>
  );
}
