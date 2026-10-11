import { describe, expect, it } from "vitest";
import { applyCommand, type AdminState } from "../src/commands";
import { deriveDuel } from "../src/duel";
import { PublicTournamentSchema } from "../src/schema";
import { makeTournament } from "../src/testing/fixtures";

const NOW = "2026-10-18T08:00:00+07:00";
const run = (s: AdminState, command: unknown) =>
  applyCommand(s, command, "btc@example.com", NOW);

// Two teams of seven: r1–r6 and b1–b6 are men, r7 and b7 the women.
function makeState(): AdminState {
  const document = makeTournament();
  const priv: AdminState["private"] = {};
  for (const [prefix, teamId] of [
    ["r", "red"],
    ["b", "blue"],
  ] as const)
    for (let i = 1; i <= 7; i++) {
      const id = `${prefix}${i}`;
      document.athletes.push({
        id,
        name: `${teamId === "red" ? "Đỏ" : "Xanh"} ${i}`,
        gender: i === 7 ? "female" : "male",
        teamId,
        active: true,
      });
      priv[id] = { skillBand: 2, phone: null, note: "" };
    }
  return run({ document, private: priv }, { type: "createDuel", payload: {} });
}

type Save = {
  matchId: string;
  pairRed?: [string, string] | null;
  pairBlue?: [string, string] | null;
  status?: "pending" | "live" | "done";
  score?: { red: number; blue: number } | null;
  smashes?: Record<string, { hit: number; net: number }>;
};
const save = (s: AdminState, p: Save) =>
  run(s, {
    type: "saveDuelMatch",
    payload: {
      pairRed: ["r1", "r2"],
      pairBlue: ["b1", "b2"],
      status: "pending",
      score: null,
      smashes: {},
      ...p,
    },
  });
const done = (
  s: AdminState,
  matchId: string,
  red: number,
  blue: number,
  rest: Partial<Save> = {},
) => save(s, { matchId, status: "done", score: { red, blue }, ...rest });
const mixed: Partial<Save> = { pairRed: ["r1", "r7"], pairBlue: ["b1", "b7"] };

describe("bảng đấu — the sheet", () => {
  it("is nine vòng loại matches and two finals, seven plus two and one plus one", () => {
    const { matches } = makeState().document.duel!;
    const count = (stage: string, category: string) =>
      matches.filter((m) => m.stage === stage && m.category === category)
        .length;
    expect(matches).toHaveLength(11);
    expect(count("playoff", "mens_doubles")).toBe(7);
    expect(count("playoff", "mixed_doubles")).toBe(2);
    expect(count("final", "mens_doubles")).toBe(1);
    expect(count("final", "mixed_doubles")).toBe(1);
    expect(matches.map((m) => m.order)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11,
    ]);
    expect(
      matches.every((m) => m.status === "pending" && m.score === null),
    ).toBe(true);
  });

  it("is created once, and removed whole", () => {
    const s = makeState();
    expect(() => run(s, { type: "createDuel", payload: {} })).toThrow(
      "DUEL_EXISTS",
    );
    const gone = run(s, { type: "resetDuel", payload: {} });
    expect(gone.document.duel).toBeUndefined();
    expect(deriveDuel(gone.document)).toBeNull();
    expect(PublicTournamentSchema.safeParse(gone.document).success).toBe(true);
  });
});

