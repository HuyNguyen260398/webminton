# Referees' Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A phone-first public page, `/trong-tai`, where a referee holding the organiser's six-digit code starts a bảng đấu match, scores it point by point, counts smashes and finishes it.

**Architecture:** A duel match may now carry a running score while `live`; everything that used "has a score" to mean "finished" switches to `status === "done"`. A new open route, `POST /api/referee/*`, checks an on/off flag in the public document and a code stored beside it, then turns the referee's narrow payload into the existing `saveDuelMatch` command with the stored pairs. The page keeps a local draft of the open match and saves it through a small debounced queue.

**Tech Stack:** TypeScript, Zod, Vitest, Next.js static export, Playwright, Terraform (API Gateway HTTP API), DynamoDB.

**Spec:** `docs/superpowers/specs/2026-10-12-referee-page-design.md`

## Global Constraints

- All user-facing copy and error messages are Vietnamese.
- `packages/domain/src` must stay browser-safe: no `node:*` imports.
- The code is six digits and must never appear in the served `tournament.json`.
- State changes only through `applyCommand`; a referee save becomes a `saveDuelMatch` command.
- Team totals, wins, `played`, `finished` and the leader count `done` matches only.
- Everything on `/trong-tai` works at 390px wide with no horizontal scroll; every control at least 48px, the two `+1` buttons at least 96px tall.
- Referee route throttle: `throttling_rate_limit = 10`, `throttling_burst_limit = 20`.
- Save debounce 500ms; retry every 2000ms.
- No resource with a fixed monthly fee.
- Read `frontend/AGENTS.md` before writing any Next.js file: check `frontend/node_modules/next/dist/docs/` for the layout/metadata conventions rather than trusting memory.
- `frontend/`, `backend/` and `scripts/` are outside `pnpm lint`; match the surrounding style by hand.

Two deliberate departures from the spec's wording, both small:

- `AdminState.secrets` is **optional** (`secrets?: Secrets`) rather than required. Absent means no code, which is what the spec asks of old stored items, and it leaves the dozen existing `{ document, private }` literals in tests valid.
- `POST /api/referee/match` returns `{ match, updatedAt }`, not just `{ match }`. The page needs the document's `updatedAt` to ignore a poll that was fetched before its own save landed (see Review Focus 1).

## Review Focus

1. **A poll fetched before a save lands arrives after it.** The referee's screen must not jump back to the older score — the next `+1` would then save the older number plus one. Pinned in Task 6 (`use-referee.test.tsx`, "ignores a snapshot older than its own last save").
2. **The organiser saves a smash count on a live match a referee is scoring.** The running score must survive. Pinned in Task 5 (`duel.spec.ts`, "saving smashes on a live match keeps the running score").
3. **API Gateway throttles a save (429).** That is "try again", not a refusal: the draft must stay and be retried. Pinned in Task 6 (`referee-api.test.ts`).
4. **The organiser changes the code mid-match.** The phone must drop its stored code and return to the code screen, not loop on a failing save. Pinned in Task 3 (router) and Task 7 (e2e, "a changed code sends the referee back to the code screen").
5. **`localStorage` is unavailable (private tab, blocked storage).** The page must still work, asking for the code on each load, rather than crash. Pinned in Task 6 (`referee-api.test.ts`).

## Files

| File | Change |
| --- | --- |
| `packages/domain/src/schema.ts` | score-by-status rule; `referee` field; `RefereeSaveSchema` |
| `packages/domain/src/duel.ts` | score rule in `validateDuelMatch`; `deriveDuel` counts `done`; `applyRefereeSave` |
| `packages/domain/src/commands.ts` | `Secrets`, `setRefereeCode`, `setRefereeOpen`, `resetDuel` clears `referee` |
| `backend/src/store.ts`, `dynamo-store.ts` | persist `secrets` |
| `backend/src/router.ts`, `errors.ts` | the referee gate and two paths; restore keeps the code |
| `scripts/seed.ts` | a forced reseed keeps the code |
| `infra/backend.tf`, `infra/test/architecture.test.ts` | the open route and its throttle |
| `frontend/src/features/duel/DuelBoard.tsx` | winner mark only on `done` |
| `frontend/src/features/admin/DuelTab.tsx`, `styles/admin.css` | `Trọng tài` card; live score kept |
| `frontend/src/lib/referee-api.ts` | **new** — fetch wrapper, stored code |
| `frontend/src/lib/use-referee.ts` | **new** — `SaveQueue`, `useMatchDraft` |
| `frontend/src/features/referee/*.tsx` | **new** — `RefereePortal`, `CodeGate`, `MatchList`, `MatchScorer` |
| `frontend/src/styles/referee.css` | **new** |
| `frontend/src/app/trong-tai/{layout,page}.tsx` | **new** |
| `tests/e2e/referee.spec.ts` | **new** |
| `CLAUDE.md`, `docs/runbooks/operations.md` | document the page |

## Before starting

- [ ] Create the branch and commit the two documents:

```bash
git checkout -b feat/referee-page
git add docs/superpowers/specs/2026-10-12-referee-page-design.md docs/superpowers/plans/2026-10-12-referee-page.md
git commit -m "docs: spec and plan for the referees' page"
```

---

### Task 1: A live match may carry a running score

**Files:**
- Modify: `packages/domain/src/schema.ts` (the `t.duel.matches.forEach` block in the `superRefine`, near line 244)
- Modify: `packages/domain/src/duel.ts` (`validateDuelMatch`, `deriveDuel`)
- Modify: `frontend/src/features/duel/DuelBoard.tsx` (`Row`)
- Test: `packages/domain/test/duel.test.ts`, `frontend/test/duel-board.test.tsx` (new)

**Interfaces:**
- Produces: a `DuelMatch` with `status: "live"` may have `score` non-null. `deriveDuel` ignores the score of any match that is not `done`.

- [ ] **Step 1: Change the existing test that forbids a live score, and add the new ones**

In `packages/domain/test/duel.test.ts`, find the block that expects a live save with `score: { red: 21, blue: 10 }` to throw `INVALID_SCORE` and replace that one `expect` with:

```ts
    expect(() =>
      save(s, {
        matchId: "vong-loai-1",
        status: "pending",
        score: { red: 1, blue: 0 },
      }),
    ).toThrow("INVALID_SCORE");
```

Then add, inside `describe("bảng đấu — totals", ...)`:

```ts
  it("shows a live match's running score but counts none of it", () => {
    const s = save(makeState(), {
      matchId: "vong-loai-1",
      status: "live",
      score: { red: 7, blue: 5 },
      smashes: { r1: { hit: 2, net: 0 } },
    });
    expect(s.document.duel!.matches[0].score).toEqual({ red: 7, blue: 5 });
    const r = deriveDuel(s.document)!;
    expect(r.totals.red).toEqual({ points: 0, wins: 0, finalPoints: 0 });
    expect(r.totals.blue).toEqual({ points: 0, wins: 0, finalPoints: 0 });
    expect(r.played).toBe(0);
    expect(r.leader).toBeNull();
    expect(r.smashHit[0]).toMatchObject({ athleteId: "r1", hit: 2 });
  });

  it("is not finished while the last match is still live with a score", () => {
    let s = makeState();
    for (const m of s.document.duel!.matches)
      s = done(s, m.id, 21, 10, m.category === "mixed_doubles" ? mixed : {});
    s = save(s, {
      matchId: "vong-loai-1",
      status: "live",
      score: { red: 21, blue: 10 },
    });
    const r = deriveDuel(s.document)!;
    expect(r.played).toBe(10);
    expect(r.finished).toBe(false);
  });
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run packages/domain/test/duel.test.ts`
Expected: the two new tests FAIL with `INVALID_SCORE`; the edited one fails because a pending match with a score is caught by the schema as `INVALID_DOCUMENT` or passes the wrong check.

- [ ] **Step 3: Change the rule in `duel.ts`**

In `validateDuelMatch`, replace the two score checks

```ts
  if ((m.status === "done") !== (m.score !== null))
    throw new Error("INVALID_SCORE");
  if (m.score && !isFinalScore({ a: m.score.red, b: m.score.blue }))
    throw new Error("INVALID_SCORE");
```

with

```ts
  // No score before the match is called; any running score while it is
  // played; a final one once it is done.
  const final =
    m.score !== null && isFinalScore({ a: m.score.red, b: m.score.blue });
  if (m.status === "pending" ? m.score !== null : m.status === "done" && !final)
    throw new Error("INVALID_SCORE");
```

In `deriveDuel`, replace `if (!m.score) continue;` with

```ts
    // A live match shows its score but only a finished one counts.
    if (m.status !== "done" || !m.score) continue;
```

and replace `const played = matches.filter((m) => m.score).length;` with

```ts
  const played = matches.filter((m) => m.status === "done").length;
```

- [ ] **Step 4: Change the rule in `schema.ts`**

In the `t.duel.matches.forEach` block, replace

```ts
        if ((m.status === "done") !== (m.score !== null))
          fail("Trận đã xong phải có tỉ số, trận chưa xong thì không");
```

with

```ts
        if (m.status === "pending" ? m.score !== null : m.status === "done" && m.score === null)
          fail("Trận chưa gọi không có tỉ số, trận đã xong phải có");
```

Also update the comment above `score` in `DuelMatchSchema`:

```ts
  // Null until the match is called; a running score while live; final when done.
  score: DuelScoreSchema.nullable(),
```

- [ ] **Step 5: Run the domain tests**

Run: `pnpm vitest run packages/domain`
Expected: PASS. If `schema.test.ts` has a case asserting a live match with a score is invalid, change it to a pending match with a score.

- [ ] **Step 6: Write the failing board test**

Create `frontend/test/duel-board.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { DuelMatchList } from "../src/features/duel/DuelBoard";
import { createDuelMatches } from "../../packages/domain/src/duel";
import { makeTournament } from "../../packages/domain/src/testing/fixtures";

function board(status: "live" | "done") {
  const t = makeTournament();
  for (const [id, teamId] of [
    ["r1", "red"],
    ["r2", "red"],
    ["b1", "blue"],
    ["b2", "blue"],
  ] as const)
    t.athletes.push({ id, name: id, gender: "male", teamId, active: true });
  const matches = createDuelMatches();
  Object.assign(matches[0], {
    pairRed: ["r1", "r2"],
    pairBlue: ["b1", "b2"],
    status,
    score: { red: 21, blue: 15 },
  });
  t.duel = { matches };
  return render(<DuelMatchList t={t} />).getByTestId("duel-vong-loai-1");
}

describe("DuelMatchList", () => {
  it("shows a live match's score without calling a winner", () => {
    const el = board("live");
    expect(el.textContent).toContain("21");
    expect(el.textContent).toContain("15");
    expect(el.querySelector(".is-winner")).toBeNull();
  });

  it("marks the winner once the match is done", () => {
    expect(board("done").querySelectorAll(".is-winner")).toHaveLength(1);
  });
});
```

Run: `pnpm vitest run frontend/test/duel-board.test.tsx`
Expected: "shows a live match's score without calling a winner" FAILS (one `.is-winner` found).

- [ ] **Step 7: Fix `Row` in `DuelBoard.tsx`**

Replace

```ts
  const won = m.score !== null && m.score[side] > m.score[other];
```

with

```ts
  const won =
    m.status === "done" && m.score !== null && m.score[side] > m.score[other];
```

- [ ] **Step 8: Run everything touched and commit**

Run: `pnpm vitest run packages/domain frontend/test && pnpm typecheck && pnpm --filter @webminton/frontend typecheck`
Expected: PASS.

```bash
git add packages/domain frontend/src/features/duel/DuelBoard.tsx frontend/test/duel-board.test.tsx
git commit -m "feat(duel): let a live match carry a running score"
```

---

### Task 2: The code, the switch and a referee's save in the domain

**Files:**
- Modify: `packages/domain/src/schema.ts`
- Modify: `packages/domain/src/duel.ts`
- Modify: `packages/domain/src/commands.ts`
- Test: `packages/domain/test/referee.test.ts` (new)

**Interfaces:**
- Consumes: Task 1's score rule.
- Produces:
  - `schema.ts`: `document.referee?: { open: boolean }`; `RefereeSaveSchema`; `type RefereeSave = { status: "live" | "done"; score: { red: number; blue: number } | null; smashes: Record<string, { hit: number; net: number }> }`.
  - `duel.ts`: `applyRefereeSave(m: DuelMatch, save: RefereeSave): DuelMatch` — returns **the same object `m`** when the save changes nothing.
  - `commands.ts`: `SecretsSchema`, `type Secrets = { refereeCode: string | null }`, `AdminState.secrets?: Secrets`, commands `setRefereeCode { code }` and `setRefereeOpen { open }`. `applyCommand` always returns a state with `secrets` set.

- [ ] **Step 1: Write the failing tests**

Create `packages/domain/test/referee.test.ts`:

