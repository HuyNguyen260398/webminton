"use client";
import { useState } from "react";
import type { TournamentDocument } from "../../../../packages/domain/src/schema";
import { FEE_INCOME_ID } from "../../../../packages/domain/src/commands";
import { calculateFinance } from "../../../../packages/domain/src/finance";
import type { ReadyAdmin } from "../../lib/use-admin";
import { formatVnd } from "../../lib/format";
import { Card, Pill } from "../landing/primitives";
import { ConfirmButton, Field } from "./fields";

type Sponsor = TournamentDocument["sponsorships"][number];
type Income = TournamentDocument["finance"]["income"][number];
type Expense = TournamentDocument["finance"]["expenses"][number];

// text must be non-empty; note may be empty; money and number are whole
// numbers typed as digits; tier is the sponsor's manual rank override.
type Kind = "text" | "note" | "money" | "number" | "bool" | "tier";
interface FieldDef<T> {
  key: keyof T & string;
  label: string;
  kind: Kind;
}
const newId = (prefix: string) =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

function Lines<T extends { id: string }>({
  admin,
  title,
  noun,
  items,
  fields,
  blank,
  summary,
  onSave,
  onRemove,
}: {
  admin: ReadyAdmin;
  title: string;
  noun: string;
  items: T[];
  fields: FieldDef<T>[];
  blank: () => T;
  summary: (item: T) => string;
  onSave: (item: T) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<T | null>(null);
  const set = (key: keyof T, value: unknown) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  const stored = draft ? items.some((i) => i.id === draft.id) : false;
  const complete =
    draft !== null &&
    fields.every(
      (f) => f.kind !== "text" || String(draft[f.key] ?? "").trim() !== "",
    );

  const input = (d: T, f: FieldDef<T>) => {
    const value = d[f.key];
    if (f.kind === "bool")
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => set(f.key, e.target.checked)}
        />
      );
    if (f.kind === "tier")
      return (
        <select
          value={(value as string | null) ?? ""}
          onChange={(e) => set(f.key, e.target.value || null)}
        >
          <option value="">Tự xếp theo số tiền</option>
          <option value="diamond">Kim cương</option>
          <option value="platinum">Bạch kim</option>
          <option value="gold">Vàng</option>
        </select>
      );
    if (f.kind === "money" || f.kind === "number")
      return (
        <input
          inputMode="numeric"
          value={String(value ?? 0)}
          onChange={(e) =>
            set(f.key, Number(e.target.value.replace(/\D/g, "").slice(0, 12)))
          }
        />
      );
    return (
      <input
        value={String(value ?? "")}
        onChange={(e) => set(f.key, e.target.value)}
      />
    );
  };

  return (
    <Card title={title}>
      {items.length === 0 && <p>Chưa có {noun} nào.</p>}
      <ul className="pick-list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="pick-item"
              aria-pressed={draft?.id === item.id}
              onClick={() => setDraft(structuredClone(item))}
            >
              <span>{summary(item)}</span>
              <span>Sửa</span>
            </button>
          </li>
        ))}
      </ul>
      {draft ? (
        <div className="admin-stack">
          <div className="field-row">
            {fields.map((f) => (
              <Field key={f.key} label={f.label}>
                {input(draft, f)}
              </Field>
            ))}
          </div>
          <div className="row-actions">
            <button
              type="button"
              disabled={admin.busy || !complete}
              onClick={async () => {
                if (await onSave(draft)) setDraft(null);
              }}
            >
              Lưu {noun}
            </button>
            {stored && (
              <ConfirmButton
                label={`Xoá ${noun}`}
                disabled={admin.busy}
                onConfirm={async () => {
                  if (await onRemove(draft.id)) setDraft(null);
                }}
              />
            )}
            <button
              type="button"
              className="button--ghost"
              onClick={() => setDraft(null)}
            >
              Đóng
            </button>
          </div>
        </div>
      ) : (
        <div className="row-actions">
          <button
            type="button"
            className="button--ghost"
            onClick={() => setDraft(blank())}
          >
            Thêm {noun}
          </button>
        </div>
      )}
    </Card>
  );
}

