"use client";
import { useState } from "react";
import { RefereeError, checkCode } from "../../lib/referee-api";
import { Card } from "../landing/primitives";

export function CodeGate({
  notice,
  onAccepted,
}: {
  notice: string | null;
  onAccepted: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(notice);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await checkCode(code);
      onAccepted(code);
    } catch (err) {
      setError(
        err instanceof RefereeError && err.code === "NETWORK"
          ? "Mất mạng — kiểm tra rồi thử lại."
          : err instanceof Error
            ? err.message
            : "Không kiểm tra được mã.",
      );
      setCode("");
      setBusy(false);
    }
  }

  return (
    <div className="ref-wrap">
      <Card title="Trọng tài">
        <form className="ref-gate" onSubmit={submit}>
          <label htmlFor="referee-code">Mã trọng tài (BTC cấp)</label>
          <input
            id="referee-code"
            data-testid="referee-code-input"
            className="ref-gate__input"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy || code.length !== 6}>
            {busy ? "Đang kiểm tra…" : "Vào chấm điểm"}
          </button>
        </form>
      </Card>
    </div>
  );
}
