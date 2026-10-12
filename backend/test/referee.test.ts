// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REFEREE_ACTOR, route, type AdminView, type Deps } from "../src/router";
import { MemoryStore } from "../src/store";
import { makeAdminState } from "../../packages/domain/src/testing/fixtures";

const ADMIN = { email: "btc@example.com", email_verified: "true" };
const CODE = "048213";
let deps: Deps;
let published: string[];

const call = (method: string, path: string, body?: unknown, claims: unknown = null) =>
  route(
    {
      method,
      path,
      rawBody: body === undefined ? null : JSON.stringify(body),
      claims: (claims ?? undefined) as Record<string, unknown> | undefined,
    },
    deps,
  );
const view = async () =>
  (await call("GET", "/api/admin/state", undefined, ADMIN)).body as AdminView;
let n = 0;
async function admin(command: unknown) {
  const res = await call(
    "POST",
    "/api/admin/commands",
    { baseVersion: (await view()).version, requestId: `a-${++n}`, command },
    ADMIN,
  );
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}
const referee = (body: Record<string, unknown>, code = CODE) =>
  call("POST", "/api/referee/match", {
    code,
    matchId: "vong-loai-1",
    status: "live",
    score: null,
    smashes: {},
    ...body,
  });
const stored = async () => (await view()).document.duel!.matches[0];
let pairs: { pairRed: [string, string]; pairBlue: [string, string] };

