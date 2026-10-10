import { describe, expect, it } from "vitest";
import {
  addMinutes,
  fromLocalInput,
  toLocalInput,
} from "../src/features/admin/time";

describe("admin time helpers", () => {
  it("shows a stored time as Vietnam wall-clock time", () => {
    expect(toLocalInput("2026-10-18T08:00:00+07:00")).toBe("2026-10-18T08:00");
    // The same instant written in UTC.
    expect(toLocalInput("2026-10-18T01:00:00.000Z")).toBe("2026-10-18T08:00");
    expect(toLocalInput(null)).toBe("");
  });

  it("stores a picked time with the +07:00 offset", () => {
    expect(fromLocalInput("2026-10-18T08:30")).toBe("2026-10-18T08:30:00+07:00");
    expect(fromLocalInput("")).toBeNull();
  });

  it("adds minutes across an hour and a day boundary", () => {
    expect(addMinutes("2026-10-18T08:50:00+07:00", 20)).toBe(
      "2026-10-18T09:10:00+07:00",
    );
    expect(addMinutes("2026-10-18T23:50:00+07:00", 20)).toBe(
      "2026-10-19T00:10:00+07:00",
    );
  });
});
