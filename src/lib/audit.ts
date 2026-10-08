import { db } from "./db";
import type { CurrentUser } from "./auth";

type Actor = Pick<CurrentUser, "id" | "name"> | null;

/**
 * Schreibt einen Audit-Eintrag.
 * WICHTIG: Hier dürfen bei geheimen Wahlen niemals Wahlentscheidungen auftauchen.
 */
export async function audit(
  actor: Actor,
  action: string,
  message: string,
  entity?: { type: string; id?: string },
) {
  await db.auditLog.create({
    data: {
      actorUserId: actor?.id ?? null,
      actorName: actor?.name ?? "System",
      action,
      entityType: entity?.type,
      entityId: entity?.id,
      message,
    },
  });
}
