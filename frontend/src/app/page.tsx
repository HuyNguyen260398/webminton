"use client";
import { useTournament } from "../lib/use-tournament";

export default function Page() {
  const { view, error } = useTournament();
  if (error)
    return (
      <main id="main">
        <p role="alert">{error}</p>
      </main>
    );
  if (!view)
    return (
      <main id="main">
        <p role="status">Đang tải thông tin giải…</p>
      </main>
    );
  return (
    <main id="main">
      <h1>{view.t.info.name}</h1>
    </main>
  );
}
