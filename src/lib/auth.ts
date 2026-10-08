import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "node:crypto";
import { db } from "./db";
import { ALL_PERMISSION_KEYS, SUPERADMIN_ROLE_KEY, type PermissionKey } from "./permissions";

export const SESSION_COOKIE = "ff_session";
const SESSION_DAYS = Number(process.env.SESSION_DAYS ?? 14);

export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export async function createSession(userId: string) {
  const token = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.session.create({ data: { tokenHash: sha256(token), userId, expiresAt } });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  await db.user.update({ where: { id: userId }, data: { lastLoginAt: new Date() } });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: sha256(token) } });
  jar.delete(SESSION_COOKIE);
}

export type CurrentUser = NonNullable<Awaited<ReturnType<typeof loadUser>>>;

async function loadUser() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await db.session.findUnique({
    where: { tokenHash: sha256(token) },
    include: {
      user: {
        include: {
          role: { include: { permissions: true } },
          extraPermissions: true,
          discordAccount: true,
          firefighter: {
            include: {
              rank: true,
              units: { include: { unit: true } },
              offices: { include: { office: true } },
            },
          },
        },
      },
    },
  });
  if (!session || session.expiresAt < new Date() || !session.user.active) return null;

  const u = session.user;
  const isSuperadmin = u.role.key === SUPERADMIN_ROLE_KEY;
  const perms = new Set<string>(
    isSuperadmin
      ? ALL_PERMISSION_KEYS
      : [...u.role.permissions.map((p) => p.permissionKey), ...u.extraPermissions.map((p) => p.permissionKey)],
  );
  return {
    id: u.id,
    role: u.role,
    isSuperadmin,
    discord: u.discordAccount,
    firefighter: u.firefighter,
    /** Anzeigename für UI & Audit-Log */
    name: u.firefighter?.displayName ?? u.discordAccount?.username ?? "Unbekannt",
    permissions: perms,
    can: (key: PermissionKey) => perms.has(key),
  };
}

/** Pro Request nur einmal laden. */
export const getCurrentUser = cache(loadUser);

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

export async function requirePermission(...keys: PermissionKey[]) {
  const user = await requireUser();
  if (!keys.some((k) => user.can(k))) redirect("/dashboard?error=" + encodeURIComponent("Dazu fehlt dir die Berechtigung."));
  return user;
}

// ───────────────────────────── Discord OAuth2 ─────────────────────────────

export const DISCORD_STATE_COOKIE = "ff_oauth_state";
export const DISCORD_LINK_COOKIE = "ff_link_token";

export const appUrl = () => (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const discordRedirectUri = () => `${appUrl()}/api/auth/discord/callback`;

export function discordAuthorizeUrl(state: string) {
  const p = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID ?? "",
    redirect_uri: discordRedirectUri(),
    response_type: "code",
    scope: "identify",
    state,
    prompt: "none",
  });
  return `https://discord.com/oauth2/authorize?${p}`;
}

export async function fetchDiscordIdentity(code: string): Promise<{ id: string; username: string }> {
  const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.DISCORD_CLIENT_ID ?? "",
      client_secret: process.env.DISCORD_CLIENT_SECRET ?? "",
      grant_type: "authorization_code",
      code,
      redirect_uri: discordRedirectUri(),
    }),
    cache: "no-store",
  });
  if (!tokenRes.ok) throw new Error("Discord-Token konnte nicht abgerufen werden");
  const { access_token } = (await tokenRes.json()) as { access_token: string };
  const meRes = await fetch("https://discord.com/api/users/@me", {
    headers: { Authorization: `Bearer ${access_token}` },
    cache: "no-store",
  });
  if (!meRes.ok) throw new Error("Discord-Profil konnte nicht abgerufen werden");
  const me = (await meRes.json()) as { id: string; username: string; global_name?: string | null };
  return { id: me.id, username: me.global_name ?? me.username };
}

export const superadminDiscordIds = () =>
  (process.env.SUPERADMIN_DISCORD_IDS ?? "").split(",").map((s) => s.trim()).filter(Boolean);

export const devLoginEnabled = () => process.env.DEV_LOGIN === "true" && process.env.NODE_ENV !== "production";
