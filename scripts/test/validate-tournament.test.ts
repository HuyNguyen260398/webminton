import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validateTournament } from "../validate-tournament";

const shipped = JSON.parse(
  readFileSync("frontend/public/tournament.json", "utf8"),
);

const match = {
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
  courtId: "san-1",
  startsAt: "2026-10-25T08:00:00+07:00",
  endsAt: "2026-10-25T08:30:00+07:00",
  status: "pending",
  score: null,
  winnerTeamId: null,
};

describe("validateTournament", () => {
  it("reports no problems for the shipped file", () => {
    expect(validateTournament(shipped)).toEqual([]);
  });

  it("reports a schema violation", () => {
    expect(validateTournament({ nope: true })[0]).toContain("không hợp lệ");
  });

  it("reports a score that is not a legal final score", () => {
    const doc = structuredClone(shipped);
    doc.matches = [{ ...match, status: "completed", score: { a: 21, b: 20 } }];
    expect(validateTournament(doc).join(" ")).toContain("tỉ số");
  });

  it("reports two matches sharing a court at the same time", () => {
    const doc = structuredClone(shipped);
    doc.matches = [match, { ...match, id: "m2", order: 2 }];
    expect(validateTournament(doc).join(" ")).toContain("trùng");
  });

  it("reports a lineup drawn from the wrong team", () => {
    const doc = structuredClone(shipped);
    doc.athletes = [
      { id: "a1", name: "A", gender: "male", teamId: "red", active: true },
      { id: "a2", name: "B", gender: "male", teamId: "blue", active: true },
      { id: "a3", name: "C", gender: "male", teamId: "blue", active: true },
      { id: "a4", name: "D", gender: "male", teamId: "blue", active: true },
    ];
    doc.matches = [{ ...match, pairA: ["a1", "a2"], pairB: ["a3", "a4"] }];
    expect(validateTournament(doc).join(" ")).toContain("Đội hình");
  });

  it("reports a match count that is neither 18 nor 24", () => {
    const doc = structuredClone(shipped);
    doc.matches = [match];
    expect(validateTournament(doc).join(" ")).toContain("Số trận");
  });
});
