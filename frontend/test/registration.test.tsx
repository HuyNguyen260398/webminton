import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Registration } from "../src/features/landing/Registration";
import { makeTournament } from "../../packages/domain/src/testing/fixtures";

// The empty fixture, not the shipped file: these assert component behaviour,
// which must not change when the tournament data does.
const t = makeTournament();
const FORM = "https://forms.cloud.microsoft/Pages/ResponsePage.aspx?id=abc123";
const open = (extra: Partial<typeof t.info> = {}) => ({
  ...t,
  info: { ...t.info, registrationFormUrl: FORM, ...extra },
});

describe("Registration", () => {
  it("renders nothing while registrationFormUrl is null", () => {
    const { container } = render(<Registration t={t} />);
    expect(container.firstChild).toBeNull();
  });

  it("wears the section title slab", () => {
    const { container } = render(<Registration t={open()} />);
    expect(screen.getByText("ĐĂNG KÝ THI ĐẤU")).toBeDefined();
    expect(container.querySelector("#dang-ky")).not.toBeNull();
  });

  it("opens the form in a new tab, safely", () => {
    render(<Registration t={open()} />);
    const link = screen.getByRole("link", { name: /MỞ FORM ĐĂNG KÝ/i });
    expect(link.getAttribute("href")).toBe(FORM);
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("says the deadline is still open while registrationDeadline is null", () => {
    const { container } = render(<Registration t={open()} />);
    expect(container.textContent).toMatch(/Chưa chốt hạn/);
  });

  it("shows the date once registrationDeadline is set", () => {
    const { container } = render(
      <Registration
        t={open({ registrationDeadline: "2026-10-11T23:59:00+07:00" })}
      />,
    );
    expect(container.textContent).toMatch(/Hạn chót đăng ký: 11\/10\/2026/);
    expect(container.textContent).not.toMatch(/Chưa chốt hạn/);
  });

  it("keeps the form URL out of the visible copy", () => {
    const { container } = render(<Registration t={open()} />);
    expect(container.textContent).not.toMatch(/https?:\/\//);
  });
});