describe("bảng đấu — pairs", () => {
  it("accepts two men per side for đôi nam and a man with a woman for đôi nam nữ", () => {
    let s = save(makeState(), { matchId: "vong-loai-1" });
    expect(s.document.duel!.matches[0].pairRed).toEqual(["r1", "r2"]);
    s = save(s, { matchId: "vong-loai-3", ...mixed });
    expect(s.document.duel!.matches[2].pairBlue).toEqual(["b1", "b7"]);
  });

  it("refuses the wrong team, the wrong gender, a doubled player and a resting one", () => {
    const s = makeState();
    expect(() =>
      save(s, { matchId: "vong-loai-1", pairRed: ["r1", "b3"] }),
    ).toThrow("INVALID_LINEUP");
    expect(() =>
      save(s, { matchId: "vong-loai-1", pairRed: ["r1", "r7"] }),
    ).toThrow("INVALID_GENDER");
    expect(() => save(s, { matchId: "vong-loai-3" })).toThrow("INVALID_GENDER");
    expect(() =>
      save(s, { matchId: "vong-loai-1", pairRed: ["r1", "r1"] }),
    ).toThrow();
    const resting = run(s, {
      type: "upsertAthlete",
      payload: {
        id: "r2",
        name: "Đỏ 2",
        gender: "male",
        active: false,
        skillBand: 2,
        phone: null,
        note: "",
      },
    });
    expect(() => save(resting, { matchId: "vong-loai-1" })).toThrow(
      "INVALID_LINEUP",
    );
    expect(() => save(s, { matchId: "khong-co" })).toThrow("MATCH_NOT_FOUND");
  });

  it("will not let a listed player be moved out, removed, or the teams wiped", () => {
    const s = save(makeState(), { matchId: "vong-loai-1" });
    expect(() =>
      run(s, {
        type: "setAthleteTeam",
        payload: { athleteId: "r1", teamId: "blue" },
      }),
    ).toThrow("ATHLETE_IN_LINEUP");
    expect(() =>
      run(s, { type: "removeAthlete", payload: { id: "r1" } }),
    ).toThrow("ATHLETE_IN_LINEUP");
    expect(() => run(s, { type: "resetDraw", payload: {} })).toThrow(
      "DUEL_HAS_LINEUPS",
    );
  });
});

describe("bảng đấu — status and score", () => {
  it("needs both pairs to be called, and a real final score to be finished", () => {
    const s = makeState();
    expect(() =>
      save(s, { matchId: "vong-loai-1", pairBlue: null, status: "live" }),
    ).toThrow("DUEL_NEEDS_PAIRS");
    expect(
      save(s, { matchId: "vong-loai-1", status: "live" }).document.duel!
        .matches[0].status,
    ).toBe("live");
    expect(() => done(s, "vong-loai-1", 20, 18)).toThrow("INVALID_SCORE");
    expect(() => done(s, "vong-loai-1", 21, 20)).toThrow("INVALID_SCORE");
    expect(() => save(s, { matchId: "vong-loai-1", status: "done" })).toThrow(
      "INVALID_SCORE",
    );
    expect(() =>
      save(s, {
        matchId: "vong-loai-1",
        status: "live",
        score: { red: 21, blue: 10 },
      }),
    ).toThrow("INVALID_SCORE");
    for (const [red, blue] of [
      [21, 19],
      [22, 20],
      [25, 24],
      [3, 21],
    ])
      expect(
        done(s, "vong-loai-1", red, blue).document.duel!.matches[0].score,
      ).toEqual({ red, blue });
  });

  it("can be reopened: a finished match goes back to live with no score", () => {
    let s = done(makeState(), "vong-loai-1", 21, 15);
    s = save(s, { matchId: "vong-loai-1", status: "live" });
    expect(s.document.duel!.matches[0]).toMatchObject({
      status: "live",
      score: null,
    });
    expect(deriveDuel(s.document)!.totals.red.points).toBe(0);
  });
});

