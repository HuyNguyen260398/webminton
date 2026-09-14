import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PosterOne } from "../src/features/landing/PosterOne";
import { makeTournament } from "../../packages/domain/src/testing/fixtures";

// The empty fixture, not the shipped file: these assert component behaviour,
// which must not change when the tournament data does.
const t = makeTournament();

describe("PosterOne", () => {
  it("renders the title and the club badge", () => {
    render(<PosterOne t={t} />);
    expect(screen.getByText(/GIẢI CẦU LÔNG/i)).toBeDefined();
    expect(screen.getByText(/NỘI BỘ 2026/i)).toBeDefined();
    expect(screen.getByText(/HỘI LÔNG THỦ CN1416/i)).toBeDefined();
  });

  it("renders the four fact rows from info", () => {
    render(<PosterOne t={t} />);
    for (const label of ["KHI NÀO?", "Ở ĐÂU?", "ĐÁNH NHỮNG GÌ?"])
      expect(screen.getByText(label)).toBeDefined();
    expect(screen.getByText(t.info.location)).toBeDefined();
    expect(screen.getByText(t.info.dateLabel)).toBeDefined();
  });

  it("shows the ??? fee strip while feeVnd is null", () => {
    render(<PosterOne t={t} />);
    expect(screen.getByText("???")).toBeDefined();
  });

  it("shows the amount once feeVnd is set", () => {
    render(<PosterOne t={{ ...t, info: { ...t.info, feeVnd: 150000 } }} />);
    expect(screen.queryByText("???")).toBeNull();
    // The amount shows twice: as the big mark and in the body line.
    expect(screen.getAllByText(/150\.000/).length).toBeGreaterThan(0);
  });

  it("falls back to a placeholder while the match day is unset", () => {
    render(<PosterOne t={t} />);
    expect(screen.getByText(/NGÀY THI ĐẤU CHỐT SAU/i)).toBeDefined();
  });

  it("shows the match day once startsAt is set", () => {
    render(
      <PosterOne
        t={{
          ...t,
          info: { ...t.info, startsAt: "2026-10-18T08:00:00+07:00" },
        }}
      />,
    );
    expect(screen.getByText(/THI ĐẤU NGÀY/i).textContent).toContain(
      "18/10/2026",
    );
  });

  it("never invites anyone to register or to message Zalo", () => {
    const { container } = render(
      <PosterOne
        t={{
          ...t,
          info: {
            ...t.info,
            contactName: "Anh Huy",
            contactPhone: "0900000000",
            zaloUrl: "https://zalo.me/g/abcdef",
          },
        }}
      />,
    );
    expect(container.textContent).not.toMatch(
      /ĐĂNG KÝ TRƯỚC|ĐĂNG KÝ SỚM|Zalo|Anh Huy|0900/i,
    );
    expect(container.querySelectorAll("a[href*=\"zalo\"]")).toHaveLength(0);
  });

  it("renders the three photo captions", () => {
    render(<PosterOne t={t} />);
    expect(screen.getByText("Đội hình mùa trước")).toBeDefined();
    expect(screen.getByText("Cầm vàng thì đừng để vàng rơi")).toBeDefined();
    expect(screen.getByText("Hiệp phụ ngoài quán")).toBeDefined();
  });

  it("gives every photo descriptive alt text, not the caption", () => {
    render(<PosterOne t={t} />);
    const imgs = screen.getAllByRole("img");
    expect(imgs).toHaveLength(3);
    for (const img of imgs) {
      const alt = img.getAttribute("alt") ?? "";
      expect(alt.length).toBeGreaterThan(10);
      expect(alt).not.toBe(img.closest("figure")?.querySelector("figcaption")
        ?.textContent);
    }
  });

});
