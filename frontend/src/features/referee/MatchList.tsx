import type {
  DuelMatch,
  TournamentDocument,
} from "../../../../packages/domain/src/schema";
import {
  DUEL_SIDES,
  DUEL_TEAMS,
  pairOf,
  type DuelSide,
} from "../../../../packages/domain/src/duel";
import { duelCategory, duelTitle } from "../duel/DuelBoard";

export const teamOf = (t: TournamentDocument, side: DuelSide) =>
  t.teams.find((x) => x.id === DUEL_TEAMS[side]);
export const nameOf = (t: TournamentDocument, id: string) =>
  t.athletes.find((a) => a.id === id)?.name ?? "?";
// The given name — the last word — is what people are called on court.
const shortName = (t: TournamentDocument, id: string) =>
  nameOf(t, id).trim().split(/\s+/).at(-1) ?? "?";
const ready = (m: DuelMatch) => m.pairRed !== null && m.pairBlue !== null;
// A final's title already names its category.
export const matchTitle = (m: DuelMatch, matches: DuelMatch[]) =>
  m.stage === "final"
    ? duelTitle(m, matches)
    : `${duelTitle(m, matches)} · ${duelCategory(m)}`;

const GROUPS = [
  { label: "Đang đánh", has: (m: DuelMatch) => m.status === "live" },
  {
    label: "Sẵn sàng",
    has: (m: DuelMatch) => m.status === "pending" && ready(m),
  },
  {
    label: "Chưa xếp cặp — BTC đang xếp",
    has: (m: DuelMatch) => m.status === "pending" && !ready(m),
  },
  { label: "Đã xong", has: (m: DuelMatch) => m.status === "done" },
] as const;

export function MatchList({
  t,
  onPick,
}: {
  t: TournamentDocument;
  onPick: (matchId: string) => void;
}) {
  const matches = t.duel?.matches ?? [];
  return (
    <div className="ref-wrap">
      <h1 className="ref-title">Chọn trận để chấm</h1>
      {GROUPS.map((group) => {
        const rows = matches.filter(group.has);
        if (rows.length === 0) return null;
        return (
          <section key={group.label} className="ref-group">
            <h2>{group.label}</h2>
            <ul className="ref-list">
              {rows.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="ref-match"
                    // A match without pairs is shown so the referee knows it
                    // exists and whom to ask, but there is nothing to score.
                    disabled={m.status === "pending" && !ready(m)}
                    onClick={() => onPick(m.id)}
                  >
                    <span className="ref-match__head">
                      <b>{matchTitle(m, matches)}</b>
                      {m.stage === "final" && (
                        <span className="ref-match__note">Điểm nhân đôi</span>
                      )}
                    </span>
                    {/* The group heading already says there are no pairs. */}
                    {DUEL_SIDES.filter(() => ready(m)).map((side) => {
                      const pair = pairOf(m, side);
                      return (
                        <span className="ref-match__side" key={side}>
                          <span
                            className="team-grid__swatch"
                            style={{ background: teamOf(t, side)?.color }}
                            aria-hidden="true"
                          />
                          <span className="ref-match__names">
                            {(pair ?? [])
                              .map((id) => shortName(t, id))
                              .join(" · ")}
                          </span>
                          {m.score && <b>{m.score[side]}</b>}
                        </span>
                      );
                    })}
                    {m.referee && (
                      <span className="ref-match__who">
                        Trọng tài: {m.referee}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
