import { randomInt } from "node:crypto";
import { db } from "./db";
import { audit } from "./audit";
import { getEligibleMembers, isEligible } from "./eligibility";
import { UserError } from "./errors";

export const STATUS_LABEL = {
  DRAFT: "Entwurf",
  SCHEDULED: "Geplant",
  ACTIVE: "Aktiv",
  ENDED: "Beendet",
  CANCELLED: "Abgebrochen",
} as const;

export type ElectionStatusKey = keyof typeof STATUS_LABEL;

export class VoteError extends UserError {}

type Actor = { id: string; name: string } | null;

/** Gibt es noch Kandidaten, die zur Wahl stehen (nicht zurückgezogen)? */
export const activeCandidates = { where: { withdrawn: false }, orderBy: { sortOrder: "asc" as const } };

/**
 * Setzt Status anhand der Zeitfenster: Geplant → Aktiv bei Startzeit, Aktiv → Beendet bei Endzeit.
 * Wird bei Seitenaufrufen, beim Abstimmen und über /api/cron/tick aufgerufen.
 */
export async function syncElections() {
  const now = new Date();
  const toStart = await db.election.findMany({
    where: { status: "SCHEDULED", startsAt: { lte: now } },
    select: { id: true, name: true },
  });
  for (const e of toStart) {
    const res = await db.election.updateMany({ where: { id: e.id, status: "SCHEDULED" }, data: { status: "ACTIVE", startedAt: now } });
    if (res.count) {
      await audit(null, "election.start", `Wahl „${e.name}“ wurde automatisch gestartet.`, { type: "Election", id: e.id });
      await openNextPosition(e.id, null);
    }
  }
  const toEnd = await db.election.findMany({ where: { status: "ACTIVE", endsAt: { lte: now } }, select: { id: true } });
  for (const e of toEnd) await finalizeElection(e.id, null, "Die Wahl wurde automatisch beendet.");
}

/**
 * Öffnet den nächsten Wahlgang (nach Reihenfolge). Ämter ohne verbleibende Kandidaten werden übersprungen.
 * Gibt es keinen weiteren Wahlgang, wird die Wahl beendet.
 */
export async function openNextPosition(electionId: string, actor: Actor): Promise<void> {
  for (;;) {
    const next = await db.electionPosition.findFirst({
      where: { electionId, status: "PENDING" },
      orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      include: { candidates: { where: { withdrawn: false } }, election: true },
    });
    if (!next) {
      await markEnded(electionId, actor);
      return;
    }
    if (next.candidates.length === 0) {
      await db.electionPosition.update({
        where: { id: next.id },
        data: { status: "CLOSED", closedAt: new Date(), participantsSnapshot: 0 },
      });
      await audit(actor, "election.position", `„${next.title}“ in „${next.election.name}“ entfällt: keine Kandidaten mehr.`, { type: "Election", id: electionId });
      continue;
    }
    await db.electionPosition.update({ where: { id: next.id }, data: { status: "OPEN", openedAt: new Date() } });
    await audit(actor, "election.round", `Wahlgang „${next.title}“ in „${next.election.name}“ wurde geöffnet.`, { type: "Election", id: electionId });
    return;
  }
}

/**
 * Schließt den aktuell offenen Wahlgang, berechnet das Ergebnis, bestimmt die gewählte Person und
 * zieht deren übrige Kandidaturen in noch nicht durchgeführten Wahlgängen zurück.
 * Bei Stimmengleichheit muss `tieWinner` angegeben werden (oder `allowTie` gesetzt sein → kein Gewinner).
 */
