import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const AUTH = { authorization: "Bearer test:admin@example.com" };
const CODE = "048213";

interface Athlete {
  id: string;
  name: string;
  gender: "male" | "female";
  teamId: string | null;
}
interface Match {
  id: string;
  status: string;
  score: { red: number; blue: number } | null;
  smashes: Record<string, { hit: number; net: number }>;
}
interface State {
  version: number;
  document: { athletes: Athlete[]; duel?: { matches: Match[] } };
}

test.use({ viewport: { width: 390, height: 844 } });

const state = async (request: APIRequestContext) =>
  (await (await request.get("/api/admin/state", { headers: AUTH })).json()) as State;
async function send(request: APIRequestContext, command: unknown) {
  const { version } = await state(request);
  const res = await request.post("/api/admin/commands", {
    headers: AUTH,
    data: { baseVersion: version, requestId: `ref-${version}`, command },
  });
  expect(res.ok(), await res.text()).toBe(true);
}
const published = async (request: APIRequestContext) =>
  (await (await request.get("/tournament.json")).json()) as State["document"];
const first = async (request: APIRequestContext) =>
  (await published(request)).duel!.matches[0];

let red: Athlete[];
let blue: Athlete[];

// Two drawn teams, the bảng đấu, trận 1 with its pairs, a code. Not yet open.
test.beforeEach(async ({ request }) => {
  expect((await request.post("/api/test/reset")).ok()).toBe(true);
  await send(request, { type: "resetDraw", payload: {} });
  await send(request, { type: "setTeamDrawOpen", payload: { open: true } });
  for (const a of (await state(request)).document.athletes)
    await request.post("/api/team-draw", { data: { athleteId: a.id } });
  await send(request, { type: "setTeamDrawOpen", payload: { open: false } });
  const { athletes } = (await state(request)).document;
  const men = (teamId: string) =>
    athletes.filter((a) => a.teamId === teamId && a.gender === "male");
  red = men("red");
  blue = men("blue");
  await send(request, { type: "createDuel", payload: {} });
  await send(request, {
    type: "saveDuelMatch",
    payload: {
      matchId: "vong-loai-1",
      pairRed: [red[0].id, red[1].id],
      pairBlue: [blue[0].id, blue[1].id],
      status: "pending",
      score: null,
      smashes: {},
    },
  });
  await send(request, { type: "setRefereeCode", payload: { code: CODE } });
});
test.afterAll(async ({ playwright }) => {
  const ctx = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3100",
  });
  await ctx.post("/api/test/reset");
  await ctx.dispose();
});

const open = (request: APIRequestContext) =>
  send(request, { type: "setRefereeOpen", payload: { open: true } });
async function enter(page: Page, code = CODE) {
  await page.goto("/trong-tai/");
  await page.getByTestId("referee-code-input").fill(code);
  await page.getByRole("button", { name: "Vào chấm điểm" }).click();
}
const saved = (page: Page) =>
  expect(page.getByTestId("save-state")).toHaveText("Đã lưu");
async function tap(page: Page, testId: string, times: number) {
  for (let i = 0; i < times; i++) await page.getByTestId(testId).click();
}

test("the page is closed until the organiser opens it", async ({ page, request }) => {
  await page.goto("/trong-tai/");
  await expect(page.getByTestId("referee-closed")).toBeVisible();
  await expect(page.getByTestId("referee-code-input")).toHaveCount(0);
  const res = await request.post("/api/referee/check", { data: { code: CODE } });
  expect(res.status()).toBe(403);
});

test("a wrong code is refused and the right one is remembered", async ({
  page,
  request,
}) => {
  await open(request);
  await enter(page, "000000");
  await expect(page.locator("p[role=alert]")).toHaveText("Mã trọng tài không đúng.");
  await page.getByTestId("referee-code-input").fill(CODE);
  await page.getByRole("button", { name: "Vào chấm điểm" }).click();
  await expect(page.getByRole("button", { name: /Trận 1/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /Trận 1/ })).toBeVisible();
  await expect(page.getByTestId("referee-code-input")).toHaveCount(0);
});

test("the list shows which matches can be refereed", async ({ page, request }) => {
  await open(request);
  await enter(page);
  await expect(page.getByRole("button", { name: /Trận 1/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Trận 1/ })).toContainText(
    red[0].name.trim().split(/\s+/).at(-1)!,
  );
  // Trận 2 has no pairs yet.
  await expect(page.getByRole("button", { name: /Trận 2/ })).toBeDisabled();
  await expect(page.getByRole("button")).toHaveCount(11);
});

