import { test, expect } from "vitest";
import { makeTournament, makeRoster } from "../src/testing/fixtures";
import { calculateFinance, rankSponsors } from "../src/finance";
test("cash totals exclude unpaid budgets and unreceived pledges", () => {
  const t = makeTournament();
  t.athletes = makeRoster(3);
  t.finance.income[0].received = true;
  t.sponsorships = [
    {
      id: "s1",
      name: "A",
      amountVnd: 500000,
      received: true,
      note: "",
      tierOverride: null,
    },
    {
      id: "s2",
      name: "B",
      amountVnd: 200000,
      received: false,
      note: "",
      tierOverride: null,
    },
  ];
  t.finance.expenses = [
    {
      id: "e1",
      label: "Sân",
      quantity: 1,
      unitPriceVnd: 300000,
      paid: true,
      note: "",
    },
    {
      id: "e2",
      label: "Cầu",
      quantity: 1,
      unitPriceVnd: 100000,
      paid: false,
      note: "",
    },
  ];
  expect(calculateFinance(t)).toMatchObject({
    receivedVnd: 1500000,
    paidVnd: 300000,
    balanceVnd: 1200000,
    budgetExpenseVnd: 400000,
    additionalPerAthleteVnd: 0,
  });
});
test("additional contribution rounds up to thousands and handles zero athletes", () => {
  const t = makeTournament();
  t.finance.income = [];
  t.finance.expenses = [
    {
      id: "e",
      label: "Chi",
      quantity: 1,
      unitPriceVnd: 10001,
      paid: false,
      note: "",
    },
  ];
  expect(calculateFinance(t).additionalPerAthleteVnd).toBeNull();
  t.athletes = makeRoster(3);
  expect(calculateFinance(t).additionalPerAthleteVnd).toBe(4000);
});
test("equal sponsor amounts share tiers and next distinct amount is gold", () => {
  const t = makeTournament();
  t.sponsorships = [100, 100, 90, 80].map((amountVnd, i) => ({
    id: `s${i}`,
    name: `Nhà tài trợ ${i}`,
    amountVnd,
    received: false,
    note: "",
    tierOverride: null,
  }));
  expect(rankSponsors(t).map((x) => x.tier)).toEqual([
    "diamond",
    "diamond",
    "gold",
    "friendly",
  ]);
});
