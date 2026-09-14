import type { TournamentDocument } from "../../../../packages/domain/src/schema";
import { teamName } from "../matches/shared";

// Public athletes carry only name, gender and team — everything else stays
// in .private/roster.json.
export function AthleteTable({ t }: { t: TournamentDocument }) {
  const drawn = t.draw.status === "confirmed";
  return (
    <div className="card">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>VĐV</th>
              <th>Nội dung</th>
              {drawn && <th>Đội</th>}
            </tr>
          </thead>
          <tbody>
            {t.athletes.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>{a.gender === "male" ? "Nam" : "Nữ"}</td>
                {drawn && <td>{teamName(t, a.teamId)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>
        {t.athletes.filter((a) => a.active).length} VĐV đang thi đấu.
      </p>
    </div>
  );
}
