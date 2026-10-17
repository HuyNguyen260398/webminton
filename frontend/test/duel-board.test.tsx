import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import {
  DuelMatchList,
  duelSlotLabel,
  shortNames,
} from "../src/features/duel/DuelBoard";
import { createDuelMatches } from "../../packages/domain/src/duel";
import { makeTournament } from "../../packages/domain/src/testing/fixtures";

function board(status: "pending" | "live" | "done") {
  const t = makeTournament();
  for (const [id, teamId] of [
    ["r1", "red"],
    ["r2", "red"],
    ["b1", "blue"],
    ["b2", "blue"],
  ] as const)
    t.athletes.push({ id, name: id, gender: "male", teamId, active: true });
  const matches = createDuelMatches();
  Object.assign(matches[0], {
    pairRed: ["r1", "r2"],
    pairBlue: ["b1", "b2"],
    status,
    score: { red: 21, blue: 15 },
  });
  t.duel = { matches };
  return render(<DuelMatchList t={t} />).getByTestId("duel-vong-loai-1");
}

describe("DuelMatchList", () => {
  it("shows the pairs before the match is called", () => {
    const el = board("pending");
    expect(el.textContent).toContain("r1 · r2");
    expect(el.textContent).toContain("b1 · b2");
  });

  it("says a match without pairs is still waiting for them", () => {
    const t = makeTournament();
    t.duel = { matches: createDuelMatches() };
    const el = render(<DuelMatchList t={t} />).getByTestId("duel-vong-loai-1");
    expect(el.textContent).toContain("Chưa xếp cặp");
  });

  it("shows a live match's score without calling a winner", () => {
    const el = board("live");
    expect(el.textContent).toContain("21");
    expect(el.textContent).toContain("15");
    expect(el.querySelector(".is-winner")).toBeNull();
  });

  it("marks the winner once the match is done", () => {
    expect(board("done").querySelectorAll(".is-winner")).toHaveLength(1);
  });

  it("calls players by their given name, two words where that is shared", () => {
    const t = makeTournament();
    t.athletes = [
      ["a", "Nguyễn Gia Huy"],
      ["b", "Trần Văn Huy"],
      ["c", "Nhật"],
      ["d", "Lee Chong Vinh"],
    ].map(([id, name]) => ({ id, name, gender: "male", teamId: null, active: true }));
    expect(Object.fromEntries(shortNames(t))).toEqual({
      a: "Gia Huy",
      b: "Văn Huy",
      c: "Nhật",
      d: "Vinh",
    });
  });

  it("puts the matches two at a time on the two courts", () => {
    const matches = createDuelMatches();
    expect(matches.map((m) => duelSlotLabel(m, matches))).toEqual(
      [1, 2, 3, 4, 5, 6].flatMap((r) => [
        `Lượt ${r} · Sân 1`,
        `Lượt ${r} · Sân 2`,
      ]),
    );
    expect(board("pending").textContent).toContain("Lượt 1 · Sân 1");
  });
});
