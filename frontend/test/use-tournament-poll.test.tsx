import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { POLL_MS, useTournament } from "../src/lib/use-tournament";
import { makeTournament } from "../../packages/domain/src/testing/fixtures";

const doc = (location: string) => {
  const t = makeTournament();
  t.info.location = location;
  return t;
};
let responses: (() => Promise<unknown>)[];
const ok = (body: unknown) => async () => ({ ok: true, json: async () => body });
const visibility = (state: "visible" | "hidden") =>
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
const flush = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  visibility("visible");
  responses = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(() => (responses.shift() ?? ok(doc("mặc định")))()),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useTournament polling", () => {
  it("picks up a new snapshot after 20 seconds without a reload", async () => {
    responses = [ok(doc("Sân A")), ok(doc("Sân B"))];
    const { result } = renderHook(() => useTournament());
    await flush();
    expect(result.current.view?.t.info.location).toBe("Sân A");
    await flush(POLL_MS);
    expect(result.current.view?.t.info.location).toBe("Sân B");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps the same view object when nothing changed", async () => {
    responses = [ok(doc("Sân A")), ok(doc("Sân A"))];
    const { result } = renderHook(() => useTournament());
    await flush();
    const first = result.current.view;
    await flush(POLL_MS);
    expect(result.current.view).toBe(first);
  });

  it("keeps the last good view when a poll fails or returns rubbish", async () => {
    responses = [
      ok(doc("Sân A")),
      async () => ({ ok: false, json: async () => ({}) }),
      ok({ nope: true }),
      async () => {
        throw new Error("offline");
      },
    ];
    const { result } = renderHook(() => useTournament());
    await flush();
    await flush(POLL_MS * 3);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(result.current.view?.t.info.location).toBe("Sân A");
    expect(result.current.error).toBeNull();
  });

  it("still reports an error when the very first load fails", async () => {
    responses = [async () => ({ ok: false, json: async () => ({}) })];
    const { result } = renderHook(() => useTournament());
    await flush();
    expect(result.current.error).toBe("Không tải được thông tin giải.");
  });

  it("does not poll a hidden tab, and refreshes when it comes back", async () => {
    const { result } = renderHook(() => useTournament());
    await flush();
    visibility("hidden");
    await flush(POLL_MS * 3);
    expect(fetch).toHaveBeenCalledTimes(1);
    responses = [ok(doc("Sân C"))];
    visibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.view?.t.info.location).toBe("Sân C");
  });
});
