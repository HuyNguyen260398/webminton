import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const AUTH = { authorization: "Bearer test:admin@example.com" };

interface Athlete {
  id: string;
  name: string;
  gender: "male" | "female";
  teamId: string | null;
}
interface State {
  version: number;
  document: {
    athletes: Athlete[];
    referee?: { open: boolean };
    duel?: { matches: { id: string; status: string; score: unknown }[] };
  };
  secrets: { refereeCode: string | null };
}

const state = async (request: APIRequestContext) =>
  (await (await request.get("/api/admin/state", { headers: AUTH })).json()) as State;

async function send(request: APIRequestContext, command: unknown) {
  const { version } = await state(request);
  const res = await request.post("/api/admin/commands", {
    headers: AUTH,
    data: { baseVersion: version, requestId: `duel-${version}`, command },
  });
  expect(res.ok(), await res.text()).toBe(true);
}

// Two teams drawn by the athletes themselves, as on the day.
test.beforeEach(async ({ request }) => {
  expect((await request.post("/api/test/reset")).ok()).toBe(true);
  await send(request, { type: "resetDraw", payload: {} });
  await send(request, { type: "setTeamDrawOpen", payload: { open: true } });
  for (const a of (await state(request)).document.athletes)
    await request.post("/api/team-draw", { data: { athleteId: a.id } });
  await send(request, { type: "setTeamDrawOpen", payload: { open: false } });
});
test.afterAll(async ({ playwright }) => {
  const ctx = await playwright.request.newContext({
    baseURL: `http://127.0.0.1:${process.env.E2E_PORT ?? "3100"}`,
  });
  await ctx.post("/api/test/reset");
  await ctx.dispose();
});

const signIn = async (page: Page) => {
  await page.goto("/quan-tri/#tran-dau");
  await page.getByRole("button", { name: "Đăng nhập thử" }).click();
  await expect(page.getByText("admin@example.com")).toBeVisible();
};
const men = (athletes: Athlete[], teamId: string) =>
  athletes.filter((a) => a.teamId === teamId && a.gender === "male");
const women = (athletes: Athlete[], teamId: string) =>
  athletes.filter((a) => a.teamId === teamId && a.gender === "female");

