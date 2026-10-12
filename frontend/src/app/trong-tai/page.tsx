"use client";
import { useTournament } from "../../lib/use-tournament";
import { RefereePortal } from "../../features/referee/RefereePortal";

export default function RefereePage() {
  const { view, error, reload } = useTournament();
  if (error)
    return (
      <main id="main" className="container section">
        <p role="alert" className="error">
          {error} <button onClick={reload}>Thử lại</button>
        </p>
      </main>
    );
  if (!view)
    return (
      <main id="main" className="container section">
        <p role="status">Đang tải thông tin giải…</p>
      </main>
    );
  return (
    <main id="main" className="ref-page">
      <RefereePortal t={view.t} reload={reload} />
    </main>
  );
}
