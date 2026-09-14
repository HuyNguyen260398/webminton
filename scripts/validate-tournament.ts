import { readFileSync } from "node:fs";
import { PublicTournamentSchema } from "../packages/domain/src/schema";
import { deriveTournament } from "../packages/domain/src/derive";
import {
  findScheduleConflicts,
  validateLineup,
} from "../packages/domain/src/schedule";

const FILE = "frontend/public/tournament.json";

const derivedMessages: Record<string, string> = {
  INVALID_SCORE: "Có tỉ số không hợp lệ — mỗi séc phải tới 21, hơn 2, trần 25.",
  INVALID_TEAM: "Có trận đấu thiếu đội A hoặc đội B.",
  INVALID_WALKOVER: "Trận xử thắng phải có tỉ số 21–0.",
};

const lineupMessages: Record<string, string> = {
  INVALID_TEAM: "thiếu đội hoặc hai đội trùng nhau",
  INVALID_LINEUP: "VĐV không thuộc đội, không thi đấu, hoặc bị trùng",
  INVALID_GENDER: "sai giới tính so với nội dung thi đấu",
};

export function validateTournament(raw: unknown): string[] {
  const parsed = PublicTournamentSchema.safeParse(raw);
  if (!parsed.success)
    return parsed.error.issues.map(
      (i) => `Dữ liệu không hợp lệ tại "${i.path.join(".") || "gốc"}": ${i.message}`,
    );
  const t = parsed.data;
  const problems: string[] = [];

  try {
    deriveTournament(t);
  } catch (e) {
    const code = e instanceof Error ? e.message : "UNKNOWN";
    problems.push(derivedMessages[code] ?? `Lỗi khi tính kết quả: ${code}`);
  }

  for (const c of findScheduleConflicts(t.matches))
    problems.push(
      c.reason === "court"
        ? `Lịch thi đấu bị trùng sân: ${c.matchIds.join(" và ")}.`
        : `Lịch thi đấu bị trùng VĐV: ${c.matchIds.join(" và ")}.`,
    );

  for (const m of t.matches) {
    if (!m.pairA && !m.pairB) continue;
    try {
      validateLineup(t, m);
    } catch (e) {
      const code = e instanceof Error ? e.message : "UNKNOWN";
      problems.push(
        `Đội hình trận ${m.id} không hợp lệ: ${lineupMessages[code] ?? code}.`,
      );
    }
  }

  if (t.matches.length !== 0 && ![18, 24].includes(t.matches.length))
    problems.push(
      `Số trận phải là 18 (vòng loại) hoặc 24 (cả giải), đang có ${t.matches.length}.`,
    );

  return problems;
}

if (import.meta.filename === process.argv[1]) {
  const problems = validateTournament(JSON.parse(readFileSync(FILE, "utf8")));
  if (problems.length) {
    console.error(`✗ ${FILE} có ${problems.length} vấn đề:`);
    for (const p of problems) console.error(`  · ${p}`);
    process.exit(1);
  }
  console.log(`✓ ${FILE} hợp lệ.`);
}
