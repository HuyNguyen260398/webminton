"use client";
import { useTournament } from "../../lib/use-tournament";
import { TeamDrawPortal } from "../../features/draw/TeamDrawPortal";

export default function TeamDrawPage() {
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
    <main id="main">
      <TeamDrawPortal t={view.t} onDrawn={reload} />
    </main>
  );
}
