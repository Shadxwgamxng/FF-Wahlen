import { randomInt } from "node:crypto";
import { db } from "./db";
import { audit } from "./audit";
import { getEligibleMembers, isEligible } from "./eligibility";

export const STATUS_LABEL = {
  DRAFT: "Entwurf",
  SCHEDULED: "Geplant",
  ACTIVE: "Aktiv",
  ENDED: "Beendet",
  CANCELLED: "Abgebrochen",
} as const;

export type ElectionStatusKey = keyof typeof STATUS_LABEL;

import { UserError } from "./errors";
export class VoteError extends UserError {}

/**
 * Setzt Status anhand der Zeitfenster: Geplant → Aktiv bei Startzeit, Aktiv → Beendet bei Endzeit.
 * Wird bei Seitenaufrufen, beim Abstimmen und über /api/cron/tick aufgerufen.
 */
export async function syncElections() {
  const now = new Date();
  const toStart = await db.election.findMany({
    where: { status: "SCHEDULED", startsAt: { lte: now } },
    select: { id: true, name: true, endsAt: true },
  });
  for (const e of toStart) {
    const res = await db.election.updateMany({
      where: { id: e.id, status: "SCHEDULED" },
      data: { status: "ACTIVE", startedAt: now },
    });
    if (res.count) await audit(null, "election.start", `Wahl „${e.name}“ wurde automatisch gestartet.`, { type: "Election", id: e.id });
  }
  const toEnd = await db.election.findMany({ where: { status: "ACTIVE", endsAt: { lte: now } }, select: { id: true } });
  for (const e of toEnd) await finalizeElection(e.id, null, "Die Wahl wurde automatisch beendet.");
}

type Actor = { id: string; name: string } | null;

/** Beendet eine aktive Wahl, friert Beteiligung und Ergebnis ein. */
export async function finalizeElection(electionId: string, actor: Actor, auditSuffix = "") {
  const eligible = (await getEligibleMembers(electionId)).length;
  const result = await db.$transaction(async (tx) => {
    const claimed = await tx.election.updateMany({
      where: { id: electionId, status: "ACTIVE" },
      data: { status: "ENDED", endedAt: new Date() },
    });
    if (!claimed.count) return null;

    const election = await tx.election.findUniqueOrThrow({
      where: { id: electionId },
      include: { positions: { include: { candidates: { include: { firefighter: true } } }, orderBy: { sortOrder: "asc" } } },
    });
    const participants = await tx.electionVoter.count({ where: { electionId } });
    const grouped = await tx.vote.groupBy({
      by: ["positionId", "candidateId", "abstain"],
      where: { electionId },
      _count: { _all: true },
    });

    await tx.electionResult.deleteMany({ where: { electionId } });
    const rows = [];
    for (const pos of election.positions) {
      const forPos = grouped.filter((g) => g.positionId === pos.id);
      pos.candidates.forEach((c, i) => {
        rows.push({
          electionId, positionId: pos.id, candidateId: c.id, label: c.firefighter.displayName, sortOrder: i,
          votes: forPos.find((g) => g.candidateId === c.id)?._count._all ?? 0,
        });
      });
      rows.push({
        electionId, positionId: pos.id, candidateId: null, label: "Enthaltung", isAbstention: true, sortOrder: 9999,
        votes: forPos.filter((g) => g.abstain).reduce((s, g) => s + g._count._all, 0),
      });
    }
    await tx.electionResult.createMany({ data: rows });
    await tx.election.update({ where: { id: electionId }, data: { eligibleSnapshot: eligible, participantsSnapshot: participants } });
    return election;
  });
  if (result) {
    await audit(actor, "election.end", `Wahl „${result.name}“ wurde beendet. ${auditSuffix}`.trim(), { type: "Election", id: electionId });
  }
  return !!result;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Gibt eine Stimme ab.
 *
 * Geheime Wahl:  `votes` erhält Zeilen OHNE voterId und OHNE Zeitstempel (zufällige UUID),
 *                die Reihenfolge wird zusätzlich gemischt. Der Teilnahmevermerk liegt separat in
 *                `election_voters` und hat keinerlei Verbindung zu `votes`.
 * Öffentliche Wahl: voterId und castAt werden gespeichert.
 *
 * Die Teilnahme wird per Unique-Constraint atomar in derselben Transaktion erzwungen
 * (keine doppelte Stimmabgabe, auch nicht bei parallelen Requests).
 */
export async function castBallot(electionId: string, firefighterId: string, choices: Record<string, string>) {
  await syncElections();
  const election = await db.election.findUnique({
    where: { id: electionId },
    include: { positions: { include: { candidates: true } } },
  });
  if (!election) throw new VoteError("Wahl nicht gefunden.");
  const now = new Date();
  if (election.status !== "ACTIVE" || now < election.startsAt || now >= election.endsAt)
    throw new VoteError("Diese Wahl ist aktuell nicht geöffnet.");
  if (!(await isEligible(electionId, firefighterId))) throw new VoteError("Du bist für diese Wahl nicht wahlberechtigt.");

  const rows: { positionId: string; candidateId: string | null; abstain: boolean }[] = [];
  for (const pos of election.positions) {
    const choice = choices[pos.id];
    if (!choice) throw new VoteError(`Bitte triff für „${pos.title}“ eine Auswahl.`);
    if (choice === "ABSTAIN") rows.push({ positionId: pos.id, candidateId: null, abstain: true });
    else if (pos.candidates.some((c) => c.id === choice)) rows.push({ positionId: pos.id, candidateId: choice, abstain: false });
    else throw new VoteError("Ungültige Auswahl.");
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.electionVoter.create({ data: { electionId, firefighterId } });
      const data = election.secret
        ? shuffle(rows).map((r) => ({ electionId, ...r }))
        : rows.map((r) => ({ electionId, ...r, voterId: firefighterId, castAt: new Date() }));
      await tx.vote.createMany({ data });
    });
  } catch (e: unknown) {
    if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002")
      throw new VoteError("Du hast bei dieser Wahl bereits abgestimmt.");
    throw e;
  }
  // Bewusst KEIN Audit-Eintrag mit Entscheidung. Es wird nichts zur Stimmabgabe protokolliert.
}

/** Rangfolge: Gewinner = höchste Stimmenzahl; bei Gleichstand mehrere. */
export function leaders<T extends { votes: number }>(rows: T[]): T[] {
  const max = Math.max(0, ...rows.map((r) => r.votes));
  return max > 0 ? rows.filter((r) => r.votes === max) : [];
}
