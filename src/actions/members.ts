"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { randomToken, requirePermission, sha256 } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { bool, ids, optStr, parse, run, str } from "./helpers";

const memberSchema = z.object({
  firstName: z.string().min(1, "Vorname fehlt.").max(60),
  lastName: z.string().min(1, "Nachname fehlt.").max(60),
  displayName: z.string().min(1).max(100),
  callSign: z.string().max(80).nullable(),
  rankId: z.string().nullable(),
  avatarUrl: z.string().url("Profilbild-URL ist ungültig.").max(500).nullable(),
  status: z.enum(["AKTIV", "BEURLAUBT", "INAKTIV"]),
  joinedAt: z.coerce.date(),
  notes: z.string().max(2000).nullable(),
});

function readMember(fd: FormData) {
  const firstName = str(fd, "firstName");
  const lastName = str(fd, "lastName");
  return parse(memberSchema, {
    firstName, lastName,
    displayName: str(fd, "displayName") || `${firstName} ${lastName}`.trim(),
    callSign: optStr(fd, "callSign"),
    rankId: optStr(fd, "rankId"),
    avatarUrl: optStr(fd, "avatarUrl"),
    status: str(fd, "status") || "AKTIV",
    joinedAt: str(fd, "joinedAt") || new Date().toISOString(),
    notes: optStr(fd, "notes"),
  });
}

async function syncAssignments(memberId: string, fd: FormData) {
  const unitIds = ids(fd, "unitIds");
  const officeIds = ids(fd, "officeIds");
  const primary = unitIds.includes(str(fd, "primaryUnitId")) ? str(fd, "primaryUnitId") : unitIds[0];
  await db.$transaction([
    db.firefighterUnit.deleteMany({ where: { firefighterId: memberId, unitId: { notIn: unitIds } } }),
    ...unitIds.map((unitId) =>
      db.firefighterUnit.upsert({
        where: { firefighterId_unitId: { firefighterId: memberId, unitId } },
        update: { isPrimary: unitId === primary },
        create: { firefighterId: memberId, unitId, isPrimary: unitId === primary },
      })),
    db.firefighterOffice.deleteMany({ where: { firefighterId: memberId, officeId: { notIn: officeIds } } }),
    ...officeIds.map((officeId) =>
      db.firefighterOffice.upsert({
        where: { firefighterId_officeId: { firefighterId: memberId, officeId } },
        update: {}, create: { firefighterId: memberId, officeId },
      })),
  ]);
}

export async function createMember(fd: FormData) {
  const actor = await requirePermission("members.manage");
  await run("/mitglieder/neu", async () => {
    const data = readMember(fd);
    const m = await db.firefighter.create({ data });
    await syncAssignments(m.id, fd);
    await audit(actor, "member.create", `${actor.name} hat das Mitglied „${m.displayName}“ angelegt.`, { type: "Firefighter", id: m.id });
    const unitIds = ids(fd, "unitIds");
    if (unitIds.length) {
      const units = await db.fireUnit.findMany({ where: { id: { in: unitIds } } });
      await audit(actor, "member.units", `${m.displayName} wurde ${units.map((u) => u.name).join(", ")} zugeordnet.`, { type: "Firefighter", id: m.id });
    }
    return { ok: "Mitglied wurde angelegt.", to: `/mitglieder/${m.id}` };
  }, ["/mitglieder"]);
}

export async function updateMember(id: string, fd: FormData) {
  const actor = await requirePermission("members.manage");
  await run(`/mitglieder/${id}`, async () => {
    const before = await db.firefighter.findUniqueOrThrow({ where: { id }, include: { units: { include: { unit: true } } } });
    const data = readMember(fd);
    await db.firefighter.update({ where: { id }, data });
    await syncAssignments(id, fd);
    await audit(actor, "member.update", `${actor.name} hat das Mitglied „${data.displayName}“ bearbeitet.`, { type: "Firefighter", id });
    const after = ids(fd, "unitIds");
    const prev = before.units.map((u) => u.unitId);
    if (after.length !== prev.length || after.some((u) => !prev.includes(u))) {
      const units = await db.fireUnit.findMany({ where: { id: { in: after } } });
      await audit(actor, "member.units", `${data.displayName}: Zuordnung geändert auf ${units.map((u) => u.name).join(", ") || "keine"}.`, { type: "Firefighter", id });
    }
    return { ok: "Änderungen gespeichert." };
  }, ["/mitglieder", "/loeschzuege", "/dashboard"]);
}

export async function setMemberStatus(id: string, fd: FormData) {
  const actor = await requirePermission("members.manage");
  const back = str(fd, "back") || `/mitglieder/${id}`;
  await run(back, async () => {
    const status = parse(z.enum(["AKTIV", "BEURLAUBT", "INAKTIV"]), str(fd, "status"));
    const m = await db.firefighter.update({ where: { id }, data: { status } });
    await audit(actor, "member.status", `${actor.name} hat „${m.displayName}“ auf Status ${status === "AKTIV" ? "Aktiv" : status === "INAKTIV" ? "Inaktiv" : "Beurlaubt"} gesetzt.`, { type: "Firefighter", id });
    return { ok: "Status aktualisiert." };
  }, ["/mitglieder"]);
}

