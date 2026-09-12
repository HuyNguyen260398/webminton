import { test, expect } from "vitest";
import { makeCompletedGroup, makeRoster } from "../src/testing/fixtures";
import {
  findScheduleConflicts,
  reorderMatches,
  validateLineup,
} from "../src/schedule";
test("reordering preserves match identities and rejects invalid permutations", () => {
  const m = makeCompletedGroup().matches;
  const out = reorderMatches(m, m.map((x) => x.id).reverse());
  expect(out[0].id).toBe(m[17].id);
  expect(out[0].score).toEqual({ a: 21, b: 18 });
  expect(out.map((x) => x.order)).toEqual(
    Array.from({ length: 18 }, (_, i) => i + 1),
  );
  expect(() => reorderMatches(m, Array(18).fill(m[0].id))).toThrow();
});
test("interval overlap detects court and athlete conflicts but allows adjacent slots", () => {
  const [a, b] = makeCompletedGroup().matches;
  a.courtId = b.courtId = "court1";
  a.startsAt = "2026-10-25T01:00:00Z";
  a.endsAt = "2026-10-25T01:30:00Z";
  b.startsAt = "2026-10-25T01:15:00Z";
  b.endsAt = "2026-10-25T01:45:00Z";
  a.pairA = ["p1", "p2"];
  b.pairB = ["p1", "p3"];
  expect(findScheduleConflicts([a, b]).map((x) => x.reason)).toEqual([
    "court",
    "athlete",
  ]);
  b.startsAt = a.endsAt;
  expect(findScheduleConflicts([a, b])).toEqual([]);
});
test("lineups require two active eligible teammates on each side", () => {
  const t = makeCompletedGroup();
  t.athletes = makeRoster(8);
  for (const [i, a] of t.athletes.entries()) a.teamId = i < 4 ? "red" : "blue";
  const m = t.matches[0];
  m.pairA = ["athlete-1", "athlete-3"];
  m.pairB = ["athlete-5", "athlete-7"];
  expect(() => validateLineup(t, m)).not.toThrow();
  m.pairA = ["athlete-1", "athlete-1"];
  expect(() => validateLineup(t, m)).toThrow();
  m.pairA = ["athlete-1", "athlete-2"];
  expect(() => validateLineup(t, m)).toThrow();
  m.pairA = ["athlete-1", "athlete-5"];
  expect(() => validateLineup(t, m)).toThrow();
});
