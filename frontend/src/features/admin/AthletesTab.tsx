"use client";
import { useEffect, useRef, useState } from "react";
import type { Athlete } from "../../../../packages/domain/src/schema";
import type { ReadyAdmin } from "../../lib/use-admin";
import { Card, Pill } from "../landing/primitives";
import { ConfirmButton, Field } from "./fields";

const NEW = "__new__";

// One colour per level. Black and outline are kept for "Thiếu trình độ" and
// "Nghỉ", and the label carries the level for anyone who cannot tell the
// colours apart.
const SKILL = {
  1: { label: "mạnh", tone: "red" },
  2: { label: "khá", tone: "green" },
  3: { label: "mới chơi", tone: "yellow" },
} as const;

function SkillPill({ band }: { band: 1 | 2 | 3 }) {
  return (
    <Pill tone={SKILL[band].tone}>
      {band} · {SKILL[band].label}
    </Pill>
  );
}

function AthleteForm({
  admin,
  athlete,
  onDone,
}: {
  admin: ReadyAdmin;
  athlete: Athlete | null;
  onDone: () => void;
}) {
  const { view, send, busy } = admin;
  const priv = athlete ? view.private[athlete.id] : undefined;
  const [name, setName] = useState(athlete?.name ?? "");
  const [gender, setGender] = useState<"male" | "female">(
    athlete?.gender ?? "male",
  );
  const [active, setActive] = useState(athlete?.active ?? true);
  const [skill, setSkill] = useState(String(priv?.skillBand ?? ""));
  const [phone, setPhone] = useState(priv?.phone ?? "");
  const [note, setNote] = useState(priv?.note ?? "");

  return (
    <Card title={athlete ? `Sửa: ${athlete.name}` : "VĐV mới"}>
      <div className="admin-stack">
        <Field label="Họ và tên">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="field-row">
          <Field label="Giới tính">
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as "male" | "female")}
            >
              <option value="male">Nam</option>
              <option value="female">Nữ</option>
            </select>
          </Field>
          <Field label="Trình độ">
            <select value={skill} onChange={(e) => setSkill(e.target.value)}>
              <option value="">— chưa xếp —</option>
              {([1, 2, 3] as const).map((band) => (
                <option key={band} value={band}>
                  {band} — {SKILL[band].label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Đang thi đấu">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
          </Field>
        </div>
        <Field label="Số điện thoại">
          <input
            inputMode="tel"
            maxLength={30}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field label="Ghi chú riêng">
          <textarea
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <small>
          Trình độ, số điện thoại và ghi chú chỉ BTC thấy — không bao giờ lên
          trang giải.
        </small>
      </div>
      <div className="row-actions">
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={async () => {
            const ok = await send(
              {
                type: "upsertAthlete",
                payload: {
                  id: athlete?.id ?? null,
                  name: name.trim(),
                  gender,
                  active,
                  skillBand: skill ? (Number(skill) as 1 | 2 | 3) : null,
                  phone: phone.trim() || null,
                  note,
                },
              },
              "Đã lưu VĐV.",
            );
            if (ok) onDone();
          }}
        >
          Lưu VĐV
        </button>
        {athlete && (
          <ConfirmButton
            label="Xoá VĐV"
            disabled={busy}
            onConfirm={async () => {
              const ok = await send(
                { type: "removeAthlete", payload: { id: athlete.id } },
                "Đã xoá VĐV.",
              );
              if (ok) onDone();
            }}
          />
        )}
        <button type="button" className="button--ghost" onClick={onDone}>
          Đóng
        </button>
      </div>
    </Card>
  );
}

export function AthletesTab({ admin }: { admin: ReadyAdmin }) {
  const { view } = admin;
  const t = view.document;
  const [selected, setSelected] = useState<string | null>(null);
  const form = useRef<HTMLDivElement>(null);
  // On a phone the form sits below the whole list; bring it to the thumb.
  useEffect(() => {
    if (selected) form.current?.scrollIntoView({ block: "start" });
  }, [selected]);
  const athlete = t.athletes.find((a) => a.id === selected) ?? null;
  const men = t.athletes.filter((a) => a.gender === "male").length;
  const teamName = (id: string | null) =>
    t.teams.find((x) => x.id === id)?.name ?? "chưa xếp đội";

  return (
    <div className="admin-split">
      <div className="admin-stack">
        <div className="admin-bar">
          <strong>
            {t.athletes.length} VĐV · {men} nam · {t.athletes.length - men} nữ
          </strong>
          <span className="spacer" />
          <button type="button" onClick={() => setSelected(NEW)}>
            Thêm VĐV
          </button>
        </div>
        <ul className="pick-list">
          {t.athletes.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="pick-item"
                aria-pressed={a.id === selected}
                onClick={() => setSelected(a.id)}
              >
                <span className="pick-item__lines">
                  <b>{a.name}</b>
                  <span>{a.gender === "male" ? "Nam" : "Nữ"}</span>
                  <span>{teamName(a.teamId)}</span>
                </span>
                {!a.active ? (
                  <Pill tone="outline">Nghỉ</Pill>
                ) : (view.private[a.id]?.skillBand ?? null) === null ? (
                  <Pill tone="black">Thiếu trình độ</Pill>
                ) : (
                  <SkillPill band={view.private[a.id]!.skillBand!} />
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div ref={form}>
        {selected === NEW || athlete ? (
          <AthleteForm
            key={selected}
            admin={admin}
            athlete={athlete}
            onDone={() => setSelected(null)}
          />
        ) : (
          <Card dashed>
            <p>Chọn một VĐV để sửa, hoặc bấm “Thêm VĐV”.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
