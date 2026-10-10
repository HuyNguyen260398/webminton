"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Match,
  TournamentDocument,
} from "../../../../packages/domain/src/schema";
import { deriveTournament } from "../../../../packages/domain/src/derive";
import { findScheduleConflicts } from "../../../../packages/domain/src/schedule";
import type { Standing } from "../../../../packages/domain/src/standings";
import type { ReadyAdmin } from "../../lib/use-admin";
import { categoryNames } from "../../lib/format";
import { Card, Pill } from "../landing/primitives";
import { ConfirmButton, Field } from "./fields";
import { ScoreEntry } from "./ScoreEntry";
import { addMinutes, fromLocalInput, toLocalInput } from "./time";

const PHASES = {
  group: "Vòng loại",
  first_place: "Tranh Nhất – Nhì",
  third_place: "Tranh Ba – Khuyến khích",
} as const;
const finished = (m: Match) =>
  m.status === "completed" || m.status === "walkover";
const teamName = (t: TournamentDocument, id: string | null) =>
  t.teams.find((x) => x.id === id)?.name ?? "—";

function StatusPill({ m }: { m: Match }) {
  if (m.status === "completed" && m.score)
    return (
      <Pill tone="green">
        {m.score.a}–{m.score.b}
      </Pill>
    );
  if (m.status === "walkover" && m.score)
    return (
      <Pill tone="red">
        Xử thắng {m.score.a}–{m.score.b}
      </Pill>
    );
  if (m.status === "called") return <Pill tone="yellow">Đang gọi</Pill>;
  return <Pill tone="outline">Chờ</Pill>;
}

