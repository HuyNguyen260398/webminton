import { route, type ApiResponse, type Deps } from "../backend/src/router";
import { renderSnapshot, type Publisher } from "../backend/src/publish";
import { MemoryStore, type TournamentStore } from "../backend/src/store";
import { applyCommand } from "../packages/domain/src/commands";
import { makeAdminState } from "../packages/domain/src/testing/fixtures";

export const LOCAL_ADMIN = "admin@example.com";

// The real table and the live tournament.json, for `pnpm dev:cloud`. A save
// made through this is a save on the live site.
export interface CloudTarget {
  store: TournamentStore;
  publish: Publisher;
}

// The real router over an in-memory store, for `serve-static` and Playwright.
// Nothing here is deployed. Given a `cloud` target it runs over that instead,
// and then it never seeds and never resets.
export function createLocalApi(cloud?: CloudTarget) {
  let store: TournamentStore = cloud?.store ?? new MemoryStore();
  let snapshot: string | null = null;

  async function reset() {
    if (cloud) return;
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
    publish:
      cloud?.publish ??
      (async (body) => {
        snapshot = body;
      }),
    adminEmails: [LOCAL_ADMIN],
    config: { cognitoDomain: null, clientId: null, devLogin: true },
    now: () => new Date().toISOString(),
  });

  return {
    reset,
    // What the public page should show: over the cloud, whatever the table
    // holds right now, so a save made on the deployed site shows up here too.
    async snapshot(): Promise<string | null> {
      if (!cloud) return snapshot;
      const current = await store.read();
      return current ? renderSnapshot(current.document) : null;
    },
    async handle(
      method: string,
      path: string,
      rawBody: string | null,
      authorization: string | undefined,
    ): Promise<ApiResponse> {
      if (!cloud && method === "POST" && path === "/api/test/reset") {
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