// The bảng đấu created, trận 1 given its pairs, a code set, refereeing open.
beforeEach(async () => {
  published = [];
  const store = new MemoryStore();
  await store.write(null, makeAdminState(), {
    at: "2026-10-10T00:00:00+07:00",
    actorEmail: "seed",
    commandType: "seed",
    requestId: "seed",
  });
  deps = {
    store,
    publish: async (body) => void published.push(body),
    adminEmails: ["btc@example.com"],
    config: { cognitoDomain: null, clientId: null, devLogin: false },
    now: () => "2026-10-18T08:00:00+07:00",
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
  const men = (await view()).document.athletes.filter((a) => a.gender === "male");
  for (const [a, teamId] of [
    [men[0], "red"],
    [men[1], "red"],
    [men[2], "blue"],
    [men[3], "blue"],
  ] as const)
    await admin({ type: "setAthleteTeam", payload: { athleteId: a.id, teamId } });
  pairs = {
    pairRed: [men[0].id, men[1].id],
    pairBlue: [men[2].id, men[3].id],
  };
  await admin({ type: "createDuel", payload: {} });
  await admin({
    type: "saveDuelMatch",
    payload: { matchId: "vong-loai-1", ...pairs, status: "pending", score: null, smashes: {} },
  });
  await admin({ type: "setRefereeCode", payload: { code: CODE } });
  await admin({ type: "setRefereeOpen", payload: { open: true } });
});

describe("referee — the gate", () => {
  const check = (code: unknown) => call("POST", "/api/referee/check", { code });

  it("accepts the code and nothing else", async () => {
    expect(await check(CODE)).toEqual({ status: 200, body: {} });
    for (const wrong of ["048214", "04821", "0482130", ""]) {
      const res = await check(wrong);
      expect(res.status).toBe(401);
      expect((res.body as { code: string }).code).toBe("REFEREE_CODE");
    }
    expect((await check(48213)).status).toBe(400);
    expect((await call("POST", "/api/referee/check", {})).status).toBe(400);
  });

  it("refuses everything while closed, even with the right code", async () => {
    await admin({ type: "setRefereeOpen", payload: { open: false } });
    expect((await check(CODE)).status).toBe(403);
    const res = await referee({});
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("REFEREE_CLOSED");
    expect((await stored()).status).toBe("pending");
  });

  it("refuses a save with a wrong code and stops trusting an old one", async () => {
    expect((await referee({}, "000000")).status).toBe(401);
    await admin({ type: "setRefereeCode", payload: { code: "999999" } });
    expect((await referee({})).status).toBe(401);
    expect((await referee({}, "999999")).status).toBe(200);
  });

  it("does not answer on any other path or method", async () => {
    expect((await call("POST", "/api/referee/other", { code: CODE })).status).toBe(404);
    expect((await call("GET", "/api/referee/check")).status).toBe(404);
  });
});

describe("referee — scoring a match", () => {
  it("starts, scores and finishes, publishing each step under its own name", async () => {
    const before = published.length;
    let res = await referee({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      match: { status: "live", score: null, ...pairs },
      updatedAt: "2026-10-18T08:00:00+07:00",
    });
    const who = pairs.pairRed[0];
    res = await referee({ score: { red: 3, blue: 2 }, smashes: { [who]: { hit: 1, net: 0 } } });
    expect((res.body as { match: unknown }).match).toMatchObject({
      score: { red: 3, blue: 2 },
      smashes: { [who]: { hit: 1, net: 0 } },
    });
    res = await referee({ status: "done", score: { red: 21, blue: 15 } });
    expect(res.status).toBe(200);
    expect(await stored()).toMatchObject({ status: "done", score: { red: 21, blue: 15 } });
    expect(published.length).toBe(before + 3);
    const history = (await call("GET", "/api/admin/history", undefined, ADMIN)).body as {
      entries: { actorEmail: string; commandType: string }[];
    };
    expect(history.entries[0]).toMatchObject({
      actorEmail: REFEREE_ACTOR,
      commandType: "refereeMatch",
    });
  });

  it("never publishes the code", async () => {
    await referee({ score: { red: 1, blue: 0 } });
    expect(published.at(-1)).not.toContain(CODE);
    expect(published.at(-1)).not.toContain("refereeCode");
    expect(JSON.parse(published.at(-1)!).referee).toEqual({ open: true });
  });

  it("cannot change the pairs, or anything a strict body does not name", async () => {
    const swapped = { pairRed: pairs.pairBlue, pairBlue: pairs.pairRed };
    expect((await referee(swapped)).status).toBe(400);
    expect((await referee({ stage: "final" })).status).toBe(400);
    expect((await stored()).pairRed).toEqual(pairs.pairRed);
  });

  it("refuses an unknown match, a match without pairs and a bad finish", async () => {
    expect((await referee({ matchId: "khong-co" })).status).toBe(422);
    const noPairs = await referee({ matchId: "vong-loai-2" });
    expect((noPairs.body as { code: string }).code).toBe("DUEL_NEEDS_PAIRS");
    const early = await referee({ status: "done", score: { red: 21, blue: 15 } });
    expect((early.body as { code: string }).code).toBe("REFEREE_BAD_MOVE");
    await referee({});
    const short = await referee({ status: "done", score: { red: 20, blue: 15 } });
    expect((short.body as { code: string }).code).toBe("INVALID_SCORE");
  });

  it("locks a finished match but answers a repeated finish", async () => {
    await referee({});
    const finish = { status: "done", score: { red: 21, blue: 15 } };
    expect((await referee(finish)).status).toBe(200);
    const version = (await view()).version;
    // The reply was lost and the phone sends it again.
    expect((await referee(finish)).status).toBe(200);
    expect((await view()).version).toBe(version);
    const edit = await referee({ status: "live", score: { red: 20, blue: 15 } });
    expect(edit.status).toBe(422);
    expect((edit.body as { code: string }).code).toBe("REFEREE_MATCH_DONE");
  });

  it("writes nothing when the save changes nothing", async () => {
    await referee({ score: { red: 3, blue: 2 } });
    const { version } = await view();
    const count = published.length;
    expect((await referee({ score: { red: 3, blue: 2 } })).status).toBe(200);
    expect((await view()).version).toBe(version);
    expect(published.length).toBe(count);
  });

  it("saves over a version collision with the other court", async () => {
    const write = deps.store.write.bind(deps.store);
    let collided = false;
    deps.store.write = async (prev, next, entry) => {
      if (!collided) {
        collided = true;
        // The other court's save lands between this one's read and write. It
        // leaves this match alone, so the retry still has its work to do.
        await write(
          prev,
          { document: prev!.document, private: prev!.private, secrets: prev!.secrets },
          { ...entry, requestId: "other-court" },
        );
        throw new Error("CONFLICT");
      }
      return write(prev, next, entry);
    };
    const res = await referee({ score: { red: 1, blue: 0 } });
    expect(res.status).toBe(200);
    expect(collided).toBe(true);
    expect((await stored()).score).toEqual({ red: 1, blue: 0 });
  });
});

describe("referee — the organiser's side", () => {
  it("shows the organiser the code", async () => {
    expect((await view()).secrets).toEqual({ refereeCode: CODE });
  });

  it("keeps the current code when an old version is restored", async () => {
    const { version } = await view();
    await admin({ type: "setRefereeCode", payload: { code: "999999" } });
    const res = await call(
      "POST",
      "/api/admin/restore",
      { baseVersion: (await view()).version, requestId: "undo", version },
      ADMIN,
    );
    expect(res.status).toBe(200);
    expect((await view()).secrets).toEqual({ refereeCode: "999999" });
  });
});
