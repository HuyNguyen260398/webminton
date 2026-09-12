import { test, expect } from "vitest";
import { makeTournament, makeRoster } from "../src/testing/fixtures";
import { generateDraw, confirmDraw } from "../src/draw";
test.each([16, 17, 23, 24])(
  "draw %i athletes preserves eligibility across 100 seeds",
  (count) => {
    const t = makeTournament();
    t.athletes = makeRoster(count);
    for (let i = 0; i < 100; i++) {
      const d = generateDraw(t, `seed-${i}`);
      expect(Object.keys(d.assignment).sort()).toEqual(
        t.athletes.map((a) => a.id).sort(),
      );
      const groups = t.teams.map((team) =>
        t.athletes.filter((a) => d.assignment[a.id] === team.id),
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
      expect(generateDraw(t, `seed-${i}`)).toEqual(d);
    }
  },
);
test("missing skill or insufficient women blocks the default format", () => {
  const t = makeTournament();
  t.athletes = makeRoster(16);
  t.athletes[0].skillBand = null;
  expect(() => generateDraw(t, "seed")).toThrow("MISSING_SKILL");
  t.athletes = makeRoster(15);
  expect(() => generateDraw(t, "seed")).toThrow("INSUFFICIENT_ROSTER");
});
test("confirmation refuses a changed roster and is repeatable", () => {
  const t = makeTournament();
  t.athletes = makeRoster(24);
  t.draw = generateDraw(t, "seed");
  const confirmed = confirmDraw(t, t.draw.rosterHash!);
  expect(confirmed.draw.status).toBe("confirmed");
  expect(confirmDraw(confirmed, t.draw.rosterHash!)).toEqual(confirmed);
  t.athletes[0].skillBand = 3;
  expect(() => confirmDraw(t, t.draw.rosterHash!)).toThrow("STALE_ROSTER");
});
