import { test, expect } from "vitest";
import { makeRoster } from "../../packages/domain/src/testing/fixtures";
import {
  parseRosterConfig,
  rosterDiff,
  applyRosterConfig,
} from "../roster-config";
test("rejects duplicate IDs and missing ETags", () => {
  const a = makeRoster(1)[0];
  expect(() => parseRosterConfig({ etag: '"v1"', athletes: [a, a] })).toThrow();
  expect(() => parseRosterConfig({ athletes: [a] })).toThrow();
});
test("preview distinguishes updates from additions by ID", () => {
  const old = makeRoster(2),
    next = makeRoster(3);
  next[0].name = "Tên mới";
  expect(rosterDiff(old, next)).toEqual({
    added: ["athlete-3"],
    removed: [],
    changed: ["athlete-1"],
  });
});
test("apply retains original ETag/request ID and sends roster only", async () => {
  const config = { etag: '"v7"', athletes: makeRoster(2) };
  let submitted: unknown;
  await applyRosterConfig(config, "request-1", async (command, etag) => {
    submitted = { command, etag };
    return { revision: 8 };
  });
  expect(submitted).toEqual({
    etag: '"v7"',
    command: {
      requestId: "request-1",
      type: "replaceRoster",
      payload: { athletes: config.athletes },
    },
  });
});
