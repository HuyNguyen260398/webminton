import { describe, expect, it } from "vitest";
import { PrivateRosterSchema } from "../src/roster";

const athlete = {
  id: "a1",
  name: "Nguyễn Văn A",
  gender: "male",
  skillBand: 2,
  phone: "0900000000",
  note: "",
  active: true,
};

describe("PrivateRosterSchema", () => {
  it("accepts a roster with phone and skill band", () => {
    expect(PrivateRosterSchema.safeParse({ athletes: [athlete] }).success).toBe(
      true,
    );
  });

  it("allows a null skill band and a null phone", () => {
    expect(
      PrivateRosterSchema.safeParse({
        athletes: [{ ...athlete, skillBand: null, phone: null }],
      }).success,
    ).toBe(true);
  });

  it("rejects a skill band outside 1..3", () => {
    expect(
      PrivateRosterSchema.safeParse({ athletes: [{ ...athlete, skillBand: 4 }] })
        .success,
    ).toBe(false);
  });

  it("rejects a teamId — team assignment belongs to the public file", () => {
    expect(
      PrivateRosterSchema.safeParse({
        athletes: [{ ...athlete, teamId: "t1" }],
      }).success,
    ).toBe(false);
  });

  it("rejects duplicate athlete ids", () => {
    expect(
      PrivateRosterSchema.safeParse({ athletes: [athlete, athlete] }).success,
    ).toBe(false);
  });
});
