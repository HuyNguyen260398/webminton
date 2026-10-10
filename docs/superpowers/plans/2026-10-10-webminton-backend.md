# Webminton Admin Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the organiser edit the whole tournament from a responsive `/quan-tri` screen, stored in DynamoDB, with every save republished to the `tournament.json` the public page already reads.

**Architecture:** A pure `applyCommand` in `packages/domain` turns `(state, command)` into the next state. One Lambda behind an HTTP API (`/api/*` on the existing CloudFront distribution) loads the state from DynamoDB, applies the command, writes it back conditionally on the version, and rewrites `tournament.json` in the site bucket. Cognito with Google as identity provider issues the ID token the API's JWT authorizer verifies; the Lambda checks an email allow-list.

**Tech Stack:** TypeScript (ESM), zod 4, vitest 5, Playwright, Next.js 16 static export, React 19, AWS SDK v3, esbuild, Terraform (AWS provider ~> 6.0), Node 24, pnpm 10.32.1.

**Spec:** `docs/superpowers/specs/2026-10-10-webminton-backend-design.md`

## Global Constraints

- All user-facing copy and error messages are Vietnamese.
- `packages/domain/src` has no `node:*` imports.
- `phone`, `note` (the private athlete note) and `skillBand` never appear in the served `tournament.json`. The snapshot is produced only by parsing through `PublicTournamentSchema`.
- Derived state is never stored: `winnerTeamId` is `null` in every stored match.
- No resource with a fixed monthly fee: no WAF, NAT gateway, VPC, Secrets Manager secret, KMS customer key, provisioned capacity or custom auth domain.
- Region `ap-southeast-1`. Lambda runtime `nodejs24.x`, arm64, 256 MB, 10 s timeout. Log retention 14 days.
- ID token validity 12 hours; no refresh-token handling; token in `sessionStorage`.
- Public page polls `/tournament.json` every 20 seconds while the tab is visible.
- The admin screen has no horizontal scroll at 390, 768 and 1280px; touch targets are at least 44px; the layout switches to two panes at 1024px.
- Hard, un-blurred shadows only (`--shadow-hard`, `--shadow-hard-sm`); rotations go through the `rot` class.
- `frontend/` and `scripts/` and `backend/` are outside `pnpm lint`; format them by hand to match neighbouring files (2 spaces, double quotes, trailing commas).
- Errors are thrown as `new Error("CODE")`, the convention already used across `packages/domain`.
- Commit messages follow the repo's style (`feat(scope): …`, `test: …`, `docs: …`) and end with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Before writing any Next.js code, read the relevant guide in `frontend/node_modules/next/dist/docs/` (see `frontend/AGENTS.md`).

## Review Focus

1. **A save tapped twice, or retried on a weak connection** — the change is applied once. (Task 5: replay test.)
2. **A second device saving from a stale screen** — it gets a conflict and overwrites nothing. (Task 5: conflict test; Task 12: e2e.)
3. **A code deploy during the tournament** — it must not replace live scores with the repo copy of `tournament.json`. (Task 8: deploy-script test.)
4. **Vietnamese names and long notes** (`Đỗ Thái Đãm`, multi-line notes) — they round-trip through DynamoDB and S3 byte-for-byte and are served as UTF-8. (Task 4 and Task 6 tests.)
5. **An empty or half-typed score field on a phone keyboard** — the save button stays disabled; `NaN` is never sent. (Task 12: `ScoreEntry` test.)

One deliberate reading of the spec: when a group result is changed after a placement match has **already been played** and the change would alter the seeding, the command is refused with `PLACEMENT_RESET_REQUIRED` rather than silently deleting played placement results. When no placement match has been played, placement is re-seeded automatically. This is the behaviour `seedPlacement` already has.

## File Structure

```
packages/domain/src/commands.ts        command schema, applyCommand, previewDraw, toRoster
packages/domain/test/commands-*.test.ts

backend/package.json, tsconfig.json, build.mjs
backend/src/store.ts                   TournamentStore interface + MemoryStore
backend/src/dynamo-store.ts            DynamoDB implementation
backend/src/publish.ts                 renderSnapshot + s3Publisher
backend/src/auth.ts                    requireAdmin
backend/src/errors.ts                  code → status + Vietnamese message
backend/src/router.ts                  route(req, deps)
backend/src/handler.ts                 Lambda entry
backend/test/*.test.ts

infra/backend.tf                       table, Lambda, role, HTTP API, CloudFront wiring locals
infra/auth.tf                          Cognito pool, Google IdP, domain, client
infra/main.tf                          + API origin and /api/* behaviour
infra/variables.tf, outputs.tf, versions.tf
infra/bootstrap/main.tf                wider deploy and plan roles
infra/test/architecture.test.ts

scripts/seed.ts                        load tournament.json into the table
scripts/local-api.ts                   in-memory API used by serve-static
scripts/serve-static.ts                + /api/* and snapshot serving
scripts/deploy.sh, smoke-deployment.ts

frontend/src/lib/use-tournament.ts     + polling
frontend/src/lib/auth.ts               PKCE sign-in, token storage
frontend/src/lib/admin-api.ts          fetch wrapper, ApiError, AdminView
frontend/src/lib/use-admin.ts          state, send(command), conflict/expiry handling
frontend/src/app/quan-tri/layout.tsx   noindex metadata
frontend/src/app/quan-tri/page.tsx     shell: header, notice, tabs
frontend/src/features/admin/*.tsx      one file per tab + ScoreEntry + fields
frontend/src/styles/admin.css
frontend/test/*.test.ts(x)
tests/e2e/admin.spec.ts
```

---

### Task 1: Domain commands — schema, info, courts, teams, finance

**Files:**
- Create: `packages/domain/src/commands.ts`
- Test: `packages/domain/test/commands-basic.test.ts`

**Interfaces:**
- Consumes: `packages/domain/src/schema.ts` (`Id`, `InfoSchema`, `PairSchema`, `ScoreSchema`, `SponsorSchema`, `IncomeSchema`, `ExpenseSchema`, `PublicTournamentSchema`, `TournamentDocument`), `derive.ts::deriveTournament`.
- Produces:
  - `PrivateFieldsSchema`, `PrivateFields` = `{ skillBand: 1|2|3|null; phone: string|null; note: string }`
  - `PrivateMapSchema`, `PrivateMap` = `Record<string, PrivateFields>`
  - `AdminState` = `{ document: TournamentDocument; private: PrivateMap }`
  - `CommandSchema`, `Command` (discriminated on `type`, each `{ type, payload }`)
  - `applyCommand(state: AdminState, command: unknown, actor: string, now: string): AdminState`

- [ ] **Step 1: Write the failing test**

`packages/domain/test/commands-basic.test.ts`:

```ts
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
      run(s, { type: "updateTeam", payload: { teamId: "blue", captainId: "a01" } })
        .document.teams[1].captainId,
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/domain/test/commands-basic.test.ts`
Expected: FAIL — cannot resolve `../src/commands`.

- [ ] **Step 3: Write the implementation**

`packages/domain/src/commands.ts`:

```ts
import { z } from "zod";
import {
  Id,
  InfoSchema,
  PairSchema,
  ScoreSchema,
  SponsorSchema,
  IncomeSchema,
  ExpenseSchema,
  PublicTournamentSchema,
  type TournamentDocument,
} from "./schema";
import { deriveTournament } from "./derive";

const text = z.string().trim().min(1).max(500);
const time = z.iso.datetime({ offset: true });

// The three fields that must never reach tournament.json, keyed by athlete id.
export const PrivateFieldsSchema = z.strictObject({
  skillBand: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  phone: z.string().max(30).nullable(),
  note: z.string().max(2000),
});
export const PrivateMapSchema = z.record(Id, PrivateFieldsSchema);
export type PrivateFields = z.infer<typeof PrivateFieldsSchema>;
export type PrivateMap = z.infer<typeof PrivateMapSchema>;

export interface AdminState {
  document: TournamentDocument;
  private: PrivateMap;
}

const command = <T extends string, S extends z.ZodType>(type: T, payload: S) =>
  z.strictObject({ type: z.literal(type), payload });
const byId = z.strictObject({ id: Id });
const byMatch = z.strictObject({ matchId: Id });

export const CommandSchema = z.discriminatedUnion("type", [
  command("updateInfo", InfoSchema.partial()),
  command(
    "setCourts",
    z.strictObject({
      courts: z.array(z.strictObject({ id: Id, name: text })).max(20),
    }),
  ),
  command(
    "updateTeam",
    z.strictObject({
      teamId: Id,
      name: text.optional(),
      color: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
      captainId: Id.nullable().optional(),
    }),
  ),
  command(
    "upsertAthlete",
    z.strictObject({
      id: Id.nullable(),
      name: text,
      gender: z.enum(["male", "female"]),
      active: z.boolean(),
      ...PrivateFieldsSchema.shape,
    }),
  ),
  command("removeAthlete", byId),
  command(
    "setAthleteTeam",
    z.strictObject({ athleteId: Id, teamId: Id.nullable() }),
  ),
  command("confirmDraw", z.strictObject({ seed: text })),
  command("resetDraw", z.strictObject({})),
  command(
    "setLineup",
    z.strictObject({ matchId: Id, pairA: PairSchema, pairB: PairSchema }),
  ),
  command(
    "publishLineup",
    z.strictObject({ matchId: Id, published: z.boolean() }),
  ),
  command(
    "setSchedule",
    z.strictObject({
      matchId: Id,
      courtId: Id.nullable(),
      startsAt: time.nullable(),
      endsAt: time.nullable(),
    }),
  ),
  command("callMatch", byMatch),
  command("setScore", z.strictObject({ matchId: Id, score: ScoreSchema })),
  command(
    "setWalkover",
    z.strictObject({ matchId: Id, absentSide: z.enum(["a", "b"]) }),
  ),
  command("clearResult", byMatch),
  command(
    "resolveTie",
    z.strictObject({
      tiedTeamIds: z.array(Id).min(2),
      orderedTeamIds: z.array(Id).min(2),
      reason: text,
    }),
  ),
  command("upsertSponsor", SponsorSchema),
  command("removeSponsor", byId),
  command("upsertIncome", IncomeSchema),
  command("removeIncome", byId),
  command("upsertExpense", ExpenseSchema),
  command("removeExpense", byId),
  command("setFinancePublished", z.strictObject({ published: z.boolean() })),
]);
export type Command = z.infer<typeof CommandSchema>;

const upsert = <T extends { id: string }>(items: T[], item: T) => {
  const i = items.findIndex((x) => x.id === item.id);
  if (i < 0) items.push(item);
  else items[i] = item;
};
const remove = (items: { id: string }[], id: string) => {
  const i = items.findIndex((x) => x.id === id);
  if (i < 0) throw new Error("NOT_FOUND");
  items.splice(i, 1);
};

// The single exit: nothing leaves applyCommand unless the public page could
// render it. Results are derived, so stored winners are always null.
function finalize(
  t: TournamentDocument,
  priv: PrivateMap,
  now: string,
): AdminState {
  t.updatedAt = now;
  t.matches.forEach((m) => (m.winnerTeamId = null));
  const ids = new Set(t.athletes.map((a) => a.id));
  for (const id of Object.keys(priv)) if (!ids.has(id)) delete priv[id];
  const parsed = PublicTournamentSchema.safeParse(t);
  if (!parsed.success) throw new Error("INVALID_DOCUMENT");
  deriveTournament(parsed.data);
  return { document: parsed.data, private: PrivateMapSchema.parse(priv) };
}

export function applyCommand(
  state: AdminState,
  input: unknown,
  actor: string,
  now: string,
): AdminState {
  const parsed = CommandSchema.safeParse(input);
  if (!parsed.success) throw new Error("INVALID_COMMAND");
  const c = parsed.data;
  // `let`: the match commands added in Task 3 replace the document wholesale.
  let t = structuredClone(state.document);
  const priv = structuredClone(state.private);

  switch (c.type) {
    case "updateInfo":
      t.info = { ...t.info, ...c.payload };
      break;
    case "setCourts": {
      const ids = new Set(c.payload.courts.map((x) => x.id));
      if (ids.size !== c.payload.courts.length)
        throw new Error("INVALID_COURTS");
      if (t.matches.some((m) => m.courtId && !ids.has(m.courtId)))
        throw new Error("COURT_IN_USE");
      t.courts = c.payload.courts;
      break;
    }
    case "updateTeam": {
      const { teamId, name, color, captainId } = c.payload;
      const team = t.teams.find((x) => x.id === teamId);
      if (!team) throw new Error("INVALID_TEAM");
      if (name !== undefined) team.name = name;
      if (color !== undefined) team.color = color;
      if (captainId !== undefined) {
        if (
          captainId !== null &&
          t.athletes.find((a) => a.id === captainId)?.teamId !== teamId
        )
          throw new Error("INVALID_CAPTAIN");
        team.captainId = captainId;
      }
      break;
    }
    case "upsertSponsor":
      upsert(t.sponsorships, c.payload);
      break;
    case "removeSponsor":
      remove(t.sponsorships, c.payload.id);
      break;
    case "upsertIncome":
      upsert(t.finance.income, c.payload);
      break;
    case "removeIncome":
      remove(t.finance.income, c.payload.id);
      break;
    case "upsertExpense":
      upsert(t.finance.expenses, c.payload);
      break;
    case "removeExpense":
      remove(t.finance.expenses, c.payload.id);
      break;
    case "setFinancePublished":
      t.finance.published = c.payload.published;
      break;
    default:
      // Athlete, draw and match commands arrive in Tasks 2 and 3.
      throw new Error("INVALID_COMMAND");
  }
  void actor;
  return finalize(t, priv, now);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm vitest run packages/domain/test/commands-basic.test.ts && pnpm typecheck`
Expected: 7 tests PASS; `tsc` prints nothing.

- [ ] **Step 5: Format and commit**

```bash
pnpm format
git add packages/domain/src/commands.ts packages/domain/test/commands-basic.test.ts
git commit -m "feat(domain): add the command layer for info, courts, teams and finance

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Domain commands — athletes and the draw

**Files:**
- Modify: `packages/domain/src/commands.ts`
- Modify: `packages/domain/src/testing/fixtures.ts` (add `makeAdminState`)
- Test: `packages/domain/test/commands-roster.test.ts`

**Interfaces:**
- Consumes: Task 1's `applyCommand`, `AdminState`; `draw.ts::generateDraw(roster, teams, seed)`; `round-robin.ts::generateGroupMatches(teams, categories)`; `roster.ts::PrivateRoster`.
- Produces:
  - `toRoster(state: AdminState): PrivateRoster`
  - `previewDraw(state: AdminState, seed: string): Record<string, string>` (athlete id → team id)
  - `makeAdminState(count = 16): AdminState` in `testing/fixtures.ts` — `count` athletes alternating male/female, every one with a skill band, phone `0900000000` and note `ghi chú riêng`. Later tasks and the local API reuse it.
  - Commands `upsertAthlete`, `removeAthlete`, `setAthleteTeam`, `confirmDraw`, `resetDraw` handled by `applyCommand`.
  - Error codes: `ATHLETE_NOT_FOUND`, `ATHLETE_IN_LINEUP`, `DRAW_LOCKED`, plus `generateDraw`'s `MISSING_SKILL`, `INSUFFICIENT_ROSTER`, `DRAW_NOT_FOUND`.

- [ ] **Step 1: Write the failing test**

`packages/domain/test/commands-roster.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  applyCommand,
  previewDraw,
  toRoster,
  type AdminState,
} from "../src/commands";
import {
  makeAdminState as rosterState,
  makeTournament,
} from "../src/testing/fixtures";

const NOW = "2026-10-18T08:00:00+07:00";
const run = (s: AdminState, command: unknown) =>
  applyCommand(s, command, "btc@example.com", NOW);

const athlete = (over: Record<string, unknown> = {}) => ({
  id: null,
  name: "Đỗ Thái Đãm",
  gender: "male",
  active: true,
  skillBand: 2,
  phone: "0901 234 567",
  note: "",
  ...over,
});

describe("applyCommand — athletes", () => {
  it("adds an athlete with the next aNN id and keeps private fields apart", () => {
    const s = { document: makeTournament(), private: {} };
    s.document.athletes = [
      { id: "a01", name: "Tân", gender: "male", teamId: null, active: true },
      { id: "a15", name: "Nhâm", gender: "male", teamId: null, active: true },
    ];
    const next = run(s, { type: "upsertAthlete", payload: athlete() });
    const added = next.document.athletes.at(-1)!;
    expect(added).toEqual({
      id: "a16",
      name: "Đỗ Thái Đãm",
      gender: "male",
      teamId: null,
      active: true,
    });
    expect(next.private.a16).toEqual({
      skillBand: 2,
      phone: "0901 234 567",
      note: "",
    });
    expect(JSON.stringify(next.document)).not.toContain("0901");
  });

  it("starts at a01 on an empty roster", () => {
    const s = { document: makeTournament(), private: {} };
    const next = run(s, { type: "upsertAthlete", payload: athlete() });
    expect(next.document.athletes[0].id).toBe("a01");
  });

  it("edits an existing athlete without touching the team", () => {
    const s = rosterState();
    s.document.athletes[0].teamId = "red";
    const next = run(s, {
      type: "upsertAthlete",
      payload: athlete({ id: "athlete-1", name: "Tên Mới", skillBand: 3 }),
    });
    expect(next.document.athletes[0]).toMatchObject({
      name: "Tên Mới",
      teamId: "red",
    });
    expect(next.private["athlete-1"].skillBand).toBe(3);
    expect(() =>
      run(s, { type: "upsertAthlete", payload: athlete({ id: "ghost" }) }),
    ).toThrow("ATHLETE_NOT_FOUND");
  });

  it("removes an athlete and every reference to them", () => {
    let s = run(rosterState(), { type: "confirmDraw", payload: { seed: "s1" } });
    const victim = s.document.athletes[0];
    s = run(s, {
      type: "updateTeam",
      payload: { teamId: victim.teamId, captainId: victim.id },
    });
    const next = run(s, { type: "removeAthlete", payload: { id: victim.id } });
    expect(next.document.athletes.some((a) => a.id === victim.id)).toBe(false);
    expect(next.private[victim.id]).toBeUndefined();
    expect(next.document.draw.assignment[victim.id]).toBeUndefined();
    expect(next.document.teams.every((t) => t.captainId !== victim.id)).toBe(
      true,
    );
  });

  it("moves an athlete by hand and keeps the draw record in step", () => {
    const s = run(rosterState(), { type: "confirmDraw", payload: { seed: "s1" } });
    const a = s.document.athletes[0];
    const target = s.document.teams.find((t) => t.id !== a.teamId)!.id;
    const next = run(s, {
      type: "setAthleteTeam",
      payload: { athleteId: a.id, teamId: target },
    });
    expect(next.document.athletes[0].teamId).toBe(target);
    expect(next.document.draw.assignment[a.id]).toBe(target);
    expect(() =>
      run(s, {
        type: "setAthleteTeam",
        payload: { athleteId: a.id, teamId: "nope" },
      }),
    ).toThrow("INVALID_TEAM");
  });
});

