import { db } from "./db";
import type { CurrentUser } from "./auth";
import { isEligible } from "./eligibility";

export async function hasVotedIn(positionId: string, firefighterId: string) {
  return !!(await db.electionVoter.findUnique({ where: { positionId_firefighterId: { positionId, firefighterId } } }));
}

/** Darf der Benutzer die Wahl sehen? Entwürfe nur für Verwalter, laufende/geplante nur für Berechtigte. */
export async function loadElectionForUser(user: CurrentUser, id: string) {
  const election = await db.election.findUnique({
    where: { id },
    include: {
      positions: { orderBy: { sortOrder: "asc" }, include: { candidates: { orderBy: { sortOrder: "asc" }, include: { firefighter: { include: { rank: true } } } } } },
    },
  });
  if (!election) return null;
  const eligible = user.firefighter ? await isEligible(id, user.firefighter.id) : false;
  const manager = user.can("elections.view_all");
  const visible =
    manager ||
    (["SCHEDULED", "ACTIVE"].includes(election.status) && eligible) ||
    (["ENDED", "CANCELLED"].includes(election.status));
  if (!visible) return null;
  const openPosition = election.positions.find((p) => p.status === "OPEN") ?? null;
  const voted = user.firefighter && openPosition ? await hasVotedIn(openPosition.id, user.firefighter.id) : false;
  return { election, eligible, voted, manager, openPosition };
}

/** Hat das Mitglied im aktuell offenen Wahlgang schon abgestimmt? (false, wenn keiner offen ist) */
export async function votedInOpenRound(electionId: string, firefighterId: string) {
  const open = await db.electionPosition.findFirst({ where: { electionId, status: "OPEN" }, select: { id: true } });
  return open ? hasVotedIn(open.id, firefighterId) : false;
}