test("the organiser runs a match from pairs to final score", async ({
  page,
  request,
}) => {
  const { athletes } = (await state(request)).document;
  const [r1, r2] = men(athletes, "red");
  const [b1, b2] = men(athletes, "blue");

  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await page.getByRole("button", { name: "Tạo 12 trận" }).click();
  await expect(page.locator(".pick-list .pick-item")).toHaveCount(12);

  // Nothing public yet but the empty sheet.
  const view = await page.context().newPage();
  await view.goto("/");
  const card = view.getByTestId("duel-vong-loai-1");
  await expect(card).toContainText("Chưa đánh");

  await page.getByRole("button", { name: /Trận 1 · Đôi nam/ }).click();
  await page.getByLabel("Đội Đỏ — người 1").selectOption(r1.id);
  await page.getByLabel("Đội Đỏ — người 2").selectOption(r2.id);
  await page.getByLabel("Đội Xanh — người 1").selectOption(b1.id);
  await page.getByLabel("Đội Xanh — người 2").selectOption(b2.id);
  // A man cannot take both seats of his pair.
  await expect(
    page.getByLabel("Đội Đỏ — người 2").locator(`option[value="${r1.id}"]`),
  ).toHaveCount(0);

  // Saved but not called: the pairs stay off the public page.
  await page.getByRole("button", { name: "Lưu cặp" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu cặp.");
  await view.reload();
  await expect(card).toContainText("Chưa đánh");
  await expect(card).not.toContainText(r1.name);

  await page.getByRole("button", { name: "Bắt đầu trận" }).click();
  await expect(page.getByRole("status")).toContainText("Đã gọi trận");
  await view.reload();
  await expect(card).toContainText("Đang đánh");
  await expect(card).toContainText(`${r1.name} · ${r2.name}`);
  await expect(card).toContainText(`${b1.name} · ${b2.name}`);

  // Count smashes, then the final score.
  for (let i = 0; i < 3; i++)
    await page
      .getByRole("button", { name: `Tăng Smash ăn điểm của ${r1.name}`, exact: true })
      .click();
  await page
    .getByRole("button", { name: `Tăng Smash rúc lưới của ${b2.name}`, exact: true })
    .click();
  await page.getByRole("textbox", { name: "Điểm Đội Đỏ" }).fill("21");
  await page.getByRole("textbox", { name: "Điểm Đội Xanh" }).fill("20");
  await expect(page.getByText("Chưa hợp lệ")).toBeVisible();
  await expect(page.getByRole("button", { name: "Kết thúc trận" })).toBeDisabled();
  await page.getByRole("textbox", { name: "Điểm Đội Xanh" }).fill("15");
  await page.getByRole("button", { name: "Kết thúc trận" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu kết quả trận.");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(1);

  await view.reload();
  await expect(card).toContainText("Đã xong");
  const score = view.getByTestId("duel-score");
  await expect(score.locator(".duel-score__points").nth(0)).toHaveText("21");
  await expect(score.locator(".duel-score__points").nth(1)).toHaveText("15");
  await expect(score).toContainText("Đã đánh 1/12 trận");
  const hits = view.locator("#vua-smash .card").nth(0);
  await expect(hits).toContainText("SMASH ĂN ĐIỂM NHIỀU NHẤT");
  await expect(hits.locator("li")).toHaveCount(1);
  await expect(hits.locator("li")).toContainText(r1.name);
  await expect(hits.locator("li b")).toHaveText("3");
  await expect(view.locator("#vua-smash .card").nth(1).locator("li")).toContainText(
    b2.name,
  );
  expect(
    await view.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth,
    ),
  ).toBeLessThanOrEqual(0);
});

test("finals count double and smash counts add up across matches", async ({
  page,
  request,
}) => {
  const { athletes } = (await state(request)).document;
  const [r1, r2] = men(athletes, "red");
  const [b1, b2] = men(athletes, "blue");
  const [rw] = women(athletes, "red");
  const [bw] = women(athletes, "blue");
  await send(request, { type: "createDuel", payload: {} });
  const save = (matchId: string, extra: Record<string, unknown>) =>
    send(request, {
      type: "saveDuelMatch",
      payload: {
        matchId,
        pairRed: [r1.id, r2.id],
        pairBlue: [b1.id, b2.id],
        status: "done",
        smashes: {},
        ...extra,
      },
    });
  await save("vong-loai-1", {
    score: { red: 21, blue: 15 },
    smashes: { [r1.id]: { hit: 3, net: 0 } },
  });
  await save("vong-loai-2", {
    score: { red: 18, blue: 21 },
    smashes: { [r1.id]: { hit: 2, net: 4 } },
  });
  // The mixed final, blue 21–10: worth 20 to red and 42 to blue.
  await save("chung-ket-2", {
    pairRed: [r1.id, rw.id],
    pairBlue: [b1.id, bw.id],
    score: { red: 10, blue: 21 },
  });

  await page.goto("/");
  const score = page.getByTestId("duel-score");
  await expect(score.locator(".duel-score__points").nth(0)).toHaveText("59");
  await expect(score.locator(".duel-score__points").nth(1)).toHaveText("78");
  await expect(score.locator(".duel-score__side").nth(1)).toHaveClass(/is-leading/);
  await expect(page.locator("#vua-smash .card").nth(0).locator("li b")).toHaveText("5");
  await expect(page.locator("#vua-smash .card").nth(1).locator("li b")).toHaveText("4");

  const published = await (await request.get("/tournament.json")).text();
  expect(published).not.toMatch(/skillBand|phone|"note"/);
});

test("needs sign-in to change a match", async ({ request }) => {
  await send(request, { type: "createDuel", payload: {} });
  const { version } = await state(request);
  const res = await request.post("/api/admin/commands", {
    data: {
      baseVersion: version,
      requestId: "no-token",
      command: { type: "resetDuel", payload: {} },
    },
  });
  expect(res.status()).toBe(401);
});

test("the organiser creates a code and opens refereeing", async ({
  page,
  request,
}) => {
  await send(request, { type: "createDuel", payload: {} });
  await signIn(page);
  await expect(page.getByTestId("referee-code")).toHaveText("Chưa có mã");
  await expect(page.getByRole("button", { name: "Mở chấm điểm" })).toBeDisabled();

  await page.getByRole("button", { name: "Tạo mã" }).click();
  await expect(page.getByTestId("referee-code")).toHaveText(/^\d{6}$/);
  const code = await page.getByTestId("referee-code").innerText();
  expect((await state(request)).secrets.refereeCode).toBe(code);

  await page.getByRole("button", { name: "Mở chấm điểm" }).click();
  await expect(page.getByRole("button", { name: "Đóng chấm điểm" })).toBeVisible();
  expect((await state(request)).document.referee).toEqual({ open: true });
  expect(await (await request.get("/tournament.json")).text()).not.toContain(code);

  // Both steps read as plain Vietnamese in the history, not as identifiers.
  await page.getByRole("button", { name: "Lịch sử", exact: true }).click();
  await expect(page.getByText("Mở hoặc đóng chấm điểm cho trọng tài")).toBeVisible();
  await expect(page.getByText("Tạo hoặc đổi mã trọng tài")).toBeVisible();
  await expect(page.getByText("setRefereeOpen")).toHaveCount(0);
});

test("the organiser enters the referees and puts one on a match", async ({
  page,
  request,
}) => {
  await send(request, { type: "createDuel", payload: {} });
  await signIn(page);
  await page
    .getByLabel("Danh sách trọng tài (mỗi dòng một tên)")
    .fill("Huy\n  Bảo \n\nHuy");
  await page.getByRole("button", { name: "Lưu danh sách" }).click();
  await expect(page.getByText("Đã lưu danh sách trọng tài.")).toBeVisible();
  const doc = (await state(request)).document as unknown as {
    refereeNames: string[];
  };
  expect(doc.refereeNames).toEqual(["Huy", "Bảo"]);

  await page.getByRole("button", { name: /Trận 1 ·/ }).click();
  await page.getByLabel("Trọng tài của trận").selectOption("Bảo");
  await page.getByRole("button", { name: "Lưu cặp" }).click();
  await expect(page.getByText("Đã lưu cặp.")).toBeVisible();
  const m = (await state(request)).document.duel!.matches[0] as unknown as {
    referee?: string;
  };
  expect(m.referee).toBe("Bảo");
  await expect(page.getByRole("button", { name: /Trận 1 ·/ })).toContainText(
    "Trọng tài: Bảo",
  );
});

test("saving smashes on a live match keeps the running score", async ({
  page,
  request,
}) => {
  const { athletes } = (await state(request)).document;
  const [r1, r2] = men(athletes, "red");
  const [b1, b2] = men(athletes, "blue");
  await send(request, { type: "createDuel", payload: {} });
  // As if a referee were three points in.
  await send(request, {
    type: "saveDuelMatch",
    payload: {
      matchId: "vong-loai-1",
      pairRed: [r1.id, r2.id],
      pairBlue: [b1.id, b2.id],
      status: "live",
      score: { red: 3, blue: 2 },
      smashes: {},
    },
  });
  await signIn(page);
  await page.getByRole("button", { name: /Trận 1 ·/ }).click();
  await page
    .getByRole("button", { name: `Tăng Smash ăn điểm của ${r1.name}`, exact: true })
    .click();
  await page.getByRole("button", { name: "Lưu số smash" }).click();
  await expect(page.getByText("Đã lưu số smash.")).toBeVisible();
  const m = (await state(request)).document.duel!.matches[0];
  expect(m.status).toBe("live");
  expect(m.score).toEqual({ red: 3, blue: 2 });
});

test("reopening a finished match keeps its score for correcting", async ({
  page,
  request,
}) => {
  const { athletes } = (await state(request)).document;
  const [r1, r2] = men(athletes, "red");
  const [b1, b2] = men(athletes, "blue");
  await send(request, { type: "createDuel", payload: {} });
  await send(request, {
    type: "saveDuelMatch",
    payload: {
      matchId: "vong-loai-1",
      pairRed: [r1.id, r2.id],
      pairBlue: [b1.id, b2.id],
      status: "done",
      score: { red: 21, blue: 15 },
      smashes: {},
    },
  });
  await signIn(page);
  await page.getByRole("button", { name: /Trận 1 ·/ }).click();
  const reopen = page.getByRole("button", { name: "Mở lại trận" });
  await reopen.click();
  await page.getByRole("button", { name: "Bấm lần nữa để xác nhận" }).click();
  await expect(page.getByText("Đã mở lại trận")).toBeVisible();
  const m = (await state(request)).document.duel!.matches[0];
  expect(m.status).toBe("live");
  expect(m.score).toEqual({ red: 21, blue: 15 });
});
