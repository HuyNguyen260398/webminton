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
import type { PrivateRoster } from "./roster";
import { generateDraw } from "./draw";
import { generateGroupMatches } from "./round-robin";
import { seedPlacement } from "./advancement";
import { validateLineup } from "./schedule";
import { isFinalScore, walkoverScore } from "./score";
import { calculateStandings, resultsHash } from "./standings";

const text = z.string().trim().min(1).max(500);
const time = z.iso.datetime({ offset: true });

// The three fields that must never reach tournament.json, keyed by athlete id.
export const PrivateFieldsSchema = z.strictObject({
  skillBand: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  phone: z.string().max(30).nullable(),
  note: z.string().max(2000),
});

// The income line the fee checkboxes own. Its amount is always the number of
// athletes ticked times info.feeVnd, rewritten on every save.
export const FEE_INCOME_ID = "le-phi";
function syncFeeIncome(t: TournamentDocument) {
  const paid = t.athletes.filter((a) => a.feePaid).length;
  const i = t.finance.income.findIndex((x) => x.id === FEE_INCOME_ID);
  if (paid === 0) {
    if (i >= 0) t.finance.income.splice(i, 1);
    return;
  }
  const line = {
    id: FEE_INCOME_ID,
    label: `Lệ phí tham gia (${paid}/${t.athletes.length} người đã nộp)`,
    amountVnd: paid * (t.info.feeVnd ?? 0),
    received: true,
  };
  if (i >= 0) t.finance.income[i] = line;
  else t.finance.income.unshift(line);
}
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
  command("setFeePaid", z.strictObject({ athleteId: Id, paid: z.boolean() })),
  command(
    "setAthleteTeam",
    z.strictObject({ athleteId: Id, teamId: Id.nullable() }),
  ),
  command("setTeamDrawOpen", z.strictObject({ open: z.boolean() })),
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
  syncFeeIncome(t);
  const parsed = PublicTournamentSchema.safeParse(t);
  if (!parsed.success) throw new Error("INVALID_DOCUMENT");
  deriveTournament(parsed.data);
  return { document: parsed.data, private: PrivateMapSchema.parse(priv) };
}

export function toRoster(state: AdminState): PrivateRoster {
  return {
    athletes: state.document.athletes.map((a) => ({
      id: a.id,
      name: a.name,
      gender: a.gender,
      active: a.active,
      skillBand: state.private[a.id]?.skillBand ?? null,
      phone: state.private[a.id]?.phone ?? null,
      note: state.private[a.id]?.note ?? "",
    })),
  };
}

const started = (t: TournamentDocument) =>
  t.matches.some((m) => m.status !== "pending");

