"use client";
import { useState } from "react";
import type { Score } from "../../../../packages/domain/src/schema";
import { isFinalScore } from "../../../../packages/domain/src/score";

const toNumber = (v: string) => (/^\d{1,2}$/.test(v) ? Number(v) : null);

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const n = toNumber(value) ?? 0;
  return (
    <div className="stepper">
      <button
        type="button"
        aria-label={`Giảm ${label}`}
        onClick={() => onChange(String(Math.max(0, n - 1)))}
      >
        −
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={value}
        // Phone keyboards can still produce "-", "." or a pasted string.
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
      />
      <button
        type="button"
        aria-label={`Tăng ${label}`}
        onClick={() => onChange(String(Math.min(25, n + 1)))}
      >
        +
      </button>
    </div>
  );
}

// Mount with a `key` that includes the match id and its stored score, so the
// fields reset when another match is selected or the result changes.
export function ScoreEntry({
  nameA,
  nameB,
  initial,
  disabled,
  onSave,
}: {
  nameA: string;
  nameB: string;
  initial: Score | null;
  disabled: boolean;
  onSave: (score: Score) => void;
}) {
  const [a, setA] = useState(initial ? String(initial.a) : "");
  const [b, setB] = useState(initial ? String(initial.b) : "");
  const na = toNumber(a);
  const nb = toNumber(b);
  const score = na !== null && nb !== null ? { a: na, b: nb } : null;
  const valid = score !== null && isFinalScore(score);
  const hint =
    score === null
      ? "Nhập điểm của hai đội."
      : valid
        ? "Tỉ số hợp lệ."
        : "Chưa hợp lệ: séc tới 21, hơn 2 điểm, trần 25.";

  return (
    <div className="admin-stack">
      <div className="score-entry">
        <div>
          <strong>{nameA}</strong>
          <Stepper label={`Điểm ${nameA}`} value={a} onChange={setA} />
        </div>
        <div>
          <strong>{nameB}</strong>
          <Stepper label={`Điểm ${nameB}`} value={b} onChange={setB} />
        </div>
      </div>
      <small aria-live="polite">{hint}</small>
      <button
        type="button"
        disabled={disabled || !valid}
        onClick={() => score && valid && onSave(score)}
      >
        Lưu tỉ số
      </button>
    </div>
  );
}
