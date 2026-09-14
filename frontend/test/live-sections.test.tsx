import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { LiveSections } from "../src/features/landing/LiveSections";
import { parseTournament } from "../src/lib/use-tournament";

const shipped = JSON.parse(
  readFileSync("frontend/public/tournament.json", "utf8"),
);

const athlete = (id: string, name: string, teamId: string | null = null) => ({
  id,
  name,
  gender: "male" as const,
  teamId,
  active: true,
});

const match = (over: Record<string, unknown> = {}) => ({
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
  status: "pending",
  score: null,
  winnerTeamId: null,
  ...over,
});

describe("LiveSections", () => {
  it("renders nothing for the shipped empty tournament", () => {
    const { container } = render(
      <LiveSections view={parseTournament(shipped)} />,
    );
    expect(container.textContent?.trim()).toBe("");
  });

  it("shows the roster once athletes exist", () => {
    const doc = structuredClone(shipped);
    doc.athletes = [athlete("a1", "Nguyễn Văn A")];
    render(<LiveSections view={parseTournament(doc)} />);
    expect(screen.getByText(/DANH SÁCH VĐV/i)).toBeDefined();
    expect(screen.getByText("Nguyễn Văn A")).toBeDefined();
  });

  it("hides the teams until the draw is confirmed", () => {
    const doc = structuredClone(shipped);
    doc.athletes = [athlete("a1", "Nguyễn Văn A")];
    render(<LiveSections view={parseTournament(doc)} />);
    expect(screen.queryByText(/BỐN ĐỘI/i)).toBeNull();
  });

  it("shows the teams once the draw is confirmed", () => {
    const doc = structuredClone(shipped);
    doc.draw.status = "confirmed";
    doc.athletes = [athlete("a1", "Nguyễn Văn A", "red")];
    doc.draw.assignment = { a1: "red" };
    render(<LiveSections view={parseTournament(doc)} />);
    expect(screen.getByText(/BỐN ĐỘI/i)).toBeDefined();
    // Appears both in the roster's team column and on the team card.
    expect(screen.getAllByText("Đội Đỏ").length).toBeGreaterThan(0);
  });

  it("hides thu chi until finance is published", () => {
    const doc = structuredClone(shipped);
    doc.athletes = [athlete("a1", "Nguyễn Văn A")];
    doc.finance.published = false;
    render(<LiveSections view={parseTournament(doc)} />);
    expect(screen.queryByText(/THU CHI/i)).toBeNull();
  });

  it("shows thu chi once finance is published", () => {
    const doc = structuredClone(shipped);
    doc.finance.published = true;
    render(<LiveSections view={parseTournament(doc)} />);
    expect(screen.getByText(/THU CHI/i)).toBeDefined();
  });

  it("hides standings until a match has been played", () => {
    const doc = structuredClone(shipped);
    doc.draw.status = "confirmed";
    doc.matches = [match()];
    render(<LiveSections view={parseTournament(doc)} />);
    expect(screen.queryByText(/BẢNG XẾP HẠNG/i)).toBeNull();
  });

  it("shows standings once a match is completed", () => {
    const doc = structuredClone(shipped);
    doc.draw.status = "confirmed";
    doc.matches = [match({ status: "completed", score: { a: 21, b: 15 } })];
    render(<LiveSections view={parseTournament(doc)} />);
    expect(screen.getByText(/BẢNG XẾP HẠNG/i)).toBeDefined();
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
});
