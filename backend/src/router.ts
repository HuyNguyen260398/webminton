import type { TournamentRepository } from "./storage/repository";
import { requireAdmin } from "./auth";
import { toPublicTournament } from "./projections/public-tournament";
import { executeCommand } from "./commands/dispatch";
import { restoreVersion } from "./commands/restore";
import { errorResponse } from "./errors";
export interface HttpRequest {
  method: string;
  path: string;
  headers: Record<string, string | undefined>;
  body?: string;
  claims?: Record<string, string>;
  cursor?: string;
}
export async function route(
  repo: TournamentRepository,
  request: HttpRequest,
  config: { issuer: string; clientId: string },
) {
  const json = (statusCode: number, body: unknown, etag?: string) => ({
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...(etag ? { ETag: etag } : {}),
    },
    body: JSON.stringify(body),
  });
  try {
    const path = request.path.replace(/^\/api(?=\/)/, "");
    if (path === "/public/tournament" && request.method === "GET")
      return json(200, toPublicTournament((await repo.read()).document));
    if (!path.startsWith("/admin/")) throw new Error("NOT_FOUND");
    const actorSub = requireAdmin(request.claims, config);
    if (path === "/admin/tournament" && request.method === "GET") {
      const r = await repo.read();
      return json(200, r.document, r.etag);
    }
    if (path === "/admin/versions" && request.method === "GET")
      return json(200, await repo.listVersions(request.cursor));
    if (
      request.method !== "POST" ||
      !["/admin/commands", "/admin/restore"].includes(path)
    )
      throw new Error("NOT_FOUND");
    const etag = request.headers["if-match"] ?? request.headers["If-Match"];
    if (!etag) throw new Error("PRECONDITION_REQUIRED");
    if (Buffer.byteLength(request.body ?? "") > 256 * 1024)
      throw new Error("PAYLOAD_TOO_LARGE");
    const body = JSON.parse(request.body ?? "");
    const r =
      path === "/admin/commands"
        ? await executeCommand(repo, body, { actorSub, etag })
        : await restoreVersion(repo, body, { actorSub, etag });
    return json(200, { document: r.document, replayed: r.replayed }, r.etag);
  } catch (error) {
    const r = errorResponse(error);
    return json(r.statusCode, r.body);
  }
}
