import type {
  Match,
  TournamentDocument,
} from "../../../../packages/domain/src/schema";
import { categoryName, teamColor, teamName } from "./shared";
import { lineup } from "./lineup";

// One tie, drawn as the BWF sheet draws a pairing: the two sides stacked, the
// team colour standing in for the flag and the score where the seed sits.
// Reference: assets/images/bwf.jpeg.
export function DrawTie({ t, m }: { t: TournamentDocument; m: Match }) {
  return (
    <div className="draw-tie">
      <span className="draw-tie__label">{categoryName(m.category)}</span>
      <DrawRow t={t} m={m} side="A" />
      <DrawRow t={t} m={m} side="B" />
    </div>
  );
}

function DrawRow({
  t,
  m,
  side,
}: {
  t: TournamentDocument;
  m: Match;
  side: "A" | "B";
}) {
  const teamId = side === "A" ? m.teamAId : m.teamBId;
  const won = m.winnerTeamId !== null && m.winnerTeamId === teamId;
  const score = m.score ? (side === "A" ? m.score.a : m.score.b) : null;
  return (
    <div className={`draw-row${won ? " is-winner" : ""}`}>
      <span
        className="draw-row__flag"
        style={{ background: teamColor(t, teamId) }}
        aria-hidden="true"
      />
      <span className="draw-row__who">
        <span className="draw-row__team">{teamName(t, teamId)}</span>
        {lineup(t, m, side)}
      </span>
      <span className="draw-row__score">{score === null ? "—" : score}</span>
    </div>
  );
}
