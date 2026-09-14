import { describe, expect, it } from "vitest";
import { applyDraw } from "../draw-teams";
import {
  makeRoster,
  makeTournament,
} from "../../packages/domain/src/testing/fixtures";
import { PublicTournamentSchema } from "../../packages/domain/src/schema";

// The empty fixture, not the shipped file: applyDraw refuses a tournament
// whose matches have been played.
const shipped = makeTournament();

describe("applyDraw", () => {
  const roster = makeRoster(24);
  const result = applyDraw(shipped, roster, "seed-2026");

  it("assigns every active athlete to a team", () => {
    expect(result.athletes).toHaveLength(24);
    expect(result.athletes.every((a) => a.teamId !== null)).toBe(true);
  });

  it("never writes a private field into the public document", () => {
    const json = JSON.stringify(result);
    for (const key of ["phone", "skillBand"])
      expect(json).not.toContain(`"${key}"`);
    expect(PublicTournamentSchema.safeParse(result).success).toBe(true);
  });

  it("generates the 18 group matches", () => {
    expect(result.matches).toHaveLength(18);
    expect(result.matches.every((m) => m.phase === "group")).toBe(true);
    expect(new Set(result.matches.map((m) => m.id)).size).toBe(18);
  });

  it("marks the draw confirmed", () => {
    expect(result.draw.status).toBe("confirmed");
  });

  it("is deterministic for a given seed", () => {
    expect(applyDraw(shipped, roster, "seed-2026").draw.assignment).toEqual(
      result.draw.assignment,
    );
  });

  it("produces a different assignment for a different seed", () => {
    expect(applyDraw(shipped, roster, "khac").draw.assignment).not.toEqual(
      result.draw.assignment,
    );
  });

  it("leaves inactive athletes without a team", () => {
    const partial = makeRoster(24);
    partial.athletes[0].active = false;
    const out = applyDraw(shipped, partial, "seed-2026");
    expect(out.athletes.find((a) => a.id === partial.athletes[0].id)?.teamId)
      .toBeNull();
  });

  it("refuses to redraw once a match has been played", () => {
    const played = structuredClone(result);
    played.matches[0].status = "completed";
    played.matches[0].score = { a: 21, b: 15 };
    expect(() => applyDraw(played, roster, "seed-2026")).toThrow("DRAW_LOCKED");
  });
});