// Teams level on points for, wins and difference once the group stage is over.
function tieGroups(standings: Standing[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const r of standings.filter((r) => r.rank === null && r.played > 0)) {
    const key = `${r.pointsFor}/${r.wins}/${r.difference}`;
    groups.set(key, [...(groups.get(key) ?? []), r.teamId]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

function TieResolver({ admin, ids }: { admin: ReadyAdmin; ids: string[] }) {
  const t = admin.view.document;
  const [order, setOrder] = useState(ids);
  const [reason, setReason] = useState("Đối đầu trực tiếp");
  const up = (i: number) =>
    setOrder((o) => {
      const next = [...o];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  return (
    <Card title="Các đội đồng hạng — BTC xếp thứ tự">
      <ol className="pick-list">
        {order.map((id, i) => (
          <li key={id} className="admin-bar">
            <strong>
              {i + 1}. {teamName(t, id)}
            </strong>
            <span className="spacer" />
            <button
              type="button"
              className="button--ghost"
              disabled={i === 0}
              aria-label={`Đưa ${teamName(t, id)} lên trên`}
              onClick={() => up(i)}
            >
              ↑ Lên
            </button>
          </li>
        ))}
      </ol>
      <Field label="Lý do">
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="row-actions">
        <button
          type="button"
          disabled={admin.busy || !reason.trim()}
          onClick={() =>
            admin.send(
              {
                type: "resolveTie",
                payload: { tiedTeamIds: ids, orderedTeamIds: order, reason },
              },
              "Đã xếp hạng các đội đồng hạng.",
            )
          }
        >
          Lưu thứ tự
        </button>
      </div>
    </Card>
  );
}

function LineupEditor({ admin, match }: { admin: ReadyAdmin; match: Match }) {
  const t = admin.view.document;
  const [ids, setIds] = useState<string[]>([
    match.pairA?.[0] ?? "",
    match.pairA?.[1] ?? "",
    match.pairB?.[0] ?? "",
    match.pairB?.[1] ?? "",
  ]);
  const options = (teamId: string | null) =>
    t.athletes.filter((a) => a.teamId === teamId && a.active);
  const complete =
    ids.every(Boolean) && ids[0] !== ids[1] && ids[2] !== ids[3];
  const slot = (i: number, teamId: string | null, label: string) => (
    <Field label={label}>
      <select
        value={ids[i]}
        onChange={(e) =>
          setIds((cur) => cur.map((v, j) => (j === i ? e.target.value : v)))
        }
      >
        <option value="">— chọn —</option>
        {options(teamId).map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.gender === "male" ? "nam" : "nữ"})
          </option>
        ))}
      </select>
    </Field>
  );
  return (
    <Card title="Đội hình">
      {finished(match) && <p>Trận đã có kết quả nên đội hình bị khoá.</p>}
      <div className="field-row">
        {slot(0, match.teamAId, `${teamName(t, match.teamAId)} — VĐV 1`)}
        {slot(1, match.teamAId, `${teamName(t, match.teamAId)} — VĐV 2`)}
      </div>
      <div className="field-row">
        {slot(2, match.teamBId, `${teamName(t, match.teamBId)} — VĐV 1`)}
        {slot(3, match.teamBId, `${teamName(t, match.teamBId)} — VĐV 2`)}
      </div>
      <div className="row-actions">
        <button
          type="button"
          disabled={admin.busy || !complete || finished(match)}
          onClick={() =>
            admin.send(
              {
                type: "setLineup",
                payload: {
                  matchId: match.id,
                  pairA: [ids[0], ids[1]],
                  pairB: [ids[2], ids[3]],
                },
              },
              "Đã lưu đội hình.",
            )
          }
        >
          Lưu đội hình
        </button>
        <button
          type="button"
          className="button--ghost"
          disabled={admin.busy || (!match.lineupPublished && !match.pairA)}
          onClick={() =>
            admin.send(
              {
                type: "publishLineup",
                payload: {
                  matchId: match.id,
                  published: !match.lineupPublished,
                },
              },
              match.lineupPublished
                ? "Đã ẩn đội hình."
                : "Đã công bố đội hình.",
            )
          }
        >
          {match.lineupPublished ? "Ẩn đội hình" : "Công bố đội hình"}
        </button>
      </div>
      <small>
        {match.lineupPublished
          ? "Đội hình đang hiện trên trang giải."
          : "Đội hình chưa công bố — các đội chưa thấy cặp của đối thủ."}
      </small>
    </Card>
  );
}

function ScheduleEditor({
  admin,
  match,
  warnings,
}: {
  admin: ReadyAdmin;
  match: Match;
  warnings: string[];
}) {
  const t = admin.view.document;
  const [courtId, setCourtId] = useState(match.courtId ?? "");
  const [start, setStart] = useState(toLocalInput(match.startsAt));
  const [minutes, setMinutes] = useState(() =>
    match.startsAt && match.endsAt
      ? String(
          Math.round(
            (Date.parse(match.endsAt) - Date.parse(match.startsAt)) / 60_000,
          ),
        )
      : "20",
  );
  const startsAt = fromLocalInput(start);
  const length = /^\d{1,3}$/.test(minutes) ? Number(minutes) : 0;
  return (
    <Card title="Sân và giờ">
      <div className="field-row">
        <Field label="Sân">
          <select value={courtId} onChange={(e) => setCourtId(e.target.value)}>
            <option value="">— chưa xếp —</option>
            {t.courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Giờ bắt đầu">
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="Thời lượng (phút)">
          <input
            inputMode="numeric"
            value={minutes}
            onChange={(e) =>
              setMinutes(e.target.value.replace(/\D/g, "").slice(0, 3))
            }
          />
        </Field>
      </div>
      {warnings.map((w) => (
        <p key={w} className="notice notice--warn">
          {w}
        </p>
      ))}
      <div className="row-actions">
        <button
          type="button"
          disabled={admin.busy || (startsAt !== null && length === 0)}
          onClick={() =>
            admin.send(
              {
                type: "setSchedule",
                payload: {
                  matchId: match.id,
                  courtId: courtId || null,
                  startsAt,
                  endsAt: startsAt ? addMinutes(startsAt, length) : null,
                },
              },
              "Đã lưu sân và giờ.",
            )
          }
        >
          Lưu sân và giờ
        </button>
      </div>
    </Card>
  );
}

function MatchEditor({
  admin,
  match,
  warnings,
}: {
  admin: ReadyAdmin;
  match: Match;
  warnings: string[];
}) {
  const { send, busy } = admin;
  const t = admin.view.document;
  const nameA = teamName(t, match.teamAId);
  const nameB = teamName(t, match.teamBId);
  const done = finished(match);
  const id = { matchId: match.id };
  return (
    <div className="admin-stack">
      <Card title={`${PHASES[match.phase]} · ${categoryNames[match.category]}`}>
        <p>
          <strong>{nameA}</strong> gặp <strong>{nameB}</strong>
        </p>
        <ScoreEntry
          key={`${match.id}:${match.score?.a}-${match.score?.b}`}
          nameA={nameA}
          nameB={nameB}
          initial={match.score}
          disabled={busy}
          onSave={(score) =>
            send({ type: "setScore", payload: { ...id, score } }, "Đã lưu tỉ số.")
          }
        />
        <div className="row-actions">
          {match.status === "pending" && (
            <button
              type="button"
              className="button--ghost"
              disabled={busy}
              onClick={() =>
                send({ type: "callMatch", payload: id }, "Đã gọi trận.")
              }
            >
              Gọi trận
            </button>
          )}
          {match.status === "called" && (
            <button
              type="button"
              className="button--ghost"
              disabled={busy}
              onClick={() =>
                send({ type: "clearResult", payload: id }, "Đã huỷ gọi trận.")
              }
            >
              Huỷ gọi
            </button>
          )}
          {!done &&
            (["a", "b"] as const).map((side) => (
              <ConfirmButton
                key={side}
                label={`Xử thắng: ${side === "a" ? nameA : nameB} vắng`}
                disabled={busy}
                onConfirm={() =>
                  send(
                    { type: "setWalkover", payload: { ...id, absentSide: side } },
                    "Đã ghi xử thắng 21–0.",
                  )
                }
              />
            ))}
          {done && (
            <ConfirmButton
              label="Xoá kết quả"
              disabled={busy}
              onConfirm={() =>
                send({ type: "clearResult", payload: id }, "Đã xoá kết quả.")
              }
            />
          )}
        </div>
      </Card>
      <LineupEditor key={`lineup:${match.id}`} admin={admin} match={match} />
      <ScheduleEditor
        key={`schedule:${match.id}`}
        admin={admin}
        match={match}
        warnings={warnings}
      />
    </div>
  );
}

export function MatchesTab({ admin }: { admin: ReadyAdmin }) {
  const t = admin.view.document;
  const derived = useMemo(() => deriveTournament(t), [t]);
  const conflicts = useMemo(() => findScheduleConflicts(t.matches), [t]);
  const [selected, setSelected] = useState<string | null>(null);
  const editor = useRef<HTMLDivElement>(null);
  const match = t.matches.find((m) => m.id === selected) ?? null;

  // On a phone the editor sits below the whole list; bring it to the thumb.
  useEffect(() => {
    if (selected) editor.current?.scrollIntoView({ block: "start" });
  }, [selected]);

  if (!t.matches.length)
    return (
      <Card title="Chưa có trận đấu">
        <p>Bốc thăm ở mục “Đội” để tạo 18 trận vòng loại.</p>
      </Card>
    );

  const group = t.matches.filter((m) => m.phase === "group");
  const ties = group.every(finished) ? tieGroups(derived.standings) : [];
  const label = (m: Match) =>
    `${PHASES[m.phase]} · ${categoryNames[m.category]}: ${teamName(t, m.teamAId)} – ${teamName(t, m.teamBId)}`;
  const warnings = match
    ? conflicts
        .filter((c) => c.matchIds.includes(match.id))
        .map((c) => {
          const other = t.matches.find(
            (m) => m.id === c.matchIds.find((x) => x !== match.id),
          );
          return c.reason === "court"
            ? `Trùng sân với: ${other ? label(other) : "trận khác"}.`
            : `Có VĐV trùng giờ với: ${other ? label(other) : "trận khác"}.`;
        })
    : [];

  return (
    <div className="admin-split">
      <div className="admin-stack">
        {ties.map((ids) => (
          <TieResolver key={ids.join()} admin={admin} ids={ids} />
        ))}
        <ul className="pick-list">
          {[...t.matches]
            .sort((a, b) => a.order - b.order)
            .map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="pick-item"
                  data-match-id={m.id}
                  aria-pressed={m.id === selected}
                  onClick={() => setSelected(m.id)}
                >
                  <span>{label(m)}</span>
                  <StatusPill m={m} />
                </button>
              </li>
            ))}
        </ul>
      </div>
      <div ref={editor}>
        {match ? (
          <MatchEditor
            key={match.id}
            admin={admin}
            match={match}
            warnings={warnings}
          />
        ) : (
          <Card dashed>
            <p>Chọn một trận để nhập tỉ số, đội hình và sân.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