describe("applyCommand — draw", () => {
  it("builds the private roster from the document and the private map", () => {
    const roster = toRoster(rosterState());
    expect(roster.athletes).toHaveLength(16);
    expect(roster.athletes[0]).toMatchObject({
      id: "athlete-1",
      skillBand: 1,
      phone: "0900000000",
    });
  });

  it("previews without saving, and confirming the same seed gives the same teams", () => {
    const s = rosterState();
    const preview = previewDraw(s, "mua-2026");
    expect(Object.keys(preview)).toHaveLength(16);
    expect(s.document.draw.status).toBe("not_started");
    const next = run(s, { type: "confirmDraw", payload: { seed: "mua-2026" } });
    expect(next.document.draw.status).toBe("confirmed");
    expect(next.document.draw.assignment).toEqual(preview);
    expect(next.document.matches).toHaveLength(18);
    for (const a of next.document.athletes)
      expect(a.teamId).toBe(preview[a.id]);
  });

  it("never lets a private field into the document", () => {
    const next = run(rosterState(), {
      type: "confirmDraw",
      payload: { seed: "s1" },
    });
    const json = JSON.stringify(next.document);
    for (const leak of ['"phone"', '"skillBand"', "ghi chú riêng"])
      expect(json).not.toContain(leak);
  });

  it("refuses a roster the draw cannot balance", () => {
    expect(() =>
      run(rosterState(8), { type: "confirmDraw", payload: { seed: "s1" } }),
    ).toThrow("INSUFFICIENT_ROSTER");
    const s = rosterState();
    s.private["athlete-1"].skillBand = null;
    expect(() =>
      run(s, { type: "confirmDraw", payload: { seed: "s1" } }),
    ).toThrow("MISSING_SKILL");
  });

  it("locks the draw once a match has started, and resets it before", () => {
    const drawn = run(rosterState(), {
      type: "confirmDraw",
      payload: { seed: "s1" },
    });
    const reset = run(drawn, { type: "resetDraw", payload: {} });
    expect(reset.document.draw).toEqual({
      status: "not_started",
      algorithmVersion: "balanced-v1",
      assignment: {},
    });
    expect(reset.document.matches).toHaveLength(0);
    expect(reset.document.athletes.every((a) => a.teamId === null)).toBe(true);

    drawn.document.matches[0].status = "called";
    for (const type of ["confirmDraw", "resetDraw"])
      expect(() =>
        run(drawn, {
          type,
          payload: type === "confirmDraw" ? { seed: "s2" } : {},
        }),
      ).toThrow("DRAW_LOCKED");
    expect(() => previewDraw(drawn, "s2")).toThrow("DRAW_LOCKED");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/domain/test/commands-roster.test.ts`
Expected: FAIL — `previewDraw` and `toRoster` are not exported.

- [ ] **Step 3: Implement**

Append to `packages/domain/src/testing/fixtures.ts` (and add
`import type { AdminState } from "../commands";` to its imports):

```ts
/** 16 by default: 8 men, 8 women, enough for the draw to run. */
export function makeAdminState(count = 16): AdminState {
  const document = makeTournament();
  document.athletes = makePublicAthletes(count);
  return {
    document,
    private: Object.fromEntries(
      makeRoster(count).athletes.map((a) => [
        a.id,
        { skillBand: a.skillBand, phone: "0900000000", note: "ghi chú riêng" },
      ]),
    ),
  };
}
```

In `packages/domain/src/commands.ts`, add these imports under the existing ones:

```ts
import type { PrivateRoster } from "./roster";
import { generateDraw } from "./draw";
import { generateGroupMatches } from "./round-robin";
```

Add these functions above `applyCommand`:

```ts
export function toRoster(state: AdminState): PrivateRoster {
  return {
    athletes: state.document.athletes.map((a) => ({
      id: a.id,
      name: a.name,
      gender: a.gender,
      active: a.active,
      skillBand: state.private[a.id]?.skillBand ?? null,
      phone: state.private[a.id]?.phone ?? null,
      note: state.private[a.id]?.note ?? "",
    })),
  };
}

const started = (t: TournamentDocument) =>
  t.matches.some((m) => m.status !== "pending");

// Computed and shown to the organiser only. confirmDraw re-runs the same
// seed, and the PRNG is seeded, so what was previewed is what gets saved.
export function previewDraw(
  state: AdminState,
  seed: string,
): Record<string, string> {
  if (started(state.document)) throw new Error("DRAW_LOCKED");
  return generateDraw(toRoster(state), state.document.teams, seed).assignment;
}
```

Inside `applyCommand`, add these helpers directly after `const priv = …`:

```ts
  const inLineup = (id: string) =>
    t.matches.some((m) =>
      [...(m.pairA ?? []), ...(m.pairB ?? [])].includes(id),
    );
  const dropCaptain = (id: string) =>
    t.teams.forEach((team) => {
      if (team.captainId === id) team.captainId = null;
    });
```

Add these cases to the `switch`, above `default`:

```ts
    case "upsertAthlete": {
      const { id, skillBand, phone, note, ...pub } = c.payload;
      if (id === null) {
        const n =
          Math.max(
            0,
            ...t.athletes.map((a) => Number(/^a(\d+)$/.exec(a.id)?.[1] ?? 0)),
          ) + 1;
        const newId = `a${String(n).padStart(2, "0")}`;
        t.athletes.push({ id: newId, ...pub, teamId: null });
        priv[newId] = { skillBand, phone, note };
        break;
      }
      const a = t.athletes.find((x) => x.id === id);
      if (!a) throw new Error("ATHLETE_NOT_FOUND");
      // A lineup was validated against this gender and active flag.
      if ((a.gender !== pub.gender || (a.active && !pub.active)) && inLineup(id))
        throw new Error("ATHLETE_IN_LINEUP");
      Object.assign(a, pub);
      priv[id] = { skillBand, phone, note };
      break;
    }
    case "removeAthlete": {
      const { id } = c.payload;
      if (!t.athletes.some((a) => a.id === id))
        throw new Error("ATHLETE_NOT_FOUND");
      if (inLineup(id)) throw new Error("ATHLETE_IN_LINEUP");
      t.athletes = t.athletes.filter((a) => a.id !== id);
      delete priv[id];
      delete t.draw.assignment[id];
      dropCaptain(id);
      break;
    }
    case "setAthleteTeam": {
      const { athleteId, teamId } = c.payload;
      const a = t.athletes.find((x) => x.id === athleteId);
      if (!a) throw new Error("ATHLETE_NOT_FOUND");
      if (teamId !== null && !t.teams.some((x) => x.id === teamId))
        throw new Error("INVALID_TEAM");
      if (a.teamId === teamId) break;
      if (inLineup(athleteId)) throw new Error("ATHLETE_IN_LINEUP");
      dropCaptain(athleteId);
      a.teamId = teamId;
      if (t.draw.status === "confirmed") {
        if (teamId) t.draw.assignment[athleteId] = teamId;
        else delete t.draw.assignment[athleteId];
      }
      break;
    }
    case "confirmDraw": {
      if (started(t)) throw new Error("DRAW_LOCKED");
      const draw = generateDraw(
        toRoster({ document: t, private: priv }),
        t.teams,
        c.payload.seed,
      );
      t.draw = draw;
      t.athletes.forEach(
        (a) => (a.teamId = a.active ? (draw.assignment[a.id] ?? null) : null),
      );
      t.teams.forEach((team) => (team.captainId = null));
      t.matches = generateGroupMatches(t.teams, t.rules.categories);
      t.tieDecisions = [];
      break;
    }
    case "resetDraw":
      if (started(t)) throw new Error("DRAW_LOCKED");
      t.draw = {
        status: "not_started",
        algorithmVersion: "balanced-v1",
        assignment: {},
      };
      t.athletes.forEach((a) => (a.teamId = null));
      t.teams.forEach((team) => (team.captainId = null));
      t.matches = [];
      t.tieDecisions = [];
      break;
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run packages/domain/test/commands-roster.test.ts packages/domain/test/commands-basic.test.ts && pnpm typecheck`
Expected: all PASS; `tsc` prints nothing.

- [ ] **Step 5: Format and commit**

```bash
pnpm format
git add packages/domain/src/commands.ts packages/domain/src/testing/fixtures.ts packages/domain/test/commands-roster.test.ts
git commit -m "feat(domain): add athlete and draw commands

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: Domain commands — matches, results and ties

**Files:**
- Modify: `packages/domain/src/commands.ts`
- Test: `packages/domain/test/commands-matches.test.ts`

**Interfaces:**
- Consumes: Tasks 1–2; `advancement.ts::seedPlacement(t)` (throws `PLACEMENT_RESET_REQUIRED`); `schedule.ts::validateLineup(t, m)` (throws `INVALID_TEAM`, `INVALID_LINEUP`, `INVALID_GENDER`); `score.ts::isFinalScore`, `walkoverScore`; `standings.ts::calculateStandings`, `resultsHash`.
- Produces: commands `setLineup`, `publishLineup`, `setSchedule`, `callMatch`, `setScore`, `setWalkover`, `clearResult`, `resolveTie`. Error codes `MATCH_NOT_FOUND`, `MATCH_LOCKED`, `INVALID_STATUS`, `INVALID_COURT`, `INVALID_SCORE`, `INVALID_TIE`, `PLACEMENT_RESET_REQUIRED`. After this task the `default` branch of the switch is unreachable for a parsed command.

- [ ] **Step 1: Write the failing test**

`packages/domain/test/commands-matches.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { applyCommand, type AdminState } from "../src/commands";
import { deriveTournament } from "../src/derive";
import { makeAdminState as rosterState } from "../src/testing/fixtures";

const NOW = "2026-10-18T08:00:00+07:00";
const run = (s: AdminState, command: unknown) =>
  applyCommand(s, command, "btc@example.com", NOW);
const drawn = () =>
  run(rosterState(), { type: "confirmDraw", payload: { seed: "s1" } });
const pick = (s: AdminState, team: string, gender: string, n: number) =>
  s.document.athletes
    .filter((a) => a.teamId === team && a.gender === gender)
    .slice(0, n)
    .map((a) => a.id);
const score = (s: AdminState, matchId: string, a: number, b: number) =>
  run(s, { type: "setScore", payload: { matchId, score: { a, b } } });
// Every group match 21–18 to side A: red, blue, yellow, white in that order.
const playGroup = (s: AdminState) =>
  s.document.matches
    .filter((m) => m.phase === "group")
    .reduce((acc, m) => score(acc, m.id, 21, 18), s);

const MENS = "group-red-blue-mens_doubles";

describe("applyCommand — lineups and schedule", () => {
  it("accepts a valid lineup and rejects the wrong gender or team", () => {
    const s = drawn();
    const ok = run(s, {
      type: "setLineup",
      payload: {
        matchId: MENS,
        pairA: pick(s, "red", "male", 2),
        pairB: pick(s, "blue", "male", 2),
      },
    });
    expect(ok.document.matches[0].pairA).toEqual(pick(s, "red", "male", 2));
    expect(() =>
      run(s, {
        type: "setLineup",
        payload: {
          matchId: MENS,
          pairA: pick(s, "red", "female", 2),
          pairB: pick(s, "blue", "male", 2),
        },
      }),
    ).toThrow("INVALID_GENDER");
    expect(() =>
      run(s, {
        type: "setLineup",
        payload: {
          matchId: MENS,
          pairA: pick(s, "yellow", "male", 2),
          pairB: pick(s, "blue", "male", 2),
        },
      }),
    ).toThrow("INVALID_LINEUP");
    expect(() =>
      run(s, {
        type: "setLineup",
        payload: { matchId: "nope", pairA: ["a", "b"], pairB: ["c", "d"] },
      }),
    ).toThrow("MATCH_NOT_FOUND");
  });

  it("publishes only a complete lineup, and blocks moving a listed athlete", () => {
    const s = drawn();
    expect(() =>
      run(s, {
        type: "publishLineup",
        payload: { matchId: MENS, published: true },
      }),
    ).toThrow("INVALID_LINEUP");
    const lined = run(s, {
      type: "setLineup",
      payload: {
        matchId: MENS,
        pairA: pick(s, "red", "male", 2),
        pairB: pick(s, "blue", "male", 2),
      },
    });
    const published = run(lined, {
      type: "publishLineup",
      payload: { matchId: MENS, published: true },
    });
    expect(published.document.matches[0].lineupPublished).toBe(true);
    const [listed] = pick(s, "red", "male", 1);
    expect(() =>
      run(lined, {
        type: "setAthleteTeam",
        payload: { athleteId: listed, teamId: "white" },
      }),
    ).toThrow("ATHLETE_IN_LINEUP");
    expect(() =>
      run(lined, { type: "removeAthlete", payload: { id: listed } }),
    ).toThrow("ATHLETE_IN_LINEUP");
  });

  it("schedules a match on an existing court", () => {
    const s = run(drawn(), {
      type: "setCourts",
      payload: { courts: [{ id: "san-1", name: "Sân 1" }] },
    });
    const next = run(s, {
      type: "setSchedule",
      payload: {
        matchId: MENS,
        courtId: "san-1",
        startsAt: "2026-10-18T08:00:00+07:00",
        endsAt: "2026-10-18T08:20:00+07:00",
      },
    });
    expect(next.document.matches[0].courtId).toBe("san-1");
    expect(() =>
      run(s, {
        type: "setSchedule",
        payload: { matchId: MENS, courtId: "san-9", startsAt: null, endsAt: null },
      }),
    ).toThrow("INVALID_COURT");
  });

  it("calls a pending match once", () => {
    const called = run(drawn(), { type: "callMatch", payload: { matchId: MENS } });
    expect(called.document.matches[0].status).toBe("called");
    expect(() =>
      run(called, { type: "callMatch", payload: { matchId: MENS } }),
    ).toThrow("INVALID_STATUS");
  });
});

describe("applyCommand — results", () => {
  it("rejects a score that is not final under the 21/25 rule", () => {
    for (const [a, b] of [
      [21, 20],
      [20, 18],
      [26, 24],
      [25, 22],
    ])
      expect(() => score(drawn(), MENS, a, b)).toThrow("INVALID_SCORE");
  });

  it("stores a score, derives the winner, and stores no winner", () => {
    const next = score(drawn(), MENS, 22, 20);
    const m = next.document.matches[0];
    expect(m).toMatchObject({
      status: "completed",
      score: { a: 22, b: 20 },
      winnerTeamId: null,
    });
    expect(deriveTournament(next.document).matches[0].winnerTeamId).toBe("red");
  });

  it("records a walkover as 21–0 for the side that showed up", () => {
    const next = run(drawn(), {
      type: "setWalkover",
      payload: { matchId: MENS, absentSide: "a" },
    });
    expect(next.document.matches[0]).toMatchObject({
      status: "walkover",
      score: { a: 0, b: 21 },
    });
  });

  it("locks the lineup of a finished match", () => {
    const s = score(drawn(), MENS, 21, 10);
    expect(() =>
      run(s, {
        type: "setLineup",
        payload: {
          matchId: MENS,
          pairA: pick(s, "red", "male", 2),
          pairB: pick(s, "blue", "male", 2),
        },
      }),
    ).toThrow("MATCH_LOCKED");
  });

  it("seeds the six placement matches when the group stage completes", () => {
    const done = playGroup(drawn());
    expect(done.document.matches).toHaveLength(24);
    const first = done.document.matches.filter((m) => m.phase === "first_place");
    expect(first.every((m) => m.teamAId === "red" && m.teamBId === "blue")).toBe(
      true,
    );
    expect(done.document.matches.every((m) => m.winnerTeamId === null)).toBe(
      true,
    );
  });

  it("removes un-played placement matches when a group result is cleared", () => {
    const next = run(playGroup(drawn()), {
      type: "clearResult",
      payload: { matchId: MENS },
    });
    expect(next.document.matches).toHaveLength(18);
    expect(next.document.matches[0]).toMatchObject({
      status: "pending",
      score: null,
    });
  });

  it("refuses a group change that would re-seed a placement already played", () => {
    let s = playGroup(drawn());
    s = score(s, "first_place-mens_doubles", 21, 10);
    // Red 189 → 178, blue 180 → 183: the final would change sides.
    expect(() => score(s, MENS, 10, 21)).toThrow("PLACEMENT_RESET_REQUIRED");
    // A change that keeps the order is fine.
    expect(score(s, MENS, 21, 19).document.matches).toHaveLength(24);
  });
});

// Red and blue finish level on points for (185), wins (7) and difference (55).
const TIED: Record<string, [number, number][]> = {
  "group-red-blue": [[21, 19], [19, 21], [21, 19]],
  "group-red-yellow": [[21, 10], [21, 10], [21, 10]],
  "group-red-white": [[21, 10], [21, 10], [19, 21]],
  "group-blue-yellow": [[21, 10], [21, 10], [21, 10]],
  "group-blue-white": [[21, 10], [21, 10], [21, 19]],
  "group-yellow-white": [[21, 10], [21, 10], [21, 10]],
};
const playTied = () => {
  let s = drawn();
  const seen: Record<string, number> = {};
  for (const m of s.document.matches) {
    const i = (seen[m.encounterId] = (seen[m.encounterId] ?? -1) + 1);
    const [a, b] = TIED[m.encounterId][i];
    s = score(s, m.id, a, b);
  }
  return s;
};

describe("applyCommand — ties", () => {
  it("holds placement back while two teams are level", () => {
    const s = playTied();
    const rows = deriveTournament(s.document).standings;
    expect(rows.filter((r) => r.rank === null).map((r) => r.teamId).sort()).toEqual(
      ["blue", "red"],
    );
    expect(s.document.matches).toHaveLength(18);
  });

  it("seeds placement in the order the organiser decides", () => {
    const next = run(playTied(), {
      type: "resolveTie",
      payload: {
        tiedTeamIds: ["red", "blue"],
        orderedTeamIds: ["blue", "red"],
        reason: "Đối đầu trực tiếp",
      },
    });
    expect(next.document.tieDecisions[0].decidedBy).toBe("btc@example.com");
    const first = next.document.matches.filter((m) => m.phase === "first_place");
    expect(first).toHaveLength(3);
    expect(first.every((m) => m.teamAId === "blue" && m.teamBId === "red")).toBe(
      true,
    );
  });

  it("rejects a tie that is not one", () => {
    const s = playTied();
    for (const payload of [
      { tiedTeamIds: ["red", "yellow"], orderedTeamIds: ["red", "yellow"] },
      { tiedTeamIds: ["red", "blue"], orderedTeamIds: ["red", "white"] },
      { tiedTeamIds: ["red", "red"], orderedTeamIds: ["red", "red"] },
    ])
      expect(() =>
        run(s, { type: "resolveTie", payload: { ...payload, reason: "x" } }),
      ).toThrow("INVALID_TIE");
    expect(() =>
      run(drawn(), {
        type: "resolveTie",
        payload: {
          tiedTeamIds: ["red", "blue"],
          orderedTeamIds: ["red", "blue"],
          reason: "x",
        },
      }),
    ).toThrow("INVALID_TIE");
  });

  it("stops applying a decision the moment a group score changes", () => {
    let s = run(playTied(), {
      type: "resolveTie",
      payload: {
        tiedTeamIds: ["red", "blue"],
        orderedTeamIds: ["blue", "red"],
        reason: "Đối đầu trực tiếp",
      },
    });
    expect(s.document.matches).toHaveLength(24);
    // Red and blue stay level, but the decision was bound to the old scores.
    s = score(s, "group-yellow-white-mixed_doubles", 21, 11);
    expect(s.document.matches).toHaveLength(18);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run packages/domain/test/commands-matches.test.ts`
Expected: FAIL — the first `setLineup` throws `INVALID_COMMAND`.

- [ ] **Step 3: Implement**

In `packages/domain/src/commands.ts`, add imports:

```ts
import { seedPlacement } from "./advancement";
import { validateLineup } from "./schedule";
import { isFinalScore, walkoverScore } from "./score";
import { calculateStandings, resultsHash } from "./standings";
```

Inside `applyCommand`, add after the `dropCaptain` helper:

```ts
  const match = (id: string) => {
    const m = t.matches.find((x) => x.id === id);
    if (!m) throw new Error("MATCH_NOT_FOUND");
    return m;
  };
  const finished = (status: string) =>
    status === "completed" || status === "walkover";
```

Replace the `default:` branch and the `void actor;` line with these cases (the switch then has no default):

```ts
    case "setLineup": {
      const m = match(c.payload.matchId);
      if (finished(m.status)) throw new Error("MATCH_LOCKED");
      m.pairA = c.payload.pairA;
      m.pairB = c.payload.pairB;
      validateLineup(t, m);
      break;
    }
    case "publishLineup": {
      const m = match(c.payload.matchId);
      if (c.payload.published) validateLineup(t, m);
      m.lineupPublished = c.payload.published;
      break;
    }
    case "setSchedule": {
      const m = match(c.payload.matchId);
      const { courtId, startsAt, endsAt } = c.payload;
      if (courtId !== null && !t.courts.some((x) => x.id === courtId))
        throw new Error("INVALID_COURT");
      Object.assign(m, { courtId, startsAt, endsAt });
      break;
    }
    case "callMatch": {
      const m = match(c.payload.matchId);
      if (m.status !== "pending") throw new Error("INVALID_STATUS");
      m.status = "called";
      break;
    }
    case "setScore": {
      if (!isFinalScore(c.payload.score)) throw new Error("INVALID_SCORE");
      const m = match(c.payload.matchId);
      if (!m.teamAId || !m.teamBId) throw new Error("INVALID_TEAM");
      m.score = c.payload.score;
      m.status = "completed";
      t = seedPlacement(t);
      break;
    }
    case "setWalkover": {
      const m = match(c.payload.matchId);
      if (!m.teamAId || !m.teamBId) throw new Error("INVALID_TEAM");
      m.score = walkoverScore(c.payload.absentSide);
      m.status = "walkover";
      t = seedPlacement(t);
      break;
    }
    case "clearResult": {
      const m = match(c.payload.matchId);
      m.score = null;
      m.status = "pending";
      t = seedPlacement(t);
      break;
    }
    case "resolveTie": {
      const { tiedTeamIds, orderedTeamIds, reason } = c.payload;
      const key = (ids: string[]) => [...ids].sort().join();
      const all = calculateStandings({ ...t, tieDecisions: [] });
      const first = all.find((r) => r.teamId === tiedTeamIds[0]);
      // The decision must name the whole level group, or it never applies.
      const level = first
        ? all.filter(
            (r) =>
              r.pointsFor === first.pointsFor &&
              r.wins === first.wins &&
              r.difference === first.difference,
          )
        : [];
      if (
        !first ||
        first.played === 0 ||
        new Set(tiedTeamIds).size !== tiedTeamIds.length ||
        key(level.map((r) => r.teamId)) !== key(tiedTeamIds) ||
        key(orderedTeamIds) !== key(tiedTeamIds)
      )
        throw new Error("INVALID_TIE");
      t.tieDecisions = t.tieDecisions.filter(
        (d) => key(d.tiedTeamIds) !== key(tiedTeamIds),
      );
      t.tieDecisions.push({
        tiedTeamIds,
        orderedTeamIds,
        reason,
        decidedBy: actor,
        sourceResultsHash: resultsHash(t),
      });
      t = seedPlacement(t);
      break;
    }
```

Every member of `CommandSchema` now has a case. Do not restore `default`: a
command added to the schema later should fail loudly in review, not fall through.

- [ ] **Step 4: Run the domain suite**

Run: `pnpm vitest run packages/domain && pnpm typecheck`
Expected: all domain tests PASS, including the pre-existing ones; `tsc` prints nothing.

- [ ] **Step 5: Format and commit**

```bash
pnpm format
git add packages/domain/src/commands.ts packages/domain/test/commands-matches.test.ts
git commit -m "feat(domain): add match, result and tie commands

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---
### Task 4: Backend package and the store

**Files:**
- Create: `backend/package.json`, `backend/tsconfig.json`
- Create: `backend/src/store.ts`
- Modify: `pnpm-workspace.yaml`, `tsconfig.json`, `vitest.config.ts`
- Test: `backend/test/store.test.ts`

**Interfaces:**
- Consumes: `AdminState`, `PrivateMap` from `packages/domain/src/commands`; `TournamentDocument` from `schema`.
- Produces (all from `backend/src/store.ts`):

```ts
export interface StoredState extends AdminState {
  version: number;
  publishedVersion: number;
  recentRequests: { requestId: string; version: number }[];
}
export interface HistoryEntry {
  version: number;
  at: string;
  actorEmail: string;
  commandType: string;
  requestId: string;
}
export interface TournamentStore {
  read(): Promise<StoredState | null>;
  /** Writes version prev.version + 1 (or 1). Throws Error("CONFLICT") if the stored version is no longer prev's. */
  write(
    prev: StoredState | null,
    next: AdminState,
    entry: Omit<HistoryEntry, "version">,
  ): Promise<StoredState>;
  markPublished(version: number): Promise<void>;
  history(): Promise<HistoryEntry[]>; // newest first
  snapshot(version: number): Promise<AdminState | null>;
}
export class MemoryStore implements TournamentStore
export const RECENT_REQUESTS = 50;
```

- [ ] **Step 1: Scaffold the package**

`backend/package.json`:

```json
{
  "name": "@webminton/backend",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node build.mjs"
  }
}
```

`backend/tsconfig.json`:

```json
{
  "extends": "../tsconfig.base.json",
  "include": ["src", "test"]
}
```

`backend/build.mjs` is created in Task 6; until then `pnpm -r build` would fail on this package, so add a placeholder that Task 6 replaces:

```js
// Replaced in Task 6 by the esbuild bundle.
console.log("backend: nothing to build yet");
```

In `pnpm-workspace.yaml`, add `backend`:

```yaml
packages:
  - packages/*
  - frontend
  - backend
```

In the root `tsconfig.json`, extend `include`:

```json
{
  "extends": "./tsconfig.base.json",
  "include": [
    "packages/domain/src",
    "packages/domain/test",
    "scripts",
    "backend/src",
    "backend/test"
  ]
}
```

In `vitest.config.ts`, add `"backend/test/**/*.test.ts",` to `test.include` after the `packages/**` line.

Run: `pnpm install`
Expected: the lockfile gains the `backend` importer; no errors.

- [ ] **Step 2: Write the failing test**

`backend/test/store.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { MemoryStore, RECENT_REQUESTS } from "../src/store";
import { makeAdminState } from "../../packages/domain/src/testing/fixtures";

const entry = (requestId: string) => ({
  at: "2026-10-18T08:00:00+07:00",
  actorEmail: "btc@example.com",
  commandType: "seed",
  requestId,
});

describe("MemoryStore", () => {
  it("is empty until seeded, then counts versions from 1", async () => {
    const store = new MemoryStore();
    expect(await store.read()).toBeNull();
    const v1 = await store.write(null, makeAdminState(), entry("r1"));
    expect(v1).toMatchObject({ version: 1, publishedVersion: 0 });
    expect(v1.recentRequests).toEqual([{ requestId: "r1", version: 1 }]);
    const v2 = await store.write(v1, makeAdminState(), entry("r2"));
    expect(v2.version).toBe(2);
    expect((await store.read())!.version).toBe(2);
  });

  it("refuses a write based on a stale version", async () => {
    const store = new MemoryStore();
    const v1 = await store.write(null, makeAdminState(), entry("r1"));
    await store.write(v1, makeAdminState(), entry("r2"));
    await expect(
      store.write(v1, makeAdminState(), entry("r3")),
    ).rejects.toThrow("CONFLICT");
    await expect(
      store.write(null, makeAdminState(), entry("r4")),
    ).rejects.toThrow("CONFLICT");
  });

  it("keeps every version and lists history newest first", async () => {
    const store = new MemoryStore();
    const first = makeAdminState();
    first.document.info.location = "Sân cũ";
    let s = await store.write(null, first, entry("r1"));
    s = await store.write(s, makeAdminState(), entry("r2"));
    expect((await store.history()).map((h) => h.version)).toEqual([2, 1]);
    expect((await store.snapshot(1))!.document.info.location).toBe("Sân cũ");
    expect(await store.snapshot(9)).toBeNull();
  });

  it("round-trips Vietnamese text and returns copies, not references", async () => {
    const store = new MemoryStore();
    const state = makeAdminState();
    state.document.athletes[0].name = "Đỗ Thái Đãm";
    state.private["athlete-1"].note = "Dòng 1\nDòng 2 — ưu tiên đôi nam nữ";
    await store.write(null, state, entry("r1"));
    state.document.athletes[0].name = "mutated after write";
    const read = (await store.read())!;
    expect(read.document.athletes[0].name).toBe("Đỗ Thái Đãm");
    expect(read.private["athlete-1"].note).toBe(
      "Dòng 1\nDòng 2 — ưu tiên đôi nam nữ",
    );
  });

  it("only remembers the most recent request ids", async () => {
    const store = new MemoryStore();
    let s = await store.write(null, makeAdminState(), entry("r0"));
    for (let i = 1; i <= RECENT_REQUESTS; i++)
      s = await store.write(s, makeAdminState(), entry(`r${i}`));
    expect(s.recentRequests).toHaveLength(RECENT_REQUESTS);
    expect(s.recentRequests[0].requestId).toBe("r1");
  });

  it("records the published version without moving it backwards", async () => {
    const store = new MemoryStore();
    let s = await store.write(null, makeAdminState(), entry("r1"));
    s = await store.write(s, makeAdminState(), entry("r2"));
    await store.markPublished(2);
    await store.markPublished(1);
    expect((await store.read())!.publishedVersion).toBe(2);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run backend/test/store.test.ts`
Expected: FAIL — cannot resolve `../src/store`.

- [ ] **Step 4: Implement**

`backend/src/store.ts`:

```ts
import type { AdminState } from "../../packages/domain/src/commands";

export const RECENT_REQUESTS = 50;

export interface StoredState extends AdminState {
  version: number;
  publishedVersion: number;
  recentRequests: { requestId: string; version: number }[];
}

export interface HistoryEntry {
  version: number;
  at: string;
  actorEmail: string;
  commandType: string;
  requestId: string;
}

export interface TournamentStore {
  read(): Promise<StoredState | null>;
  write(
    prev: StoredState | null,
    next: AdminState,
    entry: Omit<HistoryEntry, "version">,
  ): Promise<StoredState>;
  markPublished(version: number): Promise<void>;
  history(): Promise<HistoryEntry[]>;
  snapshot(version: number): Promise<AdminState | null>;
}

// Shared by both stores so the two cannot drift on what a write produces.
export function nextStored(
  prev: StoredState | null,
  next: AdminState,
  requestId: string,
): StoredState {
  const version = (prev?.version ?? 0) + 1;
  return {
    version,
    publishedVersion: prev?.publishedVersion ?? 0,
    recentRequests: [
      ...(prev?.recentRequests ?? []),
      { requestId, version },
    ].slice(-RECENT_REQUESTS),
    document: next.document,
    private: next.private,
  };
}

// Used by tests and by the local server. Values are stored as JSON so a
// caller mutating what it wrote, or what it read, cannot change the store —
// the same guarantee DynamoDB gives.
export class MemoryStore implements TournamentStore {
  private current: string | null = null;
  private versions = new Map<number, { entry: HistoryEntry; state: string }>();

  async read() {
    return this.current ? (JSON.parse(this.current) as StoredState) : null;
  }

  async write(
    prev: StoredState | null,
    next: AdminState,
    entry: Omit<HistoryEntry, "version">,
  ) {
    const stored = await this.read();
    if ((stored?.version ?? 0) !== (prev?.version ?? 0))
      throw new Error("CONFLICT");
    const saved = nextStored(prev, next, entry.requestId);
    this.current = JSON.stringify(saved);
    this.versions.set(saved.version, {
      entry: { ...entry, version: saved.version },
      state: JSON.stringify({ document: next.document, private: next.private }),
    });
    return JSON.parse(this.current) as StoredState;
  }

  async markPublished(version: number) {
    const stored = await this.read();
    if (!stored || stored.publishedVersion >= version) return;
    this.current = JSON.stringify({ ...stored, publishedVersion: version });
  }

  async history() {
    return [...this.versions.values()]
      .map((v) => v.entry)
      .sort((a, b) => b.version - a.version);
  }

  async snapshot(version: number) {
    const v = this.versions.get(version);
    return v ? (JSON.parse(v.state) as AdminState) : null;
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm vitest run backend/test/store.test.ts && pnpm typecheck`
Expected: 6 tests PASS; `tsc` prints nothing.

- [ ] **Step 6: Commit**

```bash
git add backend pnpm-workspace.yaml pnpm-lock.yaml tsconfig.json vitest.config.ts
git commit -m "feat(backend): add the tournament store and its in-memory implementation

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Backend — auth, snapshot, errors and the router

**Files:**
- Create: `backend/src/auth.ts`, `backend/src/publish.ts`, `backend/src/errors.ts`, `backend/src/router.ts`
- Test: `backend/test/router.test.ts`, `backend/test/auth.test.ts`

**Interfaces:**
- Consumes: Task 4's store; `applyCommand`, `previewDraw`, `PrivateMapSchema` from domain; `PublicTournamentSchema`; `deriveTournament`.
- Produces:

```ts
// auth.ts
export type Claims = Record<string, unknown> | undefined;
export function parseEmails(raw: string | undefined): string[]; // comma separated, lower-cased, trimmed
export function requireAdmin(claims: Claims, adminEmails: string[]): string; // returns the email; throws UNAUTHORIZED | FORBIDDEN

// publish.ts
export type Publisher = (body: string) => Promise<void>;
export function renderSnapshot(document: TournamentDocument): string;

// errors.ts
export function toResponse(e: unknown): ApiResponse;

// router.ts
export interface ApiRequest { method: string; path: string; rawBody: string | null; claims: Claims }
export interface ApiResponse { status: number; body: unknown }
export interface PublicConfig { cognitoDomain: string | null; clientId: string | null; devLogin: boolean }
export interface Deps { store: TournamentStore; publish: Publisher; adminEmails: string[]; config: PublicConfig; now: () => string }
export interface AdminView extends AdminState { version: number; publishedVersion: number; published?: boolean }
export function route(req: ApiRequest, deps: Deps): Promise<ApiResponse>;
```

Routes: `GET /api/config`, `GET /api/admin/state`, `POST /api/admin/commands`, `POST /api/admin/draw/preview`, `POST /api/admin/publish`, `GET /api/admin/history`, `POST /api/admin/restore`. Error body: `{ code, message }`.

- [ ] **Step 1: Write the failing auth test**

`backend/test/auth.test.ts`:

```ts
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
```

- [ ] **Step 2: Write the failing router test**

`backend/test/router.test.ts`:

```ts
// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { route, type AdminView, type Deps } from "../src/router";
import { MemoryStore } from "../src/store";
import { makeAdminState } from "../../packages/domain/src/testing/fixtures";

const ADMIN = { email: "btc@example.com", email_verified: "true" };
let deps: Deps;
let published: string[];

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
    config: { cognitoDomain: "auth.example.com", clientId: "abc", devLogin: false },
    now: () => "2026-10-18T08:00:00+07:00",
  };
  vi.spyOn(console, "error").mockImplementation(() => {});
});

const call = (method: string, path: string, body?: unknown, claims: unknown = ADMIN) =>
  route(
    {
      method,
      path,
      rawBody: body === undefined ? null : JSON.stringify(body),
      claims: claims as Record<string, unknown> | undefined,
    },
    deps,
  );
const command = (baseVersion: number, requestId: string, cmd: unknown) =>
  call("POST", "/api/admin/commands", { baseVersion, requestId, command: cmd });
const fee = (feeVnd: number) => ({ type: "updateInfo", payload: { feeVnd } });

describe("route — access", () => {
  it("serves the public config to anyone", async () => {
    const res = await call("GET", "/api/config", undefined, undefined);
    expect(res).toEqual({ status: 200, body: deps.config });
  });

  it("guards every admin route", async () => {
    for (const [method, path] of [
      ["GET", "/api/admin/state"],
      ["POST", "/api/admin/commands"],
      ["POST", "/api/admin/draw/preview"],
      ["POST", "/api/admin/publish"],
      ["GET", "/api/admin/history"],
      ["POST", "/api/admin/restore"],
    ]) {
      expect((await call(method, path, {}, undefined)).status).toBe(401);
      const outsider = { email: "la@example.com", email_verified: "true" };
      const res = await call(method, path, {}, outsider);
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        code: "FORBIDDEN",
        message: "Tài khoản này không có quyền quản trị.",
      });
    }
  });

  it("answers 404 for an unknown path and 400 for a broken body", async () => {
    expect((await call("GET", "/api/admin/nope")).status).toBe(404);
    expect((await call("GET", "/somewhere")).status).toBe(404);
    const res = await route(
      { method: "POST", path: "/api/admin/commands", rawBody: "{not json", claims: ADMIN },
      deps,
    );
    expect(res.status).toBe(400);
    expect((await command(1, "bad id!", fee(1))).status).toBe(400);
  });

  it("says so when the table has not been seeded", async () => {
    deps.store = new MemoryStore();
    const res = await call("GET", "/api/admin/state");
    expect(res.status).toBe(503);
    expect((res.body as { code: string }).code).toBe("NOT_SEEDED");
  });
});

describe("route — commands", () => {
  it("returns the state with its private fields to an admin", async () => {
    const res = await call("GET", "/api/admin/state");
    const view = res.body as AdminView;
    expect(view.version).toBe(1);
    expect(view.private["athlete-1"].phone).toBe("0900000000");
    expect(view).not.toHaveProperty("recentRequests");
  });

  it("applies a command, bumps the version and publishes the snapshot", async () => {
    const res = await command(1, "req-1", fee(150000));
    const view = res.body as AdminView;
    expect(res.status).toBe(200);
    expect(view).toMatchObject({ version: 2, publishedVersion: 2, published: true });
    expect(view.document.info.feeVnd).toBe(150000);
    expect(published).toHaveLength(1);
    expect(JSON.parse(published[0]).info.feeVnd).toBe(150000);
    expect((await deps.store.read())!.publishedVersion).toBe(2);
  });

  it("never publishes a private field", async () => {
    await command(1, "req-1", { type: "confirmDraw", payload: { seed: "s1" } });
    for (const leak of ['"phone"', '"skillBand"', "0900000000", "ghi chú riêng"])
      expect(published[0]).not.toContain(leak);
  });

  it("applies a repeated request id once", async () => {
    await command(1, "req-1", fee(150000));
    // Same id again, as a double tap or a retry would send it.
    const again = await command(1, "req-1", fee(150000));
    expect(again.status).toBe(200);
    expect((again.body as AdminView).version).toBe(2);
    expect(await deps.store.history()).toHaveLength(2);
    expect(published).toHaveLength(1);
  });

  it("refuses a save from a stale version and changes nothing", async () => {
    await command(1, "req-1", fee(150000));
    const stale = await command(1, "req-2", fee(999));
    expect(stale.status).toBe(409);
    expect(stale.body).toEqual({
      code: "CONFLICT",
      message: "Dữ liệu vừa thay đổi — kiểm tra rồi lưu lại.",
    });
    expect((await deps.store.read())!.document.info.feeVnd).toBe(150000);
  });

  it("maps a domain refusal to 422 with a Vietnamese message", async () => {
    const res = await command(1, "req-1", {
      type: "setScore",
      payload: { matchId: "nope", score: { a: 21, b: 20 } },
    });
    expect(res.status).toBe(422);
    expect(res.body).toEqual({
      code: "INVALID_SCORE",
      message: "Tỉ số không hợp lệ — mỗi séc tới 21, hơn 2 điểm, trần 25.",
    });
    expect((await deps.store.read())!.version).toBe(1);
  });

  it("keeps the save and reports it when publishing fails", async () => {
    deps.publish = async () => {
      throw new Error("S3 down");
    };
    const res = await command(1, "req-1", fee(150000));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      version: 2,
      publishedVersion: 0,
      published: false,
    });
    deps.publish = async (body) => void published.push(body);
    const retry = await call("POST", "/api/admin/publish", {});
    expect(retry.body).toMatchObject({ publishedVersion: 2, published: true });
    expect(published).toHaveLength(1);
  });
});

describe("route — draw preview, history, restore", () => {
  it("previews a draw without saving", async () => {
    const res = await call("POST", "/api/admin/draw/preview", { seed: "s1" });
    expect(Object.keys((res.body as { assignment: object }).assignment)).toHaveLength(16);
    expect((await deps.store.read())!.version).toBe(1);
  });

  it("lists history newest first with who and what", async () => {
    await command(1, "req-1", fee(150000));
    const res = await call("GET", "/api/admin/history");
    expect((res.body as { entries: unknown[] }).entries[0]).toEqual({
      version: 2,
      at: "2026-10-18T08:00:00+07:00",
      actorEmail: "btc@example.com",
      commandType: "updateInfo",
      requestId: "req-1",
    });
  });

  it("restores an earlier version as a new one", async () => {
    await command(1, "req-1", fee(150000));
    const res = await call("POST", "/api/admin/restore", {
      baseVersion: 2,
      requestId: "req-2",
      version: 1,
    });
    const view = res.body as AdminView;
    expect(view.version).toBe(3);
    expect(view.document.info.feeVnd).toBeNull();
    expect(view.document.updatedAt).toBe("2026-10-18T08:00:00+07:00");
    expect((await deps.store.history())[0].commandType).toBe("restore:1");
    expect(
      (
        await call("POST", "/api/admin/restore", {
          baseVersion: 3,
          requestId: "req-3",
          version: 99,
        })
      ).status,
    ).toBe(404);
  });
});
```

- [ ] **Step 3: Run both to verify they fail**

Run: `pnpm vitest run backend/test/auth.test.ts backend/test/router.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 4: Implement `auth.ts`**

