import type { PublicTournament } from "../../../backend/src/projections/public-tournament";
export type { PublicTournament };
export async function getPublicTournament(): Promise<PublicTournament> {
  const r = await fetch("/api/public/tournament", { cache: "no-store" });
  if (!r.ok) throw new Error("Chưa tải được thông tin giải. Vui lòng thử lại.");
  return r.json();
}
