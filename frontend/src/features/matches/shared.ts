import type {
  Category,
  Match,
  TournamentDocument,
} from "../../../../packages/domain/src/schema";

export const categoryName = (category: Category) =>
  ({
    mens_doubles: "Đôi nam",
    womens_doubles: "Đôi nữ",
    mixed_doubles: "Đôi nam nữ",
  })[category];

export const teamName = (tournament: TournamentDocument, id: string | null) =>
  tournament.teams.find((team) => team.id === id)?.name ?? "Chờ xếp hạng";

export const teamColor = (tournament: TournamentDocument, id: string | null) =>
  tournament.teams.find((team) => team.id === id)?.color ?? "transparent";

export interface Encounter {
  id: string;
  teamAId: string | null;
  teamBId: string | null;
  matches: Match[];
  tally: { a: number; b: number };
}

// The per-encounter tally is presentation only. Like every other result it is
// recomputed rather than stored, and the domain has no use for it: an
// encounter's 2–1 is just its three ties counted.
export function groupByEncounter(matches: Match[]): Encounter[] {
  const encounters: Encounter[] = [];
  const byId = new Map<string, Encounter>();
  for (const m of matches) {
    let encounter = byId.get(m.encounterId);
    if (!encounter) {
      // The generator keeps the sides consistent across an encounter's three
      // ties, so the first match fixes which team reads on top.
      encounter = {
        id: m.encounterId,
        teamAId: m.teamAId,
        teamBId: m.teamBId,
        matches: [],
        tally: { a: 0, b: 0 },
      };
      byId.set(m.encounterId, encounter);
      encounters.push(encounter);
    }
    encounter.matches.push(m);
    // An unplayed match has no winner, and a placement slot not yet filled has
    // no team: never let one null match the other.
    if (m.winnerTeamId === null) continue;
    if (m.winnerTeamId === encounter.teamAId) encounter.tally.a += 1;
    else if (m.winnerTeamId === encounter.teamBId) encounter.tally.b += 1;
  }
  return encounters;
}
