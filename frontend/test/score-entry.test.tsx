import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ScoreEntry } from "../src/features/admin/ScoreEntry";

const setup = (initial: { a: number; b: number } | null = null) => {
  const onSave = vi.fn();
  render(
    <ScoreEntry
      nameA="Đội Đỏ"
      nameB="Đội Xanh"
      initial={initial}
      disabled={false}
      onSave={onSave}
    />,
  );
  const a = screen.getByLabelText("Điểm Đội Đỏ") as HTMLInputElement;
  const b = screen.getByLabelText("Điểm Đội Xanh") as HTMLInputElement;
  const save = screen.getByRole("button", { name: "Lưu tỉ số" }) as HTMLButtonElement;
  const type = (el: HTMLInputElement, value: string) =>
    fireEvent.change(el, { target: { value } });
  return { a, b, save, type, onSave };
};

describe("ScoreEntry", () => {
  it("cannot be saved while a field is empty", () => {
    const { a, save, type, onSave } = setup();
    expect(save.disabled).toBe(true);
    type(a, "21");
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Nhập điểm của hai đội.")).toBeDefined();
  });

  it("explains a score that is not final", () => {
    const { a, b, save, type } = setup();
    type(a, "21");
    type(b, "20");
    expect(save.disabled).toBe(true);
    expect(
      screen.getByText("Chưa hợp lệ: séc tới 21, hơn 2 điểm, trần 25."),
    ).toBeDefined();
  });

  it("saves a final score as numbers", () => {
    const { a, b, save, type, onSave } = setup();
    type(a, "21");
    type(b, "15");
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith({ a: 21, b: 15 });
  });

  it("keeps only digits, at most two", () => {
    const { a, type } = setup();
    type(a, "2a1x9");
    expect(a.value).toBe("21");
    type(a, "-");
    expect(a.value).toBe("");
  });

  it("steps from empty to 1 and never below 0 or above 25", () => {
    const { a, type } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Tăng Điểm Đội Đỏ" }));
    expect(a.value).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Giảm Điểm Đội Đỏ" }));
    fireEvent.click(screen.getByRole("button", { name: "Giảm Điểm Đội Đỏ" }));
    expect(a.value).toBe("0");
    type(a, "25");
    fireEvent.click(screen.getByRole("button", { name: "Tăng Điểm Đội Đỏ" }));
    expect(a.value).toBe("25");
  });

  it("starts from the stored score when correcting a result", () => {
    const { a, b, save } = setup({ a: 22, b: 20 });
    expect([a.value, b.value]).toEqual(["22", "20"]);
    expect(save.disabled).toBe(false);
  });
});
