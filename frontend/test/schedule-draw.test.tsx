import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { GroupSchedule } from "../src/features/matches/GroupSchedule";
import { PlacementBracket } from "../src/features/matches/PlacementBracket";
import {
  makeCompletedGroup,
  makeTournament,
} from "../../packages/domain/src/testing/fixtures";
import { deriveTournament } from "../../packages/domain/src/derive";
import type { TournamentDocument } from "../../packages/domain/src/schema";

const view = (t: TournamentDocument) => ({ t, derived: deriveTournament(t) });

const renderGroup = (t: TournamentDocument) => {
  const v = view(t);
  return render(<GroupSchedule t={v.t} derived={v.derived} />).container;
};

// The BWF-style draw: one block per encounter, each holding three stacked
// ties. Reference: assets/images/bwf.jpeg.
describe("GroupSchedule", () => {
  it("renders one block per encounter, not one flat table", () => {
    const c = renderGroup(makeCompletedGroup());
    expect(c.querySelectorAll(".draw-block")).toHaveLength(6);
    expect(c.querySelectorAll("table")).toHaveLength(0);
  });

  it("stacks the two sides of every tie", () => {
    const c = renderGroup(makeCompletedGroup());
    const ties = c.querySelectorAll(".draw-tie");
    expect(ties).toHaveLength(18);
    for (const tie of ties)
      expect(tie.querySelectorAll(".draw-row")).toHaveLength(2);
  });

  it("tallies the encounter in its header", () => {
    const t = makeCompletedGroup();
    // Every match is 21-18 to side A, so flipping one makes the first
    // encounter 2-1 instead of 3-0.
    const first = t.matches[0].encounterId;
    const flipped = t.matches.filter((m) => m.encounterId === first)[2];
    flipped.score = { a: 18, b: 21 };
    const c = renderGroup(t);
    const heads = c.querySelectorAll(".draw-block__head");
    expect(heads[0].textContent).toContain("2 – 1");
    expect(heads[1].textContent).toContain("3 – 0");
  });

  it("names both teams in the header", () => {
    const c = renderGroup(makeCompletedGroup());
    const head = c.querySelector(".draw-block__head")!;
    expect(head.textContent).toContain("Đội Đỏ");
    expect(head.textContent).toContain("Đội Xanh");
  });

  it("marks the winning side and only that side", () => {
    const c = renderGroup(makeCompletedGroup());
    const tie = c.querySelector(".draw-tie")!;
    const rows = tie.querySelectorAll(".draw-row");
    expect(rows[0].className).toContain("is-winner");
    expect(rows[1].className).not.toContain("is-winner");
  });

  it("shows a dash and no winner while a tie is unplayed", () => {
    const t = makeCompletedGroup();
    for (const m of t.matches) {
      m.status = "pending";
      m.score = null;
    }
    const c = renderGroup(t);
    expect(c.querySelectorAll(".is-winner")).toHaveLength(0);
    expect(c.querySelector(".draw-row__score")!.textContent).toBe("—");
    expect(c.querySelector(".draw-block__head")!.textContent).toContain(
      "0 – 0",
    );
  });

  it("carries each team's colour as the flag chip", () => {
    const c = renderGroup(makeCompletedGroup());
    const flag = c.querySelector(".draw-row__flag") as HTMLElement;
    expect(flag.style.background).toBeTruthy();
  });

  it("hides an unpublished lineup but shows a published one", () => {
    const t = makeCompletedGroup();
    t.athletes = [
      {
        id: "a1",
        name: "Nguyễn Văn A",
        gender: "male",
        teamId: "red",
        active: true,
      },
      {
        id: "a2",
        name: "Trần Văn B",
        gender: "male",
        teamId: "red",
        active: true,
      },
    ];
    t.matches[0].pairA = ["a1", "a2"];
    t.matches[0].lineupPublished = false;
    expect(renderGroup(t).textContent).not.toContain("Nguyễn Văn A");
    t.matches[0].lineupPublished = true;
    expect(renderGroup(t).textContent).toContain("Nguyễn Văn A · Trần Văn B");
  });

  it("renders nothing without group matches", () => {
    const c = renderGroup(makeTournament());
    expect(c.textContent).toBe("");
  });
});

describe("PlacementBracket", () => {
  const withPlacement = () => {
    const t = makeCompletedGroup();
    const standings = deriveTournament(t).standings;
    const [first, second, third, fourth] = standings.map((s) => s.teamId);
    const categories = t.rules.categories;
    t.matches = [
      ...t.matches,
      ...categories.flatMap((category, i) => [
        {
          ...t.matches[0],
          id: `first_place-${category}`,
          phase: "first_place" as const,
          encounterId: "first_place",
          category,
          order: 19 + i,
          teamAId: first,
          teamBId: second,
          pairA: null,
          pairB: null,
          status: "completed" as const,
          score: { a: 21, b: 15 },
        },
        {
          ...t.matches[0],
          id: `third_place-${category}`,
          phase: "third_place" as const,
          encounterId: "third_place",
          category,
          order: 22 + i,
          teamAId: third,
          teamBId: fourth,
          pairA: null,
          pairB: null,
          status: "completed" as const,
          score: { a: 15, b: 21 },
        },
      ]),
    ];
    return t;
  };

  it("draws a panel per placement match with its ties", () => {
    const v = view(withPlacement());
    const c = render(
      <PlacementBracket t={v.t} derived={v.derived} />,
    ).container;
    expect(c.querySelectorAll(".draw-bracket__panel")).toHaveLength(2);
    expect(c.querySelectorAll(".draw-tie")).toHaveLength(6);
    expect(c.querySelectorAll(".draw-bracket__elbow").length).toBeGreaterThan(
      0,
    );
  });

  it("announces the four placements", () => {
    const v = view(withPlacement());
    const text = render(<PlacementBracket t={v.t} derived={v.derived} />)
      .container.textContent!;
    for (const label of ["NHẤT", "NHÌ", "BA", "KHUYẾN KHÍCH"])
      expect(text).toContain(label);
  });

  it("renders nothing without placement matches", () => {
    const v = view(makeCompletedGroup());
    const c = render(
      <PlacementBracket t={v.t} derived={v.derived} />,
    ).container;
    expect(c.textContent).toBe("");
  });
});
