import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { AthleteTable } from "../src/features/athletes/AthleteTable";
import {
  makePublicAthletes,
  makeTournament,
} from "../../packages/domain/src/testing/fixtures";

function tournament(feeVnd: number | null) {
  const t = makeTournament();
  t.info.feeVnd = feeVnd;
  t.athletes = makePublicAthletes(3);
  t.athletes[0] = { ...t.athletes[0], teamId: "red", feePaid: true };
  t.athletes[1] = { ...t.athletes[1], teamId: "blue" };
  return t;
}
const cells = (row: number) =>
  within(screen.getAllByRole("row")[row])
    .getAllByRole("cell")
    .map((c) => c.textContent);
// Columns: VĐV (name + the phone-only gender word), Nội dung, Đội, Lệ phí.

describe("AthleteTable", () => {
  it("shows each athlete's team, and says so when there is none yet", () => {
    render(<AthleteTable t={tournament(150000)} />);
    expect(cells(1)[2]).toBe("Đội Đỏ");
    expect(cells(2)[2]).toBe("Đội Xanh");
    expect(cells(3)[2]).toBe("Chưa có đội");
  });

  it("shows who has paid the lệ phí and counts them", () => {
    render(<AthleteTable t={tournament(150000)} />);
    expect(cells(1)[3]).toBe("Đã đóng");
    expect(cells(2)[3]).toBe("Chưa đóng");
    expect(screen.getByText(/1\/3 đã đóng lệ phí/)).toBeDefined();
  });

  it("leaves the lệ phí column out while no fee is set", () => {
    render(<AthleteTable t={tournament(null)} />);
    expect(screen.queryByText("Lệ phí")).toBeNull();
    expect(cells(1)).toHaveLength(3);
    expect(screen.queryByText(/đã đóng lệ phí/)).toBeNull();
  });
});
