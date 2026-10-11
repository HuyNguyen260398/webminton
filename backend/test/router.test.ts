// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { route, type AdminView, type Deps } from "../src/router";
import { MemoryStore } from "../src/store";
import { makeAdminState } from "../../packages/domain/src/testing/fixtures";

const ADMIN = { email: "btc@example.com", email_verified: "true" };
let deps: Deps;
let published: string[];

beforeEach(async () => {
  published = [];
  const store = new MemoryStore();
  await store.write(null, makeAdminState(), {
    at: "2026-10-10T00:00:00+07:00",
    actorEmail: "seed",
    commandType: "seed",
    requestId: "seed",
  });
  deps = {
    store,
    publish: async (body) => void published.push(body),
    adminEmails: ["btc@example.com"],
    config: { cognitoDomain: "auth.example.com", clientId: "abc", devLogin: false },
    now: () => "2026-10-18T08:00:00+07:00",
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const call = (method: string, path: string, body?: unknown, claims: unknown = ADMIN) =>
  route(
    {
      method,
      path,
      rawBody: body === undefined ? null : JSON.stringify(body),
      // null means "no token": undefined would fall back to the default.
      claims: (claims ?? undefined) as Record<string, unknown> | undefined,
    },
    deps,
  );
const command = (baseVersion: number, requestId: string, cmd: unknown) =>
  call("POST", "/api/admin/commands", { baseVersion, requestId, command: cmd });
const fee = (feeVnd: number) => ({ type: "updateInfo", payload: { feeVnd } });

describe("route — access", () => {
  it("serves the public config to anyone", async () => {
    const res = await call("GET", "/api/config", undefined, null);
    expect(res).toEqual({ status: 200, body: deps.config });
  });

  it("guards every admin route", async () => {
    for (const [method, path] of [
      ["GET", "/api/admin/state"],
      ["POST", "/api/admin/commands"],
      ["POST", "/api/admin/draw/preview"],
      ["POST", "/api/admin/publish"],
      ["GET", "/api/admin/history"],
      ["POST", "/api/admin/restore"],
    ]) {
      expect((await call(method, path, {}, null)).status).toBe(401);
      const outsider = { email: "la@example.com", email_verified: "true" };
      const res = await call(method, path, {}, outsider);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        code: "FORBIDDEN",
        message: "Tài khoản này không có quyền quản trị.",
      });
    }
  });

  it("answers 404 for an unknown path and 400 for a broken body", async () => {
    expect((await call("GET", "/api/admin/nope")).status).toBe(404);
    expect((await call("GET", "/somewhere")).status).toBe(404);
    const res = await route(
      { method: "POST", path: "/api/admin/commands", rawBody: "{not json", claims: ADMIN },
      deps,
    );
    expect(res.status).toBe(400);
    expect((await command(1, "bad id!", fee(1))).status).toBe(400);
  });

  it("says so when the table has not been seeded", async () => {
    deps.store = new MemoryStore();
    const res = await call("GET", "/api/admin/state");
    expect(res.status).toBe(503);
    expect((res.body as { code: string }).code).toBe("NOT_SEEDED");
  });
});

describe("route — commands", () => {
  it("returns the state with its private fields to an admin", async () => {
    const res = await call("GET", "/api/admin/state");
    const view = res.body as AdminView;
    expect(view.version).toBe(1);
    expect(view.private["athlete-1"].phone).toBe("0900000000");
    expect(view).not.toHaveProperty("recentRequests");
  });

  it("applies a command, bumps the version and publishes the snapshot", async () => {
    const res = await command(1, "req-1", fee(150000));
    const view = res.body as AdminView;
    expect(res.status).toBe(200);
    expect(view).toMatchObject({ version: 2, publishedVersion: 2, published: true });
    expect(view.document.info.feeVnd).toBe(150000);
    expect(published).toHaveLength(1);
    expect(JSON.parse(published[0]).info.feeVnd).toBe(150000);
    expect((await deps.store.read())!.publishedVersion).toBe(2);
  });

  it("never publishes a private field", async () => {
    await command(1, "req-1", { type: "confirmDraw", payload: { seed: "s1" } });
    for (const leak of ['"phone"', '"skillBand"', "0900000000", "ghi chú riêng"])
      expect(published[0]).not.toContain(leak);
  });

  it("applies a repeated request id once", async () => {
    await command(1, "req-1", fee(150000));
    // Same id again, as a double tap or a retry would send it.
    const again = await command(1, "req-1", fee(150000));
    expect(again.status).toBe(200);
    expect((again.body as AdminView).version).toBe(2);
    expect(await deps.store.history()).toHaveLength(2);
    expect(published).toHaveLength(1);
  });

  it("refuses a save from a stale version and changes nothing", async () => {
    await command(1, "req-1", fee(150000));
    const stale = await command(1, "req-2", fee(999));
    expect(stale.status).toBe(409);
    expect(stale.body).toEqual({
      code: "CONFLICT",
      message: "Dữ liệu vừa thay đổi — kiểm tra rồi lưu lại.",
    });
    expect((await deps.store.read())!.document.info.feeVnd).toBe(150000);
  });

  it("maps a domain refusal to 422 with a Vietnamese message", async () => {
    const res = await command(1, "req-1", {
      type: "setScore",
      payload: { matchId: "nope", score: { a: 21, b: 20 } },
    });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      code: "INVALID_SCORE",
      message: "Tỉ số không hợp lệ — mỗi séc tới 21, hơn 2 điểm, trần 25.",
    });
    expect((await deps.store.read())!.version).toBe(1);
  });

  it("keeps the save and reports it when publishing fails", async () => {
    deps.publish = async () => {
      throw new Error("S3 down");
    };
    const res = await command(1, "req-1", fee(150000));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      version: 2,
      publishedVersion: 0,
      published: false,
    });
    deps.publish = async (body) => void published.push(body);
    const retry = await call("POST", "/api/admin/publish", {});
    expect(retry.body).toMatchObject({ publishedVersion: 2, published: true });
    expect(published).toHaveLength(1);
  });
});

