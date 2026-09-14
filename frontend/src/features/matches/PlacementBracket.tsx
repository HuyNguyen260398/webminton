import type { TournamentDocument } from "../../../../packages/domain/src/schema";
import type { DerivedResults } from "../../../../packages/domain/src/derive";
import { Card, Pill } from "../landing/primitives";
import { categoryName, teamName } from "./shared";

const PHASES = [
  { phase: "first_place", title: "Tranh giải Nhất & Nhì" },
  { phase: "third_place", title: "Tranh giải Ba & Khuyến khích" },
] as const;

export function PlacementBracket({
  t,
  derived,
}: {
  t: TournamentDocument;
  derived: DerivedResults;
}) {
  const placement = derived.matches.filter((m) => m.phase !== "group");
  if (placement.length === 0) return null;
  return (
    <>
      <div className="placement-grid">
        {PHASES.map(({ phase, title }) => {
          const ms = placement.filter((m) => m.phase === phase);
          if (ms.length === 0) return null;
          return (
            <Card key={phase} title={title}>
              <ul className="placement-list">
                {ms.map((m) => (
                  <li key={m.id}>
                    <span>{categoryName(m.category)}</span>
                    <b>
                      {teamName(t, m.teamAId)} – {teamName(t, m.teamBId)}
                    </b>
                    <span>{m.score ? `${m.score.a}–${m.score.b}` : "—"}</span>
                  </li>
                ))}
              </ul>
            </Card>
          );
        })}
      </div>
      {derived.champion && (
        <div className="pill-row">
          <Pill tone="red">NHẤT · {teamName(t, derived.champion)}</Pill>
          {derived.runnerUp && (
            <Pill tone="green">NHÌ · {teamName(t, derived.runnerUp)}</Pill>
          )}
          {derived.third && (
            <Pill tone="outline">BA · {teamName(t, derived.third)}</Pill>
          )}
          {derived.consolation && (
            <Pill tone="outline">
              KHUYẾN KHÍCH · {teamName(t, derived.consolation)}
            </Pill>
          )}
        </div>
      )}
    </>
  );
}
