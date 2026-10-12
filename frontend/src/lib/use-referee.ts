"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DuelMatch,
  RefereeSave,
} from "../../../packages/domain/src/schema";
import { RefereeError, saveMatch } from "./referee-api";

// What the referee's screen edits. `pending` only until "Bắt đầu trận".
export type Draft = Pick<DuelMatch, "status" | "score" | "smashes">;
export type SaveState = "idle" | "saving" | "saved" | "retrying";
export const SAVE_DELAY_MS = 500;
export const RETRY_MS = 2000;

const toDraft = (m: DuelMatch): Draft => ({
  status: m.status,
  score: m.score,
  smashes: m.smashes,
});

// Holds the newest value and sends it: a burst of taps becomes one request,
// one request runs at a time, and a save that did not get through is sent
// again — always the newest value, never a stale one.
export class SaveQueue<T> {
  private pending: { value: T } | null = null;
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private send: (value: T) => Promise<void>,
    private report: (state: SaveState, refused?: RefereeError) => void,
  ) {}

  get unsaved(): boolean {
    return this.pending !== null || this.busy;
  }

  push(value: T, now = false): void {
    this.pending = { value };
    this.arm(now ? 0 : SAVE_DELAY_MS);
  }

  // Send whatever is waiting, now.
  flush(): void {
    if (this.pending) this.arm(0);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private arm(ms: number): void {
    this.stop();
    this.timer = setTimeout(() => void this.run(), ms);
  }

  private async run(): Promise<void> {
    this.stop();
    if (this.busy || !this.pending) return;
    const { value } = this.pending;
    this.pending = null;
    this.busy = true;
    this.report("saving");
    try {
      await this.send(value);
      this.busy = false;
      if (this.pending) return void this.run();
      this.report("saved");
    } catch (e) {
      this.busy = false;
      if (e instanceof RefereeError && e.code === "NETWORK") {
        this.pending ??= { value };
        this.report("retrying");
        this.arm(RETRY_MS);
        return;
      }
      this.pending = null;
      this.stop();
      this.report(
        "idle",
        e instanceof RefereeError
          ? e
          : new RefereeError("UNKNOWN", "Không lưu được. Thử lại."),
      );
    }
  }
}

// The open match as the referee sees it. `match` and `updatedAt` come from
// the 20-second poll of tournament.json; they replace the draft only when
// nothing here is unsaved and the snapshot is not older than this screen's
// own last save — a poll that left before a save landed must not undo it.
export function useMatchDraft(
  code: string,
  match: DuelMatch,
  updatedAt: string,
  onRefused: (e: RefereeError) => void,
) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(match));
  const [state, setState] = useState<SaveState>("idle");
  const savedAt = useRef(0);
  const latest = useRef({ match, onRefused });
  useEffect(() => {
    latest.current = { match, onRefused };
  });

  const matchId = match.id;
  const queue = useMemo(
    () =>
      new SaveQueue<RefereeSave>(
        async (save) => {
          const res = await saveMatch(code, matchId, save);
          savedAt.current = Date.parse(res.updatedAt);
        },
        (next, refused) => {
          setState(next);
          if (!refused) return;
          setDraft(toDraft(latest.current.match));
          latest.current.onRefused(refused);
        },
      ),
    [code, matchId],
  );

  const server = JSON.stringify(toDraft(match));
  useEffect(() => {
    if (queue.unsaved || Date.parse(updatedAt) < savedAt.current) return;
    setDraft(JSON.parse(server) as Draft);
  }, [server, updatedAt, queue]);

  // Leaving the screen, or the phone locking, must not strand the last taps.
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden") queue.flush();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      queue.flush();
    };
  }, [queue]);

  const change = (next: Draft, now = false) => {
    setDraft(next);
    if (next.status === "pending") return;
    // Said at once: "Đã lưu" must never sit above taps that are not saved.
    setState("saving");
    queue.push(next as RefereeSave, now);
  };
  return { draft, state, change };
}
