import { existsSync, readFileSync, writeFileSync } from "node:fs";
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

const messages: Record<string, string> = {
  MISSING_SKILL: "Còn VĐV đang thi đấu chưa có skillBand (1–3).",
  INSUFFICIENT_ROSTER: "Cần tối thiểu 8 nam và 8 nữ đang thi đấu.",
  DRAW_LOCKED: "Đã có trận được đánh — đặt mọi trận về pending trước khi bốc lại.",
  DRAW_NOT_FOUND: "Không tìm được cách chia đều sau 100 lần thử. Đổi seed khác.",
};

if (import.meta.filename === process.argv[1]) {
  const seed = process.argv[2] ?? String(Date.now());
  if (!existsSync(PRIVATE)) {
    console.error(`✗ Chưa có ${PRIVATE}.`);
    console.error(`  Chạy: cp .private/roster.example.json ${PRIVATE}`);
    console.error("  rồi điền danh sách VĐV (mỗi người cần skillBand 1–3).");
    process.exit(1);
  }
  const t = PublicTournamentSchema.parse(
    JSON.parse(readFileSync(PUBLIC, "utf8")),
  );
  const roster = PrivateRosterSchema.parse(
    JSON.parse(readFileSync(PRIVATE, "utf8")),
  );
  let next;
  try {
    next = applyDraw(t, roster, seed);
  } catch (e) {
    const code = e instanceof Error ? e.message : "UNKNOWN";
    console.error(`✗ Không bốc thăm được: ${messages[code] ?? code}`);
    process.exit(1);
  }
  writeFileSync(PUBLIC, `${JSON.stringify(next, null, 2)}\n`);
  console.log(
    `✓ Đã bốc thăm với seed "${seed}" — ${next.athletes.length} VĐV, ${next.matches.length} trận vòng loại.`,
  );
  for (const team of next.teams)
    console.log(
      `  ${team.name}: ${next.athletes.filter((a) => a.teamId === team.id).length} VĐV`,
    );
}
