import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const AUTH = { authorization: "Bearer test:admin@example.com" };
const FORM = "https://forms.office.com/r/abc123";

const version = async (request: APIRequestContext) =>
  ((await (await request.get("/api/admin/state", { headers: AUTH })).json()) as {
    version: number;
  }).version;
async function send(request: APIRequestContext, command: unknown) {
  const baseVersion = await version(request);
  const res = await request.post("/api/admin/commands", {
    headers: AUTH,
    data: { baseVersion, requestId: `nav-${baseVersion}`, command },
  });
  expect(res.ok(), await res.text()).toBe(true);
}
// The bar renders once tournament.json has loaded; reading it sooner gives [].
async function labels(page: Page) {
  await expect(page.locator(".site-nav a").first()).toBeVisible();
  return page.locator(".site-nav a").allInnerTexts();
}

test.beforeEach(async ({ request }) => {
  expect((await request.post("/api/test/reset")).ok()).toBe(true);
  await send(request, { type: "updateInfo", payload: { registrationFormUrl: FORM } });
});
test.afterAll(async ({ playwright }) => {
  const ctx = await playwright.request.newContext({
    baseURL: `http://127.0.0.1:${process.env.E2E_PORT ?? "3100"}`,
  });
  await ctx.post("/api/test/reset");
  await ctx.dispose();
});

test("the bar lists what is on the page and takes the reader there", async ({ page }) => {
  await page.goto("/");
  const shown = await labels(page);
  expect(shown.slice(0, 3)).toEqual(["TRANG CHỦ", "THỂ LỆ THI ĐẤU", "NHÀ TÀI TRỢ"]);
  expect(shown).toContain("DANH SÁCH VĐV");
  expect(shown).toContain("ĐĂNG KÝ THI ĐẤU");
  // Nothing to draw and no bảng đấu yet: no dead links.
  expect(shown).not.toContain("BỐC THĂM CHIA ĐỘI");
  expect(shown).not.toContain("BẢNG ĐẤU");
  // Every link in the bar has somewhere to land.
  for (const href of await page.locator(".site-nav a").evaluateAll((as) =>
    as.map((a) => a.getAttribute("href")!),
  ))
    if (href.startsWith("#")) await expect(page.locator(href)).toHaveCount(1);

  await page.getByRole("link", { name: "NHÀ TÀI TRỢ", exact: true }).click();
  await expect(page.locator("#nha-tai-tro")).toBeInViewport();
  // The bar came along, and the section is not hidden under it.
  const bar = await page.locator(".site-nav").boundingBox();
  const section = await page.locator("#nha-tai-tro").boundingBox();
  expect(bar!.y).toBe(0);
  expect(section!.y).toBeGreaterThanOrEqual(bar!.height - 1);
});

test("on a phone the bar scrolls inside itself and the page does not", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.locator(".site-nav")).toBeVisible();
  const size = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
    links: [...document.querySelectorAll(".site-nav a")].map(
      (a) => a.getBoundingClientRect().height,
    ),
  }));
  expect(size.scroll).toBeLessThanOrEqual(size.width);
  for (const h of size.links) expect(h).toBeGreaterThanOrEqual(48);
});

test("starting the giải moves BẢNG ĐẤU to the top of the page, stopping puts it back", async ({
  page,
  request,
}) => {
  await page.goto("/quan-tri/#giai");
  await page.getByRole("button", { name: "Đăng nhập thử" }).click();
  // Nothing to move until the bảng đấu exists.
  await expect(page.getByRole("button", { name: "Bắt đầu giải" })).toBeDisabled();
  await send(request, { type: "resetDraw", payload: {} });
  await send(request, { type: "createDuel", payload: {} });
  await page.reload();

  const home = await page.context().newPage();
  await home.goto("/");
  // Which comes first on the page: the bảng đấu or poster 1.
  const duelFirst = () =>
    home.evaluate(
      () =>
        (document.querySelector("#bang-dau")!.compareDocumentPosition(
          document.querySelector("#thong-bao")!,
        ) &
          Node.DOCUMENT_POSITION_FOLLOWING) !==
        0,
    );
  await expect(home.locator("#bang-dau")).toHaveCount(1);
  expect(await duelFirst()).toBe(false);

  await page.getByRole("button", { name: "Bắt đầu giải" }).click();
  await expect(page.getByText("Đã bắt đầu giải.")).toBeVisible();
  await home.reload();
  await expect(home.locator("#bang-dau")).toHaveCount(1);
  expect(await duelFirst()).toBe(true);
  expect((await labels(home))[0]).toBe("BẢNG ĐẤU");

  await page.getByRole("button", { name: "Dừng giải" }).click();
  await expect(page.getByText("Đã dừng giải.")).toBeVisible();
  await home.reload();
  await expect(home.locator("#bang-dau")).toHaveCount(1);
  expect(await duelFirst()).toBe(false);
  await home.close();
});

test("the organiser closes and reopens ĐĂNG KÝ THI ĐẤU with one tap", async ({
  page,
  request,
}) => {
  await page.goto("/quan-tri/#giai");
  await page.getByRole("button", { name: "Đăng nhập thử" }).click();
  await page.getByRole("button", { name: "Đóng đăng ký" }).click();
  await expect(page.getByText("Đã đóng đăng ký.")).toBeVisible();
  const info = async () =>
    ((await (await request.get("/tournament.json")).json()) as {
      info: { registrationOpen?: boolean; registrationFormUrl: string | null };
    }).info;
  // Closed, and the link is still there for reopening.
  expect(await info()).toMatchObject({ registrationOpen: false, registrationFormUrl: FORM });

  const home = await page.context().newPage();
  await home.goto("/");
  await expect(home.locator("#dang-ky")).toHaveCount(0);
  expect(await labels(home)).not.toContain("ĐĂNG KÝ THI ĐẤU");

  await page.getByRole("button", { name: "Mở đăng ký" }).click();
  await expect(page.getByText("Đã mở đăng ký.")).toBeVisible();
  await home.reload();
  await expect(home.locator("#dang-ky")).toHaveCount(1);
  expect(await labels(home)).toContain("ĐĂNG KÝ THI ĐẤU");
  await home.close();
});
