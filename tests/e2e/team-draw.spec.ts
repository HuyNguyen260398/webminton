import { expect, test, type APIRequestContext } from "@playwright/test";

const AUTH = { authorization: "Bearer test:admin@example.com" };

interface State {
  version: number;
  document: {
    athletes: { id: string; name: string; gender: string; teamId: string | null }[];
  };
  private: Record<string, { skillBand: number | null }>;
}

const state = async (request: APIRequestContext) =>
  (await (await request.get("/api/admin/state", { headers: AUTH })).json()) as State;

async function send(request: APIRequestContext, command: unknown) {
  const { version } = await state(request);
  const res = await request.post("/api/admin/commands", {
    headers: AUTH,
    data: { baseVersion: version, requestId: `e2e-${version}`, command },
  });
  expect(res.ok()).toBe(true);
}

// The local server starts from a confirmed four-team draw. The athletes' own
// draw begins from nobody having a team.
test.beforeEach(async ({ request }) => {
  expect((await request.post("/api/test/reset")).ok()).toBe(true);
  await send(request, { type: "resetDraw", payload: {} });
});
test.afterAll(async ({ playwright }) => {
  const ctx = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3100",
  });
  await ctx.post("/api/test/reset");
  await ctx.dispose();
});

const open = (request: APIRequestContext) =>
  send(request, { type: "setTeamDrawOpen", payload: { open: true } });

test("stays shut until the organiser opens it", async ({ page, request }) => {
  await page.goto("/boc-tham/");
  await expect(page.getByText("CHƯA MỞ ỐNG THĂM")).toBeVisible();
  await expect(page.getByRole("combobox")).toHaveCount(0);
  const { document } = await state(request);
  const res = await request.post("/api/team-draw", {
    data: { athleteId: document.athletes[0].id },
  });
  expect(res.status()).toBe(422);

  await page.goto("/");
  await expect(page.locator('a[href="/boc-tham/"]')).toHaveCount(0);
});

test("the page links to the draw while it is open", async ({ page, request }) => {
  await open(request);
  await page.goto("/");
  await page.getByRole("link", { name: /VÀO BỐC THĂM/ }).click();
  await expect(page).toHaveURL(/\/boc-tham\/$/);
  await expect(page.getByRole("heading", { level: 2 })).toHaveText(
    "BỐC THĂM CHIA ĐỘI",
  );
});

test("an athlete picks a name, confirms it, and gets a team once", async ({
  page,
  request,
}) => {
  await open(request);
  const { document } = await state(request);
  const me = document.athletes[0];

  await page.goto("/boc-tham/");
  const roll = page.getByRole("button", { name: "BỐC THĂM", exact: true });
  await expect(roll).toBeDisabled();
  await page.getByLabel("Chọn tên của bạn").selectOption(me.id);
  await roll.click();

  // The pop-up names the athlete, and backing out rolls nothing.
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText(me.name);
  await dialog.getByRole("button", { name: "Chọn lại tên" }).click();
  await expect(dialog).toBeHidden();
  expect((await state(request)).document.athletes[0].teamId).toBeNull();

  await roll.click();
  await dialog.getByRole("button", { name: /ĐÚNG LÀ TÔI/ }).click();
  const result = page.locator(".team-draw__result");
  await expect(result).toContainText(me.name);
  await expect(result).toContainText(/ĐỘI (ĐỎ|XANH)/);

  // Recorded at once, shown in the roster, and gone from the list of names.
  const after = (await state(request)).document.athletes[0];
  expect(["red", "blue"]).toContain(after.teamId);
  await expect(page.locator(".team-grid")).toContainText(me.name);
  await expect(
    page.locator(`select option[value="${me.id}"]`),
  ).toHaveCount(0);

  // Then the page takes them back to the landing page by itself.
  await expect(result).toContainText(/Tự về trang giải sau \d giây/);
  await expect(page).toHaveURL(/127\.0\.0\.1:3100\/$/, { timeout: 15_000 });
  await expect(page.getByRole("heading", { name: "HAI ĐỘI" })).toBeVisible();

  const again = await request.post("/api/team-draw", {
    data: { athleteId: me.id },
  });
  expect(again.status()).toBe(422);
  expect((await again.json()).code).toBe("ALREADY_DRAWN");
  expect((await state(request)).document.athletes[0].teamId).toBe(after.teamId);

  const published = await (await request.get("/tournament.json")).text();
  expect(published).not.toMatch(/skillBand|phone|"note"/);
});

test("when everyone has rolled, the two teams are level", async ({
  page,
  request,
}) => {
  await open(request);
  const before = await state(request);
  for (const a of before.document.athletes) {
    const res = await request.post("/api/team-draw", {
      data: { athleteId: a.id },
    });
    expect(res.ok()).toBe(true);
    expect(JSON.stringify(await res.json())).not.toContain("skillBand");
  }
  const after = await state(request);
  const tally = (teamId: string) => {
    const counts: Record<string, number> = {};
    for (const a of after.document.athletes.filter((x) => x.teamId === teamId)) {
      const key = `${a.gender}/${after.private[a.id].skillBand}`;
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  };
  const [red, blue] = [tally("red"), tally("blue")];
  const size = (c: Record<string, number>) =>
    Object.values(c).reduce((s, n) => s + n, 0);
  expect(size(red) + size(blue)).toBe(after.document.athletes.length);
  expect(Math.abs(size(red) - size(blue))).toBeLessThanOrEqual(1);
  for (const key of new Set([...Object.keys(red), ...Object.keys(blue)]))
    expect(Math.abs((red[key] ?? 0) - (blue[key] ?? 0))).toBeLessThanOrEqual(1);

  await page.goto("/boc-tham/");
  await expect(page.getByText("AI CŨNG CÓ ĐỘI RỒI")).toBeVisible();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "HAI ĐỘI" })).toBeVisible();
});

test("the organiser can wipe the teams and start the draw over", async ({
  page,
  request,
}) => {
  await open(request);
  const { document } = await state(request);
  for (const a of document.athletes.slice(0, 3))
    await request.post("/api/team-draw", { data: { athleteId: a.id } });

  await page.goto("/quan-tri/#doi");
  await page.getByRole("button", { name: "Đăng nhập thử" }).click();
  await expect(page.getByText("3/16 đã có đội")).toBeVisible();
  const reset = page.getByRole("button", { name: "Xoá hết đội, bốc lại từ đầu" });
  // One tap only arms it.
  await reset.click();
  expect(
    (await state(request)).document.athletes.filter((a) => a.teamId).length,
  ).toBe(3);
  await page.getByRole("button", { name: "Bấm lần nữa để xác nhận" }).click();
  await expect(page.getByText("0/16 đã có đội")).toBeVisible();
  await expect(page.getByText("Đang đóng")).toBeVisible();
  await expect(reset).toHaveCount(0);
  expect(
    (await state(request)).document.athletes.every((a) => a.teamId === null),
  ).toBe(true);

  // Closed again, so nobody rolls until the organiser reopens it.
  const res = await request.post("/api/team-draw", {
    data: { athleteId: document.athletes[0].id },
  });
  expect((await res.json()).code).toBe("TEAM_DRAW_CLOSED");
});

test("fits a phone without scrolling sideways", async ({ page, request }) => {
  await open(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/boc-tham/");
  await expect(page.getByLabel("Chọn tên của bạn")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
});
