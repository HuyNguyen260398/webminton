import { z } from "zod";
import {
  Id,
  AthleteSchema,
  InfoSchema,
  PairSchema,
  ScoreSchema,
  SponsorSchema,
  PaymentSchema,
  IncomeSchema,
  ExpenseSchema,
} from "./schema";
const reason = z.string().trim().min(1).max(500);
const command = <T extends string, S extends z.ZodType>(type: T, payload: S) =>
  z.strictObject({ requestId: Id, type: z.literal(type), payload });
const empty = z.strictObject({});
export const CommandSchema = z.discriminatedUnion("type", [
  command("configureTournament", InfoSchema.partial()),
  command(
    "configureCourts",
    z.strictObject({
      courts: z.array(z.strictObject({ id: Id, name: reason })).max(20),
    }),
  ),
  command(
    "replaceRoster",
    z.strictObject({ athletes: z.array(AthleteSchema) }),
  ),
  command("renameTeam", z.strictObject({ teamId: Id, name: reason })),
  command("generateDraw", empty),
  command("confirmDraw", z.strictObject({ rosterHash: reason })),
  command("resetDraw", z.strictObject({ reason })),
  command(
    "setLineup",
    z.strictObject({
      matchId: Id,
      pairA: PairSchema,
      pairB: PairSchema,
      clearScore: z.boolean(),
    }),
  ),
  command("publishLineup", z.strictObject({ matchId: Id })),
  command("reorderMatches", z.strictObject({ orderedIds: z.array(Id) })),
  command(
    "setSchedule",
    z.strictObject({
      matchId: Id,
      courtId: Id.nullable(),
      startsAt: z.iso.datetime({ offset: true }).nullable(),
      endsAt: z.iso.datetime({ offset: true }).nullable(),
    }),
  ),
  command("setScore", z.strictObject({ matchId: Id, score: ScoreSchema })),
  command(
    "setWalkover",
    z.strictObject({ matchId: Id, absentSide: z.enum(["a", "b"]), reason }),
  ),
  command(
    "resolveTie",
    z.strictObject({
      tiedTeamIds: z.array(Id).min(2),
      orderedTeamIds: z.array(Id).min(2),
      reason,
    }),
  ),
  command("resetPlacement", z.strictObject({ reason })),
  command("upsertSponsor", SponsorSchema),
  command("recordFeePayment", PaymentSchema),
  command("upsertIncome", IncomeSchema),
  command("upsertExpense", ExpenseSchema),
  command("publishFinance", z.strictObject({ published: z.boolean() })),
  command("finalizeTournament", empty),
]);
export type TournamentCommand = z.infer<typeof CommandSchema>;
