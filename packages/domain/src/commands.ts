import { z } from "zod";
import {
  Id,
  InfoSchema,
  PairSchema,
  ScoreSchema,
  SponsorSchema,
  IncomeSchema,
  ExpenseSchema,
  PublicTournamentSchema,
  type TournamentDocument,
} from "./schema";
import { deriveTournament } from "./derive";

const text = z.string().trim().min(1).max(500);
const time = z.iso.datetime({ offset: true });

// The three fields that must never reach tournament.json, keyed by athlete id.
export const PrivateFieldsSchema = z.strictObject({
  skillBand: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  phone: z.string().max(30).nullable(),
  note: z.string().max(2000),
});
export const PrivateMapSchema = z.record(Id, PrivateFieldsSchema);
export type PrivateFields = z.infer<typeof PrivateFieldsSchema>;
export type PrivateMap = z.infer<typeof PrivateMapSchema>;

export interface AdminState {
  document: TournamentDocument;
  private: PrivateMap;
}

const command = <T extends string, S extends z.ZodType>(type: T, payload: S) =>
  z.strictObject({ type: z.literal(type), payload });
const byId = z.strictObject({ id: Id });
const byMatch = z.strictObject({ matchId: Id });

export const CommandSchema = z.discriminatedUnion("type", [
  command("updateInfo", InfoSchema.partial()),
  command(
    "setCourts",
    z.strictObject({
      courts: z.array(z.strictObject({ id: Id, name: text })).max(20),
    }),
  ),
  command(
    "updateTeam",
    z.strictObject({
      teamId: Id,
      name: text.optional(),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
      captainId: Id.nullable().optional(),
    }),
  ),
  command(
    "upsertAthlete",
    z.strictObject({
      id: Id.nullable(),
      name: text,
      gender: z.enum(["male", "female"]),
      active: z.boolean(),
      ...PrivateFieldsSchema.shape,
    }),
  ),
  command("removeAthlete", byId),
  command(
    "setAthleteTeam",
    z.strictObject({ athleteId: Id, teamId: Id.nullable() }),
  ),
  command("confirmDraw", z.strictObject({ seed: text })),
  command("resetDraw", z.strictObject({})),
  command(
    "setLineup",
    z.strictObject({ matchId: Id, pairA: PairSchema, pairB: PairSchema }),
  ),
  command(
    "publishLineup",
    z.strictObject({ matchId: Id, published: z.boolean() }),
  ),
  command(
    "setSchedule",
    z.strictObject({
      matchId: Id,
      courtId: Id.nullable(),
      startsAt: time.nullable(),
      endsAt: time.nullable(),
    }),
  ),
  command("callMatch", byMatch),
  command("setScore", z.strictObject({ matchId: Id, score: ScoreSchema })),
  command(
    "setWalkover",
    z.strictObject({ matchId: Id, absentSide: z.enum(["a", "b"]) }),
  ),
  command("clearResult", byMatch),
  command(
    "resolveTie",
    z.strictObject({
      tiedTeamIds: z.array(Id).min(2),
      orderedTeamIds: z.array(Id).min(2),
      reason: text,
    }),
  ),
  command("upsertSponsor", SponsorSchema),
  command("removeSponsor", byId),
  command("upsertIncome", IncomeSchema),
  command("removeIncome", byId),
  command("upsertExpense", ExpenseSchema),
  command("removeExpense", byId),
  command("setFinancePublished", z.strictObject({ published: z.boolean() })),
]);
export type Command = z.infer<typeof CommandSchema>;

const upsert = <T extends { id: string }>(items: T[], item: T) => {
  const i = items.findIndex((x) => x.id === item.id);
  if (i < 0) items.push(item);
  else items[i] = item;
};
const remove = (items: { id: string }[], id: string) => {
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) throw new Error("NOT_FOUND");
  items.splice(i, 1);
};

// The single exit: nothing leaves applyCommand unless the public page could
// render it. Results are derived, so stored winners are always null.
function finalize(
  t: TournamentDocument,
  priv: PrivateMap,
  now: string,
): AdminState {
  t.updatedAt = now;
  t.matches.forEach((m) => (m.winnerTeamId = null));
  const ids = new Set(t.athletes.map((a) => a.id));
  for (const id of Object.keys(priv)) if (!ids.has(id)) delete priv[id];
  const parsed = PublicTournamentSchema.safeParse(t);
  if (!parsed.success) throw new Error("INVALID_DOCUMENT");
  deriveTournament(parsed.data);
  return { document: parsed.data, private: PrivateMapSchema.parse(priv) };
}

export function applyCommand(
  state: AdminState,
  input: unknown,
  actor: string,
  now: string,
): AdminState {
  const parsed = CommandSchema.safeParse(input);
  if (!parsed.success) throw new Error("INVALID_COMMAND");
  const c = parsed.data;
  // `let`: the match commands added in Task 3 replace the document wholesale.
  let t = structuredClone(state.document);
  const priv = structuredClone(state.private);

  switch (c.type) {
    case "updateInfo":
      t.info = { ...t.info, ...c.payload };
      break;
    case "setCourts": {
      const ids = new Set(c.payload.courts.map((x) => x.id));
      if (ids.size !== c.payload.courts.length)
        throw new Error("INVALID_COURTS");
      if (t.matches.some((m) => m.courtId && !ids.has(m.courtId)))
        throw new Error("COURT_IN_USE");
      t.courts = c.payload.courts;
      break;
    }
    case "updateTeam": {
      const { teamId, name, color, captainId } = c.payload;
      const team = t.teams.find((x) => x.id === teamId);
      if (!team) throw new Error("INVALID_TEAM");
      if (name !== undefined) team.name = name;
      if (color !== undefined) team.color = color;
      if (captainId !== undefined) {
        if (
          captainId !== null &&
          t.athletes.find((a) => a.id === captainId)?.teamId !== teamId
        )
          throw new Error("INVALID_CAPTAIN");
        team.captainId = captainId;
      }
      break;
    }
    case "upsertSponsor":
      upsert(t.sponsorships, c.payload);
      break;
    case "removeSponsor":
      remove(t.sponsorships, c.payload.id);
      break;
    case "upsertIncome":
      upsert(t.finance.income, c.payload);
      break;
    case "removeIncome":
      remove(t.finance.income, c.payload.id);
      break;
    case "upsertExpense":
      upsert(t.finance.expenses, c.payload);
      break;
    case "removeExpense":
      remove(t.finance.expenses, c.payload.id);
      break;
    case "setFinancePublished":
      t.finance.published = c.payload.published;
      break;
    default:
      // Athlete, draw and match commands arrive in Tasks 2 and 3.
      throw new Error("INVALID_COMMAND");
  }
  void actor;
  return finalize(t, priv, now);
}
