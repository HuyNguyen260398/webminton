import type { TournamentDocument, Category, Match } from "./schema";
import { isFinalScore } from "./score";
import { calculateStandings, type Standing } from "./standings";

export interface DerivedResults {
  matches: Match[];
  standings: Standing[];
  champion: string | null;
  runnerUp: string | null;
  third: string | null;
  consolation: string | null;
  finalized: boolean;
  categoryWinners: Partial<Record<Category, string[]>>;
}

// Results are never stored. They are recomputed from match scores on every
// load, so a hand-edited document cannot disagree with its own standings.
export function deriveTournament(input: TournamentDocument): DerivedResults {
  const t = structuredClone(input);
  for (const m of t.matches) {
    m.winnerTeamId = null;
    if (m.status === "completed" || m.status === "walkover") {
      if (!m.score || !isFinalScore(m.score)) throw new Error("INVALID_SCORE");
      if (!m.teamAId || !m.teamBId) throw new Error("INVALID_TEAM");
      if (
        m.status === "walkover" &&
        !(
          (m.score.a === 21 && m.score.b === 0) ||
          (m.score.a === 0 && m.score.b === 21)
        )
      )
        throw new Error("INVALID_WALKOVER");
      m.winnerTeamId = m.score.a > m.score.b ? m.teamAId : m.teamBId;
    }
  }

  const standings = calculateStandings(t);
  let champion: string | null = null;
  let runnerUp: string | null = null;
  let third: string | null = null;
  let consolation: string | null = null;

  for (const phase of ["first_place", "third_place"] as const) {
    const matches = t.matches.filter((m) => m.phase === phase),
      wins = new Map<string, number>();
    for (const m of matches)
      if (m.winnerTeamId)
        wins.set(m.winnerTeamId, (wins.get(m.winnerTeamId) ?? 0) + 1);
    const winner = [...wins].find(([, n]) => n >= 2)?.[0] ?? null;
    const loser = winner
      ? ([matches[0]?.teamAId, matches[0]?.teamBId].find(
          (id) => id !== winner,
        ) ?? null)
      : null;
    if (phase === "first_place") {
      champion = winner;
      runnerUp = loser;
    } else {
      third = winner;
      consolation = loser;
    }
  }

  const categoryWinners: Partial<Record<Category, string[]>> = {};
  for (const category of t.rules.categories) {
    const counts = t.teams.map((team) => ({
      id: team.id,
      count: t.matches.filter(
        (m) =>
          m.phase === "group" &&
          m.category === category &&
          m.winnerTeamId === team.id,
      ).length,
    }));
    const max = Math.max(...counts.map((x) => x.count));
    if (max > 0)
      categoryWinners[category] = counts
        .filter((x) => x.count === max)
        .map((x) => x.id);
  }

  const finalized =
    t.matches.length === 24 && t.matches.every((m) => m.winnerTeamId !== null);

  return {
    matches: t.matches,
    standings,
    champion,
    runnerUp,
    third,
    consolation,
    finalized,
    categoryWinners,
  };
}
