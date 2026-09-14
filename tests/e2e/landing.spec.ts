import { expect, test } from "@playwright/test";

// getByText is case-insensitive substring matching, and the tournament name
// appears in several places, so these assertions use section ids and exact
// matches rather than loose text.

test("renders all three poster sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "GIẢI CẦU LÔNG",
  );
  await expect(page.locator(".poster-title__strip")).toHaveText("NỘI BỘ 2026");
  await expect(page.locator("#thong-bao")).toBeVisible();
  await expect(page.locator("#the-le")).toBeVisible();
  await expect(page.locator("#nha-tai-tro")).toBeVisible();
});

test("renders the rule cards and sponsor tiers", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#the-le .card > h3")).toHaveCount(6);
  await expect(
    page.getByText("CHIA ĐỘI & THỂ THỨC", { exact: true }),
  ).toBeVisible();
  for (const tier of ["KIM CƯƠNG", "VÀNG", "THÂN THIỆN"])
    await expect(page.getByText(tier, { exact: true })).toBeVisible();
  for (const pill of ["NHẤT", "NHÌ", "BA", "KHUYẾN KHÍCH"])
    await expect(page.getByText(pill, { exact: true })).toBeVisible();
});

// The show/hide rules themselves are covered by frontend/test/live-sections
// against an empty fixture. This asserts the file that actually ships renders
// the sections its data calls for.
test("renders the live sections the shipped data calls for", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#van-dong-vien")).toBeVisible();
  await expect(page.locator("#boc-tham")).toBeVisible();
  await expect(page.locator("#lich-thi-dau")).toBeVisible();
  await expect(page.locator("#bang-xep-hang")).toBeVisible();
  await expect(page.locator("#thu-chi")).toBeVisible();
});

test("lists every athlete, all 24 matches and the four placings", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#van-dong-vien tbody tr")).toHaveCount(24);
  await expect(
    page.locator("#lich-thi-dau .draw-grid .draw-block"),
  ).toHaveCount(6);
  await expect(page.locator("#lich-thi-dau .draw-grid .draw-tie")).toHaveCount(
    18,
  );
  await expect(
    page.locator("#lich-thi-dau .draw-bracket .draw-tie"),
  ).toHaveCount(6);
  await expect(page.locator("#bang-xep-hang tbody tr")).toHaveCount(4);
});

// Both the section title and the stage label are slabs, and a slab is an
// inline-block: without an explicit block display they share a line and
// overlap. jsdom has no layout, so this can only be caught here.
test("each stage label sits below its section title, never beside it", async ({
  page,
}) => {
  await page.goto("/");
  const title = await page
    .locator("#lich-thi-dau > .container > h2")
    .boundingBox();
  const stages = page.locator("#lich-thi-dau .draw-stage");
  await expect(stages).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    const stage = await stages.nth(i).boundingBox();
    expect(stage!.y).toBeGreaterThanOrEqual(title!.y + title!.height);
  }
});

test("names the sponsors under their tiers", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.locator('[data-testid="tier-diamond"] .poster-three__names li'),
  ).toHaveCount(1);
  await expect(
    page.locator("#nha-tai-tro .poster-three__names li"),
  ).toHaveCount(4);
});

test("tournament.json exposes no private field and is served no-cache", async ({
  request,
}) => {
  const res = await request.get("/tournament.json");
  expect(res.ok()).toBe(true);
  expect(res.headers()["cache-control"]).toContain("no-cache");
  const body = await res.text();
  for (const key of ["phone", "skillBand", "feePayments"])
    expect(body).not.toContain(`"${key}"`);
});

test("shows the MoMo QR and the fund table", async ({ page }) => {
  await page.goto("/");
  const qr = page.locator(".poster-three__qr img");
  await qr.scrollIntoViewIfNeeded();
  await expect(qr).toBeVisible();
  await expect(
    page.getByText("Ban tổ chức đóng góp", { exact: true }),
  ).toBeVisible();
});

test("does not scroll horizontally on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the page is a single route", async ({ request }) => {
  for (const path of ["/quan-tri/", "/van-dong-vien/", "/lich-thi-dau/"])
    expect((await request.get(path)).status()).toBe(404);
});
