"use client";
import { useEffect, useState } from "react";
import type { Team } from "../../../../packages/domain/src/schema";
import type { ReadyAdmin } from "../../lib/use-admin";
import { Card, Pill } from "../landing/primitives";
import { ConfirmButton, Field } from "./fields";

interface Preview {
  seed: string;
  assignment: Record<string, string>;
}

function DrawPanel({ admin }: { admin: ReadyAdmin }) {
  const { view, send, query, busy } = admin;
  const t = view.document;
  const confirmed = t.draw.status === "confirmed";
  const started = t.matches.some((m) => m.status !== "pending");
  const active = t.athletes.filter((a) => a.active);
  const men = active.filter((a) => a.gender === "male").length;
  const women = active.length - men;
  const noSkill = active.filter(
    (a) => (view.private[a.id]?.skillBand ?? null) === null,
  ).length;
  const eligible = men >= 8 && women >= 8 && noSkill === 0;

  const [seed, setSeed] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  // Generated after mount so the server-rendered HTML and the client agree.
  useEffect(() => {
    setSeed((s) => s || `mua-2026-${Math.random().toString(36).slice(2, 6)}`);
  }, []);

  if (started)
    return (
      <Card title="Bốc thăm">
        <p>Đã có trận được gọi hoặc đánh — không bốc thăm lại được.</p>
      </Card>
    );

  return (
    <Card title="Bốc thăm chia đội">
      <div className="pill-row">
        <Pill tone={men >= 8 ? "green" : "red"}>{men} nam</Pill>
        <Pill tone={women >= 8 ? "green" : "red"}>{women} nữ</Pill>
        <Pill tone={noSkill === 0 ? "green" : "red"}>
          {noSkill} VĐV chưa có trình độ
        </Pill>
      </div>
      {!eligible && (
        <p>
          Cần tối thiểu 8 nam và 8 nữ đang thi đấu, ai cũng có trình độ 1–3.
          Bổ sung ở mục “VĐV”.
        </p>
      )}

      {confirmed ? (
        <>
          <p>Đã bốc thăm. Chưa trận nào được gọi nên vẫn bốc lại được.</p>
          <div className="row-actions">
            <ConfirmButton
              label="Bốc lại từ đầu"
              disabled={busy}
              onConfirm={() =>
                send(
                  { type: "resetDraw", payload: {} },
                  "Đã xoá kết quả bốc thăm.",
                )
              }
            />
          </div>
        </>
      ) : (
        <>
          <Field label="Mã bốc thăm">
            <input
              value={seed}
              onChange={(e) => {
                setSeed(e.target.value);
                setPreview(null);
              }}
            />
          </Field>
          <small>
            Cùng một mã luôn cho cùng một kết quả. Xem trước chỉ mình bạn thấy.
          </small>
          <div className="row-actions">
            <button
              type="button"
              className="button--ghost"
              disabled={busy || !seed.trim()}
              onClick={async () =>
                setPreview(
                  await query<Preview>("/api/admin/draw/preview", {
                    seed: seed.trim(),
                  }),
                )
              }
            >
              Xem trước
            </button>
            {preview && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const ok = await send(
                    { type: "confirmDraw", payload: { seed: preview.seed } },
                    "Đã bốc thăm và tạo 18 trận vòng loại.",
                  );
                  if (ok) setPreview(null);
                }}
              >
                Xác nhận bốc thăm này
              </button>
            )}
          </div>
          {preview && (
            <div className="team-grid draw-preview">
              {t.teams.map((team) => (
                <div key={team.id}>
                  <strong>{team.name}</strong>
                  <ul>
                    {t.athletes
                      .filter((a) => preview.assignment[a.id] === team.id)
                      .map((a) => (
                        <li key={a.id}>{a.name}</li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function TeamCard({ admin, team }: { admin: ReadyAdmin; team: Team }) {
  const { view, send, busy } = admin;
  const t = view.document;
  const members = t.athletes.filter((a) => a.teamId === team.id);
  const [name, setName] = useState(team.name);
  const [color, setColor] = useState(team.color);
  const [captainId, setCaptainId] = useState(team.captainId ?? "");
  return (
    <Card title={team.name}>
      <div className="field-row">
        <Field label={`Tên ${team.name}`}>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Màu">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </Field>
        <Field label="Đội trưởng">
          <select
            value={captainId}
            onChange={(e) => setCaptainId(e.target.value)}
          >
            <option value="">— chưa có —</option>
            {members.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="row-actions">
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() =>
            send(
              {
                type: "updateTeam",
                payload: {
                  teamId: team.id,
                  name: name.trim(),
                  color,
                  captainId: captainId || null,
                },
              },
              "Đã lưu đội.",
            )
          }
        >
          Lưu đội
        </button>
      </div>
      <MemberList admin={admin} ids={members.map((a) => a.id)} />
    </Card>
  );
}

// One row per athlete with a team picker; changing it saves straight away.
function MemberList({ admin, ids }: { admin: ReadyAdmin; ids: string[] }) {
  const { view, send, busy } = admin;
  const t = view.document;
  if (!ids.length) return <p>Chưa có VĐV.</p>;
  return (
    <ul className="pick-list">
      {ids.map((id) => {
        const a = t.athletes.find((x) => x.id === id)!;
        return (
          <li key={id} className="field-row">
            <span>
              {a.name} · {a.gender === "male" ? "nam" : "nữ"}
              {!a.active && " · nghỉ"}
            </span>
            <select
              aria-label={`Đội của ${a.name}`}
              value={a.teamId ?? ""}
              disabled={busy}
              onChange={(e) =>
                send(
                  {
                    type: "setAthleteTeam",
                    payload: { athleteId: id, teamId: e.target.value || null },
                  },
                  `Đã chuyển ${a.name}.`,
                )
              }
            >
              <option value="">— chưa xếp đội —</option>
              {t.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </li>
        );
      })}
    </ul>
  );
}

export function TeamsTab({ admin }: { admin: ReadyAdmin }) {
  const t = admin.view.document;
  const unassigned = t.athletes.filter((a) => a.teamId === null);
  return (
    <div className="admin-stack">
      <DrawPanel admin={admin} />
      <div className="team-grid">
        {t.teams.map((team) => (
          // Remount when the stored team changes so the fields show it.
          <TeamCard
            key={`${team.id}:${team.name}:${team.color}:${team.captainId}`}
            admin={admin}
            team={team}
          />
        ))}
      </div>
      {t.draw.status === "confirmed" && unassigned.length > 0 && (
        <Card title="Chưa xếp đội" dashed>
          <MemberList admin={admin} ids={unassigned.map((a) => a.id)} />
        </Card>
      )}
    </div>
  );
}
