import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { PosterTwo } from "../src/features/landing/PosterTwo";
import { PublicTournamentSchema } from "../../packages/domain/src/schema";

const t = PublicTournamentSchema.parse(
  JSON.parse(readFileSync("frontend/public/tournament.json", "utf8")),
);

describe("PosterTwo", () => {
  it("renders all six rule cards", () => {
    render(<PosterTwo t={t} />);
    for (const title of [
      "CHIA ĐỘI & THỂ THỨC",
      "LUẬT MỖI SÉC",
      "XẾP HẠNG SAU VÒNG LOẠI",
      "VÒNG TRANH HẠNG",
      "LỆ PHÍ & QUỸ GIẢI",
      "MẤY ĐIỀU NHỚ GIÙM",
    ])
      expect(screen.getByText(title)).toBeDefined();
  });

  it("renders the four placement pills", () => {
    render(<PosterTwo t={t} />);
    for (const label of ["NHẤT", "NHÌ", "BA", "KHUYẾN KHÍCH"])
      expect(screen.getByText(label)).toBeDefined();
  });

  it("renders the three tiebreak pills in ranking order", () => {
    render(<PosterTwo t={t} />);
    expect(screen.getByText(/1 · Số trận thắng/)).toBeDefined();
    expect(screen.getByText(/2 · Hiệu số điểm/)).toBeDefined();
    expect(screen.getByText(/3 · Đối đầu trực tiếp/)).toBeDefined();
  });

  it("states the scoring numbers from rules, not hardcoded prose", () => {
    const { container } = render(<PosterTwo t={t} />);
    const html = container.innerHTML;
    for (const n of [
      t.rules.setTarget,
      t.rules.cap,
      t.rules.changeEndsAt,
      t.rules.lateMinutes,
    ])
      expect(html).toContain(String(n));
  });

  it("follows a changed cap through the prose", () => {
    const { container } = render(
      <PosterTwo t={{ ...t, rules: { ...t.rules, cap: 25 } }} />,
    );
    expect(container.innerHTML).toContain("25");
  });

  it("shows the ??? đang chốt panel while feeVnd is null", () => {
    render(<PosterTwo t={t} />);
    expect(screen.getByText("???")).toBeDefined();
    expect(screen.getByText(/ĐANG CHỐT/i)).toBeDefined();
  });

  it("shows the fee instead once it is set", () => {
    render(<PosterTwo t={{ ...t, info: { ...t.info, feeVnd: 150000 } }} />);
    expect(screen.queryByText("???")).toBeNull();
    expect(screen.getAllByText(/150\.000/).length).toBeGreaterThan(0);
  });
});
