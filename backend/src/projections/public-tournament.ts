import type { TournamentDocument } from "../../../packages/domain/src/schema";
import {
  calculateFinance,
  rankSponsors,
} from "../../../packages/domain/src/finance";
export function toPublicTournament(t: TournamentDocument) {
  const tiers = rankSponsors(t);
  return {
    id: t.id,
    updatedAt: t.updatedAt,
    info: {
      ...t.info,
      qrAssetPath: t.info.qrPublished ? t.info.qrAssetPath : null,
    },
    rules: t.rules,
    athletes: t.athletes
      .filter((a) => a.active)
      .map((a) => ({
        id: a.id,
        name: a.name,
        gender: a.gender,
        teamId: t.draw.status === "confirmed" ? a.teamId : null,
      })),
    teams: t.teams.map(({ id, name, color }) => ({ id, name, color })),
    courts: t.courts,
    matches: t.matches.map((m) => ({
      ...m,
      pairA: m.lineupPublished ? m.pairA : null,
      pairB: m.lineupPublished ? m.pairB : null,
    })),
    results: t.results,
    draw: {
      status: t.draw.status === "confirmed" ? "confirmed" : "not_started",
    },
    sponsorships: t.sponsorships.map((s) => ({
      id: s.id,
      name: s.name,
      amountVnd: s.amountVnd,
      tier: tiers.find((x) => x.id === s.id)!.tier,
    })),
    finance: t.finance.published
      ? {
          published: true,
          totals: calculateFinance(t),
          expenses: t.finance.expenses.map(
            ({ id, label, quantity, unitPriceVnd, paid }) => ({
              id,
              label,
              quantity,
              unitPriceVnd,
              paid,
            }),
          ),
          income: t.finance.income.map(
            ({ id, label, amountVnd, received }) => ({
              id,
              label,
              amountVnd,
              received,
            }),
          ),
        }
      : { published: false },
  };
}
export type PublicTournament = ReturnType<typeof toPublicTournament>;
