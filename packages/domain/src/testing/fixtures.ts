import { generateGroupMatches } from "../round-robin";
import { deriveTournament } from "../derive";
import seed from "../../../../data/tournament.seed.json";
import { TournamentSchema, type Athlete } from "../schema";

export function makeTournament() {
  return TournamentSchema.parse(structuredClone(seed));
}
export function makeRoster(count: number): Athlete[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `athlete-${i + 1}`,
    name: `VĐV thử ${i + 1}`,
    gender: i % 2 === 0 ? "male" : "female",
    skillBand: ((i % 3) + 1) as 1 | 2 | 3,
    teamId: null,
    phone: null,
    note: "Dữ liệu kiểm thử",
    active: true,
  }));
}

export function makeCompletedGroup() {
  const t = makeTournament();
  t.matches = generateGroupMatches(t.teams, t.rules.categories).map((m) => ({
    ...m,
    status: "completed",
    score: { a: 21, b: 18 },
  }));
  return deriveTournament(t);
}
