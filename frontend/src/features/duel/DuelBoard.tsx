import type {
  DuelMatch,
  TournamentDocument,
} from "../../../../packages/domain/src/schema";
import {
  DUEL_SIDES,
  DUEL_TEAMS,
  pairOf,
  type DuelResults,
  type DuelSide,
  type SmashRow,
} from "../../../../packages/domain/src/duel";

export const duelCategory = (m: Pick<DuelMatch, "category">) =>
  m.category === "mixed_doubles" ? "Đôi nam nữ" : "Đôi nam";
export const duelTitle = (m: DuelMatch, matches: DuelMatch[]) =>
  m.stage === "final"
    ? `Chung kết ${duelCategory(m).toLocaleLowerCase("vi-VN")}`
    : `Trận ${matches.filter((x) => x.stage === "playoff").indexOf(m) + 1}`;
// Two courts: the matches go on in order two at a time, one lượt after
// another, the first of each lượt on sân 1 and the second on sân 2.
export function duelSlot(m: DuelMatch, matches: DuelMatch[]) {
  const i = [...matches].sort((a, b) => a.order - b.order).indexOf(m);
  return { round: Math.floor(i / 2) + 1, court: (i % 2) + 1 };
}
export const duelSlotLabel = (m: DuelMatch, matches: DuelMatch[]) => {
  const { round, court } = duelSlot(m, matches);
  return `Lượt ${round} · Sân ${court}`;
};
const STATUS = {
  pending: "Chưa đánh",
  live: "Đang đánh",
  done: "Đã xong",
} as const;

// The board calls players by their given name, the last word of a Vietnamese
// name, and adds the word before it only where two players share one.
export function shortNames(t: TournamentDocument): Map<string, string> {
  const words = new Map(t.athletes.map((a) => [a.id, a.name.trim().split(/\s+/)]));
  const count = new Map<string, number>();
  for (const w of words.values())
    count.set(w.at(-1)!, (count.get(w.at(-1)!) ?? 0) + 1);
  return new Map(
    [...words].map(([id, w]) => [
      id,
      w.slice(count.get(w.at(-1)!)! > 1 ? -2 : -1).join(" "),
    ]),
  );
}

const team = (t: TournamentDocument, side: DuelSide) =>
  t.teams.find((x) => x.id === DUEL_TEAMS[side]);

// The running total: every point scored so far, finals doubled.
export function DuelScoreboard({
  t,
  results,
}: {
  t: TournamentDocument;
  results: DuelResults;
}) {
  const total = t.duel?.matches.length ?? 0;
  return (
    <div className="duel-score" data-testid="duel-score">
      {DUEL_SIDES.map((side) => (
        <div
          key={side}
          className={`duel-score__side${results.leader === side ? " is-leading" : ""}`}
          style={{ background: team(t, side)?.color }}
        >
          <span className="duel-score__team">
            {team(t, side)?.name ?? side}
          </span>
          <strong className="duel-score__points">
            {results.totals[side].points}
          </strong>
          <span className="duel-score__wins">
            Thắng {results.totals[side].wins} trận
          </span>
        </div>
      ))}
      <p className="duel-score__note">
        {results.played === 0
          ? "Chưa đánh trận nào. Bảng điểm đang chờ quả cầu đầu tiên."
          : results.finished
            ? results.leader
              ? `Đã đánh đủ ${total} trận — ${team(t, results.leader)?.name} vô địch!`
              : `Đã đánh đủ ${total} trận mà vẫn hoà — ra sân đánh quả cầu vàng!`
            : `Đã đánh ${results.played}/${total} trận. Điểm chung kết nhân đôi.`}
      </p>
    </div>
  );
}

