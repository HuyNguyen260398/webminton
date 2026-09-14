import type { TournamentDocument } from "../../../../packages/domain/src/schema";
import type { DerivedResults } from "../../../../packages/domain/src/derive";
import { Pill } from "../landing/primitives";
import { groupByEncounter, teamName } from "./shared";
import { DrawTie } from "./DrawTie";

const PHASES = [
  {
    phase: "first_place",
    title: "Tranh giải Nhất & Nhì",
    winner: { label: "Nhất", tone: "red" },
    loser: { label: "Nhì", tone: "green" },
  },
  {
    phase: "third_place",
    title: "Tranh giải Ba & Khuyến khích",
    winner: { label: "Ba", tone: "yellow" },
    loser: { label: "Khuyến khích", tone: "outline" },
  },
] as const;

export function PlacementBracket({
  t,
  derived,
}: {
  t: TournamentDocument;
  derived: DerivedResults;
}) {
  const encounters = groupByEncounter(
    derived.matches.filter((m) => m.phase !== "group"),
  );
  if (encounters.length === 0) return null;
  const outcome = {
    first_place: [derived.champion, derived.runnerUp],
    third_place: [derived.third, derived.consolation],
  } as const;
  return (
    <>
      <h3 className="draw-stage">Vòng tranh hạng</h3>
      <div className="draw-bracket">
        {PHASES.map(({ phase, title, winner, loser }) => {
          const encounter = encounters.find((e) => e.id === phase);
          if (!encounter) return null;
          const [top, bottom] = outcome[phase];
          return (
            <article key={phase} className="draw-bracket__panel">
              <header className="draw-block__head">
                <span className="draw-block__no">{title}</span>
                <span className="draw-block__versus">
                  <span className="draw-block__side">
                    {teamName(t, encounter.teamAId)}
                  </span>
                  <span className="draw-block__tally">
                    {encounter.tally.a} – {encounter.tally.b}
                  </span>
                  <span className="draw-block__side draw-block__side--b">
                    {teamName(t, encounter.teamBId)}
                  </span>
                </span>
              </header>
              <div className="draw-block__body">
                {encounter.matches.map((m) => (
                  <DrawTie key={m.id} t={t} m={m} />
                ))}
              </div>
              {/* The three ties converge on one placement — here the bracket
                  line is honest, which it never is for a round robin. */}
              <div className="draw-bracket__elbow" aria-hidden="true" />
              <div className="draw-bracket__result">
                <Pill tone={winner.tone}>
                  {winner.label.toUpperCase()} · {teamName(t, top)}
                </Pill>
                <Pill tone={loser.tone}>
                  {loser.label.toUpperCase()} · {teamName(t, bottom)}
                </Pill>
              </div>
            </article>
          );
        })}
      </div>
    </>
  );
}
