"use server";
import { z } from "zod";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { requireUser, requirePermission } from "@/lib/auth";
import { UserError } from "@/lib/errors";
import { advanceElection, castBallot, finalizeElection, openNextPosition, syncElections } from "@/lib/elections";
import { getEligibleMembers } from "@/lib/eligibility";
import { fromLocalInput } from "@/lib/utils";
import { bool, ids, optStr, parse, run, str } from "./helpers";

const manageUrl = (id: string) => `/wahlen/${id}/verwalten`;

async function draftElection(id: string) {
  const e = await db.election.findUniqueOrThrow({ where: { id } });
  if (e.status !== "DRAFT") throw new UserError("Nur Entwürfe können bearbeitet werden. Setze die Wahl ggf. zurück in den Entwurf.");
  return e;
}

const generalSchema = z.object({
  name: z.string().min(3, "Der Name ist zu kurz.").max(120),
  description: z.string().max(4000).nullable(),
  startsAt: z.date({ error: "Startzeit ungültig." }),
  endsAt: z.date({ error: "Endzeit ungültig." }),
  secret: z.boolean(),
  resultsPublic: z.boolean(),
}).refine((v) => v.endsAt > v.startsAt, { message: "Das Ende muss nach dem Start liegen.", path: ["endsAt"] });

function readGeneral(fd: FormData) {
  const toDate = (k: string) => (str(fd, k) ? fromLocalInput(str(fd, k)) : new Date(NaN));
  return parse(generalSchema, {
    name: str(fd, "name"), description: optStr(fd, "description"),
    startsAt: toDate("startsAt"), endsAt: toDate("endsAt"),
    secret: str(fd, "type") !== "public", resultsPublic: bool(fd, "resultsPublic"),
  });
}

export async function createElection(fd: FormData) {
  const actor = await requirePermission("elections.manage");
  await run("/wahlen/neu", async () => {
    const data = readGeneral(fd);
    const e = await db.election.create({ data: { ...data, createdById: actor.id } });
    await audit(actor, "election.create", `${actor.name} hat die Wahl „${e.name}“ erstellt (${e.secret ? "geheim" : "öffentlich"}).`, { type: "Election", id: e.id });
    return { ok: "Wahl als Entwurf angelegt. Ergänze nun Ämter, Kandidaten und Wahlberechtigte.", to: manageUrl(e.id) };
  }, ["/wahlen"]);
}

export async function updateElection(id: string, fd: FormData) {
  const actor = await requirePermission("elections.manage");
  await run(manageUrl(id), async () => {
    await draftElection(id);
    const e = await db.election.update({ where: { id }, data: readGeneral(fd) });
    await audit(actor, "election.update", `${actor.name} hat die Wahl „${e.name}“ bearbeitet.`, { type: "Election", id });
    return { ok: "Allgemeine Angaben gespeichert." };
  }, ["/wahlen"]);
}

// ───────────────────────── Ämter & Kandidaten ─────────────────────────

export async function addPosition(id: string, fd: FormData) {
  const actor = await requirePermission("elections.manage");
  await run(manageUrl(id), async () => {
    const e = await draftElection(id);
    const officeId = optStr(fd, "officeId");
    let title = str(fd, "title");
    if (officeId) {
      const o = await db.office.findUniqueOrThrow({ where: { id: officeId } });
      title = title || o.name;
    }
    if (!title) throw new UserError("Wähle ein Amt oder gib eine Bezeichnung an.");
    const sortOrder = await db.electionPosition.count({ where: { electionId: id } });
    await db.electionPosition.create({ data: { electionId: id, officeId, title, description: optStr(fd, "description"), sortOrder } });
    await audit(actor, "election.position", `Zur Wahl „${e.name}“ wurde das Amt „${title}“ hinzugefügt.`, { type: "Election", id });
    return { ok: `„${title}“ hinzugefügt.` };
  });
}

export async function removePosition(id: string, positionId: string) {
  const actor = await requirePermission("elections.manage");
  await run(manageUrl(id), async () => {
    const e = await draftElection(id);
    const p = await db.electionPosition.findFirstOrThrow({ where: { id: positionId, electionId: id } });
    await db.electionPosition.delete({ where: { id: positionId } });
    await audit(actor, "election.position", `Aus der Wahl „${e.name}“ wurde das Amt „${p.title}“ entfernt.`, { type: "Election", id });
    return { ok: "Amt entfernt." };
  });
}

