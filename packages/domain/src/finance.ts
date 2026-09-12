import type { TournamentDocument } from "./schema";
export function calculateFinance(t: TournamentDocument) {
  const sum = (values: number[]) => {
    const n = values.reduce((a, b) => a + b, 0);
    if (!Number.isSafeInteger(n)) throw new Error("MONEY_OVERFLOW");
    return n;
  };
  const fees = sum(t.finance.feePayments.map((p) => p.amountVnd));
  const receivedVnd = sum([
    fees,
    ...t.finance.income.filter((x) => x.received).map((x) => x.amountVnd),
    ...t.sponsorships.filter((x) => x.received).map((x) => x.amountVnd),
  ]);
  const paidVnd = sum(
    t.finance.expenses
      .filter((e) => e.paid)
      .map((e) => e.quantity * e.unitPriceVnd),
  );
  const budgetExpenseVnd = sum(
    t.finance.expenses.map((e) => e.quantity * e.unitPriceVnd),
  );
  const pledgedVnd = sum([
    fees,
    ...t.finance.income.map((x) => x.amountVnd),
    ...t.sponsorships.map((x) => x.amountVnd),
  ]);
  const count = t.athletes.filter((a) => a.active).length;
  return {
    receivedVnd,
    paidVnd,
    balanceVnd: receivedVnd - paidVnd,
    budgetExpenseVnd,
    additionalPerAthleteVnd: count
      ? Math.ceil(Math.max(0, budgetExpenseVnd - pledgedVnd) / count / 1000) *
        1000
      : null,
  };
}
export function rankSponsors(
  t: TournamentDocument,
): Array<{ id: string; tier: "diamond" | "gold" | "friendly" }> {
  const amounts = [
    ...new Set(
      t.sponsorships.filter((s) => s.amountVnd > 0).map((s) => s.amountVnd),
    ),
  ].sort((a, b) => b - a);
  return t.sponsorships.map((s) => ({
    id: s.id,
    tier:
      s.tierOverride ??
      (s.amountVnd === amounts[0]
        ? "diamond"
        : s.amountVnd === amounts[1]
          ? "gold"
          : "friendly"),
  }));
}
