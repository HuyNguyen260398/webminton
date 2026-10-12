import { describe, expect, it } from "vitest";
import { applyCommand, type AdminState } from "../src/commands";
import { applyRefereeSave } from "../src/duel";
import { PublicTournamentSchema, type RefereeSave } from "../src/schema";
import { makeTournament } from "../src/testing/fixtures";

const NOW = "2026-10-18T08:00:00+07:00";
const run = (s: AdminState, command: unknown) =>
  applyCommand(s, command, "btc@example.com", NOW);

// Two men a side, the bảng đấu created and trận 1 given its pairs.
function makeState(): AdminState {
  const document = makeTournament();
  const priv: AdminState["private"] = {};
  for (const [id, teamId] of [
    ["r1", "red"],
    ["r2", "red"],
    ["b1", "blue"],
    ["b2", "blue"],
  ] as const) {
    document.athletes.push({
      id,
      name: id,
      gender: "male",
      teamId,
      active: true,
    });
    priv[id] = { skillBand: 2, phone: null, note: "" };
  }
  const s = run(
    { document, private: priv },
    { type: "createDuel", payload: {} },
  );
  return run(s, {
    type: "saveDuelMatch",
    payload: {
      matchId: "vong-loai-1",
      pairRed: ["r1", "r2"],
      pairBlue: ["b1", "b2"],
      status: "pending",
      score: null,
      smashes: {},
    },
  });
}
const first = (s: AdminState) => s.document.duel!.matches[0];
const live = (score: RefereeSave["score"] = null): RefereeSave => ({
  status: "live",
  score,
  smashes: {},
});

describe("mã trọng tài", () => {
  it("has no code until the organiser sets one", () => {
    expect(makeState().secrets).toEqual({ refereeCode: null });
  });

  it("stores six digits and nothing else", () => {
    const s = run(makeState(), {
      type: "setRefereeCode",
      payload: { code: "048213" },
    });
    expect(s.secrets).toEqual({ refereeCode: "048213" });
    for (const code of ["12345", "1234567", "abcdef", ""])
      expect(() =>
        run(s, { type: "setRefereeCode", payload: { code } }),
      ).toThrow("INVALID_COMMAND");
  });

  it("never puts the code in the document", () => {
    const s = run(makeState(), {
      type: "setRefereeCode",
      payload: { code: "048213" },
    });
    expect(JSON.stringify(s.document)).not.toContain("048213");
    expect(() => PublicTournamentSchema.parse(s.document)).not.toThrow();
  });

  it("survives every other command", () => {
    let s = run(makeState(), {
      type: "setRefereeCode",
      payload: { code: "048213" },
    });
    s = run(s, { type: "updateInfo", payload: { feeVnd: 50000 } });
    expect(s.secrets?.refereeCode).toBe("048213");
  });
});

describe("mở chấm điểm", () => {
  const open = (s: AdminState, value = true) =>
    run(s, { type: "setRefereeOpen", payload: { open: value } });

  it("is closed by default and needs a code to open", () => {
    const s = makeState();
    expect(s.document.referee).toBeUndefined();
    expect(() => open(s)).toThrow("REFEREE_NEEDS_CODE");
  });

  it("needs a bảng đấu", () => {
    let s = run(makeState(), { type: "resetDuel", payload: {} });
    s = run(s, { type: "setRefereeCode", payload: { code: "048213" } });
    expect(() => open(s)).toThrow("DUEL_REQUIRED");
  });

  it("opens, closes, and is cleared with the bảng đấu", () => {
    let s = run(makeState(), {
      type: "setRefereeCode",
      payload: { code: "048213" },
    });
    s = open(s);
    expect(s.document.referee).toEqual({ open: true });
    expect(open(s, false).document.referee).toEqual({ open: false });
    s = run(s, { type: "resetDuel", payload: {} });
    expect(s.document.referee).toBeUndefined();
    expect(s.secrets?.refereeCode).toBe("048213");
  });
});

describe("applyRefereeSave", () => {
  it("starts a match that has both pairs", () => {
    expect(applyRefereeSave(first(makeState()), live())).toMatchObject({
      status: "live",
      score: null,
      pairRed: ["r1", "r2"],
      pairBlue: ["b1", "b2"],
    });
  });

  it("will not start a match without pairs", () => {
    const m = makeState().document.duel!.matches[1];
    expect(() => applyRefereeSave(m, live())).toThrow("DUEL_NEEDS_PAIRS");
  });

  it("will not finish a match that was never started", () => {
    expect(() =>
      applyRefereeSave(first(makeState()), {
        status: "done",
        score: { red: 21, blue: 10 },
        smashes: {},
      }),
    ).toThrow("REFEREE_BAD_MOVE");
  });

  it("replaces score and smashes while live, keeping only real counts of real players", () => {
    const m = applyRefereeSave(first(makeState()), live());
    const next = applyRefereeSave(m, {
      status: "live",
      score: { red: 3, blue: 2 },
      smashes: {
        r1: { hit: 2, net: 1 },
        b2: { hit: 0, net: 0 },
        stranger: { hit: 9, net: 9 },
      },
    });
    expect(next.score).toEqual({ red: 3, blue: 2 });
    expect(next.smashes).toEqual({ r1: { hit: 2, net: 1 } });
    expect(next.pairRed).toEqual(["r1", "r2"]);
  });

  it("finishes only on a final score", () => {
    const m = applyRefereeSave(first(makeState()), live({ red: 20, blue: 18 }));
    const finish = (red: number, blue: number) =>
      applyRefereeSave(m, {
        status: "done",
        score: { red, blue },
        smashes: {},
      });
    expect(() => finish(20, 18)).toThrow("INVALID_SCORE");
    expect(() =>
      applyRefereeSave(m, { status: "done", score: null, smashes: {} }),
    ).toThrow("INVALID_SCORE");
    expect(finish(21, 18)).toMatchObject({ status: "done" });
  });

  it("locks a finished match", () => {
    let m = applyRefereeSave(first(makeState()), live({ red: 21, blue: 18 }));
    m = applyRefereeSave(m, {
      status: "done",
      score: { red: 21, blue: 18 },
      smashes: {},
    });
    expect(() => applyRefereeSave(m, live({ red: 21, blue: 19 }))).toThrow(
      "REFEREE_MATCH_DONE",
    );
  });

  it("returns the very same match when the save changes nothing", () => {
    const m = applyRefereeSave(first(makeState()), {
      status: "live",
      score: { red: 3, blue: 2 },
      smashes: { r1: { hit: 1, net: 0 } },
    });
    // A zero entry is the same as no entry.
    const again = applyRefereeSave(m, {
      status: "live",
      score: { red: 3, blue: 2 },
      smashes: { r1: { hit: 1, net: 0 }, b1: { hit: 0, net: 0 } },
    });
    expect(again).toBe(m);
  });

  it("answers a repeated finish with the same match rather than a refusal", () => {
    const finish: RefereeSave = {
      status: "done",
      score: { red: 21, blue: 18 },
      smashes: {},
    };
    const m = applyRefereeSave(
      applyRefereeSave(first(makeState()), live({ red: 21, blue: 18 })),
      finish,
    );
    expect(applyRefereeSave(m, finish)).toBe(m);
  });
});
