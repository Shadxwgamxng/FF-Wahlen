/**
 * Integrationsprüfung gegen eine echte DB (DATABASE_URL):
 *   npx tsx scripts/verify-secret-ballot.ts
 * Prüft: Geheimhaltung, Doppelabgabe, nacheinander laufende Wahlgänge, automatischer Rückzug
 * bereits gewählter Kandidaten, Gleichstand. Räumt die Testdaten wieder auf.
 */
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { advanceElection, castBallot, openNextPosition } from "../src/lib/elections";

async function main() {
  const unit = await db.fireUnit.create({ data: { name: "TEST-Zug" } });
  const mk = (n: string) => db.firefighter.create({ data: { firstName: n, lastName: "T", displayName: n, units: { create: [{ unitId: unit.id }] } } });
  const [a, b, c, k1, k2, k3] = await Promise.all(["A", "B", "C", "K1", "K2", "K3"].map(mk));
  const members = [a, b, c, k1, k2, k3];

  const make = async (secret: boolean) => {
    const e = await db.election.create({
      data: {
        name: `TEST ${secret ? "geheim" : "öffentlich"}`, secret, status: "ACTIVE",
        startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 3_600_000),
        eligibleUnits: { create: [{ unitId: unit.id }] },
        positions: {
          create: [
            { title: "Wehrführer", sortOrder: 0, candidates: { create: [{ firefighterId: k1.id }, { firefighterId: k2.id }] } },
            // K1 kandidiert auch als Stellvertreter, K3 nur hier
            { title: "Stellvertreter", sortOrder: 1, candidates: { create: [{ firefighterId: k1.id }, { firefighterId: k3.id }] } },
            // Nur K1 → nach seiner Wahl bleibt hier niemand übrig → Wahlgang entfällt
            { title: "Schriftführer", sortOrder: 2, candidates: { create: [{ firefighterId: k1.id }] } },
          ],
        },
      },
      include: { positions: { orderBy: { sortOrder: "asc" }, include: { candidates: true } } },
    });
    await openNextPosition(e.id, null);
    return e;
  };

  const run = async (secret: boolean) => {
    const e = await make(secret);
    const [p1, p2] = e.positions;
    const cand = (p: typeof p1, ffId: string) => p.candidates.find((x) => x.firefighterId === ffId)!.id;

    // Nur Wahlgang 1 ist offen
    assert.deepEqual((await db.electionPosition.findMany({ where: { electionId: e.id }, orderBy: { sortOrder: "asc" } })).map((p) => p.status), ["OPEN", "PENDING", "PENDING"]);
    await assert.rejects(castBallot(e.id, a.id, p2.id, cand(p2, k3.id)), /bereits beendet/);

    // Wahlgang 1: K1 gewinnt 3:1, 1 Enthaltung
    await castBallot(e.id, a.id, p1.id, cand(p1, k1.id));
    await castBallot(e.id, b.id, p1.id, cand(p1, k1.id));
    await castBallot(e.id, c.id, p1.id, cand(p1, k1.id));
    await castBallot(e.id, k2.id, p1.id, cand(p1, k2.id));
    await castBallot(e.id, k3.id, p1.id, "ABSTAIN");
    await assert.rejects(castBallot(e.id, a.id, p1.id, cand(p1, k2.id)), /bereits abgestimmt/);
    await Promise.allSettled([castBallot(e.id, k1.id, p1.id, cand(p1, k2.id)), castBallot(e.id, k1.id, p1.id, cand(p1, k2.id))]);
    assert.equal(await db.electionVoter.count({ where: { positionId: p1.id, firefighterId: k1.id } }), 1, "parallele Doppelabgabe");

    const votes = await db.vote.findMany({ where: { positionId: p1.id } });
    if (secret) assert.ok(votes.every((v) => v.voterId === null && v.castAt === null), "geheim: keine Zuordnung");
    else assert.ok(votes.every((v) => v.voterId && v.castAt));

    const r1 = await advanceElection(e.id, null);
    assert.equal(r1.winner?.firefighterId, k1.id);

    // K1 wurde aus Stellvertreter + Schriftführer zurückgezogen
    const after = await db.electionPosition.findMany({ where: { electionId: e.id }, orderBy: { sortOrder: "asc" }, include: { candidates: true } });
    assert.equal(after[0].status, "CLOSED");
    assert.equal(after[1].status, "OPEN");
    assert.ok(after[1].candidates.find((x) => x.firefighterId === k1.id)!.withdrawn);
    assert.ok(!after[1].candidates.find((x) => x.firefighterId === k3.id)!.withdrawn);
    await assert.rejects(castBallot(e.id, a.id, p2.id, cand(p2, k1.id)), /Ungültige Auswahl/);

    // Ergebnis Wahlgang 1
    const res = await db.electionResult.findMany({ where: { positionId: p1.id } });
    assert.equal(res.find((r) => r.label === "K1")?.votes, 3);
    assert.equal(res.find((r) => r.label === "K2")?.votes, 2); // K2 selbst + K1 (paralleler Doppelversuch zählt einmal)
    assert.equal(res.find((r) => r.label === "Enthaltung")?.votes, 1);

    // Wahlgang 2: K3 gewinnt
    await castBallot(e.id, a.id, p2.id, cand(p2, k3.id));
    await castBallot(e.id, b.id, p2.id, cand(p2, k3.id));
    // Wähler dürfen im neuen Wahlgang erneut abstimmen
    await castBallot(e.id, c.id, p2.id, "ABSTAIN");
    const r2 = await advanceElection(e.id, null);
    assert.equal(r2.winner?.firefighterId, k3.id);

    // Wahlgang 3 entfiel (keine Kandidaten) → Wahl automatisch beendet
    const fin = await db.election.findUniqueOrThrow({ where: { id: e.id } });
    assert.equal(fin.status, "ENDED");
    assert.equal(fin.participantsSnapshot, 6);
    console.log(`✓ ${secret ? "Geheime" : "Öffentliche"} Wahl: Wahlgänge nacheinander, Rückzug des Gewählten, Ergebnis, Doppelabgabe verhindert`);
    return e;
  };

  const sec = await run(true);
  await run(false);

  // Gleichstand
  const t = await db.election.create({
    data: {
      name: "TEST Gleichstand", secret: true, status: "ACTIVE", startsAt: new Date(Date.now() - 60_000), endsAt: new Date(Date.now() + 3_600_000),
      eligibleUnits: { create: [{ unitId: unit.id }] },
      positions: { create: [{ title: "Amt", candidates: { create: [{ firefighterId: k1.id }, { firefighterId: k2.id }] } }] },
    },
    include: { positions: { include: { candidates: true } } },
  });
  await openNextPosition(t.id, null);
  const tp = t.positions[0];
  await castBallot(t.id, a.id, tp.id, tp.candidates[0].id);
  await castBallot(t.id, b.id, tp.id, tp.candidates[1].id);
  await assert.rejects(advanceElection(t.id, null), /Stimmengleichheit/);
  const tr = await advanceElection(t.id, null, { tieWinner: tp.candidates[1].id });
  assert.equal(tr.winner?.id, tp.candidates[1].id);
  console.log("✓ Stimmengleichheit erfordert Entscheidung");

  // DB-Trigger
  const secVote = await db.vote.findFirstOrThrow({ where: { electionId: sec.id } });
  await assert.rejects(db.vote.update({ where: { id: secVote.id }, data: { voterId: a.id } }), /Geheime Wahl/);
  await assert.rejects(db.vote.update({ where: { id: secVote.id }, data: { castAt: new Date() } }), /Geheime Wahl/);
  console.log("✓ DB-Trigger verhindert Zuordnung Mitglied → Stimme bei geheimer Wahl");

  await db.election.deleteMany({ where: { name: { startsWith: "TEST " } } });
  await db.firefighter.deleteMany({ where: { id: { in: members.map((x) => x.id) } } });
  await db.fireUnit.delete({ where: { id: unit.id } });
}

main().then(() => db.$disconnect()).catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
