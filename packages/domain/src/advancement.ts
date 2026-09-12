import type { TournamentDocument, Score, Match } from "./schema";
import { deriveTournament } from "./derive";
import { isFinalScore } from "./score";
export function seedPlacement(input: TournamentDocument): TournamentDocument {
  const t = deriveTournament(input),
    group = t.matches.filter((m) => m.phase === "group"),
    old = t.matches.filter((m) => m.phase !== "group");
  const ready =
    group.length === 18 &&
    group.every((m) => m.winnerTeamId) &&
    t.results.standings.every((r) => r.rank !== null);
  const desired = ready ? t.results.standings.map((r) => r.teamId) : [];
  // Group by phase instead of display order: admins may reorder freely.
  const first = old.find((m) => m.phase === "first_place"),
    third = old.find((m) => m.phase === "third_place");
  const same =
    first &&
    third &&
    JSON.stringify([
      first.teamAId,
      first.teamBId,
      third.teamAId,
      third.teamBId,
    ]) === JSON.stringify(desired);
  if (same) return t;
  if (old.some((m) => m.status !== "pending"))
    throw new Error("PLACEMENT_RESET_REQUIRED");
  t.matches = group;
  if (!ready) return deriveTournament(t);
  for (const [index, phase] of (
    ["first_place", "third_place"] as const
  ).entries())
    for (const category of t.rules.categories) {
      const teamAId = desired[index * 2],
        teamBId = desired[index * 2 + 1];
      const pairFor = (team: string) => {
        const m = group.find(
          (m) =>
            m.category === category &&
            (m.teamAId === team || m.teamBId === team),
        );
        return m ? (m.teamAId === team ? m.pairA : m.pairB) : null;
      };
      const m: Match = {
        id: `${phase}-${category}`,
        encounterId: phase,
        phase,
        category,
        order: t.matches.length + 1,
        teamAId,
        teamBId,
        pairA: pairFor(teamAId),
        pairB: pairFor(teamBId),
        lineupPublished: false,
        courtId: null,
        startsAt: null,
        endsAt: null,
        status: "pending",
        score: null,
        winnerTeamId: null,
      };
      t.matches.push(m);
    }
  return deriveTournament(t);
}
export function applyScore(
  input: TournamentDocument,
  id: string,
  score: Score,
): TournamentDocument {
  if (!isFinalScore(score)) throw new Error("INVALID_SCORE");
  const t = structuredClone(input),
    m = t.matches.find((m) => m.id === id);
  if (!m) throw new Error("MATCH_NOT_FOUND");
  m.score = score;
  m.status = "completed";
  t.results.finalized = false;
  return seedPlacement(t);
}
export function resetPlacement(input: TournamentDocument): TournamentDocument {
  const t = structuredClone(input);
  t.matches = t.matches.filter((m) => m.phase === "group");
  t.results.finalized = false;
  return deriveTournament(t);
}
