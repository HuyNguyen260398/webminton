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
if (!html.includes("GIẢI CẦU LÔNG"))
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

if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log(`✓ ${base} hoạt động bình thường.`);
