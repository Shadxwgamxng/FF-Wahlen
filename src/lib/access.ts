import { db } from "./db";
import type { CurrentUser } from "./auth";
import { isEligible } from "./eligibility";

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
  const voted = user.firefighter
    ? !!(await db.electionVoter.findUnique({ where: { electionId_firefighterId: { electionId: id, firefighterId: user.firefighter.id } } }))
    : false;
  return { election, eligible, voted, manager };
}
