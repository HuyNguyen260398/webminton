import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PosterThree } from "../src/features/landing/PosterThree";
import { makeTournament } from "../../packages/domain/src/testing/fixtures";

// The empty fixture, not the shipped file: these assert component behaviour,
// which must not change when the tournament data does.
const t = makeTournament();

const sponsor = (over: Record<string, unknown> = {}) => ({
  id: "s1",
  name: "Quán Gen Z",
  amountVnd: 2000000,
  received: true,
  note: "",
  tierOverride: null,
  ...over,
});

describe("PosterThree", () => {
  it("renders the three sponsor tiers", () => {
    render(<PosterThree t={t} />);
    for (const tier of ["KIM CƯƠNG", "VÀNG", "THÂN THIỆN"])
      expect(screen.getByText(tier)).toBeDefined();
  });

  it("renders the MoMo QR", () => {
    render(<PosterThree t={t} />);
    expect(screen.getByRole("img", { name: /QR/i }).getAttribute("src")).toBe(
      "/qr/momo.jpg",
    );
  });

  it("hides the QR when qrPublished is false", () => {
    render(
      <PosterThree t={{ ...t, info: { ...t.info, qrPublished: false } }} />,
    );
    expect(screen.queryByRole("img", { name: /QR/i })).toBeNull();
    expect(screen.getByText(/sẽ cập nhật sau/i)).toBeDefined();
  });

  it("renders a quỹ giải row for each income line", () => {
    render(<PosterThree t={t} />);
    for (const line of t.finance.income)
      expect(screen.getByText(line.label)).toBeDefined();
  });

  it("invites sponsors while there are none", () => {
    render(<PosterThree t={t} />);
    expect(screen.getByText(/chỗ này còn trống/i)).toBeDefined();
    expect(screen.getByText(/HẠNG KIM CƯƠNG ĐANG TRỐNG/i)).toBeDefined();
  });

  it("lists a named sponsor under its tier once one exists", () => {
    render(<PosterThree t={{ ...t, sponsorships: [sponsor()] }} />);
    expect(screen.getAllByText("Quán Gen Z").length).toBeGreaterThan(0);
  });

  it("thanks the diamond sponsor instead of inviting one", () => {
    render(<PosterThree t={{ ...t, sponsorships: [sponsor()] }} />);
    expect(screen.queryByText(/HẠNG KIM CƯƠNG ĐANG TRỐNG/i)).toBeNull();
    expect(screen.getByText(/CẢM ƠN NHÀ TÀI TRỢ KIM CƯƠNG/i)).toBeDefined();
  });

  it("ranks two sponsors into diamond and gold", () => {
    render(
      <PosterThree
        t={{
          ...t,
          sponsorships: [
            sponsor(),
            sponsor({ id: "s2", name: "Cà phê Gạch", amountVnd: 500000 }),
          ],
        }}
      />,
    );
    const diamond = screen.getByTestId("tier-diamond");
    const gold = screen.getByTestId("tier-gold");
    expect(diamond.textContent).toContain("Quán Gen Z");
    expect(gold.textContent).toContain("Cà phê Gạch");
  });
});
