import type { TournamentDocument } from '../../../../packages/domain/src/schema';

export function TeamPreview({ tournament }: { tournament: TournamentDocument }) {
  const assigned = tournament.draw.assignment;
  return <div className="team-preview">{tournament.teams.map((team) => { const people = tournament.athletes.filter((athlete) => assigned[athlete.id] === team.id); const men = people.filter((athlete) => athlete.gender === 'male').length; const women = people.length - men; const skill = people.filter((athlete) => athlete.skillBand !== null).reduce((sum, athlete) => sum + (4 - athlete.skillBand!), 0); return <article className="match-card" key={team.id}><span className="team-dot" style={{background:team.color}} /> <strong>{team.name}</strong><p>{people.length} VĐV · {men} nam · {women} nữ · chỉ số {skill}</p><ul>{people.map((athlete) => <li key={athlete.id}>{athlete.name} <small>({athlete.skillBand ?? '?'})</small></li>)}</ul></article>; })}</div>;
}