```ts
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
    document.athletes.push({ id, name: id, gender: "male", teamId, active: true });
    priv[id] = { skillBand: 2, phone: null, note: "" };
  }
  const s = run({ document, private: priv }, { type: "createDuel", payload: {} });
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
      applyRefereeSave(m, { status: "done", score: { red, blue }, smashes: {} });
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
```

- [ ] **Step 2: Run to see them fail**

Run: `pnpm vitest run packages/domain/test/referee.test.ts`
Expected: FAIL — `applyRefereeSave` and `RefereeSave` do not exist.

- [ ] **Step 3: Add the schema pieces**

In `packages/domain/src/schema.ts`, directly after `DuelMatchSchema`:

```ts
// All a referee may send for a match. Pairs are the organiser's.
export const RefereeSaveSchema = z.strictObject({
  status: z.enum(["live", "done"]),
  score: DuelScoreSchema.nullable(),
  smashes: z.record(Id, SmashCountSchema),
});
```

In `PublicTournamentSchema`, directly after the `duel:` line:

```ts
    // Whether /trong-tai accepts saves. Absent means closed. The code the
    // referees type is a secret and is stored beside the document.
    referee: z.strictObject({ open: z.boolean() }).optional(),
```

Beside the other type exports at the bottom:

```ts
export type RefereeSave = z.infer<typeof RefereeSaveSchema>;
```

- [ ] **Step 4: Add `applyRefereeSave` to `duel.ts`**

Change the import at the top to include the new type:

```ts
import type { DuelMatch, RefereeSave, TournamentDocument } from "./schema";
```

Add after `validateDuelMatch`:

```ts
type Smashes = DuelMatch["smashes"];
const sameSmashes = (a: Smashes, b: Smashes) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(
    ([id, s]) => b[id]?.hit === s.hit && b[id]?.net === s.net,
  );

// What a referee's save makes of the stored match. Pairs never change here.
// A save that changes nothing gives back the stored match itself, so the
// caller can tell a retry from an edit — and so a repeated "kết thúc" whose
// reply was lost is answered, not refused.
export function applyRefereeSave(m: DuelMatch, save: RefereeSave): DuelMatch {
  const players = playersOf(m);
  const smashes = Object.fromEntries(
    Object.entries(save.smashes).filter(
      ([id, s]) => players.includes(id) && (s.hit > 0 || s.net > 0),
    ),
  );
  if (
    m.status === save.status &&
    m.score?.red === save.score?.red &&
    m.score?.blue === save.score?.blue &&
    sameSmashes(m.smashes, smashes)
  )
    return m;
  if (m.status === "done") throw new Error("REFEREE_MATCH_DONE");
  if (!(m.pairRed && m.pairBlue)) throw new Error("DUEL_NEEDS_PAIRS");
  if (m.status === "pending" && save.status === "done")
    throw new Error("REFEREE_BAD_MOVE");
  const final =
    save.score !== null &&
    isFinalScore({ a: save.score.red, b: save.score.blue });
  if (save.status === "done" && !final) throw new Error("INVALID_SCORE");
  return { ...m, status: save.status, score: save.score, smashes };
}
```

- [ ] **Step 5: Add secrets and the two commands to `commands.ts`**

After `PrivateMapSchema` and its types, replace the `AdminState` interface:

```ts
// What belongs to no athlete and must never be published.
export const RefereeCode = z.string().regex(/^\d{6}$/);
export const SecretsSchema = z.strictObject({
  refereeCode: RefereeCode.nullable(),
});
export type Secrets = z.infer<typeof SecretsSchema>;

export interface AdminState {
  document: TournamentDocument;
  private: PrivateMap;
  // Absent on anything stored before the referees' page: no code.
  secrets?: Secrets;
}
```

In `CommandSchema`, after the `saveDuelMatch` entry:

```ts
  command("setRefereeCode", z.strictObject({ code: RefereeCode })),
  command("setRefereeOpen", z.strictObject({ open: z.boolean() })),
```

Change `finalize` to carry the secrets through:

```ts
function finalize(
  t: TournamentDocument,
  priv: PrivateMap,
  secrets: Secrets,
  now: string,
): AdminState {
```

and its return to:

```ts
  return {
    document: parsed.data,
    private: PrivateMapSchema.parse(priv),
    secrets: SecretsSchema.parse(secrets),
  };
```

In `applyCommand`, after `const priv = structuredClone(state.private);`:

```ts
  const secrets: Secrets = { refereeCode: state.secrets?.refereeCode ?? null };
```

Change the last line of `applyCommand` to `return finalize(t, priv, secrets, now);`.

Replace the `resetDuel` case and add the two new ones after `saveDuelMatch`'s case:

```ts
    case "resetDuel":
      delete t.duel;
      delete t.referee;
      break;
```

```ts
    case "setRefereeCode":
      secrets.refereeCode = c.payload.code;
      break;
    case "setRefereeOpen":
      if (c.payload.open) {
        if (!t.duel || t.duel.matches.length === 0)
          throw new Error("DUEL_REQUIRED");
        if (!secrets.refereeCode) throw new Error("REFEREE_NEEDS_CODE");
      }
      t.referee = { open: c.payload.open };
      break;
```

- [ ] **Step 6: Run the domain tests and typecheck**

Run: `pnpm vitest run packages/domain && pnpm typecheck`
Expected: PASS. If an existing test compares a whole `AdminState` with `toEqual` and now fails on the extra `secrets` key, add `secrets: { refereeCode: null }` to its expected value.

- [ ] **Step 7: Commit**

```bash
git add packages/domain
git commit -m "feat(domain): referee code, open switch and a referee's save"
```

---

### Task 3: The referee route in the Lambda

**Files:**
- Modify: `backend/src/store.ts` (`nextStored`, `MemoryStore.write`)
- Modify: `backend/src/dynamo-store.ts` (`write`)
- Modify: `backend/src/router.ts`
- Modify: `backend/src/errors.ts`
- Modify: `scripts/seed.ts` (the CLI block at the bottom)
- Test: `backend/test/referee.test.ts` (new), `backend/test/store.test.ts`, `backend/test/dynamo-store.test.ts`

**Interfaces:**
- Consumes: `applyRefereeSave`, `RefereeSaveSchema`, `Secrets`, commands `setRefereeCode` / `setRefereeOpen` (Task 2).
- Produces:
  - `POST /api/referee/check` body `{ code: string }` → `200 {}`.
  - `POST /api/referee/match` body `{ code, matchId, status, score, smashes }` → `200 { match: DuelMatch, updatedAt: string }`.
  - Errors: `REFEREE_CLOSED` 403, `REFEREE_CODE` 401, `REFEREE_MATCH_DONE` / `REFEREE_BAD_MOVE` / `REFEREE_NEEDS_CODE` / `DUEL_REQUIRED` 422, each `{ code, message }`.
  - `AdminView.secrets: Secrets` on every admin response.
  - `export const REFEREE_ACTOR = "trong-tai"`.

- [ ] **Step 1: Write the failing store tests**

Add to `backend/test/store.test.ts`, inside its main `describe`, using the file's existing helpers for a state and an entry (it already writes `makeAdminState()` with an entry object; reuse those names):

```ts
  it("keeps the secrets beside the document, in the current item and in history", async () => {
    const store = new MemoryStore();
    const state = { ...makeAdminState(), secrets: { refereeCode: "048213" } };
    const saved = await store.write(null, state, {
      at: "2026-10-18T08:00:00+07:00",
      actorEmail: "btc@example.com",
      commandType: "setRefereeCode",
      requestId: "r1",
    });
    expect(saved.secrets).toEqual({ refereeCode: "048213" });
    expect((await store.read())!.secrets).toEqual({ refereeCode: "048213" });
    expect((await store.snapshot(1))!.secrets).toEqual({ refereeCode: "048213" });
  });

  it("reads a state stored without secrets as having none", async () => {
    const store = new MemoryStore();
    await store.write(null, makeAdminState(), {
      at: "2026-10-18T08:00:00+07:00",
      actorEmail: "seed",
      commandType: "seed",
      requestId: "seed",
    });
    expect((await store.read())!.secrets).toBeUndefined();
  });
```

