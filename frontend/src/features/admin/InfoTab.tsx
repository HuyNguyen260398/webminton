"use client";
import { useState } from "react";
import type { ReadyAdmin } from "../../lib/use-admin";
import { Card, Pill } from "../landing/primitives";
import { Field } from "./fields";
import { fromLocalInput, toLocalInput } from "./time";

const orNull = (v: string) => (v.trim() === "" ? null : v.trim());

// The same kind of switch as the team draw's: one tap, no form to save.
// Closing keeps the link, so reopening is one tap too.
function RegistrationSwitch({ admin }: { admin: ReadyAdmin }) {
  const { send, busy } = admin;
  const { registrationFormUrl, registrationOpen } = admin.view.document.info;
  const open = registrationOpen !== false;
  return (
    <Card title="Đăng ký thi đấu">
      <div className="admin-stack">
        <div className="pill-row">
          <Pill tone={registrationFormUrl && open ? "green" : "outline"}>
            {!registrationFormUrl
              ? "Chưa có link form"
              : open
                ? "Đang mở"
                : "Đã đóng"}
          </Pill>
        </div>
        <p>
          Khi đóng, mục “ĐĂNG KÝ THI ĐẤU” biến khỏi trang giải và thanh điều
          hướng. Link form vẫn được giữ, mở lại là hiện ngay.
        </p>
        <div className="row-actions">
          <button
            type="button"
            className={open ? "button--ghost" : undefined}
            disabled={busy || !registrationFormUrl}
            onClick={() =>
              send(
                { type: "updateInfo", payload: { registrationOpen: !open } },
                open ? "Đã đóng đăng ký." : "Đã mở đăng ký.",
              )
            }
          >
            {open ? "Đóng đăng ký" : "Mở đăng ký"}
          </button>
        </div>
      </div>
    </Card>
  );
}

// Starting the giải moves BẢNG ĐẤU and SMASH OF THE DAY to the top of the public
// page. It changes nothing else: refereeing, registration and the team draw
// keep their own switches.
function StartSwitch({ admin }: { admin: ReadyAdmin }) {
  const { send, busy } = admin;
  const { info, duel } = admin.view.document;
  const hasDuel = (duel?.matches.length ?? 0) > 0;
  const started = info.started === true;
  return (
    <Card title="Bắt đầu giải">
      <div className="admin-stack">
        <div className="pill-row">
          <Pill tone={started && hasDuel ? "green" : "outline"}>
            {!hasDuel
              ? "Chưa có bảng đấu"
              : started
                ? "Đang thi đấu"
                : "Chưa bắt đầu"}
          </Pill>
        </div>
        <p>
          Khi giải bắt đầu, “BẢNG ĐẤU” và “SMASH OF THE DAY” được đưa lên đầu trang
          giải để người xem theo dõi trận và tỉ số. Dừng thì hai mục về lại
          chỗ cũ.
        </p>
        <div className="row-actions">
          <button
            type="button"
            className={started ? "button--ghost" : undefined}
            disabled={busy || (!hasDuel && !started)}
            onClick={() =>
              send(
                { type: "updateInfo", payload: { started: !started } },
                started ? "Đã dừng giải." : "Đã bắt đầu giải.",
              )
            }
          >
            {started ? "Dừng giải" : "Bắt đầu giải"}
          </button>
        </div>
      </div>
    </Card>
  );
}