```ts
export type Claims = Record<string, unknown> | undefined;

export function parseEmails(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

// API Gateway has already verified the token's signature, issuer and
// audience. This is the second check: is this person an organiser?
export function requireAdmin(claims: Claims, adminEmails: string[]): string {
  const email =
    typeof claims?.email === "string" ? claims.email.toLowerCase() : null;
  if (!email) throw new Error("UNAUTHORIZED");
  const verified =
    claims?.email_verified === true || claims?.email_verified === "true";
  if (!verified || !adminEmails.includes(email)) throw new Error("FORBIDDEN");
  return email;
}
```

- [ ] **Step 5: Implement `publish.ts`**

```ts
import {
  PublicTournamentSchema,
  type TournamentDocument,
} from "../../packages/domain/src/schema";

export type Publisher = (body: string) => Promise<void>;

// The only way a document becomes the public file. PublicTournamentSchema is
// a strictObject all the way down, so an extra field throws here, not leaks.
export function renderSnapshot(document: TournamentDocument): string {
  return `${JSON.stringify(PublicTournamentSchema.parse(document), null, 2)}\n`;
}
```

- [ ] **Step 6: Implement `errors.ts`**

```ts
import type { ApiResponse } from "./router";

const http: Record<string, [number, string]> = {
  BAD_REQUEST: [400, "Yêu cầu không hợp lệ."],
  UNAUTHORIZED: [401, "Cần đăng nhập."],
  FORBIDDEN: [403, "Tài khoản này không có quyền quản trị."],
  NOT_FOUND: [404, "Không tìm thấy."],
  CONFLICT: [409, "Dữ liệu vừa thay đổi — kiểm tra rồi lưu lại."],
  NOT_SEEDED: [503, "Chưa nạp dữ liệu giải. Chạy pnpm seed."],
};

// Refusals raised by packages/domain. Each is the organiser's to fix.
const domain: Record<string, string> = {
  INVALID_COMMAND: "Thao tác không hợp lệ.",
  INVALID_DOCUMENT: "Thay đổi này làm dữ liệu giải không hợp lệ.",
  INVALID_COURTS: "Mã sân bị trùng.",
  COURT_IN_USE: "Có trận đang xếp ở sân này.",
  INVALID_COURT: "Sân không tồn tại.",
  INVALID_TEAM: "Đội không hợp lệ.",
  INVALID_CAPTAIN: "Đội trưởng phải là VĐV của đội.",
  ATHLETE_NOT_FOUND: "Không tìm thấy VĐV.",
  ATHLETE_IN_LINEUP: "VĐV đang có tên trong đội hình — gỡ khỏi đội hình trước.",
  DRAW_LOCKED: "Đã có trận được gọi hoặc đánh — không bốc thăm lại được.",
  MISSING_SKILL: "Còn VĐV đang thi đấu chưa có trình độ (1–3).",
  INSUFFICIENT_ROSTER: "Cần tối thiểu 8 nam và 8 nữ đang thi đấu.",
  DRAW_NOT_FOUND: "Không chia đều được sau 100 lần thử. Đổi mã bốc thăm khác.",
  UNSUPPORTED_FORMAT: "Thể thức giải không được hỗ trợ.",
  MATCH_NOT_FOUND: "Không tìm thấy trận đấu.",
  MATCH_LOCKED: "Trận đã có kết quả — xoá kết quả trước khi đổi đội hình.",
  INVALID_STATUS: "Trận này không ở trạng thái chờ.",
  INVALID_LINEUP: "Đội hình không hợp lệ: VĐV không thuộc đội, nghỉ thi đấu hoặc bị trùng.",
  INVALID_GENDER: "Đội hình sai giới tính so với nội dung thi đấu.",
  INVALID_SCORE: "Tỉ số không hợp lệ — mỗi séc tới 21, hơn 2 điểm, trần 25.",
  INVALID_WALKOVER: "Trận xử thắng phải có tỉ số 21–0.",
  INVALID_TIE: "Các đội này không đồng hạng, hoặc thứ tự xếp chưa đủ đội.",
  PLACEMENT_RESET_REQUIRED:
    "Đã có trận tranh hạng được đánh — xoá kết quả tranh hạng trước khi sửa vòng loại.",
  MONEY_OVERFLOW: "Số tiền quá lớn.",
};

export function toResponse(e: unknown): ApiResponse {
  const code = e instanceof Error ? e.message : "";
  if (code in http)
    return { status: http[code][0], body: { code, message: http[code][1] } };
  if (code in domain)
    return { status: 422, body: { code, message: domain[code] } };
  console.error(e);
  return {
    status: 500,
    body: { code: "INTERNAL", message: "Lỗi hệ thống. Thử lại sau." },
  };
}
```

- [ ] **Step 7: Implement `router.ts`**

```ts
import { z } from "zod";
import { Id, PublicTournamentSchema } from "../../packages/domain/src/schema";
import {
  applyCommand,
  previewDraw,
  PrivateMapSchema,
  type AdminState,
} from "../../packages/domain/src/commands";
import { requireAdmin, type Claims } from "./auth";
import { renderSnapshot, type Publisher } from "./publish";
import { toResponse } from "./errors";
import type { StoredState, TournamentStore } from "./store";

export interface ApiRequest {
  method: string;
  path: string;
  rawBody: string | null;
  claims: Claims;
}
export interface ApiResponse {
  status: number;
  body: unknown;
}
export interface PublicConfig {
  cognitoDomain: string | null;
  clientId: string | null;
  devLogin: boolean;
}
export interface Deps {
  store: TournamentStore;
  publish: Publisher;
  adminEmails: string[];
  config: PublicConfig;
  now: () => string;
}
export interface AdminView extends AdminState {
  version: number;
  publishedVersion: number;
  published?: boolean;
}

const Envelope = z.object({
  baseVersion: z.number().int().positive(),
  requestId: Id,
});
const CommandBody = Envelope.extend({ command: z.unknown() });
const RestoreBody = Envelope.extend({ version: z.number().int().positive() });
const PreviewBody = z.object({ seed: z.string().trim().min(1).max(500) });

const ok = (body: unknown): ApiResponse => ({ status: 200, body });
const view = (s: StoredState): AdminView => ({
  version: s.version,
  publishedVersion: s.publishedVersion,
  document: s.document,
  private: s.private,
});

function parse<T>(schema: z.ZodType<T>, raw: string | null): T {
  let json: unknown;
  try {
    json = JSON.parse(raw ?? "null");
  } catch {
    throw new Error("BAD_REQUEST");
  }
  const result = schema.safeParse(json);
  if (!result.success) throw new Error("BAD_REQUEST");
  return result.data;
}

async function current(deps: Deps): Promise<StoredState> {
  const state = await deps.store.read();
  if (!state) throw new Error("NOT_SEEDED");
  return state;
}

// A failed publish must not fail the save: the database is already correct,
// and the organiser can republish. So this reports rather than throws.
async function publishState(deps: Deps, s: StoredState): Promise<AdminView> {
  try {
    await deps.publish(renderSnapshot(s.document));
    await deps.store.markPublished(s.version);
    return { ...view(s), publishedVersion: s.version, published: true };
  } catch (e) {
    console.error(e);
    return { ...view(s), published: false };
  }
}

async function commit(
  deps: Deps,
  actorEmail: string,
  body: z.infer<typeof Envelope>,
  commandType: string,
  produce: (s: StoredState) => AdminState,
): Promise<ApiResponse> {
  const cur = await current(deps);
  // A double tap or a retry: the change is already in, so report success.
  if (cur.recentRequests.some((r) => r.requestId === body.requestId))
    return ok(view(cur));
  if (cur.version !== body.baseVersion) throw new Error("CONFLICT");
  const saved = await deps.store.write(cur, produce(cur), {
    at: deps.now(),
    actorEmail,
    commandType,
    requestId: body.requestId,
  });
  return ok(await publishState(deps, saved));
}

export async function route(req: ApiRequest, deps: Deps): Promise<ApiResponse> {
  try {
    const key = `${req.method} ${req.path}`;
    if (key === "GET /api/config") return ok(deps.config);
    if (!req.path.startsWith("/api/admin/")) throw new Error("NOT_FOUND");
    const actor = requireAdmin(req.claims, deps.adminEmails);

    switch (key) {
      case "GET /api/admin/state":
        return ok(view(await current(deps)));

      case "POST /api/admin/commands": {
        const body = parse(CommandBody, req.rawBody);
        const type =
          typeof (body.command as { type?: unknown })?.type === "string"
            ? (body.command as { type: string }).type
            : "unknown";
        return await commit(deps, actor, body, type, (s) =>
          applyCommand(s, body.command, actor, deps.now()),
        );
      }

      case "POST /api/admin/draw/preview": {
        const { seed } = parse(PreviewBody, req.rawBody);
        return ok({ seed, assignment: previewDraw(await current(deps), seed) });
      }

      case "POST /api/admin/publish":
        return ok(await publishState(deps, await current(deps)));

      case "GET /api/admin/history":
        return ok({ entries: await deps.store.history() });

      case "POST /api/admin/restore": {
        const body = parse(RestoreBody, req.rawBody);
        const old = await deps.store.snapshot(body.version);
        if (!old) throw new Error("NOT_FOUND");
        return await commit(deps, actor, body, `restore:${body.version}`, () => ({
          document: PublicTournamentSchema.parse({
            ...old.document,
            updatedAt: deps.now(),
          }),
          private: PrivateMapSchema.parse(old.private),
        }));
      }
    }
    throw new Error("NOT_FOUND");
  } catch (e) {
    return toResponse(e);
  }
}
```

Note: in the "maps a domain refusal" test the score `21–20` is rejected before the match lookup, which is why the code is `INVALID_SCORE` although the match id does not exist.

- [ ] **Step 8: Run the backend suite**

Run: `pnpm vitest run backend && pnpm typecheck`
Expected: all PASS; `tsc` prints nothing.

- [ ] **Step 9: Commit**

```bash
git add backend/src backend/test
git commit -m "feat(backend): add the admin router, allow-list check and snapshot renderer

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Backend — DynamoDB store, S3 publisher, Lambda handler, bundle

**Files:**
- Create: `backend/src/dynamo-store.ts`, `backend/src/s3-publisher.ts`, `backend/src/aws.ts`, `backend/src/handler.ts`
- Replace: `backend/build.mjs`
- Modify: `backend/package.json` (dependencies)
- Test: `backend/test/dynamo-store.test.ts`, `backend/test/handler.test.ts`

**Interfaces:**
- Consumes: `TournamentStore`, `StoredState`, `HistoryEntry`, `nextStored` (Task 4); `route`, `Deps`, `ApiRequest` (Task 5); `Publisher` (Task 5).
- Produces:
  - `class DynamoStore implements TournamentStore` — `new DynamoStore(db: Pick<DynamoDBDocumentClient, "send">, tableName: string)`
  - `s3Publisher(s3: Pick<S3Client, "send">, bucket: string): Publisher` — writes key `tournament.json`
  - `awsStore(table: string): TournamentStore` and `awsPublisher(bucket: string): Publisher` in `aws.ts` — the only place real AWS clients are constructed. `scripts/` imports these rather than the SDK, which pnpm installs under `backend/` only.
  - `toRequest(event: APIGatewayProxyEventV2WithJWTAuthorizer): ApiRequest` and `handler` in `handler.ts`
  - Bundle at `backend/dist/index.mjs`, exporting `handler`
  - Environment read by the handler: `TABLE_NAME`, `SITE_BUCKET`, `ADMIN_EMAILS`, `COGNITO_DOMAIN`, `COGNITO_CLIENT_ID`

Table layout (one table, `pk` + `sk` strings):

| `pk` | `sk` | Attributes |
| --- | --- | --- |
| `T#noi-bo-2026` | `CURRENT` | `version` (N), `publishedVersion` (N), `recentRequests` (L), `state` (S — JSON of `{ document, private }`) |
| `T#noi-bo-2026` | `V#000042` | `version` (N), `at`, `actorEmail`, `commandType`, `requestId`, `state` (S) |

`state` is one JSON string so Vietnamese text, nulls and empty arrays survive exactly, with no marshalling rules to get wrong.

- [ ] **Step 1: Add dependencies**

```bash
pnpm --filter @webminton/backend add @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb @aws-sdk/client-s3
pnpm --filter @webminton/backend add -D esbuild @types/aws-lambda
```

Expected: `backend/package.json` gains the five packages with exact resolved versions; commit the lockfile with this task.

- [ ] **Step 2: Write the failing store test**

`backend/test/dynamo-store.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DynamoStore } from "../src/dynamo-store";
import { makeAdminState } from "../../packages/domain/src/testing/fixtures";

// A stand-in for DynamoDBDocumentClient that records what it was sent.
function fakeDb(reply: (name: string, input: any) => unknown) {
  const sent: { name: string; input: any }[] = [];
  return {
    sent,
    send: async (cmd: { constructor: { name: string }; input: unknown }) => {
      sent.push({ name: cmd.constructor.name, input: cmd.input });
      return reply(cmd.constructor.name, cmd.input) as never;
    },
  };
}
const entry = {
  at: "2026-10-18T08:00:00+07:00",
  actorEmail: "btc@example.com",
  commandType: "updateInfo",
  requestId: "req-1",
};

describe("DynamoStore", () => {
  it("returns null when nothing is stored", async () => {
    const db = fakeDb(() => ({}));
    expect(await new DynamoStore(db as never, "t").read()).toBeNull();
    expect(db.sent[0].input).toMatchObject({
      TableName: "t",
      Key: { pk: "T#noi-bo-2026", sk: "CURRENT" },
      ConsistentRead: true,
    });
  });

  it("writes the first version only if the table is empty", async () => {
    const db = fakeDb(() => ({}));
    const state = makeAdminState();
    state.document.athletes[0].name = "Đỗ Thái Đãm";
    const saved = await new DynamoStore(db as never, "t").write(null, state, entry);
    expect(saved.version).toBe(1);
    const [current, version] = db.sent[0].input.TransactItems;
    expect(current.Put.ConditionExpression).toBe("attribute_not_exists(pk)");
    expect(current.Put.Item).toMatchObject({ sk: "CURRENT", version: 1 });
    expect(JSON.parse(current.Put.Item.state).document.athletes[0].name).toBe(
      "Đỗ Thái Đãm",
    );
    expect(version.Put.Item).toMatchObject({
      sk: "V#000001",
      actorEmail: "btc@example.com",
      commandType: "updateInfo",
    });
  });

  it("makes later writes conditional on the version it read", async () => {
    const db = fakeDb(() => ({}));
    const prev = {
      ...makeAdminState(),
      version: 41,
      publishedVersion: 40,
      recentRequests: [],
    };
    const saved = await new DynamoStore(db as never, "t").write(prev, makeAdminState(), entry);
    expect(saved).toMatchObject({ version: 42, publishedVersion: 40 });
    const put = db.sent[0].input.TransactItems[0].Put;
    expect(put.ConditionExpression).toBe("#v = :base");
    expect(put.ExpressionAttributeValues).toEqual({ ":base": 41 });
    expect(db.sent[0].input.TransactItems[1].Put.Item.sk).toBe("V#000042");
  });

  it("turns a cancelled transaction into CONFLICT", async () => {
    const db = fakeDb(() => {
      throw Object.assign(new Error("x"), { name: "TransactionCanceledException" });
    });
    await expect(
      new DynamoStore(db as never, "t").write(null, makeAdminState(), entry),
    ).rejects.toThrow("CONFLICT");
  });

  it("reads back what it stored", async () => {
    const state = makeAdminState();
    const db = fakeDb((name) =>
      name === "GetCommand"
        ? {
            Item: {
              version: 3,
              publishedVersion: 2,
              recentRequests: [{ requestId: "r", version: 3 }],
              state: JSON.stringify(state),
            },
          }
        : {},
    );
    const read = await new DynamoStore(db as never, "t").read();
    expect(read).toMatchObject({ version: 3, publishedVersion: 2 });
    expect(read!.document).toEqual(state.document);
    expect(read!.private).toEqual(state.private);
  });

  it("lists history newest first and ignores a stale publish mark", async () => {
    const db = fakeDb((name) => {
      if (name === "QueryCommand")
        return { Items: [{ version: 2, ...entry, state: "{}" }] };
      if (name === "UpdateCommand")
        throw Object.assign(new Error("x"), {
          name: "ConditionalCheckFailedException",
        });
      return {};
    });
    const store = new DynamoStore(db as never, "t");
    expect(await store.history()).toEqual([{ version: 2, ...entry }]);
    expect(db.sent[0].input).toMatchObject({ ScanIndexForward: false });
    await expect(store.markPublished(1)).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm vitest run backend/test/dynamo-store.test.ts`
Expected: FAIL — cannot resolve `../src/dynamo-store`.

- [ ] **Step 4: Implement `dynamo-store.ts`**

```ts
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type { AdminState } from "../../packages/domain/src/commands";
import {
  nextStored,
  type HistoryEntry,
  type StoredState,
  type TournamentStore,
} from "./store";

const PK = "T#noi-bo-2026";
const versionKey = (v: number) => `V#${String(v).padStart(6, "0")}`;
const named = (e: unknown, name: string) =>
  (e as { name?: string } | null)?.name === name;

export class DynamoStore implements TournamentStore {
  constructor(
    private db: Pick<DynamoDBDocumentClient, "send">,
    private table: string,
  ) {}

  async read(): Promise<StoredState | null> {
    const { Item } = await this.db.send(
      new GetCommand({
        TableName: this.table,
        Key: { pk: PK, sk: "CURRENT" },
        ConsistentRead: true,
      }),
    );
    if (!Item) return null;
    return {
      version: Item.version,
      publishedVersion: Item.publishedVersion,
      recentRequests: Item.recentRequests,
      ...(JSON.parse(Item.state) as AdminState),
    };
  }

  async write(
    prev: StoredState | null,
    next: AdminState,
    entry: Omit<HistoryEntry, "version">,
  ): Promise<StoredState> {
    const saved = nextStored(prev, next, entry.requestId);
    const state = JSON.stringify({
      document: next.document,
      private: next.private,
    });
    try {
      // One transaction: the current item moves only if nobody else moved it,
      // and the history item for that version is written with it.
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.table,
                Item: {
                  pk: PK,
                  sk: "CURRENT",
                  version: saved.version,
                  publishedVersion: saved.publishedVersion,
                  recentRequests: saved.recentRequests,
                  state,
                },
                ...(prev
                  ? {
                      ConditionExpression: "#v = :base",
                      ExpressionAttributeNames: { "#v": "version" },
                      ExpressionAttributeValues: { ":base": prev.version },
                    }
                  : { ConditionExpression: "attribute_not_exists(pk)" }),
              },
            },
            {
              Put: {
                TableName: this.table,
                Item: {
                  pk: PK,
                  sk: versionKey(saved.version),
                  version: saved.version,
                  ...entry,
                  state,
                },
              },
            },
          ],
        }),
      );
    } catch (e) {
      if (named(e, "TransactionCanceledException")) throw new Error("CONFLICT");
      throw e;
    }
    return saved;
  }

  async markPublished(version: number): Promise<void> {
    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { pk: PK, sk: "CURRENT" },
          UpdateExpression: "SET publishedVersion = :v",
          ConditionExpression: "publishedVersion < :v",
          ExpressionAttributeValues: { ":v": version },
        }),
      );
    } catch (e) {
      // A newer version is already marked; nothing to do.
      if (!named(e, "ConditionalCheckFailedException")) throw e;
    }
  }

  async history(): Promise<HistoryEntry[]> {
    const { Items = [] } = await this.db.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :v)",
        ExpressionAttributeValues: { ":pk": PK, ":v": "V#" },
        ScanIndexForward: false,
        Limit: 200,
      }),
    );
    return Items.map((i) => ({
      version: i.version,
      at: i.at,
      actorEmail: i.actorEmail,
      commandType: i.commandType,
      requestId: i.requestId,
    }));
  }

  async snapshot(version: number): Promise<AdminState | null> {
    const { Item } = await this.db.send(
      new GetCommand({
        TableName: this.table,
        Key: { pk: PK, sk: versionKey(version) },
      }),
    );
    return Item ? (JSON.parse(Item.state) as AdminState) : null;
  }
}
```

- [ ] **Step 5: Run the store test**

Run: `pnpm vitest run backend/test/dynamo-store.test.ts`
Expected: 6 tests PASS.

- [ ] **Step 6: Write the failing handler test**

`backend/test/handler.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { toRequest } from "../src/handler";
import { s3Publisher } from "../src/s3-publisher";

const event = (over: Record<string, unknown> = {}) =>
  ({
    rawPath: "/api/admin/commands",
    body: '{"a":1}',
    isBase64Encoded: false,
    requestContext: {
      http: { method: "POST" },
      authorizer: { jwt: { claims: { email: "btc@example.com" } } },
    },
    ...over,
  }) as never;

describe("toRequest", () => {
  it("lifts method, path, body and verified claims out of the event", () => {
    expect(toRequest(event())).toEqual({
      method: "POST",
      path: "/api/admin/commands",
      rawBody: '{"a":1}',
      claims: { email: "btc@example.com" },
    });
  });

  it("decodes a base64 body as UTF-8", () => {
    const body = Buffer.from('{"name":"Đỗ Thái Đãm"}').toString("base64");
    expect(toRequest(event({ body, isBase64Encoded: true })).rawBody).toBe(
      '{"name":"Đỗ Thái Đãm"}',
    );
  });

  it("has no claims on the open route", () => {
    const req = toRequest(
      event({
        rawPath: "/api/config",
        body: undefined,
        requestContext: { http: { method: "GET" } },
      }),
    );
    expect(req).toEqual({
      method: "GET",
      path: "/api/config",
      rawBody: null,
      claims: undefined,
    });
  });
});

describe("s3Publisher", () => {
  it("writes tournament.json as uncached UTF-8 JSON", async () => {
    const sent: any[] = [];
    const publish = s3Publisher(
      { send: async (cmd: { input: unknown }) => void sent.push(cmd.input) } as never,
      "site-bucket",
    );
    await publish('{"name":"Đỗ Thái Đãm"}\n');
    expect(sent[0]).toEqual({
      Bucket: "site-bucket",
      Key: "tournament.json",
      Body: '{"name":"Đỗ Thái Đãm"}\n',
      ContentType: "application/json; charset=utf-8",
      CacheControl: "no-cache",
    });
  });
});
```

- [ ] **Step 7: Run it to verify it fails**

Run: `pnpm vitest run backend/test/handler.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 8: Implement `s3-publisher.ts`, `aws.ts` and `handler.ts`**

`backend/src/s3-publisher.ts`:

```ts
import { PutObjectCommand, type S3Client } from "@aws-sdk/client-s3";
import type { Publisher } from "./publish";

// CloudFront serves /tournament.json with caching disabled, so a put is live
// immediately — no invalidation.
export function s3Publisher(
  s3: Pick<S3Client, "send">,
  bucket: string,
): Publisher {
  return async (body) => {
    await s3.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: "tournament.json",
        Body: body,
        ContentType: "application/json; charset=utf-8",
        CacheControl: "no-cache",
      }),
    );
  };
}
```

`backend/src/aws.ts`:

```ts
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { S3Client } from "@aws-sdk/client-s3";
import { DynamoStore } from "./dynamo-store";
import type { Publisher } from "./publish";
import { s3Publisher } from "./s3-publisher";
import type { TournamentStore } from "./store";

// Region and credentials come from the environment, in the Lambda and on a
// laptop alike.
export const awsStore = (table: string): TournamentStore =>
  new DynamoStore(DynamoDBDocumentClient.from(new DynamoDBClient({})), table);

export const awsPublisher = (bucket: string): Publisher =>
  s3Publisher(new S3Client({}), bucket);
```

`backend/src/handler.ts`:

```ts
import type {
  APIGatewayProxyEventV2WithJWTAuthorizer,
  APIGatewayProxyResultV2,
} from "aws-lambda";
import { parseEmails } from "./auth";
import { awsPublisher, awsStore } from "./aws";
import { route, type ApiRequest, type Deps } from "./router";

export function toRequest(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): ApiRequest {
  const body = event.body ?? null;
  return {
    method: event.requestContext.http.method,
    path: event.rawPath,
    rawBody:
      body !== null && event.isBase64Encoded
        ? Buffer.from(body, "base64").toString("utf8")
        : body,
    // Present only on routes behind the JWT authorizer, already verified.
    claims: event.requestContext.authorizer?.jwt?.claims,
  };
}

let deps: Deps | undefined;
// Built on first use so importing this module in a test needs no AWS config.
function getDeps(): Deps {
  const env = process.env;
  return (deps ??= {
    store: awsStore(env.TABLE_NAME!),
    publish: awsPublisher(env.SITE_BUCKET!),
    adminEmails: parseEmails(env.ADMIN_EMAILS),
    config: {
      cognitoDomain: env.COGNITO_DOMAIN ?? null,
      clientId: env.COGNITO_CLIENT_ID ?? null,
      // Never true in the Lambda: test tokens exist only in scripts/local-api.ts.
      devLogin: false,
    },
    now: () => new Date().toISOString(),
  });
}

export async function handler(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const res = await route(toRequest(event), getDeps());
  return {
    statusCode: res.status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
    body: JSON.stringify(res.body),
  };
}
```

- [ ] **Step 9: Replace `backend/build.mjs`**

```js
import { build } from "esbuild";

// One ESM file for the Lambda. The AWS SDK ships in the nodejs24.x runtime,
// so it stays external; zod and the domain package are bundled in.
await build({
  entryPoints: ["src/handler.ts"],
  outfile: "dist/index.mjs",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  external: ["@aws-sdk/*"],
  minify: false,
  sourcemap: false,
  logLevel: "info",
});
```

- [ ] **Step 10: Run tests, typecheck and the bundle**

Run: `pnpm vitest run backend && pnpm typecheck && pnpm --filter @webminton/backend build && node -e "import('./backend/dist/index.mjs').then(m => console.log(typeof m.handler))"`
Expected: all tests PASS; `tsc` prints nothing; esbuild reports `dist/index.mjs`; the last command prints `function`.

- [ ] **Step 11: Commit**

```bash
git add backend pnpm-lock.yaml
git commit -m "feat(backend): add the DynamoDB store, S3 publisher and Lambda handler

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Infrastructure

**Files:**
- Create: `infra/backend.tf`, `infra/auth.tf`
- Modify: `infra/main.tf` (CloudFront origin + behaviour), `infra/variables.tf`, `infra/outputs.tf`, `infra/versions.tf`, `infra/terraform.tfvars.example`, `infra/bootstrap/main.tf`, `.gitignore`
- Test: `infra/test/architecture.test.ts`

**Interfaces:**
- Consumes: the bundle path `backend/dist/index.mjs` and the handler's environment names (Task 6).
- Produces:
  - Terraform variables `google_client_id`, `google_client_secret` (sensitive), `admin_emails` (list of string).
  - Outputs `table_name`, `cognito_domain`, `cognito_client_id`, `google_redirect_uri`, in addition to the existing three.
  - The API reachable at `https://giaicaulong2026.nghuy.link/api/*`.

- [ ] **Step 1: Rewrite the architecture test first**

In `infra/test/architecture.test.ts`, replace the top-of-file reads with:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const main = readFileSync("infra/main.tf", "utf8");
const versions = readFileSync("infra/versions.tf", "utf8");
const backend = readFileSync("infra/backend.tf", "utf8");
const auth = readFileSync("infra/auth.tf", "utf8");
const all = [main, backend, auth].join("\n");
```

Delete the whole `it("has no backend left", …)` test and add, inside the same `describe`:

```ts
  it("protects the tournament table", () => {
    expect(backend).toContain('resource "aws_dynamodb_table" "tournament"');
    expect(backend).toMatch(/billing_mode\s+=\s+"PAY_PER_REQUEST"/);
    expect(backend).toMatch(/deletion_protection_enabled\s+=\s+true/);
    expect(backend).toMatch(/point_in_time_recovery\s*{\s*enabled\s+=\s+true/);
  });

  it("puts every admin route behind the JWT authorizer", () => {
    const routes = [
      ...backend.matchAll(/resource "aws_apigatewayv2_route" "(\w+)" {([^}]*)}/g),
    ].map((m) => ({ name: m[1], body: m[2] }));
    expect(routes.map((r) => r.name).sort()).toEqual(["admin", "config"]);
    const admin = routes.find((r) => r.name === "admin")!.body;
    expect(admin).toMatch(/route_key\s+=\s+"ANY \/api\/admin\/\{proxy\+\}"/);
    expect(admin).toMatch(/authorization_type\s+=\s+"JWT"/);
    expect(admin).toContain("aws_apigatewayv2_authorizer.jwt.id");
    // The only open route serves two public identifiers, nothing else.
    expect(routes.find((r) => r.name === "config")!.body).toMatch(
      /route_key\s+=\s+"GET \/api\/config"/,
    );
  });

  it("lets the Lambda write exactly one object in the site bucket", () => {
    expect(backend).toContain('"${aws_s3_bucket.site.arn}/tournament.json"');
    expect(backend).not.toContain('"${aws_s3_bucket.site.arn}/*"');
    expect(backend).not.toMatch(/"s3:\*"|"dynamodb:\*"|Action\s+=\s+"\*"/);
  });

  it("routes /api/* to the API without caching", () => {
    expect(main).toMatch(/path_pattern\s+=\s+"\/api\/\*"/);
    // Managed-AllViewerExceptHostHeader: forwards Authorization to the API.
    expect(main).toContain("b689b0a8-53d0-40ab-baf2-68738e2966ac");
  });

  it("signs admins in with Google only, for twelve hours", () => {
    expect(auth).toMatch(/provider_type\s+=\s+"Google"/);
    expect(auth).toMatch(/supported_identity_providers\s+=\s+\["Google"\]/);
    expect(auth).toMatch(/email_verified\s+=\s+"email_verified"/);
    expect(auth).toMatch(/generate_secret\s+=\s+false/);
    expect(auth).toMatch(/id_token_validity\s+=\s+12/);
  });

  it("keeps Lambda logs for fourteen days", () => {
    expect(backend).toMatch(/retention_in_days\s+=\s+14/);
  });

  it("adds nothing with a fixed monthly fee", () => {
    for (const resource of [
      "aws_wafv2_web_acl",
      "aws_nat_gateway",
      "aws_vpc",
      "aws_secretsmanager_secret",
      "aws_kms_key",
    ])
      expect(all).not.toContain(resource);
    expect(backend).not.toContain("PROVISIONED");
  });
