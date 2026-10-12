import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { RefereeError } from "../src/lib/referee-api";
import {
  RETRY_MS,
  SAVE_DELAY_MS,
  SaveQueue,
  useMatchDraft,
  type SaveState,
} from "../src/lib/use-referee";
import { createDuelMatches } from "../../packages/domain/src/duel";
import type { DuelMatch } from "../../packages/domain/src/schema";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SaveQueue", () => {
  let sent: number[];
  let states: SaveState[];
  let refused: RefereeError[];
  let send: (v: number) => Promise<void>;
  const make = () =>
    new SaveQueue<number>(
      (v) => send(v),
      (s, e) => {
        states.push(s);
        if (e) refused.push(e);
      },
    );
  beforeEach(() => {
    sent = [];
    states = [];
    refused = [];
    send = async (v) => void sent.push(v);
  });

  it("sends a burst of taps as one save, half a second after the last", async () => {
    const q = make();
    q.push(1);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    q.push(2);
    q.push(3);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    expect(sent).toEqual([]);
    expect(q.unsaved).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([3]);
    expect(q.unsaved).toBe(false);
    expect(states).toEqual(["saving", "saved"]);
  });

  it("sends at once when told to", async () => {
    const q = make();
    q.push(1, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([1]);
  });

  it("sends one request at a time, then whatever was tapped meanwhile", async () => {
    let release = () => {};
    send = (v) => {
      sent.push(v);
      return new Promise<void>((r) => (release = r));
    };
    const q = make();
    q.push(1, true);
    await vi.advanceTimersByTimeAsync(0);
    q.push(2);
    q.push(3);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 4);
    expect(sent).toEqual([1]);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([1, 3]);
  });

  it("retries a save that did not get through, keeping the newest value", async () => {
    let online = false;
    send = async (v) => {
      if (!online) throw new RefereeError("NETWORK", "Mất mạng");
      sent.push(v);
    };
    const q = make();
    q.push(1, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toBe("retrying");
    expect(q.unsaved).toBe(true);
    q.push(2);
    online = true;
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(sent).toEqual([2]);
    expect(states.at(-1)).toBe("saved");
    expect(refused).toEqual([]);
  });

  it("stops and reports on a refusal", async () => {
    send = async () => {
      throw new RefereeError("REFEREE_CODE", "Mã trọng tài không đúng.");
    };
    const q = make();
    q.push(1, true);
    await vi.advanceTimersByTimeAsync(RETRY_MS * 3);
    expect(refused.map((e) => e.code)).toEqual(["REFEREE_CODE"]);
    expect(q.unsaved).toBe(false);
    expect(states.at(-1)).toBe("idle");
  });
});