function Row({
  t,
  m,
  side,
  names,
}: {
  t: TournamentDocument;
  m: DuelMatch;
  side: DuelSide;
  names: Map<string, string>;
}) {
  const other = side === "red" ? "blue" : "red";
  const won =
    m.status === "done" && m.score !== null && m.score[side] > m.score[other];
  const pair = pairOf(m, side);
  return (
    <div className={`draw-row${won ? " is-winner" : ""}`}>
      <span
        className="draw-row__flag"
        style={{ background: team(t, side)?.color }}
        aria-hidden="true"
      />
      <span className="draw-row__who">
        <span className="draw-row__team">{team(t, side)?.name ?? side}</span>
        <small className="draw-row__pair">
          {pair
            ? pair
                .map((id) => names.get(id) ?? "?")
                .join(" · ")
            : "Chưa xếp cặp"}
        </small>
      </span>
      <span className="draw-row__score">
        {m.score ? m.score[side] : "—"}
      </span>
    </div>
  );
}

export function DuelMatchList({ t }: { t: TournamentDocument }) {
  const matches = t.duel?.matches ?? [];
  const names = shortNames(t);
  const stages = [
    { key: "playoff", label: "Vòng loại" },
    { key: "final", label: "Chung kết — điểm nhân đôi" },
  ] as const;
  return (
    <>
      {stages.map((stage) => (
        <div className="duel-stage" key={stage.key}>
          <h3 className="draw-stage">{stage.label}</h3>
          <div className="draw-grid duel-grid">
            {matches
              .filter((m) => m.stage === stage.key)
              .map((m) => (
                <div
                  className="draw-block duel-match"
                  key={m.id}
                  data-testid={`duel-${m.id}`}
                >
                  <div className="draw-tie">
                    <span className="draw-tie__label duel-match__head">
                      <span>
                        {duelTitle(m, matches)}
                        {m.stage === "playoff" && ` · ${duelCategory(m)}`}
                      </span>
                      <span
                        className={`duel-status duel-status--${m.status}`}
                      >
                        {STATUS[m.status]}
                      </span>
                    </span>
                    <b className="duel-match__slot">
                      {duelSlotLabel(m, matches)}
                    </b>
                    <Row t={t} m={m} side="red" names={names} />
                    <Row t={t} m={m} side="blue" names={names} />
                    {m.referee && m.status !== "pending" && (
                      <small className="duel-match__referee">
                        Trọng tài: {m.referee}
                      </small>
                    )}
                  </div>
                </div>
              ))}
          </div>
        </div>
      ))}
    </>
  );
}

function Leaders({
  t,
  title,
  blurb,
  rows,
  value,
}: {
  t: TournamentDocument;
  title: string;
  blurb: string;
  rows: SmashRow[];
  value: (r: SmashRow) => number;
}) {
  return (
    <div className="card">
      <h3>{title}</h3>
      <p className="muted">{blurb}</p>
      {rows.length === 0 ? (
        <p>Chưa ai ghi tên. Bảng này đang đợi người mở hàng.</p>
      ) : (
        <ol className="smash-list">
          {rows.map((r, i) => (
            <li key={r.athleteId} className={i === 0 ? "is-top" : undefined}>
              <span
                className="team-grid__swatch"
                style={{
                  background: t.teams.find((x) => x.id === r.teamId)?.color,
                }}
                aria-hidden="true"
              />
              <span className="smash-list__name">{r.name}</span>
              <b>{value(r)}</b>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

// The two individual titles, added up over every match an athlete played.
export function SmashLeaders({
  t,
  results,
}: {
  t: TournamentDocument;
  results: DuelResults;
}) {
  return (
    <div className="finance-grid">
      <Leaders
        t={t}
        title="MÁY ĐÓNG GẠCH"
        blurb="Đập một phát, ăn một điểm. Cái này để khoe."
        rows={results.smashHit}
        value={(r) => r.hit}
      />
      <Leaders
        t={t}
        title="VUA PHÁ LƯỚI"
        blurb="Đập rất mạnh, rất đẹp, và rất trúng lưới. Cái này để cả hội nhắc tới Tết."
        rows={results.smashNet}
        value={(r) => r.net}
      />
    </div>
  );
}
