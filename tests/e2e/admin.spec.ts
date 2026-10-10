import { expect, test, type Page } from "@playwright/test";

// The local server keeps the tournament in memory. Every test starts from the
// same drawn tournament; the last hook hands the server back to landing.spec
// with no published snapshot, so that suite still sees the built file.
test.beforeEach(async ({ request }) => {
  expect((await request.post("/api/test/reset")).ok()).toBe(true);
});
test.afterAll(async ({ playwright }) => {
  const ctx = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3100",
  });
  await ctx.post("/api/test/reset");
  await ctx.dispose();
});

const signIn = async (page: Page, hash = "") => {
  await page.goto(`/quan-tri/${hash}`);
  await page.getByRole("button", { name: "Đăng nhập thử" }).click();
  await expect(page.getByText("admin@example.com")).toBeVisible();
};
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test("asks for sign-in and is hidden from search engines", async ({ page }) => {
  await page.goto("/quan-tri/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "QUẢN TRỊ GIẢI",
  );
  await expect(page.getByRole("button", { name: "Đăng nhập thử" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

test("the public page does not link to the admin screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('a[href*="quan-tri"]')).toHaveCount(0);
});

test("signs in, shows who is signed in, and signs out", async ({ page }) => {
  await signIn(page);
  await expect(page.getByText("Phiên bản 1")).toBeVisible();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page.getByRole("button", { name: "Đăng nhập thử" })).toBeVisible();
});

test("refuses an account that is not on the allow-list", async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("wm.token", "test:la@example.com"),
  );
  await page.goto("/quan-tri/");
  // Scoped to <main>: Next adds its own empty role="alert" route announcer.
  await expect(page.locator("main").getByRole("alert")).toHaveText(
    "Tài khoản này không có quyền quản trị.",
  );
});

for (const width of [390, 768, 1280])
  test(`the admin screen does not scroll sideways at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });
