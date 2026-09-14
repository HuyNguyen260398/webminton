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
// Scroll the whole page so loading="lazy" images decode before capture —
// a fullPage screenshot alone leaves them blank.
await page.evaluate(async () => {
  const step = window.innerHeight;
  for (let y = 0; y < document.body.scrollHeight; y += step) {
    window.scrollTo(0, y);
    await new Promise((r) => setTimeout(r, 120));
  }
  window.scrollTo(0, 0);
});
await page.waitForLoadState("networkidle");
await page.waitForTimeout(700);
await page.screenshot({ path: out, fullPage: mode === "full" });
await browser.close();
console.log(`✓ ${out}`);
