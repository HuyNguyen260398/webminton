// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildSeed, seed } from "../seed";
import { MemoryStore } from "../../backend/src/store";
import { makeTournament } from "../../packages/domain/src/testing/fixtures";

const doc = () => {
  const t = makeTournament();
  t.athletes = [
    { id: "a01", name: "Võ Khánh Tân", gender: "male", teamId: null, active: true },
    { id: "a02", name: "Trinh", gender: "female", teamId: null, active: true },
  ];
  return t;
};
const roster = {
  athletes: [
    {
      id: "a01",
      name: "Võ Khánh Tân",
      gender: "male",
      skillBand: 2,
      phone: "0901",
      note: "",
      active: true,
    },
  ],
};

describe("buildSeed", () => {
  it("gives every athlete private fields, blank where the roster is silent", () => {
    const state = buildSeed(doc(), roster);
    expect(state.private).toEqual({
      a01: { skillBand: 2, phone: "0901", note: "" },
      a02: { skillBand: null, phone: null, note: "" },
    });
    expect(state.document.athletes).toHaveLength(2);
  });

  it("works with no private roster at all", () => {
    expect(buildSeed(doc(), null).private.a01).toEqual({
      skillBand: null,
      phone: null,
      note: "",
    });
  });

  it("refuses a document the page could not render", () => {
    expect(() => buildSeed({ nope: true }, null)).toThrow(/không hợp lệ/);
  });
});

describe("seed", () => {
  const now = "2026-10-10T20:00:00+07:00";

  it("writes version 1 and publishes it", async () => {
    const store = new MemoryStore();
    const published: string[] = [];
    const v = await seed(store, async (b) => void published.push(b), buildSeed(doc(), roster), {
      force: false,
      now,
    });
    expect(v).toBe(1);
    expect((await store.read())!.publishedVersion).toBe(1);
    expect(published[0]).not.toContain("0901");
    expect((await store.history())[0]).toMatchObject({
      actorEmail: "seed",
      commandType: "seed",
    });
  });

  it("refuses to overwrite a seeded table unless forced", async () => {
    const store = new MemoryStore();
    const publish = async () => {};
    await seed(store, publish, buildSeed(doc(), null), { force: false, now });
    await expect(
      seed(store, publish, buildSeed(doc(), null), { force: false, now }),
    ).rejects.toThrow("ALREADY_SEEDED");
    expect(
      await seed(store, publish, buildSeed(doc(), null), { force: true, now }),
    ).toBe(2);
  });
});
