import { describe, expect, it, test } from "vitest";
import { PublicTournamentSchema } from "../src/schema";
import { makeTournament } from "../src/testing/fixtures";

test("clean fixture initializes an empty tournament", () => {
  const t = makeTournament();
  expect(t.athletes).toEqual([]);
  expect(t.matches.every((m) => m.score === null)).toBe(true);
  expect(t.info.feeVnd).toBeNull();
  expect(t.draw.status).toBe("not_started");
});

test("rejects duplicate team IDs", () => {
  const t = makeTournament();
  expect(
    PublicTournamentSchema.safeParse({
      ...t,
      teams: Array(4).fill(t.teams[0]),
    }).success,
  ).toBe(false);
});

test("rejects missing team references and foreign fields", () => {
  const t = makeTournament();
  const athlete = {
    id: "a1",
    name: "An",
    gender: "female",
    teamId: "missing",
    active: true,
  };
  expect(
    PublicTournamentSchema.safeParse({ ...t, athletes: [athlete] }).success,
  ).toBe(false);
  expect(PublicTournamentSchema.safeParse({ ...t, admin: true }).success).toBe(
    false,
  );
});

test("requires a QR asset path once the QR is published", () => {
  const t = makeTournament();
  expect(
    PublicTournamentSchema.safeParse({
      ...t,
      info: { ...t.info, qrPublished: true, qrAssetPath: null },
    }).success,
  ).toBe(false);
});

describe("PublicTournamentSchema strips private data", () => {
  it("rejects an athlete carrying a phone number", () => {
    const t = makeTournament();
    t.athletes.push({
      id: "a1",
      name: "Nguyễn Văn A",
      gender: "male",
      teamId: null,
      active: true,
      phone: "0900000000",
    } as never);
    expect(PublicTournamentSchema.safeParse(t).success).toBe(false);
  });

  it("rejects an athlete carrying a skill band", () => {
    const t = makeTournament();
    t.athletes.push({
      id: "a1",
      name: "Nguyễn Văn A",
      gender: "male",
      teamId: null,
      active: true,
      skillBand: 2,
    } as never);
    expect(PublicTournamentSchema.safeParse(t).success).toBe(false);
  });

  it("rejects a finance block carrying feePayments", () => {
    const t = makeTournament();
    (t.finance as Record<string, unknown>).feePayments = [];
    expect(PublicTournamentSchema.safeParse(t).success).toBe(false);
  });

  it("rejects revision, results, audit and requests", () => {
    for (const key of ["audit", "requests", "results", "revision"]) {
      const t = makeTournament() as Record<string, unknown>;
      t[key] = key === "revision" ? 1 : [];
      expect(PublicTournamentSchema.safeParse(t).success).toBe(false);
    }
  });

  it("rejects draw internals", () => {
    for (const key of ["seed", "rosterHash"]) {
      const t = makeTournament();
      (t.draw as unknown as Record<string, unknown>)[key] = "x";
      expect(PublicTournamentSchema.safeParse(t).success).toBe(false);
    }
  });

  it("accepts the fixture document", () => {
    expect(PublicTournamentSchema.safeParse(makeTournament()).success).toBe(
      true,
    );
  });
});
