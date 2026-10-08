import { Trash2 } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { PERMISSIONS, SUPERADMIN_ROLE_KEY } from "@/lib/permissions";
import { addSuperadminByDiscord, createRole, deleteRole, updateRole, updateUserAccess } from "@/actions/admin";
import { Flash, PageHeader, Pill } from "@/components/ui";

export const metadata = { title: "Benutzer & Rollen" };

const groups = [...new Set(PERMISSIONS.map((p) => p.group))];

export default async function UsersAdmin({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  const sp = await searchParams;
  const me = await requirePermission("users.manage");
  const [users, roles] = await Promise.all([
    db.user.findMany({ orderBy: { createdAt: "asc" }, include: { role: true, firefighter: true, discordAccount: true, extraPermissions: true } }),
    db.role.findMany({ orderBy: { name: "asc" }, include: { permissions: true, _count: { select: { users: true } } } }),
  ]);
  const roleOpts = roles.filter((r) => r.key !== SUPERADMIN_ROLE_KEY || me.isSuperadmin);

  return (
    <>
      <PageHeader title="Benutzer & Rollen" subtitle="Website-Benutzer, ihre Rollen und Berechtigungen. Mitglieder ohne Discord-Verknüpfung erscheinen hier nicht." />
      <Flash error={sp.error} ok={sp.ok} />

      <section className="mb-10">
        <h2 className="card-title mb-3">Benutzer ({users.length})</h2>
        <div className="space-y-3">
          {users.map((u) => (
            <form key={u.id} action={updateUserAccess.bind(null, u.id)} className="card card-pad">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                <div className="min-w-0 lg:w-64">
                  <div className="truncate font-semibold text-white">{u.firefighter?.displayName ?? "Kein Mitgliedsprofil"}</div>
                  <div className="truncate text-xs text-slate-500">Discord: {u.discordAccount?.username} · {u.discordAccount?.discordId}</div>
                </div>
                <div className="flex flex-1 flex-wrap items-center gap-3">
                  <select name="roleId" defaultValue={u.roleId} className="input !w-auto min-w-[200px]">
                    {roleOpts.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    {!roleOpts.some((r) => r.id === u.roleId) && <option value={u.roleId}>{u.role.name}</option>}
                  </select>
                  <label className="flex min-h-[44px] items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={u.active} className="h-5 w-5 accent-[#f03a2e]" /> Aktiv</label>
                  {!u.active && <Pill tone="red">Deaktiviert</Pill>}
                </div>
                <button className="btn-ghost">Speichern</button>
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-semibold text-slate-400 hover:text-white">Zusätzliche Einzelrechte ({u.extraPermissions.length})</summary>
                <div className="mt-3 grid gap-1 sm:grid-cols-2 xl:grid-cols-3">
                  {PERMISSIONS.map((p) => (
                    <label key={p.key} className="flex min-h-[36px] items-center gap-2 text-xs text-slate-300">
                      <input type="checkbox" name="extra" value={p.key} defaultChecked={u.extraPermissions.some((e) => e.permissionKey === p.key)} className="h-4 w-4 accent-[#f03a2e]" />{p.label}
                    </label>
                  ))}
                </div>
              </details>
            </form>
          ))}
        </div>

        <form action={addSuperadminByDiscord} className="card card-pad mt-4 grid gap-3 md:grid-cols-[1fr_1fr_200px_auto]">
          <input name="discordId" className="input font-mono" placeholder="Discord-ID (ohne Mitgliedsprofil)" inputMode="numeric" required />
          <input name="username" className="input" placeholder="Bezeichnung (optional)" />
          <select name="roleKey" className="input" defaultValue="WEHRFUEHRER">{roleOpts.map((r) => <option key={r.id} value={r.key}>{r.name}</option>)}</select>
          <button className="btn-ghost">Benutzer anlegen</button>
        </form>
      </section>

      <section>
        <h2 className="card-title mb-3">Rollen & Berechtigungen</h2>
        <div className="space-y-3">
          {roles.map((r) => {
            const locked = r.key === SUPERADMIN_ROLE_KEY;
            return (
              <details key={r.id} className="card group" open={false}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
                  <div><div className="font-bold text-white">{r.name}</div><div className="text-xs text-slate-500">{r.description}</div></div>
                  <div className="flex items-center gap-2"><Pill>{r._count.users} Benutzer</Pill>{locked ? <Pill tone="amber">Vollzugriff</Pill> : <Pill>{r.permissions.length} Rechte</Pill>}</div>
                </summary>
                <div className="border-t border-white/[0.06] p-5">
                  <form action={updateRole.bind(null, r.id)} className="space-y-5">
                    {groups.map((g) => (
                      <fieldset key={g} disabled={locked}>
                        <legend className="card-title mb-2">{g}</legend>
                        <div className="grid gap-1 sm:grid-cols-2">
                          {PERMISSIONS.filter((p) => p.group === g).map((p) => (
                            <label key={p.key} className="flex min-h-[40px] items-center gap-2 text-sm text-slate-200">
                              <input type="checkbox" name="perm" value={p.key} defaultChecked={locked || r.permissions.some((x) => x.permissionKey === p.key)} className="h-5 w-5 accent-[#f03a2e]" />{p.label}
                            </label>
                          ))}
                        </div>
                      </fieldset>
                    ))}
                    {!locked && <button className="btn-primary">Berechtigungen speichern</button>}
                  </form>
                  {!r.isSystem && (
                    <form action={deleteRole.bind(null, r.id)} className="mt-4"><button className="btn-danger btn-sm" data-confirm={`Rolle „${r.name}“ löschen?`}><Trash2 className="h-3.5 w-3.5" /> Rolle löschen</button></form>
                  )}
                </div>
              </details>
            );
          })}
        </div>
        <form action={createRole} className="card card-pad mt-4 grid gap-3 md:grid-cols-[1fr_1.5fr_auto]">
          <input name="name" className="input" placeholder="Neue Rolle, z. B. Schriftführer" required />
          <input name="description" className="input" placeholder="Beschreibung (optional)" />
          <button className="btn-ghost">Rolle erstellen</button>
        </form>
      </section>
    </>
  );
}
