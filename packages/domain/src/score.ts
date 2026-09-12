import type { Score } from "./schema";
export function isFinalScore({ a, b }: Score): boolean {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0)
    return false;
  const hi = Math.max(a, b),
    lo = Math.min(a, b);
  return (
    (hi === 21 && lo <= 19) ||
    (hi >= 22 && hi <= 24 && lo === hi - 2) ||
    (hi === 25 && (lo === 23 || lo === 24))
  );
}
export function walkoverScore(absent: "a" | "b"): Score {
  return absent === "a" ? { a: 0, b: 21 } : { a: 21, b: 0 };
}
