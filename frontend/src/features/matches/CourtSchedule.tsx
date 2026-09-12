import type { TournamentDocument } from '../../../../packages/domain/src/schema';

export function CourtSchedule({ tournament }: { tournament: TournamentDocument }) {
  return <section><h2>Phân sân</h2><div className="match-grid">{tournament.courts.map((court) => <article className="match-card" key={court.id}><h3>{court.name}</h3><ul>{tournament.matches.filter((match) => match.courtId === court.id).map((match) => <li key={match.id}>Trận #{match.order}: {match.startsAt ? new Date(match.startsAt).toLocaleTimeString('vi-VN',{hour:'2-digit',minute:'2-digit'}) : 'Chưa xếp giờ'}</li>)}</ul></article>)}{!tournament.courts.length && <p className="notice">Chưa cấu hình sân thi đấu.</p>}</div></section>;
}
