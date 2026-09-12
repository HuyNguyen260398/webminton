import type { PublicTournament } from '../../lib/api';
import { categoryName, teamName } from './shared';

export function GroupSchedule({ tournament }: { tournament: PublicTournament }) {
  const groups = tournament.matches.filter((match) => match.phase === 'group');
  return <div className="match-grid">{groups.length ? groups.map((match) => <article className="match-card" key={match.id}><small>#{match.order} · {categoryName(match.category)}</small><h3>{teamName(tournament, match.teamAId)} <b>{match.score ? `${match.score.a} – ${match.score.b}` : 'vs'}</b> {teamName(tournament, match.teamBId)}</h3><p>{match.courtId ? tournament.courts.find((court) => court.id === match.courtId)?.name : 'Chưa xếp sân'} · {match.startsAt ? new Intl.DateTimeFormat('vi-VN',{dateStyle:'short',timeStyle:'short'}).format(new Date(match.startsAt)) : 'Chưa xếp giờ'}</p><p>{match.lineupPublished ? 'Đội hình đã công bố' : 'Chưa công bố đội hình'}</p></article>) : <p className="notice">Chưa có lịch vòng bảng. BTC xác nhận kết quả bốc thăm để tạo 18 trận.</p>}</div>;
}
