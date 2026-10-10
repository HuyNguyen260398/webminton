import { describe, expect, it } from "vitest";
import { applyCommand, type AdminState } from "../src/commands";
import { deriveTournament } from "../src/derive";
import { makeAdminState as rosterState } from "../src/testing/fixtures";

const NOW = "2026-10-18T08:00:00+07:00";
const run = (s: AdminState, command: unknown) =>
  applyCommand(s, command, "btc@example.com", NOW);
const drawn = () =>
  run(rosterState(), { type: "confirmDraw", payload: { seed: "s1" } });
const pick = (s: AdminState, team: string, gender: string, n: number) =>
  s.document.athletes
    .filter((a) => a.teamId === team && a.gender === gender)
    .slice(0, n)
    .map((a) => a.id);
const score = (s: AdminState, matchId: string, a: number, b: number) =>
  run(s, { type: "setScore", payload: { matchId, score: { a, b } } });
// Every group match 21–18 to side A: red, blue, yellow, white in that order.
const playGroup = (s: AdminState) =>
  s.document.matches
    .filter((m) => m.phase === "group")
    .reduce((acc, m) => score(acc, m.id, 21, 18), s);

const MENS = "group-red-blue-mens_doubles";

describe("applyCommand — lineups and schedule", () => {
  it("accepts a valid lineup and rejects the wrong gender or team", () => {
    const s = drawn();
    const ok = run(s, {
      type: "setLineup",
      payload: {
        matchId: MENS,
        pairA: pick(s, "red", "male", 2),
        pairB: pick(s, "blue", "male", 2),
      },
    });
    expect(ok.document.matches[0].pairA).toEqual(pick(s, "red", "male", 2));
    expect(() =>
      run(s, {
        type: "setLineup",
        payload: {
          matchId: MENS,
          pairA: pick(s, "red", "female", 2),
          pairB: pick(s, "blue", "male", 2),
        },
      }),
    ).toThrow("INVALID_GENDER");
    expect(() =>
      run(s, {
        type: "setLineup",
        payload: {
          matchId: MENS,
          pairA: pick(s, "yellow", "male", 2),
          pairB: pick(s, "blue", "male", 2),
        },
      }),
    ).toThrow("INVALID_LINEUP");
    expect(() =>
      run(s, {
        type: "setLineup",
        payload: { matchId: "nope", pairA: ["a", "b"], pairB: ["c", "d"] },
      }),
    ).toThrow("MATCH_NOT_FOUND");
  });

  it("publishes only a complete lineup, and blocks moving a listed athlete", () => {
    const s = drawn();
    expect(() =>
      run(s, {
        type: "publishLineup",
        payload: { matchId: MENS, published: true },
      }),
    ).toThrow("INVALID_LINEUP");
    const lined = run(s, {
      type: "setLineup",
      payload: {
        matchId: MENS,
        pairA: pick(s, "red", "male", 2),
        pairB: pick(s, "blue", "male", 2),
      },
    });
    const published = run(lined, {
      type: "publishLineup",
      payload: { matchId: MENS, published: true },
    });
    expect(published.document.matches[0].lineupPublished).toBe(true);
    const [listed] = pick(s, "red", "male", 1);
    expect(() =>
      run(lined, {
        type: "setAthleteTeam",
        payload: { athleteId: listed, teamId: "white" },
      }),
    ).toThrow("ATHLETE_IN_LINEUP");
    expect(() =>
      run(lined, { type: "removeAthlete", payload: { id: listed } }),
    ).toThrow("ATHLETE_IN_LINEUP");
  });

  it("schedules a match on an existing court", () => {
    const s = run(drawn(), {
      type: "setCourts",
      payload: { courts: [{ id: "san-1", name: "Sân 1" }] },
    });
    const next = run(s, {
      type: "setSchedule",
      payload: {
        matchId: MENS,
        courtId: "san-1",
        startsAt: "2026-10-18T08:00:00+07:00",
        endsAt: "2026-10-18T08:20:00+07:00",
      },
    });
    expect(next.document.matches[0].courtId).toBe("san-1");
    expect(() =>
      run(s, {
        type: "setSchedule",
        payload: {
          matchId: MENS,
          courtId: "san-9",
          startsAt: null,
          endsAt: null,
        },
      }),
    ).toThrow("INVALID_COURT");
  });

  it("calls a pending match once", () => {
    const called = run(drawn(), {
      type: "callMatch",
      payload: { matchId: MENS },
    });
    expect(called.document.matches[0].status).toBe("called");
    expect(() =>
      run(called, { type: "callMatch", payload: { matchId: MENS } }),
    ).toThrow("INVALID_STATUS");
  });
});

