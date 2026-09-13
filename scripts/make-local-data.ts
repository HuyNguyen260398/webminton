// Builds a populated tournament document for local development.
// Demo data only: names, phones, dates, fees and sponsors are invented.
// The posters deliberately leave fee/date/contact unconfirmed, so nothing here
// may be copied back into data/tournament.seed.json.
import { writeFile, mkdir } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import {
  TournamentSchema,
  type TournamentDocument,
  type Athlete,
  type Match,
} from "../packages/domain/src/schema";
import { generateDraw, confirmDraw, rosterHash } from "../packages/domain/src/draw";
import { generateGroupMatches } from "../packages/domain/src/round-robin";
import { seedPlacement } from "../packages/domain/src/advancement";
import { findScheduleConflicts } from "../packages/domain/src/schedule";

const target = process.env.LOCAL_DATA_FILE ?? ".private/local-tournament.json";
const day = "2026-10-25";
const pad = (n: number) => String(n).padStart(2, "0");
const at = (time: string) => `${day}T${time}:00+07:00`;
/** Wall-clock time this many minutes after 08:00. */
const clock = (minutes: number) =>
  at(`${pad(8 + Math.floor(minutes / 60))}:${pad(minutes % 60)}`);

const men = [
  "Nguyễn Minh Hoàng",
  "Trần Quốc Bảo",
  "Lê Văn Khánh",
  "Phạm Anh Tuấn",
  "Hoàng Đức Duy",
  "Vũ Thành Nam",
  "Đặng Hữu Phước",
  "Bùi Xuân Trường",
  "Đỗ Nhật Long",
  "Ngô Gia Huy",
  "Lý Tấn Phát",
  "Phan Công Danh",
];
const women = [
  "Nguyễn Thu Hà",
  "Trần Ngọc Linh",
  "Lê Phương Anh",
  "Phạm Bảo Trân",
  "Hoàng Mỹ Duyên",
  "Vũ Khánh Vy",
  "Đặng Thanh Mai",
  "Bùi Hương Giang",
  "Đỗ Quỳnh Như",
  "Ngô Kim Ngân",
  "Lý Thảo Nhi",
  "Phan Cẩm Tú",
];

const athletes: Athlete[] = [...men, ...women].map((name, i) => ({
  id: `vdv-${String(i + 1).padStart(2, "0")}`,
  name,
  gender: i < men.length ? "male" : "female",
  skillBand: ((i % 3) + 1) as 1 | 2 | 3,
  teamId: null,
  phone: `09000000${String(i + 1).padStart(2, "0")}`,
  note: "",
  active: true,
}));

const base = TournamentSchema.parse(
  JSON.parse(await readFile("data/tournament.seed.json", "utf8")),
);

let t: TournamentDocument = {
  ...base,
  updatedAt: new Date().toISOString(),
  info: {
    ...base.info,
    startsAt: at("08:00"),
    dateLabel: "Chủ nhật, 25/10/2026 — 08:00",
    registrationDeadline: `${"2026-10-15"}T23:59:00+07:00`,
    feeVnd: null, // posters: "ĐANG CHỐT"
    contactName: "Huy (BTC)",
    contactPhone: "0900000000",
    zaloUrl: "https://zalo.me/g/demo1416",
    qrAssetPath: "/images/momo-qr-code.jpeg",
    qrPublished: false, // real payment QR — publish only on purpose
  },
  athletes,
  courts: [
    { id: "court-1", name: "Sân 1" },
    { id: "court-2", name: "Sân 2" },
    { id: "court-3", name: "Sân 3" },
  ],
};

// Draw: seeded so the demo is reproducible, then confirmed onto the athletes.
t.draw = generateDraw(t, "local-demo-2026");
t = confirmDraw(t, rosterHash(t));
t.matches = generateGroupMatches(t.teams, t.rules.categories);

// A team is 3 men + 3 women, so one encounter's three matches share nobody
// and can run simultaneously on the three courts.
const roster = (teamId: string, gender: "male" | "female") =>
  t.athletes
    .filter((a) => a.teamId === teamId && a.gender === gender)
    .map((a) => a.id)
    .sort();
for (const teamId of t.teams.map((x) => x.id))
  for (const gender of ["male", "female"] as const)
    if (roster(teamId, gender).length !== 3)
      throw new Error(`Draw gave ${teamId} an unbalanced ${gender} roster`);

