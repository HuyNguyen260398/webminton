// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createLocalApi, LOCAL_ADMIN } from "../local-api";

const AUTH = `Bearer test:${LOCAL_ADMIN}`;

describe("local API", () => {
  it("starts with a drawn tournament and nothing published", async () => {
    const api = createLocalApi();
    await api.reset();
    const res = await api.handle("GET", "/api/admin/state", null, AUTH);
    const view = res.body as { document: { matches: unknown[]; courts: unknown[] } };
    expect(res.status).toBe(200);
    expect(view.document.matches).toHaveLength(18);
    expect(view.document.courts).toHaveLength(2);
    expect(api.snapshot()).toBeNull();
  });

  it("offers the dev login and enforces the allow-list", async () => {
    const api = createLocalApi();
    await api.reset();
    expect((await api.handle("GET", "/api/config", null, undefined)).body).toEqual({
      cognitoDomain: null,
      clientId: null,
      devLogin: true,
    });
    expect((await api.handle("GET", "/api/admin/state", null, undefined)).status).toBe(401);
    expect(
      (await api.handle("GET", "/api/admin/state", null, "Bearer test:la@example.com"))
        .status,
    ).toBe(403);
  });

  it("publishes on save and forgets everything on reset", async () => {
    const api = createLocalApi();
    await api.reset();
    const body = JSON.stringify({
      baseVersion: 1,
      requestId: "r1",
      command: {
        type: "setScore",
        payload: { matchId: "group-red-blue-mens_doubles", score: { a: 21, b: 15 } },
      },
    });
    expect((await api.handle("POST", "/api/admin/commands", body, AUTH)).status).toBe(200);
    expect(JSON.parse(api.snapshot()!).matches[0].score).toEqual({ a: 21, b: 15 });
    expect((await api.handle("POST", "/api/test/reset", null, undefined)).status).toBe(200);
    expect(api.snapshot()).toBeNull();
    const view = (await api.handle("GET", "/api/admin/state", null, AUTH)).body as {
      version: number;
    };
    expect(view.version).toBe(1);
  });
});
