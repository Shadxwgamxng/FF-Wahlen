"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requirePermission } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { bool, ids, optStr, parse, run, str } from "./helpers";

// ───────────────────────────── Löschzüge ─────────────────────────────

const unitSchema = z.object({
  name: z.string().min(1, "Name fehlt.").max(80),
  description: z.string().max(500).nullable(),
  kind: z.enum(["LOESCHZUG", "FUNKTION"]),
  leaderId: z.string().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
});
const readUnit = (fd: FormData) =>
  parse(unitSchema, {
    name: str(fd, "name"), description: optStr(fd, "description"), kind: str(fd, "kind") || "LOESCHZUG",
    leaderId: optStr(fd, "leaderId"), sortOrder: str(fd, "sortOrder") || 0,
  });

export async function createUnit(fd: FormData) {
  const actor = await requirePermission("units.manage");
  await run("/loeschzuege", async () => {
    const u = await db.fireUnit.create({ data: { ...readUnit(fd), active: true } });
    await audit(actor, "unit.create", `${actor.name} hat „${u.name}“ angelegt.`, { type: "FireUnit", id: u.id });
    return { ok: `„${u.name}“ wurde angelegt.`, to: `/loeschzuege/${u.id}` };
  });
}

export async function updateUnit(id: string, fd: FormData) {
  const actor = await requirePermission("units.manage");
  await run(`/loeschzuege/${id}`, async () => {
    const u = await db.fireUnit.update({ where: { id }, data: { ...readUnit(fd), active: bool(fd, "active") } });
    await audit(actor, "unit.update", `${actor.name} hat „${u.name}“ bearbeitet.`, { type: "FireUnit", id });
    return { ok: "Gespeichert." };
  }, ["/loeschzuege", "/mitglieder"]);
}

export async function deleteUnit(id: string) {
  const actor = await requirePermission("units.manage");
  await run(`/loeschzuege/${id}`, async () => {
    const u = await db.fireUnit.findUniqueOrThrow({ where: { id } });
    await db.fireUnit.delete({ where: { id } });
    await audit(actor, "unit.delete", `${actor.name} hat „${u.name}“ gelöscht.`, { type: "FireUnit", id });
    return { ok: `„${u.name}“ wurde gelöscht.`, to: "/loeschzuege" };
  }, ["/loeschzuege", "/mitglieder"]);
}

export async function addUnitMembers(id: string, fd: FormData) {
  const actor = await requirePermission("units.manage");
  await run(`/loeschzuege/${id}`, async () => {
    const memberIds = ids(fd, "memberIds");
    if (!memberIds.length) throw new UserError("Bitte wähle mindestens ein Mitglied.");
    const u = await db.fireUnit.findUniqueOrThrow({ where: { id } });
    const existing = await db.firefighterUnit.findMany({ where: { firefighterId: { in: memberIds } } });
    await db.firefighterUnit.createMany({
      data: memberIds.map((firefighterId) => ({
        firefighterId, unitId: id,
        isPrimary: u.kind === "LOESCHZUG" && !existing.some((e) => e.firefighterId === firefighterId && e.isPrimary),
      })),
      skipDuplicates: true,
    });
    const ms = await db.firefighter.findMany({ where: { id: { in: memberIds } } });
    await audit(actor, "unit.assign", `${ms.map((m) => m.displayName).join(", ")} ${ms.length === 1 ? "wurde" : "wurden"} „${u.name}“ zugeordnet.`, { type: "FireUnit", id });
    return { ok: "Mitglieder zugeordnet." };
  }, ["/mitglieder"]);
}

export async function removeUnitMember(id: string, memberId: string) {
  const actor = await requirePermission("units.manage");
  await run(`/loeschzuege/${id}`, async () => {
    const [u, m] = await Promise.all([
      db.fireUnit.findUniqueOrThrow({ where: { id } }),
      db.firefighter.findUniqueOrThrow({ where: { id: memberId } }),
    ]);
    await db.firefighterUnit.deleteMany({ where: { unitId: id, firefighterId: memberId } });
    await audit(actor, "unit.unassign", `${m.displayName} wurde aus „${u.name}“ entfernt.`, { type: "FireUnit", id });
    return { ok: "Mitglied entfernt." };
  }, ["/mitglieder"]);
}

