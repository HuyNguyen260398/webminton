import { z } from "zod";
import { Id, PublicTournamentSchema } from "../../packages/domain/src/schema";
import {
  applyCommand,
  previewDraw,
  PrivateMapSchema,
  type AdminState,
} from "../../packages/domain/src/commands";
import { requireAdmin, type Claims } from "./auth";
import { renderSnapshot, type Publisher } from "./publish";
import { toResponse } from "./errors";
import type { StoredState, TournamentStore } from "./store";

export interface ApiRequest {
  method: string;
  path: string;
  rawBody: string | null;
  claims: Claims;
}
export interface ApiResponse {
  status: number;
  body: unknown;
}
export interface PublicConfig {
  cognitoDomain: string | null;
  clientId: string | null;
  devLogin: boolean;
}
export interface Deps {
  store: TournamentStore;
  publish: Publisher;
  adminEmails: string[];
  config: PublicConfig;
  now: () => string;
}
export interface AdminView extends AdminState {
  version: number;
  publishedVersion: number;
  published?: boolean;
}

const Envelope = z.object({
  baseVersion: z.number().int().positive(),
  requestId: Id,
});
const CommandBody = Envelope.extend({ command: z.unknown() });
const RestoreBody = Envelope.extend({ version: z.number().int().positive() });
const PreviewBody = z.object({ seed: z.string().trim().min(1).max(500) });

const ok = (body: unknown): ApiResponse => ({ status: 200, body });
const view = (s: StoredState): AdminView => ({
  version: s.version,
  publishedVersion: s.publishedVersion,
  document: s.document,
  private: s.private,
});

function parse<T>(schema: z.ZodType<T>, raw: string | null): T {
  let json: unknown;
  try {
    json = JSON.parse(raw ?? "null");
  } catch {
    throw new Error("BAD_REQUEST");
  }
  const result = schema.safeParse(json);
  if (!result.success) throw new Error("BAD_REQUEST");
  return result.data;
}

async function current(deps: Deps): Promise<StoredState> {
  const state = await deps.store.read();
  if (!state) throw new Error("NOT_SEEDED");
  return state;
}

// A failed publish must not fail the save: the database is already correct,
// and the organiser can republish. So this reports rather than throws.
async function publishState(deps: Deps, s: StoredState): Promise<AdminView> {
  try {
    await deps.publish(renderSnapshot(s.document));
    await deps.store.markPublished(s.version);
    return { ...view(s), publishedVersion: s.version, published: true };
  } catch (e) {
    console.error(e);
    return { ...view(s), published: false };
  }
}

async function commit(
  deps: Deps,
  actorEmail: string,
  body: z.infer<typeof Envelope>,
  commandType: string,
  produce: (s: StoredState) => AdminState,
): Promise<ApiResponse> {
  const cur = await current(deps);
  // A double tap or a retry: the change is already in, so report success.
  if (cur.recentRequests.some((r) => r.requestId === body.requestId))
    return ok(view(cur));
  if (cur.version !== body.baseVersion) throw new Error("CONFLICT");
  const saved = await deps.store.write(cur, produce(cur), {
    at: deps.now(),
    actorEmail,
    commandType,
    requestId: body.requestId,
  });
  return ok(await publishState(deps, saved));
}

export async function route(req: ApiRequest, deps: Deps): Promise<ApiResponse> {
  try {
    const key = `${req.method} ${req.path}`;
    if (key === "GET /api/config") return ok(deps.config);
    if (!req.path.startsWith("/api/admin/")) throw new Error("NOT_FOUND");
    const actor = requireAdmin(req.claims, deps.adminEmails);

    switch (key) {
      case "GET /api/admin/state":
        return ok(view(await current(deps)));

      case "POST /api/admin/commands": {
        const body = parse(CommandBody, req.rawBody);
        const type =
          typeof (body.command as { type?: unknown })?.type === "string"
            ? (body.command as { type: string }).type
            : "unknown";
        return await commit(deps, actor, body, type, (s) =>
          applyCommand(s, body.command, actor, deps.now()),
        );
      }

      case "POST /api/admin/draw/preview": {
        const { seed } = parse(PreviewBody, req.rawBody);
        return ok({ seed, assignment: previewDraw(await current(deps), seed) });
      }

      case "POST /api/admin/publish":
        return ok(await publishState(deps, await current(deps)));

      case "GET /api/admin/history":
        return ok({ entries: await deps.store.history() });

      case "POST /api/admin/restore": {
        const body = parse(RestoreBody, req.rawBody);
        const old = await deps.store.snapshot(body.version);
        if (!old) throw new Error("NOT_FOUND");
        return await commit(deps, actor, body, `restore:${body.version}`, () => ({
          document: PublicTournamentSchema.parse({
            ...old.document,
            updatedAt: deps.now(),
          }),
          private: PrivateMapSchema.parse(old.private),
        }));
      }
    }
    throw new Error("NOT_FOUND");
  } catch (e) {
    return toResponse(e);
  }
}