describe("route — draw preview, history, restore", () => {
  it("previews a draw without saving", async () => {
    const res = await call("POST", "/api/admin/draw/preview", { seed: "s1" });
    expect(Object.keys((res.body as { assignment: object }).assignment)).toHaveLength(16);
    expect((await deps.store.read())!.version).toBe(1);
  });

  it("lists history newest first with who and what", async () => {
    await command(1, "req-1", fee(150000));
    const res = await call("GET", "/api/admin/history");
    expect((res.body as { entries: unknown[] }).entries[0]).toEqual({
      version: 2,
      at: "2026-10-18T08:00:00+07:00",
      actorEmail: "btc@example.com",
      commandType: "updateInfo",
      requestId: "req-1",
    });
  });

  it("restores an earlier version as a new one", async () => {
    await command(1, "req-1", fee(150000));
    const res = await call("POST", "/api/admin/restore", {
      baseVersion: 2,
      requestId: "req-2",
      version: 1,
    });
    const view = res.body as AdminView;
    expect(view.version).toBe(3);
    expect(view.document.info.feeVnd).toBeNull();
    expect(view.document.updatedAt).toBe("2026-10-18T08:00:00+07:00");
    expect((await deps.store.history())[0].commandType).toBe("restore:1");
    expect(
      (
        await call("POST", "/api/admin/restore", {
          baseVersion: 3,
          requestId: "req-3",
          version: 99,
        })
      ).status,
    ).toBe(404);
  });
});

