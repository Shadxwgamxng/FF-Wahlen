-- Wahlgänge nacheinander: Status je Amt, Teilnahmevermerk je Amt, Rückzug von Kandidaturen.
CREATE TYPE "PositionStatus" AS ENUM ('PENDING', 'OPEN', 'CLOSED');

ALTER TABLE "election_positions" ADD COLUMN     "closedAt" TIMESTAMP(3),
ADD COLUMN     "openedAt" TIMESTAMP(3),
ADD COLUMN     "participantsSnapshot" INTEGER,
ADD COLUMN     "status" "PositionStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "tieDecided" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "winnerCandidateId" TEXT,
ADD COLUMN     "winnerLabel" TEXT;

ALTER TABLE "candidates" ADD COLUMN     "withdrawn" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "withdrawnNote" TEXT;

-- Bestehende Daten überführen: beendete/abgebrochene Wahlen → alle Ämter abgeschlossen,
-- aktive Wahlen → erstes Amt offen. Alte Teilnahmevermerke gehören zum ersten Amt.
UPDATE "election_positions" p SET "status" = 'CLOSED', "closedAt" = now()
  FROM "elections" e WHERE e."id" = p."electionId" AND e."status" IN ('ENDED', 'CANCELLED');
UPDATE "election_positions" p SET "status" = 'OPEN', "openedAt" = now()
  FROM "elections" e WHERE e."id" = p."electionId" AND e."status" = 'ACTIVE'
  AND p."id" = (SELECT x."id" FROM "election_positions" x WHERE x."electionId" = e."id" ORDER BY x."sortOrder", x."id" LIMIT 1);

ALTER TABLE "election_voters" ADD COLUMN "positionId" TEXT;
UPDATE "election_voters" v SET "positionId" =
  (SELECT x."id" FROM "election_positions" x WHERE x."electionId" = v."electionId" ORDER BY x."sortOrder", x."id" LIMIT 1);
DELETE FROM "election_voters" WHERE "positionId" IS NULL;
ALTER TABLE "election_voters" ALTER COLUMN "positionId" SET NOT NULL;

DROP INDEX "election_voters_electionId_firefighterId_key";
CREATE INDEX "election_voters_electionId_idx" ON "election_voters"("electionId");
CREATE UNIQUE INDEX "election_voters_positionId_firefighterId_key" ON "election_voters"("positionId", "firefighterId");
ALTER TABLE "election_voters" ADD CONSTRAINT "election_voters_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "election_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
