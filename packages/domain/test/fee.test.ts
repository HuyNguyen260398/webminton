import { describe, expect, it } from "vitest";
import { applyCommand, FEE_INCOME_ID, type AdminState } from "../src/commands";
import { calculateFinance } from "../src/finance";
import { PublicTournamentSchema } from "../src/schema";
import { makeAdminState } from "../src/testing/fixtures";

const NOW = "2026-10-18T08:00:00+07:00";
const run = (s: AdminState, command: unknown) =>
  applyCommand(s, command, "btc@example.com", NOW);
const pay = (s: AdminState, athleteId: string, paid = true) =>
  run(s, { type: "setFeePaid", payload: { athleteId, paid } });
const withFee = (feeVnd: number | null) =>
  run(makeAdminState(), { type: "updateInfo", payload: { feeVnd } });
const feeLine = (s: AdminState) =>
  s.document.finance.income.find((x) => x.id === FEE_INCOME_ID);

describe("registration fee", () => {
  it("adds the fee to the balance for each athlete ticked", () => {
    let s = withFee(150000);
    const [a, b] = s.document.athletes;
    const before = calculateFinance(s.document).balanceVnd;

    s = pay(s, a.id);
    expect(feeLine(s)).toMatchObject({ amountVnd: 150000, received: true });
    expect(calculateFinance(s.document).balanceVnd).toBe(before + 150000);

    s = pay(s, b.id);
    expect(feeLine(s)!.amountVnd).toBe(300000);
    expect(feeLine(s)!.label).toContain("2/16");
    expect(calculateFinance(s.document).balanceVnd).toBe(before + 300000);
  });

  it("takes it back when the tick is removed, and drops the line at zero", () => {
    let s = withFee(150000);
    const [a, b] = s.document.athletes;
    const before = calculateFinance(s.document).balanceVnd;
    s = pay(pay(s, a.id), b.id);
    s = pay(s, a.id, false);
    expect(feeLine(s)!.amountVnd).toBe(150000);
    s = pay(s, b.id, false);
    expect(feeLine(s)).toBeUndefined();
    expect(calculateFinance(s.document).balanceVnd).toBe(before);
  });

  it("ticking twice counts once", () => {
    let s = withFee(150000);
    const [a] = s.document.athletes;
    s = pay(pay(s, a.id), a.id);
    expect(feeLine(s)!.amountVnd).toBe(150000);
  });

  it("follows a change of fee, and counts nothing while the fee is unset", () => {
    let s = withFee(null);
    const [a, b] = s.document.athletes;
    s = pay(pay(s, a.id), b.id);
    expect(feeLine(s)!.amountVnd).toBe(0);
    s = run(s, { type: "updateInfo", payload: { feeVnd: 200000 } });
    expect(feeLine(s)!.amountVnd).toBe(400000);
  });

  it("keeps who paid private and out of the published document", () => {
    let s = withFee(150000);
    const [a] = s.document.athletes;
    s = pay(s, a.id);
    expect(s.private[a.id].feePaid).toBe(true);
    expect(JSON.stringify(s.document)).not.toContain("feePaid");
    expect(PublicTournamentSchema.safeParse(s.document).success).toBe(true);
  });

  it("survives an edit of the athlete and goes with a removed one", () => {
    let s = withFee(150000);
    const [a] = s.document.athletes;
    s = pay(s, a.id);
    s = run(s, {
      type: "upsertAthlete",
      payload: {
        id: a.id,
        name: "Tên Mới",
        gender: a.gender,
        active: true,
        skillBand: 1,
        phone: null,
        note: "",
      },
    });
    expect(s.private[a.id].feePaid).toBe(true);
    expect(feeLine(s)!.amountVnd).toBe(150000);

    s = run(s, { type: "resetDraw", payload: {} });
    s = run(s, { type: "removeAthlete", payload: { id: a.id } });
    expect(feeLine(s)).toBeUndefined();
  });

  it("refuses a hand edit or removal of the fee line, and an unknown athlete", () => {
    const s = pay(withFee(150000), makeAdminState().document.athletes[0].id);
    expect(() =>
      run(s, {
        type: "upsertIncome",
        payload: { ...feeLine(s)!, amountVnd: 1 },
      }),
    ).toThrow("FEE_LINE_LOCKED");
    expect(() =>
      run(s, { type: "removeIncome", payload: { id: FEE_INCOME_ID } }),
    ).toThrow("FEE_LINE_LOCKED");
    expect(() => pay(s, "khong-co")).toThrow("ATHLETE_NOT_FOUND");
  });
});
