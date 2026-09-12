import { test, expect } from "vitest";
import { isFinalScore, walkoverScore } from "../src/score";
test.each([
  [21, 0],
  [21, 19],
  [22, 20],
  [23, 21],
  [24, 22],
  [25, 23],
  [25, 24],
])("accepts %i–%i and reversed score", (a, b) => {
  expect(isFinalScore({ a, b })).toBe(true);
  expect(isFinalScore({ a: b, b: a })).toBe(true);
});
test.each([
  [0, 0],
  [21, 20],
  [22, 19],
  [25, 22],
  [26, 24],
  [-1, 21],
  [21, 1.5],
  [NaN, 21],
  [Infinity, 21],
])("rejects %i–%i", (a, b) => expect(isFinalScore({ a, b })).toBe(false));
test("walkover awards 21 to the opponent", () => {
  expect(walkoverScore("a")).toEqual({ a: 0, b: 21 });
  expect(walkoverScore("b")).toEqual({ a: 21, b: 0 });
});
