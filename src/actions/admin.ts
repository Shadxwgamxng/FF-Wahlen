"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { ALL_PERMISSION_KEYS, SUPERADMIN_ROLE_KEY } from "@/lib/permissions";
import { ids, optStr, parse, run, str } from "./helpers";

const BACK = "/admin/benutzer";

export async function updateUserAccess(userId: string, fd: FormData) {
  const actor = await requirePermission("users.manage");
  await run(BACK, async () => {
    const roleId = str(fd, "roleId");
    const active = fd.get("active") === "on";
    const extra = ids(fd, "extra").filter((k) => (ALL_PERMISSION_KEYS as string[]).includes(k));
    const [user, role] = await Promise.all([
      db.user.findUniqueOrThrow({ where: { id: userId }, include: { role: true, firefighter: true, discordAccount: true } }),
      db.role.findUniqueOrThrow({ where: { id: roleId } }),
    ]);
    if (role.key === SUPERADMIN_ROLE_KEY && !actor.isSuperadmin) throw new UserError("Nur Superadministratoren können die Superadministrator-Rolle vergeben.");
    const label = user.firefighter?.displayName ?? user.discordAccount?.username ?? "Benutzer";
    const losesSuper = user.role.key === SUPERADMIN_ROLE_KEY && (role.key !== SUPERADMIN_ROLE_KEY || !active);
    if (losesSuper) {
      const others = await db.user.count({ where: { id: { not: userId }, active: true, role: { key: SUPERADMIN_ROLE_KEY } } });
      if (!others) throw new UserError("Es muss mindestens ein aktiver Superadministrator bestehen bleiben.");
    }
    if (user.id === actor.id && !active) throw new UserError("Du kannst dein eigenes Konto nicht deaktivieren.");
    await db.$transaction([
      db.user.update({ where: { id: userId }, data: { roleId, active } }),
      db.userPermission.deleteMany({ where: { userId } }),
      db.userPermission.createMany({ data: extra.map((permissionKey) => ({ userId, permissionKey })) }),
      ...(active ? [] : [db.session.deleteMany({ where: { userId } })]),
    ]);
    await audit(actor, "user.access", `${actor.name} hat die Zugriffsrechte von „${label}“ geändert (Rolle: ${role.name}${active ? "" : ", deaktiviert"}).`, { type: "User", id: userId });
    return { ok: "Zugriff aktualisiert." };
  });
}

const roleSchema = z.object({
  name: z.string().min(1, "Name fehlt.").max(60),
  description: z.string().max(300).nullable(),
});

export async function createRole(fd: FormData) {
  const actor = await requirePermission("users.manage");
  await run(BACK, async () => {
    const data = parse(roleSchema, { name: str(fd, "name"), description: optStr(fd, "description") });
    const key = "CUSTOM_" + data.name.toUpperCase().replace(/[^A-Z0-9]+/g, "_").slice(0, 30) + "_" + Date.now().toString(36);
    const r = await db.role.create({ data: { ...data, key } });
    await audit(actor, "role.create", `${actor.name} hat die Rolle „${r.name}“ erstellt.`, { type: "Role", id: r.id });
    return { ok: "Rolle erstellt." };
  });
}

export async function updateRole(roleId: string, fd: FormData) {
  const actor = await requirePermission("users.manage");
  await run(BACK, async () => {
    const role = await db.role.findUniqueOrThrow({ where: { id: roleId } });
    if (role.key === SUPERADMIN_ROLE_KEY) throw new UserError("Die Rechte des Superadministrators sind fest.");
    const perms = ids(fd, "perm").filter((k) => (ALL_PERMISSION_KEYS as string[]).includes(k));
    await db.$transaction([
      db.rolePermission.deleteMany({ where: { roleId } }),
      db.rolePermission.createMany({ data: perms.map((permissionKey) => ({ roleId, permissionKey })) }),
    ]);
    await audit(actor, "role.update", `${actor.name} hat die Berechtigungen der Rolle „${role.name}“ geändert.`, { type: "Role", id: roleId });
    return { ok: `Rolle „${role.name}“ gespeichert.` };
  });
}

export async function deleteRole(roleId: string) {
  const actor = await requirePermission("users.manage");
  await run(BACK, async () => {
    const role = await db.role.findUniqueOrThrow({ where: { id: roleId }, include: { _count: { select: { users: true } } } });
    if (role.isSystem) throw new UserError("Systemrollen können nicht gelöscht werden.");
    if (role._count.users) throw new UserError("Die Rolle ist noch Benutzern zugewiesen.");
    await db.role.delete({ where: { id: roleId } });
    await audit(actor, "role.delete", `${actor.name} hat die Rolle „${role.name}“ gelöscht.`, { type: "Role", id: roleId });
    return { ok: "Rolle gelöscht." };
  });
}

export async function addSuperadminByDiscord(fd: FormData) {
  const actor = await requirePermission("users.manage");
  await run(BACK, async () => {
    const discordId = str(fd, "discordId");
    const username = str(fd, "username") || "(Administrator)";
    if (!/^\d{15,25}$/.test(discordId)) throw new UserError("Ungültige Discord-ID.");
    if (await db.discordAccount.findUnique({ where: { discordId } })) throw new UserError("Diese Discord-ID ist bereits einem Benutzer zugeordnet.");
    const role = await db.role.findUniqueOrThrow({ where: { key: str(fd, "roleKey") || "WEHRFUEHRER" } });
    if (role.key === SUPERADMIN_ROLE_KEY && !actor.isSuperadmin) throw new UserError("Nur Superadministratoren können weitere anlegen.");
    const u = await db.user.create({ data: { roleId: role.id, discordAccount: { create: { discordId, username } } } });
    await audit(actor, "user.create", `${actor.name} hat einen Benutzer ohne Mitgliedsprofil (Rolle ${role.name}) angelegt.`, { type: "User", id: u.id });
    return { ok: "Benutzer angelegt." };
  });
}

export async function saveSettings(fd: FormData) {
  const actor = await requirePermission("settings.manage");
  await run("/admin/einstellungen", async () => {
    const name = parse(z.string().min(1, "Name fehlt.").max(80), str(fd, "organization_name"));
    await db.systemSetting.upsert({ where: { key: "organization_name" }, update: { value: name }, create: { key: "organization_name", value: name } });
    await audit(actor, "settings.update", `${actor.name} hat die Systemeinstellungen geändert.`, { type: "Settings" });
    return { ok: "Einstellungen gespeichert." };
  }, ["/dashboard"]);
}
