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
  await expect(page.getByText("CHIA ĐỘI & THỂ THỨC", { exact: true })).toBeVisible();
  for (const tier of ["KIM CƯƠNG", "VÀNG", "THÂN THIỆN"])
    await expect(page.getByText(tier, { exact: true })).toBeVisible();
  for (const pill of ["NHẤT", "NHÌ", "BA", "KHUYẾN KHÍCH"])
    await expect(page.getByText(pill, { exact: true })).toBeVisible();
});

test("hides the live sections while the tournament is empty", async ({
  page,
}) => {
  await page.goto("/");
  for (const id of [
    "#van-dong-vien",
    "#boc-tham",
    "#lich-thi-dau",
    "#bang-xep-hang",
    "#thu-chi",
  ])
    await expect(page.locator(id)).toHaveCount(0);
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
