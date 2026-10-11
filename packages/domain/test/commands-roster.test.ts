import { describe, expect, it } from "vitest";
import {
  applyCommand,
  previewDraw,
  toRoster,
  type AdminState,
} from "../src/commands";
import {
  makeAdminState as rosterState,
  makeTournament,
} from "../src/testing/fixtures";

const NOW = "2026-10-18T08:00:00+07:00";
const run = (s: AdminState, command: unknown) =>
  applyCommand(s, command, "btc@example.com", NOW);

const athlete = (over: Record<string, unknown> = {}) => ({
  id: null,
  name: "Đỗ Thái Đãm",
  gender: "male",
  active: true,
  skillBand: 2,
  phone: "0901 234 567",
  note: "",
  ...over,
});

describe("applyCommand — athletes", () => {
  it("adds an athlete with the next aNN id and keeps private fields apart", () => {
    const s = { document: makeTournament(), private: {} };
    s.document.athletes = [
      { id: "a01", name: "Tân", gender: "male", teamId: null, active: true },
      { id: "a15", name: "Nhâm", gender: "male", teamId: null, active: true },
    ];
    const next = run(s, { type: "upsertAthlete", payload: athlete() });
    const added = next.document.athletes.at(-1)!;
    expect(added).toEqual({
      id: "a16",
      name: "Đỗ Thái Đãm",
      gender: "male",
      teamId: null,
      active: true,
    });
    expect(next.private.a16).toEqual({
      skillBand: 2,
      phone: "0901 234 567",
      note: "",
    });
    expect(JSON.stringify(next.document)).not.toContain("0901");
  });

  it("accepts hạt giống (0) as a level, and nothing outside 0–3", () => {
    const s = { document: makeTournament(), private: {} };
    const next = run(s, {
      type: "upsertAthlete",
      payload: athlete({ skillBand: 0 }),
    });
    expect(next.private.a01.skillBand).toBe(0);
    for (const skillBand of [4, -1, 1.5])
      expect(() =>
        run(s, { type: "upsertAthlete", payload: athlete({ skillBand }) }),
      ).toThrow("INVALID_COMMAND");
  });

  it("starts at a01 on an empty roster", () => {
    const s = { document: makeTournament(), private: {} };
    const next = run(s, { type: "upsertAthlete", payload: athlete() });
    expect(next.document.athletes[0].id).toBe("a01");
  });

  it("edits an existing athlete without touching the team", () => {
    const s = rosterState();
    s.document.athletes[0].teamId = "red";
    const next = run(s, {
      type: "upsertAthlete",
      payload: athlete({ id: "athlete-1", name: "Tên Mới", skillBand: 3 }),
    });
    expect(next.document.athletes[0]).toMatchObject({
      name: "Tên Mới",
      teamId: "red",
    });
    expect(next.private["athlete-1"].skillBand).toBe(3);
    expect(() =>
      run(s, { type: "upsertAthlete", payload: athlete({ id: "ghost" }) }),
    ).toThrow("ATHLETE_NOT_FOUND");
  });

  it("removes an athlete and every reference to them", () => {
    let s = run(rosterState(), {
      type: "confirmDraw",
      payload: { seed: "s1" },
    });
    const victim = s.document.athletes[0];
    s = run(s, {
      type: "updateTeam",
      payload: { teamId: victim.teamId, captainId: victim.id },
    });
    const next = run(s, { type: "removeAthlete", payload: { id: victim.id } });
    expect(next.document.athletes.some((a) => a.id === victim.id)).toBe(false);
    expect(next.private[victim.id]).toBeUndefined();
    expect(next.document.draw.assignment[victim.id]).toBeUndefined();
    expect(next.document.teams.every((t) => t.captainId !== victim.id)).toBe(
      true,
    );
  });

  it("moves an athlete by hand and keeps the draw record in step", () => {
    const s = run(rosterState(), {
      type: "confirmDraw",
      payload: { seed: "s1" },
    });
    const a = s.document.athletes[0];
    const target = s.document.teams.find((t) => t.id !== a.teamId)!.id;
    const next = run(s, {
      type: "setAthleteTeam",
      payload: { athleteId: a.id, teamId: target },
    });
    expect(next.document.athletes[0].teamId).toBe(target);
    expect(next.document.draw.assignment[a.id]).toBe(target);
    expect(() =>
      run(s, {
        type: "setAthleteTeam",
        payload: { athleteId: a.id, teamId: "nope" },
      }),
    ).toThrow("INVALID_TEAM");
  });
});

describe("applyCommand — draw", () => {
  it("builds the private roster from the document and the private map", () => {
    const roster = toRoster(rosterState());
    expect(roster.athletes).toHaveLength(16);
    expect(roster.athletes[0]).toMatchObject({
      id: "athlete-1",
      skillBand: 1,
      phone: "0900000000",
    });
  });

  it("previews without saving, and confirming the same seed gives the same teams", () => {
    const s = rosterState();
    const preview = previewDraw(s, "mua-2026");
    expect(Object.keys(preview)).toHaveLength(16);
    expect(s.document.draw.status).toBe("not_started");
    const next = run(s, { type: "confirmDraw", payload: { seed: "mua-2026" } });
    expect(next.document.draw.status).toBe("confirmed");
    expect(next.document.draw.assignment).toEqual(preview);
    expect(next.document.matches).toHaveLength(18);
    for (const a of next.document.athletes)
      expect(a.teamId).toBe(preview[a.id]);
  });

  it("never lets a private field into the document", () => {
    const next = run(rosterState(), {
      type: "confirmDraw",
      payload: { seed: "s1" },
    });
    const json = JSON.stringify(next.document);
    for (const leak of ['"phone"', '"skillBand"', "ghi chú riêng"])
      expect(json).not.toContain(leak);
  });

  it("refuses a roster the draw cannot balance", () => {
    expect(() =>
      run(rosterState(8), { type: "confirmDraw", payload: { seed: "s1" } }),
    ).toThrow("INSUFFICIENT_ROSTER");
    const s = rosterState();
    s.private["athlete-1"].skillBand = null;
    expect(() =>
      run(s, { type: "confirmDraw", payload: { seed: "s1" } }),
    ).toThrow("MISSING_SKILL");
  });

  it("locks the draw once a match has started, and resets it before", () => {
    const drawn = run(rosterState(), {
      type: "confirmDraw",
      payload: { seed: "s1" },
    });
    const reset = run(drawn, { type: "resetDraw", payload: {} });
    expect(reset.document.draw).toEqual({
      status: "not_started",
      algorithmVersion: "balanced-v1",
      assignment: {},
    });
    expect(reset.document.matches).toHaveLength(0);
    expect(reset.document.athletes.every((a) => a.teamId === null)).toBe(true);

    drawn.document.matches[0].status = "called";
    for (const type of ["confirmDraw", "resetDraw"])
      expect(() =>
        run(drawn, {
          type,
          payload: type === "confirmDraw" ? { seed: "s2" } : {},
        }),
      ).toThrow("DRAW_LOCKED");
    expect(() => previewDraw(drawn, "s2")).toThrow("DRAW_LOCKED");
  });
});
