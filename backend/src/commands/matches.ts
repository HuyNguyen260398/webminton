import type { TournamentDocument } from "../../../packages/domain/src/schema";
import type { TournamentCommand } from "../../../packages/domain/src/commands";
import {
  applyScore,
  resetPlacement,
} from "../../../packages/domain/src/advancement";
import { walkoverScore } from "../../../packages/domain/src/score";
import {
  validateLineup,
  reorderMatches,
  findScheduleConflicts,
} from "../../../packages/domain/src/schedule";
export function matchCommand(
  t: TournamentDocument,
  c: TournamentCommand,
): TournamentDocument {
  if (c.type === "reorderMatches") {
    t.matches = reorderMatches(t.matches, c.payload.orderedIds);
    return t;
  }
  if (c.type === "resetPlacement") return resetPlacement(t);
  if (
    ![
      "setLineup",
      "publishLineup",
      "setSchedule",
      "setScore",
      "setWalkover",
    ].includes(c.type)
  )
    throw new Error("UNKNOWN_COMMAND");
  const payload = c.payload as { matchId: string };
  const m = t.matches.find((m) => m.id === payload.matchId);
  if (!m) throw new Error("MATCH_NOT_FOUND");
  switch (c.type) {
    case "setLineup":
      if (m.score && !c.payload.clearScore)
        throw new Error("CLEAR_SCORE_REQUIRED");
      m.pairA = c.payload.pairA;
      m.pairB = c.payload.pairB;
      validateLineup(t, m);
      m.lineupPublished = false;
      m.score = null;
      m.winnerTeamId = null;
      m.status = "pending";
      t.results.finalized = false;
      break;
    case "publishLineup":
      validateLineup(t, m);
      m.lineupPublished = true;
      if (m.status === "pending") m.status = "called";
      break;
    case "setSchedule":
      m.courtId = c.payload.courtId;
      m.startsAt = c.payload.startsAt;
      m.endsAt = c.payload.endsAt;
      break;
    case "setScore":
      validateLineup(t, m);
      return applyScore(t, m.id, c.payload.score);
    case "setWalkover": {
      validateLineup(t, m);
      const next = applyScore(t, m.id, walkoverScore(c.payload.absentSide));
      next.matches.find((x) => x.id === m.id)!.status = "walkover";
      return next;
    }
  }
  if (findScheduleConflicts(t.matches).length)
    throw new Error("SCHEDULE_CONFLICT");
  return t;
}
