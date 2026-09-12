import { test, expect } from "vitest";
import {
  makeTournament,
  makeRoster,
  makeCompletedGroup,
} from "../../packages/domain/src/testing/fixtures";
import { toPublicTournament } from "../src/projections/public-tournament";
import { requireAdmin } from "../src/auth";
test("public projection excludes private athletes, draw seed, and unrevealed pairs", () => {
  const t = makeCompletedGroup();
  t.athletes = makeRoster(16);
  t.athletes[0].phone = "private-phone";
  t.matches[0].pairA = ["athlete-1", "athlete-3"];
  t.draw.seed = "private-seed";
  const p = toPublicTournament(t),
    json = JSON.stringify(p);
  expect(json).not.toContain("private-phone");
  expect(json).not.toContain("private-seed");
  expect(json).not.toContain("feePayments");
  expect(p.matches[0].pairA).toBeNull();
  expect(p.finance).toEqual({ published: false });
});
test("admin requires trusted group, scope, issuer and client", () => {
  const config = { issuer: "https://issuer", clientId: "client" };
  const good = {
    sub: "admin",
    iss: config.issuer,
    client_id: "client",
    token_use: "access",
    scope: "tournament/admin",
    "cognito:groups": "[admins]",
  };
  expect(requireAdmin(good, config)).toBe("admin");
  for (const c of [
    { ...good, "cognito:groups": "[]" },
    { ...good, scope: "" },
    { ...good, client_id: "bad" },
    { ...good, iss: "bad" },
  ])
    expect(() => requireAdmin(c, config)).toThrow();
  expect(() => requireAdmin(undefined, config)).toThrow();
});
