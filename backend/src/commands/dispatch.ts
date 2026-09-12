import type { TournamentRepository } from "../storage/repository";
import {
  CommandSchema,
  type TournamentCommand,
} from "../../../packages/domain/src/commands";
import { TournamentSchema } from "../../../packages/domain/src/schema";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { seedPlacement } from "../../../packages/domain/src/advancement";
import { generateDraw, confirmDraw } from "../../../packages/domain/src/draw";
import { generateGroupMatches } from "../../../packages/domain/src/round-robin";
import { resultsHash } from "../../../packages/domain/src/standings";
import { replaceRoster } from "./athletes";
import { matchCommand } from "./matches";
export function payloadHash(value: unknown): string {
  const canonical = (x: unknown): unknown =>
    Array.isArray(x)
      ? x.map(canonical)
      : x && typeof x === "object"
        ? Object.fromEntries(
            Object.entries(x)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, v]) => [k, canonical(v)]),
          )
        : x;
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}
export async function executeCommand(
  repo: TournamentRepository,
  input: TournamentCommand,
  context: { actorSub: string; etag: string },
) {
  if (!context.actorSub) throw new Error("UNAUTHORIZED");
  if (!context.etag) throw new Error("PRECONDITION_REQUIRED");
  const c = CommandSchema.parse(input),
    current = await repo.read(),
    hash = payloadHash(c),
    prior = current.document.requests.find((r) => r.id === c.requestId);
  if (prior) {
    if (prior.actorSub !== context.actorSub || prior.payloadHash !== hash)
      throw new Error("CONFLICT");
    return { ...current, replayed: true };
  }
  if (current.etag !== context.etag) throw new Error("CONFLICT");
  let t = structuredClone(current.document);
  const upsert = <T extends { id: string }>(items: T[], item: T) => {
    const i = items.findIndex((x) => x.id === item.id);
    if (i < 0) items.push(item);
    else items[i] = item;
  };
  switch (c.type) {
    case "configureTournament":
      t.info = { ...t.info, ...c.payload };
      break;
    case "replaceRoster":
      replaceRoster(t, c.payload.athletes);
      break;
    case "renameTeam": {
      const team = t.teams.find((x) => x.id === c.payload.teamId);
      if (!team) throw new Error("INVALID_TEAM");
      team.name = c.payload.name;
      break;
    }
    case "generateDraw":
      if (t.draw.status === "draft") throw new Error("DRAW_EXISTS");
      t.draw = generateDraw(t, randomBytes(32).toString("hex"));
      break;
    case "confirmDraw":
      t = confirmDraw(t, c.payload.rosterHash);
      if (!t.matches.length)
        t.matches = generateGroupMatches(t.teams, t.rules.categories);
      break;
    case "resetDraw":
      if (t.matches.some((m) => m.status !== "pending"))
        throw new Error("DRAW_LOCKED");
      t.draw = {
        status: "not_started",
        algorithmVersion: "balanced-v1",
        seed: null,
        rosterHash: null,
        assignment: {},
      };
      t.athletes.forEach((a) => (a.teamId = null));
      t.matches = [];
      t.tieDecisions = [];
      break;
    case "resolveTie": {
      const group = t.results.standings.filter((r) =>
        c.payload.tiedTeamIds.includes(r.teamId),
      );
      if (
        group.length !== c.payload.tiedTeamIds.length ||
        group.some((r) => r.rank !== null) ||
        group.some(
          (r) =>
            r.pointsFor !== group[0].pointsFor ||
            r.wins !== group[0].wins ||
            r.difference !== group[0].difference,
        )
      )
        throw new Error("INVALID_TIE");
      t.tieDecisions.push({
        ...c.payload,
        decidedBy: context.actorSub,
        sourceResultsHash: resultsHash(t),
      });
      break;
    }
    case "upsertSponsor":
      upsert(t.sponsorships, c.payload);
      break;
    case "recordFeePayment":
      if (t.finance.feePayments.some((p) => p.id === c.payload.id))
        throw new Error("PAYMENT_EXISTS");
      t.finance.feePayments.push(c.payload);
      break;
    case "upsertIncome":
      upsert(t.finance.income, c.payload);
      break;
    case "upsertExpense":
      upsert(t.finance.expenses, c.payload);
      break;
    case "publishFinance":
      t.finance.published = c.payload.published;
      break;
    case "finalizeTournament":
      if (t.matches.length !== 24 || t.matches.some((m) => !m.winnerTeamId))
        throw new Error("TOURNAMENT_INCOMPLETE");
      t.results.finalized = true;
      break;
    default:
      t = matchCommand(t, c);
  }
  t = seedPlacement(t);
  t.revision = current.document.revision + 1;
  t.updatedAt = new Date().toISOString();
  const reason = "reason" in c.payload ? String(c.payload.reason) : "";
  t.audit.push({
    id: randomUUID(),
    actorSub: context.actorSub,
    action: `${c.type}${reason ? ": " + reason : ""}`,
    at: t.updatedAt,
    revision: t.revision,
  });
  t.requests.push({
    id: c.requestId,
    actorSub: context.actorSub,
    payloadHash: hash,
    committedRevision: t.revision,
  });
  TournamentSchema.parse(t);
  if (Buffer.byteLength(JSON.stringify(t)) > 1024 * 1024)
    throw new Error("DOCUMENT_TOO_LARGE");
  const written = await repo.write(t, current.etag);
  return { document: t, etag: written.etag, replayed: false };
}
