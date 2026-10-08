import { NextResponse } from "next/server";
import { DISCORD_STATE_COOKIE, appUrl, discordAuthorizeUrl, randomToken } from "@/lib/auth";

export async function GET() {
  if (!process.env.DISCORD_CLIENT_ID) {
    return NextResponse.redirect(`${appUrl()}/login?error=config`);
  }
  const state = randomToken(16);
  const res = NextResponse.redirect(discordAuthorizeUrl(state));
  res.cookies.set(DISCORD_STATE_COOKIE, state, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 600,
  });
  return res;
}
