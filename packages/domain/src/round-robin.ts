import type { Team, Category, Match } from "./schema";
export function generateGroupMatches(
  teams: Team[],
  categories: Category[],
): Match[] {
  if (
    teams.length !== 4 ||
    new Set(teams.map((t) => t.id)).size !== 4 ||
    categories.join() !== "mens_doubles,womens_doubles,mixed_doubles"
  )
    throw new Error("UNSUPPORTED_FORMAT");
  const matches: Match[] = [];
  for (let i = 0; i < teams.length; i++)
    for (let j = i + 1; j < teams.length; j++)
      for (const category of categories) {
        const encounterId = `group-${teams[i].id}-${teams[j].id}`;
        matches.push({
          id: `${encounterId}-${category}`,
          encounterId,
          category,
          phase: "group",
          order: matches.length + 1,
          teamAId: teams[i].id,
          teamBId: teams[j].id,
          pairA: null,
          pairB: null,
          lineupPublished: false,
          courtId: null,
          startsAt: null,
          endsAt: null,
          status: "pending",
          score: null,
          winnerTeamId: null,
        });
      }
  return matches;
}
