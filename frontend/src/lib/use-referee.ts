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
    // Whoever is on screen. The queue outlives a visit to the match.
    public report: (state: SaveState, refused?: RefereeError) => void,
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

// What this phone last made of each match, and when the server last confirmed
// a save of it. Kept outside the component because a referee leaves a match
// and comes straight back: the screen they return to must start from their
// own taps, not from a snapshot fetched before those were saved.
const known = new Map<string, { draft: Draft; at: number }>();
// One queue per match for as long as the page lives, so a save still being
// retried from an earlier visit and the taps of this one cannot race.
const queues = new Map<string, SaveQueue<RefereeSave>>();

function queueFor(code: string, matchId: string): SaveQueue<RefereeSave> {
  const key = `${code}:${matchId}`;
  let queue = queues.get(key);
  if (!queue) {
    queue = new SaveQueue<RefereeSave>(
      async (save) => {
        try {
          const res = await saveMatch(code, matchId, save);
          const mine = known.get(matchId);
          if (mine) mine.at = Date.parse(res.updatedAt);
        } catch (e) {
          // Refused: what this phone thought it had is not what is stored.
          if (!(e instanceof RefereeError && e.code === "NETWORK"))
            known.delete(matchId);
          throw e;
        }
      },
      () => {},
    );
    queues.set(key, queue);
  }
  return queue;
}

// The open match as the referee sees it. `match` and `updatedAt` come from
// the 20-second poll of tournament.json; they replace the draft only when
// nothing here is unsaved and the snapshot is not older than this phone's
// own last save — a poll that left before a save landed must not undo it.
export function useMatchDraft(
  code: string,
  match: DuelMatch,
  updatedAt: string,
  onRefused: (e: RefereeError) => void,
) {
  const matchId = match.id;
  const queue = useMemo(() => queueFor(code, matchId), [code, matchId]);
  const [draft, setDraft] = useState<Draft>(() => {
    const mine = known.get(matchId);
    return mine && (queue.unsaved || mine.at >= Date.parse(updatedAt))
      ? mine.draft
      : toDraft(match);
  });
  const [state, setState] = useState<SaveState>(() =>
    queue.unsaved ? "saving" : "idle",
  );
  const latest = useRef({ match, onRefused });
  useEffect(() => {
    latest.current = { match, onRefused };
  });

  const server = JSON.stringify(toDraft(match));
  useEffect(() => {
    const savedAt = known.get(matchId)?.at ?? 0;
    if (queue.unsaved || Date.parse(updatedAt) < savedAt) return;
    setDraft(JSON.parse(server) as Draft);
  }, [server, updatedAt, queue, matchId]);

  useEffect(() => {
    queue.report = (next, refused) => {
      setState(next);
      if (!refused) return;
      setDraft(toDraft(latest.current.match));
      latest.current.onRefused(refused);
    };
    // Leaving the screen, or the phone locking, must not strand the last taps.
    const hidden = () => {
      if (document.visibilityState === "hidden") queue.flush();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      queue.report = () => {};
      queue.flush();
    };
  }, [queue]);

  const change = (next: Draft, now = false) => {
    setDraft(next);
    if (next.status === "pending") return;
    known.set(matchId, { draft: next, at: known.get(matchId)?.at ?? 0 });
    // Said at once: "Đã lưu" must never sit above taps that are not saved.
    setState("saving");
    queue.push(next as RefereeSave, now);
  };
  return { draft, state, change };
}
