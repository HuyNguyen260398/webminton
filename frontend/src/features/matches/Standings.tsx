import type { TournamentDocument } from "../../../../packages/domain/src/schema";
import type { DerivedResults } from "../../../../packages/domain/src/derive";
import { teamName } from "./shared";

export function Standings({
  t,
  derived,
}: {
  t: TournamentDocument;
  derived: DerivedResults;
}) {
  return (
    <div className="card">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Hạng</th>
              <th>Đội</th>
              <th>Trận</th>
              <th>Thắng</th>
              <th>Điểm ghi</th>
              <th>Hiệu số</th>
            </tr>
          </thead>
          <tbody>
            {derived.standings.map((row) => (
              <tr key={row.teamId}>
                <td>{row.rank ?? "—"}</td>
                <td>{teamName(t, row.teamId)}</td>
                <td>{row.played}</td>
                <td>{row.wins}</td>
                <td>{row.pointsFor}</td>
                <td>
                  {row.difference > 0 ? `+${row.difference}` : row.difference}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>
        Xếp theo tổng điểm ghi được, rồi số trận thắng, rồi hiệu số điểm.
      </p>
    </div>
  );
}