describe("useMatchDraft", () => {
  // The hook remembers each match across visits, so every test gets its own.
  let id = "";
  let n = 0;
  beforeEach(() => {
    id = `tran-${++n}`;
  });
  const stored = (score: DuelMatch["score"]): DuelMatch => ({
    ...createDuelMatches()[0],
    id,
    pairRed: ["r1", "r2"],
    pairBlue: ["b1", "b2"],
    status: "live",
    score,
  });
  const T0 = "2026-10-18T01:00:00.000Z";
  const T1 = "2026-10-18T01:00:05.000Z";
  const T2 = "2026-10-18T01:00:30.000Z";
  const flush = (ms = 0) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  const setUp = () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init: RequestInit) => ({
        ok: true,
        status: 200,
        json: async () => ({
          match: JSON.parse(init.body as string),
          updatedAt: T1,
        }),
      })),
    );
    const onRefused = vi.fn();
    const hook = renderHook(
      ({ m, at }: { m: DuelMatch; at: string }) =>
        useMatchDraft("048213", m, at, onRefused),
      { initialProps: { m: stored({ red: 3, blue: 2 }), at: T0 } },
    );
    const tap = () =>
      act(() =>
        hook.result.current.change({
          ...hook.result.current.draft,
          score: { red: 4, blue: 2 },
        }),
      );
    return { ...hook, tap, onRefused };
  };

  it("shows a tap at once and saves it after the delay", async () => {
    const { result, tap } = setUp();
    tap();
    expect(result.current.draft.score).toEqual({ red: 4, blue: 2 });
    // Unsaved taps never sit under "Đã lưu".
    expect(result.current.state).toBe("saving");
    expect(fetch).not.toHaveBeenCalled();
    await flush(SAVE_DELAY_MS);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("saved");
  });

  it("does not let a poll overwrite a draft that is not saved yet", async () => {
    const { result, rerender, tap } = setUp();
    tap();
    rerender({ m: stored({ red: 3, blue: 2 }), at: T2 });
    expect(result.current.draft.score).toEqual({ red: 4, blue: 2 });
  });

  it("ignores a snapshot older than its own last save", async () => {
    const { result, rerender, tap } = setUp();
    tap();
    await flush(SAVE_DELAY_MS);
    // A poll that left before the save landed, arriving after it.
    rerender({ m: stored({ red: 3, blue: 2 }), at: "2026-10-18T01:00:01.000Z" });
    expect(result.current.draft.score).toEqual({ red: 4, blue: 2 });
  });

  it("takes the organiser's correction once it is newer and nothing is unsaved", async () => {
    const { result, rerender, tap } = setUp();
    tap();
    await flush(SAVE_DELAY_MS);
    rerender({ m: stored({ red: 2, blue: 2 }), at: T2 });
    expect(result.current.draft.score).toEqual({ red: 2, blue: 2 });
  });

  it("goes back to the stored match and reports when a save is refused", async () => {
    const { result, tap, onRefused } = setUp();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 422,
        json: async () => ({ code: "REFEREE_MATCH_DONE", message: "Trận đã kết thúc." }),
      })),
    );
    tap();
    await flush(SAVE_DELAY_MS);
    expect(onRefused).toHaveBeenCalledTimes(1);
    expect(onRefused.mock.calls[0][0].code).toBe("REFEREE_MATCH_DONE");
    expect(result.current.draft.score).toEqual({ red: 3, blue: 2 });
  });

  it("shows the last taps when the match is reopened before their save lands", async () => {
    const first = setUp();
    first.tap();
    // "← Trận khác" inside the half second, then straight back in.
    first.unmount();
    const again = renderHook(
      ({ at }: { at: string }) =>
        useMatchDraft("048213", stored({ red: 3, blue: 2 }), at, vi.fn()),
      { initialProps: { at: T0 } },
    );
    expect(again.result.current.draft.score).toEqual({ red: 4, blue: 2 });
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
    // The reload that left alongside the save comes back without it.
    again.rerender({ at: "2026-10-18T01:00:01.000Z" });
    expect(again.result.current.draft.score).toEqual({ red: 4, blue: 2 });
    // And a visit after the save has landed still starts from it.
    again.unmount();
    const third = renderHook(() =>
      useMatchDraft("048213", stored({ red: 3, blue: 2 }), T0, vi.fn()),
    );
    expect(third.result.current.draft.score).toEqual({ red: 4, blue: 2 });
  });

  it("has one queue per match: a save still retrying from an earlier visit sends the newest taps", async () => {
    const first = setUp();
    const bodies: { score: unknown }[] = [];
    let online = false;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init: RequestInit) => {
        if (!online) throw new TypeError("offline");
        bodies.push(JSON.parse(init.body as string));
        return { ok: true, status: 200, json: async () => ({ updatedAt: T1 }) };
      }),
    );
    first.tap();
    first.unmount();
    await flush();
    const again = renderHook(() =>
      useMatchDraft("048213", stored({ red: 3, blue: 2 }), T0, vi.fn()),
    );
    expect(again.result.current.state).toBe("saving");
    act(() =>
      again.result.current.change({
        ...again.result.current.draft,
        score: { red: 5, blue: 2 },
      }),
    );
    online = true;
    await flush(RETRY_MS);
    expect(bodies.map((b) => b.score)).toEqual([{ red: 5, blue: 2 }]);
    expect(again.result.current.state).toBe("saved");
  });

  it("sends what is unsaved when the screen is left", async () => {
    const { tap, unmount } = setUp();
    tap();
    unmount();
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
