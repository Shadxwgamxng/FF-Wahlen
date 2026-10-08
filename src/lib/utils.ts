import clsx, { type ClassValue } from "clsx";

export const cn = (...v: ClassValue[]) => clsx(v);

const TZ = "Europe/Berlin";

export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "–";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: TZ }).format(new Date(d));
}

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "–";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(new Date(d));
}

/** Wert für <input type="datetime-local"> in deutscher Zeit */
export function toLocalInput(d: Date | string): string {
  const parts = new Intl.DateTimeFormat("sv-SE", {
    timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).format(new Date(d));
  return parts.replace(" ", "T");
}

/** Wandelt "YYYY-MM-DDTHH:mm" (deutsche Ortszeit) in ein UTC-Date. */
export function fromLocalInput(s: string): Date {
  const [datePart, timePart = "00:00"] = s.split("T");
  const [y, m, d] = datePart.split("-").map(Number);
  const [hh, mm] = timePart.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  // Offset der Zeitzone zum geschätzten Zeitpunkt bestimmen
  const asLocal = new Date(new Date(guess).toLocaleString("en-US", { timeZone: TZ }));
  const offset = asLocal.getTime() - new Date(new Date(guess).toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(guess - offset);
}

export const memberNo = (n: number) => `FF-${String(n).padStart(4, "0")}`;

export const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 1000) / 10 : 0);

export function initials(first: string, last: string) {
  return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}