```

Run: `pnpm vitest run infra/test/architecture.test.ts`
Expected: FAIL — `infra/backend.tf` does not exist.

- [ ] **Step 2: Variables, provider and outputs**

Append to `infra/variables.tf`:

```hcl
variable "google_client_id" {
  type        = string
  description = "Client ID của OAuth client Google (loại Web application)."
}

variable "google_client_secret" {
  type        = string
  description = "Client secret của OAuth client Google."
  sensitive   = true
}

variable "admin_emails" {
  type        = list(string)
  description = "Các email Google được phép vào trang quản trị."
}
```

In `infra/versions.tf`, add the archive provider:

```hcl
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 6.0" }
    archive = { source = "hashicorp/archive", version = "~> 2.0" }
  }
```

Append to `infra/outputs.tf`:

```hcl
output "table_name" { value = aws_dynamodb_table.tournament.name }
output "cognito_domain" { value = local.cognito_domain }
output "cognito_client_id" { value = aws_cognito_user_pool_client.admin.id }
output "google_redirect_uri" { value = "https://${local.cognito_domain}/oauth2/idpresponse" }
```

Append to `infra/terraform.tfvars.example`:

```hcl
# OAuth client Google — xem docs/runbooks/bootstrap.md
google_client_id     = "xxxxxxxx.apps.googleusercontent.com"
google_client_secret = "doi-thanh-secret-that"
admin_emails         = ["ban@gmail.com"]
```

Append to `.gitignore`:

```
infra/.build/
```

- [ ] **Step 3: Create `infra/auth.tf`**

```hcl
# ------------------------------------------------------------------ sign-in
# Google is the only way in. The pool exists to turn a Google login into a
# token the HTTP API can verify; who counts as an organiser is decided by the
# Lambda's allow-list, not by membership of this pool.
data "aws_caller_identity" "current" {}

locals {
  cognito_prefix = "${var.name_prefix}-${data.aws_caller_identity.current.account_id}"
  cognito_domain = "${local.cognito_prefix}.auth.${var.region}.amazoncognito.com"
}

resource "aws_cognito_user_pool" "admin" {
  name                = "${var.name_prefix}-admin"
  deletion_protection = "ACTIVE"
}

resource "aws_cognito_identity_provider" "google" {
  user_pool_id  = aws_cognito_user_pool.admin.id
  provider_name = "Google"
  provider_type = "Google"
  provider_details = {
    client_id        = var.google_client_id
    client_secret    = var.google_client_secret
    authorize_scopes = "openid email"
  }
  # Without email_verified mapped, the ID token says "false" and the Lambda
  # refuses everyone.
  attribute_mapping = {
    email          = "email"
    email_verified = "email_verified"
    username       = "sub"
  }
}

resource "aws_cognito_user_pool_domain" "admin" {
  domain       = local.cognito_prefix
  user_pool_id = aws_cognito_user_pool.admin.id
}

resource "aws_cognito_user_pool_client" "admin" {
  name                                 = "${var.name_prefix}-admin-web"
  user_pool_id                         = aws_cognito_user_pool.admin.id
  generate_secret                      = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email"]
  supported_identity_providers         = ["Google"]
  callback_urls = [
    "https://${var.domain_name}/quan-tri/",
    "http://localhost:3100/quan-tri/",
  ]
  logout_urls = [
    "https://${var.domain_name}/quan-tri/",
    "http://localhost:3100/quan-tri/",
  ]
  id_token_validity      = 12
  access_token_validity  = 12
  refresh_token_validity = 1
  token_validity_units {
    id_token      = "hours"
    access_token  = "hours"
    refresh_token = "days"
  }
  depends_on = [aws_cognito_identity_provider.google]
}
```

- [ ] **Step 4: Create `infra/backend.tf`**

```hcl
# ------------------------------------------------------------------ database
# One item holds the current tournament; one more per version is the history.
resource "aws_dynamodb_table" "tournament" {
  name                        = "${var.name_prefix}-tournament"
  billing_mode                = "PAY_PER_REQUEST"
  hash_key                    = "pk"
  range_key                   = "sk"
  deletion_protection_enabled = true

  attribute {
    name = "pk"
    type = "S"
  }
  attribute {
    name = "sk"
    type = "S"
  }
  point_in_time_recovery {
    enabled = true
  }
}

# -------------------------------------------------------------------- lambda
data "archive_file" "api" {
  type        = "zip"
  source_file = "${path.module}/../backend/dist/index.mjs"
  output_path = "${path.module}/.build/api.zip"
}

resource "aws_iam_role" "api" {
  name = "${var.name_prefix}-api"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
}

resource "aws_cloudwatch_log_group" "api" {
  name              = "/aws/lambda/${var.name_prefix}-api"
  retention_in_days = 14
}

resource "aws_iam_role_policy" "api" {
  name = "${var.name_prefix}-api"
  role = aws_iam_role.api.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Tournament"
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query",
        ]
        Resource = aws_dynamodb_table.tournament.arn
      },
      {
        # The whole point of the narrow resource: a bug in the Lambda cannot
        # overwrite the page itself.
        Sid      = "PublishSnapshot"
        Effect   = "Allow"
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.site.arn}/tournament.json"
      },
      {
        Sid      = "Logs"
        Effect   = "Allow"
        Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.api.arn}:*"
      },
    ]
  })
}

resource "aws_lambda_function" "api" {
  function_name    = "${var.name_prefix}-api"
  role             = aws_iam_role.api.arn
  runtime          = "nodejs24.x"
  architectures    = ["arm64"]
  handler          = "index.handler"
  filename         = data.archive_file.api.output_path
  source_code_hash = data.archive_file.api.output_base64sha256
  memory_size      = 256
  timeout          = 10

  environment {
    variables = {
      TABLE_NAME        = aws_dynamodb_table.tournament.name
      SITE_BUCKET       = aws_s3_bucket.site.id
      ADMIN_EMAILS      = join(",", var.admin_emails)
      COGNITO_DOMAIN    = local.cognito_domain
      COGNITO_CLIENT_ID = aws_cognito_user_pool_client.admin.id
    }
  }
  depends_on = [aws_cloudwatch_log_group.api]
}

# ------------------------------------------------------------------ http api
resource "aws_apigatewayv2_api" "api" {
  name          = "${var.name_prefix}-api"
  protocol_type = "HTTP"
}

resource "aws_apigatewayv2_integration" "api" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.api.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_authorizer" "jwt" {
  api_id           = aws_apigatewayv2_api.api.id
  name             = "cognito"
  authorizer_type  = "JWT"
  identity_sources = ["$request.header.Authorization"]
  jwt_configuration {
    audience = [aws_cognito_user_pool_client.admin.id]
    issuer   = "https://cognito-idp.${var.region}.amazonaws.com/${aws_cognito_user_pool.admin.id}"
  }
}

# Keep `target` as the last attribute of both routes: architecture.test.ts
# reads each block up to its first "}", which is the one inside "${…}".
resource "aws_apigatewayv2_route" "config" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "GET /api/config"
  target    = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_route" "admin" {
  api_id             = aws_apigatewayv2_api.api.id
  route_key          = "ANY /api/admin/{proxy+}"
  authorization_type = "JWT"
  authorizer_id      = aws_apigatewayv2_authorizer.jwt.id
  target             = "integrations/${aws_apigatewayv2_integration.api.id}"
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
  default_route_settings {
    throttling_rate_limit  = 20
    throttling_burst_limit = 40
  }
}

resource "aws_lambda_permission" "api" {
  statement_id  = "AllowHttpApi"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.api.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}
```

- [ ] **Step 5: Wire CloudFront**

In `infra/main.tf`, inside `resource "aws_cloudfront_distribution" "site"`, add a second `origin` block after the existing one:

```hcl
  origin {
    origin_id   = "api"
    domain_name = replace(aws_apigatewayv2_api.api.api_endpoint, "https://", "")
    custom_origin_config {
      http_port              = 80
      https_port             = 443
      origin_protocol_policy = "https-only"
      origin_ssl_protocols   = ["TLSv1.2"]
    }
  }
```

and add this `ordered_cache_behavior` after the existing `/tournament.json` one:

```hcl
  # The admin API. Never cached, and the Authorization header must reach it.
  ordered_cache_behavior {
    path_pattern           = "/api/*"
    target_origin_id       = "api"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods         = ["GET", "HEAD"]
    # Managed-CachingDisabled
    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad"
    # Managed-AllViewerExceptHostHeader
    origin_request_policy_id = "b689b0a8-53d0-40ab-baf2-68738e2966ac"
  }
```

Also change the stale comment above `resource "aws_s3_bucket" "site"` to:

```hcl
# Versioned so a previous tournament.json stays retrievable even though the
# database is now the source of truth: it is the fallback if the API is down.
```

- [ ] **Step 6: Validate**

```bash
pnpm --filter @webminton/backend build
terraform fmt -recursive infra
terraform -chdir=infra init -backend=false
terraform -chdir=infra validate
pnpm vitest run infra/test/architecture.test.ts
```

Expected: `Success! The configuration is valid.`; all architecture tests PASS.

- [ ] **Step 7: Widen the GitHub roles**

The deploy role may converge existing resources but, as its comment says, first creation stays a local apply. In `infra/bootstrap/main.tf`, append these statements to the `Statement` list of `aws_iam_role_policy.github_deploy`:

```hcl
      {
        Sid    = "ApiFunction"
        Effect = "Allow"
        Action = [
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration",
          "lambda:GetFunctionCodeSigningConfig",
          "lambda:GetPolicy",
          "lambda:ListVersionsByFunction",
          "lambda:UpdateFunctionCode",
          "lambda:UpdateFunctionConfiguration",
          "lambda:TagResource",
          "lambda:UntagResource",
        ]
        Resource = "arn:aws:lambda:${var.region}:${data.aws_caller_identity.current.account_id}:function:webminton-*"
      },
      {
        Sid    = "ApiRole"
        Effect = "Allow"
        Action = [
          "iam:GetRole",
          "iam:GetRolePolicy",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "iam:PutRolePolicy",
          "iam:PassRole",
        ]
        Resource = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:role/webminton-api"
      },
      {
        Sid    = "TournamentTable"
        Effect = "Allow"
        Action = [
          "dynamodb:DescribeTable",
          "dynamodb:DescribeContinuousBackups",
          "dynamodb:DescribeTimeToLive",
          "dynamodb:ListTagsOfResource",
          "dynamodb:UpdateTable",
          "dynamodb:UpdateContinuousBackups",
        ]
        Resource = "arn:aws:dynamodb:${var.region}:${data.aws_caller_identity.current.account_id}:table/webminton-*"
      },
      {
        Sid      = "HttpApi"
        Effect   = "Allow"
        Action   = ["apigateway:GET", "apigateway:PATCH", "apigateway:PUT", "apigateway:POST"]
        Resource = "arn:aws:apigateway:${var.region}::/apis*"
      },
      {
        Sid    = "AdminPool"
        Effect = "Allow"
        Action = [
          "cognito-idp:DescribeUserPool",
          "cognito-idp:DescribeUserPoolClient",
          "cognito-idp:DescribeUserPoolDomain",
          "cognito-idp:DescribeIdentityProvider",
          "cognito-idp:GetUserPoolMfaConfig",
          "cognito-idp:UpdateUserPool",
          "cognito-idp:UpdateUserPoolClient",
          "cognito-idp:UpdateIdentityProvider",
        ]
        Resource = "*"
      },
      {
        Sid    = "ApiLogs"
        Effect = "Allow"
        Action = [
          "logs:DescribeLogGroups",
          "logs:ListTagsForResource",
          "logs:PutRetentionPolicy",
        ]
        Resource = "*"
      },
      {
        Sid      = "Identity"
        Effect   = "Allow"
        Action   = "sts:GetCallerIdentity"
        Resource = "*"
      },
```

Append these read-only statements to `aws_iam_role_policy.github_plan`:

```hcl
      {
        Sid    = "BackendRead"
        Effect = "Allow"
        Action = [
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration",
          "lambda:GetFunctionCodeSigningConfig",
          "lambda:GetPolicy",
          "lambda:ListVersionsByFunction",
          "iam:GetRole",
          "iam:GetRolePolicy",
          "iam:ListRolePolicies",
          "iam:ListAttachedRolePolicies",
          "dynamodb:DescribeTable",
          "dynamodb:DescribeContinuousBackups",
          "dynamodb:DescribeTimeToLive",
          "dynamodb:ListTagsOfResource",
          "apigateway:GET",
          "cognito-idp:DescribeUserPool",
          "cognito-idp:DescribeUserPoolClient",
          "cognito-idp:DescribeUserPoolDomain",
          "cognito-idp:DescribeIdentityProvider",
          "cognito-idp:GetUserPoolMfaConfig",
          "logs:DescribeLogGroups",
          "logs:ListTagsForResource",
          "sts:GetCallerIdentity",
        ]
        Resource = "*"
      },
```

Run: `terraform fmt -recursive infra && terraform -chdir=infra/bootstrap init -backend=false && terraform -chdir=infra/bootstrap validate`
Expected: `Success! The configuration is valid.`

Do **not** run `terraform apply` on either configuration. Applying is the organiser's step (Task 15).

- [ ] **Step 8: Commit**

```bash
git add infra .gitignore
git commit -m "feat(infra): provision the tournament table, admin API and Google sign-in

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Seed script and the deploy pipeline

**Files:**
- Create: `scripts/seed.ts`
- Modify: `scripts/deploy.sh`, `scripts/smoke-deployment.ts`, `package.json`, `.github/workflows/deploy.yml`, `.github/workflows/plan.yml`
- Test: `scripts/test/seed.test.ts`, `scripts/test/deploy.test.ts`

**Interfaces:**
- Consumes: `awsStore`, `awsPublisher`, `renderSnapshot`, `TournamentStore`, `Publisher` (Tasks 4–6); `PrivateRosterSchema`; `validateTournament` from `scripts/validate-tournament.ts`.
- Produces:
  - `buildSeed(rawDocument: unknown, rawRoster: unknown | null): AdminState` — throws `Error` with a Vietnamese message on invalid input.
  - `seed(store, publish, state, opts: { force: boolean; now: string }): Promise<number>` — returns the new version; throws `Error("ALREADY_SEEDED")` without `force`.
  - CLI: `pnpm seed [--force]`, reading `TABLE_NAME` and `SITE_BUCKET` from the environment or from `terraform output`.

- [ ] **Step 1: Write the failing tests**

`scripts/test/seed.test.ts`:

```ts
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
```

`scripts/test/deploy.test.ts`:

```ts
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
    const sync = [...commands.matchAll(/aws s3 sync[^\n]*(?:\\\n[^\n]*)*/g)].map(
      (m) => m[0],
    );
    expect(sync.length).toBeGreaterThan(0);
    for (const s of sync) expect(s).toMatch(/--exclude\s+"tournament\.json"/);
  });
});
```

Run: `pnpm vitest run scripts/test/seed.test.ts scripts/test/deploy.test.ts`
Expected: FAIL — `../seed` not found; `deploy.sh` still includes `tournament.json`.

- [ ] **Step 2: Implement `scripts/seed.ts`**

```ts
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { PublicTournamentSchema } from "../packages/domain/src/schema";
import { PrivateRosterSchema } from "../packages/domain/src/roster";
import type { AdminState } from "../packages/domain/src/commands";
import { awsPublisher, awsStore } from "../backend/src/aws";
import { renderSnapshot, type Publisher } from "../backend/src/publish";
import type { TournamentStore } from "../backend/src/store";
import { validateTournament } from "./validate-tournament";

const PUBLIC = "frontend/public/tournament.json";
const PRIVATE = ".private/roster.json";

export function buildSeed(
  rawDocument: unknown,
  rawRoster: unknown | null,
): AdminState {
  const problems = validateTournament(rawDocument);
  if (problems.length)
    throw new Error(`${PUBLIC} không hợp lệ:\n  · ${problems.join("\n  · ")}`);
  const document = PublicTournamentSchema.parse(rawDocument);
  const roster = rawRoster ? PrivateRosterSchema.parse(rawRoster) : null;
  return {
    document,
    private: Object.fromEntries(
      document.athletes.map((a) => {
        const p = roster?.athletes.find((x) => x.id === a.id);
        return [
          a.id,
          {
            skillBand: p?.skillBand ?? null,
            phone: p?.phone ?? null,
            note: p?.note ?? "",
          },
        ];
      }),
    ),
  };
}

export async function seed(
  store: TournamentStore,
  publish: Publisher,
  state: AdminState,
  opts: { force: boolean; now: string },
): Promise<number> {
  const current = await store.read();
  if (current && !opts.force) throw new Error("ALREADY_SEEDED");
  const saved = await store.write(current, state, {
    at: opts.now,
    actorEmail: "seed",
    commandType: "seed",
    requestId: `seed-${Date.parse(opts.now)}`,
  });
  await publish(renderSnapshot(saved.document));
  await store.markPublished(saved.version);
  return saved.version;
}

const output = (name: string) =>
  execFileSync("terraform", ["-chdir=infra", "output", "-raw", name], {
    encoding: "utf8",
  }).trim();

if (import.meta.filename === process.argv[1]) {
  const force = process.argv.includes("--force");
  try {
    const state = buildSeed(
      JSON.parse(readFileSync(PUBLIC, "utf8")),
      existsSync(PRIVATE) ? JSON.parse(readFileSync(PRIVATE, "utf8")) : null,
    );
    const table = process.env.TABLE_NAME ?? output("table_name");
    const bucket = process.env.SITE_BUCKET ?? output("site_bucket_name");
    const version = await seed(awsStore(table), awsPublisher(bucket), state, {
      force,
      now: new Date().toISOString(),
    });
    console.log(
      `✓ Đã nạp ${state.document.athletes.length} VĐV, ${state.document.matches.length} trận vào ${table} (phiên bản ${version}) và công bố tournament.json.`,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(
      message === "ALREADY_SEEDED"
        ? "✗ Bảng đã có dữ liệu. Thêm --force để ghi đè bằng nội dung trong repo (bản cũ vẫn nằm trong lịch sử)."
        : `✗ ${message}`,
    );
    process.exit(1);
  }
}
```

In the root `package.json`, add to `scripts` after `"draw"`:

```json
    "seed": "node --import tsx scripts/seed.ts",
```

- [ ] **Step 3: Stop the deploy script uploading the data file**

In `scripts/deploy.sh`, replace the header comment's last two lines and pass 2 so the file reads:

```bash
#!/usr/bin/env bash
# Invoke as `pnpm run deploy` — a bare `pnpm deploy` hits pnpm's own
# workspace-deploy command instead of this script.
# Build must already exist. Uploads in two passes so fingerprinted assets are
# cached forever while the HTML stays revalidated.
#
# tournament.json is NOT uploaded: the database owns it and the API rewrites
# it on every save. Uploading the repo copy here would overwrite live scores.
# To push the repo copy on purpose, run `pnpm seed --force`.
set -euo pipefail

BUCKET="${SITE_BUCKET:-$(terraform -chdir=infra output -raw site_bucket_name)}"
DIST="${DISTRIBUTION_ID:-$(terraform -chdir=infra output -raw distribution_id)}"
OUT=frontend/out

[ -d "$OUT" ] || { echo "Chưa có bản build. Chạy pnpm build trước."; exit 1; }

# Pass 1: everything immutable. --delete belongs here only.
aws s3 sync "$OUT" "s3://$BUCKET" --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "*.html" --exclude "tournament.json"

# Pass 2: the mutable entry points.
aws s3 sync "$OUT" "s3://$BUCKET" \
  --cache-control "no-cache" \
  --exclude "*" --exclude "tournament.json" --include "*.html"

aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" >/dev/null
echo "✓ Đã triển khai lên s3://$BUCKET và làm mới CloudFront."
```

(`aws s3 sync` applies filters in order and the last match wins, so `--include "*.html"` after the two excludes uploads only HTML.)

- [ ] **Step 4: Extend the smoke check**

In `scripts/smoke-deployment.ts`, insert before the `if (problems.length)` block:

```ts
// The admin API: the open route answers, and the guarded one refuses a
// request with no token before it ever reaches the Lambda.
const config = await fetch(`${base}/api/config`);
if (!config.ok) problems.push(`/api/config trả về ${config.status}`);
else {
  const c = (await config.json()) as { clientId?: unknown; devLogin?: unknown };
  if (typeof c.clientId !== "string") problems.push("/api/config thiếu clientId");
  if (c.devLogin !== false) problems.push("/api/config không được bật devLogin");
}
const guarded = await fetch(`${base}/api/admin/state`);
if (guarded.status !== 401)
  problems.push(`/api/admin/state không token phải trả 401, đang là ${guarded.status}`);

const admin = await fetch(`${base}/quan-tri/`);
if (!admin.ok) problems.push(`/quan-tri/ trả về ${admin.status}`);
```

- [ ] **Step 5: Update the workflows**

In `.github/workflows/deploy.yml`, extend the job `env` and move the build before Terraform. The `env` block becomes:

```yaml
    env:
      TF_VAR_site_bucket_name: ${{ vars.SITE_BUCKET_NAME }}
      TF_VAR_google_client_id: ${{ vars.GOOGLE_CLIENT_ID }}
      TF_VAR_google_client_secret: ${{ secrets.GOOGLE_CLIENT_SECRET }}
      # A JSON list, e.g. ["ban@gmail.com"]
      TF_VAR_admin_emails: ${{ vars.ADMIN_EMAILS }}
```

Insert this step directly after `- run: pnpm install --frozen-lockfile` and delete the later `- run: pnpm build` step together with its comment line:

```yaml
      # Before Terraform: the Lambda zip is made from backend/dist. The static
      # build still needs no Terraform output.
      - run: pnpm build
```

In `.github/workflows/plan.yml`, give the job the same four `TF_VAR_*` entries, and insert these steps after the checkout step:

```yaml
      - uses: pnpm/action-setup@v4
        with:
          version: 10.32.1
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm --filter @webminton/backend build
```

`quality.yml` needs no change: it already runs `pnpm build` before `terraform validate`, and `validate` needs no variable values.

- [ ] **Step 6: Run everything touched**

Run: `pnpm vitest run scripts backend infra && pnpm typecheck && bash -n scripts/deploy.sh`
Expected: all PASS; `tsc` and `bash -n` print nothing.

- [ ] **Step 7: Commit**

```bash
git add scripts package.json .github/workflows
git commit -m "feat(deploy): seed the table from tournament.json and stop deploys overwriting it

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Public page polling

**Files:**
- Modify: `frontend/src/lib/use-tournament.ts`
- Test: `frontend/test/use-tournament-poll.test.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: `POLL_MS = 20_000` exported from `use-tournament.ts`. `useTournament()` keeps its return shape `{ view, error, reload }`. `parseTournament` is unchanged.

- [ ] **Step 1: Write the failing test**

`frontend/test/use-tournament-poll.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { POLL_MS, useTournament } from "../src/lib/use-tournament";
import { makeTournament } from "../../packages/domain/src/testing/fixtures";

const doc = (location: string) => {
  const t = makeTournament();
  t.info.location = location;
  return t;
};
let responses: (() => Promise<unknown>)[];
const ok = (body: unknown) => async () => ({ ok: true, json: async () => body });
const visibility = (state: "visible" | "hidden") =>
  Object.defineProperty(document, "visibilityState", {
    value: state,
    configurable: true,
  });
const flush = (ms = 0) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
  visibility("visible");
  responses = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(() => (responses.shift() ?? ok(doc("mặc định")))()),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useTournament polling", () => {
  it("picks up a new snapshot after 20 seconds without a reload", async () => {
    responses = [ok(doc("Sân A")), ok(doc("Sân B"))];
    const { result } = renderHook(() => useTournament());
    await flush();
    expect(result.current.view?.t.info.location).toBe("Sân A");
    await flush(POLL_MS);
    expect(result.current.view?.t.info.location).toBe("Sân B");
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("keeps the same view object when nothing changed", async () => {
    responses = [ok(doc("Sân A")), ok(doc("Sân A"))];
    const { result } = renderHook(() => useTournament());
    await flush();
    const first = result.current.view;
    await flush(POLL_MS);
    expect(result.current.view).toBe(first);
  });

  it("keeps the last good view when a poll fails or returns rubbish", async () => {
    responses = [
      ok(doc("Sân A")),
      async () => ({ ok: false, json: async () => ({}) }),
      ok({ nope: true }),
      async () => {
        throw new Error("offline");
      },
    ];
    const { result } = renderHook(() => useTournament());
    await flush();
    await flush(POLL_MS * 3);
    expect(fetch).toHaveBeenCalledTimes(4);
    expect(result.current.view?.t.info.location).toBe("Sân A");
    expect(result.current.error).toBeNull();
  });

  it("still reports an error when the very first load fails", async () => {
    responses = [async () => ({ ok: false, json: async () => ({}) })];
    const { result } = renderHook(() => useTournament());
    await flush();
    expect(result.current.error).toBe("Không tải được thông tin giải.");
  });

  it("does not poll a hidden tab, and refreshes when it comes back", async () => {
    const { result } = renderHook(() => useTournament());
    await flush();
    visibility("hidden");
    await flush(POLL_MS * 3);
    expect(fetch).toHaveBeenCalledTimes(1);
    responses = [ok(doc("Sân C"))];
    visibility("visible");
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.view?.t.info.location).toBe("Sân C");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm vitest run frontend/test/use-tournament-poll.test.tsx`
Expected: FAIL — `POLL_MS` is not exported.

- [ ] **Step 3: Implement**

In `frontend/src/lib/use-tournament.ts`, change the React import to
`import { useCallback, useEffect, useRef, useState } from "react";` and replace the whole `useTournament` function with:

```ts
// How often an open page re-reads the snapshot the admin API publishes.
export const POLL_MS = 20_000;

export function useTournament() {
  const [view, setView] = useState<TournamentView | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The last body rendered, so an unchanged poll does not re-render the page.
  const last = useRef<string | null>(null);

  const load = useCallback(() => {
    // Absolute: this path is what the CloudFront no-cache behaviour matches.
    fetch("/tournament.json", { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error("FETCH_FAILED");
        return r.json();
      })
      .then((raw) => {
        const body = JSON.stringify(raw);
        if (body === last.current) return;
        const next = parseTournament(raw);
        last.current = body;
        setError(null);
        setView(next);
      })
      .catch((e: unknown) => {
        // Mid-tournament a failed poll must not blank a page that works.
        if (last.current !== null) return;
        const code = e instanceof Error ? e.message : "FETCH_FAILED";
        setError(messages[code] ?? messages.FETCH_FAILED);
      });
  }, []);

  const reload = useCallback(() => {
    setError(null);
    load();
  }, [load]);

  useEffect(() => {
    load();
    const tick = () => {
      if (document.visibilityState === "visible") load();
    };
    const id = setInterval(tick, POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [load]);

  return { view, error, reload };
}
```

- [ ] **Step 4: Run the frontend tests**

Run: `pnpm vitest run frontend/test && pnpm --filter @webminton/frontend typecheck`
Expected: all PASS, including the existing `use-tournament.test.ts`; `tsc` prints nothing.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/use-tournament.ts frontend/test/use-tournament-poll.test.tsx
git commit -m "feat(landing): re-read the tournament snapshot every 20 seconds

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Local API for development and e2e

**Files:**
- Create: `scripts/local-api.ts`
- Modify: `scripts/serve-static.ts`
- Test: `scripts/test/local-api.test.ts`

**Interfaces:**
- Consumes: `route`, `ApiResponse` (Task 5); `MemoryStore` (Task 4); `applyCommand`, `makeAdminState` (Tasks 1–2).
- Produces:
  - `LOCAL_ADMIN = "admin@example.com"`
  - `createLocalApi(): { reset(): Promise<void>; snapshot(): string | null; handle(method: string, path: string, rawBody: string | null, authorization: string | undefined): Promise<ApiResponse> }`
  - A token of the form `test:<email>` is accepted as that verified email. `GET /api/config` returns `{ cognitoDomain: null, clientId: null, devLogin: true }`.
  - `POST /api/test/reset` restores the seeded state and clears the published snapshot.
  - Seeded state: 16 athletes, a confirmed draw (seed `e2e`), 18 pending group matches, courts `san-1` and `san-2`.
  - `scripts/serve-static.ts` serves `/api/*` from it, and serves the published snapshot at `/tournament.json` once one exists (the file in `frontend/out` until then).

This server is the only place test tokens exist. The Lambda's config hard-codes `devLogin: false` and sits behind API Gateway's JWT authorizer.

- [ ] **Step 1: Write the failing test**

`scripts/test/local-api.test.ts`:

```ts
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { createLocalApi, LOCAL_ADMIN } from "../local-api";

const AUTH = `Bearer test:${LOCAL_ADMIN}`;

describe("local API", () => {
  it("starts with a drawn tournament and nothing published", async () => {
    const api = createLocalApi();
    await api.reset();
    const res = await api.handle("GET", "/api/admin/state", null, AUTH);
    const view = res.body as { document: { matches: unknown[]; courts: unknown[] } };
    expect(res.status).toBe(200);
    expect(view.document.matches).toHaveLength(18);
    expect(view.document.courts).toHaveLength(2);
    expect(api.snapshot()).toBeNull();
  });

  it("offers the dev login and enforces the allow-list", async () => {
    const api = createLocalApi();
    await api.reset();
    expect((await api.handle("GET", "/api/config", null, undefined)).body).toEqual({
      cognitoDomain: null,
      clientId: null,
      devLogin: true,
    });
    expect((await api.handle("GET", "/api/admin/state", null, undefined)).status).toBe(401);
    expect(
      (await api.handle("GET", "/api/admin/state", null, "Bearer test:la@example.com"))
        .status,
    ).toBe(403);
  });

  it("publishes on save and forgets everything on reset", async () => {
    const api = createLocalApi();
    await api.reset();
    const body = JSON.stringify({
      baseVersion: 1,
      requestId: "r1",
      command: {
        type: "setScore",
        payload: { matchId: "group-red-blue-mens_doubles", score: { a: 21, b: 15 } },
      },
    });
    expect((await api.handle("POST", "/api/admin/commands", body, AUTH)).status).toBe(200);
    expect(JSON.parse(api.snapshot()!).matches[0].score).toEqual({ a: 21, b: 15 });
    expect((await api.handle("POST", "/api/test/reset", null, undefined)).status).toBe(200);
    expect(api.snapshot()).toBeNull();
    const view = (await api.handle("GET", "/api/admin/state", null, AUTH)).body as {
      version: number;
    };
    expect(view.version).toBe(1);
  });
});
```

