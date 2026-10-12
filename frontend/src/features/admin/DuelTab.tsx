"use client";
import { useEffect, useRef, useState } from "react";
import type {
  DuelMatch,
  TournamentDocument,
} from "../../../../packages/domain/src/schema";
import {
  DUEL_SIDES,
  DUEL_TEAMS,
  deriveDuel,
  type DuelSide,
} from "../../../../packages/domain/src/duel";
import { isFinalScore } from "../../../../packages/domain/src/score";
import type { ReadyAdmin } from "../../lib/use-admin";
import { Card, Pill } from "../landing/primitives";
import { duelCategory, duelTitle } from "../duel/DuelBoard";
import { ConfirmButton, Field } from "./fields";

type Slots = [string, string];
type Smashes = Record<string, { hit: number; net: number }>;

const STATUS = {
  pending: { label: "Chưa đánh", tone: "outline" },
  live: { label: "Đang đánh", tone: "yellow" },
  done: { label: "Đã xong", tone: "green" },
} as const;
const teamOf = (t: TournamentDocument, side: DuelSide) =>
  t.teams.find((x) => x.id === DUEL_TEAMS[side]);
const nameOf = (t: TournamentDocument, id: string) =>
  t.athletes.find((a) => a.id === id)?.name ?? "?";
// The given name — the last word of a Vietnamese name — is what people are
// called on court, and all that fits a row of the match list.
const shortName = (t: TournamentDocument, id: string) =>
  nameOf(t, id).trim().split(/\s+/).at(-1) ?? "?";
const digits = (v: string) => v.replace(/\D/g, "").slice(0, 2);

// − number +, for a score or a smash count. Big enough to hit courtside.
function Stepper({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number | null;
  max: number;
  onChange: (v: number | null) => void;
}) {
  const n = value ?? 0;
  return (
    <div className="stepper">
      <button
        type="button"
        aria-label={`Giảm ${label}`}
        onClick={() => onChange(Math.max(0, n - 1))}
      >
        −
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={value === null ? "" : String(value)}
        onChange={(e) => {
          const v = digits(e.target.value);
          onChange(v === "" ? null : Math.min(max, Number(v)));
        }}
      />
      <button
        type="button"
        aria-label={`Tăng ${label}`}
        onClick={() => onChange(Math.min(max, n + 1))}
      >
        +
      </button>
    </div>
  );
}

