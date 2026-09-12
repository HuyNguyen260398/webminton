import type { TournamentDocument } from "./schema";
import { isFinalScore } from "./score";
import { calculateStandings } from "./standings";
export function deriveTournament(
  input: TournamentDocument,
): TournamentDocument {
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
  t.results.standings = calculateStandings(t);
  t.results.champion = null;
  t.results.runnerUp = null;
  t.results.third = null;
  t.results.consolation = null;
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
      t.results.champion = winner;
      t.results.runnerUp = loser;
    } else {
      t.results.third = winner;
      t.results.consolation = loser;
    }
  }
  t.results.categoryWinners = {};
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
      t.results.categoryWinners[category] = counts
        .filter((x) => x.count === max)
        .map((x) => x.id);
  }
  t.results.finalized =
    t.results.finalized &&
    t.matches.length === 24 &&
    t.matches.every((m) => m.winnerTeamId !== null);
  return t;
}