Run: `pnpm vitest run scripts/test/local-api.test.ts`
Expected: FAIL — `../local-api` not found.

- [ ] **Step 2: Implement `scripts/local-api.ts`**

```ts
import { route, type ApiResponse, type Deps } from "../backend/src/router";
import { MemoryStore } from "../backend/src/store";
import { applyCommand } from "../packages/domain/src/commands";
import { makeAdminState } from "../packages/domain/src/testing/fixtures";

export const LOCAL_ADMIN = "admin@example.com";

// The real router over an in-memory store, for `serve-static` and Playwright.
// Nothing here is deployed.
export function createLocalApi() {
  let store = new MemoryStore();
  let snapshot: string | null = null;

  async function reset() {
    store = new MemoryStore();
    snapshot = null;
    const now = new Date().toISOString();
    let state = makeAdminState();
    state.document.courts = [
      { id: "san-1", name: "Sân 1" },
      { id: "san-2", name: "Sân 2" },
    ];
    state = applyCommand(
      state,
      { type: "confirmDraw", payload: { seed: "e2e" } },
      "seed",
      now,
    );
    await store.write(null, state, {
      at: now,
      actorEmail: "seed",
      commandType: "seed",
      requestId: "seed",
    });
  }

  const deps = (): Deps => ({
    store,
    publish: async (body) => {
      snapshot = body;
    },
    adminEmails: [LOCAL_ADMIN],
    config: { cognitoDomain: null, clientId: null, devLogin: true },
    now: () => new Date().toISOString(),
  });

  return {
    reset,
    snapshot: () => snapshot,
    async handle(
      method: string,
      path: string,
      rawBody: string | null,
      authorization: string | undefined,
    ): Promise<ApiResponse> {
      if (method === "POST" && path === "/api/test/reset") {
        await reset();
        return { status: 200, body: { ok: true } };
      }
      const email = /^Bearer test:(.+)$/.exec(authorization ?? "")?.[1];
      return route(
        {
          method,
          path,
          rawBody,
          claims: email ? { email, email_verified: "true" } : undefined,
        },
        deps(),
      );
    },
  };
}
```

- [ ] **Step 3: Serve it from `scripts/serve-static.ts`**

Add the import and the instance under the existing imports:

```ts
import { createLocalApi } from "./local-api";

const api = createLocalApi();
await api.reset();
```

Replace the `createServer(async (req, res) => {` callback's first two lines (`const url = …` and `const rel = …`) with:

```ts
  const url = (req.url ?? "/").split("?")[0];

  if (url.startsWith("/api/")) {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const result = await api.handle(
      req.method ?? "GET",
      url,
      chunks.length ? Buffer.concat(chunks).toString("utf8") : null,
      req.headers.authorization,
    );
    res.writeHead(result.status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    });
    return res.end(JSON.stringify(result.body));
  }

  // Once an admin save has published, that snapshot replaces the built file —
  // the same thing the Lambda does to the bucket.
  const snapshot = api.snapshot();
  if (url === "/tournament.json" && snapshot !== null) {
    res.writeHead(200, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-cache",
    });
    return res.end(snapshot);
  }

  const rel = normalize(decodeURIComponent(url)).replace(/^(\.\.[/\\])+/, "");
```

- [ ] **Step 4: Run and probe by hand**

```bash
pnpm vitest run scripts/test/local-api.test.ts && pnpm typecheck
pnpm build
node --import tsx scripts/serve-static.ts &
sleep 2
curl -s http://127.0.0.1:3100/api/config
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:3100/api/admin/state
curl -s -H "authorization: Bearer test:admin@example.com" http://127.0.0.1:3100/api/admin/state | head -c 80
kill %1
```

Expected: tests PASS; then `{"cognitoDomain":null,"clientId":null,"devLogin":true}`, `401`, and JSON starting `{"version":1,`.

- [ ] **Step 5: Confirm the existing e2e suite is undisturbed**

Run: `pnpm test:e2e`
Expected: every existing landing test PASSES (the snapshot is null, so `/tournament.json` is still the built file).

- [ ] **Step 6: Commit**

```bash
git add scripts/local-api.ts scripts/serve-static.ts scripts/test/local-api.test.ts
git commit -m "feat(scripts): serve the admin API in-process for development and e2e

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Admin shell — sign-in, API client, state hook, page

**Files:**
- Create: `frontend/src/lib/auth.ts`, `frontend/src/lib/admin-api.ts`, `frontend/src/lib/use-admin.ts`
- Create: `frontend/src/app/quan-tri/layout.tsx`, `frontend/src/app/quan-tri/page.tsx`
- Create: `frontend/src/features/admin/tabs.tsx`, `frontend/src/features/admin/fields.tsx`, `frontend/src/styles/admin.css`
- Test: `frontend/test/auth.test.ts`, `frontend/test/use-admin.test.tsx`, `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: the API of Task 5 and the local server of Task 10; `Command`, `AdminState` from domain; `Slab`, `Card`, `Pill` from `features/landing/primitives`; `formatDate` from `lib/format`.
- Produces:

```ts
// lib/auth.ts
export interface AuthConfig { cognitoDomain: string | null; clientId: string | null; devLogin: boolean }
export const DEV_EMAIL = "admin@example.com";
export function getToken(now?: number): string | null;
export function clearToken(): void;
export function tokenEmail(token: string): string;
export function authorizeUrl(c: AuthConfig, redirect: string, challenge: string, state: string): string;
export function logoutUrl(c: AuthConfig, redirect: string): string;
export function loadConfig(): Promise<AuthConfig>;
export function beginLogin(c: AuthConfig): Promise<void>;   // Google redirect
export function devSignIn(): void;                          // local server only
export function completeLogin(c: AuthConfig): Promise<boolean>;

// lib/admin-api.ts
export class ApiError extends Error { status: number; code: string }
export interface AdminView extends AdminState { version: number; publishedVersion: number; published?: boolean }
export function api<T>(path: string, body?: unknown): Promise<T>;

// lib/use-admin.ts
export type Phase = "loading" | "signed-out" | "forbidden" | "error" | "ready";
export interface Notice { tone: "ok" | "warn" | "error"; text: string }
export interface Admin {
  phase: Phase; config: AuthConfig | null; view: AdminView | null; email: string;
  busy: boolean; notice: Notice | null;
  send(command: Command, saved?: string): Promise<boolean>;
  restore(version: number): Promise<boolean>;
  republish(): Promise<void>;
  query<T>(path: string, body?: unknown): Promise<T | null>;  // errors become a notice
  reload(): Promise<boolean>;
  signIn(): void; signOut(): void;
}
export type ReadyAdmin = Admin & { view: AdminView };
export function useAdmin(): Admin;

// features/admin/tabs.tsx
export interface AdminTab { id: string; label: string; render: (admin: ReadyAdmin) => ReactNode }
export const TABS: AdminTab[];          // empty here; Tasks 12–14 append

// features/admin/fields.tsx
export function Field(props: { label: string; children: ReactNode }): JSX.Element;
export function ConfirmButton(props: { label: string; onConfirm: () => void; disabled?: boolean }): JSX.Element;
```

- [ ] **Step 1: Read the framework docs**

Read in `frontend/node_modules/next/dist/docs/` the guides on **static exports**, the **metadata** API (`robots`), and **client components** in the App Router. Confirm: a `"use client"` `page.tsx` under `app/quan-tri/` exports to `out/quan-tri/index.html` with `trailingSlash: true`; `metadata` must be exported from a server file (hence `layout.tsx`); importing a global `.css` file from a route's layout is allowed. If any of these differ in this Next version, follow the docs and note the difference in the commit body.

- [ ] **Step 2: Write the failing unit tests**

`frontend/test/auth.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import {
  authorizeUrl,
  clearToken,
  getToken,
  logoutUrl,
  tokenEmail,
} from "../src/lib/auth";

const jwt = (payload: object) =>
  `x.${btoa(JSON.stringify(payload)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")}.y`;
const NOW = 1_800_000_000_000;
const config = { cognitoDomain: "wm.auth.example.com", clientId: "abc", devLogin: false };

beforeEach(() => sessionStorage.clear());

describe("token storage", () => {
  it("returns a live token and reads its email", () => {
    const token = jwt({ exp: NOW / 1000 + 3600, email: "huy@example.com" });
    sessionStorage.setItem("wm.token", token);
    expect(getToken(NOW)).toBe(token);
    expect(tokenEmail(token)).toBe("huy@example.com");
  });

  it("drops an expired, nearly expired or unreadable token", () => {
    for (const token of [
      jwt({ exp: NOW / 1000 - 1 }),
      jwt({ exp: NOW / 1000 + 10 }),
      "not-a-jwt",
    ]) {
      sessionStorage.setItem("wm.token", token);
      expect(getToken(NOW)).toBeNull();
      expect(sessionStorage.getItem("wm.token")).toBeNull();
    }
  });

  it("treats a local test token as live", () => {
    sessionStorage.setItem("wm.token", "test:admin@example.com");
    expect(getToken(NOW)).toBe("test:admin@example.com");
    expect(tokenEmail("test:admin@example.com")).toBe("admin@example.com");
    clearToken();
    expect(getToken(NOW)).toBeNull();
  });
});

describe("Cognito URLs", () => {
  it("sends the browser straight to Google with PKCE", () => {
    const url = new URL(
      authorizeUrl(config, "https://site.example/quan-tri/", "CHALLENGE", "STATE"),
    );
    expect(url.origin + url.pathname).toBe(
      "https://wm.auth.example.com/oauth2/authorize",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "abc",
      redirect_uri: "https://site.example/quan-tri/",
      scope: "openid email",
      identity_provider: "Google",
      code_challenge: "CHALLENGE",
      code_challenge_method: "S256",
      state: "STATE",
    });
  });

  it("builds the sign-out URL", () => {
    expect(logoutUrl(config, "https://site.example/quan-tri/")).toBe(
      "https://wm.auth.example.com/logout?client_id=abc&logout_uri=https%3A%2F%2Fsite.example%2Fquan-tri%2F",
    );
  });
});
```

`frontend/test/use-admin.test.tsx`:

```tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useAdmin } from "../src/lib/use-admin";
import { makeAdminState } from "../../packages/domain/src/testing/fixtures";

const state = (version: number) => ({
  ...makeAdminState(),
  version,
  publishedVersion: version,
});
const json = (status: number, body: unknown) => ({
  ok: status < 400,
  status,
  json: async () => body,
});
let calls: { url: string; init?: RequestInit }[];
let handler: (url: string, init?: RequestInit) => unknown;

beforeEach(() => {
  sessionStorage.clear();
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === "/api/config")
        return json(200, { cognitoDomain: null, clientId: null, devLogin: true });
      return handler(url, init);
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const ready = async () => {
  sessionStorage.setItem("wm.token", "test:admin@example.com");
  const hook = renderHook(() => useAdmin());
  await waitFor(() => expect(hook.result.current.phase).toBe("ready"));
  return hook;
};
const cmd = { type: "updateInfo", payload: { feeVnd: 1 } } as const;
const bodyOf = (i: number) => JSON.parse(calls[i].init!.body as string);

describe("useAdmin", () => {
  it("asks for sign-in when there is no token", async () => {
    handler = () => json(200, state(1));
    const { result } = renderHook(() => useAdmin());
    await waitFor(() => expect(result.current.phase).toBe("signed-out"));
    expect(calls.map((c) => c.url)).toEqual(["/api/config"]);
  });

  it("loads the state and identifies the organiser", async () => {
    handler = () => json(200, state(4));
    const { result } = await ready();
    expect(result.current.view?.version).toBe(4);
    expect(result.current.email).toBe("admin@example.com");
    expect(
      (calls[1].init!.headers as Record<string, string>).authorization,
    ).toBe("Bearer test:admin@example.com");
  });

  it("shows a refusal page for an account that is not allow-listed", async () => {
    handler = () => json(403, { code: "FORBIDDEN", message: "Không có quyền." });
    sessionStorage.setItem("wm.token", "test:la@example.com");
    const { result } = renderHook(() => useAdmin());
    await waitFor(() => expect(result.current.phase).toBe("forbidden"));
  });

  it("sends a command against the version on screen and confirms the save", async () => {
    handler = (url) => json(200, url.endsWith("/commands") ? state(5) : state(4));
    const { result } = await ready();
    let saved = false;
    await act(async () => {
      saved = await result.current.send(cmd);
    });
    expect(saved).toBe(true);
    expect(bodyOf(2)).toMatchObject({ baseVersion: 4, command: cmd });
    expect(bodyOf(2).requestId).toMatch(/^[a-zA-Z0-9_-]+$/);
    expect(result.current.view?.version).toBe(5);
    expect(result.current.notice).toEqual({ tone: "ok", text: "Đã lưu." });
  });

  it("reloads and warns when another device saved first", async () => {
    let stateCalls = 0;
    handler = (url) =>
      url.endsWith("/commands")
        ? json(409, { code: "CONFLICT", message: "Dữ liệu vừa thay đổi — kiểm tra rồi lưu lại." })
        : json(200, state(++stateCalls === 1 ? 4 : 7));
    const { result } = await ready();
    await act(async () => {
      expect(await result.current.send(cmd)).toBe(false);
    });
    expect(result.current.view?.version).toBe(7);
    expect(result.current.notice).toEqual({
      tone: "warn",
      text: "Dữ liệu vừa thay đổi — kiểm tra rồi lưu lại.",
    });
  });

  it("reuses the request id when the same save is retried after a network failure", async () => {
    let attempt = 0;
    handler = (url) => {
      if (!url.endsWith("/commands")) return json(200, state(4));
      if (++attempt === 1) throw new TypeError("Failed to fetch");
      return json(200, state(5));
    };
    const { result } = await ready();
    await act(async () => {
      expect(await result.current.send(cmd)).toBe(false);
    });
    expect(result.current.notice?.tone).toBe("error");
    await act(async () => {
      expect(await result.current.send(cmd)).toBe(true);
    });
    expect(bodyOf(3).requestId).toBe(bodyOf(2).requestId);
    // A different edit is a different request.
    await act(async () => {
      await result.current.send({ type: "updateInfo", payload: { feeVnd: 2 } });
    });
    expect(bodyOf(4).requestId).not.toBe(bodyOf(2).requestId);
  });

  it("warns when the save landed but the page was not republished", async () => {
    handler = (url) =>
      json(200, url.endsWith("/commands") ? { ...state(5), published: false } : state(4));
    const { result } = await ready();
    await act(async () => {
      await result.current.send(cmd);
    });
    expect(result.current.notice?.tone).toBe("warn");
    expect(result.current.notice?.text).toContain("chưa công bố");
  });

  it("goes back to sign-in and keeps the edit when the token is rejected", async () => {
    handler = (url) =>
      url.endsWith("/commands") ? json(401, { message: "Unauthorized" }) : json(200, state(4));
    const { result } = await ready();
    await act(async () => {
      await result.current.send(cmd);
    });
    expect(result.current.phase).toBe("signed-out");
    expect(JSON.parse(sessionStorage.getItem("wm.pending")!)).toMatchObject({
      path: "/api/admin/commands",
      body: { command: cmd },
    });
    expect(sessionStorage.getItem("wm.token")).toBeNull();
  });
});
```

Run: `pnpm vitest run frontend/test/auth.test.ts frontend/test/use-admin.test.tsx`
Expected: FAIL — modules not found.

- [ ] **Step 3: Implement `frontend/src/lib/auth.ts`**

```ts
export interface AuthConfig {
  cognitoDomain: string | null;
  clientId: string | null;
  devLogin: boolean;
}

export const DEV_EMAIL = "admin@example.com";
const TOKEN = "wm.token";
const VERIFIER = "wm.verifier";
const STATE = "wm.state";

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function claims(token: string): { exp?: unknown; email?: unknown } {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const bytes = Uint8Array.from(atob(part), (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return {};
  }
}

const isTest = (token: string) => token.startsWith("test:");

export function tokenEmail(token: string): string {
  if (isTest(token)) return token.slice(5);
  const { email } = claims(token);
  return typeof email === "string" ? email : "";
}

// The API verifies the token; this only saves a round trip that would fail.
// Thirty seconds of margin so a save is not sent with a token about to lapse.
export function getToken(now = Date.now()): string | null {
  const token = sessionStorage.getItem(TOKEN);
  if (!token) return null;
  if (isTest(token)) return token;
  const { exp } = claims(token);
  if (typeof exp === "number" && exp * 1000 > now + 30_000) return token;
  sessionStorage.removeItem(TOKEN);
  return null;
}

export function clearToken() {
  sessionStorage.removeItem(TOKEN);
}

export const redirectUri = () => `${location.origin}/quan-tri/`;

export function authorizeUrl(
  c: AuthConfig,
  redirect: string,
  challenge: string,
  state: string,
): string {
  const q = new URLSearchParams({
    response_type: "code",
    client_id: c.clientId ?? "",
    redirect_uri: redirect,
    scope: "openid email",
    // Skips Cognito's own page: Google is the only way in.
    identity_provider: "Google",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });
  return `https://${c.cognitoDomain}/oauth2/authorize?${q}`;
}

export function logoutUrl(c: AuthConfig, redirect: string): string {
  const q = new URLSearchParams({
    client_id: c.clientId ?? "",
    logout_uri: redirect,
  });
  return `https://${c.cognitoDomain}/logout?${q}`;
}

export async function loadConfig(): Promise<AuthConfig> {
  const res = await fetch("/api/config", { cache: "no-store" });
  if (!res.ok) throw new Error("Không tải được cấu hình đăng nhập.");
  return (await res.json()) as AuthConfig;
}

export async function beginLogin(c: AuthConfig): Promise<void> {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const state = b64url(crypto.getRandomValues(new Uint8Array(16)));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  sessionStorage.setItem(VERIFIER, verifier);
  sessionStorage.setItem(STATE, state);
  location.assign(
    authorizeUrl(c, redirectUri(), b64url(new Uint8Array(digest)), state),
  );
}

// Only reachable when /api/config says devLogin, which the Lambda never does.
export function devSignIn() {
  sessionStorage.setItem(TOKEN, `test:${DEV_EMAIL}`);
}

async function exchange(c: AuthConfig): Promise<boolean> {
  const url = new URL(location.href);
  const code = url.searchParams.get("code");
  const failed = url.searchParams.get("error");
  if (!code && !failed) return false;
  const verifier = sessionStorage.getItem(VERIFIER);
  const state = sessionStorage.getItem(STATE);
  sessionStorage.removeItem(VERIFIER);
  sessionStorage.removeItem(STATE);
  // The code is single-use; take it out of the address bar before anything.
  history.replaceState(null, "", url.pathname);
  if (failed) throw new Error("Đăng nhập Google không thành công. Thử lại.");
  if (!verifier || url.searchParams.get("state") !== state)
    throw new Error("Phiên đăng nhập không hợp lệ. Thử lại.");
  const res = await fetch(`https://${c.cognitoDomain}/oauth2/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: c.clientId ?? "",
      code: code!,
      redirect_uri: redirectUri(),
      code_verifier: verifier,
    }),
  });
  if (!res.ok) throw new Error("Không đổi được mã đăng nhập. Thử lại.");
  const { id_token } = (await res.json()) as { id_token: string };
  sessionStorage.setItem(TOKEN, id_token);
  return true;
}

let inflight: Promise<boolean> | null = null;
// Memoised: React runs effects twice in development, and the code works once.
export function completeLogin(c: AuthConfig): Promise<boolean> {
  return (inflight ??= exchange(c));
}
```

- [ ] **Step 4: Implement `frontend/src/lib/admin-api.ts`**

```ts
import type { AdminState } from "../../../packages/domain/src/commands";
import { getToken } from "./auth";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface AdminView extends AdminState {
  version: number;
  publishedVersion: number;
  published?: boolean;
}

// GET without a body, POST with one. Every failure is an ApiError whose
// message is already Vietnamese and fit to show.
export async function api<T>(path: string, body?: unknown): Promise<T> {
  const token = getToken();
  if (!token) throw new ApiError(401, "UNAUTHORIZED", "Cần đăng nhập.");
  let res: Response;
  try {
    res = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "NETWORK", "Mất kết nối — kiểm tra mạng rồi thử lại.");
  }
  const data = (await res.json().catch(() => null)) as {
    code?: string;
    message?: string;
  } | null;
  if (!res.ok)
    throw new ApiError(
      res.status,
      data?.code ?? "UNKNOWN",
      res.status === 401
        ? "Phiên đăng nhập đã hết hạn."
        : (data?.message ?? `Lỗi ${res.status}.`),
    );
  return data as T;
}
```

- [ ] **Step 5: Implement `frontend/src/lib/use-admin.ts`**

```ts
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Command } from "../../../packages/domain/src/commands";
import { api, ApiError, type AdminView } from "./admin-api";
import {
  beginLogin,
  clearToken,
  completeLogin,
  devSignIn,
  getToken,
  loadConfig,
  logoutUrl,
  redirectUri,
  tokenEmail,
  type AuthConfig,
} from "./auth";

export type Phase = "loading" | "signed-out" | "forbidden" | "error" | "ready";
export interface Notice {
  tone: "ok" | "warn" | "error";
  text: string;
}
export interface Admin {
  phase: Phase;
  config: AuthConfig | null;
  view: AdminView | null;
  email: string;
  busy: boolean;
  notice: Notice | null;
  send(command: Command, saved?: string): Promise<boolean>;
  restore(version: number): Promise<boolean>;
  republish(): Promise<void>;
  query<T>(path: string, body?: unknown): Promise<T | null>;
  reload(): Promise<boolean>;
  signIn(): void;
  signOut(): void;
}
export type ReadyAdmin = Admin & { view: AdminView };

const PENDING = "wm.pending";
type Pending = { path: string; body: Record<string, unknown> };

export function useAdmin(): Admin {
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [view, setViewState] = useState<AdminView | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  // The version a save is based on must be the one on screen right now, not
  // the one captured when a callback was created.
  const current = useRef<AdminView | null>(null);
  const retry = useRef<{ key: string; requestId: string } | null>(null);

  const setView = useCallback((v: AdminView) => {
    current.current = v;
    setViewState(v);
  }, []);

  // Returns true when the error ended the session and was handled here.
  const fail = useCallback((e: unknown): boolean => {
    if (e instanceof ApiError && e.status === 401) {
      clearToken();
      setPhase("signed-out");
      setNotice({ tone: "warn", text: e.message });
      return true;
    }
    if (e instanceof ApiError && e.status === 403) {
      setPhase("forbidden");
      return true;
    }
    setNotice({
      tone: "error",
      text: e instanceof Error ? e.message : "Lỗi không xác định.",
    });
    return false;
  }, []);

  const reload = useCallback(async () => {
    try {
      setView(await api<AdminView>("/api/admin/state"));
      setEmail(tokenEmail(getToken() ?? ""));
      setPhase("ready");
      return true;
    } catch (e) {
      if (!fail(e)) setPhase((p) => (p === "ready" ? p : "error"));
      return false;
    }
  }, [fail, setView]);

  const post = useCallback(
    async (
      path: string,
      extra: Record<string, unknown>,
      saved: string,
      requestId?: string,
    ): Promise<boolean> => {
      const base = current.current;
      if (!base) return false;
      // Same edit retried after a dropped connection: same id, so if the
      // first attempt did land the server answers "already done".
      const key = JSON.stringify([path, extra]);
      const id =
        requestId ??
        (retry.current?.key === key
          ? retry.current.requestId
          : crypto.randomUUID());
      const body = { baseVersion: base.version, requestId: id, ...extra };
      setBusy(true);
      try {
        const next = await api<AdminView>(path, body);
        retry.current = null;
        setView(next);
        setNotice(
          next.published === false
            ? {
                tone: "warn",
                text: `${saved} Nhưng trang giải chưa công bố được — bấm “Công bố lại”.`,
              }
            : { tone: "ok", text: saved },
        );
        return true;
      } catch (e) {
        retry.current =
          e instanceof ApiError && e.code === "NETWORK"
            ? { key, requestId: id }
            : null;
        if (e instanceof ApiError && e.status === 409) {
          await reload();
          setNotice({ tone: "warn", text: e.message });
        } else if (e instanceof ApiError && e.status === 401) {
          const pending: Pending = { path, body: { requestId: id, ...extra } };
          sessionStorage.setItem(PENDING, JSON.stringify(pending));
          fail(e);
        } else fail(e);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [fail, reload, setView],
  );

  // After signing in again, finish the save that the expired token interrupted.
  const resume = useCallback(async () => {
    const raw = sessionStorage.getItem(PENDING);
    if (!raw) return;
    sessionStorage.removeItem(PENDING);
    const { path, body } = JSON.parse(raw) as Pending;
    const { requestId, ...extra } = body;
    await post(
      path,
      extra,
      "Đã đăng nhập lại và lưu thao tác còn dang dở.",
      requestId as string,
    );
  }, [post]);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const c = await loadConfig();
        if (!alive) return;
        setConfig(c);
        await completeLogin(c);
        if (!alive) return;
        if (!getToken()) return setPhase("signed-out");
        if (await reload()) await resume();
      } catch (e) {
        if (!alive) return;
        setPhase("error");
        setNotice({
          tone: "error",
          text: e instanceof Error ? e.message : "Lỗi không xác định.",
        });
      }
    })();
    return () => {
      alive = false;
    };
  }, [reload, resume]);

  const send = useCallback(
    (command: Command, saved = "Đã lưu.") =>
      post("/api/admin/commands", { command }, saved),
    [post],
  );

  const restore = useCallback(
    (version: number) =>
      post(
        "/api/admin/restore",
        { version },
        `Đã khôi phục phiên bản ${version}.`,
      ),
    [post],
  );

  const query = useCallback(
    async <T>(path: string, body?: unknown): Promise<T | null> => {
      try {
        return await api<T>(path, body);
      } catch (e) {
        fail(e);
        return null;
      }
    },
    [fail],
  );

  const republish = useCallback(async () => {
    setBusy(true);
    const next = await query<AdminView>("/api/admin/publish", {});
    setBusy(false);
    if (!next) return;
    setView(next);
    setNotice(
      next.published === false
        ? { tone: "error", text: "Vẫn chưa công bố được. Thử lại sau ít phút." }
        : { tone: "ok", text: "Đã công bố lại trang giải." },
    );
  }, [query, setView]);

  const signIn = useCallback(() => {
    if (!config) return;
    if (config.devLogin) {
      devSignIn();
      setPhase("loading");
      void reload().then((ok) => ok && resume());
    } else void beginLogin(config);
  }, [config, reload, resume]);

  const signOut = useCallback(() => {
    clearToken();
    sessionStorage.removeItem(PENDING);
    if (config && !config.devLogin)
      location.assign(logoutUrl(config, redirectUri()));
    else setPhase("signed-out");
  }, [config]);

  return {
    phase,
    config,
    view,
    email,
    busy,
    notice,
    send,
    restore,
    republish,
    query,
    reload,
    signIn,
    signOut,
  };
}
```

Run: `pnpm vitest run frontend/test/auth.test.ts frontend/test/use-admin.test.tsx`
Expected: all PASS.

- [ ] **Step 6: Shared pieces — `tabs.tsx`, `fields.tsx`, `admin.css`**

`frontend/src/features/admin/tabs.tsx`:

```tsx
import type { ReactNode } from "react";
import type { ReadyAdmin } from "../../lib/use-admin";

export interface AdminTab {
  id: string;
  label: string;
  render: (admin: ReadyAdmin) => ReactNode;
}

// Order here is the order on screen. The first entry is the default tab.
export const TABS: AdminTab[] = [];
```

`frontend/src/features/admin/fields.tsx`:

```tsx
"use client";
import { useEffect, useState, type ReactNode } from "react";

export function Field({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

// Two taps instead of a browser dialog: dialogs are easy to dismiss by
// accident on a phone and cannot be styled. Disarms itself after 4 seconds.
export function ConfirmButton({
  label,
  onConfirm,
  disabled = false,
}: {
  label: string;
  onConfirm: () => void;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const id = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(id);
  }, [armed]);
  return (
    <button
      type="button"
      className="button--danger"
      disabled={disabled}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        onConfirm();
      }}
    >
      {armed ? "Bấm lần nữa để xác nhận" : label}
    </button>
  );
}
```

`frontend/src/styles/admin.css`:

```css
/* The admin screen. Phone first: one column and a tab bar fixed to the
   bottom; two panes and a tab strip from 1024px. Shadows stay hard. */
.admin {
  padding-bottom: 104px;
}
.admin-title {
  margin: 28px 0 8px;
}
.admin-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 14px 0;
}
.admin-bar > .spacer {
  flex: 1 1 0;
}
.admin-bar small {
  overflow-wrap: anywhere;
}
.admin button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.button--ghost {
  background: var(--paper);
  color: var(--ink);
}
.button--danger {
  background: var(--red);
  color: #fff;
}

.notice {
  margin: 12px 0;
  padding: 12px 16px;
  border: var(--border);
  border-left-width: 12px;
  background: var(--paper);
  box-shadow: var(--shadow-hard-sm);
  font-weight: 700;
}
.notice--ok {
  border-left-color: var(--green);
}
.notice--warn {
  border-left-color: var(--ink);
}
.notice--error {
  border-left-color: var(--red);
}

.admin-tabs {
  position: fixed;
  inset: auto 0 0 0;
  z-index: 20;
  display: flex;
  overflow-x: auto;
  border-top: var(--border);
  background: var(--ink);
}
.admin-tabs button {
  flex: 1 0 auto;
  min-height: 56px;
  padding: 8px 14px;
  border: 0;
  border-radius: 0;
  background: transparent;
  color: var(--paper);
  white-space: nowrap;
}
.admin-tabs button[aria-current="page"] {
  background: var(--yellow);
  color: var(--ink);
}

.admin-split,
.admin-stack {
  display: grid;
  gap: 18px;
  grid-template-columns: minmax(0, 1fr);
  align-items: start;
}
.admin-stack {
  gap: 14px;
}

.field {
  display: grid;
  gap: 4px;
  font-weight: 700;
}
.field > span {
  font-size: 13px;
}
.field input,
.field select,
.field textarea {
  width: 100%;
  min-height: 44px;
  padding: 8px 10px;
  border: 2px solid var(--ink);
  border-radius: 0;
  background: #fff;
  color: var(--ink);
}
.field input[type="checkbox"] {
  width: 28px;
  min-height: 28px;
  height: 28px;
}
.field input[type="color"] {
  padding: 2px;
}
.field-row {
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fit, minmax(min(150px, 100%), 1fr));
}
.row-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: 14px;
}

.pick-list {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.pick-item {
  width: 100%;
  min-height: 56px;
  justify-content: space-between;
  gap: 10px;
  padding: 10px 14px;
  background: var(--paper);
  color: var(--ink);
  text-align: left;
}
.pick-item[aria-pressed="true"] {
  background: var(--ink);
  color: var(--paper);
}
.pick-item > span:first-child {
  min-width: 0;
  overflow-wrap: anywhere;
}

.score-entry {
  display: grid;
  gap: 14px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.stepper {
  display: grid;
  gap: 6px;
  grid-template-columns: 48px minmax(0, 1fr) 48px;
}
.stepper input {
  min-height: 56px;
  font-size: 28px;
  font-weight: 900;
  text-align: center;
}
.stepper button {
  min-height: 56px;
  padding: 0;
  font-size: 24px;
}

@media (min-width: 1024px) {
  .admin {
    padding-bottom: 56px;
  }
  .admin-tabs {
    position: static;
    margin: 0 0 24px;
    border: var(--border);
    box-shadow: var(--shadow-hard-sm);
  }
  .admin-split {
    grid-template-columns: minmax(320px, 2fr) minmax(0, 3fr);
  }
}
```

- [ ] **Step 7: The page**

`frontend/src/app/quan-tri/layout.tsx`:

```tsx
import type { Metadata } from "next";
import "../../styles/admin.css";

export const metadata: Metadata = {
  title: "Quản trị · Giải cầu lông nội bộ 2026",
  robots: { index: false, follow: false },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
```

`frontend/src/app/quan-tri/page.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import { useAdmin, type ReadyAdmin } from "../../lib/use-admin";
import { formatDate } from "../../lib/format";
import { Card, Pill, Slab } from "../../features/landing/primitives";
import { TABS } from "../../features/admin/tabs";

export default function AdminPage() {
  const admin = useAdmin();
  const [tab, setTab] = useState(TABS[0]?.id ?? "");

  // The hash keeps the tab across the Google redirect and a reload.
  useEffect(() => {
    const fromHash = () => {
      const id = location.hash.slice(1);
      if (TABS.some((t) => t.id === id)) setTab(id);
    };
    fromHash();
    addEventListener("hashchange", fromHash);
    return () => removeEventListener("hashchange", fromHash);
  }, []);

  const { phase, notice, view } = admin;
  const active = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <main id="main" className="admin container">
      <h1 className="admin-title">
        <Slab tone="red" rotate={-1.5} className="section-title">
          QUẢN TRỊ GIẢI
        </Slab>
      </h1>

      {notice && (
        <p role="status" className={`notice notice--${notice.tone}`}>
          {notice.text}
        </p>
      )}

      {phase === "loading" && <p role="status">Đang tải…</p>}

      {phase === "signed-out" && (
        <Card title="Đăng nhập">
          <p>Chỉ ban tổ chức mới vào được trang này.</p>
          <div className="row-actions">
            <button type="button" onClick={admin.signIn} disabled={!admin.config}>
              {admin.config?.devLogin ? "Đăng nhập thử" : "Đăng nhập bằng Google"}
            </button>
          </div>
        </Card>
      )}

      {phase === "forbidden" && (
        <Card title="Không có quyền">
          <p role="alert">Tài khoản này không có quyền quản trị.</p>
          <div className="row-actions">
            <button type="button" onClick={admin.signOut}>
              Đăng xuất và đổi tài khoản
            </button>
          </div>
        </Card>
      )}

      {phase === "error" && (
        <div className="row-actions">
          <button type="button" onClick={() => location.reload()}>
            Thử lại
          </button>
        </div>
      )}

      {phase === "ready" && view && (
        <>
          <div className="admin-bar">
            {view.publishedVersion < view.version ? (
              <>
                <Pill tone="red">Chưa công bố</Pill>
                <button
                  type="button"
                  onClick={admin.republish}
                  disabled={admin.busy}
                >
                  Công bố lại
                </button>
              </>
            ) : (
              <Pill tone="green">Đã công bố</Pill>
            )}
            <small>
              Phiên bản {view.version} · cập nhật{" "}
              {formatDate(view.document.updatedAt)}
            </small>
            <span className="spacer" />
            <small>{admin.email}</small>
            <a className="button button--ghost" href="/">
              Xem trang giải
            </a>
            <button
              type="button"
              className="button--ghost"
              onClick={admin.signOut}
            >
              Đăng xuất
            </button>
          </div>

          {TABS.length > 0 && (
            <nav className="admin-tabs" aria-label="Mục quản trị">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  aria-current={t.id === active?.id ? "page" : undefined}
                  onClick={() => {
                    history.replaceState(null, "", `#${t.id}`);
                    setTab(t.id);
                  }}
                >
                  {t.label}
                </button>
              ))}
            </nav>
          )}

          {active ? (
            <section aria-label={active.label}>
              {active.render(admin as ReadyAdmin)}
            </section>
          ) : (
            <Card title="Tổng quan">
              <p>
                {view.document.athletes.length} VĐV ·{" "}
                {view.document.matches.length} trận
              </p>
            </Card>
          )}
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 8: Write the e2e spec**