export async function addCandidates(id: string, positionId: string, fd: FormData) {
  const actor = await requirePermission("elections.manage");
  await run(manageUrl(id), async () => {
    const e = await draftElection(id);
    const memberIds = ids(fd, "firefighterIds");
    if (!memberIds.length) throw new UserError("Bitte wähle mindestens ein Mitglied aus der Liste.");
    const p = await db.electionPosition.findFirstOrThrow({ where: { id: positionId, electionId: id } });
    const members = await db.firefighter.findMany({ where: { id: { in: memberIds } } });
    const existing = await db.candidate.findMany({ where: { positionId, firefighterId: { in: memberIds } } });
    const fresh = members.filter((m) => !existing.some((c) => c.firefighterId === m.id));
    if (!fresh.length) throw new UserError("Alle gewählten Personen kandidieren bereits für dieses Amt.");
    const base = await db.candidate.count({ where: { positionId } });
    const statement = fresh.length === 1 ? optStr(fd, "statement") : null;
    await db.candidate.createMany({
      data: fresh.map((m, i) => ({ positionId, firefighterId: m.id, statement, sortOrder: base + i })),
    });
    await audit(actor, "election.candidate", `${fresh.map((m) => `„${m.displayName}“`).join(", ")} ${fresh.length === 1 ? "wurde" : "wurden"} als Kandidat(en) für „${p.title}“ in „${e.name}“ eingetragen.`, { type: "Election", id });
    return { ok: `${fresh.length} Kandidat${fresh.length === 1 ? "" : "en"} hinzugefügt.` };
  });
}

