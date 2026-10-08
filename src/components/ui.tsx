import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { cn, initials } from "@/lib/utils";
import { STATUS_LABEL, type ElectionStatusKey } from "@/lib/elections";

export function PageHeader({
  title, subtitle, actions, eyebrow,
}: { title: string; subtitle?: string; actions?: React.ReactNode; eyebrow?: string }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between animate-fadeUp">
      <div>
        {eyebrow && <div className="card-title mb-1 text-fire-400">{eyebrow}</div>}
        <h1 className="text-2xl font-bold tracking-tight text-white sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Flash({ error, ok }: { error?: string; ok?: string }) {
  if (!error && !ok) return null;
  const isErr = !!error;
  const Icon = isErr ? AlertTriangle : CheckCircle2;
  return (
    <div
      role={isErr ? "alert" : "status"}
      className={cn(
        "mb-5 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm animate-fadeUp",
        isErr ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
      )}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" />
      <span>{error ?? ok}</span>
    </div>
  );
}

const STATUS_STYLE: Record<ElectionStatusKey, string> = {
  DRAFT: "border-slate-500/30 bg-slate-500/10 text-slate-300",
  SCHEDULED: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  ACTIVE: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  ENDED: "border-violet-500/30 bg-violet-500/10 text-violet-300",
  CANCELLED: "border-red-500/30 bg-red-500/10 text-red-300",
};

export function StatusBadge({ status }: { status: ElectionStatusKey }) {
  return (
    <span className={cn("badge", STATUS_STYLE[status])}>
      <span className={cn("h-1.5 w-1.5 rounded-full bg-current", status === "ACTIVE" && "animate-pulseDot")} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function SecretBadge({ secret }: { secret: boolean }) {
  return (
    <span className={cn("badge", secret ? "border-amber-500/30 bg-amber-500/10 text-amber-300" : "border-blue-500/30 bg-blue-500/10 text-blue-300")}>
      {secret ? "Geheime Wahl" : "Öffentliche Wahl"}
    </span>
  );
}

export function Pill({ children, tone = "slate" }: { children: React.ReactNode; tone?: "slate" | "green" | "red" | "amber" | "blue" }) {
  const t = {
    slate: "border-white/10 bg-white/[0.04] text-slate-300",
    green: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    red: "border-red-500/30 bg-red-500/10 text-red-300",
    amber: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    blue: "border-blue-500/30 bg-blue-500/10 text-blue-300",
  }[tone];
  return <span className={cn("badge", t)}>{children}</span>;
}

export function Avatar({ first, last, url, size = 36 }: { first: string; last: string; url?: string | null; size?: number }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" width={size} height={size} className="rounded-xl object-cover" style={{ width: size, height: size }} />
  ) : (
    <div
      className="grid shrink-0 place-items-center rounded-xl bg-gradient-to-br from-ink-600 to-ink-700 text-xs font-bold text-slate-200 ring-1 ring-white/10"
      style={{ width: size, height: size }}
    >
      {initials(first, last)}
    </div>
  );
}

export function Stat({ label, value, icon, hint }: { label: string; value: React.ReactNode; icon?: React.ReactNode; hint?: string }) {
  return (
    <div className="card card-pad animate-fadeUp">
      <div className="flex items-center justify-between">
        <span className="card-title">{label}</span>
        <span className="text-fire-400">{icon}</span>
      </div>
      <div className="mt-3 text-3xl font-bold tracking-tight text-white">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-4 py-10 text-center text-sm text-slate-500">{children}</div>;
}

/** Bestätigungs-Button für destruktive Aktionen (kleines natives confirm, ohne Client-JS-Overhead pro Seite). */
export function ConfirmSubmit({ message, children, className }: { message: string; children: React.ReactNode; className?: string }) {
  return (
    <button type="submit" className={className} data-confirm={message}>
      {children}
    </button>
  );
}