Add to `backend/test/dynamo-store.test.ts`, beside the test that asserts `read!.private` (it has a fake `db` and a `state`; follow that test's setup exactly and add):

```ts
    // Same round trip as above, with a code set.
    const withCode = { ...state, secrets: { refereeCode: "048213" } };
    const again = await store.write(await store.read(), withCode, {
      at: "2026-10-18T08:00:00+07:00",
      actorEmail: "btc@example.com",
      commandType: "setRefereeCode",
      requestId: "code",
    });
    expect(again.secrets).toEqual({ refereeCode: "048213" });
    expect((await store.read())!.secrets).toEqual({ refereeCode: "048213" });
```

Run: `pnpm vitest run backend/test/store.test.ts backend/test/dynamo-store.test.ts`
Expected: FAIL — `secrets` is `undefined` after the round trip.

- [ ] **Step 2: Persist the secrets**

`backend/src/store.ts`, in `nextStored`, after `private: next.private,`:

```ts
    secrets: next.secrets,
```

In `MemoryStore.write`, replace the `state:` line:

```ts
      state: JSON.stringify({
        document: next.document,
        private: next.private,
        secrets: next.secrets,
      }),
```

`backend/src/dynamo-store.ts`, in `write`:

```ts
    const state = JSON.stringify({
      document: next.document,
      private: next.private,
      secrets: next.secrets,
    });
```

Run the same command. Expected: PASS.

- [ ] **Step 3: Write the failing router tests**

Create `backend/test/referee.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REFEREE_ACTOR, route, type AdminView, type Deps } from "../src/router";
import { MemoryStore } from "../src/store";
import { makeAdminState } from "../../packages/domain/src/testing/fixtures";

const ADMIN = { email: "btc@example.com", email_verified: "true" };
const CODE = "048213";
let deps: Deps;
let published: string[];

const call = (method: string, path: string, body?: unknown, claims: unknown = null) =>
  route(
    {
      method,
      path,
      rawBody: body === undefined ? null : JSON.stringify(body),
      claims: (claims ?? undefined) as Record<string, unknown> | undefined,
    },
    deps,
  );
const view = async () =>
  (await call("GET", "/api/admin/state", undefined, ADMIN)).body as AdminView;
let n = 0;
async function admin(command: unknown) {
  const res = await call(
    "POST",
    "/api/admin/commands",
    { baseVersion: (await view()).version, requestId: `a-${++n}`, command },
    ADMIN,
  );
  expect(res.status, JSON.stringify(res.body)).toBe(200);
}
const referee = (body: Record<string, unknown>, code = CODE) =>
  call("POST", "/api/referee/match", {
    code,
    matchId: "vong-loai-1",
    status: "live",
    score: null,
    smashes: {},
    ...body,
  });
const stored = async () => (await view()).document.duel!.matches[0];
let pairs: { pairRed: [string, string]; pairBlue: [string, string] };

// The bảng đấu created, trận 1 given its pairs, a code set, refereeing open.
beforeEach(async () => {
  published = [];
  const store = new MemoryStore();
  await store.write(null, makeAdminState(), {
    at: "2026-10-10T00:00:00+07:00",
    actorEmail: "seed",
    commandType: "seed",
    requestId: "seed",
  });
  deps = {
    store,
    publish: async (body) => void published.push(body),
    adminEmails: ["btc@example.com"],
    config: { cognitoDomain: null, clientId: null, devLogin: false },
    now: () => "2026-10-18T08:00:00+07:00",
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
  const men = (await view()).document.athletes.filter((a) => a.gender === "male");
  for (const [a, teamId] of [
    [men[0], "red"],
    [men[1], "red"],
    [men[2], "blue"],
    [men[3], "blue"],
  ] as const)
    await admin({ type: "setAthleteTeam", payload: { athleteId: a.id, teamId } });
  pairs = {
    pairRed: [men[0].id, men[1].id],
    pairBlue: [men[2].id, men[3].id],
  };
  await admin({ type: "createDuel", payload: {} });
  await admin({
    type: "saveDuelMatch",
    payload: { matchId: "vong-loai-1", ...pairs, status: "pending", score: null, smashes: {} },
  });
  await admin({ type: "setRefereeCode", payload: { code: CODE } });
  await admin({ type: "setRefereeOpen", payload: { open: true } });
});

describe("referee — the gate", () => {
  const check = (code: unknown) => call("POST", "/api/referee/check", { code });

  it("accepts the code and nothing else", async () => {
    expect(await check(CODE)).toEqual({ status: 200, body: {} });
    for (const wrong of ["048214", "04821", "0482130", ""]) {
      const res = await check(wrong);
      expect(res.status).toBe(401);
      expect((res.body as { code: string }).code).toBe("REFEREE_CODE");
    }
    expect((await check(48213)).status).toBe(400);
    expect((await call("POST", "/api/referee/check", {})).status).toBe(400);
  });

  it("refuses everything while closed, even with the right code", async () => {
    await admin({ type: "setRefereeOpen", payload: { open: false } });
    expect((await check(CODE)).status).toBe(403);
    const res = await referee({});
    expect(res.status).toBe(403);
    expect((res.body as { code: string }).code).toBe("REFEREE_CLOSED");
    expect((await stored()).status).toBe("pending");
  });

  it("refuses a save with a wrong code and stops trusting an old one", async () => {
    expect((await referee({}, "000000")).status).toBe(401);
    await admin({ type: "setRefereeCode", payload: { code: "999999" } });
    expect((await referee({})).status).toBe(401);
    expect((await referee({}, "999999")).status).toBe(200);
  });

  it("does not answer on any other path or method", async () => {
    expect((await call("POST", "/api/referee/other", { code: CODE })).status).toBe(404);
    expect((await call("GET", "/api/referee/check")).status).toBe(404);
  });
});

describe("referee — scoring a match", () => {
  it("starts, scores and finishes, publishing each step under its own name", async () => {
    const before = published.length;
    let res = await referee({});
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      match: { status: "live", score: null, ...pairs },
      updatedAt: "2026-10-18T08:00:00+07:00",
    });
    const who = pairs.pairRed[0];
    res = await referee({ score: { red: 3, blue: 2 }, smashes: { [who]: { hit: 1, net: 0 } } });
    expect((res.body as { match: unknown }).match).toMatchObject({
      score: { red: 3, blue: 2 },
      smashes: { [who]: { hit: 1, net: 0 } },
    });
    res = await referee({ status: "done", score: { red: 21, blue: 15 } });
    expect(res.status).toBe(200);
    expect(await stored()).toMatchObject({ status: "done", score: { red: 21, blue: 15 } });
    expect(published.length).toBe(before + 3);
    const history = (await call("GET", "/api/admin/history", undefined, ADMIN)).body as {
      entries: { actorEmail: string; commandType: string }[];
    };
    expect(history.entries[0]).toMatchObject({
      actorEmail: REFEREE_ACTOR,
      commandType: "refereeMatch",
    });
  });

  it("never publishes the code", async () => {
    await referee({ score: { red: 1, blue: 0 } });
    expect(published.at(-1)).not.toContain(CODE);
    expect(published.at(-1)).not.toContain("refereeCode");
    expect(JSON.parse(published.at(-1)!).referee).toEqual({ open: true });
  });

  it("cannot change the pairs, or anything a strict body does not name", async () => {
    const swapped = { pairRed: pairs.pairBlue, pairBlue: pairs.pairRed };
    expect((await referee(swapped)).status).toBe(400);
    expect((await referee({ stage: "final" })).status).toBe(400);
    expect((await stored()).pairRed).toEqual(pairs.pairRed);
  });

  it("refuses an unknown match, a match without pairs and a bad finish", async () => {
    expect((await referee({ matchId: "khong-co" })).status).toBe(422);
    const noPairs = await referee({ matchId: "vong-loai-2" });
    expect((noPairs.body as { code: string }).code).toBe("DUEL_NEEDS_PAIRS");
    const early = await referee({ status: "done", score: { red: 21, blue: 15 } });
    expect((early.body as { code: string }).code).toBe("REFEREE_BAD_MOVE");
    await referee({});
    const short = await referee({ status: "done", score: { red: 20, blue: 15 } });
    expect((short.body as { code: string }).code).toBe("INVALID_SCORE");
  });

  it("locks a finished match but answers a repeated finish", async () => {
    await referee({});
    const finish = { status: "done", score: { red: 21, blue: 15 } };
    expect((await referee(finish)).status).toBe(200);
    const version = (await view()).version;
    // The reply was lost and the phone sends it again.
    expect((await referee(finish)).status).toBe(200);
    expect((await view()).version).toBe(version);
    const edit = await referee({ status: "live", score: { red: 20, blue: 15 } });
    expect(edit.status).toBe(422);
    expect((edit.body as { code: string }).code).toBe("REFEREE_MATCH_DONE");
  });

  it("writes nothing when the save changes nothing", async () => {
    await referee({ score: { red: 3, blue: 2 } });
    const { version } = await view();
    const count = published.length;
    expect((await referee({ score: { red: 3, blue: 2 } })).status).toBe(200);
    expect((await view()).version).toBe(version);
    expect(published.length).toBe(count);
  });

  it("saves over a version collision with the other court", async () => {
    const write = deps.store.write.bind(deps.store);
    let collided = false;
    deps.store.write = async (prev, next, entry) => {
      if (!collided) {
        collided = true;
        // The other court's save lands between this one's read and write. It
        // leaves this match alone, so the retry still has its work to do.
        await write(
          prev,
          { document: prev!.document, private: prev!.private, secrets: prev!.secrets },
          { ...entry, requestId: "other-court" },
        );
        throw new Error("CONFLICT");
      }
      return write(prev, next, entry);
    };
    const res = await referee({ score: { red: 1, blue: 0 } });
    expect(res.status).toBe(200);
    expect(collided).toBe(true);
    expect((await stored()).score).toEqual({ red: 1, blue: 0 });
  });
});

describe("referee — the organiser's side", () => {
  it("shows the organiser the code", async () => {
    expect((await view()).secrets).toEqual({ refereeCode: CODE });
  });

  it("keeps the current code when an old version is restored", async () => {
    const { version } = await view();
    await admin({ type: "setRefereeCode", payload: { code: "999999" } });
    const res = await call(
      "POST",
      "/api/admin/restore",
      { baseVersion: (await view()).version, requestId: "undo", version },
      ADMIN,
    );
    expect(res.status).toBe(200);
    expect((await view()).secrets).toEqual({ refereeCode: "999999" });
  });
});
```

Run: `pnpm vitest run backend/test/referee.test.ts`
Expected: FAIL — `REFEREE_ACTOR` is not exported and the paths answer 404.

- [ ] **Step 4: Add the errors**

`backend/src/errors.ts`, in `http` after `NOT_FOUND`:

```ts
  REFEREE_CLOSED: [403, "BTC chưa mở chấm điểm cho trọng tài, hoặc đã đóng rồi."],
  REFEREE_CODE: [401, "Mã trọng tài không đúng."],
```

In `domain`, after `DUEL_HAS_LINEUPS`:

```ts
  DUEL_REQUIRED: "Chưa có bảng đấu — tạo bảng đấu trước.",
  REFEREE_NEEDS_CODE: "Tạo mã trọng tài trước khi mở.",
  REFEREE_MATCH_DONE: "Trận đã kết thúc — nhờ BTC mở lại nếu cần sửa.",
  REFEREE_BAD_MOVE: "Phải bắt đầu trận trước khi kết thúc.",
```

- [ ] **Step 5: Add the route to `router.ts`**

Change the first import line and add two imports:

```ts
import { randomInt, timingSafeEqual } from "node:crypto";
```

```ts
import {
  Id,
  PublicTournamentSchema,
  RefereeSaveSchema,
} from "../../packages/domain/src/schema";
import { applyRefereeSave } from "../../packages/domain/src/duel";
```

Import the `Secrets` type from commands alongside `AdminState`:

```ts
  type AdminState,
  type Secrets,
```

Make the view always carry secrets. Change `AdminView` and `view`:

```ts
export interface AdminView extends AdminState {
  secrets: Secrets;
  version: number;
  publishedVersion: number;
  published?: boolean;
}
```

```ts
const view = (s: StoredState): AdminView => ({
  version: s.version,
  publishedVersion: s.publishedVersion,
  document: s.document,
  private: s.private,
  secrets: s.secrets ?? { refereeCode: null },
});
```

After `TeamDrawBody`:

```ts
const RefereeCheckBody = z.strictObject({ code: z.string().max(20) });
const RefereeMatchBody = z.strictObject({
  code: z.string().max(20),
  matchId: Id,
  ...RefereeSaveSchema.shape,
});
```

Rename `TEAM_DRAW_TRIES` to `OPEN_WRITE_TRIES` (both uses) and add beside `TEAM_DRAW_ACTOR`:

```ts
// What history shows for a save made on /trong-tai.
export const REFEREE_ACTOR = "trong-tai";
```

After the `teamDraw` function:

```ts
// The switch is the organiser's; the code is what the referees were told.
function refereeGate(cur: StoredState, code: string): void {
  if (!cur.document.referee?.open) throw new Error("REFEREE_CLOSED");
  const want = Buffer.from(cur.secrets?.refereeCode ?? "");
  const got = Buffer.from(code);
  if (
    want.length === 0 ||
    got.length !== want.length ||
    !timingSafeEqual(got, want)
  )
    throw new Error("REFEREE_CODE");
}

// The other open write. A referee names one match and sends its status,
// score and smash counts; the pairs come from the table, so this cannot
// re-seat anyone. Two courts saving at once collide on the version, and the
// loser goes again over the new state — its match is untouched by the other.
async function refereeMatch(
  deps: Deps,
  body: z.infer<typeof RefereeMatchBody>,
): Promise<ApiResponse> {
  const { code, matchId, ...save } = body;
  for (let attempt = 1; ; attempt++) {
    const cur = await current(deps);
    refereeGate(cur, code);
    const m = cur.document.duel?.matches.find((x) => x.id === matchId);
    if (!m) throw new Error("MATCH_NOT_FOUND");
    const next = applyRefereeSave(m, save);
    // Nothing to change: a retry, or a second tap. Not worth a version.
    if (next === m) return ok({ match: m, updatedAt: cur.document.updatedAt });
    const state = applyCommand(
      cur,
      {
        type: "saveDuelMatch",
        payload: {
          matchId,
          pairRed: next.pairRed,
          pairBlue: next.pairBlue,
          status: next.status,
          score: next.score,
          smashes: next.smashes,
        },
      },
      REFEREE_ACTOR,
      deps.now(),
    );
    try {
      const saved = await deps.store.write(cur, state, {
        at: deps.now(),
        actorEmail: REFEREE_ACTOR,
        commandType: "refereeMatch",
        requestId: `referee-${matchId}-${cur.version + 1}`,
      });
      await publishState(deps, saved);
      return ok({
        match: saved.document.duel?.matches.find((x) => x.id === matchId),
        updatedAt: saved.document.updatedAt,
      });
    } catch (e) {
      const conflict = e instanceof Error && e.message === "CONFLICT";
      if (!conflict || attempt >= OPEN_WRITE_TRIES) throw e;
    }
  }
}
```

In `route`, after the `POST /api/team-draw` branch:

```ts
    if (key === "POST /api/referee/check") {
      const { code } = parse(RefereeCheckBody, req.rawBody);
      refereeGate(await current(deps), code);
      return ok({});
    }
    if (key === "POST /api/referee/match")
      return await refereeMatch(deps, parse(RefereeMatchBody, req.rawBody));
```

In the `POST /api/admin/restore` case, change the producer from `() => ({` to take the current state and keep its code:

```ts
        return await commit(deps, actor, body, `restore:${body.version}`, (s) => ({
          document: PublicTournamentSchema.parse({
            ...old.document,
            updatedAt: deps.now(),
          }),
          private: PrivateMapSchema.parse(old.private),
          // An undo must not change what the referees were told.
          secrets: s.secrets,
        }));
```

- [ ] **Step 6: Keep the code across a forced reseed**

`scripts/seed.ts`, in the CLI block at the bottom, read the table once and pass the secrets through:

```ts
    const existing = await store.read();
    const state = {
      ...buildSeed(
        JSON.parse(readFileSync(PUBLIC, "utf8")),
        existsSync(PRIVATE) ? JSON.parse(readFileSync(PRIVATE, "utf8")) : null,
        existing?.private,
      ),
      secrets: existing?.secrets,
    };
```

- [ ] **Step 7: Run the backend and script tests, typecheck, commit**

Run: `pnpm vitest run backend scripts && pnpm typecheck`
Expected: PASS. An existing router test that compares an admin response body with `toEqual` may now need `secrets: { refereeCode: null }` in its expected value.

```bash
git add backend scripts/seed.ts
git commit -m "feat(backend): the referee route — code gate, narrow save, retry on collision"
```

---

### Task 4: The API Gateway route

**Files:**
- Modify: `infra/backend.tf`
- Modify: `infra/test/architecture.test.ts` (the test "puts every admin route behind the JWT authorizer")

**Interfaces:**
- Consumes: the Lambda paths `/api/referee/check` and `/api/referee/match` (Task 3).
- Produces: `aws_apigatewayv2_route.referee`, route key `POST /api/referee/{proxy+}`, no authorizer, throttle 10/20.

- [ ] **Step 1: Extend the architecture test**

In that test, change the expected route names to

```ts
    expect(routes.map((r) => r.name).sort()).toEqual([
      "admin",
      "config",
      "referee",
      "team_draw",
    ]);
```

and add at the end of the same test:

```ts
    // The third open route: referees scoring on /trong-tai. The Lambda checks
    // the organiser's code on every call; the throttle caps guessing.
    const referee = routes.find((r) => r.name === "referee")!.body;
    expect(referee).toMatch(/route_key\s+=\s+"POST \/api\/referee\/\{proxy\+\}"/);
    expect(referee).not.toContain("authorization_type");
    expect(backend).toMatch(
      /route_settings\s*{\s*route_key\s+=\s+aws_apigatewayv2_route\.referee\.route_key\s+throttling_rate_limit\s+=\s+10\s+throttling_burst_limit\s+=\s+20\s/,
    );
```

Update the comment "Two routes are open." in that test to "Three routes are open."

Run: `pnpm vitest run infra/test/architecture.test.ts`
Expected: FAIL — no route named `referee`.

- [ ] **Step 2: Add the route**

`infra/backend.tf`, after `aws_apigatewayv2_route.team_draw`:

```hcl
# Open on purpose: referees score their own match on /trong-tai without
# signing in. The Lambda refuses every call unless the organiser has switched
# refereeing on and the request carries the code the organiser set.
resource "aws_apigatewayv2_route" "referee" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /api/referee/{proxy+}"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}
```

In `aws_apigatewayv2_stage.default`, after the `team_draw` `route_settings` block:

```hcl
  # Two courts, each saving at most twice a second. At this rate a six-digit
  # code takes about fourteen hours to guess on average.
  route_settings {
    route_key              = aws_apigatewayv2_route.referee.route_key
    throttling_rate_limit  = 10
    throttling_burst_limit = 20
  }
```

- [ ] **Step 3: Verify and commit**

Run: `pnpm vitest run infra/test/architecture.test.ts && terraform -chdir=infra fmt -check && terraform -chdir=infra validate`
Expected: test PASS, `fmt` silent, `validate` "Success!". If `terraform validate` reports the directory is not initialised, run `terraform -chdir=infra init -backend=false` first.

```bash
git add infra
git commit -m "feat(infra): open, throttled route for the referees' page"
```

Do **not** run `terraform apply` here. The first apply of a new route is the organiser's, by hand (Task 8).

---

### Task 5: The organiser's `Trọng tài` card, and keeping a live score

**Files:**
- Modify: `frontend/src/features/admin/DuelTab.tsx`
- Modify: `frontend/src/styles/admin.css`
- Test: `tests/e2e/duel.spec.ts`

**Interfaces:**
- Consumes: `view.secrets.refereeCode`, `view.document.referee?.open`, commands `setRefereeCode` / `setRefereeOpen` (Tasks 2–3).
- Produces: in the `Trận` tab, `data-testid="referee-code"` holding the code, and buttons named `Tạo mã`, `Đổi mã`, `Mở chấm điểm`, `Đóng chấm điểm`.

- [ ] **Step 1: Write the failing e2e tests**

Add to `tests/e2e/duel.spec.ts`. The file's `State` interface needs two more fields; extend it:

```ts
interface State {
  version: number;
  document: {
    athletes: Athlete[];
    referee?: { open: boolean };
    duel?: { matches: { id: string; status: string; score: unknown }[] };
  };
  secrets: { refereeCode: string | null };
}
```

Then the tests:

```ts
test("the organiser creates a code and opens refereeing", async ({
  page,
  request,
}) => {
  await send(request, { type: "createDuel", payload: {} });
  await signIn(page);
  await expect(page.getByTestId("referee-code")).toHaveText("Chưa có mã");
  await expect(page.getByRole("button", { name: "Mở chấm điểm" })).toBeDisabled();

  await page.getByRole("button", { name: "Tạo mã" }).click();
  await expect(page.getByTestId("referee-code")).toHaveText(/^\d{6}$/);
  const code = await page.getByTestId("referee-code").innerText();
  expect((await state(request)).secrets.refereeCode).toBe(code);

  await page.getByRole("button", { name: "Mở chấm điểm" }).click();
  await expect(page.getByRole("button", { name: "Đóng chấm điểm" })).toBeVisible();
  expect((await state(request)).document.referee).toEqual({ open: true });
  expect(await (await request.get("/tournament.json")).text()).not.toContain(code);
});

test("saving smashes on a live match keeps the running score", async ({
  page,
  request,
}) => {
  const { athletes } = (await state(request)).document;
  const [r1, r2] = men(athletes, "red");
  const [b1, b2] = men(athletes, "blue");
  await send(request, { type: "createDuel", payload: {} });
  // As if a referee were three points in.
  await send(request, {
    type: "saveDuelMatch",
    payload: {
      matchId: "vong-loai-1",
      pairRed: [r1.id, r2.id],
      pairBlue: [b1.id, b2.id],
      status: "live",
      score: { red: 3, blue: 2 },
      smashes: {},
    },
  });
  await signIn(page);
  await page.getByRole("button", { name: /Trận 1 ·/ }).click();
  await page.getByRole("button", { name: `Tăng Smash ăn điểm của ${r1.name}` }).click();
  await page.getByRole("button", { name: "Lưu số smash" }).click();
  await expect(page.getByText("Đã lưu số smash.")).toBeVisible();
  const m = (await state(request)).document.duel!.matches[0];
  expect(m.status).toBe("live");
  expect(m.score).toEqual({ red: 3, blue: 2 });
});

test("reopening a finished match keeps its score for correcting", async ({
  page,
  request,
}) => {
  const { athletes } = (await state(request)).document;
  const [r1, r2] = men(athletes, "red");
  const [b1, b2] = men(athletes, "blue");
  await send(request, { type: "createDuel", payload: {} });
  await send(request, {
    type: "saveDuelMatch",
    payload: {
      matchId: "vong-loai-1",
      pairRed: [r1.id, r2.id],
      pairBlue: [b1.id, b2.id],
      status: "done",
      score: { red: 21, blue: 15 },
      smashes: {},
    },
  });
  await signIn(page);
  await page.getByRole("button", { name: /Trận 1 ·/ }).click();
  const reopen = page.getByRole("button", { name: "Mở lại trận" });
  await reopen.click();
  await page.getByRole("button", { name: "Bấm lần nữa để xác nhận" }).click();
  await expect(page.getByText("Đã mở lại trận")).toBeVisible();
  const m = (await state(request)).document.duel!.matches[0];
  expect(m.status).toBe("live");
  expect(m.score).toEqual({ red: 21, blue: 15 });
});
```

Run: `pnpm build && pnpm exec playwright test tests/e2e/duel.spec.ts`
Expected: the three new tests FAIL (no `referee-code`; the score comes back `null`).

- [ ] **Step 2: Keep the score in `MatchEditor`**

In `frontend/src/features/admin/DuelTab.tsx`, three call sites of `save` change. A live match now sends whatever score is entered:

`Lưu chỉnh sửa` and `Kết thúc trận` are unchanged. `Mở lại trận` becomes:

```tsx
              <ConfirmButton
                label="Mở lại trận"
                disabled={busy}
                onConfirm={() =>
                  save("live", true, "Đã mở lại trận — tỉ số được giữ để sửa.")
                }
              />
```

The ghost button's handler becomes:

```tsx
                onClick={() =>
                  save(
                    m.status,
                    // A referee may be scoring this match: keep the running
                    // score rather than send it back empty.
                    m.status === "live",
                    m.status === "live" ? "Đã lưu số smash." : "Đã lưu cặp.",
                  )
                }
```

And the helper text under the score, replacing the first branch:

```tsx
              {final === null
                ? "Trọng tài chấm từng điểm ở /trong-tai, hoặc nhập điểm của hai đội khi trận kết thúc."
                : valid
                  ? "Tỉ số hợp lệ."
                  : m.status === "live"
                    ? "Trận đang đánh."
                    : "Chưa hợp lệ: séc tới 21, hơn 2 điểm, trần 25."}
```

- [ ] **Step 3: Add the `Trọng tài` card**

In the same file, above `export function DuelTab`:

```tsx
// Six digits from the browser's own generator. applyCommand stays pure.
const newCode = () =>
  String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(
    6,
    "0",
  );

function RefereeCard({ admin }: { admin: ReadyAdmin }) {
  const { view, send, busy } = admin;
  const code = view.secrets?.refereeCode ?? null;
  const open = view.document.referee?.open ?? false;
  const [link, setLink] = useState("/trong-tai/");
  const [copied, setCopied] = useState(false);
  useEffect(() => setLink(`${location.origin}/trong-tai/`), []);
  const setCode = () =>
    send(
      { type: "setRefereeCode", payload: { code: newCode() } },
      "Đã tạo mã trọng tài mới.",
    );
  return (
    <Card title="Trọng tài">
      <div className="admin-stack">
        <p>
          Trọng tài mở trang dưới đây trên điện thoại, nhập mã rồi tự bắt đầu
          trận, chấm từng điểm và đếm smash. Cặp đấu vẫn do BTC xếp ở đây.
        </p>
        <div className="pill-row">
          <Pill tone={open ? "green" : "outline"}>
            {open ? "Đang mở" : "Đang đóng"}
          </Pill>
        </div>
        <p className="referee-code" data-testid="referee-code">
          {code ?? "Chưa có mã"}
        </p>
        <div className="row-actions">
          {code ? (
            <ConfirmButton label="Đổi mã" disabled={busy} onConfirm={setCode} />
          ) : (
            <button type="button" disabled={busy} onClick={setCode}>
              Tạo mã
            </button>
          )}
          <button
            type="button"
            className={open ? "button--ghost" : undefined}
            disabled={busy || !code}
            onClick={() =>
              send(
                { type: "setRefereeOpen", payload: { open: !open } },
                open
                  ? "Đã đóng chấm điểm cho trọng tài."
                  : "Đã mở chấm điểm cho trọng tài.",
              )
            }
          >
            {open ? "Đóng chấm điểm" : "Mở chấm điểm"}
          </button>
        </div>
        <small>
          Đổi mã là khoá mọi điện thoại đang dùng mã cũ. Đóng chấm điểm là
          chặn mọi trọng tài cho tới khi mở lại.
        </small>
        <div className="row-actions">
          <code className="referee-link">{link}</code>
          <button
            type="button"
            className="button--ghost"
            onClick={() =>
              navigator.clipboard
                ?.writeText(link)
                .then(() => setCopied(true))
                .catch(() => {})
            }
          >
            {copied ? "Đã chép" : "Chép link"}
          </button>
        </div>
      </div>
    </Card>
  );
}
```

Render it in `DuelTab`'s main return, directly after the `Tổng điểm` card and before `<ul className="pick-list">`:

```tsx
        <RefereeCard admin={admin} />
```

- [ ] **Step 4: Style the code**

Append to `frontend/src/styles/admin.css`:

```css
.referee-code {
  margin: 0;
  font-size: 2.4rem;
  font-weight: 900;
  letter-spacing: 0.18em;
  font-variant-numeric: tabular-nums;
}
.referee-link {
  flex: 1 1 12rem;
  min-width: 0;
  overflow-wrap: anywhere;
  align-self: center;
}
```

- [ ] **Step 5: Verify and commit**

Run: `pnpm --filter @webminton/frontend typecheck && pnpm build && pnpm exec playwright test tests/e2e/duel.spec.ts`
Expected: PASS, including the file's existing tests.

Then look at it: `node --import tsx scripts/serve-static.ts` in one terminal, sign in at `http://127.0.0.1:3100/quan-tri/#tran-dau` at 390px wide and at 1280px, and confirm the card does not overflow at either width.

```bash
git add frontend/src/features/admin/DuelTab.tsx frontend/src/styles/admin.css tests/e2e/duel.spec.ts
git commit -m "feat(admin): Trọng tài card, and keep a live match's running score"
```

---

### Task 6: The page's API client and save queue

**Files:**
- Create: `frontend/src/lib/referee-api.ts`
- Create: `frontend/src/lib/use-referee.ts`
- Test: `frontend/test/referee-api.test.ts`, `frontend/test/use-referee.test.tsx` (both new)

**Interfaces:**
- Consumes: `POST /api/referee/check`, `POST /api/referee/match` → `{ match, updatedAt }` (Task 3).
- Produces:
  - `referee-api.ts`: `class RefereeError extends Error { code: string }` (`code === "NETWORK"` means "try again"); `checkCode(code: string): Promise<void>`; `saveMatch(code: string, matchId: string, save: RefereeSave): Promise<{ match: DuelMatch; updatedAt: string }>`; `readCode(): string | null`; `storeCode(code: string): void`; `forgetCode(): void`.
  - `use-referee.ts`: `type Draft = Pick<DuelMatch, "status" | "score" | "smashes">`; `type SaveState = "idle" | "saving" | "saved" | "retrying"`; `SAVE_DELAY_MS = 500`; `RETRY_MS = 2000`; `class SaveQueue<T>`; `useMatchDraft(code: string, match: DuelMatch, updatedAt: string, onRefused: (e: RefereeError) => void): { draft: Draft; state: SaveState; change: (next: Draft, now?: boolean) => void }`.

- [ ] **Step 1: Write the failing API tests**

Create `frontend/test/referee-api.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RefereeError,
  checkCode,
  forgetCode,
  readCode,
  saveMatch,
  storeCode,
} from "../src/lib/referee-api";

const reply = (status: number, body: unknown) =>
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    })),
  );
const failure = async (p: Promise<unknown>) =>
  p.then(
    () => {
      throw new Error("resolved");
    },
    (e: unknown) => e as RefereeError,
  );
const save = { status: "live", score: null, smashes: {} } as const;

afterEach(() => {
  vi.unstubAllGlobals();
  localStorage.clear();
});

describe("referee API", () => {
  it("posts the code with the match", async () => {
    reply(200, { match: { id: "vong-loai-1" }, updatedAt: "2026-10-18T01:00:00.000Z" });
    const res = await saveMatch("048213", "vong-loai-1", save);
    expect(res.updatedAt).toBe("2026-10-18T01:00:00.000Z");
    const [path, init] = vi.mocked(fetch).mock.calls[0];
    expect(path).toBe("/api/referee/match");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      code: "048213",
      matchId: "vong-loai-1",
      ...save,
    });
  });

  it("carries the API's code and Vietnamese message on a refusal", async () => {
    reply(401, { code: "REFEREE_CODE", message: "Mã trọng tài không đúng." });
    const e = await failure(checkCode("000000"));
    expect(e).toBeInstanceOf(RefereeError);
    expect(e.code).toBe("REFEREE_CODE");
    expect(e.message).toBe("Mã trọng tài không đúng.");
  });

  it("treats a dropped connection, a throttle and a server error as try-again", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    expect((await failure(saveMatch("048213", "m", save))).code).toBe("NETWORK");
    for (const status of [429, 500, 502, 503]) {
      reply(status, { message: "Too Many Requests" });
      expect((await failure(saveMatch("048213", "m", save))).code).toBe("NETWORK");
    }
  });

  it("remembers the code on this phone", () => {
    expect(readCode()).toBeNull();
    storeCode("048213");
    expect(readCode()).toBe("048213");
    forgetCode();
    expect(readCode()).toBeNull();
  });

  it("works without storage, asking again next time", () => {
    const broken = () => {
      throw new DOMException("denied", "SecurityError");
    };
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(broken);
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(broken);
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(broken);
    expect(() => storeCode("048213")).not.toThrow();
    expect(readCode()).toBeNull();
    expect(() => forgetCode()).not.toThrow();
    vi.restoreAllMocks();
  });
});
```

Run: `pnpm vitest run frontend/test/referee-api.test.ts`
Expected: FAIL — the module does not exist.

- [ ] **Step 2: Write `referee-api.ts`**

```ts
import type {
  DuelMatch,
  RefereeSave,
} from "../../../packages/domain/src/schema";

// `code` is the API's error code. "NETWORK" is the one that means the save
// did not get through and should be sent again; every other is a refusal.
export class RefereeError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const OFFLINE = "Mất mạng — đang thử lại.";

async function post<T>(path: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new RefereeError("NETWORK", OFFLINE);
  }
  // A throttle is API Gateway asking for a moment, not saying no.
  if (res.status === 429 || res.status >= 500)
    throw new RefereeError("NETWORK", OFFLINE);
  const data = (await res.json().catch(() => null)) as {
    code?: string;
    message?: string;
  } | null;
  if (!res.ok)
    throw new RefereeError(
      data?.code ?? "UNKNOWN",
      data?.message ?? `Lỗi ${res.status}.`,
    );
  return data as T;
}

export const checkCode = async (code: string): Promise<void> => {
  await post("/api/referee/check", { code });
};
export const saveMatch = (code: string, matchId: string, save: RefereeSave) =>
  post<{ match: DuelMatch; updatedAt: string }>("/api/referee/match", {
    code,
    matchId,
    ...save,
  });

// The code, kept on this phone so a reload mid-match does not ask again.
// Storage can be blocked; then it is simply asked for on every load.
const KEY = "wm.referee";
export function readCode(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function storeCode(code: string): void {
  try {
    localStorage.setItem(KEY, code);
  } catch {
    // Nothing to do: the code lives for this page load only.
  }
}
export function forgetCode(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // As above.
  }
}
```

Run: `pnpm vitest run frontend/test/referee-api.test.ts`
Expected: PASS.

- [ ] **Step 3: Write the failing queue and hook tests**

Create `frontend/test/use-referee.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { RefereeError } from "../src/lib/referee-api";
import {
  RETRY_MS,
  SAVE_DELAY_MS,
  SaveQueue,
  useMatchDraft,
  type SaveState,
} from "../src/lib/use-referee";
import { createDuelMatches } from "../../packages/domain/src/duel";
import type { DuelMatch } from "../../packages/domain/src/schema";

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SaveQueue", () => {
  let sent: number[];
  let states: SaveState[];
  let refused: RefereeError[];
  let send: (v: number) => Promise<void>;
  const make = () =>
    new SaveQueue<number>(
      (v) => send(v),
      (s, e) => {
        states.push(s);
        if (e) refused.push(e);
      },
    );
  beforeEach(() => {
    sent = [];
    states = [];
    refused = [];
    send = async (v) => void sent.push(v);
  });

  it("sends a burst of taps as one save, half a second after the last", async () => {
    const q = make();
    q.push(1);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    q.push(2);
    q.push(3);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS - 1);
    expect(sent).toEqual([]);
    expect(q.unsaved).toBe(true);
    await vi.advanceTimersByTimeAsync(1);
    expect(sent).toEqual([3]);
    expect(q.unsaved).toBe(false);
    expect(states).toEqual(["saving", "saved"]);
  });

  it("sends at once when told to", async () => {
    const q = make();
    q.push(1, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([1]);
  });

  it("sends one request at a time, then whatever was tapped meanwhile", async () => {
    let release = () => {};
    send = (v) => {
      sent.push(v);
      return new Promise<void>((r) => (release = r));
    };
    const q = make();
    q.push(1, true);
    await vi.advanceTimersByTimeAsync(0);
    q.push(2);
    q.push(3);
    await vi.advanceTimersByTimeAsync(SAVE_DELAY_MS * 4);
    expect(sent).toEqual([1]);
    release();
    await vi.advanceTimersByTimeAsync(0);
    expect(sent).toEqual([1, 3]);
  });

  it("retries a save that did not get through, keeping the newest value", async () => {
    let online = false;
    send = async (v) => {
      if (!online) throw new RefereeError("NETWORK", "Mất mạng");
      sent.push(v);
    };
    const q = make();
    q.push(1, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toBe("retrying");
    expect(q.unsaved).toBe(true);
    q.push(2);
    online = true;
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(sent).toEqual([2]);
    expect(states.at(-1)).toBe("saved");
    expect(refused).toEqual([]);
  });

  it("stops and reports on a refusal", async () => {
    send = async () => {
      throw new RefereeError("REFEREE_CODE", "Mã trọng tài không đúng.");
    };
    const q = make();
    q.push(1, true);
    await vi.advanceTimersByTimeAsync(RETRY_MS * 3);
    expect(refused.map((e) => e.code)).toEqual(["REFEREE_CODE"]);
    expect(q.unsaved).toBe(false);
    expect(states.at(-1)).toBe("idle");
  });
});

describe("useMatchDraft", () => {
  const stored = (score: DuelMatch["score"]): DuelMatch => ({
    ...createDuelMatches()[0],
    pairRed: ["r1", "r2"],
    pairBlue: ["b1", "b2"],
    status: "live",
    score,
  });
  const T0 = "2026-10-18T01:00:00.000Z";
  const T1 = "2026-10-18T01:00:05.000Z";
  const T2 = "2026-10-18T01:00:30.000Z";
  const flush = (ms = 0) =>
    act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  const setUp = () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_path: string, init: RequestInit) => ({
        ok: true,
        status: 200,
        json: async () => ({
          match: JSON.parse(init.body as string),
          updatedAt: T1,
        }),
      })),
    );
    const onRefused = vi.fn();
    const hook = renderHook(
      ({ m, at }: { m: DuelMatch; at: string }) =>
        useMatchDraft("048213", m, at, onRefused),
      { initialProps: { m: stored({ red: 3, blue: 2 }), at: T0 } },
    );
    const tap = () =>
      act(() =>
        hook.result.current.change({
          ...hook.result.current.draft,
          score: { red: 4, blue: 2 },
        }),
      );
    return { ...hook, tap, onRefused };
  };

  it("shows a tap at once and saves it after the delay", async () => {
    const { result, tap } = setUp();
    tap();
    expect(result.current.draft.score).toEqual({ red: 4, blue: 2 });
    // Unsaved taps never sit under "Đã lưu".
    expect(result.current.state).toBe("saving");
    expect(fetch).not.toHaveBeenCalled();
    await flush(SAVE_DELAY_MS);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(result.current.state).toBe("saved");
  });

  it("does not let a poll overwrite a draft that is not saved yet", async () => {
    const { result, rerender, tap } = setUp();
    tap();
    rerender({ m: stored({ red: 3, blue: 2 }), at: T2 });
    expect(result.current.draft.score).toEqual({ red: 4, blue: 2 });
  });

  it("ignores a snapshot older than its own last save", async () => {
    const { result, rerender, tap } = setUp();
    tap();
    await flush(SAVE_DELAY_MS);
    // A poll that left before the save landed, arriving after it.
    rerender({ m: stored({ red: 3, blue: 2 }), at: T0 });
    expect(result.current.draft.score).toEqual({ red: 4, blue: 2 });
  });

  it("takes the organiser's correction once it is newer and nothing is unsaved", async () => {
    const { result, rerender, tap } = setUp();
    tap();
    await flush(SAVE_DELAY_MS);
    rerender({ m: stored({ red: 2, blue: 2 }), at: T2 });
    expect(result.current.draft.score).toEqual({ red: 2, blue: 2 });
  });

  it("goes back to the stored match and reports when a save is refused", async () => {
    const { result, tap, onRefused } = setUp();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        status: 422,
        json: async () => ({ code: "REFEREE_MATCH_DONE", message: "Trận đã kết thúc." }),
      })),
    );
    tap();
    await flush(SAVE_DELAY_MS);
    expect(onRefused).toHaveBeenCalledTimes(1);
    expect(onRefused.mock.calls[0][0].code).toBe("REFEREE_MATCH_DONE");
    expect(result.current.draft.score).toEqual({ red: 3, blue: 2 });
  });

  it("sends what is unsaved when the screen is left", async () => {
    const { tap, unmount } = setUp();
    tap();
    unmount();
    await flush();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
```

Run: `pnpm vitest run frontend/test/use-referee.test.tsx`
Expected: FAIL — the module does not exist.

- [ ] **Step 4: Write `use-referee.ts`**

```ts
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  DuelMatch,
  RefereeSave,
} from "../../../packages/domain/src/schema";
import { RefereeError, saveMatch } from "./referee-api";

// What the referee's screen edits. `pending` only until "Bắt đầu trận".
export type Draft = Pick<DuelMatch, "status" | "score" | "smashes">;
export type SaveState = "idle" | "saving" | "saved" | "retrying";
export const SAVE_DELAY_MS = 500;
export const RETRY_MS = 2000;

const toDraft = (m: DuelMatch): Draft => ({
  status: m.status,
  score: m.score,
  smashes: m.smashes,
});

// Holds the newest value and sends it: a burst of taps becomes one request,
// one request runs at a time, and a save that did not get through is sent
// again — always the newest value, never a stale one.
export class SaveQueue<T> {
  private pending: { value: T } | null = null;
  private busy = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private send: (value: T) => Promise<void>,
    private report: (state: SaveState, refused?: RefereeError) => void,
  ) {}

  get unsaved(): boolean {
    return this.pending !== null || this.busy;
  }

  push(value: T, now = false): void {
    this.pending = { value };
    this.arm(now ? 0 : SAVE_DELAY_MS);
  }

  // Send whatever is waiting, now.
  flush(): void {
    if (this.pending) this.arm(0);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private arm(ms: number): void {
    this.stop();
    this.timer = setTimeout(() => void this.run(), ms);
  }

  private async run(): Promise<void> {
    this.stop();
    if (this.busy || !this.pending) return;
    const { value } = this.pending;
    this.pending = null;
    this.busy = true;
    this.report("saving");
    try {
      await this.send(value);
      this.busy = false;
      if (this.pending) return void this.run();
      this.report("saved");
    } catch (e) {
      this.busy = false;
      if (e instanceof RefereeError && e.code === "NETWORK") {
        this.pending ??= { value };
        this.report("retrying");
        this.arm(RETRY_MS);
        return;
      }
      this.pending = null;
      this.stop();
      this.report(
        "idle",
        e instanceof RefereeError
          ? e
          : new RefereeError("UNKNOWN", "Không lưu được. Thử lại."),
      );
    }
  }
}

// The open match as the referee sees it. `match` and `updatedAt` come from
// the 20-second poll of tournament.json; they replace the draft only when
// nothing here is unsaved and the snapshot is not older than this screen's
// own last save — a poll that left before a save landed must not undo it.
export function useMatchDraft(
  code: string,
  match: DuelMatch,
  updatedAt: string,
  onRefused: (e: RefereeError) => void,
) {
  const [draft, setDraft] = useState<Draft>(() => toDraft(match));
  const [state, setState] = useState<SaveState>("idle");
  const savedAt = useRef(0);
  const latest = useRef({ match, onRefused });
  useEffect(() => {
    latest.current = { match, onRefused };
  });

  const matchId = match.id;
  const queue = useMemo(
    () =>
      new SaveQueue<RefereeSave>(
        async (save) => {
          const res = await saveMatch(code, matchId, save);
          savedAt.current = Date.parse(res.updatedAt);
        },
        (next, refused) => {
          setState(next);
          if (!refused) return;
          setDraft(toDraft(latest.current.match));
          latest.current.onRefused(refused);
        },
      ),
    [code, matchId],
  );

  const server = JSON.stringify(toDraft(match));
  useEffect(() => {
    if (queue.unsaved || Date.parse(updatedAt) < savedAt.current) return;
    setDraft(JSON.parse(server) as Draft);
  }, [server, updatedAt, queue]);

  // Leaving the screen, or the phone locking, must not strand the last taps.
  useEffect(() => {
    const hidden = () => {
      if (document.visibilityState === "hidden") queue.flush();
    };
    document.addEventListener("visibilitychange", hidden);
    return () => {
      document.removeEventListener("visibilitychange", hidden);
      queue.flush();
    };
  }, [queue]);

  const change = (next: Draft, now = false) => {
    setDraft(next);
    if (next.status === "pending") return;
    // Said at once: "Đã lưu" must never sit above taps that are not saved.
    setState("saving");
    queue.push(next as RefereeSave, now);
  };
  return { draft, state, change };
}
```

- [ ] **Step 5: Run, typecheck, commit**

Run: `pnpm vitest run frontend/test/referee-api.test.ts frontend/test/use-referee.test.tsx && pnpm --filter @webminton/frontend typecheck`
Expected: PASS.

```bash
git add frontend/src/lib/referee-api.ts frontend/src/lib/use-referee.ts frontend/test/referee-api.test.ts frontend/test/use-referee.test.tsx
git commit -m "feat(referee): API client and a debounced, retrying save queue"
```

---

### Task 7: The `/trong-tai` page

**Files:**
- Create: `frontend/src/app/trong-tai/layout.tsx`, `frontend/src/app/trong-tai/page.tsx`
- Create: `frontend/src/features/referee/RefereePortal.tsx`, `CodeGate.tsx`, `MatchList.tsx`, `MatchScorer.tsx`
- Create: `frontend/src/styles/referee.css`
- Test: `tests/e2e/referee.spec.ts` (new)

**Interfaces:**
- Consumes: `useTournament` (`{ view, error, reload }`), `checkCode`, `readCode`, `storeCode`, `forgetCode`, `RefereeError` (Task 6), `useMatchDraft`, `Draft`, `SaveState` (Task 6), `duelTitle`, `duelCategory` from `features/duel/DuelBoard`, `Card`, `Pill` from `features/landing/primitives`, `DUEL_SIDES`, `DUEL_TEAMS`, `pairOf` from the domain.
- Produces test hooks: `data-testid` values `referee-closed`, `referee-code-input`, `save-state`, `score-red`, `score-blue`, `plus-red`, `plus-blue`, `minus-red`, `minus-blue`, `smash-<athleteId>-hit`, `smash-<athleteId>-net` (the count), `smash-<athleteId>-hit-plus` / `-minus`, `smash-<athleteId>-net-plus` / `-minus`; and the scorer root has class `ref-scorer`.

- [ ] **Step 1: Write the failing e2e spec**

Create `tests/e2e/referee.spec.ts`:

```ts
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const AUTH = { authorization: "Bearer test:admin@example.com" };
const CODE = "048213";

interface Athlete {
  id: string;
  name: string;
  gender: "male" | "female";
  teamId: string | null;
}
interface Match {
  id: string;
  status: string;
  score: { red: number; blue: number } | null;
  smashes: Record<string, { hit: number; net: number }>;
}
interface State {
  version: number;
  document: { athletes: Athlete[]; duel?: { matches: Match[] } };
}

test.use({ viewport: { width: 390, height: 844 } });

const state = async (request: APIRequestContext) =>
  (await (await request.get("/api/admin/state", { headers: AUTH })).json()) as State;
async function send(request: APIRequestContext, command: unknown) {
  const { version } = await state(request);
  const res = await request.post("/api/admin/commands", {
    headers: AUTH,
    data: { baseVersion: version, requestId: `ref-${version}`, command },
  });
  expect(res.ok(), await res.text()).toBe(true);
}
const published = async (request: APIRequestContext) =>
  (await (await request.get("/tournament.json")).json()) as State["document"];
const first = async (request: APIRequestContext) =>
  (await published(request)).duel!.matches[0];

let red: Athlete[];
let blue: Athlete[];

// Two drawn teams, the bảng đấu, trận 1 with its pairs, a code. Not yet open.
test.beforeEach(async ({ request }) => {
  expect((await request.post("/api/test/reset")).ok()).toBe(true);
  await send(request, { type: "resetDraw", payload: {} });
  await send(request, { type: "setTeamDrawOpen", payload: { open: true } });
  for (const a of (await state(request)).document.athletes)
    await request.post("/api/team-draw", { data: { athleteId: a.id } });
  await send(request, { type: "setTeamDrawOpen", payload: { open: false } });
  const { athletes } = (await state(request)).document;
  const men = (teamId: string) =>
    athletes.filter((a) => a.teamId === teamId && a.gender === "male");
  red = men("red");
  blue = men("blue");
  await send(request, { type: "createDuel", payload: {} });
  await send(request, {
    type: "saveDuelMatch",
    payload: {
      matchId: "vong-loai-1",
      pairRed: [red[0].id, red[1].id],
      pairBlue: [blue[0].id, blue[1].id],
      status: "pending",
      score: null,
      smashes: {},
    },
  });
  await send(request, { type: "setRefereeCode", payload: { code: CODE } });
});
test.afterAll(async ({ playwright }) => {
  const ctx = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3100",
  });
  await ctx.post("/api/test/reset");
  await ctx.dispose();
});

const open = (request: APIRequestContext) =>
  send(request, { type: "setRefereeOpen", payload: { open: true } });
async function enter(page: Page, code = CODE) {
  await page.goto("/trong-tai/");
  await page.getByTestId("referee-code-input").fill(code);
  await page.getByRole("button", { name: "Vào chấm điểm" }).click();
}
const saved = (page: Page) =>
  expect(page.getByTestId("save-state")).toHaveText("Đã lưu");
async function tap(page: Page, testId: string, times: number) {
  for (let i = 0; i < times; i++) await page.getByTestId(testId).click();
}

test("the page is closed until the organiser opens it", async ({ page, request }) => {
  await page.goto("/trong-tai/");
  await expect(page.getByTestId("referee-closed")).toBeVisible();
  await expect(page.getByTestId("referee-code-input")).toHaveCount(0);
  const res = await request.post("/api/referee/check", { data: { code: CODE } });
  expect(res.status()).toBe(403);
});

test("a wrong code is refused and the right one is remembered", async ({
  page,
  request,
}) => {
  await open(request);
  await enter(page, "000000");
  await expect(page.getByRole("alert")).toHaveText("Mã trọng tài không đúng.");
  await page.getByTestId("referee-code-input").fill(CODE);
  await page.getByRole("button", { name: "Vào chấm điểm" }).click();
  await expect(page.getByRole("button", { name: /Trận 1/ })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: /Trận 1/ })).toBeVisible();
  await expect(page.getByTestId("referee-code-input")).toHaveCount(0);
});

test("the list shows which matches can be refereed", async ({ page, request }) => {
  await open(request);
  await enter(page);
  await expect(page.getByRole("button", { name: /Trận 1/ })).toBeEnabled();
  await expect(page.getByRole("button", { name: /Trận 1/ })).toContainText(
    red[0].name.trim().split(/\s+/).at(-1)!,
  );
  // Trận 2 has no pairs yet.
  await expect(page.getByRole("button", { name: /Trận 2/ })).toBeDisabled();
  await expect(page.getByRole("button")).toHaveCount(11);
});

test("a referee runs a match from start to finish", async ({ page, request }) => {
  await open(request);
  await enter(page);
  await page.getByRole("button", { name: /Trận 1/ }).click();
  await page.getByRole("button", { name: "Bắt đầu trận" }).click();
  await saved(page);
  expect((await first(request)).status).toBe("live");

  await tap(page, "plus-red", 3);
  await tap(page, "plus-blue", 2);
  await tap(page, `smash-${red[0].id}-hit-plus`, 2);
  await tap(page, `smash-${blue[1].id}-net-plus`, 1);
  await expect(page.getByTestId("score-red")).toHaveText("3");
  await expect(page.getByTestId("score-blue")).toHaveText("2");
  await saved(page);
  expect(await first(request)).toMatchObject({
    status: "live",
    score: { red: 3, blue: 2 },
    smashes: { [red[0].id]: { hit: 2, net: 0 }, [blue[1].id]: { hit: 0, net: 1 } },
  });

  // The public page shows the running score, and no winner yet.
  const publicPage = await page.context().newPage();
  await publicPage.goto("/");
  const card = publicPage.getByTestId("duel-vong-loai-1");
  await expect(card).toContainText("Đang đánh");
  await expect(card.locator(".draw-row__score")).toHaveText(["3", "2"]);
  await expect(card.locator(".is-winner")).toHaveCount(0);
  await publicPage.close();

  // A mis-tap is taken back.
  await tap(page, "plus-blue", 1);
  await tap(page, "minus-blue", 1);
  await expect(page.getByTestId("score-blue")).toHaveText("2");

  const finish = page.getByRole("button", { name: /Kết thúc trận/ });
  await expect(finish).toBeDisabled();
  await tap(page, "plus-red", 18);
  await tap(page, "plus-blue", 13);
  await expect(page.getByTestId("score-red")).toHaveText("21");
  await expect(page.getByTestId("score-blue")).toHaveText("15");
  await finish.click();
  await page.getByRole("button", { name: "Bấm lần nữa: kết thúc 21–15" }).click();
  await expect(page.getByText("Trận đã kết thúc")).toBeVisible();
  await expect(page.getByTestId("plus-red")).toHaveCount(0);
  await expect
    .poll(async () => (await first(request)).status)
    .toBe("done");
  expect((await first(request)).score).toEqual({ red: 21, blue: 15 });
});

test("the scorer fits a phone: no sideways scroll, nothing too small to hit", async ({
  page,
  request,
}) => {
  await open(request);
  await enter(page);
  await page.getByRole("button", { name: /Trận 1/ }).click();
  await page.getByRole("button", { name: "Bắt đầu trận" }).click();
  await saved(page);
  const sizes = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    width: document.documentElement.clientWidth,
    buttons: [...document.querySelectorAll(".ref-scorer button")].map((b) => {
      const r = b.getBoundingClientRect();
      return { id: b.getAttribute("data-testid"), w: r.width, h: r.height };
    }),
  }));
  expect(sizes.scroll).toBeLessThanOrEqual(sizes.width);
  expect(sizes.buttons.length).toBeGreaterThan(10);
  for (const b of sizes.buttons) {
    expect(b.w, `${b.id} width`).toBeGreaterThanOrEqual(48);
    expect(b.h, `${b.id} height`).toBeGreaterThanOrEqual(48);
  }
  for (const id of ["plus-red", "plus-blue"])
    expect(sizes.buttons.find((b) => b.id === id)!.h).toBeGreaterThanOrEqual(96);
});

test("a changed code sends the referee back to the code screen", async ({
  page,
  request,
}) => {
  await open(request);
  await enter(page);
  await page.getByRole("button", { name: /Trận 1/ }).click();
  await page.getByRole("button", { name: "Bắt đầu trận" }).click();
  await saved(page);
  await send(request, { type: "setRefereeCode", payload: { code: "999999" } });
  await tap(page, "plus-red", 1);
  await expect(page.getByTestId("referee-code-input")).toBeVisible();
  await expect(page.getByRole("alert")).toHaveText("Mã trọng tài không đúng.");
  expect((await first(request)).score).toBeNull();
});

test("a finished match opens read-only", async ({ page, request }) => {
  await send(request, {
    type: "saveDuelMatch",
    payload: {
      matchId: "vong-loai-1",
      pairRed: [red[0].id, red[1].id],
      pairBlue: [blue[0].id, blue[1].id],
      status: "done",
      score: { red: 21, blue: 15 },
      smashes: {},
    },
  });
  await open(request);
  await enter(page);
  await page.getByRole("button", { name: /Trận 1/ }).click();
  await expect(page.getByTestId("score-red")).toHaveText("21");
  await expect(page.getByText("Trận đã kết thúc")).toBeVisible();
  await expect(page.getByTestId("plus-red")).toHaveCount(0);
});

test("the served file never carries the code", async ({ page, request }) => {
  await open(request);
  await enter(page);
  await page.getByRole("button", { name: /Trận 1/ }).click();
  await page.getByRole("button", { name: "Bắt đầu trận" }).click();
  await saved(page);
  const body = await (await request.get("/tournament.json")).text();
  expect(body).not.toContain(CODE);
  expect(body).not.toContain("refereeCode");
  expect(body).not.toContain("secrets");
});
```

Run: `pnpm build && pnpm exec playwright test tests/e2e/referee.spec.ts`
Expected: FAIL — `/trong-tai/` is a 404.

- [ ] **Step 2: The route shell**

Check `frontend/node_modules/next/dist/docs/` for the current `metadata` / layout conventions first, and mirror `frontend/src/app/quan-tri/layout.tsx` and `frontend/src/app/boc-tham/page.tsx`, which are known to work in this version.

`frontend/src/app/trong-tai/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "../../styles/referee.css";

export const metadata: Metadata = {
  title: "Trọng tài · Giải cầu lông nội bộ 2026",
  robots: { index: false, follow: false },
};

export default function RefereeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
```

`frontend/src/app/trong-tai/page.tsx`:

```tsx
"use client";
import { useTournament } from "../../lib/use-tournament";
import { RefereePortal } from "../../features/referee/RefereePortal";

export default function RefereePage() {
  const { view, error, reload } = useTournament();
  if (error)
    return (
      <main id="main" className="container section">
        <p role="alert" className="error">
          {error} <button onClick={reload}>Thử lại</button>
        </p>
      </main>
    );
  if (!view)
    return (
      <main id="main" className="container section">
        <p role="status">Đang tải thông tin giải…</p>
      </main>
    );
  return (
    <main id="main" className="ref-page">
      <RefereePortal t={view.t} reload={reload} />
    </main>
  );
}
```

- [ ] **Step 3: `RefereePortal.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import type { TournamentDocument } from "../../../../packages/domain/src/schema";
import {
  forgetCode,
  readCode,
  storeCode,
  type RefereeError,
} from "../../lib/referee-api";
import { Card } from "../landing/primitives";
import { CodeGate } from "./CodeGate";
import { MatchList } from "./MatchList";
import { MatchScorer } from "./MatchScorer";

// Which screen: closed, the code, the list, or one match.
export function RefereePortal({
  t,
  reload,
}: {
  t: TournamentDocument;
  reload: () => void;
}) {
  // Storage is read after mount: the page is prerendered without it.
  const [ready, setReady] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  useEffect(() => {
    setCode(readCode());
    setReady(true);
  }, []);

  const matches = t.duel?.matches ?? [];
  if (!t.referee?.open || matches.length === 0)
    return (
      <div className="ref-wrap" data-testid="referee-closed">
        <Card title="Trọng tài">
          <p>BTC chưa mở chấm điểm. Khi BTC mở, trang này sẽ tự hiện.</p>
        </Card>
      </div>
    );
  if (!ready) return null;
  if (!code)
    return (
      <CodeGate
        notice={notice}
        onAccepted={(accepted) => {
          storeCode(accepted);
          setNotice(null);
          setCode(accepted);
        }}
      />
    );

  const refused = (e: RefereeError) => {
    // The organiser changed the code: this phone is no longer trusted.
    if (e.code === "REFEREE_CODE") {
      forgetCode();
      setNotice(e.message);
      setSelected(null);
      setCode(null);
    }
    reload();
  };
  const current = matches.find((m) => m.id === selected);
  return current ? (
    <MatchScorer
      key={current.id}
      t={t}
      code={code}
      match={current}
      onBack={() => {
        setSelected(null);
        reload();
      }}
      onRefused={refused}
    />
  ) : (
    <MatchList t={t} onPick={setSelected} />
  );
}
```

- [ ] **Step 4: `CodeGate.tsx`**

```tsx
"use client";
import { useState } from "react";
import { RefereeError, checkCode } from "../../lib/referee-api";
import { Card } from "../landing/primitives";

export function CodeGate({
  notice,
  onAccepted,
}: {
  notice: string | null;
  onAccepted: (code: string) => void;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(notice);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await checkCode(code);
      onAccepted(code);
    } catch (err) {
      setError(
        err instanceof RefereeError && err.code === "NETWORK"
          ? "Mất mạng — kiểm tra rồi thử lại."
          : err instanceof Error
            ? err.message
            : "Không kiểm tra được mã.",
      );
      setCode("");
      setBusy(false);
    }
  }

  return (
    <div className="ref-wrap">
      <Card title="Trọng tài">
        <form className="ref-gate" onSubmit={submit}>
          <label htmlFor="referee-code">Mã trọng tài (BTC cấp)</label>
          <input
            id="referee-code"
            data-testid="referee-code-input"
            className="ref-gate__input"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete="off"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          {error && (
            <p role="alert" className="error">
              {error}
            </p>
          )}
          <button type="submit" disabled={busy || code.length !== 6}>
            {busy ? "Đang kiểm tra…" : "Vào chấm điểm"}
          </button>
        </form>
      </Card>
    </div>
  );
}
```

- [ ] **Step 5: `MatchList.tsx`**

```tsx
import type {
  DuelMatch,
  TournamentDocument,
} from "../../../../packages/domain/src/schema";
import {
  DUEL_SIDES,
  DUEL_TEAMS,
  pairOf,
  type DuelSide,
} from "../../../../packages/domain/src/duel";
import { duelCategory, duelTitle } from "../duel/DuelBoard";
import { Pill } from "../landing/primitives";

export const teamOf = (t: TournamentDocument, side: DuelSide) =>
  t.teams.find((x) => x.id === DUEL_TEAMS[side]);
export const nameOf = (t: TournamentDocument, id: string) =>
  t.athletes.find((a) => a.id === id)?.name ?? "?";
// The given name — the last word — is what people are called on court.
const shortName = (t: TournamentDocument, id: string) =>
  nameOf(t, id).trim().split(/\s+/).at(-1) ?? "?";
const ready = (m: DuelMatch) => m.pairRed !== null && m.pairBlue !== null;

const GROUPS = [
  { label: "Đang đánh", tone: "yellow", has: (m: DuelMatch) => m.status === "live" },
  {
    label: "Sẵn sàng",
    tone: "green",
    has: (m: DuelMatch) => m.status === "pending" && ready(m),
  },
  {
    label: "Chưa xếp cặp",
    tone: "outline",
    has: (m: DuelMatch) => m.status === "pending" && !ready(m),
  },
  { label: "Đã xong", tone: "outline", has: (m: DuelMatch) => m.status === "done" },
] as const;

export function MatchList({
  t,
  onPick,
}: {
  t: TournamentDocument;
  onPick: (matchId: string) => void;
}) {
  const matches = t.duel?.matches ?? [];
  return (
    <div className="ref-wrap">
      <h1 className="ref-title">Chọn trận để chấm</h1>
      {GROUPS.map((group) => {
        const rows = matches.filter(group.has);
        if (rows.length === 0) return null;
        return (
          <section key={group.label} className="ref-group">
            <h2>{group.label}</h2>
            <ul className="ref-list">
              {rows.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="ref-match"
                    // A match without pairs is shown so the referee knows it
                    // exists and whom to ask, but there is nothing to score.
                    disabled={m.status === "pending" && !ready(m)}
                    onClick={() => onPick(m.id)}
                  >
                    <span className="ref-match__head">
                      <b>
                        {duelTitle(m, matches)} · {duelCategory(m)}
                      </b>
                      <Pill tone={group.tone}>{group.label}</Pill>
                    </span>
                    {m.stage === "final" && (
                      <span className="ref-match__note">Điểm nhân đôi</span>
                    )}
                    {DUEL_SIDES.map((side) => {
                      const pair = pairOf(m, side);
                      return (
                        <span className="ref-match__side" key={side}>
                          <span
                            className="team-grid__swatch"
                            style={{ background: teamOf(t, side)?.color }}
                            aria-hidden="true"
                          />
                          <span className="ref-match__names">
                            {pair
                              ? pair.map((id) => shortName(t, id)).join(" · ")
                              : "Chưa xếp cặp"}
                          </span>
                          {m.score && <b>{m.score[side]}</b>}
                        </span>
                      );
                    })}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: `MatchScorer.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import type {
  DuelMatch,
  TournamentDocument,
} from "../../../../packages/domain/src/schema";
import {
  DUEL_SIDES,
  pairOf,
  type DuelSide,
} from "../../../../packages/domain/src/duel";
import { isFinalScore } from "../../../../packages/domain/src/score";
import type { RefereeError } from "../../lib/referee-api";
import { useMatchDraft, type SaveState } from "../../lib/use-referee";
import { duelCategory, duelTitle } from "../duel/DuelBoard";
import { nameOf, teamOf } from "./MatchList";

const SAVE: Record<SaveState, string> = {
  idle: "",
  saving: "Đang lưu…",
  saved: "Đã lưu",
  retrying: "Mất mạng — đang thử lại",
};
const SMASH = [
  { key: "hit", label: "Ăn điểm" },
  { key: "net", label: "Rúc lưới" },
] as const;
const clamp = (n: number, max: number) => Math.max(0, Math.min(max, n));

// A phone that dims mid-rally costs the referee a point. Where the browser
// allows it, keep the screen on for as long as the match is being played.
function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let gone = false;
    const take = () => {
      if (document.visibilityState !== "visible") return;
      navigator.wakeLock
        .request("screen")
        .then((l) => {
          if (gone) void l.release();
          else lock = l;
        })
        .catch(() => {});
    };
    take();
    // The lock is dropped whenever the tab is hidden.
    document.addEventListener("visibilitychange", take);
    return () => {
      gone = true;
      document.removeEventListener("visibilitychange", take);
      void lock?.release();
    };
  }, [on]);
}

