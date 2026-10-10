// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MemoryStore, RECENT_REQUESTS } from "../src/store";
import { makeAdminState } from "../../packages/domain/src/testing/fixtures";

const entry = (requestId: string) => ({
  at: "2026-10-18T08:00:00+07:00",
  actorEmail: "btc@example.com",
  commandType: "seed",
  requestId,
});

describe("MemoryStore", () => {
  it("is empty until seeded, then counts versions from 1", async () => {
    const store = new MemoryStore();
    expect(await store.read()).toBeNull();
    const v1 = await store.write(null, makeAdminState(), entry("r1"));
    expect(v1).toMatchObject({ version: 1, publishedVersion: 0 });
    expect(v1.recentRequests).toEqual([{ requestId: "r1", version: 1 }]);
    const v2 = await store.write(v1, makeAdminState(), entry("r2"));
    expect(v2.version).toBe(2);
    expect((await store.read())!.version).toBe(2);
  });

  it("refuses a write based on a stale version", async () => {
    const store = new MemoryStore();
    const v1 = await store.write(null, makeAdminState(), entry("r1"));
    await store.write(v1, makeAdminState(), entry("r2"));
    await expect(
      store.write(v1, makeAdminState(), entry("r3")),
    ).rejects.toThrow("CONFLICT");
    await expect(
      store.write(null, makeAdminState(), entry("r4")),
    ).rejects.toThrow("CONFLICT");
  });

  it("keeps every version and lists history newest first", async () => {
    const store = new MemoryStore();
    const first = makeAdminState();
    first.document.info.location = "Sân cũ";
    let s = await store.write(null, first, entry("r1"));
    s = await store.write(s, makeAdminState(), entry("r2"));
    expect((await store.history()).map((h) => h.version)).toEqual([2, 1]);
    expect((await store.snapshot(1))!.document.info.location).toBe("Sân cũ");
    expect(await store.snapshot(9)).toBeNull();
  });

  it("round-trips Vietnamese text and returns copies, not references", async () => {
    const store = new MemoryStore();
    const state = makeAdminState();
    state.document.athletes[0].name = "Đỗ Thái Đãm";
    state.private["athlete-1"].note = "Dòng 1\nDòng 2 — ưu tiên đôi nam nữ";
    await store.write(null, state, entry("r1"));
    state.document.athletes[0].name = "mutated after write";
    const read = (await store.read())!;
    expect(read.document.athletes[0].name).toBe("Đỗ Thái Đãm");
    expect(read.private["athlete-1"].note).toBe(
      "Dòng 1\nDòng 2 — ưu tiên đôi nam nữ",
    );
  });

  it("only remembers the most recent request ids", async () => {
    const store = new MemoryStore();
    let s = await store.write(null, makeAdminState(), entry("r0"));
    for (let i = 1; i <= RECENT_REQUESTS; i++)
      s = await store.write(s, makeAdminState(), entry(`r${i}`));
    expect(s.recentRequests).toHaveLength(RECENT_REQUESTS);
    expect(s.recentRequests[0].requestId).toBe("r1");
  });

  it("records the published version without moving it backwards", async () => {
    const store = new MemoryStore();
    let s = await store.write(null, makeAdminState(), entry("r1"));
    s = await store.write(s, makeAdminState(), entry("r2"));
    await store.markPublished(2);
    await store.markPublished(1);
    expect((await store.read())!.publishedVersion).toBe(2);
  });
});
