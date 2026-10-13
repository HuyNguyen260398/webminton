import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { Prizes } from "../src/features/landing/Prizes";

const card = (title: string) =>
  within(screen.getByRole("heading", { name: title }).closest(".card") as HTMLElement);

describe("Prizes", () => {
  it("is the GIẢI THƯỞNG section the bar links to", () => {
    const { container } = render(<Prizes />);
    expect(container.querySelector("section#giai-thuong")).not.toBeNull();
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(
      "GIẢI THƯỞNG",
    );
  });

  it("gives every member of the winning team a gold medal, the runner-up silver", () => {
    render(<Prizes />);
    expect(card("ĐỘI VÔ ĐỊCH").getByText(/huy chương vàng/i)).toBeDefined();
    expect(card("ĐỘI Á QUÂN").getByText(/huy chương bạc/i)).toBeDefined();
  });

  it("announces one secret prize for each of the two smash titles", () => {
    render(<Prizes />);
    for (const title of ["MÁY ĐÓNG GẠCH", "VUA PHÁ LƯỚI"]) {
      expect(card(title).getByText(/một giải duy nhất/i)).toBeDefined();
      expect(card(title).getByText(/bật mí sau giải/i)).toBeDefined();
    }
  });
});
