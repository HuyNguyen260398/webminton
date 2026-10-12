// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createLocalApi, LOCAL_ADMIN } from "../local-api";
import { DEMO_CODE, DEMO_REFEREES, seedDemo, type Call } from "../seed-demo";
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
  it("leaves a giải ready to referee: two teams, twelve matches, a code, open", async () => {
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

    expect(duel!.matches).toHaveLength(12);
    const by = (status: string) =>
      duel!.matches.filter((m) => m.status === status);
    expect(by("done")).toHaveLength(1);
    expect(by("live")).toHaveLength(1);
    expect(by("live")[0].score).not.toBeNull();
    // Everything else has its pairs and is ready to start.
    expect(by("pending")).toHaveLength(10);
    expect(duel!.matches.every((m) => m.pairRed && m.pairBlue)).toBe(true);
    expect(deriveDuel(view.document)!.smashHit.length).toBeGreaterThan(0);

    expect(view.document.refereeNames).toEqual(DEMO_REFEREES);
    expect(by("done")[0].referee).toBe(DEMO_REFEREES[0]);
    expect(by("live")[0].referee).toBe(DEMO_REFEREES[1]);
    expect(view.secrets).toEqual({ refereeCode: DEMO_CODE });
    expect(referee).toEqual({ open: true });
    // And the public page has it: the last save published.
    const published = JSON.parse((await api.snapshot())!);
    expect(published.referee).toEqual({ open: true });
    expect(JSON.stringify(published)).not.toContain(DEMO_CODE);
  });

  it("gives every man three vòng loại matches and every woman two, one final at most", async () => {
    const { call } = local();
    await seedDemo(call);
    const view = (await call("GET", "/api/admin/state")).body as AdminView;
    const { athletes, duel } = view.document;
    const matches = [...duel!.matches].sort((a, b) => a.order - b.order);
    const playersOf = (m: (typeof matches)[number]) => [
      ...m.pairRed!,
      ...m.pairBlue!,
    ];
    for (const a of athletes) {
      const mine = matches.filter((m) => playersOf(m).includes(a.id));
      const playoff = mine.filter((m) => m.stage === "playoff");
      expect(playoff).toHaveLength(a.gender === "male" ? 3 : 2);
      expect(mine.length - playoff.length).toBeLessThanOrEqual(1);
      // Nobody is called for two vòng loại matches in a row.
      const orders = playoff.map((m) => m.order);
      expect(orders.every((o, i) => i === 0 || o - orders[i - 1] > 1)).toBe(
        true,
      );
    }
  });

  it("can be run again over its own result", async () => {
    const { call } = local();
    await seedDemo(call);
    await seedDemo(call);
    const view = (await call("GET", "/api/admin/state")).body as AdminView;
    expect(view.document.athletes).toHaveLength(14);
    expect(view.document.duel!.matches).toHaveLength(12);
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