describe("route — team draw", () => {
  const roll = (athleteId: string) =>
    call("POST", "/api/team-draw", { athleteId }, null);
  const open = async () => {
    const v = (await call("GET", "/api/admin/state")).body as AdminView;
    await command(v.version, "open", {
      type: "setTeamDrawOpen",
      payload: { open: true },
    });
    return ((await call("GET", "/api/admin/state")).body as AdminView).document
      .athletes;
  };

  it("is refused while the organiser has not opened it", async () => {
    const res = await roll("a1");
    expect(res.status).toBe(422);
    expect((res.body as { code: string }).code).toBe("TEAM_DRAW_CLOSED");
  });

  it("needs no sign-in, records the team at once and publishes it", async () => {
    const [first] = await open();
    deps.random = () => 0.99;
    const res = await roll(first.id);
    expect(res).toEqual({
      status: 200,
      body: { athleteId: first.id, teamId: "blue" },
    });
    const state = (await call("GET", "/api/admin/state")).body as AdminView;
    expect(state.document.athletes[0].teamId).toBe("blue");
    expect(JSON.parse(published.at(-1)!).athletes[0].teamId).toBe("blue");
    expect(state.publishedVersion).toBe(state.version);
    const { entries } = (await call("GET", "/api/admin/history")).body as {
      entries: { actorEmail: string; commandType: string }[];
    };
    expect(entries[0]).toMatchObject({
      actorEmail: "tu-boc-tham",
      commandType: "teamDraw",
    });
  });

  it("never returns a level or any other private field", async () => {
    const [first] = await open();
    const res = await roll(first.id);
    expect(JSON.stringify(res.body)).not.toMatch(/skillBand|phone|note/);
  });

  it("refuses a second roll for the same athlete", async () => {
    const [first] = await open();
    expect((await roll(first.id)).status).toBe(200);
    const again = await roll(first.id);
    expect(again.status).toBe(422);
    expect((again.body as { code: string }).code).toBe("ALREADY_DRAWN");
  });

  it("rolls again when another save lands in between", async () => {
    const [first, second] = await open();
    const write = deps.store.write.bind(deps.store);
    let raced = false;
    deps.store.write = async (prev, next, entry) => {
      if (!raced) {
        raced = true;
        // Someone else's roll gets in first.
        await roll(second.id);
      }
      return write(prev, next, entry);
    };
    expect((await roll(first.id)).status).toBe(200);
    const { athletes } = ((await call("GET", "/api/admin/state")).body as AdminView)
      .document;
    expect(athletes[0].teamId).not.toBeNull();
    expect(athletes[1].teamId).not.toBeNull();
  });

  it("rejects a body without an athlete", async () => {
    await open();
    expect((await call("POST", "/api/team-draw", {}, null)).status).toBe(400);
  });
});

describe("route — two organisers scoring at once", () => {
  const save = (matchId: string, extra: Record<string, unknown> = {}) => ({
    type: "saveDuelMatch",
    payload: {
      matchId,
      pairRed: null,
      pairBlue: null,
      status: "pending",
      score: null,
      smashes: {},
      ...extra,
    },
  });
  const version = async () =>
    ((await call("GET", "/api/admin/state")).body as AdminView).version;
  const setUp = async () => {
    await command(await version(), "duel", { type: "createDuel", payload: {} });
    return version();
  };

  it("lets a stale save through when it is a different match", async () => {
    const seen = await setUp();
    // Court 1 saves first; court 2 still holds the older version.
    expect((await command(seen, "c1", save("vong-loai-1"))).status).toBe(200);
    const res = await command(seen, "c2", save("vong-loai-2"));
    expect(res.status).toBe(200);
    expect((res.body as AdminView).version).toBe(seen + 2);
  });

  it("still refuses a stale save of the same match", async () => {
    const seen = await setUp();
    const athletes = ((await call("GET", "/api/admin/state")).body as AdminView)
      .document.athletes;
    const men = athletes.filter((a) => a.gender === "male");
    // Put two men in each team so a pair can be saved.
    let v = seen;
    for (const [a, teamId] of [
      [men[0], "red"],
      [men[1], "red"],
      [men[2], "blue"],
      [men[3], "blue"],
    ] as const) {
      await command(v, `t-${a.id}`, {
        type: "setAthleteTeam",
        payload: { athleteId: a.id, teamId },
      });
      v = await version();
    }
    const pairs = {
      pairRed: [men[0].id, men[1].id],
      pairBlue: [men[2].id, men[3].id],
    };
    expect((await command(v, "first", save("vong-loai-1", pairs))).status).toBe(200);
    // The other screen saw the match empty and would wipe the pairs.
    const res = await command(v, "second", save("vong-loai-1"));
    expect(res.status).toBe(409);
  });

  it("keeps refusing every other stale command", async () => {
    const seen = await setUp();
    expect((await command(seen, "c1", save("vong-loai-1"))).status).toBe(200);
    expect((await command(seen, "fee", fee(1000))).status).toBe(409);
  });
});
