import type { TournamentDocument } from '../../../../packages/domain/src/schema';
import type { Category } from '../../../../packages/domain/src/schema';
export const categoryName = (category: Category) => ({mens_doubles:'Đôi nam',womens_doubles:'Đôi nữ',mixed_doubles:'Đôi nam nữ'})[category];
export const teamName = (tournament: TournamentDocument, id: string | null) => tournament.teams.find((team) => team.id === id)?.name ?? 'Chờ xếp hạng';
