import type {
  TournamentDocument,
  Athlete,
} from "../../../packages/domain/src/schema";
import { rosterHash } from "../../../packages/domain/src/draw";
export function replaceRoster(t: TournamentDocument, athletes: Athlete[]) {
  const oldHash = rosterHash(t);
  for (const old of t.athletes) {
    const next = athletes.find((a) => a.id === old.id),
      used =
        t.matches.some((m) =>
          [...(m.pairA ?? []), ...(m.pairB ?? [])].includes(old.id),
        ) || t.finance.feePayments.some((p) => p.athleteId === old.id);
    if (!next && used) throw new Error("ATHLETE_IN_USE");
    if (
      t.draw.status === "confirmed" &&
      (!next ||
        ["gender", "skillBand", "teamId", "active"].some(
          (k) => old[k as keyof Athlete] !== next[k as keyof Athlete],
        ))
    )
      throw new Error("ROSTER_LOCKED");
  }
  if (t.draw.status === "confirmed" && athletes.length !== t.athletes.length)
    throw new Error("ROSTER_LOCKED");
  if (t.draw.status !== "confirmed" && athletes.some((a) => a.teamId !== null))
    throw new Error("TEAM_ASSIGNMENT_REQUIRES_DRAW");
  t.athletes = athletes;
  if (oldHash !== rosterHash(t) && t.draw.status === "draft")
    t.draw = {
      status: "not_started",
      algorithmVersion: "balanced-v1",
      seed: null,
      rosterHash: null,
      assignment: {},
    };
}