test("a referee runs a match from start to finish", async ({ page, request }) => {
  await open(request);
  await enter(page);
  await page.getByRole("button", { name: /Trận 1/ }).click();
  await page.getByRole("button", { name: "Bắt đầu trận" }).click();
  await saved(page);
  expect((await first(request)).status).toBe("live");

  await tap(page, "plus-red", 3);
  await tap(page, "plus-blue", 2);
  await tap(page, `smash-${red[0].id}-hit-plus`, 2);
  await tap(page, `smash-${blue[1].id}-net-plus`, 1);
  await expect(page.getByTestId("score-red")).toHaveText("3");
  await expect(page.getByTestId("score-blue")).toHaveText("2");
  await saved(page);
  expect(await first(request)).toMatchObject({
    status: "live",
    score: { red: 3, blue: 2 },
    smashes: { [red[0].id]: { hit: 2, net: 0 }, [blue[1].id]: { hit: 0, net: 1 } },
  });

  // The public page shows the running score, and no winner yet.
  const publicPage = await page.context().newPage();
  await publicPage.goto("/");
  const card = publicPage.getByTestId("duel-vong-loai-1");
  await expect(card).toContainText("Đang đánh");
  await expect(card.locator(".draw-row__score")).toHaveText(["3", "2"]);
  await expect(card.locator(".is-winner")).toHaveCount(0);
  await publicPage.close();

  // A mis-tap is taken back.
  await tap(page, "plus-blue", 1);
  await tap(page, "minus-blue", 1);
  await expect(page.getByTestId("score-blue")).toHaveText("2");

  const finish = page.getByRole("button", { name: /Kết thúc trận/ });
  await expect(finish).toBeDisabled();
  await tap(page, "plus-red", 18);
  await tap(page, "plus-blue", 13);
  await expect(page.getByTestId("score-red")).toHaveText("21");
  await expect(page.getByTestId("score-blue")).toHaveText("15");
  await finish.click();
  await page.getByRole("button", { name: "Bấm lần nữa: kết thúc 21–15" }).click();
  await expect(page.getByText("Trận đã kết thúc")).toBeVisible();
  await expect(page.getByTestId("plus-red")).toHaveCount(0);
  await expect
    .poll(async () => (await first(request)).status)
    .toBe("done");
  expect((await first(request)).score).toEqual({ red: 21, blue: 15 });
});

test("the scorer fits a phone: no sideways scroll, nothing too small to hit", async ({
  page,
  request,
}) => {
  await open(request);
  await enter(page);
  await page.getByRole("button", { name: /Trận 1/ }).click();
  await page.getByRole("button", { name: "Bắt đầu trận" }).click();
  await saved(page);
  const sizes = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
    buttons: [...document.querySelectorAll(".ref-scorer button")].map((b) => {
      const r = b.getBoundingClientRect();
      return { id: b.getAttribute("data-testid"), w: r.width, h: r.height };
    }),
  }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.width);
  expect(sizes.buttons.length).toBeGreaterThan(10);
  for (const b of sizes.buttons) {
    expect(b.w, `${b.id} width`).toBeGreaterThanOrEqual(48);
    expect(b.h, `${b.id} height`).toBeGreaterThanOrEqual(48);
  }
  for (const id of ["plus-red", "plus-blue"])
    expect(sizes.buttons.find((b) => b.id === id)!.h).toBeGreaterThanOrEqual(96);
});

test("a changed code sends the referee back to the code screen", async ({
  page,
  request,
}) => {
  await open(request);
  await enter(page);
  await page.getByRole("button", { name: /Trận 1/ }).click();
  await page.getByRole("button", { name: "Bắt đầu trận" }).click();
  await saved(page);
  await send(request, { type: "setRefereeCode", payload: { code: "999999" } });
  await tap(page, "plus-red", 1);
  await expect(page.getByTestId("referee-code-input")).toBeVisible();
  await expect(page.locator("p[role=alert]")).toHaveText("Mã trọng tài không đúng.");
  expect((await first(request)).score).toBeNull();
});

test("a finished match opens read-only", async ({ page, request }) => {
  await send(request, {
    type: "saveDuelMatch",
    payload: {
      matchId: "vong-loai-1",
      pairRed: [red[0].id, red[1].id],
      pairBlue: [blue[0].id, blue[1].id],
      status: "done",
      score: { red: 21, blue: 15 },
      smashes: {},
    },
  });
  await open(request);
  await enter(page);
  await page.getByRole("button", { name: /Trận 1/ }).click();
  await expect(page.getByTestId("score-red")).toHaveText("21");
  await expect(page.getByText("Trận đã kết thúc")).toBeVisible();
  await expect(page.getByTestId("plus-red")).toHaveCount(0);
});

test("the served file never carries the code", async ({ page, request }) => {
  await open(request);
  await enter(page);
  await page.getByRole("button", { name: /Trận 1/ }).click();
  await page.getByRole("button", { name: "Bắt đầu trận" }).click();
  await saved(page);
  const body = await (await request.get("/tournament.json")).text();
  expect(body).not.toContain(CODE);
  expect(body).not.toContain("refereeCode");
  expect(body).not.toContain("secrets");
});
