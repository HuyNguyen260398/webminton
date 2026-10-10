// @vitest-environment node
import { describe, expect, it } from "vitest";
import { parseEmails, requireAdmin } from "../src/auth";

const admins = parseEmails(" Huy@Example.com ,btc@example.com,, ");

describe("requireAdmin", () => {
  it("parses the allow-list, lower-cased and trimmed", () => {
    expect(admins).toEqual(["huy@example.com", "btc@example.com"]);
    expect(parseEmails(undefined)).toEqual([]);
  });

  it("returns the email of an allow-listed, verified account", () => {
    // API Gateway hands JWT claims to the Lambda as strings.
    expect(
      requireAdmin({ email: "HUY@example.com", email_verified: "true" }, admins),
    ).toBe("huy@example.com");
    expect(
      requireAdmin({ email: "btc@example.com", email_verified: true }, admins),
    ).toBe("btc@example.com");
  });

  it("is UNAUTHORIZED without claims or without an email", () => {
    expect(() => requireAdmin(undefined, admins)).toThrow("UNAUTHORIZED");
    expect(() => requireAdmin({ sub: "x" }, admins)).toThrow("UNAUTHORIZED");
  });

  it("is FORBIDDEN for anyone else, or an unverified email", () => {
    expect(() =>
      requireAdmin({ email: "la@example.com", email_verified: "true" }, admins),
    ).toThrow("FORBIDDEN");
    expect(() =>
      requireAdmin({ email: "huy@example.com", email_verified: "false" }, admins),
    ).toThrow("FORBIDDEN");
    expect(() =>
      requireAdmin({ email: "huy@example.com", email_verified: "true" }, []),
    ).toThrow("FORBIDDEN");
  });
});