`tests/e2e/admin.spec.ts`:

```ts
import { expect, test, type Page } from "@playwright/test";

// The local server keeps the tournament in memory. Every test starts from the
// same drawn tournament; the last hook hands the server back to landing.spec
// with no published snapshot, so that suite still sees the built file.
test.beforeEach(async ({ request }) => {
  expect((await request.post("/api/test/reset")).ok()).toBe(true);
});
test.afterAll(async ({ playwright }) => {
  const ctx = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3100",
  });
  await ctx.post("/api/test/reset");
  await ctx.dispose();
});

const signIn = async (page: Page, hash = "") => {
  await page.goto(`/quan-tri/${hash}`);
  await page.getByRole("button", { name: "Đăng nhập thử" }).click();
  await expect(page.getByText("admin@example.com")).toBeVisible();
};
const overflow = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);

test("asks for sign-in and is hidden from search engines", async ({ page }) => {
  await page.goto("/quan-tri/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "QUẢN TRỊ GIẢI",
  );
  await expect(page.getByRole("button", { name: "Đăng nhập thử" })).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
    "content",
    /noindex/,
  );
});

test("the public page does not link to the admin screen", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('a[href*="quan-tri"]')).toHaveCount(0);
});

test("signs in, shows who is signed in, and signs out", async ({ page }) => {
  await signIn(page);
  await expect(page.getByText("Phiên bản 1")).toBeVisible();
  await page.getByRole("button", { name: "Đăng xuất" }).click();
  await expect(page.getByRole("button", { name: "Đăng nhập thử" })).toBeVisible();
});

test("refuses an account that is not on the allow-list", async ({ page }) => {
  await page.addInitScript(() =>
    sessionStorage.setItem("wm.token", "test:la@example.com"),
  );
  await page.goto("/quan-tri/");
  await expect(page.getByRole("alert")).toHaveText(
    "Tài khoản này không có quyền quản trị.",
  );
});

for (const width of [390, 768, 1280])
  test(`the admin screen does not scroll sideways at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await signIn(page);
    expect(await overflow(page)).toBeLessThanOrEqual(1);
  });
```

- [ ] **Step 9: Build and run**

Run: `pnpm --filter @webminton/frontend typecheck && pnpm build && pnpm test:e2e`
Expected: `tsc` prints nothing; the build lists `/quan-tri`; all e2e tests PASS, old and new.

- [ ] **Step 10: Look at it**

```bash
node --import tsx scripts/serve-static.ts &
sleep 2
node scripts/screenshot.mjs http://127.0.0.1:3100/quan-tri/ /tmp/admin-390.png 390 844 full
node scripts/screenshot.mjs http://127.0.0.1:3100/quan-tri/ /tmp/admin-1280.png 1280 900 full
kill %1
```

Open both PNGs. The title slab, card and button must look like the public page's (red slab rotated, cream card with a hard shadow, no blur anywhere).

- [ ] **Step 11: Commit**

```bash
git add frontend/src frontend/test tests/e2e/admin.spec.ts
git commit -m "feat(admin): add the /quan-tri shell with sign-in and the state hook

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: `Trận` tab — scores, walkovers, lineups, schedule, ties

**Files:**
- Create: `frontend/src/features/admin/ScoreEntry.tsx`, `frontend/src/features/admin/time.ts`, `frontend/src/features/admin/MatchesTab.tsx`
- Modify: `frontend/src/features/admin/tabs.tsx`
- Test: `frontend/test/score-entry.test.tsx`, `frontend/test/admin-time.test.ts`, `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `ReadyAdmin` (`view`, `send`, `busy`), `Field`, `ConfirmButton`, `TABS` (Task 11); `isFinalScore`, `deriveTournament`, `findScheduleConflicts`, `Standing`, `Match`, `Score` from domain; `categoryNames` from `lib/format`.
- Produces:
  - `ScoreEntry(props: { nameA: string; nameB: string; initial: Score | null; disabled: boolean; onSave: (score: Score) => void })`
  - `toLocalInput(iso: string | null): string`, `fromLocalInput(value: string): string | null`, `addMinutes(iso: string, minutes: number): string` — all in Asia/Ho_Chi_Minh (+07:00), independent of the device's timezone.
  - `MatchesTab(props: { admin: ReadyAdmin })`, registered in `TABS` as `{ id: "tran-dau", label: "Trận" }`.
  - DOM contract used by e2e: each match button carries `data-match-id`; score inputs are labelled `Điểm <tên đội>`; the save button is `Lưu tỉ số`.

- [ ] **Step 1: Write the failing unit tests**

`frontend/test/score-entry.test.tsx`:

```tsx
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ScoreEntry } from "../src/features/admin/ScoreEntry";

const setup = (initial: { a: number; b: number } | null = null) => {
  const onSave = vi.fn();
  render(
    <ScoreEntry
      nameA="Đội Đỏ"
      nameB="Đội Xanh"
      initial={initial}
      disabled={false}
      onSave={onSave}
    />,
  );
  const a = screen.getByLabelText("Điểm Đội Đỏ") as HTMLInputElement;
  const b = screen.getByLabelText("Điểm Đội Xanh") as HTMLInputElement;
  const save = screen.getByRole("button", { name: "Lưu tỉ số" }) as HTMLButtonElement;
  const type = (el: HTMLInputElement, value: string) =>
    fireEvent.change(el, { target: { value } });
  return { a, b, save, type, onSave };
};

describe("ScoreEntry", () => {
  it("cannot be saved while a field is empty", () => {
    const { a, save, type, onSave } = setup();
    expect(save.disabled).toBe(true);
    type(a, "21");
    expect(save.disabled).toBe(true);
    fireEvent.click(save);
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByText("Nhập điểm của hai đội.")).toBeDefined();
  });

  it("explains a score that is not final", () => {
    const { a, b, save, type } = setup();
    type(a, "21");
    type(b, "20");
    expect(save.disabled).toBe(true);
    expect(
      screen.getByText("Chưa hợp lệ: séc tới 21, hơn 2 điểm, trần 25."),
    ).toBeDefined();
  });

  it("saves a final score as numbers", () => {
    const { a, b, save, type, onSave } = setup();
    type(a, "21");
    type(b, "15");
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(onSave).toHaveBeenCalledWith({ a: 21, b: 15 });
  });

  it("keeps only digits, at most two", () => {
    const { a, type } = setup();
    type(a, "2a1x9");
    expect(a.value).toBe("21");
    type(a, "-");
    expect(a.value).toBe("");
  });

  it("steps from empty to 1 and never below 0 or above 25", () => {
    const { a, type } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Tăng Điểm Đội Đỏ" }));
    expect(a.value).toBe("1");
    fireEvent.click(screen.getByRole("button", { name: "Giảm Điểm Đội Đỏ" }));
    fireEvent.click(screen.getByRole("button", { name: "Giảm Điểm Đội Đỏ" }));
    expect(a.value).toBe("0");
    type(a, "25");
    fireEvent.click(screen.getByRole("button", { name: "Tăng Điểm Đội Đỏ" }));
    expect(a.value).toBe("25");
  });

  it("starts from the stored score when correcting a result", () => {
    const { a, b, save } = setup({ a: 22, b: 20 });
    expect([a.value, b.value]).toEqual(["22", "20"]);
    expect(save.disabled).toBe(false);
  });
});
```

`frontend/test/admin-time.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  addMinutes,
  fromLocalInput,
  toLocalInput,
} from "../src/features/admin/time";

describe("admin time helpers", () => {
  it("shows a stored time as Vietnam wall-clock time", () => {
    expect(toLocalInput("2026-10-18T08:00:00+07:00")).toBe("2026-10-18T08:00");
    // The same instant written in UTC.
    expect(toLocalInput("2026-10-18T01:00:00.000Z")).toBe("2026-10-18T08:00");
    expect(toLocalInput(null)).toBe("");
  });

  it("stores a picked time with the +07:00 offset", () => {
    expect(fromLocalInput("2026-10-18T08:30")).toBe("2026-10-18T08:30:00+07:00");
    expect(fromLocalInput("")).toBeNull();
  });

  it("adds minutes across an hour and a day boundary", () => {
    expect(addMinutes("2026-10-18T08:50:00+07:00", 20)).toBe(
      "2026-10-18T09:10:00+07:00",
    );
    expect(addMinutes("2026-10-18T23:50:00+07:00", 20)).toBe(
      "2026-10-19T00:10:00+07:00",
    );
  });
});
```

Run: `pnpm vitest run frontend/test/score-entry.test.tsx frontend/test/admin-time.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 2: Implement `time.ts` and `ScoreEntry.tsx`**

`frontend/src/features/admin/time.ts`:

```ts
// The tournament runs in Asia/Ho_Chi_Minh, which has no daylight saving, so a
// fixed +07:00 is exact. These never consult the device's own timezone.
const OFFSET_MS = 7 * 3_600_000;
const wall = (ms: number) => new Date(ms + OFFSET_MS).toISOString();

export const toLocalInput = (iso: string | null): string =>
  iso ? wall(Date.parse(iso)).slice(0, 16) : "";

export const fromLocalInput = (value: string): string | null =>
  value ? `${value}:00+07:00` : null;

export const addMinutes = (iso: string, minutes: number): string =>
  `${wall(Date.parse(iso) + minutes * 60_000).slice(0, 19)}+07:00`;
```

`frontend/src/features/admin/ScoreEntry.tsx`:

```tsx
"use client";
import { useState } from "react";
import type { Score } from "../../../../packages/domain/src/schema";
import { isFinalScore } from "../../../../packages/domain/src/score";

const toNumber = (v: string) => (/^\d{1,2}$/.test(v) ? Number(v) : null);

function Stepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const n = toNumber(value) ?? 0;
  return (
    <div className="stepper">
      <button
        type="button"
        aria-label={`Giảm ${label}`}
        onClick={() => onChange(String(Math.max(0, n - 1)))}
      >
        −
      </button>
      <input
        aria-label={label}
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={value}
        // Phone keyboards can still produce "-", "." or a pasted string.
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 2))}
      />
      <button
        type="button"
        aria-label={`Tăng ${label}`}
        onClick={() => onChange(String(Math.min(25, n + 1)))}
      >
        +
      </button>
    </div>
  );
}

// Mount with a `key` that includes the match id and its stored score, so the
// fields reset when another match is selected or the result changes.
export function ScoreEntry({
  nameA,
  nameB,
  initial,
  disabled,
  onSave,
}: {
  nameA: string;
  nameB: string;
  initial: Score | null;
  disabled: boolean;
  onSave: (score: Score) => void;
}) {
  const [a, setA] = useState(initial ? String(initial.a) : "");
  const [b, setB] = useState(initial ? String(initial.b) : "");
  const na = toNumber(a);
  const nb = toNumber(b);
  const score = na !== null && nb !== null ? { a: na, b: nb } : null;
  const valid = score !== null && isFinalScore(score);
  const hint =
    score === null
      ? "Nhập điểm của hai đội."
      : valid
        ? "Tỉ số hợp lệ."
        : "Chưa hợp lệ: séc tới 21, hơn 2 điểm, trần 25.";

  return (
    <div className="admin-stack">
      <div className="score-entry">
        <div>
          <strong>{nameA}</strong>
          <Stepper label={`Điểm ${nameA}`} value={a} onChange={setA} />
        </div>
        <div>
          <strong>{nameB}</strong>
          <Stepper label={`Điểm ${nameB}`} value={b} onChange={setB} />
        </div>
      </div>
      <small aria-live="polite">{hint}</small>
      <button
        type="button"
        disabled={disabled || !valid}
        onClick={() => score && valid && onSave(score)}
      >
        Lưu tỉ số
      </button>
    </div>
  );
}
```

Run: `pnpm vitest run frontend/test/score-entry.test.tsx frontend/test/admin-time.test.ts`
Expected: all PASS.

- [ ] **Step 3: Implement `MatchesTab.tsx`**

```tsx
"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type {
  Match,
  TournamentDocument,
} from "../../../../packages/domain/src/schema";
import { deriveTournament } from "../../../../packages/domain/src/derive";
import { findScheduleConflicts } from "../../../../packages/domain/src/schedule";
import type { Standing } from "../../../../packages/domain/src/standings";
import type { ReadyAdmin } from "../../lib/use-admin";
import { categoryNames } from "../../lib/format";
import { Card, Pill } from "../landing/primitives";
import { ConfirmButton, Field } from "./fields";
import { ScoreEntry } from "./ScoreEntry";
import { addMinutes, fromLocalInput, toLocalInput } from "./time";

const PHASES = {
  group: "Vòng loại",
  first_place: "Tranh Nhất – Nhì",
  third_place: "Tranh Ba – Khuyến khích",
} as const;
const finished = (m: Match) =>
  m.status === "completed" || m.status === "walkover";
const teamName = (t: TournamentDocument, id: string | null) =>
  t.teams.find((x) => x.id === id)?.name ?? "—";

function StatusPill({ m }: { m: Match }) {
  if (m.status === "completed" && m.score)
    return (
      <Pill tone="green">
        {m.score.a}–{m.score.b}
      </Pill>
    );
  if (m.status === "walkover" && m.score)
    return (
      <Pill tone="red">
        Xử thắng {m.score.a}–{m.score.b}
      </Pill>
    );
  if (m.status === "called") return <Pill tone="yellow">Đang gọi</Pill>;
  return <Pill tone="outline">Chờ</Pill>;
}

// Teams level on points for, wins and difference once the group stage is over.
function tieGroups(standings: Standing[]): string[][] {
  const groups = new Map<string, string[]>();
  for (const r of standings.filter((r) => r.rank === null && r.played > 0)) {
    const key = `${r.pointsFor}/${r.wins}/${r.difference}`;
    groups.set(key, [...(groups.get(key) ?? []), r.teamId]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

function TieResolver({ admin, ids }: { admin: ReadyAdmin; ids: string[] }) {
  const t = admin.view.document;
  const [order, setOrder] = useState(ids);
  const [reason, setReason] = useState("Đối đầu trực tiếp");
  const up = (i: number) =>
    setOrder((o) => {
      const next = [...o];
      [next[i - 1], next[i]] = [next[i], next[i - 1]];
      return next;
    });
  return (
    <Card title="Các đội đồng hạng — BTC xếp thứ tự">
      <ol className="pick-list">
        {order.map((id, i) => (
          <li key={id} className="admin-bar">
            <strong>
              {i + 1}. {teamName(t, id)}
            </strong>
            <span className="spacer" />
            <button
              type="button"
              className="button--ghost"
              disabled={i === 0}
              aria-label={`Đưa ${teamName(t, id)} lên trên`}
              onClick={() => up(i)}
            >
              ↑ Lên
            </button>
          </li>
        ))}
      </ol>
      <Field label="Lý do">
        <input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <div className="row-actions">
        <button
          type="button"
          disabled={admin.busy || !reason.trim()}
          onClick={() =>
            admin.send(
              {
                type: "resolveTie",
                payload: { tiedTeamIds: ids, orderedTeamIds: order, reason },
              },
              "Đã xếp hạng các đội đồng hạng.",
            )
          }
        >
          Lưu thứ tự
        </button>
      </div>
    </Card>
  );
}

function LineupEditor({ admin, match }: { admin: ReadyAdmin; match: Match }) {
  const t = admin.view.document;
  const [ids, setIds] = useState<string[]>([
    match.pairA?.[0] ?? "",
    match.pairA?.[1] ?? "",
    match.pairB?.[0] ?? "",
    match.pairB?.[1] ?? "",
  ]);
  const options = (teamId: string | null) =>
    t.athletes.filter((a) => a.teamId === teamId && a.active);
  const complete =
    ids.every(Boolean) && ids[0] !== ids[1] && ids[2] !== ids[3];
  const slot = (i: number, teamId: string | null, label: string) => (
    <Field label={label}>
      <select
        value={ids[i]}
        onChange={(e) =>
          setIds((cur) => cur.map((v, j) => (j === i ? e.target.value : v)))
        }
      >
        <option value="">— chọn —</option>
        {options(teamId).map((a) => (
          <option key={a.id} value={a.id}>
            {a.name} ({a.gender === "male" ? "nam" : "nữ"})
          </option>
        ))}
      </select>
    </Field>
  );
  return (
    <Card title="Đội hình">
      {finished(match) && <p>Trận đã có kết quả nên đội hình bị khoá.</p>}
      <div className="field-row">
        {slot(0, match.teamAId, `${teamName(t, match.teamAId)} — VĐV 1`)}
        {slot(1, match.teamAId, `${teamName(t, match.teamAId)} — VĐV 2`)}
      </div>
      <div className="field-row">
        {slot(2, match.teamBId, `${teamName(t, match.teamBId)} — VĐV 1`)}
        {slot(3, match.teamBId, `${teamName(t, match.teamBId)} — VĐV 2`)}
      </div>
      <div className="row-actions">
        <button
          type="button"
          disabled={admin.busy || !complete || finished(match)}
          onClick={() =>
            admin.send(
              {
                type: "setLineup",
                payload: {
                  matchId: match.id,
                  pairA: [ids[0], ids[1]],
                  pairB: [ids[2], ids[3]],
                },
              },
              "Đã lưu đội hình.",
            )
          }
        >
          Lưu đội hình
        </button>
        <button
          type="button"
          className="button--ghost"
          disabled={admin.busy || (!match.lineupPublished && !match.pairA)}
          onClick={() =>
            admin.send(
              {
                type: "publishLineup",
                payload: {
                  matchId: match.id,
                  published: !match.lineupPublished,
                },
              },
              match.lineupPublished
                ? "Đã ẩn đội hình."
                : "Đã công bố đội hình.",
            )
          }
        >
          {match.lineupPublished ? "Ẩn đội hình" : "Công bố đội hình"}
        </button>
      </div>
      <small>
        {match.lineupPublished
          ? "Đội hình đang hiện trên trang giải."
          : "Đội hình chưa công bố — các đội chưa thấy cặp của đối thủ."}
      </small>
    </Card>
  );
}

function ScheduleEditor({
  admin,
  match,
  warnings,
}: {
  admin: ReadyAdmin;
  match: Match;
  warnings: string[];
}) {
  const t = admin.view.document;
  const [courtId, setCourtId] = useState(match.courtId ?? "");
  const [start, setStart] = useState(toLocalInput(match.startsAt));
  const [minutes, setMinutes] = useState(() =>
    match.startsAt && match.endsAt
      ? String(
          Math.round(
            (Date.parse(match.endsAt) - Date.parse(match.startsAt)) / 60_000,
          ),
        )
      : "20",
  );
  const startsAt = fromLocalInput(start);
  const length = /^\d{1,3}$/.test(minutes) ? Number(minutes) : 0;
  return (
    <Card title="Sân và giờ">
      <div className="field-row">
        <Field label="Sân">
          <select value={courtId} onChange={(e) => setCourtId(e.target.value)}>
            <option value="">— chưa xếp —</option>
            {t.courts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Giờ bắt đầu">
          <input
            type="datetime-local"
            value={start}
            onChange={(e) => setStart(e.target.value)}
          />
        </Field>
        <Field label="Thời lượng (phút)">
          <input
            inputMode="numeric"
            value={minutes}
            onChange={(e) =>
              setMinutes(e.target.value.replace(/\D/g, "").slice(0, 3))
            }
          />
        </Field>
      </div>
      {warnings.map((w) => (
        <p key={w} className="notice notice--warn">
          {w}
        </p>
      ))}
      <div className="row-actions">
        <button
          type="button"
          disabled={admin.busy || (startsAt !== null && length === 0)}
          onClick={() =>
            admin.send(
              {
                type: "setSchedule",
                payload: {
                  matchId: match.id,
                  courtId: courtId || null,
                  startsAt,
                  endsAt: startsAt ? addMinutes(startsAt, length) : null,
                },
              },
              "Đã lưu sân và giờ.",
            )
          }
        >
          Lưu sân và giờ
        </button>
      </div>
    </Card>
  );
}

function MatchEditor({
  admin,
  match,
  warnings,
}: {
  admin: ReadyAdmin;
  match: Match;
  warnings: string[];
}) {
  const { send, busy } = admin;
  const t = admin.view.document;
  const nameA = teamName(t, match.teamAId);
  const nameB = teamName(t, match.teamBId);
  const done = finished(match);
  const id = { matchId: match.id };
  return (
    <div className="admin-stack">
      <Card title={`${PHASES[match.phase]} · ${categoryNames[match.category]}`}>
        <p>
          <strong>{nameA}</strong> gặp <strong>{nameB}</strong>
        </p>
        <ScoreEntry
          key={`${match.id}:${match.score?.a}-${match.score?.b}`}
          nameA={nameA}
          nameB={nameB}
          initial={match.score}
          disabled={busy}
          onSave={(score) =>
            send({ type: "setScore", payload: { ...id, score } }, "Đã lưu tỉ số.")
          }
        />
        <div className="row-actions">
          {match.status === "pending" && (
            <button
              type="button"
              className="button--ghost"
              disabled={busy}
              onClick={() =>
                send({ type: "callMatch", payload: id }, "Đã gọi trận.")
              }
            >
              Gọi trận
            </button>
          )}
          {!done &&
            (["a", "b"] as const).map((side) => (
              <ConfirmButton
                key={side}
                label={`Xử thắng: ${side === "a" ? nameA : nameB} vắng`}
                disabled={busy}
                onConfirm={() =>
                  send(
                    { type: "setWalkover", payload: { ...id, absentSide: side } },
                    "Đã ghi xử thắng 21–0.",
                  )
                }
              />
            ))}
          {done && (
            <ConfirmButton
              label="Xoá kết quả"
              disabled={busy}
              onConfirm={() =>
                send({ type: "clearResult", payload: id }, "Đã xoá kết quả.")
              }
            />
          )}
        </div>
      </Card>
      <LineupEditor key={`lineup:${match.id}`} admin={admin} match={match} />
      <ScheduleEditor
        key={`schedule:${match.id}`}
        admin={admin}
        match={match}
        warnings={warnings}
      />
    </div>
  );
}

export function MatchesTab({ admin }: { admin: ReadyAdmin }) {
  const t = admin.view.document;
  const derived = useMemo(() => deriveTournament(t), [t]);
  const conflicts = useMemo(() => findScheduleConflicts(t.matches), [t]);
  const [selected, setSelected] = useState<string | null>(null);
  const editor = useRef<HTMLDivElement>(null);
  const match = t.matches.find((m) => m.id === selected) ?? null;

  // On a phone the editor sits below the whole list; bring it to the thumb.
  useEffect(() => {
    if (selected) editor.current?.scrollIntoView({ block: "start" });
  }, [selected]);

  if (!t.matches.length)
    return (
      <Card title="Chưa có trận đấu">
        <p>Bốc thăm ở mục “Đội” để tạo 18 trận vòng loại.</p>
      </Card>
    );

  const group = t.matches.filter((m) => m.phase === "group");
  const ties = group.every(finished) ? tieGroups(derived.standings) : [];
  const label = (m: Match) =>
    `${PHASES[m.phase]} · ${categoryNames[m.category]}: ${teamName(t, m.teamAId)} – ${teamName(t, m.teamBId)}`;
  const warnings = match
    ? conflicts
        .filter((c) => c.matchIds.includes(match.id))
        .map((c) => {
          const other = t.matches.find(
            (m) => m.id === c.matchIds.find((x) => x !== match.id),
          );
          return c.reason === "court"
            ? `Trùng sân với: ${other ? label(other) : "trận khác"}.`
            : `Có VĐV trùng giờ với: ${other ? label(other) : "trận khác"}.`;
        })
    : [];

  return (
    <div className="admin-split">
      <div className="admin-stack">
        {ties.map((ids) => (
          <TieResolver key={ids.join()} admin={admin} ids={ids} />
        ))}
        <ul className="pick-list">
          {[...t.matches]
            .sort((a, b) => a.order - b.order)
            .map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className="pick-item"
                  data-match-id={m.id}
                  aria-pressed={m.id === selected}
                  onClick={() => setSelected(m.id)}
                >
                  <span>{label(m)}</span>
                  <StatusPill m={m} />
                </button>
              </li>
            ))}
        </ul>
      </div>
      <div ref={editor}>
        {match ? (
          <MatchEditor
            key={match.id}
            admin={admin}
            match={match}
            warnings={warnings}
          />
        ) : (
          <Card dashed>
            <p>Chọn một trận để nhập tỉ số, đội hình và sân.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Register the tab**

Replace `frontend/src/features/admin/tabs.tsx` with:

```tsx
import type { ReactNode } from "react";
import type { ReadyAdmin } from "../../lib/use-admin";
import { MatchesTab } from "./MatchesTab";

