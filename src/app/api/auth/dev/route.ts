import { NextResponse, type NextRequest } from "next/server";
import { appUrl, devLoginEnabled } from "@/lib/auth";
import { completeLogin } from "@/lib/login";

/** NUR lokale Entwicklung (DEV_LOGIN=true, nie in Produktion). */
export async function POST(req: NextRequest) {
  if (!devLoginEnabled()) return new NextResponse("Not found", { status: 404 });
  const form = await req.formData();
  const id = String(form.get("discordId") ?? "").trim();
  const username = String(form.get("username") ?? "dev").trim() || "dev";
  if (!id) return NextResponse.redirect(`${appUrl()}/login?error=unlinked`, 303);
  const out = await completeLogin({ id, username }, null);
  return NextResponse.redirect(`${appUrl()}${out.ok ? "/dashboard" : "/login?error=" + out.error}`, 303);
}
