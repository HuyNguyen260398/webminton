import { z } from "zod";

export const Id = z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/);
const text = z.string().trim().min(1).max(500);
const note = z.string().max(2000);
export const Money = z
  .number()
  .int()
  .nonnegative()
  .max(Number.MAX_SAFE_INTEGER);
const time = z.iso.datetime({ offset: true });
export const CategorySchema = z.enum([
  "mens_doubles",
  "womens_doubles",
  "mixed_doubles",
]);
export const ScoreSchema = z.strictObject({
  a: z.number().int().min(0).max(25),
  b: z.number().int().min(0).max(25),
});
export const PairSchema = z
  .tuple([Id, Id])
  .refine(([a, b]) => a !== b, "Hai VĐV phải khác nhau");
export const AthleteSchema = z.strictObject({
  id: Id,
  name: text,
  gender: z.enum(["male", "female"]),
  teamId: Id.nullable(),
  active: z.boolean(),
});
export const TeamSchema = z.strictObject({
  id: Id,
  name: text,
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  captainId: Id.nullable(),
});
export const MatchSchema = z.strictObject({
  id: Id,
  phase: z.enum(["group", "first_place", "third_place"]),
  encounterId: Id,
  category: CategorySchema,
  order: z.number().int().positive(),
  teamAId: Id.nullable(),
  teamBId: Id.nullable(),
  pairA: PairSchema.nullable(),
  pairB: PairSchema.nullable(),
  lineupPublished: z.boolean(),
  courtId: Id.nullable(),
  startsAt: time.nullable(),
  endsAt: time.nullable(),
  status: z.enum(["pending", "called", "completed", "walkover"]),
  score: ScoreSchema.nullable(),
  winnerTeamId: Id.nullable(),
});
export const InfoSchema = z.strictObject({
  name: text,
  clubName: text,
  slogan: text,
  location: text,
  startsAt: time.nullable(),
  dateLabel: text,
  registrationDeadline: time.nullable(),
  registrationFormUrl: z.url().nullable(),
  timezone: z.literal("Asia/Ho_Chi_Minh"),
  feeVnd: Money.nullable(),
  contactName: text.nullable(),
  contactPhone: z.string().max(30).nullable(),
  zaloUrl: z.url().nullable(),
  qrAssetPath: z
    .string()
    .regex(/^\/[a-zA-Z0-9/._-]+$/)
    .nullable(),
  qrPublished: z.boolean(),
});
export const SponsorSchema = z.strictObject({
  id: Id,
  name: text,
  amountVnd: Money,
  received: z.boolean(),
  note,
  tierOverride: z.enum(["diamond", "platinum", "gold"]).nullable(),
});
export const IncomeSchema = z.strictObject({
  id: Id,
  label: text,
  amountVnd: Money,
  received: z.boolean(),
});
export const ExpenseSchema = z
  .strictObject({
    id: Id,
    label: text,
    quantity: z.number().nonnegative().max(1e6),
    unitPriceVnd: Money,
    paid: z.boolean(),
    note,
  })
  .refine(
    (e) => Number.isSafeInteger(e.quantity * e.unitPriceVnd),
    "Thành tiền phải là số nguyên đồng",
  );
export const PublicTournamentSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: z.literal("noi-bo-2026"),
    updatedAt: time,
    info: InfoSchema,
    rules: z.strictObject({
      teamCount: z.literal(4),
      categories: z.tuple([
        z.literal("mens_doubles"),
        z.literal("womens_doubles"),
        z.literal("mixed_doubles"),
      ]),
      setTarget: z.literal(21),
      cap: z.literal(25),
      changeEndsAt: z.literal(11),
      minLead: z.literal(2),
      ranking: z.tuple([
        z.literal("pointsFor"),
        z.literal("wins"),
        z.literal("difference"),
        z.literal("manualHeadToHead"),
      ]),
      placementWins: z.literal(2),
      lateMinutes: z.literal(10),
      walkoverScore: z.strictObject({
        winner: z.literal(21),
        loser: z.literal(0),
      }),
    }),
    athletes: z.array(AthleteSchema),
    teams: z.array(TeamSchema).length(4),
    matches: z.array(MatchSchema),
    courts: z.array(z.strictObject({ id: Id, name: text })),
    draw: z.strictObject({
      status: z.enum(["not_started", "confirmed"]),
      algorithmVersion: z.literal("balanced-v1"),
      assignment: z.record(Id, Id),
    }),
    tieDecisions: z.array(
      z.strictObject({
        tiedTeamIds: z.array(Id).min(2),
        orderedTeamIds: z.array(Id).min(2),
        reason: text,
        decidedBy: text,
        sourceResultsHash: text,
      }),
    ),
    sponsorships: z.array(SponsorSchema),
    finance: z.strictObject({
      published: z.boolean(),
      income: z.array(IncomeSchema),
      expenses: z.array(ExpenseSchema),
    }),
  })
  .superRefine((t, ctx) => {
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    const unique = (items: { id: string }[]) => {
      if (new Set(items.map((x) => x.id)).size !== items.length)
        fail("Mã định danh bị trùng");
    };
    [
      t.athletes,
      t.teams,
      t.matches,
      t.courts,
      t.sponsorships,
      t.finance.income,
      t.finance.expenses,
    ].forEach(unique);
    const teams = new Set(t.teams.map((x) => x.id)),
      athletes = new Set(t.athletes.map((x) => x.id)),
      courts = new Set(t.courts.map((x) => x.id));
    const ref = (id: string | null, ids: Set<string>) => {
      if (id !== null && !ids.has(id)) fail("Tham chiếu không tồn tại");
    };
    t.athletes.forEach((x) => ref(x.teamId, teams));
    t.teams.forEach((x) => ref(x.captainId, athletes));
    t.matches.forEach((m) => {
      [m.teamAId, m.teamBId, m.winnerTeamId].forEach((id) => ref(id, teams));
      ref(m.courtId, courts);
      [...(m.pairA ?? []), ...(m.pairB ?? [])].forEach((id) =>
        ref(id, athletes),
      );
      if (m.teamAId && m.teamAId === m.teamBId) fail("Hai đội phải khác nhau");
      if ((m.startsAt === null) !== (m.endsAt === null))
        fail("Cần đủ thời gian bắt đầu và kết thúc");
      if (
        m.startsAt &&
        m.endsAt &&
        Date.parse(m.startsAt) >= Date.parse(m.endsAt)
      )
        fail("Thời gian kết thúc phải sau bắt đầu");
    });
    Object.entries(t.draw.assignment).forEach(([a, team]) => {
      ref(a, athletes);
      ref(team, teams);
    });
    t.tieDecisions.forEach((d) => {
      [...d.tiedTeamIds, ...d.orderedTeamIds].forEach((id) => ref(id, teams));
      if (
        new Set(d.orderedTeamIds).size !== d.orderedTeamIds.length ||
        [...d.tiedTeamIds].sort().join() !== [...d.orderedTeamIds].sort().join()
      )
        fail("Quyết định hòa phải xếp đủ các đội");
    });
    if (t.info.qrPublished && !t.info.qrAssetPath)
      fail("Chưa có mã QR được xác nhận");
  });
export type TournamentDocument = z.infer<typeof PublicTournamentSchema>;
export type Athlete = z.infer<typeof AthleteSchema>;
export type Team = z.infer<typeof TeamSchema>;
export type Match = z.infer<typeof MatchSchema>;
export type Score = z.infer<typeof ScoreSchema>;
export type Pair = z.infer<typeof PairSchema>;
export type Category = z.infer<typeof CategorySchema>;
