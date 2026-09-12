import type { PublicTournament } from '../../lib/api';
import { categoryName, teamName } from './shared';

export function PlacementBracket({ tournament }: { tournament: PublicTournament }) {
  const placements = tournament.matches.filter((match) => match.phase !== 'group');
  return <div className="bracket">{placements.length ? placements.map((match) => <article className="match-card" key={match.id}><small>{match.phase === 'first_place' ? 'Chung kết' : 'Tranh hạng ba'} · {categoryName(match.category)}</small><h3>{teamName(tournament, match.teamAId)} <b>{match.score ? `${match.score.a} – ${match.score.b}` : 'vs'}</b> {teamName(tournament, match.teamBId)}</h3></article>) : <p className="notice">Các cặp tranh hạng sẽ xuất hiện sau khi hoàn tất 18 trận vòng bảng.</p>}</div>;
}