// ───────────────────────────── Ämter ─────────────────────────────

const nameDesc = z.object({
  name: z.string().min(1, "Name fehlt.").max(80),
  description: z.string().max(500).nullable(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
});
const readNameDesc = (fd: FormData) =>
  parse(nameDesc, { name: str(fd, "name"), description: optStr(fd, "description"), sortOrder: str(fd, "sortOrder") || 0 });

export async function createOffice(fd: FormData) {
  const actor = await requirePermission("offices.manage");
  await run("/aemter", async () => {
    const data = readNameDesc(fd);
    if (!str(fd, "sortOrder")) data.sortOrder = (await db.office.count()) ;
    const o = await db.office.create({ data });
    await audit(actor, "office.create", `${actor.name} hat das Amt „${o.name}“ erstellt.`, { type: "Office", id: o.id });
    return { ok: `Amt „${o.name}“ erstellt.` };
  });
}

export async function updateOffice(id: string, fd: FormData) {
  const actor = await requirePermission("offices.manage");
  await run("/aemter", async () => {
    const o = await db.office.update({ where: { id }, data: { ...readNameDesc(fd), active: bool(fd, "active") } });
    await audit(actor, "office.update", `${actor.name} hat das Amt „${o.name}“ bearbeitet.`, { type: "Office", id });
    return { ok: "Gespeichert." };
  });
}

export async function deleteOffice(id: string) {
  const actor = await requirePermission("offices.manage");
  await run("/aemter", async () => {
    const o = await db.office.findUniqueOrThrow({ where: { id } });
    await db.office.delete({ where: { id } });
    await audit(actor, "office.delete", `${actor.name} hat das Amt „${o.name}“ gelöscht.`, { type: "Office", id });
    return { ok: `Amt „${o.name}“ gelöscht.` };
  });
}

// ───────────────────────────── Dienstgrade ─────────────────────────────

const rankSchema = z.object({
  name: z.string().min(1, "Name fehlt.").max(80),
  abbreviation: z.string().max(10).nullable(),
  sortOrder: z.coerce.number().int().min(0).max(9999),
});
const readRank = (fd: FormData) =>
  parse(rankSchema, { name: str(fd, "name"), abbreviation: optStr(fd, "abbreviation"), sortOrder: str(fd, "sortOrder") || 0 });

export async function createRank(fd: FormData) {
  const actor = await requirePermission("ranks.manage");
  await run("/dienstgrade", async () => {
    const data = readRank(fd);
    if (!str(fd, "sortOrder")) data.sortOrder = await db.rank.count();
    const r = await db.rank.create({ data });
    await audit(actor, "rank.create", `${actor.name} hat den Dienstgrad „${r.name}“ erstellt.`, { type: "Rank", id: r.id });
    return { ok: "Dienstgrad erstellt." };
  });
}

export async function updateRank(id: string, fd: FormData) {
  const actor = await requirePermission("ranks.manage");
  await run("/dienstgrade", async () => {
    const r = await db.rank.update({ where: { id }, data: { ...readRank(fd), active: bool(fd, "active") } });
    await audit(actor, "rank.update", `${actor.name} hat den Dienstgrad „${r.name}“ bearbeitet.`, { type: "Rank", id });
    return { ok: "Gespeichert." };
  }, ["/mitglieder"]);
}

export async function deleteRank(id: string) {
  const actor = await requirePermission("ranks.manage");
  await run("/dienstgrade", async () => {
    const r = await db.rank.findUniqueOrThrow({ where: { id } });
    await db.rank.delete({ where: { id } });
    await audit(actor, "rank.delete", `${actor.name} hat den Dienstgrad „${r.name}“ gelöscht.`, { type: "Rank", id });
    return { ok: "Dienstgrad gelöscht." };
  }, ["/mitglieder"]);
}
