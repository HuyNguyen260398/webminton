import { AthleteSchema, type Athlete } from "../packages/domain/src/schema";
import type { TournamentCommand } from "../packages/domain/src/commands";
export function parseRosterConfig(input: unknown): {
  etag: string;
  athletes: Athlete[];
} {
  if (!input || typeof input !== "object") throw new Error("JSON không hợp lệ");
  const x = input as Record<string, unknown>;
  if (
    Object.keys(x).some((k) => !["etag", "athletes"].includes(k)) ||
    typeof x.etag !== "string" ||
    !/^"[^"\r\n]+"$/.test(x.etag) ||
    !Array.isArray(x.athletes)
  )
    throw new Error("Thiếu ETag hoặc danh sách VĐV");
  const athletes = x.athletes.map((a) => AthleteSchema.parse(a));
  if (new Set(athletes.map((a) => a.id)).size !== athletes.length)
    throw new Error("Mã VĐV bị trùng");
  return { etag: x.etag, athletes };
}
export function rosterDiff(before: Athlete[], after: Athlete[]) {
  return {
    added: after
      .filter((a) => !before.some((b) => a.id === b.id))
      .map((a) => a.id),
    removed: before
      .filter((b) => !after.some((a) => a.id === b.id))
      .map((a) => a.id),
    changed: after
      .filter((a) => {
        const b = before.find((b) => b.id === a.id);
        return (
          b &&
          JSON.stringify(AthleteSchema.parse(a)) !==
            JSON.stringify(AthleteSchema.parse(b))
        );
      })
      .map((a) => a.id),
  };
}
export async function applyRosterConfig(
  config: { etag: string; athletes: Athlete[] },
  requestId: string,
  send: (command: TournamentCommand, etag: string) => Promise<unknown>,
) {
  const valid = parseRosterConfig(config);
  return send(
    { requestId, type: "replaceRoster", payload: { athletes: valid.athletes } },
    valid.etag,
  );
}
