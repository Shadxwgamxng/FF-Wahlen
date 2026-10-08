import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { db } from "@/lib/db";
import { fmtDateTime } from "@/lib/utils";
import { Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Audit-Log" };
const PAGE = 50;

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  await requirePermission("audit.view");
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();
  const where = q ? { message: { contains: q, mode: "insensitive" as const } } : {};
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * PAGE, take: PAGE }),
    db.auditLog.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const href = (p: number) => `/admin/audit?page=${p}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  return (
    <>
      <PageHeader title="Audit-Log" subtitle="Alle administrativ relevanten Aktionen. Bei geheimen Wahlen werden niemals Wahlentscheidungen protokolliert." />
      <form className="mb-4 flex gap-2"><input name="q" defaultValue={q} className="input" placeholder="Einträge durchsuchen …" /><button className="btn-ghost">Suchen</button></form>
      <div className="card overflow-hidden">
        {rows.length === 0 ? <Empty>Keine Einträge.</Empty> : (
          <ul className="divide-y divide-white/[0.05]">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:gap-5">
                <time className="w-44 shrink-0 font-mono text-xs text-slate-500">{fmtDateTime(r.createdAt)}</time>
                <span className="text-sm text-slate-200">{r.message}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
        <span>Seite {page} von {pages} · {total} Einträge</span>
        <div className="flex gap-2">
          {page > 1 && <Link href={href(page - 1)} className="btn-ghost btn-sm">Zurück</Link>}
          {page < pages && <Link href={href(page + 1)} className="btn-ghost btn-sm">Weiter</Link>}
        </div>
      </div>
    </>
  );
}