describe("applyCommand — results", () => {
  it("rejects a score that is not final under the 21/25 rule", () => {
    for (const [a, b] of [
      [21, 20],
      [20, 18],
      [24, 21],
      [25, 22],
    ])
      expect(() => score(drawn(), MENS, a, b)).toThrow("INVALID_SCORE");
  });

  it("stores a score, derives the winner, and stores no winner", () => {
    const next = score(drawn(), MENS, 22, 20);
    const m = next.document.matches[0];
    expect(m).toMatchObject({
      status: "completed",
      score: { a: 22, b: 20 },
      winnerTeamId: null,
    });
    expect(deriveTournament(next.document).matches[0].winnerTeamId).toBe("red");
  });

  it("records a walkover as 21–0 for the side that showed up", () => {
    const next = run(drawn(), {
      type: "setWalkover",
      payload: { matchId: MENS, absentSide: "a" },
    });
    expect(next.document.matches[0]).toMatchObject({
      status: "walkover",
      score: { a: 0, b: 21 },
    });
  });

  it("locks the lineup of a finished match", () => {
    const s = score(drawn(), MENS, 21, 10);
    expect(() =>
      run(s, {
        type: "setLineup",
        payload: {
          matchId: MENS,
          pairA: pick(s, "red", "male", 2),
          pairB: pick(s, "blue", "male", 2),
        },
      }),
    ).toThrow("MATCH_LOCKED");
  });

  it("seeds the six placement matches when the group stage completes", () => {
    const done = playGroup(drawn());
    expect(done.document.matches).toHaveLength(24);
    const first = done.document.matches.filter(
      (m) => m.phase === "first_place",
    );
    expect(
      first.every((m) => m.teamAId === "red" && m.teamBId === "blue"),
    ).toBe(true);
    expect(done.document.matches.every((m) => m.winnerTeamId === null)).toBe(
      true,
    );
  });

  it("removes un-played placement matches when a group result is cleared", () => {
    const next = run(playGroup(drawn()), {
      type: "clearResult",
      payload: { matchId: MENS },
    });
    expect(next.document.matches).toHaveLength(18);
    expect(next.document.matches[0]).toMatchObject({
      status: "pending",
      score: null,
    });
  });

  it("refuses a group change that would re-seed a placement already played", () => {
    let s = playGroup(drawn());
    s = score(s, "first_place-mens_doubles", 21, 10);
    // Red 189 → 178, blue 180 → 183: the final would change sides.
    expect(() => score(s, MENS, 10, 21)).toThrow("PLACEMENT_RESET_REQUIRED");
    // A change that keeps the order is fine.
    expect(score(s, MENS, 21, 19).document.matches).toHaveLength(24);
  });
});

// Red and blue finish level on points for (185), wins (7) and difference (55).
const TIED: Record<string, [number, number][]> = {
  "group-red-blue": [
    [21, 19],
    [19, 21],
    [21, 19],
  ],
  "group-red-yellow": [
    [21, 10],
    [21, 10],
    [21, 10],
  ],
  "group-red-white": [
    [21, 10],
    [21, 10],
    [19, 21],
  ],
  "group-blue-yellow": [
    [21, 10],
    [21, 10],
    [21, 10],
  ],
  "group-blue-white": [
    [21, 10],
    [21, 10],
    [21, 19],
  ],
  "group-yellow-white": [
    [21, 10],
    [21, 10],
    [21, 10],
  ],
};
const playTied = () => {
  let s = drawn();
  const seen: Record<string, number> = {};
  for (const m of s.document.matches) {
    const i = (seen[m.encounterId] = (seen[m.encounterId] ?? -1) + 1);
    const [a, b] = TIED[m.encounterId][i];
    s = score(s, m.id, a, b);
  }
  return s;
};

describe("applyCommand — ties", () => {
  it("holds placement back while two teams are level", () => {
    const s = playTied();
    const rows = deriveTournament(s.document).standings;
    expect(
      rows
        .filter((r) => r.rank === null)
        .map((r) => r.teamId)
        .sort(),
    ).toEqual(["blue", "red"]);
    expect(s.document.matches).toHaveLength(18);
  });

  it("seeds placement in the order the organiser decides", () => {
    const next = run(playTied(), {
      type: "resolveTie",
      payload: {
        tiedTeamIds: ["red", "blue"],
        orderedTeamIds: ["blue", "red"],
        reason: "Đối đầu trực tiếp",
      },
    });
    // tieDecisions is part of the public file: the organiser's email is not.
    expect(next.document.tieDecisions[0].decidedBy).toBe("BTC");
    expect(JSON.stringify(next.document)).not.toContain("btc@example.com");
    const first = next.document.matches.filter(
      (m) => m.phase === "first_place",
    );
    expect(first).toHaveLength(3);
    expect(
      first.every((m) => m.teamAId === "blue" && m.teamBId === "red"),
    ).toBe(true);
  });

  it("rejects a tie that is not one", () => {
    const s = playTied();
    for (const payload of [
      { tiedTeamIds: ["red", "yellow"], orderedTeamIds: ["red", "yellow"] },
      { tiedTeamIds: ["red", "blue"], orderedTeamIds: ["red", "white"] },
      { tiedTeamIds: ["red", "red"], orderedTeamIds: ["red", "red"] },
    ])
      expect(() =>
        run(s, { type: "resolveTie", payload: { ...payload, reason: "x" } }),
      ).toThrow("INVALID_TIE");
    expect(() =>
      run(drawn(), {
        type: "resolveTie",
        payload: {
          tiedTeamIds: ["red", "blue"],
          orderedTeamIds: ["red", "blue"],
          reason: "x",
        },
      }),
    ).toThrow("INVALID_TIE");
  });

  it("stops applying a decision the moment a group score changes", () => {
    let s = run(playTied(), {
      type: "resolveTie",
      payload: {
        tiedTeamIds: ["red", "blue"],
        orderedTeamIds: ["blue", "red"],
        reason: "Đối đầu trực tiếp",
      },
    });
    expect(s.document.matches).toHaveLength(24);
    // Red and blue stay level, but the decision was bound to the old scores.
    s = score(s, "group-yellow-white-mixed_doubles", 21, 11);
    expect(s.document.matches).toHaveLength(18);
  });
});
