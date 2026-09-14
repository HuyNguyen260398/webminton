import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseTournament } from "../src/lib/use-tournament";

const shipped = JSON.parse(
  readFileSync("frontend/public/tournament.json", "utf8"),
);

describe("parseTournament", () => {
  it("parses the shipped file and derives empty results", () => {
    const { t, derived } = parseTournament(shipped);
    expect(t.info.clubName).toBe("Hội lông thủ CN1416");
    expect(derived.standings).toHaveLength(4);
    expect(derived.champion).toBeNull();
    expect(derived.finalized).toBe(false);
  });

  it("throws INVALID_DOCUMENT on a malformed document", () => {
    expect(() => parseTournament({ nope: true })).toThrow("INVALID_DOCUMENT");
  });

  it("derives a winner from a completed match", () => {
    const doc = structuredClone(shipped);
    doc.matches = [
      {
        id: "m1",
        phase: "group",
        encounterId: "e1",
        category: "mens_doubles",
        order: 1,
        teamAId: "red",
        teamBId: "blue",
        pairA: null,
        pairB: null,
        lineupPublished: false,
        courtId: null,
        startsAt: null,
        endsAt: null,
        status: "completed",
        score: { a: 21, b: 15 },
        winnerTeamId: null,
      },
    ];
    const { derived } = parseTournament(doc);
    expect(derived.matches[0].winnerTeamId).toBe("red");
    expect(derived.standings.find((s) => s.teamId === "red")?.pointsFor).toBe(
      21,
    );
  });

  it("rejects a document carrying a private field", () => {
    const doc = structuredClone(shipped);
    doc.athletes = [
      {
        id: "a1",
        name: "Nguyễn Văn A",
        gender: "male",
        teamId: null,
        active: true,
        phone: "0900000000",
      },
    ];
    expect(() => parseTournament(doc)).toThrow("INVALID_DOCUMENT");
  });
});
