import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { PublicTournamentSchema } from "../packages/domain/src/schema";
import { PrivateRosterSchema } from "../packages/domain/src/roster";
import type {
  AdminState,
  PrivateMap,
} from "../packages/domain/src/commands";
import { awsPublisher, awsStore } from "../backend/src/aws";
import { renderSnapshot, type Publisher } from "../backend/src/publish";
import type { TournamentStore } from "../backend/src/store";
import { validateTournament } from "./validate-tournament";

const PUBLIC = "frontend/public/tournament.json";
const PRIVATE = ".private/roster.json";

// Private fields come from the roster file where it names the athlete,
// otherwise from what the table already holds: a --force re-seed must not
// blank skill bands and phone numbers that were entered online.
export function buildSeed(
  rawDocument: unknown,
  rawRoster: unknown | null,
  existing: PrivateMap = {},
): AdminState {
  const problems = validateTournament(rawDocument);
  if (problems.length)
    throw new Error(`${PUBLIC} không hợp lệ:\n  · ${problems.join("\n  · ")}`);
  const document = PublicTournamentSchema.parse(rawDocument);
  const roster = rawRoster ? PrivateRosterSchema.parse(rawRoster) : null;
  return {
    document,
    private: Object.fromEntries(
      document.athletes.map((a) => {
        const p = roster?.athletes.find((x) => x.id === a.id);
        return [
          a.id,
          p
            ? { skillBand: p.skillBand, phone: p.phone, note: p.note }
            : (existing[a.id] ?? { skillBand: null, phone: null, note: "" }),
        ];
      }),
    ),
  };
}

export async function seed(
  store: TournamentStore,
  publish: Publisher,
  state: AdminState,
  opts: { force: boolean; now: string },
): Promise<number> {
  const current = await store.read();
  if (current && !opts.force) throw new Error("ALREADY_SEEDED");
  const saved = await store.write(current, state, {
    at: opts.now,
    actorEmail: "seed",
    commandType: "seed",
    requestId: `seed-${Date.parse(opts.now)}`,
  });
  await publish(renderSnapshot(saved.document));
  await store.markPublished(saved.version);
  return saved.version;
}

const output = (name: string) =>
  execFileSync("terraform", ["-chdir=infra", "output", "-raw", name], {
    encoding: "utf8",
  }).trim();

if (import.meta.filename === process.argv[1]) {
  const force = process.argv.includes("--force");
  try {
    const table = process.env.TABLE_NAME ?? output("table_name");
    const bucket = process.env.SITE_BUCKET ?? output("site_bucket_name");
    const store = awsStore(table);
    const state = buildSeed(
      JSON.parse(readFileSync(PUBLIC, "utf8")),
      existsSync(PRIVATE) ? JSON.parse(readFileSync(PRIVATE, "utf8")) : null,
      (await store.read())?.private,
    );
    const version = await seed(store, awsPublisher(bucket), state, {
      force,
      now: new Date().toISOString(),
    });
    console.log(
      `✓ Đã nạp ${state.document.athletes.length} VĐV, ${state.document.matches.length} trận vào ${table} (phiên bản ${version}) và công bố tournament.json.`,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(
      message === "ALREADY_SEEDED"
        ? "✗ Bảng đã có dữ liệu. Thêm --force để ghi đè bằng nội dung trong repo (bản cũ vẫn nằm trong lịch sử)."
        : `✗ ${message}`,
    );
    process.exit(1);
  }
}
