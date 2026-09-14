"use client";
import { useCallback, useEffect, useState } from "react";
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

export function useTournament() {
  const [view, setView] = useState<TournamentView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    // Absolute: this path is what the CloudFront no-cache behaviour matches.
    fetch("/tournament.json", { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error("FETCH_FAILED");
        return r.json();
      })
      .then((raw) => setView(parseTournament(raw)))
      .catch((e: unknown) => {
        const code = e instanceof Error ? e.message : "FETCH_FAILED";
        setError(messages[code] ?? messages.FETCH_FAILED);
      });
  }, []);

  useEffect(load, [load]);
  return { view, error, reload: load };
}
