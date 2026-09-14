import type {
  Match,
  TournamentDocument,
} from "../../../../packages/domain/src/schema";

// An unpublished lineup stays hidden: teams must not learn the opposing pairs
// before the organisers call them.
export function lineup(t: TournamentDocument, m: Match, side: "A" | "B") {
  if (!m.lineupPublished) return null;
  const pair = side === "A" ? m.pairA : m.pairB;
  if (!pair) return null;
  const names = pair.map(
    (id) => t.athletes.find((a) => a.id === id)?.name ?? "?",
  );
  return <small className="lineup">{names.join(" · ")}</small>;
}