export interface AdminTab {
  id: string;
  label: string;
  render: (admin: ReadyAdmin) => ReactNode;
}

// Order here is the order on screen. The first entry is the default tab.
export const TABS: AdminTab[] = [
  { id: "tran-dau", label: "Trận", render: (a) => <MatchesTab admin={a} /> },
];
```

- [ ] **Step 5: Add the e2e tests**

Append to `tests/e2e/admin.spec.ts`:

```ts
const MENS = "group-red-blue-mens_doubles";
const enterScore = async (page: Page, id: string, a: number, b: number) => {
  await page.locator(`[data-match-id="${id}"]`).click();
  await page.getByLabel("Điểm Đội Đỏ", { exact: true }).fill(String(a));
  await page.getByLabel("Điểm Đội Xanh", { exact: true }).fill(String(b));
  await page.getByRole("button", { name: "Lưu tỉ số" }).click();
};

test("a score entered on a phone reaches an open public page by itself", async ({
  page,
  context,
}) => {
  test.setTimeout(60_000);
  const visitor = await context.newPage();
  await visitor.goto("/");
  await expect(visitor.locator("#thong-bao")).toBeVisible();
  await expect(visitor.locator("#bang-xep-hang")).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await enterScore(page, MENS, 21, 15);
  await expect(page.getByRole("status")).toContainText("Đã lưu tỉ số.");
  await expect(page.locator(`[data-match-id="${MENS}"]`)).toContainText("21–15");
  expect(await overflow(page)).toBeLessThanOrEqual(1);

  // No reload and no navigation on the visitor's page: the 20-second poll
  // alone has to bring the leaderboard in.
  await expect(visitor.locator("#bang-xep-hang")).toBeVisible({
    timeout: 30_000,
  });
});

test("an impossible score cannot be saved", async ({ page }) => {
  await signIn(page);
  await page.locator(`[data-match-id="${MENS}"]`).click();
  await page.getByLabel("Điểm Đội Đỏ", { exact: true }).fill("21");
  await page.getByLabel("Điểm Đội Xanh", { exact: true }).fill("20");
  await expect(page.getByRole("button", { name: "Lưu tỉ số" })).toBeDisabled();
  await expect(page.getByText("Chưa hợp lệ")).toBeVisible();
});

test("a stale screen is told to check again instead of overwriting", async ({
  page,
  context,
}) => {
  const other = await context.newPage();
  await signIn(page);
  await signIn(other);
  await enterScore(page, MENS, 21, 15);
  await expect(page.getByRole("status")).toContainText("Đã lưu tỉ số.");

  await enterScore(other, MENS, 21, 10);
  await expect(other.getByRole("status")).toContainText(
    "Dữ liệu vừa thay đổi — kiểm tra rồi lưu lại.",
  );
  // It now shows what the first device saved, and that is what is stored.
  await expect(other.locator(`[data-match-id="${MENS}"]`)).toContainText("21–15");
  const stored = await (await page.request.get("/tournament.json")).json();
  expect(stored.matches[0].score).toEqual({ a: 21, b: 15 });
});

test("a walkover takes two taps and is recorded as 21–0", async ({ page }) => {
  await signIn(page);
  await page.locator(`[data-match-id="${MENS}"]`).click();
  await page.getByRole("button", { name: "Xử thắng: Đội Xanh vắng" }).click();
  await expect(page.locator(`[data-match-id="${MENS}"]`)).toContainText("Chờ");
  await page.getByRole("button", { name: "Bấm lần nữa để xác nhận" }).click();
  await expect(page.locator(`[data-match-id="${MENS}"]`)).toContainText(
    "Xử thắng 21–0",
  );
});
```

- [ ] **Step 6: Build and run everything**

Run: `pnpm vitest run frontend/test && pnpm --filter @webminton/frontend typecheck && pnpm build && pnpm test:e2e`
Expected: all PASS. If the visitor-page test times out, check `document.visibilityState` on the second page in headless Chromium before changing anything else — the poll only runs on a visible tab.

- [ ] **Step 7: Look at it against the posters**

```bash
node --import tsx scripts/serve-static.ts &
sleep 2
node scripts/screenshot.mjs "http://127.0.0.1:3100/quan-tri/" /tmp/matches-390.png 390 844 full
kill %1
```

The screenshot script cannot sign in, so also open `http://127.0.0.1:3100/quan-tri/` in a browser at phone width, sign in, select a match and check: steppers and inputs are at least 44px tall, the tab bar stays at the bottom, pills and cards match the public page.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/features/admin frontend/test tests/e2e/admin.spec.ts
git commit -m "feat(admin): enter scores, walkovers, lineups, schedule and tie decisions

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: `Đội` and `VĐV` tabs — draw, teams, athletes

