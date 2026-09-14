import { generateGroupMatches } from "../round-robin";
import { deriveTournament } from "../derive";
import { PublicTournamentSchema, type TournamentDocument } from "../schema";
import type { PrivateRoster } from "../roster";

// Inlined rather than read from a seed file: the domain package must stay
// importable from the browser, where there is no filesystem.
const seed = {
  schemaVersion: 1,
  id: "noi-bo-2026",
  updatedAt: "2026-09-14T00:00:00+07:00",
  info: {
    name: "Giải cầu lông nội bộ 2026",
    clubName: "Hội lông thủ CN1416",
    slogan: "Đánh hết sức · Thua hết hồn · Nhậu hết mình",
    location: "Sân cầu lông Tấn Phúc",
    startsAt: null,
    dateLabel: "Cuối tháng 10.2026 — ngày cụ thể chốt sau khi đủ quân",
    registrationDeadline: null,
    timezone: "Asia/Ho_Chi_Minh",
    feeVnd: null,
    contactName: null,
    contactPhone: null,
    zaloUrl: null,
    qrAssetPath: "/qr/momo.jpg",
    qrPublished: true,
  },
  rules: {
    teamCount: 4,
    categories: ["mens_doubles", "womens_doubles", "mixed_doubles"],
    setTarget: 21,
    cap: 25,
    changeEndsAt: 11,
    minLead: 2,
    ranking: ["pointsFor", "wins", "difference", "manualHeadToHead"],
    placementWins: 2,
    lateMinutes: 10,
    walkoverScore: { winner: 21, loser: 0 },
  },
  athletes: [],
  teams: [
    { id: "red", name: "Đội Đỏ", color: "#E63D27", captainId: null },
    { id: "blue", name: "Đội Xanh", color: "#2563EB", captainId: null },
    { id: "yellow", name: "Đội Vàng", color: "#FFD644", captainId: null },
    { id: "white", name: "Đội Trắng", color: "#FFFDF4", captainId: null },
  ],
  matches: [],
  courts: [],
  draw: {
    status: "not_started",
    algorithmVersion: "balanced-v1",
    assignment: {},
  },
  tieDecisions: [],
  sponsorships: [],
  finance: {
    published: false,
    income: [
      {
        id: "organizer",
        label: "Ban tổ chức đóng góp",
        amountVnd: 1000000,
        received: false,
      },
    ],
    expenses: [],
  },
};

export function makeTournament(): TournamentDocument {
  return PublicTournamentSchema.parse(structuredClone(seed));
}

export function makeRoster(count: number): PrivateRoster {
  return {
    athletes: Array.from({ length: count }, (_, i) => ({
      id: `athlete-${i + 1}`,
      name: `VĐV thử ${i + 1}`,
      gender: i % 2 === 0 ? ("male" as const) : ("female" as const),
      skillBand: ((i % 3) + 1) as 1 | 2 | 3,
      phone: null,
      note: "Dữ liệu kiểm thử",
      active: true,
    })),
  };
}

/** The public-shaped athletes a confirmed draw would have written. */
export function makePublicAthletes(
  count: number,
  teamIds: string[] = [],
): TournamentDocument["athletes"] {
  return makeRoster(count).athletes.map((a, i) => ({
    id: a.id,
    name: a.name,
    gender: a.gender,
    active: a.active,
    teamId: teamIds.length ? teamIds[i % teamIds.length] : null,
  }));
}

export function makeCompletedGroup(): TournamentDocument {
  const t = makeTournament();
  t.matches = generateGroupMatches(t.teams, t.rules.categories).map((m) => ({
    ...m,
    status: "completed" as const,
    score: { a: 21, b: 18 },
  }));
  return { ...t, matches: deriveTournament(t).matches };
}
