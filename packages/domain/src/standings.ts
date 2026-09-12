import type { TournamentDocument } from "./schema";
import { createHash } from "node:crypto";
import { isFinalScore } from "./score";
export function resultsHash(t: TournamentDocument): string {
  return createHash("sha256")
    .update(
      JSON.stringify(
        t.matches
          .filter((m) => m.phase === "group")
          .map((m) => ({ id: m.id, score: m.score, status: m.status }))
          .sort((a, b) => a.id.localeCompare(b.id)),
      ),
    )
    .digest("hex");
}
export function calculateStandings(
  t: TournamentDocument,
): TournamentDocument["results"]["standings"] {
  const rows = t.teams.map((team) => ({
    teamId: team.id,
    played: 0,
    pointsFor: 0,
    pointsAgainst: 0,
    wins: 0,
    difference: 0,
    rank: null as number | null,
  }));
  for (const m of t.matches.filter(
    (m) =>
      m.phase === "group" &&
      (m.status === "completed" || m.status === "walkover"),
  )) {
    if (!m.score || !isFinalScore(m.score)) throw new Error("INVALID_SCORE");
    const a = rows.find((r) => r.teamId === m.teamAId),
      b = rows.find((r) => r.teamId === m.teamBId);
    if (!a || !b) throw new Error("INVALID_TEAM");
    a.played++;
    b.played++;
    a.pointsFor += m.score.a;
    a.pointsAgainst += m.score.b;
    b.pointsFor += m.score.b;
    b.pointsAgainst += m.score.a;
    (m.score.a > m.score.b ? a : b).wins++;
  }
  rows.forEach((r) => (r.difference = r.pointsFor - r.pointsAgainst));
  const compare = (a: (typeof rows)[number], b: (typeof rows)[number]) =>
    b.pointsFor - a.pointsFor || b.wins - a.wins || b.difference - a.difference;
  rows.sort(compare);
  for (let i = 0; i < rows.length; ) {
    let j = i + 1;
    while (j < rows.length && compare(rows[i], rows[j]) === 0) j++;
    if (j - i === 1 && rows[i].played > 0) rows[i].rank = i + 1;
    else {
      const ids = rows
        .slice(i, j)
        .map((r) => r.teamId)
        .sort()
        .join();
      const d = t.tieDecisions.find(
        (d) =>
          d.sourceResultsHash === resultsHash(t) &&
          [...d.tiedTeamIds].sort().join() === ids &&
          new Set(d.orderedTeamIds).size === j - i &&
          [...d.orderedTeamIds].sort().join() === ids,
      );
      if (d && rows[i].played > 0) {
        const group = rows
          .slice(i, j)
          .sort(
            (a, b) =>
              d.orderedTeamIds.indexOf(a.teamId) -
              d.orderedTeamIds.indexOf(b.teamId),
          );
        group.forEach((r, k) => (r.rank = i + k + 1));
        rows.splice(i, j - i, ...group);
      }
    }
    i = j;
  }
  return rows;
}
