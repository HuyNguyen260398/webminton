import { test, expect } from "vitest";
import { makeTournament } from "../src/testing/fixtures";
import { generateGroupMatches } from "../src/round-robin";
test("four teams play six encounters and 18 matches, nine per team", () => {
  const t = makeTournament(),
    m = generateGroupMatches(t.teams, t.rules.categories);
  expect(m).toHaveLength(18);
  expect(new Set(m.map((x) => x.encounterId)).size).toBe(6);
  expect(new Set(m.map((x) => x.id)).size).toBe(18);
  for (const team of t.teams)
    expect(
      m.filter((x) => [x.teamAId, x.teamBId].includes(team.id)),
    ).toHaveLength(9);
  for (const id of new Set(m.map((x) => x.encounterId)))
    expect(
      m.filter((x) => x.encounterId === id).map((x) => x.category),
    ).toEqual(["mens_doubles", "womens_doubles", "mixed_doubles"]);
  expect(m.every((x) => x.score === null && x.status === "pending")).toBe(true);
});
test("refuses unsupported tournament formats", () => {
  const t = makeTournament();
  expect(() =>
    generateGroupMatches(t.teams.slice(1), t.rules.categories),
  ).toThrow();
  expect(() => generateGroupMatches(t.teams, ["mens_doubles"])).toThrow();
});
