import type { PublicTournament } from '../../lib/api';
import type { Category } from '../../../../packages/domain/src/schema';
export const categoryName = (category: Category) => ({mens_doubles:'Đôi nam',womens_doubles:'Đôi nữ',mixed_doubles:'Đôi nam nữ'})[category];
export const teamName = (tournament: PublicTournament, id: string | null) => tournament.teams.find((team) => team.id === id)?.name ?? 'Chờ xếp hạng';