export async function closeOpenPosition(
  electionId: string,
  actor: Actor,
  opts: { tieWinner?: string | null; allowTie?: boolean } = {},
) {
  const pos = await db.electionPosition.findFirst({
    where: { electionId, status: "OPEN" },
    include: { election: true, candidates: { ...activeCandidates, include: { firefighter: true } } },
  });
  if (!pos) return null;

  const grouped = await db.vote.groupBy({ by: ["candidateId", "abstain"], where: { positionId: pos.id }, _count: { _all: true } });
  const tally = pos.candidates.map((c) => ({ c, votes: grouped.find((g) => g.candidateId === c.id)?._count._all ?? 0 }));
  const abstentions = grouped.filter((g) => g.abstain).reduce((s, g) => s + g._count._all, 0);
  const lead = leaders(tally);

  let winner: (typeof tally)[number]["c"] | null = lead.length === 1 ? lead[0].c : null;
  let tieDecided = false;
  if (lead.length > 1) {
    if (opts.tieWinner) {
      winner = lead.find((l) => l.c.id === opts.tieWinner)?.c ?? null;
      if (!winner) throw new UserError("Die gewählte Person gehört nicht zu den Erstplatzierten.");
      tieDecided = true;
    } else if (!opts.allowTie) {
      throw new UserError(`Stimmengleichheit zwischen ${lead.map((l) => l.c.firefighter.displayName).join(" und ")}. Bitte lege fest, wer gewählt ist.`);
    }
  }

  const withdrawnFrom = winner
    ? await db.candidate.findMany({
        where: { firefighterId: winner.firefighterId, withdrawn: false, position: { electionId, status: "PENDING" } },
        include: { position: true },
      })
    : [];

  const closed = await db.$transaction(async (tx) => {
    const claimed = await tx.electionPosition.updateMany({ where: { id: pos.id, status: "OPEN" }, data: { status: "CLOSED" } });
    if (!claimed.count) return false;
    const participants = await tx.electionVoter.count({ where: { positionId: pos.id } });
    if (pos.election.secret) {
      // Stimmen neu durchmischen: löscht die zeitliche Einfügereihenfolge (und neue Zufalls-IDs),
      // damit sich Stimmen nicht anhand der Reihenfolge den Teilnahmevermerken zuordnen lassen.
      const rows = await tx.vote.findMany({ where: { positionId: pos.id } });
      await tx.vote.deleteMany({ where: { positionId: pos.id } });
      await tx.vote.createMany({
        data: shuffle(rows).map((r) => ({ electionId, positionId: pos.id, candidateId: r.candidateId, abstain: r.abstain })),
      });
    }
    await tx.electionResult.deleteMany({ where: { positionId: pos.id } });
    await tx.electionResult.createMany({
      data: [
        ...tally.map((t, i) => ({
          electionId, positionId: pos.id, candidateId: t.c.id, label: t.c.firefighter.displayName, sortOrder: i, votes: t.votes,
        })),
        { electionId, positionId: pos.id, candidateId: null, label: "Enthaltung", isAbstention: true, sortOrder: 9999, votes: abstentions },
      ],
    });
    await tx.electionPosition.update({
      where: { id: pos.id },
      data: {
        closedAt: new Date(), participantsSnapshot: participants, tieDecided,
        winnerCandidateId: winner?.id ?? null, winnerLabel: winner?.firefighter.displayName ?? null,
      },
    });
    if (winner && withdrawnFrom.length) {
      await tx.candidate.updateMany({
        where: { id: { in: withdrawnFrom.map((w) => w.id) } },
        data: { withdrawn: true, withdrawnNote: `Bereits als „${pos.title}“ gewählt` },
      });
    }
    return true;
  });
  if (!closed) return null;

  const name = pos.election.name;
  if (winner) {
    await audit(actor, "election.round", `Wahlgang „${pos.title}“ in „${name}“ abgeschlossen: ${winner.firefighter.displayName} wurde gewählt${tieDecided ? " (Entscheidung bei Stimmengleichheit)" : ""}.`, { type: "Election", id: electionId });
    if (withdrawnFrom.length)
      await audit(actor, "election.candidate", `${winner.firefighter.displayName} wurde automatisch aus der Kandidatur für ${withdrawnFrom.map((w) => `„${w.position.title}“`).join(", ")} entfernt.`, { type: "Election", id: electionId });
  } else {
    await audit(actor, "election.round", `Wahlgang „${pos.title}“ in „${name}“ abgeschlossen: ${lead.length > 1 ? "Stimmengleichheit ohne Entscheidung" : "kein Gewinner"}.`, { type: "Election", id: electionId });
  }
  return { position: pos, winner };
}

/** Schließt den offenen Wahlgang und öffnet den nächsten (bzw. beendet die Wahl nach dem letzten). */
export async function advanceElection(electionId: string, actor: Actor, opts: { tieWinner?: string | null } = {}) {
  const res = await closeOpenPosition(electionId, actor, opts);
  if (!res) throw new UserError("Es läuft kein Wahlgang.");
  await openNextPosition(electionId, actor);
  return res;
}