**Files:**
- Create: `frontend/src/features/admin/TeamsTab.tsx`, `frontend/src/features/admin/AthletesTab.tsx`
- Modify: `frontend/src/features/admin/tabs.tsx`, `frontend/src/styles/admin.css`
- Test: `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `ReadyAdmin` (`view`, `send`, `query`, `busy`), `Field`, `ConfirmButton`; `POST /api/admin/draw/preview` → `{ seed: string; assignment: Record<string, string> }`; commands `confirmDraw`, `resetDraw`, `updateTeam`, `setAthleteTeam`, `upsertAthlete`, `removeAthlete`.
- Produces: `TeamsTab`, `AthletesTab`, registered as `{ id: "doi", label: "Đội" }` and `{ id: "vdv", label: "VĐV" }` after `tran-dau`.
- DOM contract used by e2e: seed input labelled `Mã bốc thăm`; preview names are `<li>` inside `.draw-preview`; athlete form labels `Họ và tên`, `Giới tính`, `Trình độ`, `Số điện thoại`, `Ghi chú riêng`; buttons `Thêm VĐV`, `Lưu VĐV`, `Xem trước`, `Xác nhận bốc thăm này`, `Bốc lại từ đầu`.

- [ ] **Step 1: Write the failing e2e tests**

Append to `tests/e2e/admin.spec.ts`:

```ts
test("re-draws the teams from a previewed seed", async ({ page }) => {
  await signIn(page, "#doi");
  await page.getByRole("button", { name: "Bốc lại từ đầu" }).click();
  await page.getByRole("button", { name: "Bấm lần nữa để xác nhận" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Đã xoá kết quả bốc thăm.",
  );

  await page.getByLabel("Mã bốc thăm").fill("mua-2026");
  await page.getByRole("button", { name: "Xem trước" }).click();
  await expect(page.locator(".draw-preview li")).toHaveCount(16);
  // A preview is not a save: visitors still see no teams.
  let data = await (await page.request.get("/tournament.json")).json();
  expect(data.draw.status).toBe("not_started");

  await page.getByRole("button", { name: "Xác nhận bốc thăm này" }).click();
  await expect(page.getByRole("status")).toContainText("Đã bốc thăm");
  data = await (await page.request.get("/tournament.json")).json();
  expect(data.draw.status).toBe("confirmed");
  expect(data.matches).toHaveLength(18);
});

test("the draw is locked once a match has been played", async ({ page }) => {
  await signIn(page);
  await enterScore(page, MENS, 21, 15);
  await expect(page.getByRole("status")).toContainText("Đã lưu tỉ số.");
  await page.getByRole("button", { name: "Đội", exact: true }).click();
  await expect(page.getByText("Đã có trận được gọi hoặc đánh")).toBeVisible();
  await expect(page.getByRole("button", { name: "Bốc lại từ đầu" })).toHaveCount(0);
});

test("adds an athlete without leaking private fields", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "#vdv");
  await page.getByRole("button", { name: "Thêm VĐV" }).click();
  await page.getByLabel("Họ và tên").fill("Nguyễn Thị Thử");
  await page.getByLabel("Giới tính").selectOption("female");
  await page.getByLabel("Trình độ").selectOption("2");
  await page.getByLabel("Số điện thoại").fill("0909 111 222");
  await page.getByLabel("Ghi chú riêng").fill("chỉ BTC đọc");
  await page.getByRole("button", { name: "Lưu VĐV" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu VĐV.");
  await expect(page.locator(".pick-list")).toContainText("Nguyễn Thị Thử");
  expect(await overflow(page)).toBeLessThanOrEqual(1);

  const body = await (await page.request.get("/tournament.json")).text();
  expect(body).toContain("Nguyễn Thị Thử");
  for (const leak of ["0909", "chỉ BTC đọc", '"skillBand"', '"phone"'])
    expect(body).not.toContain(leak);
});

test("removes an athlete who is in no lineup", async ({ page }) => {
  await signIn(page, "#vdv");
  await page.getByRole("button", { name: /VĐV thử 16/ }).click();
  await page.getByRole("button", { name: "Xoá VĐV" }).click();
  await page.getByRole("button", { name: "Bấm lần nữa để xác nhận" }).click();
  await expect(page.getByRole("status")).toContainText("Đã xoá VĐV.");
  await expect(page.locator(".pick-list")).not.toContainText("VĐV thử 16");
});
```

Run: `pnpm build && pnpm test:e2e`
Expected: the four new tests FAIL (no `Đội` or `VĐV` tab); the rest PASS.

- [ ] **Step 2: Implement `TeamsTab.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import type { Team } from "../../../../packages/domain/src/schema";
import type { ReadyAdmin } from "../../lib/use-admin";
import { Card, Pill } from "../landing/primitives";
import { ConfirmButton, Field } from "./fields";

interface Preview {
  seed: string;
  assignment: Record<string, string>;
}

function DrawPanel({ admin }: { admin: ReadyAdmin }) {
  const { view, send, query, busy } = admin;
  const t = view.document;
  const confirmed = t.draw.status === "confirmed";
  const started = t.matches.some((m) => m.status !== "pending");
  const active = t.athletes.filter((a) => a.active);
  const men = active.filter((a) => a.gender === "male").length;
  const women = active.length - men;
  const noSkill = active.filter(
    (a) => (view.private[a.id]?.skillBand ?? null) === null,
  ).length;
  const eligible = men >= 8 && women >= 8 && noSkill === 0;

  const [seed, setSeed] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  // Generated after mount so the server-rendered HTML and the client agree.
  useEffect(() => {
    setSeed((s) => s || `mua-2026-${Math.random().toString(36).slice(2, 6)}`);
  }, []);

  if (started)
    return (
      <Card title="Bốc thăm">
        <p>Đã có trận được gọi hoặc đánh — không bốc thăm lại được.</p>
      </Card>
    );

  return (
    <Card title="Bốc thăm chia đội">
      <div className="pill-row">
        <Pill tone={men >= 8 ? "green" : "red"}>{men} nam</Pill>
        <Pill tone={women >= 8 ? "green" : "red"}>{women} nữ</Pill>
        <Pill tone={noSkill === 0 ? "green" : "red"}>
          {noSkill} VĐV chưa có trình độ
        </Pill>
      </div>
      {!eligible && (
        <p>
          Cần tối thiểu 8 nam và 8 nữ đang thi đấu, ai cũng có trình độ 1–3.
          Bổ sung ở mục “VĐV”.
        </p>
      )}

      {confirmed ? (
        <>
          <p>Đã bốc thăm. Chưa trận nào được gọi nên vẫn bốc lại được.</p>
          <div className="row-actions">
            <ConfirmButton
              label="Bốc lại từ đầu"
              disabled={busy}
              onConfirm={() =>
                send(
                  { type: "resetDraw", payload: {} },
                  "Đã xoá kết quả bốc thăm.",
                )
              }
            />
          </div>
        </>
      ) : (
        <>
          <Field label="Mã bốc thăm">
            <input
              value={seed}
              onChange={(e) => {
                setSeed(e.target.value);
                setPreview(null);
              }}
            />
          </Field>
          <small>
            Cùng một mã luôn cho cùng một kết quả. Xem trước chỉ mình bạn thấy.
          </small>
          <div className="row-actions">
            <button
              type="button"
              className="button--ghost"
              disabled={busy || !seed.trim()}
              onClick={async () =>
                setPreview(
                  await query<Preview>("/api/admin/draw/preview", {
                    seed: seed.trim(),
                  }),
                )
              }
            >
              Xem trước
            </button>
            {preview && (
              <button
                type="button"
                disabled={busy}
                onClick={async () => {
                  const ok = await send(
                    { type: "confirmDraw", payload: { seed: preview.seed } },
                    "Đã bốc thăm và tạo 18 trận vòng loại.",
                  );
                  if (ok) setPreview(null);
                }}
              >
                Xác nhận bốc thăm này
              </button>
            )}
          </div>
          {preview && (
            <div className="team-grid draw-preview">
              {t.teams.map((team) => (
                <div key={team.id}>
                  <strong>{team.name}</strong>
                  <ul>
                    {t.athletes
                      .filter((a) => preview.assignment[a.id] === team.id)
                      .map((a) => (
                        <li key={a.id}>{a.name}</li>
                      ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </Card>
  );
}

function TeamCard({ admin, team }: { admin: ReadyAdmin; team: Team }) {
  const { view, send, busy } = admin;
  const t = view.document;
  const members = t.athletes.filter((a) => a.teamId === team.id);
  const [name, setName] = useState(team.name);
  const [color, setColor] = useState(team.color);
  const [captainId, setCaptainId] = useState(team.captainId ?? "");
  return (
    <Card title={team.name}>
      <div className="field-row">
        <Field label={`Tên ${team.name}`}>
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Màu">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
          />
        </Field>
        <Field label="Đội trưởng">
          <select
            value={captainId}
            onChange={(e) => setCaptainId(e.target.value)}
          >
            <option value="">— chưa có —</option>
            {members.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="row-actions">
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={() =>
            send(
              {
                type: "updateTeam",
                payload: {
                  teamId: team.id,
                  name: name.trim(),
                  color,
                  captainId: captainId || null,
                },
              },
              "Đã lưu đội.",
            )
          }
        >
          Lưu đội
        </button>
      </div>
      <MemberList admin={admin} ids={members.map((a) => a.id)} />
    </Card>
  );
}

// One row per athlete with a team picker; changing it saves straight away.
function MemberList({ admin, ids }: { admin: ReadyAdmin; ids: string[] }) {
  const { view, send, busy } = admin;
  const t = view.document;
  if (!ids.length) return <p>Chưa có VĐV.</p>;
  return (
    <ul className="pick-list">
      {ids.map((id) => {
        const a = t.athletes.find((x) => x.id === id)!;
        return (
          <li key={id} className="field-row">
            <span>
              {a.name} · {a.gender === "male" ? "nam" : "nữ"}
              {!a.active && " · nghỉ"}
            </span>
            <select
              aria-label={`Đội của ${a.name}`}
              value={a.teamId ?? ""}
              disabled={busy}
              onChange={(e) =>
                send(
                  {
                    type: "setAthleteTeam",
                    payload: { athleteId: id, teamId: e.target.value || null },
                  },
                  `Đã chuyển ${a.name}.`,
                )
              }
            >
              <option value="">— chưa xếp đội —</option>
              {t.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </li>
        );
      })}
    </ul>
  );
}

export function TeamsTab({ admin }: { admin: ReadyAdmin }) {
  const t = admin.view.document;
  const unassigned = t.athletes.filter((a) => a.teamId === null);
  return (
    <div className="admin-stack">
      <DrawPanel admin={admin} />
      <div className="team-grid">
        {t.teams.map((team) => (
          // Remount when the stored team changes so the fields show it.
          <TeamCard
            key={`${team.id}:${team.name}:${team.color}:${team.captainId}`}
            admin={admin}
            team={team}
          />
        ))}
      </div>
      {t.draw.status === "confirmed" && unassigned.length > 0 && (
        <Card title="Chưa xếp đội" dashed>
          <MemberList admin={admin} ids={unassigned.map((a) => a.id)} />
        </Card>
      )}
    </div>
  );
}
```

`.team-grid` and `.pill-row` already exist in `poster.css`. Append to `frontend/src/styles/admin.css`:

```css
.draw-preview {
  margin-top: 14px;
}
.draw-preview ul {
  margin: 4px 0 0;
  padding-left: 18px;
}
.pick-list > li.field-row {
  align-items: center;
}
```

- [ ] **Step 3: Implement `AthletesTab.tsx`**

```tsx
"use client";
import { useEffect, useRef, useState } from "react";
import type { Athlete } from "../../../../packages/domain/src/schema";
import type { ReadyAdmin } from "../../lib/use-admin";
import { Card, Pill } from "../landing/primitives";
import { ConfirmButton, Field } from "./fields";

const NEW = "__new__";

function AthleteForm({
  admin,
  athlete,
  onDone,
}: {
  admin: ReadyAdmin;
  athlete: Athlete | null;
  onDone: () => void;
}) {
  const { view, send, busy } = admin;
  const priv = athlete ? view.private[athlete.id] : undefined;
  const [name, setName] = useState(athlete?.name ?? "");
  const [gender, setGender] = useState<"male" | "female">(
    athlete?.gender ?? "male",
  );
  const [active, setActive] = useState(athlete?.active ?? true);
  const [skill, setSkill] = useState(String(priv?.skillBand ?? ""));
  const [phone, setPhone] = useState(priv?.phone ?? "");
  const [note, setNote] = useState(priv?.note ?? "");

  return (
    <Card title={athlete ? `Sửa: ${athlete.name}` : "VĐV mới"}>
      <div className="admin-stack">
        <Field label="Họ và tên">
          <input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div className="field-row">
          <Field label="Giới tính">
            <select
              value={gender}
              onChange={(e) => setGender(e.target.value as "male" | "female")}
            >
              <option value="male">Nam</option>
              <option value="female">Nữ</option>
            </select>
          </Field>
          <Field label="Trình độ">
            <select value={skill} onChange={(e) => setSkill(e.target.value)}>
              <option value="">— chưa xếp —</option>
              <option value="1">1 — mạnh</option>
              <option value="2">2 — khá</option>
              <option value="3">3 — mới chơi</option>
            </select>
          </Field>
          <Field label="Đang thi đấu">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
          </Field>
        </div>
        <Field label="Số điện thoại">
          <input
            inputMode="tel"
            maxLength={30}
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field label="Ghi chú riêng">
          <textarea
            rows={3}
            maxLength={2000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </Field>
        <small>
          Trình độ, số điện thoại và ghi chú chỉ BTC thấy — không bao giờ lên
          trang giải.
        </small>
      </div>
      <div className="row-actions">
        <button
          type="button"
          disabled={busy || !name.trim()}
          onClick={async () => {
            const ok = await send(
              {
                type: "upsertAthlete",
                payload: {
                  id: athlete?.id ?? null,
                  name: name.trim(),
                  gender,
                  active,
                  skillBand: skill ? (Number(skill) as 1 | 2 | 3) : null,
                  phone: phone.trim() || null,
                  note,
                },
              },
              "Đã lưu VĐV.",
            );
            if (ok) onDone();
          }}
        >
          Lưu VĐV
        </button>
        {athlete && (
          <ConfirmButton
            label="Xoá VĐV"
            disabled={busy}
            onConfirm={async () => {
              const ok = await send(
                { type: "removeAthlete", payload: { id: athlete.id } },
                "Đã xoá VĐV.",
              );
              if (ok) onDone();
            }}
          />
        )}
        <button type="button" className="button--ghost" onClick={onDone}>
          Đóng
        </button>
      </div>
    </Card>
  );
}

export function AthletesTab({ admin }: { admin: ReadyAdmin }) {
  const { view } = admin;
  const t = view.document;
  const [selected, setSelected] = useState<string | null>(null);
  const form = useRef<HTMLDivElement>(null);
  // On a phone the form sits below the whole list; bring it to the thumb.
  useEffect(() => {
    if (selected) form.current?.scrollIntoView({ block: "start" });
  }, [selected]);
  const athlete = t.athletes.find((a) => a.id === selected) ?? null;
  const men = t.athletes.filter((a) => a.gender === "male").length;
  const teamName = (id: string | null) =>
    t.teams.find((x) => x.id === id)?.name ?? "chưa xếp đội";

  return (
    <div className="admin-split">
      <div className="admin-stack">
        <div className="admin-bar">
          <strong>
            {t.athletes.length} VĐV · {men} nam · {t.athletes.length - men} nữ
          </strong>
          <span className="spacer" />
          <button type="button" onClick={() => setSelected(NEW)}>
            Thêm VĐV
          </button>
        </div>
        <ul className="pick-list">
          {t.athletes.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className="pick-item"
                aria-pressed={a.id === selected}
                onClick={() => setSelected(a.id)}
              >
                <span>
                  {a.name} · {a.gender === "male" ? "nam" : "nữ"} ·{" "}
                  {teamName(a.teamId)}
                </span>
                {!a.active ? (
                  <Pill tone="outline">Nghỉ</Pill>
                ) : (view.private[a.id]?.skillBand ?? null) === null ? (
                  <Pill tone="red">Thiếu trình độ</Pill>
                ) : (
                  <Pill tone="green">
                    Trình độ {view.private[a.id]?.skillBand}
                  </Pill>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
      <div ref={form}>
        {selected === NEW || athlete ? (
          <AthleteForm
            key={selected}
            admin={admin}
            athlete={athlete}
            onDone={() => setSelected(null)}
          />
        ) : (
          <Card dashed>
            <p>Chọn một VĐV để sửa, hoặc bấm “Thêm VĐV”.</p>
          </Card>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Register both tabs**

In `frontend/src/features/admin/tabs.tsx`, add the imports
`import { TeamsTab } from "./TeamsTab";` and `import { AthletesTab } from "./AthletesTab";`, and extend `TABS`:

```tsx
export const TABS: AdminTab[] = [
  { id: "tran-dau", label: "Trận", render: (a) => <MatchesTab admin={a} /> },
  { id: "doi", label: "Đội", render: (a) => <TeamsTab admin={a} /> },
  { id: "vdv", label: "VĐV", render: (a) => <AthletesTab admin={a} /> },
];
```

- [ ] **Step 5: Run**

Run: `pnpm --filter @webminton/frontend typecheck && pnpm build && pnpm test:e2e`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src tests/e2e/admin.spec.ts
git commit -m "feat(admin): run the draw and manage teams and athletes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 14: `Thu chi`, `Giải` and `Lịch sử` tabs

**Files:**
- Create: `frontend/src/features/admin/FinanceTab.tsx`, `frontend/src/features/admin/InfoTab.tsx`, `frontend/src/features/admin/HistoryTab.tsx`
- Modify: `frontend/src/features/admin/tabs.tsx`
- Test: `tests/e2e/admin.spec.ts`

**Interfaces:**
- Consumes: `ReadyAdmin` (`view`, `send`, `restore`, `query`, `busy`), `Field`, `ConfirmButton`; `calculateFinance` from domain; `formatVnd`, `formatDate` from `lib/format`; `toLocalInput`, `fromLocalInput` (Task 12); `GET /api/admin/history` → `{ entries: { version, at, actorEmail, commandType, requestId }[] }`.
- Produces: `FinanceTab`, `InfoTab`, `HistoryTab`, registered as `{ id: "thu-chi", label: "Thu chi" }`, `{ id: "giai", label: "Giải" }`, `{ id: "lich-su", label: "Lịch sử" }` after `vdv`.
- DOM contract used by e2e: info labels `Địa điểm`, `Lệ phí (đồng)`; button `Lưu thông tin`; finance buttons `Thêm khoản chi`, `Lưu khoản chi`, labels `Khoản chi`, `Số lượng`, `Đơn giá (đồng)`; checkbox `Công bố thu chi trên trang giải`; history rows are `<li data-version="N">` with a `Khôi phục` button.

- [ ] **Step 1: Write the failing e2e tests**

Append to `tests/e2e/admin.spec.ts`:

```ts
const publicData = async (page: Page) =>
  (await page.request.get("/tournament.json")).json();

test("edits tournament info and the public file follows", async ({ page }) => {
  await signIn(page, "#giai");
  await page.getByLabel("Địa điểm").fill("Sân cầu lông Tấn Phúc 2");
  await page.getByLabel("Lệ phí (đồng)").fill("150000");
  await page.getByRole("button", { name: "Lưu thông tin" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu thông tin giải.");
  const data = await publicData(page);
  expect(data.info.location).toBe("Sân cầu lông Tấn Phúc 2");
  expect(data.info.feeVnd).toBe(150000);
});

test("adds an expense and publishes the finance section", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page, "#thu-chi");
  await page.getByRole("button", { name: "Thêm khoản chi" }).click();
  await page.getByLabel("Khoản chi").fill("Thuê sân");
  await page.getByLabel("Số lượng").fill("4");
  await page.getByLabel("Đơn giá (đồng)").fill("120000");
  await page.getByRole("button", { name: "Lưu khoản chi" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu.");
  // click(), not check(): the box is controlled and only flips once the save
  // returns, which check() would report as "did not change its state".
  await page.getByLabel("Công bố thu chi trên trang giải").click();
  await expect(page.getByRole("status")).toContainText("Đã công bố thu chi.");
  await expect(page.getByLabel("Công bố thu chi trên trang giải")).toBeChecked();
  expect(await overflow(page)).toBeLessThanOrEqual(1);

  const data = await publicData(page);
  expect(data.finance.published).toBe(true);
  expect(data.finance.expenses[0]).toMatchObject({
    label: "Thuê sân",
    quantity: 4,
    unitPriceVnd: 120000,
  });
});

test("lists every change and restores an earlier version", async ({ page }) => {
  await signIn(page, "#giai");
  await page.getByLabel("Lệ phí (đồng)").fill("999000");
  await page.getByRole("button", { name: "Lưu thông tin" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu thông tin giải.");
  expect((await publicData(page)).info.feeVnd).toBe(999000);

  await page.getByRole("button", { name: "Lịch sử", exact: true }).click();
  const latest = page.locator('[data-version="2"]');
  await expect(latest).toContainText("Sửa thông tin giải");
  await expect(latest).toContainText("admin@example.com");

  const first = page.locator('[data-version="1"]');
  await first.getByRole("button", { name: "Khôi phục" }).click();
  await first.getByRole("button", { name: "Bấm lần nữa để xác nhận" }).click();
  await expect(page.getByRole("status")).toContainText(
    "Đã khôi phục phiên bản 1.",
  );
  expect((await publicData(page)).info.feeVnd).toBeNull();
  await expect(page.locator('[data-version="3"]')).toContainText(
    "Khôi phục phiên bản 1",
  );
});
```

Run: `pnpm build && pnpm test:e2e`
Expected: the three new tests FAIL; the rest PASS.

- [ ] **Step 2: Implement `FinanceTab.tsx`**

```tsx
"use client";
import { useState } from "react";
import type { TournamentDocument } from "../../../../packages/domain/src/schema";
import { calculateFinance } from "../../../../packages/domain/src/finance";
import type { ReadyAdmin } from "../../lib/use-admin";
import { formatVnd } from "../../lib/format";
import { Card } from "../landing/primitives";
import { ConfirmButton, Field } from "./fields";

type Sponsor = TournamentDocument["sponsorships"][number];
type Income = TournamentDocument["finance"]["income"][number];
type Expense = TournamentDocument["finance"]["expenses"][number];

// text must be non-empty; note may be empty; money and number are whole
// numbers typed as digits; tier is the sponsor's manual rank override.
type Kind = "text" | "note" | "money" | "number" | "bool" | "tier";
interface FieldDef<T> {
  key: keyof T & string;
  label: string;
  kind: Kind;
}
const newId = (prefix: string) =>
  `${prefix}-${crypto.randomUUID().slice(0, 8)}`;

function Lines<T extends { id: string }>({
  admin,
  title,
  noun,
  items,
  fields,
  blank,
  summary,
  onSave,
  onRemove,
}: {
  admin: ReadyAdmin;
  title: string;
  noun: string;
  items: T[];
  fields: FieldDef<T>[];
  blank: () => T;
  summary: (item: T) => string;
  onSave: (item: T) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<T | null>(null);
  const set = (key: keyof T, value: unknown) =>
    setDraft((d) => (d ? { ...d, [key]: value } : d));
  const stored = draft ? items.some((i) => i.id === draft.id) : false;
  const complete =
    draft !== null &&
    fields.every(
      (f) => f.kind !== "text" || String(draft[f.key] ?? "").trim() !== "",
    );

  const input = (d: T, f: FieldDef<T>) => {
    const value = d[f.key];
    if (f.kind === "bool")
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => set(f.key, e.target.checked)}
        />
      );
    if (f.kind === "tier")
      return (
        <select
          value={(value as string | null) ?? ""}
          onChange={(e) => set(f.key, e.target.value || null)}
        >
          <option value="">Tự xếp theo số tiền</option>
          <option value="diamond">Kim cương</option>
          <option value="platinum">Bạch kim</option>
          <option value="gold">Vàng</option>
        </select>
      );
    if (f.kind === "money" || f.kind === "number")
      return (
        <input
          inputMode="numeric"
          value={String(value ?? 0)}
          onChange={(e) =>
            set(f.key, Number(e.target.value.replace(/\D/g, "").slice(0, 12)))
          }
        />
      );
    return (
      <input
        value={String(value ?? "")}
        onChange={(e) => set(f.key, e.target.value)}
      />
    );
  };

  return (
    <Card title={title}>
      {items.length === 0 && <p>Chưa có {noun} nào.</p>}
      <ul className="pick-list">
        {items.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="pick-item"
              aria-pressed={draft?.id === item.id}
              onClick={() => setDraft(structuredClone(item))}
            >
              <span>{summary(item)}</span>
              <span>Sửa</span>
            </button>
          </li>
        ))}
      </ul>
      {draft ? (
        <div className="admin-stack">
          <div className="field-row">
            {fields.map((f) => (
              <Field key={f.key} label={f.label}>
                {input(draft, f)}
              </Field>
            ))}
          </div>
          <div className="row-actions">
            <button
              type="button"
              disabled={admin.busy || !complete}
              onClick={async () => {
                if (await onSave(draft)) setDraft(null);
              }}
            >
              Lưu {noun}
            </button>
            {stored && (
              <ConfirmButton
                label={`Xoá ${noun}`}
                disabled={admin.busy}
                onConfirm={async () => {
                  if (await onRemove(draft.id)) setDraft(null);
                }}
              />
            )}
            <button
              type="button"
              className="button--ghost"
              onClick={() => setDraft(null)}
            >
              Đóng
            </button>
          </div>
        </div>
      ) : (
        <div className="row-actions">
          <button
            type="button"
            className="button--ghost"
            onClick={() => setDraft(blank())}
          >
            Thêm {noun}
          </button>
        </div>
      )}
    </Card>
  );
}

export function FinanceTab({ admin }: { admin: ReadyAdmin }) {
  const { view, send, busy } = admin;
  const t = view.document;
  const totals = calculateFinance(t);
  const received = (ok: boolean) => (ok ? "" : " · chưa nhận");

  return (
    <div className="admin-stack">
      <Card title="Tổng quan">
        <p className="leaders">
          <span>Đã thu</span>
          <i />
          <b>{formatVnd(totals.receivedVnd)}</b>
        </p>
        <p className="leaders">
          <span>Đã chi</span>
          <i />
          <b>{formatVnd(totals.paidVnd)}</b>
        </p>
        <p className="leaders">
          <span>Còn lại</span>
          <i />
          <b>{formatVnd(totals.balanceVnd)}</b>
        </p>
        <Field label="Công bố thu chi trên trang giải">
          <input
            type="checkbox"
            checked={t.finance.published}
            disabled={busy}
            onChange={(e) =>
              send(
                {
                  type: "setFinancePublished",
                  payload: { published: e.target.checked },
                },
                e.target.checked ? "Đã công bố thu chi." : "Đã ẩn thu chi.",
              )
            }
          />
        </Field>
      </Card>

      <Lines<Sponsor>
        admin={admin}
        title="Nhà tài trợ"
        noun="nhà tài trợ"
        items={t.sponsorships}
        fields={[
          { key: "name", label: "Nhà tài trợ", kind: "text" },
          { key: "amountVnd", label: "Số tiền (đồng)", kind: "money" },
          { key: "received", label: "Đã nhận", kind: "bool" },
          { key: "tierOverride", label: "Hạng", kind: "tier" },
          { key: "note", label: "Ghi chú", kind: "note" },
        ]}
        blank={() => ({
          id: newId("sp"),
          name: "",
          amountVnd: 0,
          received: false,
          note: "",
          tierOverride: null,
        })}
        summary={(s) =>
          `${s.name} · ${formatVnd(s.amountVnd)}${received(s.received)}`
        }
        onSave={(payload) => send({ type: "upsertSponsor", payload })}
        onRemove={(id) => send({ type: "removeSponsor", payload: { id } })}
      />

      <Lines<Income>
        admin={admin}
        title="Khoản thu"
        noun="khoản thu"
        items={t.finance.income}
        fields={[
          { key: "label", label: "Khoản thu", kind: "text" },
          { key: "amountVnd", label: "Số tiền (đồng)", kind: "money" },
          { key: "received", label: "Đã nhận", kind: "bool" },
        ]}
        blank={() => ({
          id: newId("in"),
          label: "",
          amountVnd: 0,
          received: false,
        })}
        summary={(i) =>
          `${i.label} · ${formatVnd(i.amountVnd)}${received(i.received)}`
        }
        onSave={(payload) => send({ type: "upsertIncome", payload })}
        onRemove={(id) => send({ type: "removeIncome", payload: { id } })}
      />

      <Lines<Expense>
        admin={admin}
        title="Khoản chi"
        noun="khoản chi"
        items={t.finance.expenses}
        fields={[
          { key: "label", label: "Khoản chi", kind: "text" },
          { key: "quantity", label: "Số lượng", kind: "number" },
          { key: "unitPriceVnd", label: "Đơn giá (đồng)", kind: "money" },
          { key: "paid", label: "Đã chi", kind: "bool" },
          { key: "note", label: "Ghi chú", kind: "note" },
        ]}
        blank={() => ({
          id: newId("ex"),
          label: "",
          quantity: 1,
          unitPriceVnd: 0,
          paid: false,
          note: "",
        })}
        summary={(e) =>
          `${e.label} · ${e.quantity} × ${formatVnd(e.unitPriceVnd)}${e.paid ? "" : " · chưa chi"}`
        }
        onSave={(payload) => send({ type: "upsertExpense", payload })}
        onRemove={(id) => send({ type: "removeExpense", payload: { id } })}
      />
    </div>
  );
}
```

The tier names match `features/landing/PosterThree.tsx`: `diamond` = Kim cương, `platinum` = Bạch kim, `gold` = Vàng.

- [ ] **Step 3: Implement `InfoTab.tsx`**

```tsx
"use client";
import { useState } from "react";
import type { ReadyAdmin } from "../../lib/use-admin";
import { Card } from "../landing/primitives";
import { Field } from "./fields";
import { fromLocalInput, toLocalInput } from "./time";

const orNull = (v: string) => (v.trim() === "" ? null : v.trim());

function InfoForm({ admin }: { admin: ReadyAdmin }) {
  const { send, busy } = admin;
  const info = admin.view.document.info;
  const [f, setF] = useState({
    name: info.name,
    clubName: info.clubName,
    slogan: info.slogan,
    location: info.location,
    dateLabel: info.dateLabel,
    startsAt: toLocalInput(info.startsAt),
    registrationDeadline: toLocalInput(info.registrationDeadline),
    registrationFormUrl: info.registrationFormUrl ?? "",
    feeVnd: info.feeVnd === null ? "" : String(info.feeVnd),
    contactName: info.contactName ?? "",
    contactPhone: info.contactPhone ?? "",
    zaloUrl: info.zaloUrl ?? "",
    qrAssetPath: info.qrAssetPath ?? "",
    qrPublished: info.qrPublished,
  });
  const text = (key: keyof typeof f, label: string, type = "text") => (
    <Field label={label}>
      <input
        type={type}
        value={String(f[key])}
        onChange={(e) => setF((cur) => ({ ...cur, [key]: e.target.value }))}
      />
    </Field>
  );
  const required = [f.name, f.clubName, f.slogan, f.location, f.dateLabel];

  return (
    <Card title="Thông tin giải">
      <div className="admin-stack">
        {text("name", "Tên giải")}
        {text("clubName", "Câu lạc bộ")}
        {text("slogan", "Khẩu hiệu")}
        <div className="field-row">
          {text("location", "Địa điểm")}
          {text("dateLabel", "Dòng ngày giờ trên poster")}
        </div>
        <div className="field-row">
          {text("startsAt", "Giờ khai mạc", "datetime-local")}
          {text("registrationDeadline", "Hạn đăng ký", "datetime-local")}
          <Field label="Lệ phí (đồng)">
            <input
              inputMode="numeric"
              value={f.feeVnd}
              onChange={(e) =>
                setF((cur) => ({
                  ...cur,
                  feeVnd: e.target.value.replace(/\D/g, "").slice(0, 9),
                }))
              }
            />
          </Field>
        </div>
        {text("registrationFormUrl", "Link form đăng ký (để trống = đóng đăng ký)", "url")}
        <div className="field-row">
          {text("contactName", "Người liên hệ")}
          {text("contactPhone", "Số điện thoại liên hệ (hiện công khai)")}
        </div>
        {text("zaloUrl", "Link nhóm Zalo", "url")}
        <div className="field-row">
          {text("qrAssetPath", "Đường dẫn ảnh QR")}
          <Field label="Hiện mã QR trên trang giải">
            <input
              type="checkbox"
              checked={f.qrPublished}
              onChange={(e) =>
                setF((cur) => ({ ...cur, qrPublished: e.target.checked }))
              }
            />
          </Field>
        </div>
      </div>
      <div className="row-actions">
        <button
          type="button"
          disabled={busy || required.some((v) => !v.trim())}
          onClick={() =>
            send(
              {
                type: "updateInfo",
                payload: {
                  name: f.name.trim(),
                  clubName: f.clubName.trim(),
                  slogan: f.slogan.trim(),
                  location: f.location.trim(),
                  dateLabel: f.dateLabel.trim(),
                  startsAt: fromLocalInput(f.startsAt),
                  registrationDeadline: fromLocalInput(f.registrationDeadline),
                  registrationFormUrl: orNull(f.registrationFormUrl),
                  feeVnd: f.feeVnd === "" ? null : Number(f.feeVnd),
                  contactName: orNull(f.contactName),
                  contactPhone: orNull(f.contactPhone),
                  zaloUrl: orNull(f.zaloUrl),
                  qrAssetPath: orNull(f.qrAssetPath),
                  qrPublished: f.qrPublished,
                },
              },
              "Đã lưu thông tin giải.",
            )
          }
        >
          Lưu thông tin
        </button>
      </div>
    </Card>
  );
}

function CourtsForm({ admin }: { admin: ReadyAdmin }) {
  const { send, busy } = admin;
  const [courts, setCourts] = useState(admin.view.document.courts);
  const nextId = () => {
    const n =
      Math.max(0, ...courts.map((c) => Number(/^san-(\d+)$/.exec(c.id)?.[1] ?? 0))) +
      1;
    return `san-${n}`;
  };
  return (
    <Card title="Sân thi đấu">
      <div className="admin-stack">
        {courts.map((c, i) => (
          <div key={c.id} className="field-row">
            <Field label={`Tên sân ${i + 1}`}>
              <input
                value={c.name}
                onChange={(e) =>
                  setCourts((cur) =>
                    cur.map((x) =>
                      x.id === c.id ? { ...x, name: e.target.value } : x,
                    ),
                  )
                }
              />
            </Field>
            <button
              type="button"
              className="button--ghost"
              onClick={() => setCourts((cur) => cur.filter((x) => x.id !== c.id))}
            >
              Bỏ sân này
            </button>
          </div>
        ))}
      </div>
      <div className="row-actions">
        <button
          type="button"
          className="button--ghost"
          onClick={() =>
            setCourts((cur) => [
              ...cur,
              { id: nextId(), name: `Sân ${cur.length + 1}` },
            ])
          }
        >
          Thêm sân
        </button>
        <button
          type="button"
          disabled={busy || courts.some((c) => !c.name.trim())}
          onClick={() =>
            send(
              {
                type: "setCourts",
                payload: {
                  courts: courts.map((c) => ({ ...c, name: c.name.trim() })),
                },
              },
              "Đã lưu danh sách sân.",
            )
          }
        >
          Lưu sân
        </button>
      </div>
    </Card>
  );
}

export function InfoTab({ admin }: { admin: ReadyAdmin }) {
  // Keyed on the version so a restore or a conflict reload refills the forms.
  const v = admin.view.version;
  return (
    <div className="admin-stack">
      <InfoForm key={`info:${v}`} admin={admin} />
      <CourtsForm key={`courts:${v}`} admin={admin} />
    </div>
  );
}
```

- [ ] **Step 4: Implement `HistoryTab.tsx`**

```tsx
"use client";
import { useEffect, useState } from "react";
import type { ReadyAdmin } from "../../lib/use-admin";
import { formatDate } from "../../lib/format";
import { Card } from "../landing/primitives";
import { ConfirmButton } from "./fields";

interface Entry {
  version: number;
  at: string;
  actorEmail: string;
  commandType: string;
  requestId: string;
}

const LABELS: Record<string, string> = {
  seed: "Nạp dữ liệu từ file",
  updateInfo: "Sửa thông tin giải",
  setCourts: "Sửa danh sách sân",
  updateTeam: "Sửa đội",
  upsertAthlete: "Thêm hoặc sửa VĐV",
  removeAthlete: "Xoá VĐV",
  setAthleteTeam: "Chuyển đội cho VĐV",
  confirmDraw: "Bốc thăm chia đội",
  resetDraw: "Xoá kết quả bốc thăm",
  setLineup: "Sửa đội hình",
  publishLineup: "Công bố hoặc ẩn đội hình",
  setSchedule: "Xếp sân và giờ",
  callMatch: "Gọi trận",
  setScore: "Nhập tỉ số",
  setWalkover: "Xử thắng",
  clearResult: "Xoá kết quả trận",
  resolveTie: "Xếp hạng đội đồng hạng",
  upsertSponsor: "Thêm hoặc sửa nhà tài trợ",
  removeSponsor: "Xoá nhà tài trợ",
  upsertIncome: "Thêm hoặc sửa khoản thu",
  removeIncome: "Xoá khoản thu",
  upsertExpense: "Thêm hoặc sửa khoản chi",
  removeExpense: "Xoá khoản chi",
  setFinancePublished: "Công bố hoặc ẩn thu chi",
};
const label = (type: string) =>
  type.startsWith("restore:")
    ? `Khôi phục phiên bản ${type.slice(8)}`
    : (LABELS[type] ?? type);

export function HistoryTab({ admin }: { admin: ReadyAdmin }) {
  const { view, query, restore, busy } = admin;
  const [entries, setEntries] = useState<Entry[] | null>(null);

  // Re-read whenever the version moves, so a restore shows up as a new row.
  useEffect(() => {
    let alive = true;
    void query<{ entries: Entry[] }>("/api/admin/history").then((res) => {
      if (alive && res) setEntries(res.entries);
    });
    return () => {
      alive = false;
    };
  }, [query, view.version]);

  if (!entries) return <p role="status">Đang tải lịch sử…</p>;
  return (
    <Card title="Lịch sử thay đổi">
      <p>
        Khôi phục không xoá gì: nó tạo một phiên bản mới giống hệt phiên bản
        được chọn.
      </p>
      <ul className="pick-list">
        {entries.map((e) => (
          <li key={e.version} data-version={e.version} className="admin-bar">
            <span>
              <strong>Phiên bản {e.version}</strong> · {label(e.commandType)}
              <br />
              <small>
                {formatDate(e.at)} · {e.actorEmail}
              </small>
            </span>
            <span className="spacer" />
            {e.version !== view.version && (
              <ConfirmButton
                label="Khôi phục"
                disabled={busy}
                onConfirm={() => restore(e.version)}
              />
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
```

- [ ] **Step 5: Register the three tabs**

In `frontend/src/features/admin/tabs.tsx`, import `FinanceTab`, `InfoTab` and `HistoryTab`, and make `TABS`:

```tsx
export const TABS: AdminTab[] = [
  { id: "tran-dau", label: "Trận", render: (a) => <MatchesTab admin={a} /> },
  { id: "doi", label: "Đội", render: (a) => <TeamsTab admin={a} /> },
  { id: "vdv", label: "VĐV", render: (a) => <AthletesTab admin={a} /> },
  { id: "thu-chi", label: "Thu chi", render: (a) => <FinanceTab admin={a} /> },
  { id: "giai", label: "Giải", render: (a) => <InfoTab admin={a} /> },
  { id: "lich-su", label: "Lịch sử", render: (a) => <HistoryTab admin={a} /> },
];
```

- [ ] **Step 6: Run the whole quality gate**

```bash
pnpm lint
pnpm typecheck
pnpm --filter @webminton/frontend typecheck
pnpm test
pnpm validate
pnpm build
pnpm test:e2e
terraform fmt -check -recursive infra
terraform -chdir=infra validate
```

Expected: every command succeeds. This is the same list `quality.yml` runs.

- [ ] **Step 7: Check all six tabs at three widths**

Serve the build (`node --import tsx scripts/serve-static.ts`), sign in, and at 390, 768 and 1280px open each tab. Confirm: no sideways scroll; at 390 and 768 the tab bar is fixed to the bottom and scrolls within itself if the six labels do not fit; at 1280 the tab strip is at the top and `Trận` and `VĐV` show two panes.

- [ ] **Step 8: Commit**

```bash
git add frontend/src tests/e2e/admin.spec.ts
git commit -m "feat(admin): edit finance and tournament info, and restore from history

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 15: Documentation

**Files:**
- Modify: `CLAUDE.md`, `infra/README.md`, `docs/runbooks/bootstrap.md`, `docs/runbooks/operations.md`, `docs/runbooks/rollback.md`

**Interfaces:**
- Consumes: everything above. No code changes.
- Produces: docs that describe the shipped system. Runbooks are Vietnamese, `CLAUDE.md` and `infra/README.md` English, as they are today.

- [ ] **Step 1: `CLAUDE.md`**

Make these replacements.

Under `## Project`, replace the paragraph beginning "There is no backend, no database and no admin UI." with:

```markdown
The public page is static. The organiser edits the tournament at `/quan-tri`
(Google sign-in, allow-listed emails); a Lambda stores it in DynamoDB and
rewrites `tournament.json` in the site bucket after every save. The public
page reads only that file and re-reads it every 20 seconds.
```

In `## Commands`, add after the `pnpm draw` line:

```
pnpm seed [--force]   # load frontend/public/tournament.json into the table
```

and add below the block:

```markdown
Admin development has no `next dev` API: run `pnpm build`, then
`node --import tsx scripts/serve-static.ts` and open
`http://127.0.0.1:3100/quan-tri/`. That server runs the real router over an
in-memory store and offers a "Đăng nhập thử" button instead of Google.
```

Replace the section `### Two data files, one of them deployed` (heading and body) with:

```markdown
### One source of truth, one published projection

- **DynamoDB** (`webminton-tournament`) holds the tournament: one `CURRENT`
  item with a version number, and one `V#…` item per version, which is the
  history and the undo.
- **`tournament.json` in the site bucket** is a projection the Lambda writes
  after each save. It is the only thing the public page fetches.
- **`frontend/public/tournament.json`** in the repo is the seed and the local
  fixture. `scripts/deploy.sh` must never upload it — that would replace live
  scores — and `scripts/test/deploy.test.ts` asserts it does not.
- **`.private/roster.json`** is optional input to `pnpm seed`; after seeding,
  private fields live in the table.

Private fields (`phone`, `note`, `skillBand`) are stored beside the document,
keyed by athlete id, never inside it. The snapshot is produced only by
`renderSnapshot`, which parses through `PublicTournamentSchema` — a
`z.strictObject` — so a private field makes the publish throw rather than
leak. `tests/e2e/landing.spec.ts` and `tests/e2e/admin.spec.ts` both assert
the served JSON carries none.

### Every edit is a command

`packages/domain/src/commands.ts::applyCommand(state, command, actor, now)` is
pure and is the only way state changes. It ends in `finalize`, which re-parses
the document and runs `deriveTournament`, so the table can never hold
something the page cannot render. The router adds three things around it: the
allow-list check, an optimistic version check (`409` on a stale screen), and
request-id replay so a double tap applies once.
```

In `### Derived state is never stored`, append:

```markdown
`applyCommand` nulls every `winnerTeamId` before saving for the same reason.
```

In `## Layout`, add after the `packages/domain` bullet:

```markdown
- `backend` — the Lambda: `router.ts` (transport-neutral `route(req, deps)`),
  `store.ts` (`TournamentStore` + `MemoryStore`), `dynamo-store.ts`,
  `publish.ts`, `auth.ts`, `errors.ts` (code → status + Vietnamese message),
  `handler.ts`. Bundled by `backend/build.mjs` to `backend/dist/index.mjs`.
  Real AWS clients are constructed only in `aws.ts`.
```

and change the `frontend` bullet's "**no server runtime**" sentence to end
"**no server runtime**; `/quan-tri` is a second static page whose tabs live in
`features/admin/` and whose styles are `src/styles/admin.css`." Change the
`infra` bullet to:

```markdown
- `infra` — one root Terraform configuration: the site bucket, CloudFront,
  ACM, Route53 (`main.tf`); the table, Lambda, its role and the HTTP API
  (`backend.tf`); Cognito with Google as the only identity provider
  (`auth.tf`). `infra/test/architecture.test.ts` asserts the invariants
  against the HCL text: admin routes behind the JWT authorizer, the Lambda
  able to write only `tournament.json`, PITR and deletion protection on the
  table, and no resource with a fixed monthly fee.
```

In `## Deployment`, replace "The build needs no Terraform output — there are no `NEXT_PUBLIC_*` values any more." with:

```markdown
`pnpm build` runs before Terraform because the Lambda zip is made from
`backend/dist`. The static build still needs no Terraform output: the admin
page fetches its Cognito domain and client id from `GET /api/config`.
```

and replace the final paragraph's last sentence ("That last one is what lets a content edit go live…") with:

```markdown
`/tournament.json` and `/api/*` are served with caching disabled, so an admin
save is live as soon as the Lambda has written the file — no invalidation.
```

- [ ] **Step 2: `infra/README.md`**

Replace the first two paragraphs with:

```markdown
Terraform provisions a private, versioned, encrypted S3 bucket holding the
static export; CloudFront in front of it; a DNS-validated ACM certificate in
`us-east-1`; the Route53 alias records for `giaicaulong2026.nghuy.link`; a
DynamoDB table holding the tournament and its history; one Lambda behind an
HTTP API, reached through CloudFront at `/api/*`; and a Cognito user pool
whose only identity provider is Google.

There is one environment. Nothing here has a fixed monthly fee.

`terraform plan` and `apply` need `backend/dist/index.mjs`, so run
`pnpm --filter @webminton/backend build` (or `pnpm build`) first.
```

- [ ] **Step 3: `docs/runbooks/bootstrap.md`**

Insert a new section before `## 3. Apply` and renumber the later headings:

```markdown
## 3. Đăng nhập Google cho trang quản trị

1. Lấy trước địa chỉ redirect — nó chỉ phụ thuộc vào số tài khoản AWS:

   ```bash
   echo "https://webminton-$(aws sts get-caller-identity --query Account --output text).auth.ap-southeast-1.amazoncognito.com/oauth2/idpresponse"
   ```

2. Vào Google Cloud Console → **APIs & Services → Credentials → Create
   credentials → OAuth client ID**, loại **Web application**. Dán địa chỉ trên
   vào **Authorized redirect URIs**. Nếu được hỏi, cấu hình OAuth consent
   screen ở chế độ External và thêm email BTC làm test user.
3. Điền vào `infra/terraform.tfvars`:

   ```hcl
   google_client_id     = "….apps.googleusercontent.com"
   google_client_secret = "…"
   admin_emails         = ["email-btc@gmail.com"]
   ```

`admin_emails` là danh sách duy nhất quyết định ai được sửa giải. Thêm người:
sửa biến này rồi apply lại.
```

In the (now) `## 4. Apply` section, change the code block's first line to:

```bash
pnpm install && pnpm build                                 # tạo backend/dist cho Lambda
cp infra/terraform.tfvars.example infra/terraform.tfvars   # đặt tên bucket + Google
```

and add after that section:

```markdown
## 5. Nạp dữ liệu và mở quyền cho GitHub

```bash
pnpm seed                                    # nạp frontend/public/tournament.json vào bảng
terraform -chdir=infra/bootstrap apply       # cấp thêm quyền Lambda/DynamoDB/API/Cognito cho role deploy
```

`pnpm seed` từ chối chạy nếu bảng đã có dữ liệu. `--force` ghi đè bằng nội
dung trong repo; bản cũ vẫn còn trong mục Lịch sử.
```

Replace the `## Biến repo cần có` section's last sentence ("Không còn biến Cognito nào…") with:

```markdown
Thêm cho trang quản trị: biến `GOOGLE_CLIENT_ID` và `ADMIN_EMAILS` (dạng JSON,
ví dụ `["email-btc@gmail.com"]`), và secret `GOOGLE_CLIENT_SECRET`. Bản build
vẫn không đọc output Terraform — trang quản trị lấy cấu hình đăng nhập từ
`/api/config`.
```

- [ ] **Step 4: `docs/runbooks/operations.md`**

Replace everything from `## Sửa thông tin giải` up to (not including) `## Chất lượng` with:

```markdown
## Điều hành giải

Mở `https://giaicaulong2026.nghuy.link/quan-tri/` trên điện thoại hoặc máy
tính, đăng nhập bằng Google. Mọi thay đổi lưu vào cơ sở dữ liệu và hiện trên
trang giải trong vòng 20 giây — người xem không cần tải lại.

| Việc | Mục |
| --- | --- |
| Nhập, sửa tỉ số; xử thắng; gọi trận | Trận |
| Đội hình từng trận, công bố đội hình; sân và giờ | Trận |
| Phân định đội đồng hạng | Trận (hiện ra khi vòng loại xong và có đội bằng nhau) |
| Bốc thăm, đổi tên đội, đội trưởng, chuyển VĐV | Đội |
| Thêm, sửa, xoá VĐV; trình độ, số điện thoại, ghi chú | VĐV |
| Nhà tài trợ, khoản thu, khoản chi, công bố thu chi | Thu chi |
| Ngày giờ, địa điểm, lệ phí, link đăng ký, sân | Giải |
| Xem ai sửa gì, khôi phục phiên bản cũ | Lịch sử |

Đội hình chưa công bố không hiện trên trang giải. Sáu trận tranh hạng tự xuất
hiện khi 18 trận vòng loại có kết quả và không còn đội đồng hạng.

### Các thông báo hay gặp

- **“Dữ liệu vừa thay đổi — kiểm tra rồi lưu lại.”** Một máy khác vừa lưu.
  Màn hình đã tải lại số liệu mới; xem lại rồi nhập lại nếu vẫn cần.
- **“Chưa công bố” ở đầu trang.** Đã lưu nhưng chưa ghi được ra trang giải.
  Bấm **Công bố lại**.
- **“Phiên đăng nhập đã hết hạn.”** Đăng nhập lại; thao tác đang dở được lưu
  tiếp tự động. Mỗi lần đăng nhập dùng được 12 giờ.
- **“Đã có trận tranh hạng được đánh…”** Sửa tỉ số vòng loại sẽ đổi cặp tranh
  hạng. Xoá kết quả các trận tranh hạng trước, rồi sửa.

## Khi trang quản trị không vào được

Trang giải vẫn hiện bản công bố gần nhất. Để cập nhật bằng máy tính:

```bash
# tải bản đang công bố về làm gốc
aws s3 cp "s3://$(terraform -chdir=infra output -raw site_bucket_name)/tournament.json" frontend/public/tournament.json
# sửa file bằng editor
pnpm validate
aws s3 cp frontend/public/tournament.json "s3://$(terraform -chdir=infra output -raw site_bucket_name)/tournament.json" \
  --cache-control "no-cache" --content-type "application/json; charset=utf-8"
```

Khi trang quản trị hoạt động lại, **nạp file đó vào cơ sở dữ liệu trước khi
sửa gì khác**, nếu không lần lưu kế tiếp sẽ ghi đè những gì vừa sửa tay:

```bash
pnpm seed --force
```

## Triển khai mã nguồn

`pnpm run deploy` (và workflow Deploy) **không** tải `tournament.json` lên —
file đó do cơ sở dữ liệu quản lý. Triển khai giữa giải không làm mất tỉ số.

## Thêm người quản trị

Thêm email Google vào `admin_emails` (file `infra/terraform.tfvars` và biến
`ADMIN_EMAILS` trên GitHub), rồi apply hoặc chạy workflow Deploy.
```

- [ ] **Step 5: `docs/runbooks/rollback.md`**

Add at the top, under the title:

```markdown
## Khôi phục dữ liệu giải

**Cách thường dùng:** mục **Lịch sử** trong trang quản trị → **Khôi phục** ở
phiên bản muốn quay về. Thao tác này tạo một phiên bản mới, không xoá gì.

**Khi bảng hỏng hoặc bị xoá nhầm:** bảng `webminton-tournament` bật
point-in-time recovery (35 ngày). Khôi phục sang bảng mới, kiểm tra, rồi đổi
tên bảng trong Terraform hoặc nạp lại:

```bash
aws dynamodb restore-table-to-point-in-time \
  --source-table-name webminton-tournament \
  --target-table-name webminton-tournament-restore \
  --restore-date-time 2026-10-18T09:30:00+07:00
```

**Chỉ cần trang giải quay về bản cũ ngay:** bucket vẫn bật versioning, nên
các bản `tournament.json` trước đó còn nguyên — xem phần dưới. Sau đó chạy
`pnpm seed --force` với đúng bản đó để cơ sở dữ liệu khớp.
```

- [ ] **Step 6: Commit**

```bash
pnpm lint
git add CLAUDE.md infra/README.md docs/runbooks
git commit -m "docs: describe the admin backend, its runbooks and the fallback path

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 16: Go-live — organiser only

These steps create cloud resources, hold a secret and publish to the live site. They are for the organiser to run by hand, in this order. An agent executing this plan stops after Task 15 and reports that this checklist is ready.

- [ ] **1.** Create the Google OAuth client (`docs/runbooks/bootstrap.md` §3) and fill in `infra/terraform.tfvars`.
- [ ] **2.** `pnpm install && pnpm build`
- [ ] **3.** `terraform -chdir=infra plan` — read it. Expected: only additions (table, Lambda, role, log group, HTTP API pieces, Cognito pool/provider/domain/client) and one in-place change to the CloudFront distribution (new origin and `/api/*` behaviour). Nothing destroyed or replaced.
- [ ] **4.** `terraform -chdir=infra apply`. CloudFront takes 5–15 minutes to propagate.
- [ ] **5.** Confirm `terraform -chdir=infra output google_redirect_uri` matches the URI entered in Google.
- [ ] **6.** `pnpm seed` — loads the current `frontend/public/tournament.json` (14 athletes, no draw).
- [ ] **7.** `pnpm run deploy`, then `node --import tsx scripts/smoke-deployment.ts`.
- [ ] **8.** Open `https://giaicaulong2026.nghuy.link/quan-tri/` on a phone, sign in with Google, change the fee and change it back, and watch the public page follow.
- [ ] **9.** `terraform -chdir=infra/bootstrap apply`, then set GitHub environment `prod`: variables `GOOGLE_CLIENT_ID`, `ADMIN_EMAILS`; secret `GOOGLE_CLIENT_SECRET`.
- [ ] **10.** Merge `feat/admin-backend` to `main` and watch the Deploy workflow. If Terraform reports `AccessDenied` for an action, add that action to the matching statement in `infra/bootstrap/main.tf`, re-apply bootstrap and re-run — the role was written from the provider's documented calls, not from a live run.
- [ ] **11.** Before tournament day: enter skill bands for every athlete in `VĐV`, and decide the 8-women question — the draw refuses to run with fewer than 8 active men and 8 active women.
