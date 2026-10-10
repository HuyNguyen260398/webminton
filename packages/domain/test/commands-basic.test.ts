import { describe, expect, it } from "vitest";
import { applyCommand, type AdminState } from "../src/commands";
import { makeTournament } from "../src/testing/fixtures";

const NOW = "2026-10-18T08:00:00+07:00";
const base = (): AdminState => ({ document: makeTournament(), private: {} });
const run = (s: AdminState, command: unknown) =>
  applyCommand(s, command, "btc@example.com", NOW);

describe("applyCommand — info, courts, teams, finance", () => {
  it("merges a partial info update and stamps updatedAt", () => {
    const next = run(base(), {
      type: "updateInfo",
      payload: { feeVnd: 150000, location: "Sân Tấn Phúc" },
    });
    expect(next.document.info.feeVnd).toBe(150000);
    expect(next.document.info.location).toBe("Sân Tấn Phúc");
    expect(next.document.info.clubName).toBe("Hội lông thủ CN1416");
    expect(next.document.updatedAt).toBe(NOW);
  });

  it("does not mutate the input state", () => {
    const s = base();
    run(s, { type: "updateInfo", payload: { feeVnd: 1 } });
    expect(s.document.info.feeVnd).toBeNull();
  });

  it("rejects an unknown command and an unknown field", () => {
    expect(() => run(base(), { type: "nope", payload: {} })).toThrow(
      "INVALID_COMMAND",
    );
    expect(() =>
      run(base(), { type: "updateInfo", payload: { hacked: true } }),
    ).toThrow("INVALID_COMMAND");
  });

  it("rejects a result the public schema would refuse", () => {
    // qrPublished with no QR path fails PublicTournamentSchema.
    expect(() =>
      run(base(), { type: "updateInfo", payload: { qrAssetPath: null } }),
    ).toThrow("INVALID_DOCUMENT");
  });

  it("replaces courts and refuses to drop one a match uses", () => {
    const s = run(base(), {
      type: "setCourts",
      payload: { courts: [{ id: "san-1", name: "Sân 1" }] },
    });
    expect(s.document.courts).toHaveLength(1);
    s.document.matches = [
      {
        id: "m1",
        phase: "group",
        encounterId: "e1",
        category: "mens_doubles",
        order: 1,
        teamAId: "red",
        teamBId: "blue",
        pairA: null,
        pairB: null,
        lineupPublished: false,
        courtId: "san-1",
        startsAt: null,
        endsAt: null,
        status: "pending",
        score: null,
        winnerTeamId: null,
      },
    ];
    expect(() =>
      run(s, { type: "setCourts", payload: { courts: [] } }),
    ).toThrow("COURT_IN_USE");
    expect(() =>
      run(base(), {
        type: "setCourts",
        payload: {
          courts: [
            { id: "x", name: "A" },
            { id: "x", name: "B" },
          ],
        },
      }),
    ).toThrow("INVALID_COURTS");
  });

  it("renames a team and refuses a captain from outside it", () => {
    const s = base();
    s.document.athletes = [
      { id: "a01", name: "Tân", gender: "male", teamId: "blue", active: true },
    ];
    const next = run(s, {
      type: "updateTeam",
      payload: { teamId: "red", name: "Đội Lửa", color: "#FF0000" },
    });
    expect(next.document.teams[0]).toMatchObject({
      name: "Đội Lửa",
      color: "#FF0000",
    });
    expect(() =>
      run(s, {
        type: "updateTeam",
        payload: { teamId: "red", captainId: "a01" },
      }),
    ).toThrow("INVALID_CAPTAIN");
    expect(
      run(s, {
        type: "updateTeam",
        payload: { teamId: "blue", captainId: "a01" },
      }).document.teams[1].captainId,
    ).toBe("a01");
    expect(() =>
      run(s, { type: "updateTeam", payload: { teamId: "nope", name: "X" } }),
    ).toThrow("INVALID_TEAM");
  });

  it("upserts and removes finance lines", () => {
    let s = run(base(), {
      type: "upsertSponsor",
      payload: {
        id: "sp-1",
        name: "Anh Ba",
        amountVnd: 500000,
        received: false,
        note: "",
        tierOverride: null,
      },
    });
    s = run(s, {
      type: "upsertSponsor",
      payload: {
        id: "sp-1",
        name: "Anh Ba",
        amountVnd: 700000,
        received: true,
        note: "",
        tierOverride: null,
      },
    });
    expect(s.document.sponsorships).toHaveLength(1);
    expect(s.document.sponsorships[0].amountVnd).toBe(700000);
    s = run(s, {
      type: "upsertExpense",
      payload: {
        id: "ex-1",
        label: "Thuê sân",
        quantity: 4,
        unitPriceVnd: 120000,
        paid: false,
        note: "",
      },
    });
    s = run(s, {
      type: "upsertIncome",
      payload: { id: "in-1", label: "Khác", amountVnd: 1000, received: true },
    });
    s = run(s, { type: "setFinancePublished", payload: { published: true } });
    expect(s.document.finance.published).toBe(true);
    expect(s.document.finance.expenses).toHaveLength(1);
    s = run(s, { type: "removeExpense", payload: { id: "ex-1" } });
    s = run(s, { type: "removeIncome", payload: { id: "in-1" } });
    s = run(s, { type: "removeSponsor", payload: { id: "sp-1" } });
    expect(s.document.finance.expenses).toHaveLength(0);
    expect(s.document.sponsorships).toHaveLength(0);
    expect(() =>
      run(s, { type: "removeSponsor", payload: { id: "sp-1" } }),
    ).toThrow("NOT_FOUND");
  });
});
