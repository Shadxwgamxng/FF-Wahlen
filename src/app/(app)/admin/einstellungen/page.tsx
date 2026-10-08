import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { saveSettings } from "@/actions/admin";
import { Flash, PageHeader } from "@/components/ui";

export const metadata = { title: "Systemeinstellungen" };

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ error?: string; ok?: string }> }) {
  await requirePermission("settings.manage");
  const sp = await searchParams;
  const org = (await db.systemSetting.findUnique({ where: { key: "organization_name" } }))?.value ?? "";
  const cfg = [
    ["Discord OAuth2", !!process.env.DISCORD_CLIENT_ID && !!process.env.DISCORD_CLIENT_SECRET],
    ["Superadmin-Bootstrap (SUPERADMIN_DISCORD_IDS)", !!process.env.SUPERADMIN_DISCORD_IDS],
    ["Cron-Endpunkt (CRON_SECRET)", !!process.env.CRON_SECRET],
  ] as const;
  return (
    <>
      <PageHeader title="Systemeinstellungen" />
      <Flash error={sp.error} ok={sp.ok} />
      <div className="grid gap-6 lg:grid-cols-2">
        <form action={saveSettings} className="card card-pad space-y-4">
          <div className="card-title">Organisation</div>
          <div><label className="label" htmlFor="organization_name">Name der Feuerwehr</label><input id="organization_name" name="organization_name" className="input" defaultValue={org} required /></div>
          <button className="btn-primary">Speichern</button>
        </form>
        <div className="card card-pad">
          <div className="card-title mb-4">Konfigurationsstatus</div>
          <ul className="space-y-2 text-sm">
            {cfg.map(([k, ok]) => <li key={k} className="flex items-center justify-between"><span className="text-slate-300">{k}</span><span className={ok ? "text-emerald-400" : "text-amber-400"}>{ok ? "konfiguriert" : "nicht gesetzt"}</span></li>)}
          </ul>
          <p className="hint mt-4">Secrets werden ausschließlich über Umgebungsvariablen gesetzt.</p>
        </div>
      </div>
    </>
  );
}