// One tick per athlete who has paid. Each tick saves at once; the domain
// turns the count into the "Lệ phí tham gia" income line, so the totals above
// move with it. Who paid stays private — the public page sees only the sum.
function FeeCard({ admin }: { admin: ReadyAdmin }) {
  const { view, send, busy } = admin;
  const t = view.document;
  const fee = t.info.feeVnd;
  const paid = t.athletes.filter((a) => view.private[a.id]?.feePaid).length;
  return (
    <Card title="Lệ phí tham gia">
      <div className="pill-row">
        <Pill tone={paid === t.athletes.length ? "green" : "yellow"}>
          {paid}/{t.athletes.length} đã nộp
        </Pill>
        <Pill tone="outline">Đã thu {formatVnd(paid * (fee ?? 0))}</Pill>
      </div>
      <p>
        {fee === null
          ? "Chưa chốt lệ phí — đặt ở mục “Giải”. Tick trước cũng được, tiền sẽ tự cộng khi có con số."
          : `Mỗi người ${formatVnd(fee)}. Tick là cộng ngay vào quỹ giải, bỏ tick là trừ lại.`}
      </p>
      {t.athletes.length === 0 && <p>Chưa có VĐV nào.</p>}
      <ul className="pick-list">
        {t.athletes.map((a) => {
          const done = view.private[a.id]?.feePaid ?? false;
          return (
            <li key={a.id}>
              <label className="fee-row">
                <input
                  type="checkbox"
                  checked={done}
                  disabled={busy}
                  onChange={(e) =>
                    send(
                      {
                        type: "setFeePaid",
                        payload: { athleteId: a.id, paid: e.target.checked },
                      },
                      e.target.checked
                        ? `${a.name} đã nộp lệ phí.`
                        : `Đã bỏ tick lệ phí của ${a.name}.`,
                    )
                  }
                />
                <span>{a.name}</span>
                <small>{done ? "Đã nộp" : "Chưa nộp"}</small>
              </label>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export function FinanceTab({ admin }: { admin: ReadyAdmin }) {
  const { view, send, busy } = admin;
  const t = view.document;
  const totals = calculateFinance(t);
  const received = (ok: boolean) => (ok ? "" : " · chưa nhận");

  return (
    <div className="admin-stack">
      <Card title="Tổng quan">
        <p className="leaders">
          <span>Đã thu</span>
          <i />
          <b>{formatVnd(totals.receivedVnd)}</b>
        </p>
        <p className="leaders">
          <span>Đã chi</span>
          <i />
          <b>{formatVnd(totals.paidVnd)}</b>
        </p>
        <p className="leaders">
          <span>Còn lại</span>
          <i />
          <b>{formatVnd(totals.balanceVnd)}</b>
        </p>
        <Field label="Công bố thu chi trên trang giải">
          <input
            type="checkbox"
            checked={t.finance.published}
            disabled={busy}
            onChange={(e) =>
              send(
                {
                  type: "setFinancePublished",
                  payload: { published: e.target.checked },
                },
                e.target.checked ? "Đã công bố thu chi." : "Đã ẩn thu chi.",
              )
            }
          />
        </Field>
      </Card>

      <FeeCard admin={admin} />

      <Lines<Sponsor>
        admin={admin}
        title="Nhà tài trợ"
        noun="nhà tài trợ"
        items={t.sponsorships}
        fields={[
          { key: "name", label: "Nhà tài trợ", kind: "text" },
          { key: "amountVnd", label: "Số tiền (đồng)", kind: "money" },
          { key: "received", label: "Đã nhận", kind: "bool" },
          { key: "tierOverride", label: "Hạng", kind: "tier" },
          { key: "note", label: "Ghi chú", kind: "note" },
        ]}
        blank={() => ({
          id: newId("sp"),
          name: "",
          amountVnd: 0,
          received: false,
          note: "",
          tierOverride: null,
        })}
        summary={(s) =>
          `${s.name} · ${formatVnd(s.amountVnd)}${received(s.received)}`
        }
        onSave={(payload) => send({ type: "upsertSponsor", payload })}
        onRemove={(id) => send({ type: "removeSponsor", payload: { id } })}
      />

      <Lines<Income>
        admin={admin}
        title="Khoản thu"
        noun="khoản thu"
        // The fee line is kept by the ticks above, not edited by hand.
        items={t.finance.income.filter((i) => i.id !== FEE_INCOME_ID)}
        fields={[
          { key: "label", label: "Khoản thu", kind: "text" },
          { key: "amountVnd", label: "Số tiền (đồng)", kind: "money" },
          { key: "received", label: "Đã nhận", kind: "bool" },
        ]}
        blank={() => ({
          id: newId("in"),
          label: "",
          amountVnd: 0,
          received: false,
        })}
        summary={(i) =>
          `${i.label} · ${formatVnd(i.amountVnd)}${received(i.received)}`
        }
        onSave={(payload) => send({ type: "upsertIncome", payload })}
        onRemove={(id) => send({ type: "removeIncome", payload: { id } })}
      />

      <Lines<Expense>
        admin={admin}
        title="Khoản chi"
        noun="khoản chi"
        items={t.finance.expenses}
        fields={[
          { key: "label", label: "Khoản chi", kind: "text" },
          { key: "quantity", label: "Số lượng", kind: "number" },
          { key: "unitPriceVnd", label: "Đơn giá (đồng)", kind: "money" },
          { key: "paid", label: "Đã chi", kind: "bool" },
          { key: "note", label: "Ghi chú", kind: "note" },
        ]}
        blank={() => ({
          id: newId("ex"),
          label: "",
          quantity: 1,
          unitPriceVnd: 0,
          paid: false,
          note: "",
        })}
        summary={(e) =>
          `${e.label} · ${e.quantity} × ${formatVnd(e.unitPriceVnd)}${e.paid ? "" : " · chưa chi"}`
        }
        onSave={(payload) => send({ type: "upsertExpense", payload })}
        onRemove={(id) => send({ type: "removeExpense", payload: { id } })}
      />
    </div>
  );
}
