import { NextResponse, type NextRequest } from "next/server";
import { DISCORD_LINK_COOKIE, appUrl, sha256 } from "@/lib/auth";
import { db } from "@/lib/db";

/** Einladungslink: merkt sich das Token und startet den Discord-Login. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const t = await db.discordLinkToken.findUnique({ where: { tokenHash: sha256(token) } });
  if (!t || t.usedAt || t.expiresAt < new Date()) return NextResponse.redirect(`${appUrl()}/login?error=link_invalid`);
  const res = NextResponse.redirect(`${appUrl()}/api/auth/discord`);
  res.cookies.set(DISCORD_LINK_COOKIE, token, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 900,
  });
  return res;
}
