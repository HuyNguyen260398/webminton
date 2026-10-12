"use client";
import { useEffect, useState } from "react";
import type {
  DuelMatch,
  TournamentDocument,
} from "../../../../packages/domain/src/schema";
import {
  DUEL_SIDES,
  pairOf,
  type DuelSide,
} from "../../../../packages/domain/src/duel";
import { isFinalScore } from "../../../../packages/domain/src/score";
import type { RefereeError } from "../../lib/referee-api";
import { useMatchDraft, type SaveState } from "../../lib/use-referee";
import { matchTitle, nameOf, teamOf } from "./MatchList";

const SAVE: Record<SaveState, string> = {
  idle: "",
  saving: "Đang lưu…",
  saved: "Đã lưu",
  retrying: "Mất mạng — đang thử lại",
};
const SMASH = [
  { key: "hit", label: "Ăn điểm" },
  { key: "net", label: "Rúc lưới" },
] as const;
const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));

// A phone that dims mid-rally costs the referee a point. Where the browser
// allows it, keep the screen on for as long as the match is being played.
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const take = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (gone) void l.release();
          else lock = l;
        })
        .catch(() => {});
    };
    take();
    // The lock is dropped whenever the tab is hidden.
    document.addEventListener("visibilitychange", take);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", take);
      void lock?.release();
    };
  }, [on]);
}

export function MatchScorer({
  t,
  code,
  match,
  onBack,
  onRefused,
}: {
  t: TournamentDocument;
  code: string;
  match: DuelMatch;
  onBack: () => void;
  onRefused: (e: RefereeError) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const { draft, state, change } = useMatchDraft(
    code,
    match,
    t.updatedAt,
    (e) => {
      setMessage(e.message);
      onRefused(e);
    },
  );
  const live = draft.status === "live";
  useWakeLock(live);
  // Two taps to finish, as in the admin screen; it disarms itself.
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);

  const score = draft.score ?? { red: 0, blue: 0 };
  const final = isFinalScore({ a: score.red, b: score.blue });
  const edit = (next: typeof draft, now = false) => {
    setMessage(null);
    setArmed(false);
    change(next, now);
  };
  const point = (side: DuelSide, by: number) =>
    edit({ ...draft, score: { ...score, [side]: clamp(score[side] + by, 25) } });
  const smash = (id: string, key: "hit" | "net", by: number) => {
    const now = draft.smashes[id] ?? { hit: 0, net: 0 };
    edit({
      ...draft,
      smashes: { ...draft.smashes, [id]: { ...now, [key]: clamp(now[key] + by, 99) } },
    });
  };

  return (
    <div className="ref-wrap ref-scorer">
      <header className="ref-bar">
        <button type="button" className="ref-bar__back" onClick={onBack}>
          ← Trận khác
        </button>
        <span className="ref-bar__state" data-testid="save-state" aria-live="polite">
          {SAVE[state]}
        </span>
      </header>
      <h1 className="ref-title">
        {matchTitle(match, t.duel?.matches ?? [])}
        {match.stage === "final" && <small> · điểm nhân đôi</small>}
      </h1>
      {message && (
        <p role="alert" className="error">
          {message}
        </p>
      )}

      <div className="ref-score">
        {DUEL_SIDES.map((side) => (
          <div
            className="ref-side"
            key={side}
            style={{ background: teamOf(t, side)?.color }}
          >
            <span className="ref-side__team">{teamOf(t, side)?.name}</span>
            <span className="ref-side__pair">
              {(pairOf(match, side) ?? []).map((id) => (
                <span key={id}>{nameOf(t, id)}</span>
              ))}
            </span>
            {draft.status !== "pending" && (
              <strong className="ref-side__points" data-testid={`score-${side}`}>
                {score[side]}
              </strong>
            )}
            {live && (
              <>
                <button
                  type="button"
                  className="ref-plus"
                  data-testid={`plus-${side}`}
                  aria-label={`Cộng một điểm cho ${teamOf(t, side)?.name}`}
                  disabled={score[side] >= 25}
                  onClick={() => point(side, 1)}
                >
                  +1
                </button>
                <button
                  type="button"
                  className="ref-minus"
                  data-testid={`minus-${side}`}
                  aria-label={`Bớt một điểm của ${teamOf(t, side)?.name}`}
                  disabled={score[side] <= 0}
                  onClick={() => point(side, -1)}
                >
                  −1
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {draft.status === "pending" && (
        <button
          type="button"
          className="ref-main"
          onClick={() => edit({ ...draft, status: "live" }, true)}
        >
          Bắt đầu trận
        </button>
      )}

      {draft.status !== "pending" && (
        <section className="ref-smash">
          <h2>Đếm smash</h2>
          {DUEL_SIDES.flatMap((side) =>
            (pairOf(match, side) ?? []).map((id) => ({ id, side })),
          ).map(({ id, side }) => (
            <div className="ref-player" key={id}>
              <strong className="ref-player__name">
                <span
                  className="team-grid__swatch"
                  style={{ background: teamOf(t, side)?.color }}
                  aria-hidden="true"
                />
                {nameOf(t, id)}
              </strong>
              {SMASH.map(({ key, label }) => (
                <div className="ref-count" key={key}>
                  <small>{label}</small>
                  {live && (
                    <button
                      type="button"
                      data-testid={`smash-${id}-${key}-minus`}
                      aria-label={`Bớt smash ${label.toLowerCase()} của ${nameOf(t, id)}`}
                      onClick={() => smash(id, key, -1)}
                    >
                      −
                    </button>
                  )}
                  <b data-testid={`smash-${id}-${key}`}>
                    {draft.smashes[id]?.[key] ?? 0}
                  </b>
                  {live && (
                    <button
                      type="button"
                      data-testid={`smash-${id}-${key}-plus`}
                      aria-label={`Thêm smash ${label.toLowerCase()} của ${nameOf(t, id)}`}
                      onClick={() => smash(id, key, 1)}
                    >
                      +
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {live && (
        <>
          <button
            type="button"
            className="ref-main"
            disabled={!final}
            onClick={() => {
              if (!armed) return setArmed(true);
              edit({ ...draft, status: "done" }, true);
            }}
          >
            {armed
              ? `Bấm lần nữa: kết thúc ${score.red}–${score.blue}`
              : "Kết thúc trận"}
          </button>
          <small className="ref-hint">
            {final
              ? "Tỉ số hợp lệ. Kết thúc rồi thì chỉ BTC mở lại được."
              : "Kết thúc được khi tỉ số tới 21, hơn 2 điểm, trần 25."}
          </small>
        </>
      )}
      {draft.status === "done" && (
        <p className="ref-hint">Trận đã kết thúc — nhờ BTC mở lại nếu cần sửa.</p>
      )}
    </div>
  );
}