async function markEnded(electionId: string, actor: Actor) {
  const eligible = (await getEligibleMembers(electionId)).length;
  const claimed = await db.election.updateMany({ where: { id: electionId, status: "ACTIVE" }, data: { status: "ENDED", endedAt: new Date() } });
  if (!claimed.count) return false;
  const distinct = await db.electionVoter.groupBy({ by: ["firefighterId"], where: { electionId } });
  const e = await db.election.update({
    where: { id: electionId },
    data: { eligibleSnapshot: eligible, participantsSnapshot: distinct.length },
  });
  await audit(actor, "election.end", `Wahl „${e.name}“ wurde beendet.`, { type: "Election", id: electionId });
  return true;
}

/** Beendet die Wahl sofort: offener Wahlgang wird abgeschlossen, nicht durchgeführte Wahlgänge entfallen. */
export async function finalizeElection(electionId: string, actor: Actor, auditSuffix = "") {
  await closeOpenPosition(electionId, actor, { allowTie: true });
  const ended = await markEnded(electionId, actor);
  if (ended && auditSuffix) await audit(actor, "election.end", auditSuffix, { type: "Election", id: electionId });
  return ended;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Der aktuell offene Wahlgang inkl. Kandidaten (ohne zurückgezogene). */
export async function getOpenPosition(electionId: string) {
  return db.electionPosition.findFirst({
    where: { electionId, status: "OPEN" },
    include: { candidates: { ...activeCandidates, include: { firefighter: { include: { rank: true } } } } },
  });
}

/**
 * Gibt eine Stimme für den offenen Wahlgang ab.
 *
 * Geheime Wahl:  `votes` erhält eine Zeile OHNE voterId und OHNE Zeitstempel (zufällige UUID).
 *                Der Teilnahmevermerk liegt separat in `election_voters` und hat keinerlei Verbindung zu `votes`.
 * Öffentliche Wahl: voterId und castAt werden gespeichert.
 *
 * Die Teilnahme je Wahlgang wird per Unique-Constraint atomar in derselben Transaktion erzwungen.
 */
export async function castBallot(electionId: string, firefighterId: string, positionId: string, choice: string) {
  await syncElections();
  const election = await db.election.findUnique({ where: { id: electionId } });
  if (!election) throw new VoteError("Wahl nicht gefunden.");
  const now = new Date();
  if (election.status !== "ACTIVE" || now < election.startsAt || now >= election.endsAt)
    throw new VoteError("Diese Wahl ist aktuell nicht geöffnet.");
  const pos = await getOpenPosition(electionId);
  if (!pos || pos.id !== positionId) throw new VoteError("Dieser Wahlgang ist bereits beendet. Bitte lade die Seite neu.");
  if (!(await isEligible(electionId, firefighterId))) throw new VoteError("Du bist für diese Wahl nicht wahlberechtigt.");

  let candidateId: string | null = null;
  if (choice !== "ABSTAIN") {
    if (!pos.candidates.some((c) => c.id === choice)) throw new VoteError("Ungültige Auswahl.");
    candidateId = choice;
  }

  try {
    await db.$transaction(async (tx) => {
      await tx.electionVoter.create({ data: { electionId, positionId, firefighterId } });
      await tx.vote.create({
        data: election.secret
          ? { electionId, positionId, candidateId, abstain: !candidateId }
          : { electionId, positionId, candidateId, abstain: !candidateId, voterId: firefighterId, castAt: new Date() },
      });
    });
  } catch (e: unknown) {
    if (typeof e === "object" && e && "code" in e && (e as { code: string }).code === "P2002")
      throw new VoteError("Du hast in diesem Wahlgang bereits abgestimmt.");
    throw e;
  }
  // Bewusst KEIN Audit-Eintrag zur Stimmabgabe.
}

/** Gewinner = höchste Stimmenzahl; bei Gleichstand mehrere. */
export function leaders<T extends { votes: number }>(rows: T[]): T[] {
  const max = Math.max(0, ...rows.map((r) => r.votes));
  return max > 0 ? rows.filter((r) => r.votes === max) : [];
}

