import type { TournamentDocument } from "../../../../packages/domain/src/schema";

// Public athletes carry name, gender, team and whether the lệ phí is in.
// Trình độ and phone numbers stay with the organiser.
const gender = (a: { gender: "male" | "female" }) =>
  a.gender === "male" ? "Nam" : "Nữ";

export function AthleteTable({ t }: { t: TournamentDocument }) {
  // No fee set, nothing to owe: the column appears once BTC names a figure.
  const hasFee = t.info.feeVnd !== null;
  const active = t.athletes.filter((a) => a.active);
  const paid = active.filter((a) => a.feePaid).length;
  return (
    <div className="card">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>VĐV</th>
              <th className="athlete-col-gender">Nội dung</th>
              <th>Đội</th>
              {hasFee && <th>Lệ phí</th>}
            </tr>
          </thead>
          <tbody>
            {t.athletes.map((a) => {
              const team = t.teams.find((x) => x.id === a.teamId);
              return (
                <tr key={a.id}>
                  <td>
                    {a.name}
                    {/* On a phone the Nội dung column gives way to Đội and
                        Lệ phí, and the same word sits under the name. */}
                    <small className="athlete-gender" aria-hidden="true">
                      {gender(a)}
                    </small>
                  </td>
                  <td className="athlete-col-gender">{gender(a)}</td>
                  <td>
                    {team ? (
                      <span className="athlete-team">
                        <span
                          className="team-grid__swatch"
                          style={{ background: team.color }}
                          aria-hidden="true"
                        />
                        {team.name}
                      </span>
                    ) : (
                      <span className="muted">Chưa có đội</span>
                    )}
                  </td>
                  {hasFee && (
                    <td>
                      <span
                        className={`athlete-fee athlete-fee--${a.feePaid ? "paid" : "due"}`}
                      >
                        {a.feePaid ? "Đã đóng" : "Chưa đóng"}
                      </span>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ marginBottom: 0 }}>
        {active.length} VĐV đang thi đấu
        {hasFee && ` · ${paid}/${active.length} đã đóng lệ phí`}.
      </p>
    </div>
  );
}
