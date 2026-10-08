/**
 * Integrationsprüfung gegen eine echte DB (DATABASE_URL):
 *   npx tsx scripts/verify-secret-ballot.ts
 * Legt temporäre Daten an und räumt sie wieder auf.
 */
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { castBallot, finalizeElection } from "../src/lib/elections";

async function main() {
  const unit = await db.fireUnit.create({ data: { name: "TEST-Zug" } });
  const mk = (n: string) => db.firefighter.create({ data: { firstName: n, lastName: "T", displayName: n, units: { create: [{ unitId: unit.id }] } } });
  const [a, b, c, cand1, cand2] = await Promise.all(["A", "B", "C", "K1", "K2"].map(mk));

  const run = async (secret: boolean) => {
    const e = await db.election.create({
      data: {
        name: `TEST ${secret ? "geheim" : "öffentlich"}`, secret, status: "ACTIVE",
        startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 3_600_000),
        eligibleUnits: { create: [{ unitId: unit.id }] },
        positions: { create: [{ title: "Amt", candidates: { create: [{ firefighterId: cand1.id }, { firefighterId: cand2.id }] } }] },
      },
      include: { positions: { include: { candidates: true } } },
    });
    const pos = e.positions[0];
    const [k1, k2] = pos.candidates;
    await castBallot(e.id, a.id, { [pos.id]: k1.id });
    await castBallot(e.id, b.id, { [pos.id]: k1.id });
    await castBallot(e.id, c.id, { [pos.id]: "ABSTAIN" });
    await assert.rejects(castBallot(e.id, a.id, { [pos.id]: k2.id }), /bereits abgestimmt/);
    await Promise.allSettled([castBallot(e.id, cand1.id, { [pos.id]: k2.id }), castBallot(e.id, cand1.id, { [pos.id]: k2.id })]);
    assert.equal(await db.electionVoter.count({ where: { electionId: e.id, firefighterId: cand1.id } }), 1, "parallele Doppelabgabe");

    const votes = await db.vote.findMany({ where: { electionId: e.id } });
    if (secret) assert.ok(votes.every((v) => v.voterId === null && v.castAt === null), "geheim: keine Zuordnung");
    else assert.ok(votes.every((v) => v.voterId && v.castAt));
    await finalizeElection(e.id, null);
    const res = await db.electionResult.findMany({ where: { electionId: e.id } });
    const get = (l: string) => res.find((r) => r.label === l)?.votes;
    assert.equal(get("K1"), 2);
    assert.equal(get("K2"), 1);
    assert.equal(get("Enthaltung"), 1);
    const total = res.filter((r) => !r.isAbstention).reduce((s, r) => s + r.votes, 0);
    assert.equal(total, 3); // a,b -> k1; cand1 -> k2
    console.log(`✓ ${secret ? "Geheime" : "Öffentliche"} Wahl: Ergebnis korrekt, Doppelabgabe verhindert`);
    return e;
  };

  const sec = await run(true);
  await run(false);

  // DB-Trigger: direkter Versuch, eine geheime Stimme einem Wähler zuzuordnen
  const secVote = await db.vote.findFirstOrThrow({ where: { electionId: sec.id } });
  await assert.rejects(db.vote.update({ where: { id: secVote.id }, data: { voterId: a.id } }), /Geheime Wahl/);
  await assert.rejects(db.vote.update({ where: { id: secVote.id }, data: { castAt: new Date() } }), /Geheime Wahl/);
  console.log("✓ DB-Trigger verhindert Zuordnung Mitglied → Stimme bei geheimer Wahl");

  await db.election.deleteMany({ where: { name: { startsWith: "TEST " } } });
  await db.firefighter.deleteMany({ where: { id: { in: [a, b, c, cand1, cand2].map((x) => x.id) } } });
  await db.fireUnit.delete({ where: { id: unit.id } });
}

main().then(() => db.$disconnect()).catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
