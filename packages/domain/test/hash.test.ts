import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { sha256Hex, sha256Uint32LE } from "../src/hash";

const cases = [
  "",
  "abc",
  "Giải cầu lông nội bộ 2026",
  "a".repeat(55), // one byte short of a padding block boundary
  "a".repeat(56), // forces a second block
  "a".repeat(64),
  "a".repeat(1000),
  JSON.stringify([{ id: "m1", score: { a: 21, b: 19 }, status: "completed" }]),
];

describe("sha256Hex", () => {
  it.each(cases)("matches node:crypto for %j", (input) => {
    expect(sha256Hex(input)).toBe(
      createHash("sha256").update(input).digest("hex"),
    );
  });

  it("returns lowercase 64-char hex", () => {
    expect(sha256Hex("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("sha256Uint32LE", () => {
  it.each(cases)("matches node:crypto readUInt32LE for %j", (input) => {
    expect(sha256Uint32LE(input)).toBe(
      createHash("sha256").update(input).digest().readUInt32LE(),
    );
  });
});
