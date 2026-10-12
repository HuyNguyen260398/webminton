import type { TournamentView } from "../../lib/use-tournament";
import type { TournamentDocument } from "../../../../packages/domain/src/schema";
import { deriveDuel } from "../../../../packages/domain/src/duel";
import { SELF_DRAW_TEAM_IDS } from "../../../../packages/domain/src/team-draw";

// Registration needs a form to send people to, and the organiser not having
// closed it. A switch that was never touched means open.
export const registrationOpen = (info: TournamentDocument["info"]) =>
  Boolean(info.registrationFormUrl) && info.registrationOpen !== false;

// Which of the page's optional sections have something to show. The sections
// and the nav bar both read this, so the bar never links to a section that
// is not there.
export function pageSections({ t, derived }: TournamentView) {
  const drawn = t.draw.status === "confirmed";
  // The two-team bảng đấu, once the organiser has created it.
  const duel = deriveDuel(t);
  return {
    registration: registrationOpen(t.info),
    teamDraw: t.draw.status === "open",
    athletes: t.athletes.length > 0,
    fourTeams: drawn,
    // The athletes' own draw fills two teams without a confirmed draw.
    twoTeams:
      !drawn &&
      t.athletes.some((a) =>
        (SELF_DRAW_TEAM_IDS as readonly string[]).includes(a.teamId ?? ""),
      ),
    duel,
    // The giải is being played: BẢNG ĐẤU and VUA SMASH go to the top of the
    // page and the front of the bar. Without a bảng đấu there is nothing to
    // move.
    started: t.info.started === true && duel !== null,
    smash: duel !== null && duel.smashHit.length + duel.smashNet.length > 0,
    schedule: drawn && derived.matches.length > 0,
    standings: derived.matches.some((m) => m.winnerTeamId !== null),
    finance: t.finance.published,
  };
}