function InfoForm({ admin }: { admin: ReadyAdmin }) {
  const { send, busy } = admin;
  const info = admin.view.document.info;
  const [f, setF] = useState({
    name: info.name,
    clubName: info.clubName,
    slogan: info.slogan,
    location: info.location,
    dateLabel: info.dateLabel,
    startsAt: toLocalInput(info.startsAt),
    registrationDeadline: toLocalInput(info.registrationDeadline),
    registrationFormUrl: info.registrationFormUrl ?? "",
    feeVnd: info.feeVnd === null ? "" : String(info.feeVnd),
    contactName: info.contactName ?? "",
    contactPhone: info.contactPhone ?? "",
    zaloUrl: info.zaloUrl ?? "",
    qrAssetPath: info.qrAssetPath ?? "",
    qrPublished: info.qrPublished,
  });
  const text = (key: keyof typeof f, label: string, type = "text") => (
    <Field label={label}>
      <input
        type={type}
        value={String(f[key])}
        onChange={(e) => setF((cur) => ({ ...cur, [key]: e.target.value }))}
      />
    </Field>
  );
  const required = [f.name, f.clubName, f.slogan, f.location, f.dateLabel];

  return (
    <Card title="Thông tin giải">
      <div className="admin-stack">
        {text("name", "Tên giải")}
        {text("clubName", "Câu lạc bộ")}
        {text("slogan", "Khẩu hiệu")}
        <div className="field-row">
          {text("location", "Địa điểm")}
          {text("dateLabel", "Dòng ngày giờ trên poster")}
        </div>
        <div className="field-row">
          {text("startsAt", "Giờ khai mạc", "datetime-local")}
          {text("registrationDeadline", "Hạn đăng ký", "datetime-local")}
          <Field label="Lệ phí (đồng)">
            <input
              inputMode="numeric"
              value={f.feeVnd}
              onChange={(e) =>
                setF((cur) => ({
                  ...cur,
                  feeVnd: e.target.value.replace(/\D/g, "").slice(0, 9),
                }))
              }
            />
          </Field>
        </div>
        {text("registrationFormUrl", "Link form đăng ký", "url")}
        <div className="field-row">
          {text("contactName", "Người liên hệ")}
          {text("contactPhone", "Số điện thoại liên hệ (hiện công khai)")}
        </div>
        {text("zaloUrl", "Link nhóm Zalo", "url")}
        <div className="field-row">
          {text("qrAssetPath", "Đường dẫn ảnh QR")}
          <Field label="Hiện mã QR trên trang giải">
            <input
              type="checkbox"
              checked={f.qrPublished}
              onChange={(e) =>
                setF((cur) => ({ ...cur, qrPublished: e.target.checked }))
              }
            />
          </Field>
        </div>
      </div>
      <div className="row-actions">
        <button
          type="button"
          disabled={busy || required.some((v) => !v.trim())}
          onClick={() =>
            send(
              {
                type: "updateInfo",
                payload: {
                  name: f.name.trim(),
                  clubName: f.clubName.trim(),
                  slogan: f.slogan.trim(),
                  location: f.location.trim(),
                  dateLabel: f.dateLabel.trim(),
                  startsAt: fromLocalInput(f.startsAt),
                  registrationDeadline: fromLocalInput(f.registrationDeadline),
                  registrationFormUrl: orNull(f.registrationFormUrl),
                  feeVnd: f.feeVnd === "" ? null : Number(f.feeVnd),
                  contactName: orNull(f.contactName),
                  contactPhone: orNull(f.contactPhone),
                  zaloUrl: orNull(f.zaloUrl),
                  qrAssetPath: orNull(f.qrAssetPath),
                  qrPublished: f.qrPublished,
                },
              },
              "Đã lưu thông tin giải.",
            )
          }
        >
          Lưu thông tin
        </button>
      </div>
    </Card>
  );
}

function CourtsForm({ admin }: { admin: ReadyAdmin }) {
  const { send, busy } = admin;
  const [courts, setCourts] = useState(admin.view.document.courts);
  const nextId = () => {
    const n =
      Math.max(0, ...courts.map((c) => Number(/^san-(\d+)$/.exec(c.id)?.[1] ?? 0))) +
      1;
    return `san-${n}`;
  };
  return (
    <Card title="Sân thi đấu">
      <div className="admin-stack">
        {courts.map((c, i) => (
          <div key={c.id} className="field-row">
            <Field label={`Tên sân ${i + 1}`}>
              <input
                value={c.name}
                onChange={(e) =>
                  setCourts((cur) =>
                    cur.map((x) =>
                      x.id === c.id ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
              />
            </Field>
            <button
              type="button"
              className="button--ghost"
              onClick={() => setCourts((cur) => cur.filter((x) => x.id !== c.id))}
            >
              Bỏ sân này
            </button>
          </div>
        ))}
      </div>
      <div className="row-actions">
        <button
          type="button"
          className="button--ghost"
          onClick={() =>
            setCourts((cur) => [
              ...cur,
              { id: nextId(), name: `Sân ${cur.length + 1}` },
            ])
          }
        >
          Thêm sân
        </button>
        <button
          type="button"
          disabled={busy || courts.some((c) => !c.name.trim())}
          onClick={() =>
            send(
              {
                type: "setCourts",
                payload: {
                  courts: courts.map((c) => ({ ...c, name: c.name.trim() })),
                },
              },
              "Đã lưu danh sách sân.",
            )
          }
        >
          Lưu sân
        </button>
      </div>
    </Card>
  );
}

export function InfoTab({ admin }: { admin: ReadyAdmin }) {
  // Keyed on the version so a restore or a conflict reload refills the forms.
  const v = admin.view.version;
  return (
    <div className="admin-stack">
      <StartSwitch admin={admin} />
      <RegistrationSwitch admin={admin} />
      <InfoForm key={`info:${v}`} admin={admin} />
      <CourtsForm key={`courts:${v}`} admin={admin} />
    </div>
  );
}
