// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createLocalApi, LOCAL_ADMIN } from "../local-api";
import { MemoryStore } from "../../backend/src/store";
import { makeAdminState } from "../../packages/domain/src/testing/fixtures";

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
    expect(await api.snapshot()).toBeNull();
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
    expect(JSON.parse((await api.snapshot())!).matches[0].score).toEqual({ a: 21, b: 15 });
    expect((await api.handle("POST", "/api/test/reset", null, undefined)).status).toBe(200);
    expect(await api.snapshot()).toBeNull();
    const view = (await api.handle("GET", "/api/admin/state", null, AUTH)).body as {
      version: number;
    };
    expect(view.version).toBe(1);
  });

  // `pnpm dev:cloud` hands in the real table. Seeding or resetting it would
  // replace the live tournament.
  describe("over a cloud target", () => {
    async function cloudApi() {
      const store = new MemoryStore();
      const published: string[] = [];
      await store.write(null, makeAdminState(), {
        at: "2026-10-11T00:00:00.000Z",
        actorEmail: "seed",
        commandType: "seed",
        requestId: "seed",
      });
      const api = createLocalApi({
        store,
        publish: async (body) => void published.push(body),
      });
      return { api, store, published };
    }

    it("never seeds or resets the table", async () => {
      const { api, store } = await cloudApi();
      await api.reset();
      expect((await store.read())!.version).toBe(1);
      expect((await store.history()).map((h) => h.commandType)).toEqual(["seed"]);
      expect(
        (await api.handle("POST", "/api/test/reset", null, undefined)).status,
      ).not.toBe(200);
      expect((await store.read())!.version).toBe(1);
    });

    it("saves through the given store and publisher", async () => {
      const { api, store, published } = await cloudApi();
      const body = JSON.stringify({
        baseVersion: 1,
        requestId: "r1",
        command: { type: "updateInfo", payload: { slogan: "Thử" } },
      });
      const res = await api.handle("POST", "/api/admin/commands", body, AUTH);
      expect(res.status).toBe(200);
      expect((await store.read())!.version).toBe(2);
      expect(published).toHaveLength(1);
      expect(JSON.parse((await api.snapshot())!).info.slogan).toBe("Thử");
    });
  });
});