// Mounted with a key built from the stored match, so the fields reset when
// another match is picked or a save comes back.
function MatchEditor({
  admin,
  m,
  onClose,
}: {
  admin: ReadyAdmin;
  m: DuelMatch;
  onClose: () => void;
}) {
  const { view, send, busy } = admin;
  const t = view.document;
  const [slots, setSlots] = useState<Record<DuelSide, Slots>>({
    red: [m.pairRed?.[0] ?? "", m.pairRed?.[1] ?? ""],
    blue: [m.pairBlue?.[0] ?? "", m.pairBlue?.[1] ?? ""],
  });
  const [smashes, setSmashes] = useState<Smashes>(structuredClone(m.smashes));
  const [score, setScore] = useState<Record<DuelSide, number | null>>({
    red: m.score?.red ?? null,
    blue: m.score?.blue ?? null,
  });

  // Đôi nam nữ: the first seat is the man's, the second the woman's.
  const seatGender = (seat: 0 | 1) =>
    m.category === "mixed_doubles" && seat === 1 ? "female" : "male";
  const options = (side: DuelSide, seat: 0 | 1) =>
    t.athletes.filter(
      (a) =>
        a.active &&
        a.teamId === DUEL_TEAMS[side] &&
        a.gender === seatGender(seat) &&
        a.id !== slots[side][seat === 0 ? 1 : 0],
    );
  const pair = (side: DuelSide): [string, string] | null =>
    slots[side][0] && slots[side][1]
      ? [slots[side][0], slots[side][1]]
      : null;
  const half = DUEL_SIDES.some(
    (side) => Boolean(slots[side][0]) !== Boolean(slots[side][1]),
  );
  const both = pair("red") !== null && pair("blue") !== null;
  const players = DUEL_SIDES.flatMap((side) => pair(side) ?? []);
  const final =
    score.red !== null && score.blue !== null
      ? { red: score.red, blue: score.blue }
      : null;
  const valid =
    final !== null && isFinalScore({ a: final.red, b: final.blue });

  const save = (
    status: DuelMatch["status"],
    withScore: boolean,
    saved: string,
  ) =>
    send(
      {
        type: "saveDuelMatch",
        payload: {
          matchId: m.id,
          pairRed: pair("red"),
          pairBlue: pair("blue"),
          status,
          score: withScore ? final : null,
          smashes: Object.fromEntries(
            Object.entries(smashes).filter(([id]) => players.includes(id)),
          ),
        },
      },
      saved,
    );
  const bump = (id: string, key: "hit" | "net", v: number | null) =>
    setSmashes((s) => ({
      ...s,
      [id]: { ...(s[id] ?? { hit: 0, net: 0 }), [key]: v ?? 0 },
    }));

  const title = duelTitle(m, t.duel?.matches ?? []);
  return (
    <Card title={`${title} · ${duelCategory(m)}`}>
      <div className="admin-stack">
        <div className="pill-row">
          <Pill tone={STATUS[m.status].tone}>{STATUS[m.status].label}</Pill>
          {m.stage === "final" && <Pill tone="red">Điểm nhân đôi</Pill>}
        </div>

        {DUEL_SIDES.map((side) => (
          <fieldset className="duel-side" key={side}>
            <legend>
              <span
                className="team-grid__swatch"
                style={{ background: teamOf(t, side)?.color }}
                aria-hidden="true"
              />
              {teamOf(t, side)?.name}
            </legend>
            <div className="field-row">
              {([0, 1] as const).map((seat) => (
                <Field
                  key={seat}
                  label={`${teamOf(t, side)?.name} — ${
                    m.category === "mixed_doubles"
                      ? seat === 0
                        ? "nam"
                        : "nữ"
                      : `người ${seat + 1}`
                  }`}
                >
                  <select
                    value={slots[side][seat]}
                    disabled={busy}
                    onChange={(e) =>
                      setSlots((s) => {
                        const next: Slots = [...s[side]];
                        next[seat] = e.target.value;
                        return { ...s, [side]: next };
                      })
                    }
                  >
                    <option value="">— chọn —</option>
                    {options(side, seat).map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ))}
            </div>
          </fieldset>
        ))}
        {half && (
          <small>Mỗi đội chọn đủ hai người, hoặc để trống cả hai.</small>
        )}

        {both && (
          <>
            {m.status === "live" && (
              <small>
                Trận đang đánh: nếu trọng tài đang chấm trận này ở /trong-tai
                thì số smash và tỉ số sửa ở đây có thể bị điện thoại của trọng
                tài ghi đè ở lần bấm kế tiếp. Muốn sửa chắc chắn, đợi trọng tài
                kết thúc trận rồi sửa.
              </small>
            )}
            <h4 className="duel-heading">Đếm smash</h4>
            <div className="duel-smash">
              {players.map((id) => (
                <div className="duel-smash__player" key={id}>
                  <strong>{nameOf(t, id)}</strong>
                  <div>
                    <small>Ăn điểm</small>
                    <Stepper
                      label={`Smash ăn điểm của ${nameOf(t, id)}`}
                      value={smashes[id]?.hit ?? 0}
                      max={99}
                      onChange={(v) => bump(id, "hit", v)}
                    />
                  </div>
                  <div>
                    <small>Rúc lưới</small>
                    <Stepper
                      label={`Smash rúc lưới của ${nameOf(t, id)}`}
                      value={smashes[id]?.net ?? 0}
                      max={99}
                      onChange={(v) => bump(id, "net", v)}
                    />
                  </div>
                </div>
              ))}
            </div>

            <h4 className="duel-heading">Tỉ số chung cuộc</h4>
            <div className="score-entry">
              {DUEL_SIDES.map((side) => (
                <div key={side}>
                  <strong>{teamOf(t, side)?.name}</strong>
                  <Stepper
                    label={`Điểm ${teamOf(t, side)?.name}`}
                    value={score[side]}
                    max={25}
                    onChange={(v) => setScore((s) => ({ ...s, [side]: v }))}
                  />
                </div>
              ))}
            </div>
            <small aria-live="polite">
              {final === null
                ? "Trọng tài chấm từng điểm ở /trong-tai, hoặc nhập điểm của hai đội khi trận kết thúc."
                : valid
                  ? "Tỉ số hợp lệ."
                  : "Chưa hợp lệ: séc tới 21, hơn 2 điểm, trần 25."}
            </small>
          </>
        )}

        <div className="row-actions">
          {m.status === "done" ? (
            <>
              <button
                type="button"
                disabled={busy || half || !both || !valid}
                onClick={() => save("done", true, "Đã lưu chỉnh sửa.")}
              >
                Lưu chỉnh sửa
              </button>
              <ConfirmButton
                label="Mở lại trận"
                disabled={busy}
                onConfirm={() =>
                  save("live", true, "Đã mở lại trận — tỉ số được giữ để sửa.")
                }
              />
            </>
          ) : (
            <>
              <button
                type="button"
                className="button--ghost"
                disabled={busy || half || (m.status === "live" && !both)}
                onClick={() =>
                  save(
                    m.status,
                    // A referee may be scoring this match: keep the running
                    // score rather than send it back empty.
                    m.status === "live",
                    m.status === "live" ? "Đã lưu số smash." : "Đã lưu cặp.",
                  )
                }
              >
                {m.status === "live" ? "Lưu số smash" : "Lưu cặp"}
              </button>
              {m.status === "pending" && (
                <button
                  type="button"
                  disabled={busy || half || !both}
                  onClick={() =>
                    save("live", false, "Đã gọi trận — cặp đấu đã hiện.")
                  }
                >
                  Bắt đầu trận
                </button>
              )}
              <button
                type="button"
                disabled={busy || half || !both || !valid}
                onClick={() => save("done", true, "Đã lưu kết quả trận.")}
              >
                Kết thúc trận
              </button>
            </>
          )}
          <button type="button" className="button--ghost" onClick={onClose}>
            Đóng
          </button>
        </div>
      </div>
    </Card>
  );
}

// Six digits from the browser's own generator. applyCommand stays pure.
const newCode = () =>
  String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(
    6,
    "0",
  );

function RefereeCard({ admin }: { admin: ReadyAdmin }) {
  const { view, send, busy } = admin;
  const code = view.secrets?.refereeCode ?? null;
  const open = view.document.referee?.open ?? false;
  const [link, setLink] = useState("/trong-tai/");
  const [copied, setCopied] = useState(false);
  useEffect(() => setLink(`${location.origin}/trong-tai/`), []);
  const setCode = () =>
    send(
      { type: "setRefereeCode", payload: { code: newCode() } },
      "Đã tạo mã trọng tài mới.",
    );
  return (
    <Card title="Trọng tài">
      <div className="admin-stack">
        <p>
          Trọng tài mở trang dưới đây trên điện thoại, nhập mã rồi tự bắt đầu
          trận, chấm từng điểm và đếm smash. Cặp đấu vẫn do BTC xếp ở đây.
        </p>
        <div className="pill-row">
          <Pill tone={open ? "green" : "outline"}>
            {open ? "Đang mở" : "Đang đóng"}
          </Pill>
        </div>
        <p className="referee-code" data-testid="referee-code">
          {code ?? "Chưa có mã"}
        </p>
        <div className="row-actions">
          {code ? (
            <ConfirmButton label="Đổi mã" disabled={busy} onConfirm={setCode} />
          ) : (
            <button type="button" disabled={busy} onClick={setCode}>
              Tạo mã
            </button>
          )}
          <button
            type="button"
            className={open ? "button--ghost" : undefined}
            disabled={busy || !code}
            onClick={() =>
              send(
                { type: "setRefereeOpen", payload: { open: !open } },
                open
                  ? "Đã đóng chấm điểm cho trọng tài."
                  : "Đã mở chấm điểm cho trọng tài.",
              )
            }
          >
            {open ? "Đóng chấm điểm" : "Mở chấm điểm"}
          </button>
        </div>
        <small>
          Đổi mã là khoá mọi điện thoại đang dùng mã cũ. Đóng chấm điểm là
          chặn mọi trọng tài cho tới khi mở lại.
        </small>
        <div className="row-actions">
          <code className="referee-link">{link}</code>
          <button
            type="button"
            className="button--ghost"
            onClick={() =>
              navigator.clipboard
                ?.writeText(link)
                .then(() => setCopied(true))
                .catch(() => {})
            }
          >
            {copied ? "Đã chép" : "Chép link"}
          </button>
        </div>
      </div>
    </Card>
  );
}

export function DuelTab({ admin }: { admin: ReadyAdmin }) {
  const { view, send, busy } = admin;
  const t = view.document;
  const results = deriveDuel(t);
  const matches = t.duel?.matches ?? [];
  const [selected, setSelected] = useState<string | null>(null);
  const form = useRef<HTMLDivElement>(null);
  // On a phone the editor sits below the whole list; bring it to the thumb.
  useEffect(() => {
    if (selected) form.current?.scrollIntoView({ block: "start" });
  }, [selected]);
  const current = matches.find((m) => m.id === selected) ?? null;

  if (!results)
    return (
      <Card title="Bảng đấu 2 đội">
        <p>
          11 trận giữa Đội Đỏ và Đội Xanh: 9 trận vòng loại (7 đôi nam, 2 đôi
          nam nữ) và 2 trận chung kết nhân đôi điểm. Tạo xong thì xếp cặp,
          nhập tỉ số và đếm smash cho từng trận ở đây.
        </p>
        <div className="row-actions">
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              send({ type: "createDuel", payload: {} }, "Đã tạo 11 trận.")
            }
          >
            Tạo 11 trận
          </button>
        </div>
      </Card>
    );

  return (
    <div className="admin-split">
      <div className="admin-stack">
        <Card title="Tổng điểm">
          <div className="duel-total">
            {DUEL_SIDES.map((side) => (
              <div key={side} style={{ background: teamOf(t, side)?.color }}>
                <span>{teamOf(t, side)?.name}</span>
                <strong>{results.totals[side].points}</strong>
                <span>Thắng {results.totals[side].wins}</span>
              </div>
            ))}
          </div>
          <small>
            Đã đánh {results.played}/{matches.length} trận. Điểm chung kết
            nhân đôi.
          </small>
        </Card>

        <RefereeCard admin={admin} />

        <ul className="pick-list">
          {matches.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="pick-item"
                aria-pressed={m.id === selected}
                onClick={() => setSelected(m.id)}
              >
                <span className="pick-item__lines">
                  <b>
                    {duelTitle(m, matches)} · {duelCategory(m)}
                  </b>
                  {DUEL_SIDES.map((side) => {
                    const pair = side === "red" ? m.pairRed : m.pairBlue;
                    return (
                      <span className="duel-line" key={side}>
                        <span
                          className="team-grid__swatch"
                          style={{ background: teamOf(t, side)?.color }}
                          aria-hidden="true"
                        />
                        <span className="duel-line__names">
                          {pair
                            ? pair.map((id) => shortName(t, id)).join(" · ")
                            : "Chưa xếp cặp"}
                        </span>
                        {m.score && <b>{m.score[side]}</b>}
                      </span>
                    );
                  })}
                </span>
                <Pill tone={STATUS[m.status].tone}>
                  {STATUS[m.status].label}
                </Pill>
              </button>
            </li>
          ))}
        </ul>

        <Card title="Ai đánh mấy trận">
          <p>
            Thể lệ: mỗi người 3 trận tính cả chung kết, mỗi người tối đa một
            trận chung kết. Bảng này chỉ để nhắc, không chặn.
          </p>
          {DUEL_SIDES.map((side) => (
            <div key={side} className="duel-count">
              <strong>{teamOf(t, side)?.name}</strong>
              <ul>
                {t.athletes
                  .filter((a) => a.active && a.teamId === DUEL_TEAMS[side])
                  .map((a) => {
                    const n = results.appearances[a.id] ?? {
                      matches: 0,
                      finals: 0,
                    };
                    return (
                      <li key={a.id}>
                        <span>{a.name}</span>
                        <b>
                          {n.matches} trận
                          {n.finals > 0 && ` · ${n.finals} CK`}
                        </b>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </Card>

        <Card title="Xoá bảng đấu" dashed>
          <p>
            Xoá cả 11 trận cùng cặp đấu, tỉ số và số smash. Khôi phục được ở
            mục “Lịch sử”.
          </p>
          <div className="row-actions">
            <ConfirmButton
              label="Xoá bảng đấu"
              disabled={busy}
              onConfirm={async () => {
                if (
                  await send(
                    { type: "resetDuel", payload: {} },
                    "Đã xoá bảng đấu.",
                  )
                )
                  setSelected(null);
              }}
            />
          </div>
        </Card>
      </div>

      <div ref={form}>
        {current ? (
          <MatchEditor
            key={`${current.id}:${JSON.stringify(current)}`}
            admin={admin}
            m={current}
            onClose={() => setSelected(null)}
          />
        ) : (
          <Card dashed>
            <p>Chọn một trận để xếp cặp, đếm smash và nhập tỉ số.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