describe("bảng đấu — totals", () => {
  it("adds every point scored, win or lose, and doubles the finals", () => {
    let s = done(makeState(), "vong-loai-1", 21, 15);
    s = done(s, "vong-loai-2", 18, 21);
    let r = deriveDuel(s.document)!;
    expect(r.totals.red).toMatchObject({ points: 39, wins: 1 });
    expect(r.totals.blue).toMatchObject({ points: 36, wins: 1 });
    expect(r.leader).toBe("red");
    expect(r.played).toBe(2);
    expect(r.finished).toBe(false);

    // Blue wins a final 21–10: worth 42 to 20.
    s = done(s, "chung-ket-1", 10, 21);
    r = deriveDuel(s.document)!;
    expect(r.totals.red).toMatchObject({
      points: 59,
      wins: 1,
      finalPoints: 20,
    });
    expect(r.totals.blue).toMatchObject({
      points: 78,
      wins: 2,
      finalPoints: 42,
    });
    expect(r.leader).toBe("blue");
  });

  it("breaks a level total on matches won, then on final points", () => {
    // Level on everything: 21–19 one way, 19–21 the other.
    let s = done(makeState(), "vong-loai-1", 21, 19);
    s = done(s, "vong-loai-2", 19, 21);
    expect(deriveDuel(s.document)!.leader).toBeNull();

    // 59 points each, but red won two matches to blue's one.
    s = done(makeState(), "vong-loai-1", 21, 19);
    s = done(s, "vong-loai-2", 21, 19);
    s = done(s, "vong-loai-4", 17, 21);
    let r = deriveDuel(s.document)!;
    expect([r.totals.red.points, r.totals.blue.points]).toEqual([59, 59]);
    expect(r.leader).toBe("red");

    // 53 points each and a win each; blue took more from the final.
    s = done(makeState(), "vong-loai-1", 21, 11);
    s = done(s, "chung-ket-1", 16, 21);
    r = deriveDuel(s.document)!;
    expect([r.totals.red.points, r.totals.blue.points]).toEqual([53, 53]);
    expect([r.totals.red.wins, r.totals.blue.wins]).toEqual([1, 1]);
    expect(r.leader).toBe("blue");
  });

  it("says nobody leads before a match is played, and knows when all eleven are in", () => {
    let s = makeState();
    expect(deriveDuel(s.document)).toMatchObject({
      leader: null,
      played: 0,
      finished: false,
    });
    for (const m of s.document.duel!.matches)
      s = done(s, m.id, 21, 12, m.category === "mixed_doubles" ? mixed : {});
    const r = deriveDuel(s.document)!;
    expect(r.finished).toBe(true);
    // 9 × 21 + 2 × 42 against 9 × 12 + 2 × 24.
    expect(r.totals.red.points).toBe(273);
    expect(r.totals.blue.points).toBe(156);
    expect(r.totals.red.wins).toBe(11);
  });
});

describe("bảng đấu — smash counts", () => {
  it("adds each athlete's two counts across their matches and ranks them", () => {
    let s = done(makeState(), "vong-loai-1", 21, 15, {
      smashes: { r1: { hit: 4, net: 1 }, b2: { hit: 2, net: 5 } },
    });
    s = done(s, "vong-loai-2", 21, 15, {
      smashes: { r1: { hit: 3, net: 0 }, b1: { hit: 6, net: 0 } },
    });
    const r = deriveDuel(s.document)!;
    expect(r.smashHit.map((x) => [x.athleteId, x.hit])).toEqual([
      ["r1", 7],
      ["b1", 6],
      ["b2", 2],
    ]);
    expect(r.smashNet.map((x) => [x.athleteId, x.net])).toEqual([
      ["b2", 5],
      ["r1", 1],
    ]);
    expect(r.smashHit[0]).toMatchObject({ name: "Đỏ 1", teamId: "red" });
  });

  it("counts only the match's own players, and drops a swapped-out player's count", () => {
    const s = makeState();
    let next = save(s, {
      matchId: "vong-loai-1",
      smashes: { r5: { hit: 9, net: 9 } },
    });
    expect(next.document.duel!.matches[0].smashes).toEqual({});
    next = save(s, {
      matchId: "vong-loai-1",
      smashes: { r2: { hit: 3, net: 0 }, b1: { hit: 0, net: 0 } },
    });
    expect(next.document.duel!.matches[0].smashes).toEqual({
      r2: { hit: 3, net: 0 },
    });
    next = save(next, {
      matchId: "vong-loai-1",
      pairRed: ["r1", "r3"],
      smashes: { r2: { hit: 3, net: 0 } },
    });
    expect(next.document.duel!.matches[0].smashes).toEqual({});
  });

  it("counts how many matches and finals each athlete is down for", () => {
    let s = save(makeState(), { matchId: "vong-loai-1" });
    s = save(s, { matchId: "vong-loai-2", pairRed: ["r1", "r3"] });
    s = save(s, { matchId: "chung-ket-1", pairRed: ["r1", "r4"] });
    const { appearances } = deriveDuel(s.document)!;
    expect(appearances.r1).toEqual({ matches: 3, finals: 1 });
    expect(appearances.r3).toEqual({ matches: 1, finals: 0 });
    expect(appearances.r6).toBeUndefined();
  });
});
