import { route, type ApiResponse, type Deps } from "../backend/src/router";
import { MemoryStore } from "../backend/src/store";
import { applyCommand } from "../packages/domain/src/commands";
import { makeAdminState } from "../packages/domain/src/testing/fixtures";

export const LOCAL_ADMIN = "admin@example.com";

// The real router over an in-memory store, for `serve-static` and Playwright.
// Nothing here is deployed.
export function createLocalApi() {
  let store = new MemoryStore();
  let snapshot: string | null = null;

  async function reset() {
    store = new MemoryStore();
    snapshot = null;
    const now = new Date().toISOString();
    let state = makeAdminState();
    state.document.courts = [
      { id: "san-1", name: "Sân 1" },
      { id: "san-2", name: "Sân 2" },
    ];
    state = applyCommand(
      state,
      { type: "confirmDraw", payload: { seed: "e2e" } },
      "seed",
      now,
    );
    await store.write(null, state, {
      at: now,
      actorEmail: "seed",
      commandType: "seed",
      requestId: "seed",
    });
  }

  const deps = (): Deps => ({
    store,
    publish: async (body) => {
      snapshot = body;
    },
    adminEmails: [LOCAL_ADMIN],
    config: { cognitoDomain: null, clientId: null, devLogin: true },
    now: () => new Date().toISOString(),
  });

  return {
    reset,
    snapshot: () => snapshot,
    async handle(
      method: string,
      path: string,
      rawBody: string | null,
      authorization: string | undefined,
    ): Promise<ApiResponse> {
      if (method === "POST" && path === "/api/test/reset") {
        await reset();
        return { status: 200, body: { ok: true } };
      }
      const email = /^Bearer test:(.+)$/.exec(authorization ?? "")?.[1];
      return route(
        {
          method,
          path,
          rawBody,
          claims: email ? { email, email_verified: "true" } : undefined,
        },
        deps(),
      );
    },
  };
}
