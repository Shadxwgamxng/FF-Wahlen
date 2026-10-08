import Link from "next/link";
import { LogOut, Menu } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { syncElections } from "@/lib/elections";
import { logout } from "@/actions/auth";
import { NavLinks, type NavItem } from "@/components/NavLinks";
import { ConfirmHandler } from "@/components/ConfirmHandler";
import { Avatar } from "@/components/ui";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await syncElections();
  const org = (await db.systemSetting.findUnique({ where: { key: "organization_name" } }))?.value ?? "Freiwillige Feuerwehr";

  const main: NavItem[] = [
    { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
    { href: "/wahlen", label: "Wahlen", icon: "vote" },
    ...(user.can("members.view") ? [{ href: "/mitglieder", label: "Mitglieder", icon: "users" } as NavItem] : []),
    ...(user.can("units.view") ? [{ href: "/loeschzuege", label: "Löschzüge", icon: "units" } as NavItem] : []),
    ...(user.can("offices.view") ? [{ href: "/aemter", label: "Ämter", icon: "offices" } as NavItem] : []),
    ...(user.can("ranks.manage") ? [{ href: "/dienstgrade", label: "Dienstgrade", icon: "ranks" } as NavItem] : []),
    { href: "/historie", label: "Wahlhistorie", icon: "history" },
  ];
  const admin: NavItem[] = [
    ...(user.can("users.manage") ? [{ href: "/admin/benutzer", label: "Benutzer & Rollen", icon: "roles" } as NavItem] : []),
    ...(user.can("audit.view") ? [{ href: "/admin/audit", label: "Audit-Log", icon: "audit" } as NavItem] : []),
    ...(user.can("settings.manage") ? [{ href: "/admin/einstellungen", label: "Systemeinstellungen", icon: "settings" } as NavItem] : []),
  ];

  const nav = (
    <nav className="flex flex-col gap-1">
      <NavLinks items={main} />
      {admin.length > 0 && (
        <>
          <div className="card-title mb-1 mt-5 px-3">Administration</div>
          <NavLinks items={admin} />
        </>
      )}
    </nav>
  );

  const me = (
    <div className="flex items-center gap-3">
      <Avatar first={user.firefighter?.firstName ?? user.name} last={user.firefighter?.lastName ?? ""} url={user.firefighter?.avatarUrl} />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-white">{user.name}</div>
        <div className="truncate text-xs text-slate-500">{user.role.name}</div>
      </div>
      <form action={logout}>
        <button className="grid h-10 w-10 place-items-center rounded-xl text-slate-400 transition hover:bg-white/[0.07] hover:text-white" aria-label="Abmelden" title="Abmelden">
          <LogOut className="h-[18px] w-[18px]" />
        </button>
      </form>
    </div>
  );

  const brand = (
    <Link href="/dashboard" className="flex items-center gap-3">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/wappen.png" alt="" className="h-11 w-11 object-contain" />
      <div className="leading-tight">
        <div className="text-sm font-bold text-white">Wahlplattform</div>
        <div className="max-w-[10rem] truncate text-[11px] text-slate-500">{org}</div>
      </div>
    </Link>
  );

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[260px_1fr]">
      <ConfirmHandler />
      {/* Desktop-Sidebar */}
      <aside className="sticky top-0 hidden h-screen flex-col gap-6 border-r border-white/[0.06] bg-ink-900/70 p-4 backdrop-blur lg:flex">
        {brand}
        <div className="flex-1 overflow-y-auto">{nav}</div>
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">{me}</div>
      </aside>

      {/* Mobile-Header mit ausklappbarer Navigation (ohne JS) */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-ink-900/90 backdrop-blur lg:hidden">
        <details className="group">
          <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 [&::-webkit-details-marker]:hidden">
            {brand}
            <span className="grid h-11 w-11 place-items-center rounded-xl border border-white/10"><Menu className="h-5 w-5" /></span>
          </summary>
          <div className="max-h-[75vh] space-y-4 overflow-y-auto border-t border-white/[0.06] p-4">
            {nav}
            <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-3">{me}</div>
          </div>
        </details>
      </header>

      <main className="min-w-0 px-4 py-6 sm:px-6 lg:px-10 lg:py-9">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
