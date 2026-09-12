import type { TournamentDocument, Match } from "./schema";
export function validateLineup(t: TournamentDocument, m: Match): void {
  if (!m.teamAId || !m.teamBId || m.teamAId === m.teamBId)
    throw new Error("INVALID_TEAM");
  for (const [team, pair] of [
    [m.teamAId, m.pairA],
    [m.teamBId, m.pairB],
  ] as const) {
    if (!pair || pair.length !== 2 || pair[0] === pair[1])
      throw new Error("INVALID_LINEUP");
    const athletes = pair.map((id) => t.athletes.find((a) => a.id === id));
    if (athletes.some((a) => !a || !a.active || a.teamId !== team))
      throw new Error("INVALID_LINEUP");
    const women = athletes.filter((a) => a!.gender === "female").length;
    if (
      women !==
      { mens_doubles: 0, womens_doubles: 2, mixed_doubles: 1 }[m.category]
    )
      throw new Error("INVALID_GENDER");
  }
}
export function findScheduleConflicts(
  matches: Match[],
): Array<{ matchIds: [string, string]; reason: "court" | "athlete" }> {
  const out: Array<{
    matchIds: [string, string];
    reason: "court" | "athlete";
  }> = [];
  for (let i = 0; i < matches.length; i++)
    for (let j = i + 1; j < matches.length; j++) {
      const a = matches[i],
        b = matches[j];
      if (!a.startsAt || !a.endsAt || !b.startsAt || !b.endsAt) continue;
      if (
        Date.parse(a.startsAt) >= Date.parse(b.endsAt) ||
        Date.parse(b.startsAt) >= Date.parse(a.endsAt)
      )
        continue;
      if (a.courtId && a.courtId === b.courtId)
        out.push({ matchIds: [a.id, b.id], reason: "court" });
      const aIds = [...(a.pairA ?? []), ...(a.pairB ?? [])],
        bIds = [...(b.pairA ?? []), ...(b.pairB ?? [])];
      if (aIds.some((id) => bIds.includes(id)))
        out.push({ matchIds: [a.id, b.id], reason: "athlete" });
    }
  return out;
}
export function reorderMatches(matches: Match[], ids: string[]): Match[] {
  if (
    ids.length !== matches.length ||
    new Set(ids).size !== matches.length ||
    ids.some((id) => !matches.some((m) => m.id === id))
  )
    throw new Error("INVALID_ORDER");
  return ids.map((id, i) => ({
    ...structuredClone(matches.find((m) => m.id === id)!),
    order: i + 1,
  }));
}
