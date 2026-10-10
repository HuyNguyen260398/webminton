"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  PublicTournamentSchema,
  type TournamentDocument,
} from "../../../packages/domain/src/schema";
import {
  deriveTournament,
  type DerivedResults,
} from "../../../packages/domain/src/derive";

export interface TournamentView {
  t: TournamentDocument;
  derived: DerivedResults;
}

// Pure, so it can be tested without a DOM or a network.
export function parseTournament(raw: unknown): TournamentView {
  const parsed = PublicTournamentSchema.safeParse(raw);
  if (!parsed.success) throw new Error("INVALID_DOCUMENT");
  return { t: parsed.data, derived: deriveTournament(parsed.data) };
}

const messages: Record<string, string> = {
  INVALID_DOCUMENT: "Dữ liệu giải không hợp lệ.",
  INVALID_SCORE: "Có tỉ số không hợp lệ trong dữ liệu giải.",
  INVALID_TEAM: "Có trận đấu thiếu thông tin đội.",
  INVALID_WALKOVER: "Trận xử thắng phải có tỉ số 21–0.",
  FETCH_FAILED: "Không tải được thông tin giải.",
};

// How often an open page re-reads the snapshot the admin API publishes.
export const POLL_MS = 20_000;

export function useTournament() {
  const [view, setView] = useState<TournamentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The last body rendered, so an unchanged poll does not re-render the page.
  const last = useRef<string | null>(null);

  const load = useCallback(() => {
    // Absolute: this path is what the CloudFront no-cache behaviour matches.
    fetch("/tournament.json", { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error("FETCH_FAILED");
        return r.json();
      })
      .then((raw) => {
        const body = JSON.stringify(raw);
        if (body === last.current) return;
        const next = parseTournament(raw);
        last.current = body;
        setError(null);
        setView(next);
      })
      .catch((e: unknown) => {
        // Mid-tournament a failed poll must not blank a page that works.
        if (last.current !== null) return;
        const code = e instanceof Error ? e.message : "FETCH_FAILED";
        setError(messages[code] ?? messages.FETCH_FAILED);
      });
  }, []);

  const reload = useCallback(() => {
    setError(null);
    load();
  }, [load]);

  useEffect(() => {
    load();
    const tick = () => {
      if (document.visibilityState === "visible") load();
    };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  return { view, error, reload };
}