export function MatchScorer({
  t,
  code,
  match,
  onBack,
  onRefused,
}: {
  t: TournamentDocument;
  code: string;
  match: DuelMatch;
  onBack: () => void;
  onRefused: (e: RefereeError) => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const { draft, state, change } = useMatchDraft(
    code,
    match,
    t.updatedAt,
    (e) => {
      setMessage(e.message);
      onRefused(e);
    },
  );
  const live = draft.status === "live";
  useWakeLock(live);
  // Two taps to finish, as in the admin screen; it disarms itself.
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);

  const score = draft.score ?? { red: 0, blue: 0 };
  const final = isFinalScore({ a: score.red, b: score.blue });
  const edit = (next: typeof draft, now = false) => {
    setMessage(null);
    setArmed(false);
    change(next, now);
  };
  const point = (side: DuelSide, by: number) =>
    edit({ ...draft, score: { ...score, [side]: clamp(score[side] + by, 25) } });
  const smash = (id: string, key: "hit" | "net", by: number) => {
    const now = draft.smashes[id] ?? { hit: 0, net: 0 };
    edit({
      ...draft,
      smashes: { ...draft.smashes, [id]: { ...now, [key]: clamp(now[key] + by, 99) } },
    });
  };

  return (
    <div className="ref-wrap ref-scorer">
      <header className="ref-bar">
        <button type="button" className="ref-bar__back" onClick={onBack}>
          ← Trận khác
        </button>
        <span className="ref-bar__state" data-testid="save-state" aria-live="polite">
          {SAVE[state]}
        </span>
      </header>
      <h1 className="ref-title">
        {duelTitle(match, t.duel?.matches ?? [])} · {duelCategory(match)}
        {match.stage === "final" && <small> · điểm nhân đôi</small>}
      </h1>
      {message && (
        <p role="alert" className="error">
          {message}
        </p>
      )}

      <div className="ref-score">
        {DUEL_SIDES.map((side) => (
          <div
            className="ref-side"
            key={side}
            style={{ background: teamOf(t, side)?.color }}
          >
            <span className="ref-side__team">{teamOf(t, side)?.name}</span>
            <span className="ref-side__pair">
              {(pairOf(match, side) ?? []).map((id) => (
                <span key={id}>{nameOf(t, id)}</span>
              ))}
            </span>
            {draft.status !== "pending" && (
              <strong className="ref-side__points" data-testid={`score-${side}`}>
                {score[side]}
              </strong>
            )}
            {live && (
              <>
                <button
                  type="button"
                  className="ref-plus"
                  data-testid={`plus-${side}`}
                  aria-label={`Cộng một điểm cho ${teamOf(t, side)?.name}`}
                  disabled={score[side] >= 25}
                  onClick={() => point(side, 1)}
                >
                  +1
                </button>
                <button
                  type="button"
                  className="ref-minus"
                  data-testid={`minus-${side}`}
                  aria-label={`Bớt một điểm của ${teamOf(t, side)?.name}`}
                  disabled={score[side] <= 0}
                  onClick={() => point(side, -1)}
                >
                  −1
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      {draft.status === "pending" && (
        <button
          type="button"
          className="ref-main"
          onClick={() => edit({ ...draft, status: "live" }, true)}
        >
          Bắt đầu trận
        </button>
      )}

      {draft.status !== "pending" && (
        <section className="ref-smash">
          <h2>Đếm smash</h2>
          {DUEL_SIDES.flatMap((side) => pairOf(match, side) ?? []).map((id) => (
            <div className="ref-player" key={id}>
              <strong>{nameOf(t, id)}</strong>
              {SMASH.map(({ key, label }) => (
                <div className="ref-count" key={key}>
                  <small>{label}</small>
                  {live && (
                    <button
                      type="button"
                      data-testid={`smash-${id}-${key}-minus`}
                      aria-label={`Bớt smash ${label.toLowerCase()} của ${nameOf(t, id)}`}
                      onClick={() => smash(id, key, -1)}
                    >
                      −
                    </button>
                  )}
                  <b data-testid={`smash-${id}-${key}`}>
                    {draft.smashes[id]?.[key] ?? 0}
                  </b>
                  {live && (
                    <button
                      type="button"
                      data-testid={`smash-${id}-${key}-plus`}
                      aria-label={`Thêm smash ${label.toLowerCase()} của ${nameOf(t, id)}`}
                      onClick={() => smash(id, key, 1)}
                    >
                      +
                    </button>
                  )}
                </div>
              ))}
            </div>
          ))}
        </section>
      )}

      {live && (
        <>
          <button
            type="button"
            className="ref-main"
            disabled={!final}
            onClick={() => {
              if (!armed) return setArmed(true);
              edit({ ...draft, status: "done" }, true);
            }}
          >
            {armed
              ? `Bấm lần nữa: kết thúc ${score.red}–${score.blue}`
              : "Kết thúc trận"}
          </button>
          <small className="ref-hint">
            {final
              ? "Tỉ số hợp lệ. Kết thúc rồi thì chỉ BTC mở lại được."
              : "Kết thúc được khi tỉ số tới 21, hơn 2 điểm, trần 25."}
          </small>
        </>
      )}
      {draft.status === "done" && (
        <p className="ref-hint">Trận đã kết thúc — nhờ BTC mở lại nếu cần sửa.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 7: `referee.css`**

Compare against the poster tokens in `frontend/src/app/globals.css` and the admin screen: hard un-blurred shadows, 3px ink borders, Be Vietnam Pro. Create `frontend/src/styles/referee.css`:

```css
/* /trong-tai — the referees' page. One column, sized for thumbs: every
   control at least 48px, the two +1 buttons at least 96px tall. */
.ref-page {
  min-height: 100dvh;
}
.ref-wrap {
  max-width: 34rem;
  margin: 0 auto;
  padding: 16px 16px 40px;
  display: grid;
  gap: 16px;
}
.ref-title {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 900;
  line-height: 1.2;
}
.ref-title small {
  font-size: 0.85rem;
  font-weight: 700;
}
.ref-hint {
  margin: 0;
  font-size: 0.9rem;
}

/* The code screen */
.ref-gate {
  display: grid;
  gap: 12px;
}
.ref-gate label {
  font-weight: 700;
}
.ref-gate__input {
  width: 100%;
  min-height: 64px;
  border: 3px solid var(--ink);
  border-radius: 12px;
  background: #fff;
  font: inherit;
  font-size: 2rem;
  font-weight: 900;
  letter-spacing: 0.3em;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.ref-gate button {
  min-height: 56px;
}

/* The match list */
.ref-group {
  display: grid;
  gap: 8px;
}
.ref-group h2 {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 900;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.ref-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 10px;
}
button.ref-match {
  width: 100%;
  min-height: 72px;
  display: grid;
  gap: 6px;
  padding: 12px 14px;
  border: 3px solid var(--ink);
  border-radius: 14px;
  background: var(--paper);
  color: var(--ink);
  box-shadow: var(--shadow-hard-sm);
  font: inherit;
  text-align: left;
  transform: none;
}
button.ref-match:disabled {
  opacity: 0.55;
  box-shadow: none;
  border-style: dashed;
}
.ref-match__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.ref-match__note {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--red);
}
.ref-match__side {
  display: flex;
  align-items: center;
  gap: 8px;
}
.ref-match__names {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The scorer */
.ref-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
button.ref-bar__back {
  min-height: 48px;
  padding: 0 14px;
  border: 3px solid var(--ink);
  border-radius: 999px;
  background: var(--paper);
  color: var(--ink);
  box-shadow: none;
  font: inherit;
  font-weight: 700;
}
.ref-bar__state {
  min-height: 1.2em;
  font-size: 0.9rem;
  font-weight: 700;
  text-align: right;
}
.ref-score {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.ref-side {
  display: grid;
  gap: 8px;
  align-content: start;
  min-width: 0;
  padding: 12px 10px;
  border: 3px solid var(--ink);
  border-radius: 16px;
  box-shadow: var(--shadow-hard-sm);
  color: #fff;
  text-align: center;
}
.ref-side__team {
  font-weight: 900;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.ref-side__pair {
  display: grid;
  min-height: 2.6em;
  font-size: 0.85rem;
  line-height: 1.3;
}
.ref-side__pair span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ref-side__points {
  font-size: 4.5rem;
  font-weight: 900;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.ref-side button {
  width: 100%;
  border: 3px solid var(--ink);
  border-radius: 14px;
  color: var(--ink);
  font: inherit;
  font-weight: 900;
  box-shadow: none;
  transform: none;
  touch-action: manipulation;
}
button.ref-plus {
  min-height: 104px;
  background: var(--paper);
  font-size: 2.6rem;
}
button.ref-plus:active:not(:disabled) {
  background: var(--yellow);
}
button.ref-minus {
  min-height: 48px;
  background: transparent;
  color: #fff;
  border-color: #fff;
  font-size: 1.1rem;
}
.ref-side button:disabled {
  opacity: 0.4;
}
button.ref-main {
  width: 100%;
  min-height: 64px;
  font-size: 1.15rem;
}

.ref-smash {
  display: grid;
  gap: 10px;
}
.ref-smash h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 900;
}
.ref-player {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border: 3px solid var(--ink);
  border-radius: 14px;
  background: var(--paper);
}
.ref-count {
  display: grid;
  grid-template-columns: 1fr 52px 2.5rem 52px;
  align-items: center;
  gap: 8px;
}
.ref-count small {
  font-size: 0.9rem;
  font-weight: 700;
}
.ref-count b {
  grid-column: 3;
  font-size: 1.5rem;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.ref-count button {
  width: 52px;
  height: 52px;
  padding: 0;
  border: 3px solid var(--ink);
  border-radius: 12px;
  background: #fff;
  color: var(--ink);
  font: inherit;
  font-size: 1.5rem;
  font-weight: 900;
  box-shadow: none;
  transform: none;
  touch-action: manipulation;
}
.ref-count button:first-of-type {
  grid-column: 2;
}
.ref-count button:last-of-type {
  grid-column: 4;
}
```

- [ ] **Step 8: Build and run the e2e spec**

Run: `pnpm --filter @webminton/frontend typecheck && pnpm build && pnpm exec playwright test tests/e2e/referee.spec.ts`
Expected: PASS. If the size test fails, the global `button` rule in `globals.css` is overriding a dimension — raise the specificity of the offending `.ref-*` rule rather than adding `!important`.

- [ ] **Step 9: Look at it on a phone-sized screen**

With `node --import tsx scripts/serve-static.ts` running, set a code and open refereeing in `/quan-tri/#tran-dau`, give trận 1 its pairs, then:

```bash
node scripts/screenshot.mjs http://127.0.0.1:3100/trong-tai/ /tmp/ref-gate.png 390 844 full
```

Open the page in a browser at 390×844 as well and walk the four screens. Check: the blue team's colour leaves the white text and the outlined `−1` readable; long Vietnamese names truncate rather than wrap the score off-screen; nothing scrolls sideways; the `+1` buttons are reachable with a thumb without scrolling on an 844px-tall screen. Fix what does not hold before committing.

- [ ] **Step 10: Run the whole suite and commit**

Run: `pnpm test && pnpm exec playwright test`
Expected: PASS. `tests/e2e/landing.spec.ts` has a test listing the public site's pages ("The public site is one page plus /boc-tham"); if it asserts an exact set of routes, add `/trong-tai/` to it and update its comment.

```bash
git add frontend/src/app/trong-tai frontend/src/features/referee frontend/src/styles/referee.css tests/e2e
git commit -m "feat(referee): /trong-tai — pick a match, score it point by point, count smashes"
```

---

### Task 8: Documentation and the first apply

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/runbooks/operations.md`

- [ ] **Step 1: `CLAUDE.md`**

In the Project paragraph that begins "The public page is static.", nothing changes. After the section `### The two-team bảng đấu`, add:

```markdown
### The referees' page

`/trong-tai` lets whoever umpires a court run their own match from a phone:
start it, score it point by point, count smashes, finish it. It is the second
public write, `POST /api/referee/{check,match}`, an API Gateway route with no
authorizer and its own throttle. History shows these saves as `trong-tai`.

- It works only while `document.referee.open` is true and the request carries
  the six-digit code, both set in the `Trọng tài` card of the `Trận` tab
  (`setRefereeOpen`, `setRefereeCode`). The code lives in `AdminState.secrets`,
  beside the document, and never reaches `tournament.json`. Changing it locks
  out every phone holding the old one.
- A referee sends status, score and smashes for one match — never pairs. The
  router turns that into a `saveDuelMatch` with the stored pairs
  (`duel.ts::applyRefereeSave`), so it passes through `applyCommand` like every
  other edit. A `done` match is locked to referees; reopening is the
  organiser's.
- A `live` match carries a running score. **A score no longer means the match
  is finished**: totals, wins, `played` and the winner mark all test
  `status === "done"`.
- A save that changes nothing is answered without writing, so a retried
  `Kết thúc trận` succeeds. A version collision with the other court is
  retried, as on `/boc-tham`.
- The page keeps a draft of the open match (`lib/use-referee.ts`) and saves it
  500ms after the last tap. The poll of `tournament.json` replaces the draft
  only when nothing is unsaved and the snapshot is not older than the page's
  own last save.
- Live scoring adds 40–60 versions per match. That is expected.
```

In the Layout section's `frontend` bullet, after the sentence about `/quan-tri`, add: "`/trong-tai` is a third, with its screens in `features/referee/` and its styles in `src/styles/referee.css`."

In the infra bullet, change "admin routes behind the JWT authorizer" to "admin routes behind the JWT authorizer, the two open write routes throttled".

- [ ] **Step 2: The runbook**

In `docs/runbooks/operations.md`, under `## Điều hành giải`, add a subsection in the file's own voice and language:

```markdown
### Trọng tài tự chấm điểm

1. Ở tab `Trận`, tạo bảng đấu và xếp cặp cho các trận sắp đánh.
2. Trong thẻ `Trọng tài`: bấm `Tạo mã`, rồi `Mở chấm điểm`.
3. Gửi cho trọng tài đường link trong thẻ và mã 6 số. Trọng tài nhập mã một
   lần trên điện thoại của mình.
4. Trọng tài chọn trận, bấm `Bắt đầu trận`, chấm từng điểm, đếm smash và bấm
   `Kết thúc trận`. Trang công khai hiện tỉ số đang đánh sau tối đa 20 giây.

- Trọng tài bấm nhầm `Kết thúc trận`: BTC mở trận đó ở tab `Trận`, bấm
  `Mở lại trận`. Tỉ số được giữ nguyên để sửa.
- Muốn khoá một điện thoại: bấm `Đổi mã` và gửi mã mới cho những người còn lại.
- Muốn chặn mọi trọng tài ngay: bấm `Đóng chấm điểm`.
- Mục `Lịch sử` sẽ có vài trăm dòng `trong-tai` sau một ngày thi đấu. Đó là
  bình thường: mỗi điểm là một lần lưu.
```

- [ ] **Step 3: Final checks and commit**

Run: `pnpm lint && pnpm typecheck && pnpm --filter @webminton/frontend typecheck && pnpm test && pnpm validate && pnpm build && pnpm exec playwright test`
Expected: all PASS. If `pnpm lint` complains about formatting in `packages/`, run `pnpm format` and re-run.

```bash
git add CLAUDE.md docs/runbooks/operations.md
git commit -m "docs: the referees' page"
```

- [ ] **Step 4: Hand the first apply to the organiser**

Stop here and tell the organiser, in these words: the API Gateway route `aws_apigatewayv2_route.referee` is new infrastructure, which the deploy role may not create. Before this branch is merged and deployed, it needs one local `terraform -chdir=infra apply` following `docs/runbooks/bootstrap.md`. Do not run `terraform apply`, `pnpm run deploy` or `pnpm dev:cloud` yourself: each of them changes the live site.
