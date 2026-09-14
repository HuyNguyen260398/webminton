// Visual check helper: renders a served page to a PNG so the poster sections
// can be compared against assets/poster_designs/*.jpg.
//   node scripts/screenshot.mjs <url> <out.png> [width] [height] [full]
import { chromium } from "@playwright/test";

const [, , url, out, w = "1280", h = "900", mode] = process.argv;
if (!url || !out) {
  console.error("usage: node scripts/screenshot.mjs <url> <out.png> [w] [h] [full]");
  process.exit(1);
}
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: +w, height: +h },
  deviceScaleFactor: 2,
});
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(700);
await page.screenshot({ path: out, fullPage: mode === "full" });
await browser.close();
console.log(`✓ ${out}`);
