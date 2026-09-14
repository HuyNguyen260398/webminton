import type { TournamentDocument } from "../../../../packages/domain/src/schema";
import type { DerivedResults } from "../../../../packages/domain/src/derive";
import { groupByEncounter, teamName } from "./shared";
import { DrawTie } from "./DrawTie";

export function GroupSchedule({
  t,
  derived,
}: {
  t: TournamentDocument;
  derived: DerivedResults;
}) {
  const encounters = groupByEncounter(
    derived.matches.filter((m) => m.phase === "group"),
  );
  if (encounters.length === 0) return null;
  return (
    <>
      <h3 className="draw-stage">Vòng bảng</h3>
      <div className="draw-grid">
        {encounters.map((e, i) => (
          <article key={e.id} className="draw-block">
            <header className="draw-block__head">
              <span className="draw-block__no">Trận {i + 1}</span>
              <span className="draw-block__versus">
                <span className="draw-block__side">
                  {teamName(t, e.teamAId)}
                </span>
                <span className="draw-block__tally">
                  {e.tally.a} – {e.tally.b}
                </span>
                <span className="draw-block__side draw-block__side--b">
                  {teamName(t, e.teamBId)}
                </span>
              </span>
            </header>
            <div className="draw-block__body">
              {e.matches.map((m) => (
                <DrawTie key={m.id} t={t} m={m} />
              ))}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
