import { PublicTournamentSchema } from "../packages/domain/src/schema";

const base = (
  process.argv[2] ??
  process.env.SITE_URL ??
  "https://giaicaulong2026.nghuy.link"
).replace(/\/$/, "");

const problems: string[] = [];

const page = await fetch(base);
if (!page.ok) problems.push(`Trang chủ trả về ${page.status}`);
const html = await page.text();
// The posters render client-side after tournament.json loads, so the static
// HTML carries only the <title>, not the on-page heading.
if (!html.includes("<title>Giải cầu lông nội bộ 2026"))
  problems.push("Trang chủ thiếu tiêu đề giải");

const data = await fetch(`${base}/tournament.json`);
if (!data.ok) problems.push(`tournament.json trả về ${data.status}`);

const cache = data.headers.get("cache-control") ?? "";
if (!cache.includes("no-cache"))
  problems.push(`tournament.json phải có no-cache, đang là "${cache}"`);

const body = await data.text();
for (const key of ["phone", "skillBand", "feePayments"])
  if (body.includes(`"${key}"`))
    problems.push(`tournament.json lộ trường "${key}"`);

try {
  if (!PublicTournamentSchema.safeParse(JSON.parse(body)).success)
    problems.push("tournament.json không khớp schema");
} catch {
  problems.push("tournament.json không phải JSON hợp lệ");
}

// The admin API: the open route answers, and the guarded one refuses a
// request with no token before it ever reaches the Lambda.
const config = await fetch(`${base}/api/config`);
if (!config.ok) problems.push(`/api/config trả về ${config.status}`);
else {
  const c = (await config.json()) as { clientId?: unknown; devLogin?: unknown };
  if (typeof c.clientId !== "string") problems.push("/api/config thiếu clientId");
  if (c.devLogin !== false) problems.push("/api/config không được bật devLogin");
}
const guarded = await fetch(`${base}/api/admin/state`);
if (guarded.status !== 401)
  problems.push(`/api/admin/state không token phải trả 401, đang là ${guarded.status}`);

const admin = await fetch(`${base}/quan-tri/`);
if (!admin.ok) problems.push(`/quan-tri/ trả về ${admin.status}`);

if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log(`✓ ${base} hoạt động bình thường.`);
