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
const MENS = "group-red-blue-mens_doubles";
const enterScore = async (page: Page, id: string, a: number, b: number) => {
  await page.locator(`[data-match-id="${id}"]`).click();
  await page.getByLabel("Điểm Đội Đỏ", { exact: true }).fill(String(a));
  await page.getByLabel("Điểm Đội Xanh", { exact: true }).fill(String(b));
  await page.getByRole("button", { name: "Lưu tỉ số" }).click();
};

test("a score entered on a phone reaches an open public page by itself", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  const visitor = await context.newPage();
  await visitor.goto("/");
  await expect(visitor.locator("#thong-bao")).toBeVisible();
  await expect(visitor.locator("#bang-xep-hang")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await enterScore(page, MENS, 21, 15);
  await expect(page.getByRole("status")).toContainText("Đã lưu tỉ số.");
  await expect(page.locator(`[data-match-id="${MENS}"]`)).toContainText("21–15");
  expect(await overflow(page)).toBeLessThanOrEqual(1);

  // No reload and no navigation on the visitor's page: the 20-second poll
  // alone has to bring the leaderboard in.
  await expect(visitor.locator("#bang-xep-hang")).toBeVisible({
    timeout: 30_000,
  });
});

test("an impossible score cannot be saved", async ({ page }) => {
  await signIn(page);
  await page.locator(`[data-match-id="${MENS}"]`).click();
  await page.getByLabel("Điểm Đội Đỏ", { exact: true }).fill("21");
  await page.getByLabel("Điểm Đội Xanh", { exact: true }).fill("20");
  await expect(page.getByRole("button", { name: "Lưu tỉ số" })).toBeDisabled();
  await expect(page.getByText("Chưa hợp lệ")).toBeVisible();
});

test("a stale screen is told to check again instead of overwriting", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await signIn(page);
  await signIn(other);
  await enterScore(page, MENS, 21, 15);
  await expect(page.getByRole("status")).toContainText("Đã lưu tỉ số.");

  await enterScore(other, MENS, 21, 10);
  await expect(other.getByRole("status")).toContainText(
    "Dữ liệu vừa thay đổi — kiểm tra rồi lưu lại.",
  );
  // It now shows what the first device saved, and that is what is stored.
  await expect(other.locator(`[data-match-id="${MENS}"]`)).toContainText("21–15");
  const stored = await (await page.request.get("/tournament.json")).json();
  expect(stored.matches[0].score).toEqual({ a: 21, b: 15 });
});

test("a walkover takes two taps and is recorded as 21–0", async ({ page }) => {
  await signIn(page);
  await page.locator(`[data-match-id="${MENS}"]`).click();
  await page.getByRole("button", { name: "Xử thắng: Đội Xanh vắng" }).click();
  await expect(page.locator(`[data-match-id="${MENS}"]`)).toContainText("Chờ");
  await page.getByRole("button", { name: "Bấm lần nữa để xác nhận" }).click();
  await expect(page.locator(`[data-match-id="${MENS}"]`)).toContainText(
    "Xử thắng 21–0",
  );
});
test("re-draws the teams from a previewed seed", async ({ page }) => {
  await signIn(page, "#doi");
  await page.getByRole("button", { name: "Bốc lại từ đầu" }).click();
  await page.getByRole("button", { name: "Bấm lần nữa để xác nhận" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Đã xoá kết quả bốc thăm.",
  );

  await page.getByLabel("Mã bốc thăm").fill("mua-2026");
  await page.getByRole("button", { name: "Xem trước" }).click();
  await expect(page.locator(".draw-preview li")).toHaveCount(16);
  // A preview is not a save: visitors still see no teams.
  let data = await (await page.request.get("/tournament.json")).json();
  expect(data.draw.status).toBe("not_started");

  await page.getByRole("button", { name: "Xác nhận bốc thăm này" }).click();
  await expect(page.getByRole("status")).toContainText("Đã bốc thăm");
  data = await (await page.request.get("/tournament.json")).json();
  expect(data.draw.status).toBe("confirmed");
  expect(data.matches).toHaveLength(18);
});

test("the draw is locked once a match has been played", async ({ page }) => {
  await signIn(page);
  await enterScore(page, MENS, 21, 15);
  await expect(page.getByRole("status")).toContainText("Đã lưu tỉ số.");
  await page.getByRole("button", { name: "Đội", exact: true }).click();
  await expect(page.getByText("Đã có trận được gọi hoặc đánh")).toBeVisible();
  await expect(page.getByRole("button", { name: "Bốc lại từ đầu" })).toHaveCount(0);
});

test("adds an athlete without leaking private fields", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "#vdv");
  await page.getByRole("button", { name: "Thêm VĐV" }).click();
  await page.getByLabel("Họ và tên").fill("Nguyễn Thị Thử");
  await page.getByLabel("Giới tính").selectOption("female");
  await page.getByLabel("Trình độ").selectOption("2");
  await page.getByLabel("Số điện thoại").fill("0909 111 222");
  await page.getByLabel("Ghi chú riêng").fill("chỉ BTC đọc");
  await page.getByRole("button", { name: "Lưu VĐV" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu VĐV.");
  await expect(page.locator(".pick-list")).toContainText("Nguyễn Thị Thử");
  expect(await overflow(page)).toBeLessThanOrEqual(1);

  const body = await (await page.request.get("/tournament.json")).text();
  expect(body).toContain("Nguyễn Thị Thử");
  for (const leak of ["0909", "chỉ BTC đọc", '"skillBand"', '"phone"'])
    expect(body).not.toContain(leak);
});

test("removes an athlete who is in no lineup", async ({ page }) => {
  await signIn(page, "#vdv");
  await page.getByRole("button", { name: /VĐV thử 16/ }).click();
  await page.getByRole("button", { name: "Xoá VĐV" }).click();
  await page.getByRole("button", { name: "Bấm lần nữa để xác nhận" }).click();
  await expect(page.getByRole("status")).toContainText("Đã xoá VĐV.");
  await expect(page.locator(".pick-list")).not.toContainText("VĐV thử 16");
});