export async function deleteMember(id: string) {
  const actor = await requirePermission("members.delete");
  await run(`/mitglieder/${id}`, async () => {
    const m = await db.firefighter.findUniqueOrThrow({ where: { id }, include: { user: true } });
    if (m.user?.id === actor.id) throw new UserError("Du kannst dein eigenes Mitglied nicht löschen.");
    const cands = await db.candidate.count({ where: { firefighterId: id } });
    if (cands) throw new UserError("Das Mitglied ist als Kandidat eingetragen. Deaktiviere es stattdessen oder entferne zuerst die Kandidatur.");
    await db.$transaction(async (tx) => {
      if (m.user) await tx.user.delete({ where: { id: m.user.id } });
      await tx.firefighter.delete({ where: { id } });
    });
    await audit(actor, "member.delete", `${actor.name} hat das Mitglied „${m.displayName}“ gelöscht.`, { type: "Firefighter", id });
    return { ok: `Mitglied „${m.displayName}“ wurde gelöscht.`, to: "/mitglieder" };
  }, ["/mitglieder", "/loeschzuege"]);
}

// ───────────────────────────── Discord ─────────────────────────────

const DISCORD_ID = /^\d{15,25}$/;

/** Manuelle Verknüpfung per Discord-ID (Snowflake). Die ID dient nur der Anmeldung. */
export async function linkDiscordById(id: string, fd: FormData) {
  const actor = await requirePermission("members.discord");
  await run(`/mitglieder/${id}`, async () => {
    const discordId = str(fd, "discordId");
    if (!DISCORD_ID.test(discordId)) throw new UserError("Die Discord-ID muss eine Zahl mit 15–25 Stellen sein.");
    const m = await db.firefighter.findUniqueOrThrow({ where: { id }, include: { user: true } });
    if (m.user) throw new UserError("Dieses Mitglied ist bereits mit einem Discord-Account verknüpft.");
    if (await db.discordAccount.findUnique({ where: { discordId } }))
      throw new UserError("Diese Discord-ID ist bereits einem anderen Benutzer zugeordnet.");
    const role = await db.role.findUniqueOrThrow({ where: { key: "MITGLIED" } });
    await db.user.create({
      data: { roleId: role.id, firefighterId: id, discordAccount: { create: { discordId, username: "(noch nicht angemeldet)" } } },
    });
    await audit(actor, "discord.link", `${actor.name} hat „${m.displayName}“ mit einem Discord-Account verknüpft.`, { type: "Firefighter", id });
    return { ok: "Discord-Account verknüpft." };
  }, ["/mitglieder", "/admin/benutzer"]);
}

export async function createInvite(id: string) {
  const actor = await requirePermission("members.discord");
  let token = "";
  let name = "";
  try {
    const m = await db.firefighter.findUniqueOrThrow({ where: { id }, include: { user: true } });
    if (m.user) throw new UserError("Dieses Mitglied ist bereits verknüpft.");
    name = m.displayName;
    token = randomToken(24);
    await db.discordLinkToken.deleteMany({ where: { firefighterId: id } });
    await db.discordLinkToken.create({
      data: { firefighterId: id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 7 * 86_400_000) },
    });
    await audit(actor, "discord.invite", `${actor.name} hat einen Discord-Verknüpfungslink für „${name}“ erzeugt.`, { type: "Firefighter", id });
  } catch (e) {
    const msg = e instanceof UserError ? e.message : "Link konnte nicht erzeugt werden.";
    const { redirect } = await import("next/navigation");
    redirect(`/mitglieder/${id}?error=${encodeURIComponent(msg)}`);
  }
  const { redirect } = await import("next/navigation");
  redirect(`/mitglieder/${id}?invite=${token}`);
}

export async function unlinkDiscord(id: string) {
  const actor = await requirePermission("members.discord");
  await run(`/mitglieder/${id}`, async () => {
    const m = await db.firefighter.findUniqueOrThrow({ where: { id }, include: { user: true } });
    if (!m.user) throw new UserError("Es besteht keine Verknüpfung.");
    if (m.user.id === actor.id) throw new UserError("Du kannst deine eigene Verknüpfung nicht lösen.");
    await db.user.delete({ where: { id: m.user.id } });
    await audit(actor, "discord.unlink", `${actor.name} hat die Discord-Verknüpfung von „${m.displayName}“ entfernt.`, { type: "Firefighter", id });
    return { ok: "Verknüpfung entfernt." };
  }, ["/mitglieder", "/admin/benutzer"]);
}

