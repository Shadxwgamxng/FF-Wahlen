import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { UserError } from "@/lib/errors";
export { UserError };

export const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
export const optStr = (fd: FormData, k: string) => str(fd, k) || null;
export const bool = (fd: FormData, k: string) => fd.get(k) === "on" || fd.get(k) === "true";
export const ids = (fd: FormData, k: string) => [...new Set(fd.getAll(k).map(String).filter(Boolean))];

export function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.infer<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new UserError(r.error.issues[0]?.message ?? "Ungültige Eingabe.");
  return r.data;
}

const withMsg = (path: string, key: "error" | "ok", msg: string) =>
  `${path}${path.includes("?") ? "&" : "?"}${key}=${encodeURIComponent(msg)}`;

/**
 * Führt eine Aktion aus und leitet anschließend mit Erfolgs- bzw. Fehlermeldung weiter.
 * `redirect` wirft intern – deshalb außerhalb des try/catch.
 */
export async function run(
  backTo: string,
  fn: () => Promise<{ ok: string; to?: string } | void>,
  revalidate: string[] = [],
): Promise<never> {
  let target: string;
  try {
    const r = await fn();
    for (const p of revalidate) revalidatePath(p);
    revalidatePath(backTo);
    target = r ? withMsg(r.to ?? backTo, "ok", r.ok) : backTo;
  } catch (e) {
    if (e instanceof UserError) target = withMsg(backTo, "error", e.message);
    else if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002")
      target = withMsg(backTo, "error", "Dieser Eintrag existiert bereits.");
    else if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2003")
      target = withMsg(backTo, "error", "Der Eintrag wird noch verwendet und kann nicht gelöscht werden.");
    else if (typeof e === "object" && e && "digest" in e && String((e as { digest: string }).digest).startsWith("NEXT_REDIRECT")) throw e;
    else {
      console.error(e);
      target = withMsg(backTo, "error", "Unerwarteter Fehler. Bitte versuche es erneut.");
    }
  }
  redirect(target);
}
