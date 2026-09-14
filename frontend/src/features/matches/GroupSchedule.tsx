import type { TournamentDocument } from "../../../../packages/domain/src/schema";
import type { DerivedResults } from "../../../../packages/domain/src/derive";
import { categoryName, teamName } from "./shared";
import { lineup } from "./lineup";

export function GroupSchedule({
  t,
  derived,
}: {
  t: TournamentDocument;
  derived: DerivedResults;
}) {
  const matches = derived.matches.filter((m) => m.phase === "group");
  if (matches.length === 0) return null;
  return (
    <div className="card">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Nội dung</th>
              <th>Đội A</th>
              <th>Đội B</th>
              <th>Tỉ số</th>
            </tr>
          </thead>
          <tbody>
            {matches.map((m) => (
              <tr key={m.id}>
                <td>{m.order}</td>
                <td>{categoryName(m.category)}</td>
                <td className={m.winnerTeamId === m.teamAId ? "is-winner" : ""}>
                  <span className="team">{teamName(t, m.teamAId)}</span>
                  {lineup(t, m, "A")}
                </td>
                <td className={m.winnerTeamId === m.teamBId ? "is-winner" : ""}>
                  <span className="team">{teamName(t, m.teamBId)}</span>
                  {lineup(t, m, "B")}
                </td>
                <td>{m.score ? `${m.score.a}–${m.score.b}` : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
