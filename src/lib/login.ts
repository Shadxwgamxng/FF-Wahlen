import { db } from "./db";
import { audit } from "./audit";
import { createSession, sha256, superadminDiscordIds } from "./auth";
import { SUPERADMIN_ROLE_KEY } from "./permissions";

export type LoginOutcome = { ok: true } | { ok: false; error: "unlinked" | "disabled" | "link_invalid" | "link_taken" };

/**
 * Gemeinsame Login-Logik für Discord (und den Dev-Login).
 * Es werden KEINE Benutzer automatisch als Feuerwehrmitglied angelegt.
 */
export async function completeLogin(
  discord: { id: string; username: string },
  linkToken: string | null,
): Promise<LoginOutcome> {
  const existing = await db.discordAccount.findUnique({ where: { discordId: discord.id }, include: { user: true } });
  if (existing) {
    if (!existing.user.active) return { ok: false, error: "disabled" };
    await db.discordAccount.update({ where: { id: existing.id }, data: { username: discord.username } });
    await createSession(existing.userId);
    return { ok: true };
  }

  // Selbst-Verknüpfung per Einladungslink eines Wehrführers
  if (linkToken) {
    const t = await db.discordLinkToken.findUnique({
      where: { tokenHash: sha256(linkToken) },
      include: { firefighter: { include: { user: true } } },
    });
    if (!t || t.usedAt || t.expiresAt < new Date()) return { ok: false, error: "link_invalid" };
    if (t.firefighter.user) return { ok: false, error: "link_taken" };
    const role = await db.role.findUniqueOrThrow({ where: { key: "MITGLIED" } });
    const user = await db.user.create({
      data: {
        roleId: role.id,
        firefighterId: t.firefighterId,
        discordAccount: { create: { discordId: discord.id, username: discord.username } },
      },
    });
    await db.discordLinkToken.update({ where: { id: t.id }, data: { usedAt: new Date() } });
    await audit({ id: user.id, name: t.firefighter.displayName }, "discord.link",
      `${t.firefighter.displayName} hat den eigenen Discord-Account verknüpft.`, { type: "Firefighter", id: t.firefighterId });
    await createSession(user.id);
    return { ok: true };
  }

  // Bootstrap: konfigurierte Superadmin-Discord-IDs
  if (superadminDiscordIds().includes(discord.id)) {
    const role = await db.role.findUniqueOrThrow({ where: { key: SUPERADMIN_ROLE_KEY } });
    const user = await db.user.create({
      data: { roleId: role.id, discordAccount: { create: { discordId: discord.id, username: discord.username } } },
    });
    await audit({ id: user.id, name: discord.username }, "user.bootstrap", `Superadministrator „${discord.username}“ wurde initial angelegt.`, { type: "User", id: user.id });
    await createSession(user.id);
    return { ok: true };
  }

  return { ok: false, error: "unlinked" };
}
