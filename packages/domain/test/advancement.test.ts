import { test, expect } from "vitest";
import { makeTournament } from "../src/testing/fixtures";
import { generateGroupMatches } from "../src/round-robin";
import { deriveTournament } from "../src/derive";
import { seedPlacement, applyScore, resetPlacement } from "../src/advancement";
function completed() {
  const t = makeTournament();
  t.matches = generateGroupMatches(t.teams, t.rules.categories).map((m) => ({
    ...m,
    status: "completed",
    score: { a: 21, b: 18 },
  }));
  return t;
}
test("seeds only when all 18 results are complete", () => {
  const t = completed();
  t.matches[0].status = "pending";
  t.matches[0].score = null;
  expect(seedPlacement(t).matches).toHaveLength(18);
  const seeded = seedPlacement(completed());
  expect(seeded.matches).toHaveLength(24);
  expect(
    seeded.matches
      .filter((m) => m.phase === "first_place")
      .every((m) => m.teamAId === "red" && m.teamBId === "blue"),
  ).toBe(true);
  expect(
    seeded.matches
      .filter((m) => m.phase === "third_place")
      .every((m) => m.teamAId === "yellow" && m.teamBId === "white"),
  ).toBe(true);
});
test("two wins determine champion without removing third match", () => {
  let t = seedPlacement(completed());
  const finals = t.matches.filter((m) => m.phase === "first_place");
  for (const m of finals.slice(0, 2)) t = applyScore(t, m.id, { a: 21, b: 10 });
  const results = deriveTournament(t);
  expect(results.champion).toBe("red");
  expect(results.runnerUp).toBe("blue");
  expect(t.matches).toHaveLength(24);
  expect(results.finalized).toBe(false);
  expect(t.matches.find((m) => m.id === finals[2].id)!.score).toBeNull();
});
test("changing an upstream result cannot invalidate a called final", () => {
  const t = seedPlacement(completed());
  t.matches.find((m) => m.phase === "first_place")!.status = "called";
  // Red loses 21 points while white gains 3, changing the final seeds.
  const m = t.matches.find(
    (m) => m.teamAId === "red" && m.teamBId === "white",
  )!;
  expect(() => applyScore(t, m.id, { a: 0, b: 21 })).toThrow(
    "PLACEMENT_RESET_REQUIRED",
  );
  expect(() =>
    applyScore(resetPlacement(t), m.id, { a: 0, b: 21 }),
  ).not.toThrow();
});
test("walkovers count as completed results and invalid scores never advance", () => {
  const t = completed();
  t.matches[0].status = "walkover";
  t.matches[0].score = { a: 21, b: 0 };
  expect(seedPlacement(t).matches).toHaveLength(24);
  t.matches[0].score = { a: 21, b: 20 };
  expect(() => deriveTournament(t)).toThrow("INVALID_SCORE");
});
test("unplayed group leaves final slots unresolved", () => {
  const empty = makeTournament();
  empty.matches = generateGroupMatches(empty.teams, empty.rules.categories);
  expect(seedPlacement(empty).matches.every((m) => m.phase === "group")).toBe(
    true,
  );
});
