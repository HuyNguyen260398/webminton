import { test, expect } from "vitest";
import { makeTournament, makeRoster } from "../src/testing/fixtures";
import { generateDraw, rosterHash } from "../src/draw";

test.each([16, 17, 23, 24])(
  "draw %i athletes preserves eligibility across 100 seeds",
  (count) => {
    const { teams } = makeTournament();
    const roster = makeRoster(count);
    for (let i = 0; i < 100; i++) {
      const d = generateDraw(roster, teams, `seed-${i}`);
      expect(Object.keys(d.assignment).sort()).toEqual(
        roster.athletes.map((a) => a.id).sort(),
      );
      const groups = teams.map((team) =>
        roster.athletes.filter((a) => d.assignment[a.id] === team.id),
      );
      expect(
        Math.max(...groups.map((g) => g.length)) -
          Math.min(...groups.map((g) => g.length)),
      ).toBeLessThanOrEqual(1);
      for (const g of groups)
        for (const gender of ["male", "female"])
          expect(
            g.filter((a) => a.gender === gender).length,
          ).toBeGreaterThanOrEqual(2);
      expect(generateDraw(roster, teams, `seed-${i}`)).toEqual(d);
    }
  },
);

test("missing skill or insufficient women blocks the default format", () => {
  const { teams } = makeTournament();
  const roster = makeRoster(16);
  roster.athletes[0].skillBand = null;
  expect(() => generateDraw(roster, teams, "seed")).toThrow("MISSING_SKILL");
  expect(() => generateDraw(makeRoster(15), teams, "seed")).toThrow(
    "INSUFFICIENT_ROSTER",
  );
});

test("a confirmed draw assigns every active athlete", () => {
  const { teams } = makeTournament();
  const roster = makeRoster(24);
  const d = generateDraw(roster, teams, "seed");
  expect(d.status).toBe("confirmed");
  expect(d.algorithmVersion).toBe("balanced-v1");
  for (const a of roster.athletes)
    expect(teams.map((t) => t.id)).toContain(d.assignment[a.id]);
});

test("inactive athletes are left out of the draw", () => {
  const { teams } = makeTournament();
  const roster = makeRoster(24);
  roster.athletes[0].active = false;
  const d = generateDraw(roster, teams, "seed");
  expect(d.assignment[roster.athletes[0].id]).toBeUndefined();
  expect(Object.keys(d.assignment)).toHaveLength(23);
});

test("rosterHash tracks skill, gender and membership but not name", () => {
  const roster = makeRoster(16);
  const before = rosterHash(roster);
  expect(rosterHash(makeRoster(16))).toBe(before);

  const renamed = makeRoster(16);
  renamed.athletes[0].name = "Tên khác";
  expect(rosterHash(renamed)).toBe(before);

  const reskilled = makeRoster(16);
  reskilled.athletes[0].skillBand =
    reskilled.athletes[0].skillBand === 3 ? 1 : 3;
  expect(rosterHash(reskilled)).not.toBe(before);

  const shorter = makeRoster(16);
  shorter.athletes[0].active = false;
  expect(rosterHash(shorter)).not.toBe(before);
});
