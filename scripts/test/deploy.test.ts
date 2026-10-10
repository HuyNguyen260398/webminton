// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const script = readFileSync("scripts/deploy.sh", "utf8");
const commands = script
  .split("\n")
  .filter((l) => !l.trim().startsWith("#"))
  .join("\n");

// The database owns tournament.json. A code deploy that uploaded the repo
// copy would replace live scores with whatever was last committed.
describe("deploy.sh", () => {
  it("never uploads tournament.json", () => {
    expect(commands).not.toMatch(/--include\s+"?tournament\.json/);
  });

  it("never deletes it either", () => {
    // A whole command, following its backslash continuations.
    const sync = [...commands.matchAll(/aws s3 sync(?:[^\n]*\\\n)*[^\n]*/g)].map(
      (m) => m[0],
    );
    expect(sync).toHaveLength(2);
    for (const s of sync) expect(s).toMatch(/--exclude\s+"tournament\.json"/);
  });
});
