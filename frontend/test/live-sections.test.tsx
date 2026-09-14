import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveSections } from "../src/features/landing/LiveSections";
import { parseTournament } from "../src/lib/use-tournament";
import type { TournamentDocument } from "../../packages/domain/src/schema";

import {
  makeCompletedGroup,
  makeTournament,
} from "../../packages/domain/src/testing/fixtures";

// The empty fixture, not the shipped file: these assert the show/hide rules,
// which must not change when the tournament data does.
const shipped = makeTournament();

const athlete = (id: string, name: string, teamId: string | null = null) => ({
  id,
  name,
  gender: "male" as const,
  teamId,
  active: true,
});

const match = (over: Record<string, unknown> = {}) =>
  ({
    id: "m1",
    phase: "group" as const,
    encounterId: "e1",
    category: "mens_doubles" as const,
    order: 1,
    teamAId: "red",
    teamBId: "blue",
    pairA: null,
    pairB: null,
    lineupPublished: false,
    courtId: null,
    startsAt: null,
    endsAt: null,
    status: "pending" as const,
    score: null,
    winnerTeamId: null,
    ...over,
  }) as TournamentDocument["matches"][number];

describe("LiveSections", () => {
  it("renders nothing for an empty tournament", () => {
    const { container } = render(
      <LiveSections view={parseTournament(shipped)} />,
    );
    expect(container.textContent?.trim()).toBe("");
  });

  it("shows the roster once athletes exist", () => {
    const doc = structuredClone(shipped);
    doc.athletes = [athlete("a1", "Nguyễn Văn A")];
    render(<LiveSections view={parseTournament(doc)} />);
    expect(screen.getByText(/DANH SÁCH\s*VĐV/i)).toBeDefined();
    expect(screen.getByText("Nguyễn Văn A")).toBeDefined();
  });

  it("hides the teams until the draw is confirmed", () => {
    const doc = structuredClone(shipped);
    doc.athletes = [athlete("a1", "Nguyễn Văn A")];
    render(<LiveSections view={parseTournament(doc)} />);
    expect(screen.queryByText(/BỐN\s*ĐỘI/i)).toBeNull();
  });

  it("shows the teams once the draw is confirmed", () => {
    const doc = structuredClone(shipped);
    doc.draw.status = "confirmed";
    doc.athletes = [athlete("a1", "Nguyễn Văn A", "red")];
    doc.draw.assignment = { a1: "red" };
    render(<LiveSections view={parseTournament(doc)} />);
    expect(screen.getByText(/BỐN\s*ĐỘI/i)).toBeDefined();
    // Appears both in the roster's team column and on the team card.
    expect(screen.getAllByText("Đội Đỏ").length).toBeGreaterThan(0);
  });

  it("hides thu chi until finance is published", () => {
    const doc = structuredClone(shipped);
    doc.athletes = [athlete("a1", "Nguyễn Văn A")];
    doc.finance.published = false;
    render(<LiveSections view={parseTournament(doc)} />);
    expect(screen.queryByText(/THU\s*CHI/i)).toBeNull();
  });

  it("shows thu chi once finance is published", () => {
    const doc = structuredClone(shipped);
    doc.finance.published = true;
    render(<LiveSections view={parseTournament(doc)} />);
    expect(screen.getByText(/THU\s*CHI/i)).toBeDefined();
  });

  it("hides standings until a match has been played", () => {
    const doc = structuredClone(shipped);
    doc.draw.status = "confirmed";
    doc.matches = [match()];
    render(<LiveSections view={parseTournament(doc)} />);
    expect(screen.queryByText(/BẢNG\s*XẾP HẠNG/i)).toBeNull();
  });

  it("shows standings once a match is completed", () => {
    const doc = structuredClone(shipped);
    doc.draw.status = "confirmed";
    doc.matches = [match({ status: "completed", score: { a: 21, b: 15 } })];
    render(<LiveSections view={parseTournament(doc)} />);
    expect(screen.getByText(/BẢNG\s*XẾP HẠNG/i)).toBeDefined();
  });

  it("hides an unpublished lineup", () => {
    const doc = structuredClone(shipped);
    doc.draw.status = "confirmed";
    doc.athletes = [
      athlete("a1", "Nguyễn Văn A", "red"),
      athlete("a2", "Trần Văn B", "red"),
    ];
    doc.matches = [match({ pairA: ["a1", "a2"], lineupPublished: false })];
    render(<LiveSections view={parseTournament(doc)} />);
    expect(screen.queryByText(/Nguyễn Văn A · Trần Văn B/)).toBeNull();
  });

  it("shows a published lineup", () => {
    const doc = structuredClone(shipped);
    doc.draw.status = "confirmed";
    doc.athletes = [
      athlete("a1", "Nguyễn Văn A", "red"),
      athlete("a2", "Trần Văn B", "red"),
    ];
    doc.matches = [match({ pairA: ["a1", "a2"], lineupPublished: true })];
    render(<LiveSections view={parseTournament(doc)} />);
    expect(screen.getByText(/Nguyễn Văn A · Trần Văn B/)).toBeDefined();
  });

  it("gives every live section the posters' slab title", () => {
    const doc = makeCompletedGroup();
    doc.draw.status = "confirmed";
    doc.athletes = [athlete("a1", "Nguyễn Văn A", "red")];
    doc.draw.assignment = { a1: "red" };
    doc.finance.published = true;
    const { container } = render(<LiveSections view={parseTournament(doc)} />);
    const titles = [
      ...container.querySelectorAll(".section > .container > h2"),
    ];
    // One line in a rotated red slab, as on THỂ LỆ THI ĐẤU and NHÀ TÀI TRỢ.
    expect(titles.map((h) => h.innerHTML)).toEqual([
      "DANH SÁCH VĐV",
      "BỐN ĐỘI",
      "LỊCH THI ĐẤU",
      "BẢNG XẾP HẠNG",
      "THU CHI",
    ]);
    for (const h of titles) {
      expect(h.className).toContain("slab");
      expect(h.className).toContain("slab--red");
      expect(h.className).toContain("rot");
      expect(h.className).toContain("section-title");
      expect((h as HTMLElement).style.getPropertyValue("--rot")).toBe(
        "-1.5deg",
      );
    }
  });
});
