import { describe, expect, it } from "vitest";
import { applyCommand, type AdminState } from "../src/commands";
import { makeTournament } from "../src/testing/fixtures";
import { drawTeam, openTeams } from "../src/team-draw";

type Spec = [gender: "male" | "female", band: 1 | 2 | 3, count: number];

function makeState(specs: Spec[]): AdminState {
  const document = makeTournament();
  const priv: AdminState["private"] = {};
  let n = 0;
  for (const [gender, band, count] of specs)
    for (let i = 0; i < count; i++) {
      const id = `a${++n}`;
      document.athletes.push({
        id,
        name: `VĐV ${n}`,
        gender,
        teamId: null,
        active: true,
      });
      priv[id] = { skillBand: band, phone: null, note: "" };
    }
  document.draw.status = "open";
  return { document, private: priv };
}

// The roster the giải actually has: 6 strong men, 6 good men, 2 good women.
const REAL: Spec[] = [
  ["male", 1, 6],
  ["male", 2, 6],
  ["female", 2, 2],
];

// mulberry32: a small seeded generator, so a failing order can be replayed.
function prng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 2 ** 32;
  };
}

const place = (state: AdminState, athleteId: string, teamId: string) =>
  applyCommand(
    state,
    { type: "setAthleteTeam", payload: { athleteId, teamId } },
    "test",
    "2026-10-11T00:00:00.000+07:00",
  );

function drawEveryone(specs: Spec[], seed: number) {
  const random = prng(seed);
  let state = makeState(specs);
  const order = state.document.athletes
    .map((a) => [random(), a.id] as const)
    .sort((x, y) => x[0] - y[0])
    .map(([, id]) => id);
  for (const id of order) state = place(state, id, drawTeam(state, id, random));
  return state;
}

const count = (
  state: AdminState,
  teamId: string,
  gender?: string,
  band?: number,
) =>
  state.document.athletes.filter(
    (a) =>
      a.teamId === teamId &&
      (gender === undefined || a.gender === gender) &&
      (band === undefined || state.private[a.id]?.skillBand === band),
  ).length;

describe("team draw", () => {
  it("gives each team 3 strong men, 3 good men and 1 woman, in any order", () => {
    for (let seed = 1; seed <= 300; seed++) {
      const state = drawEveryone(REAL, seed);
      for (const team of ["red", "blue"]) {
        expect(count(state, team, "male", 1)).toBe(3);
        expect(count(state, team, "male", 2)).toBe(3);
        expect(count(state, team, "female")).toBe(1);
      }
      expect(count(state, "yellow") + count(state, "white")).toBe(0);
    }
  });

  it("really is random: both teams come up for the first athlete", () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 50; seed++)
      seen.add(drawTeam(makeState(REAL), "a1", prng(seed)));
    expect([...seen].sort()).toEqual(["blue", "red"]);
  });

  it("sends the rest of a level to the other team once one team has its share", () => {
    let state = makeState(REAL);
    for (const id of ["a1", "a2", "a3"]) state = place(state, id, "red");
    expect(openTeams(state, "a4")).toEqual(["blue"]);
    // Good men are a separate group and are still open to both.
    expect(openTeams(state, "a7").sort()).toEqual(["blue", "red"]);
  });

  it("puts the second woman in the team without one", () => {
    const state = place(makeState(REAL), "a13", "blue");
    expect(openTeams(state, "a14")).toEqual(["red"]);
  });

  it("keeps odd-sized groups within one of each other and the teams level", () => {
    const odd: Spec[] = [
      ["male", 1, 3],
      ["male", 2, 5],
      ["female", 2, 3],
      ["female", 3, 1],
    ];
    for (let seed = 1; seed <= 300; seed++) {
      const state = drawEveryone(odd, seed);
      for (const [gender, band] of odd)
        expect(
          Math.abs(
            count(state, "red", gender, band) -
              count(state, "blue", gender, band),
          ),
        ).toBeLessThanOrEqual(1);
      expect(count(state, "red")).toBe(6);
      expect(count(state, "blue")).toBe(6);
    }
  });

  it("still places everyone after a manual move breaks the balance", () => {
    let state = makeState(REAL);
    for (const id of ["a1", "a2", "a3", "a4"]) state = place(state, id, "red");
    expect(openTeams(state, "a5")).toEqual(["blue"]);
    expect(openTeams(state, "a7").length).toBeGreaterThan(0);
  });

  it("refuses a second roll, a closed draw, a stranger and a missing level", () => {
    const open = makeState(REAL);
    expect(() => openTeams(place(open, "a1", "red"), "a1")).toThrow(
      "ALREADY_DRAWN",
    );
    expect(() => openTeams(open, "nobody")).toThrow("ATHLETE_NOT_FOUND");

    const closed = makeState(REAL);
    closed.document.draw.status = "not_started";
    expect(() => openTeams(closed, "a1")).toThrow("TEAM_DRAW_CLOSED");

    const unrated = makeState(REAL);
    unrated.private.a1.skillBand = null;
    expect(() => openTeams(unrated, "a1")).toThrow("MISSING_SKILL");

    const resting = makeState(REAL);
    resting.document.athletes[0].active = false;
    expect(() => openTeams(resting, "a1")).toThrow("ATHLETE_NOT_FOUND");
  });

  it("opens and closes through a command, but not over a confirmed draw", () => {
    const state = makeState(REAL);
    const closed = applyCommand(
      state,
      { type: "setTeamDrawOpen", payload: { open: false } },
      "test",
      "2026-10-11T00:00:00.000+07:00",
    );
    expect(closed.document.draw.status).toBe("not_started");
    closed.document.draw.status = "confirmed";
    expect(() =>
      applyCommand(
        closed,
        { type: "setTeamDrawOpen", payload: { open: true } },
        "test",
        "2026-10-11T00:00:00.000+07:00",
      ),
    ).toThrow("DRAW_LOCKED");
  });
});
