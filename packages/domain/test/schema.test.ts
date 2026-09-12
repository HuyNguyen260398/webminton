import { expect, test } from "vitest";
import seed from "../../../data/tournament.seed.json";
import { TournamentSchema } from "../src/schema";

test("clean seed can initialize an empty tournament", () => {
  const t = TournamentSchema.parse(seed);
  expect(t.athletes).toEqual([]);
  expect(t.matches.every((m) => m.score === null)).toBe(true);
  expect(t.info.feeVnd).toBeNull();
  expect(t.results.champion).toBeNull();
});
test("rejects negative revisions", () => {
  expect(TournamentSchema.safeParse({ ...seed, revision: -1 }).success).toBe(
    false,
  );
});
test("rejects duplicate team IDs", () => {
  expect(
    TournamentSchema.safeParse({ ...seed, teams: Array(4).fill(seed.teams[0]) })
      .success,
  ).toBe(false);
});
test("rejects missing team references and foreign fields", () => {
  const athlete = {
    id: "a1",
    name: "An",
    gender: "female",
    skillBand: 1,
    teamId: "missing",
    phone: null,
    note: "",
    active: true,
  };
  expect(
    TournamentSchema.safeParse({ ...seed, athletes: [athlete] }).success,
  ).toBe(false);
  expect(TournamentSchema.safeParse({ ...seed, admin: true }).success).toBe(
    false,
  );
});
