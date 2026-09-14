import { readFileSync, writeFileSync } from "node:fs";
import {
  PublicTournamentSchema,
  type TournamentDocument,
} from "../packages/domain/src/schema";
import {
  PrivateRosterSchema,
  type PrivateRoster,
} from "../packages/domain/src/roster";
import { generateDraw } from "../packages/domain/src/draw";
import { generateGroupMatches } from "../packages/domain/src/round-robin";

const PUBLIC = "frontend/public/tournament.json";
const PRIVATE = ".private/roster.json";

export function applyDraw(
  input: TournamentDocument,
  roster: PrivateRoster,
  seed: string,
): TournamentDocument {
  if (input.matches.some((m) => m.status !== "pending"))
    throw new Error("DRAW_LOCKED");

  const draw = generateDraw(roster, input.teams, seed);

  // Only public fields cross this boundary — phone, note and skillBand stay
  // in .private/roster.json and must never reach the deployed file.
  const athletes = roster.athletes.map((a) => ({
    id: a.id,
    name: a.name,
    gender: a.gender,
    active: a.active,
    teamId: a.active ? (draw.assignment[a.id] ?? null) : null,
  }));

  return PublicTournamentSchema.parse({
    ...input,
    updatedAt: new Date().toISOString(),
    athletes,
    draw,
    matches: generateGroupMatches(input.teams, input.rules.categories),
  });
}

if (import.meta.filename === process.argv[1]) {
  const seed = process.argv[2] ?? String(Date.now());
  const t = PublicTournamentSchema.parse(
    JSON.parse(readFileSync(PUBLIC, "utf8")),
  );
  const roster = PrivateRosterSchema.parse(
    JSON.parse(readFileSync(PRIVATE, "utf8")),
  );
  const next = applyDraw(t, roster, seed);
  writeFileSync(PUBLIC, `${JSON.stringify(next, null, 2)}\n`);
  console.log(
    `✓ Đã bốc thăm với seed "${seed}" — ${next.athletes.length} VĐV, ${next.matches.length} trận vòng loại.`,
  );
  for (const team of next.teams)
    console.log(
      `  ${team.name}: ${next.athletes.filter((a) => a.teamId === team.id).length} VĐV`,
    );
}
