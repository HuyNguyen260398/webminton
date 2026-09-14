import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { PosterOne } from "../src/features/landing/PosterOne";
import { PublicTournamentSchema } from "../../packages/domain/src/schema";

const t = PublicTournamentSchema.parse(
  JSON.parse(readFileSync("frontend/public/tournament.json", "utf8")),
);

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

  it("falls back to ĐĂNG KÝ SỚM NHÉ when there is no deadline", () => {
    render(<PosterOne t={t} />);
    expect(screen.getByText(/ĐĂNG KÝ SỚM NHÉ/i)).toBeDefined();
  });

  it("shows the deadline once registrationDeadline is set", () => {
    render(
      <PosterOne
        t={{
          ...t,
          info: {
            ...t.info,
            registrationDeadline: "2026-10-15T23:59:00+07:00",
          },
        }}
      />,
    );
    expect(screen.getByText(/ĐĂNG KÝ TRƯỚC/i).textContent).toContain("15");
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

  it("shows the contact and Zalo link when info carries them", () => {
    render(
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
    expect(screen.getByText(/Anh Huy/)).toBeDefined();
    expect(
      screen.getByRole("link", { name: /Zalo/i }).getAttribute("href"),
    ).toBe("https://zalo.me/g/abcdef");
  });
});
