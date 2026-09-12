import { resultsHash } from "../src/standings";
import { test, expect } from "vitest";
import { makeTournament } from "../src/testing/fixtures";
import { generateGroupMatches } from "../src/round-robin";
import { calculateStandings } from "../src/standings";
test("points scored outrank wins; incomplete scores do not count", () => {
  const t = makeTournament();
  t.matches = generateGroupMatches(t.teams, t.rules.categories);
  // Red loses twice but scores 38, blue wins once scoring 21.
  Object.assign(t.matches[0], { status: "completed", score: { a: 19, b: 21 } });
  Object.assign(t.matches[3], { status: "completed", score: { a: 19, b: 21 } });
  Object.assign(t.matches[1], { score: { a: 25, b: 24 } });
  const rows = calculateStandings(t);
  expect(rows[0]).toMatchObject({
    teamId: "red",
    pointsFor: 38,
    wins: 0,
    rank: 1,
  });
  expect(rows.find((r) => r.teamId === "blue")).toMatchObject({
    pointsFor: 21,
    wins: 1,
    rank: null,
  });
});
test("empty tournament has no resolved ranking", () =>
  expect(
    calculateStandings(makeTournament()).every((r) => r.rank === null),
  ).toBe(true));

test("manual tie ordering expires after a score change", () => {
  const t = makeTournament();
  t.matches = generateGroupMatches(t.teams, t.rules.categories);
  Object.assign(t.matches[0], { status: "completed", score: { a: 19, b: 21 } });
  Object.assign(t.matches[3], { status: "completed", score: { a: 19, b: 21 } });
  t.tieDecisions = [
    {
      tiedTeamIds: ["blue", "yellow"],
      orderedTeamIds: ["yellow", "blue"],
      reason: "BTC xét đối đầu",
      decidedBy: "admin",
      sourceResultsHash: resultsHash(t),
    },
  ];
  expect(calculateStandings(t).find((r) => r.teamId === "yellow")!.rank).toBe(
    2,
  );
  Object.assign(t.matches[6], { status: "completed", score: { a: 21, b: 0 } });
  expect(
    calculateStandings(t).find((r) => r.teamId === "yellow")!.rank,
  ).toBeNull();
});
