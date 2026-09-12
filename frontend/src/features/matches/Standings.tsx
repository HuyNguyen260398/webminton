import type { PublicTournament } from '../../lib/api';

export function Standings({ tournament }: { tournament: PublicTournament }) {
  const names = new Map(tournament.teams.map((team) => [team.id, team.name]));
  return <div className="table-scroll"><table><thead><tr><th>Hạng</th><th>Đội</th><th>Trận</th><th>Thắng</th><th>Điểm</th><th>Hiệu số</th></tr></thead><tbody>{tournament.results.standings.length ? tournament.results.standings.map((row) => <tr key={row.teamId}><td>{row.rank ?? '–'}</td><td><strong>{names.get(row.teamId)}</strong></td><td>{row.played}</td><td>{row.wins}</td><td>{row.pointsFor}</td><td>{row.difference > 0 ? '+' : ''}{row.difference}</td></tr>) : <tr><td colSpan={6}>Chưa có kết quả vòng bảng.</td></tr>}</tbody></table></div>;
}
