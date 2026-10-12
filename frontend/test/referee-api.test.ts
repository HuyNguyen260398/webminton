import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RefereeError,
  checkCode,
  forgetCode,
  readCode,
  saveMatch,
  storeCode,
} from "../src/lib/referee-api";

const reply = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })),
  );
const failure = async (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error("resolved");
    },
    (e: unknown) => e as RefereeError,
  );
const save = { status: "live", score: null, smashes: {} } as const;

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("referee API", () => {
  it("posts the code with the match", async () => {
    reply(200, { match: { id: "vong-loai-1" }, updatedAt: "2026-10-18T01:00:00.000Z" });
    const res = await saveMatch("048213", "vong-loai-1", save);
    expect(res.updatedAt).toBe("2026-10-18T01:00:00.000Z");
    const [path, init] = vi.mocked(fetch).mock.calls[0];
    expect(path).toBe("/api/referee/match");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      code: "048213",
      matchId: "vong-loai-1",
      ...save,
    });
  });

  it("carries the API's code and Vietnamese message on a refusal", async () => {
    reply(401, { code: "REFEREE_CODE", message: "Mã trọng tài không đúng." });
    const e = await failure(checkCode("000000"));
    expect(e).toBeInstanceOf(RefereeError);
    expect(e.code).toBe("REFEREE_CODE");
    expect(e.message).toBe("Mã trọng tài không đúng.");
  });

  it("treats a dropped connection, a throttle and a server error as try-again", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    expect((await failure(saveMatch("048213", "m", save))).code).toBe("NETWORK");
    for (const status of [429, 500, 502, 503]) {
      reply(status, { message: "Too Many Requests" });
      expect((await failure(saveMatch("048213", "m", save))).code).toBe("NETWORK");
    }
  });

  it("remembers the code on this phone", () => {
    expect(readCode()).toBeNull();
    storeCode("048213");
    expect(readCode()).toBe("048213");
    forgetCode();
    expect(readCode()).toBeNull();
  });

  it("works without storage, asking again next time", () => {
    const broken = () => {
      throw new DOMException("denied", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(broken);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(broken);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(broken);
    expect(() => storeCode("048213")).not.toThrow();
    expect(readCode()).toBeNull();
    expect(() => forgetCode()).not.toThrow();
    vi.restoreAllMocks();
  });
});
