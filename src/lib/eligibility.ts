import { db } from "./db";

export type EligibilityConfig = {
  unitIds: Set<string>;
  includeIds: Set<string>;
  excludeIds: Set<string>;
};

export type EligibilityReason = "EXCLUDED" | "INCLUDED" | "UNIT" | "NONE" | "INACTIVE";

/**
 * Priorität:
 * 1. Expliziter Ausschluss
 * 2. Explizite Berechtigung
 * 3. Gruppenberechtigung (Löschzug)
 * 4. Keine Berechtigung
 * Nicht aktive Mitglieder sind nie wahlberechtigt.
 */
export function resolveEligibility(
  member: { id: string; status: string; unitIds: string[] },
  cfg: EligibilityConfig,
): { eligible: boolean; reason: EligibilityReason } {
  if (member.status !== "AKTIV") return { eligible: false, reason: "INACTIVE" };
  if (cfg.excludeIds.has(member.id)) return { eligible: false, reason: "EXCLUDED" };
  if (cfg.includeIds.has(member.id)) return { eligible: true, reason: "INCLUDED" };
  if (member.unitIds.some((u) => cfg.unitIds.has(u))) return { eligible: true, reason: "UNIT" };
  return { eligible: false, reason: "NONE" };
}

export async function loadEligibilityConfig(electionId: string): Promise<EligibilityConfig> {
  const [units, inc, exc] = await Promise.all([
    db.electionEligibleUnit.findMany({ where: { electionId } }),
    db.electionEligibleFirefighter.findMany({ where: { electionId } }),
    db.electionExcludedFirefighter.findMany({ where: { electionId } }),
  ]);
  return {
    unitIds: new Set(units.map((u) => u.unitId)),
    includeIds: new Set(inc.map((u) => u.firefighterId)),
    excludeIds: new Set(exc.map((u) => u.firefighterId)),
  };
}

export async function getEligibleMembers(electionId: string) {
  const [cfg, members] = await Promise.all([
    loadEligibilityConfig(electionId),
    db.firefighter.findMany({ include: { units: true, rank: true }, orderBy: [{ lastName: "asc" }, { firstName: "asc" }] }),
  ]);
  return members.filter(
    (m) => resolveEligibility({ id: m.id, status: m.status, unitIds: m.units.map((u) => u.unitId) }, cfg).eligible,
  );
}

export async function isEligible(electionId: string, firefighterId: string) {
  const [cfg, m] = await Promise.all([
    loadEligibilityConfig(electionId),
    db.firefighter.findUnique({ where: { id: firefighterId }, include: { units: true } }),
  ]);
  if (!m) return false;
  return resolveEligibility({ id: m.id, status: m.status, unitIds: m.units.map((u) => u.unitId) }, cfg).eligible;
}
