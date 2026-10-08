import test from "node:test";
import assert from "node:assert/strict";
import { resolveEligibility } from "./eligibility";

const cfg = (u: string[], i: string[], e: string[]) => ({
  unitIds: new Set(u), includeIds: new Set(i), excludeIds: new Set(e),
});
const m = (id: string, units: string[], status = "AKTIV") => ({ id, status, unitIds: units });

test("Gruppenberechtigung", () => {
  assert.equal(resolveEligibility(m("a", ["lz11"]), cfg(["lz11"], [], [])).eligible, true);
  assert.equal(resolveEligibility(m("a", ["lz31"]), cfg(["lz11"], [], [])).reason, "NONE");
});
test("Ausschluss schlägt Einzelberechtigung und Gruppe", () => {
  assert.equal(resolveEligibility(m("a", ["lz11"]), cfg(["lz11"], ["a"], ["a"])).reason, "EXCLUDED");
});
test("Einzelberechtigung ohne Gruppe", () => {
  assert.equal(resolveEligibility(m("a", []), cfg([], ["a"], [])).reason, "INCLUDED");
});
test("Inaktive Mitglieder nie wahlberechtigt", () => {
  assert.equal(resolveEligibility(m("a", ["lz11"], "INAKTIV"), cfg(["lz11"], ["a"], [])).eligible, false);
});
