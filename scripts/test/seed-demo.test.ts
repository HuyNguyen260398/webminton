// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createLocalApi, LOCAL_ADMIN } from "../local-api";
import { DEMO_CODE, seedDemo, type Call } from "../seed-demo";
import type { AdminView } from "../../backend/src/router";
import { deriveDuel } from "../../packages/domain/src/duel";

function local() {
  const api = createLocalApi();
  const call: Call = (method, path, body) =>
    api.handle(
      method,
      path,
      body === undefined ? null : JSON.stringify(body),
      `Bearer test:${LOCAL_ADMIN}`,
    );
  return { api, call };
}

describe("seedDemo", () => {
  it("leaves a giải ready to referee: two teams, eleven matches, a code, open", async () => {
    const { api, call } = local();
    await seedDemo(call);
    const view = (await call("GET", "/api/admin/state")).body as AdminView;
    const { athletes, duel, referee, draw } = view.document;

    expect(draw.status).not.toBe("confirmed");
    for (const teamId of ["red", "blue"]) {
      const team = athletes.filter((a) => a.teamId === teamId);
      expect(team.filter((a) => a.gender === "male")).toHaveLength(6);
      expect(team.filter((a) => a.gender === "female")).toHaveLength(1);
    }
    expect(athletes).toHaveLength(14);
    expect(athletes.every((a) => !a.name.startsWith("VĐV thử"))).toBe(true);

    expect(duel!.matches).toHaveLength(11);
    const by = (status: string) =>
      duel!.matches.filter((m) => m.status === status);
    expect(by("done")).toHaveLength(1);
    expect(by("live")).toHaveLength(1);
    expect(by("live")[0].score).not.toBeNull();
    // Some ready to start, some still waiting for pairs.
    const pending = by("pending");
    expect(pending.some((m) => m.pairRed && m.pairBlue)).toBe(true);
    expect(pending.some((m) => !m.pairRed)).toBe(true);
    expect(deriveDuel(view.document)!.smashHit.length).toBeGreaterThan(0);

    expect(view.secrets).toEqual({ refereeCode: DEMO_CODE });
    expect(referee).toEqual({ open: true });
    // And the public page has it: the last save published.
    const published = JSON.parse((await api.snapshot())!);
    expect(published.referee).toEqual({ open: true });
    expect(JSON.stringify(published)).not.toContain(DEMO_CODE);
  });

  it("can be run again over its own result", async () => {
    const { call } = local();
    await seedDemo(call);
    await seedDemo(call);
    const view = (await call("GET", "/api/admin/state")).body as AdminView;
    expect(view.document.athletes).toHaveLength(14);
    expect(view.document.duel!.matches).toHaveLength(11);
  });

  it("refuses to touch a server that will not reset — that is the live one", async () => {
    const { call } = local();
    const cloud: Call = (method, path, body) =>
      path === "/api/test/reset"
        ? Promise.resolve({ status: 404, body: { code: "NOT_FOUND" } })
        : call(method, path, body);
    await expect(seedDemo(cloud)).rejects.toThrow(/reset/);
    // Nothing was sent after the refusal: the local store was never seeded.
    expect((await call("GET", "/api/admin/state")).status).toBe(503);
  });
});
