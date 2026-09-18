import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

// A tournament played to the end. The shipped file is pre-registration and
// renders no live sections, so layout checks on those sections load this.
const full = readFileSync(
  new URL("./fixtures/full-tournament.json", import.meta.url),
  "utf8",
);
const gotoFull = async (page: Page) => {
  await page.route("**/tournament.json", (route) =>
    route.fulfill({ contentType: "application/json", body: full }),
  );
  await page.goto("/");
};

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

// The form link is the one CTA on a pre-registration page, so it has to
// survive the build and point at the URL tournament.json actually carries.
test("links to the Microsoft registration form", async ({ page }) => {
  await page.goto("/");
  const section = page.locator("#dang-ky");
  await expect(section).toBeVisible();
  const cta = section.getByRole("link", { name: /MỞ FORM ĐĂNG KÝ/ });
  await expect(cta).toHaveAttribute(
    "href",
    /^https:\/\/forms\.cloud\.microsoft\/Pages\/ResponsePage\.aspx\?id=/,
  );
  await expect(cta).toHaveAttribute("target", "_blank");
  await expect(cta).toHaveAttribute("rel", "noopener noreferrer");
});

test("hides the registration section when no form is published", async ({
  page,
}) => {
  await page.route("**/tournament.json", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...JSON.parse(full),
        info: { ...JSON.parse(full).info, registrationFormUrl: null },
      }),
    }),
  );
  await page.goto("/");
  await expect(page.locator("#dang-ky")).toHaveCount(0);
});

test("renders the rule cards and sponsor tiers", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#the-le .card > h3")).toHaveCount(6);
  await expect(
    page.getByText("CHIA ĐỘI & THỂ THỨC", { exact: true }),
  ).toBeVisible();
  for (const tier of ["KIM CƯƠNG", "BẠCH KIM", "VÀNG"])
    await expect(page.getByText(tier, { exact: true })).toBeVisible();
  for (const pill of ["NHẤT", "NHÌ", "BA", "KHUYẾN KHÍCH"])
    await expect(page.getByText(pill, { exact: true })).toBeVisible();
});

// The show/hide rules themselves are covered by frontend/test/live-sections
// against an empty fixture. This asserts the file that actually ships renders
// the sections its data calls for: nobody has registered yet, so only THU CHI.
test("renders the live sections the shipped data calls for", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator("#thu-chi")).toBeVisible();
  await expect(page.locator("#van-dong-vien")).toHaveCount(0);
  await expect(page.locator("#boc-tham")).toHaveCount(0);
  await expect(page.locator("#lich-thi-dau")).toHaveCount(0);
  await expect(page.locator("#bang-xep-hang")).toHaveCount(0);
});

test("lists every athlete, all 24 matches and the four placings", async ({
  page,
}) => {
  await gotoFull(page);
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
  await gotoFull(page);
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
  ).toHaveCount(1);
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
    page.getByText("Nhà tài trợ — Ban tổ chức", { exact: true }),
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

// The stickers are poster furniture: they belong ON a photo frame, at every
// width. Stacked to one column they used to drop out of the overlap and land
// as two stray rows under the last photo, which only a real layout catches.
test("the stickers stay on their photo frames, at 1280 and at 390", async ({
  page,
}) => {
  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    const frames = page.locator(".poster-one__photo");
    for (const [sticker, frame] of [
      [".poster-one__bubble", 1],
      [".poster-one__badge", 2],
    ] as const) {
      const a = (await page.locator(sticker).boundingBox())!;
      const b = (await frames.nth(frame).boundingBox())!;
      const overlapX =
        Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
      const overlapY =
        Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
      expect(overlapX, `${sticker} at ${width}px`).toBeGreaterThan(0);
      expect(overlapY, `${sticker} at ${width}px`).toBeGreaterThan(0);
    }
  }
});

test("the page is a single route", async ({ request }) => {
  for (const path of ["/quan-tri/", "/van-dong-vien/", "/lich-thi-dau/"])
    expect((await request.get(path)).status()).toBe(404);
});

// One line means one line: a slab that wraps at a narrow width is the failure
// this guards, and only a real browser measures it.
test("every title slab stays on a single line, down to 390px", async ({
  page,
}) => {
  for (const width of [1280, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await gotoFull(page);
    const slabs = page.locator(
      ".section-title, .poster-two__title, .poster-three__title",
    );
    await expect(slabs).toHaveCount(8);
    for (let i = 0; i < 8; i++) {
      const lines = await slabs.nth(i).evaluate((el) => {
        const range = document.createRange();
        range.selectNodeContents(el);
        return range.getClientRects().length;
      });
      expect(lines).toBe(1);
    }
  }
});