export async function movePosition(id: string, positionId: string, dir: "up" | "down") {
  const actor = await requirePermission("elections.manage");
  await run(manageUrl(id), async () => {
    const e = await draftElection(id);
    const list = await db.electionPosition.findMany({ where: { electionId: id }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    const i = list.findIndex((p) => p.id === positionId);
    const j = dir === "up" ? i - 1 : i + 1;
    if (i < 0 || j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await db.$transaction(list.map((p, idx) => db.electionPosition.update({ where: { id: p.id }, data: { sortOrder: idx } })));
    await audit(actor, "election.position", `Reihenfolge der Wahlgänge in „${e.name}“ wurde geändert.`, { type: "Election", id });
  });
}

export async function updateCandidate(id: string, candidateId: string, fd: FormData) {
  const actor = await requirePermission("elections.manage");
  await run(manageUrl(id), async () => {
    const e = await draftElection(id);
    await db.candidate.update({ where: { id: candidateId }, data: { statement: optStr(fd, "statement") } });
    await audit(actor, "election.candidate", `Die Vorstellung eines Kandidaten in „${e.name}“ wurde bearbeitet.`, { type: "Election", id });
    return { ok: "Vorstellung gespeichert." };
  });
}

export async function removeCandidate(id: string, candidateId: string) {
  const actor = await requirePermission("elections.manage");
  await run(manageUrl(id), async () => {
    const e = await draftElection(id);
    const c = await db.candidate.findFirstOrThrow({ where: { id: candidateId, position: { electionId: id } }, include: { firefighter: true, position: true } });
    await db.candidate.delete({ where: { id: candidateId } });
    await audit(actor, "election.candidate", `Kandidat „${c.firefighter.displayName}“ für „${c.position.title}“ wurde aus „${e.name}“ entfernt.`, { type: "Election", id });
    return { ok: "Kandidat entfernt." };
  });
}

// ───────────────────────────── Wahlberechtigung ─────────────────────────────

export async function saveEligibility(id: string, fd: FormData) {
  const actor = await requirePermission("elections.manage");
  await run(manageUrl(id), async () => {
    const e = await draftElection(id);
    const unitIds = ids(fd, "unitIds");
    const include = ids(fd, "includeIds");
    const exclude = ids(fd, "excludeIds");
    await db.$transaction([
      db.electionEligibleUnit.deleteMany({ where: { electionId: id } }),
      db.electionEligibleFirefighter.deleteMany({ where: { electionId: id } }),
      db.electionExcludedFirefighter.deleteMany({ where: { electionId: id } }),
      db.electionEligibleUnit.createMany({ data: unitIds.map((unitId) => ({ electionId: id, unitId })) }),
      db.electionEligibleFirefighter.createMany({ data: include.map((firefighterId) => ({ electionId: id, firefighterId })) }),
      db.electionExcludedFirefighter.createMany({ data: exclude.map((firefighterId) => ({ electionId: id, firefighterId })) }),
    ]);
    const n = (await getEligibleMembers(id)).length;
    await audit(actor, "election.eligibility", `Wahlberechtigung der Wahl „${e.name}“ wurde festgelegt (${n} Wahlberechtigte).`, { type: "Election", id });
    return { ok: `Wahlberechtigung gespeichert – ${n} Mitglieder dürfen abstimmen.` };
  });
}

// ───────────────────────────── Statuswechsel ─────────────────────────────

async function validateForPublish(id: string) {
  const e = await db.election.findUniqueOrThrow({
    where: { id },
    include: { positions: { include: { candidates: true } } },
  });
  if (!e.positions.length) throw new UserError("Füge mindestens ein Amt hinzu.");
  for (const p of e.positions) if (!p.candidates.length) throw new UserError(`Für „${p.title}“ fehlen Kandidaten.`);
  if (e.endsAt <= new Date()) throw new UserError("Das Enddatum liegt in der Vergangenheit.");
  if (!(await getEligibleMembers(id)).length) throw new UserError("Es gibt keine Wahlberechtigten.");
  return e;
}

export async function publishElection(id: string) {
  const actor = await requirePermission("elections.control");
  await run(manageUrl(id), async () => {
    const e = await validateForPublish(id);
    if (e.status !== "DRAFT") throw new UserError("Nur Entwürfe können veröffentlicht werden.");
    await db.election.update({ where: { id }, data: { status: "SCHEDULED" } });
    await audit(actor, "election.publish", `Wahl „${e.name}“ wurde veröffentlicht (geplant).`, { type: "Election", id });
    await syncElections();
    return { ok: "Wahl veröffentlicht. Sie startet automatisch zur geplanten Zeit." };
  }, ["/wahlen", "/dashboard"]);
}

export async function unpublishElection(id: string) {
  const actor = await requirePermission("elections.control");
  await run(manageUrl(id), async () => {
    const res = await db.election.updateMany({ where: { id, status: "SCHEDULED" }, data: { status: "DRAFT" } });
    if (!res.count) throw new UserError("Nur geplante Wahlen können zurückgesetzt werden.");
    const e = await db.election.findUniqueOrThrow({ where: { id } });
    await audit(actor, "election.unpublish", `Wahl „${e.name}“ wurde zurück in den Entwurf gesetzt.`, { type: "Election", id });
    return { ok: "Wahl ist wieder ein Entwurf." };
  }, ["/wahlen", "/dashboard"]);
}

export async function startElection(id: string) {
  const actor = await requirePermission("elections.control");
  await run(manageUrl(id), async () => {
    const e = await validateForPublish(id);
    if (e.status !== "DRAFT" && e.status !== "SCHEDULED") throw new UserError("Diese Wahl kann nicht gestartet werden.");
    const now = new Date();
    await db.election.update({
      where: { id },
      data: { status: "ACTIVE", startedAt: now, startsAt: e.startsAt > now ? now : e.startsAt },
    });
    await audit(actor, "election.start", `Wahl „${e.name}“ wurde aktiviert.`, { type: "Election", id });
    await openNextPosition(id, actor);
    return { ok: "Die Wahl ist jetzt aktiv. Der erste Wahlgang ist geöffnet." };
  }, ["/wahlen", "/dashboard"]);
}

export async function endElection(id: string) {
  const actor = await requirePermission("elections.control");
  await run(manageUrl(id), async () => {
    const ok = await finalizeElection(id, actor, "(manuell)");
    if (!ok) throw new UserError("Nur aktive Wahlen können beendet werden.");
    return { ok: "Wahl beendet. Das Ergebnis wurde berechnet." };
  }, ["/wahlen", "/dashboard", "/historie"]);
}

export async function advanceRound(id: string, fd: FormData) {
  const actor = await requirePermission("elections.control");
  await run(manageUrl(id), async () => {
    const res = await advanceElection(id, actor, { tieWinner: optStr(fd, "tieWinner") });
    return { ok: res.winner ? `${res.winner.firefighter.displayName} wurde als „${res.position.title}“ gewählt.` : `Wahlgang „${res.position.title}“ abgeschlossen.` };
  }, ["/wahlen", "/dashboard", "/historie"]);
}

export async function cancelElection(id: string, fd: FormData) {
  const actor = await requirePermission("elections.control");
  await run(manageUrl(id), async () => {
    const reason = str(fd, "reason").slice(0, 500) || null;
    const res = await db.election.updateMany({
      where: { id, status: { in: ["SCHEDULED", "ACTIVE"] } },
      data: { status: "CANCELLED", endedAt: new Date(), cancelReason: reason },
    });
    if (!res.count) throw new UserError("Diese Wahl kann nicht abgebrochen werden.");
    const e = await db.election.findUniqueOrThrow({ where: { id } });
    await audit(actor, "election.cancel", `Wahl „${e.name}“ wurde abgebrochen${reason ? ` (Grund: ${reason})` : ""}.`, { type: "Election", id });
    return { ok: "Wahl abgebrochen." };
  }, ["/wahlen", "/dashboard", "/historie"]);
}

export async function deleteElection(id: string) {
  const actor = await requirePermission("elections.delete");
  await run(manageUrl(id), async () => {
    const e = await db.election.findUniqueOrThrow({ where: { id } });
    if (e.status === "ACTIVE") throw new UserError("Aktive Wahlen müssen zuerst beendet oder abgebrochen werden.");
    await db.election.delete({ where: { id } });
    await audit(actor, "election.delete", `Wahl „${e.name}“ wurde gelöscht.`, { type: "Election", id });
    return { ok: `Wahl „${e.name}“ gelöscht.`, to: "/wahlen" };
  }, ["/wahlen", "/dashboard", "/historie"]);
}

// ───────────────────────────── Abstimmung ─────────────────────────────

export async function submitBallot(id: string, fd: FormData) {
  const user = await requireUser();
  await run(`/wahlen/${id}`, async () => {
    if (!user.firefighter) throw new UserError("Dein Benutzerkonto ist keinem Feuerwehrmitglied zugeordnet.");
    if (str(fd, "confirm") !== "yes") throw new UserError("Bitte bestätige die endgültige Abgabe.");
    await castBallot(id, user.firefighter.id, str(fd, "positionId"), str(fd, "choice"));
    return { ok: "Deine Stimme wurde endgültig abgegeben. Vielen Dank!" };
  }, ["/dashboard", "/wahlen"]);
}