const lineup = (teamId: string, category: Match["category"]) => {
  const m = roster(teamId, "male"),
    w = roster(teamId, "female");
  return (
    category === "mens_doubles"
      ? [m[0], m[1]]
      : category === "womens_doubles"
        ? [w[0], w[1]]
        : [m[2], w[2]]
  ) as [string, string];
};

// Stronger team is the lower index; the wider the gap the wider the score.
const strength = new Map(t.teams.map((team, i) => [team.id, i]));
const loserScore = { 1: 18, 2: 15, 3: 12 } as const;
const encounters = [...new Set(t.matches.map((m) => m.encounterId))];

for (const m of t.matches) {
  const slot = encounters.indexOf(m.encounterId);
  const category = t.rules.categories.indexOf(m.category);
  const gap = strength.get(m.teamBId!)! - strength.get(m.teamAId!)!;
  m.pairA = lineup(m.teamAId!, m.category);
  m.pairB = lineup(m.teamBId!, m.category);
  m.lineupPublished = true;
  m.courtId = t.courts[category].id;
  m.startsAt = clock(slot * 45);
  m.endsAt = clock(slot * 45 + 40);
  m.status = "completed";
  m.score = { a: 21, b: loserScore[gap as 1 | 2 | 3] - category };
}

// Seeds the six placement matches from the finished group stage.
t = seedPlacement(t);
if (t.matches.length !== 24)
  throw new Error(`Expected 24 matches, got ${t.matches.length}`);
if (t.results.standings.some((r) => r.rank === null))
  throw new Error("Group stage ended tied; adjust the scores above");

for (const m of t.matches.filter((x) => x.phase !== "group")) {
  const category = t.rules.categories.indexOf(m.category);
  m.lineupPublished = true;
  m.courtId = t.courts[category].id;
  m.startsAt = at(m.phase === "first_place" ? "13:00" : "13:45");
  m.endsAt = at(m.phase === "first_place" ? "13:40" : "14:25");
}

const conflicts = findScheduleConflicts(t.matches);
if (conflicts.length)
  throw new Error(`Schedule conflicts: ${JSON.stringify(conflicts)}`);

// Mirrors docs/acceptance/2026-tournament-checklist.md:
// 1.000.000 BTC + 500.000 tài trợ − 300.000 đã chi = 1.200.000.
t.sponsorships = [
  {
    id: "sponsor-1",
    name: "Cà phê Sân Sau",
    amountVnd: 500000,
    received: true,
    note: "",
    tierOverride: null,
  },
  {
    id: "sponsor-2",
    name: "Quán Gen Z",
    amountVnd: 300000,
    received: false,
    note: "",
    tierOverride: null,
  },
  {
    id: "sponsor-3",
    name: "Anh Tuấn CN1416",
    amountVnd: 200000,
    received: false,
    note: "",
    tierOverride: null,
  },
];
t.finance = {
  published: true,
  feePayments: [], // fee is still "ĐANG CHỐT" on the posters
  income: [
    {
      id: "organizer",
      label: "Ban tổ chức đóng góp",
      amountVnd: 1000000,
      received: true,
    },
  ],
  expenses: [
    ["Thuê sân", 12, 100000, false],
    ["Cầu thi đấu", 2, 150000, true],
    ["Huy chương", 4, 150000, false],
    ["Cúp / kỷ niệm chương", 1, 500000, false],
    ["Nước uống, khăn", 24, 25000, false],
    ["Tiệc tổng kết", 24, 60000, false],
    ["In poster, banner", 1, 160000, false],
  ].map(([label, quantity, unitPriceVnd, paid], i) => ({
    id: String(i),
    label: label as string,
    quantity: quantity as number,
    unitPriceVnd: unitPriceVnd as number,
    paid: paid as boolean,
    note: "",
  })),
};

t.revision = 1;
t.updatedAt = new Date().toISOString();

const document = TournamentSchema.parse(t);
await mkdir(".private", { recursive: true });
await writeFile(target, JSON.stringify(document, null, 2) + "\n", {
  mode: 0o600,
});
console.log(
  `Đã tạo ${target}: ${document.athletes.length} VĐV, ${document.matches.length} trận, ${document.courts.length} sân.`,
);