// Computed and shown to the organiser only. confirmDraw re-runs the same
// seed, and the PRNG is seeded, so what was previewed is what gets saved.
export function previewDraw(
  state: AdminState,
  seed: string,
): Record<string, string> {
  if (started(state.document)) throw new Error("DRAW_LOCKED");
  return generateDraw(toRoster(state), state.document.teams, seed).assignment;
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
  const inLineup = (id: string) =>
    t.matches.some((m) =>
      [...(m.pairA ?? []), ...(m.pairB ?? [])].includes(id),
    );
  const dropCaptain = (id: string) =>
    t.teams.forEach((team) => {
      if (team.captainId === id) team.captainId = null;
    });
  const match = (id: string) => {
    const m = t.matches.find((x) => x.id === id);
    if (!m) throw new Error("MATCH_NOT_FOUND");
    return m;
  };
  const finished = (status: string) =>
    status === "completed" || status === "walkover";

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
    // The fee line belongs to the checkboxes: a hand edit would be
    // overwritten by the next save, so it is refused instead.
    case "upsertIncome":
      if (c.payload.id === FEE_INCOME_ID) throw new Error("FEE_LINE_LOCKED");
      upsert(t.finance.income, c.payload);
      break;
    case "removeIncome":
      if (c.payload.id === FEE_INCOME_ID) throw new Error("FEE_LINE_LOCKED");
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
    case "upsertAthlete": {
      const { id, skillBand, phone, note, ...pub } = c.payload;
      if (id === null) {
        const n =
          Math.max(
            0,
            ...t.athletes.map((a) => Number(/^a(\d+)$/.exec(a.id)?.[1] ?? 0)),
          ) + 1;
        const newId = `a${String(n).padStart(2, "0")}`;
        t.athletes.push({ id: newId, ...pub, teamId: null });
        priv[newId] = { skillBand, phone, note };
        break;
      }
      const a = t.athletes.find((x) => x.id === id);
      if (!a) throw new Error("ATHLETE_NOT_FOUND");
      // A lineup was validated against this gender and active flag.
      if (
        (a.gender !== pub.gender || (a.active && !pub.active)) &&
        inLineup(id)
      )
        throw new Error("ATHLETE_IN_LINEUP");
      Object.assign(a, pub);
      priv[id] = { skillBand, phone, note };
      break;
    }
    case "setFeePaid": {
      const a = t.athletes.find((x) => x.id === c.payload.athleteId);
      if (!a) throw new Error("ATHLETE_NOT_FOUND");
      a.feePaid = c.payload.paid;
      break;
    }
    case "removeAthlete": {
      const { id } = c.payload;
      if (!t.athletes.some((a) => a.id === id))
        throw new Error("ATHLETE_NOT_FOUND");
      if (inLineup(id)) throw new Error("ATHLETE_IN_LINEUP");
      t.athletes = t.athletes.filter((a) => a.id !== id);
      delete priv[id];
      delete t.draw.assignment[id];
      dropCaptain(id);
      break;
    }
    case "setAthleteTeam": {
      const { athleteId, teamId } = c.payload;
      const a = t.athletes.find((x) => x.id === athleteId);
      if (!a) throw new Error("ATHLETE_NOT_FOUND");
      if (teamId !== null && !t.teams.some((x) => x.id === teamId))
        throw new Error("INVALID_TEAM");
      if (a.teamId === teamId) break;
      if (inLineup(athleteId)) throw new Error("ATHLETE_IN_LINEUP");
      dropCaptain(athleteId);
      a.teamId = teamId;
      if (t.draw.status === "confirmed") {
        if (teamId) t.draw.assignment[athleteId] = teamId;
        else delete t.draw.assignment[athleteId];
      }
      break;
    }
    case "setTeamDrawOpen":
      // A confirmed draw already owns the teams and the eighteen matches.
      if (t.draw.status === "confirmed") throw new Error("DRAW_LOCKED");
      t.draw.status = c.payload.open ? "open" : "not_started";
      break;
    case "confirmDraw": {
      if (started(t)) throw new Error("DRAW_LOCKED");
      const draw = generateDraw(
        toRoster({ document: t, private: priv }),
        t.teams,
        c.payload.seed,
      );
      t.draw = draw;
      t.athletes.forEach(
        (a) => (a.teamId = a.active ? (draw.assignment[a.id] ?? null) : null),
      );
      t.teams.forEach((team) => (team.captainId = null));
      t.matches = generateGroupMatches(t.teams, t.rules.categories);
      t.tieDecisions = [];
      break;
    }
    case "resetDraw":
      if (started(t)) throw new Error("DRAW_LOCKED");
      t.draw = {
        status: "not_started",
        algorithmVersion: "balanced-v1",
        assignment: {},
      };
      t.athletes.forEach((a) => (a.teamId = null));
      t.teams.forEach((team) => (team.captainId = null));
      t.matches = [];
      t.tieDecisions = [];
      break;
    case "setLineup": {
      const m = match(c.payload.matchId);
      if (finished(m.status)) throw new Error("MATCH_LOCKED");
      m.pairA = c.payload.pairA;
      m.pairB = c.payload.pairB;
      validateLineup(t, m);
      break;
    }
    case "publishLineup": {
      const m = match(c.payload.matchId);
      if (c.payload.published) validateLineup(t, m);
      m.lineupPublished = c.payload.published;
      break;
    }
    case "setSchedule": {
      const m = match(c.payload.matchId);
      const { courtId, startsAt, endsAt } = c.payload;
      if (courtId !== null && !t.courts.some((x) => x.id === courtId))
        throw new Error("INVALID_COURT");
      Object.assign(m, { courtId, startsAt, endsAt });
      break;
    }
    case "callMatch": {
      const m = match(c.payload.matchId);
      if (m.status !== "pending") throw new Error("INVALID_STATUS");
      m.status = "called";
      break;
    }
    case "setScore": {
      if (!isFinalScore(c.payload.score)) throw new Error("INVALID_SCORE");
      const m = match(c.payload.matchId);
      if (!m.teamAId || !m.teamBId) throw new Error("INVALID_TEAM");
      m.score = c.payload.score;
      m.status = "completed";
      t = seedPlacement(t);
      break;
    }
    case "setWalkover": {
      const m = match(c.payload.matchId);
      if (!m.teamAId || !m.teamBId) throw new Error("INVALID_TEAM");
      m.score = walkoverScore(c.payload.absentSide);
      m.status = "walkover";
      t = seedPlacement(t);
      break;
    }
    case "clearResult": {
      const m = match(c.payload.matchId);
      m.score = null;
      m.status = "pending";
      t = seedPlacement(t);
      break;
    }
    case "resolveTie": {
      const { tiedTeamIds, orderedTeamIds, reason } = c.payload;
      const key = (ids: string[]) => [...ids].sort().join();
      const all = calculateStandings({ ...t, tieDecisions: [] });
      const first = all.find((r) => r.teamId === tiedTeamIds[0]);
      // The decision must name the whole level group, or it never applies.
      const level = first
        ? all.filter(
            (r) =>
              r.pointsFor === first.pointsFor &&
              r.wins === first.wins &&
              r.difference === first.difference,
          )
        : [];
      if (
        !first ||
        first.played === 0 ||
        new Set(tiedTeamIds).size !== tiedTeamIds.length ||
        key(level.map((r) => r.teamId)) !== key(tiedTeamIds) ||
        key(orderedTeamIds) !== key(tiedTeamIds)
      )
        throw new Error("INVALID_TIE");
      t.tieDecisions = t.tieDecisions.filter(
        (d) => key(d.tiedTeamIds) !== key(tiedTeamIds),
      );
      t.tieDecisions.push({
        tiedTeamIds,
        orderedTeamIds,
        reason,
        // Published with the document, so a role, never the signed-in
        // email. Who made the call is in the history entry.
        decidedBy: "BTC",
        sourceResultsHash: resultsHash(t),
      });
      t = seedPlacement(t);
      break;
    }
  }
  return finalize(t, priv, now);
}
