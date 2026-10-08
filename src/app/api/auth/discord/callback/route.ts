import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { DISCORD_LINK_COOKIE, DISCORD_STATE_COOKIE, appUrl, fetchDiscordIdentity } from "@/lib/auth";
import { completeLogin } from "@/lib/login";

export async function GET(req: NextRequest) {
  const jar = await cookies();
  const state = req.nextUrl.searchParams.get("state");
  const code = req.nextUrl.searchParams.get("code");
  const expected = jar.get(DISCORD_STATE_COOKIE)?.value;
  const linkToken = jar.get(DISCORD_LINK_COOKIE)?.value ?? null;
  jar.delete(DISCORD_STATE_COOKIE);
  jar.delete(DISCORD_LINK_COOKIE);

  const fail = (e: string) => NextResponse.redirect(`${appUrl()}/login?error=${e}`);
  if (!code || !state || !expected || state !== expected) return fail("state");

  try {
    const identity = await fetchDiscordIdentity(code);
    const out = await completeLogin(identity, linkToken);
    if (!out.ok) return fail(out.error);
  } catch {
    return fail("discord");
  }
  return NextResponse.redirect(`${appUrl()}/dashboard`);
}
