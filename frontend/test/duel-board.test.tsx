import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DuelMatchList } from "../src/features/duel/DuelBoard";
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
});
