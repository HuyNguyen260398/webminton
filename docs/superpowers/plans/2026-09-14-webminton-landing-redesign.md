# Webminton Single-Page Landing Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Webminton into a single static page that reproduces the three posters in `assets/poster_designs/`, driven by one locally-edited `tournament.json`, with no backend and Terraform reduced to site hosting plus `giaicaulong2026.nghuy.link`.

**Architecture:** A Next.js static export on S3 behind CloudFront. `frontend/public/tournament.json` ships with the app, is fetched and zod-parsed in the browser, and `packages/domain` derives standings and results client-side. Private athlete data lives in a gitignored `.private/roster.json` that only local scripts read. The Lambda, API Gateway, Cognito and the data bucket are deleted.

**Tech Stack:** Node 24, pnpm 10.32.1, TypeScript 7, Next.js 16 App Router (`output: "export"`), React 19, zod, vitest, Playwright, Terraform ~1.10 with AWS provider ~6.0.

**Spec:** `docs/superpowers/specs/2026-09-14-webminton-landing-redesign-design.md`

## Global Constraints

- All user-facing copy, error messages and route segments are **Vietnamese**. Throw bare error codes (`throw new Error("MISSING_SKILL")`) from domain code.
- Node 24 (`.nvmrc`), pnpm 10.32.1, ESM everywhere (`"type": "module"`).
- `packages/domain` stays **pure and dependency-free except zod**, and must now also be **browser-safe** — no `node:*` imports anywhere in `packages/domain/src`.
- The deployed `frontend/public/tournament.json` must contain **no** `phone`, `note`, `skillBand` or `feePayments` key.
- Fixed format, encoded as `z.literal` in the schema: exactly 4 teams, 3 categories (`mens_doubles`, `womens_doubles`, `mixed_doubles`), 18 group + 6 placement = **24** matches.
- Scoring: 21 points, 2 clear, cap 25. A walkover is 21–0.
- Ranking order: `pointsFor`, `wins`, `difference`, then a manual tiebreak bound to `resultsHash`.
- Domain size limit: the public JSON stays under 1 MB.
- Production hostname: `giaicaulong2026.nghuy.link`. Hosted zone `nghuy.link` is in the same AWS account.
- `pnpm lint` covers only `packages data *.json *.yaml`. `backend/`, `frontend/` and `scripts/` are outside it — **do not reformat** the hand-minified files there as a drive-by.
- Commit messages end with:
  ```
  Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01Ngui52jdFtBsdruwy1Awcc
  ```

---

## File Structure

**Created**

| Path | Responsibility |
| --- | --- |
| `packages/domain/src/hash.ts` | Pure-TS SHA-256. Replaces `node:crypto` so the domain runs in a browser. |
| `packages/domain/src/roster.ts` | `PrivateRosterSchema` — the gitignored athlete file with phone/skillBand. |
| `packages/domain/test/hash.test.ts` | SHA-256 vectors proving byte-identical output to `node:crypto`. |
| `packages/domain/test/roster.test.ts` | Private roster schema tests. |
| `frontend/public/tournament.json` | The one public data file. |
| `frontend/src/features/landing/PosterOne.tsx` | Poster 1 — hero, fact card, fee strip, photos, CTA. |
| `frontend/src/features/landing/PosterTwo.tsx` | Poster 2 — thể lệ, six rule cards. |
| `frontend/src/features/landing/PosterThree.tsx` | Poster 3 — nhà tài trợ, tiers, QR, quỹ giải. |
| `frontend/src/features/landing/LiveSections.tsx` | The five conditional data sections. |
| `frontend/src/features/landing/primitives.tsx` | `Slab`, `Card`, `Pill`, `NumberDisc`, `PhotoFrame`. |
| `frontend/src/styles/poster.css` | The poster design system. |
| `scripts/validate-tournament.ts` | `pnpm validate`. |
| `scripts/draw-teams.ts` | `pnpm draw`. |
| `scripts/serve-static.ts` | Static file server for Playwright. |
| `scripts/optimize-assets.ts` | One-shot photo resizer. |
| `infra/main.tf`, `variables.tf`, `outputs.tf`, `terraform.tfvars.example` | The single root Terraform configuration. |

**Modified**

`packages/domain/src/{schema,standings,draw,derive,advancement,schedule,finance}.ts` · `frontend/src/lib/use-tournament.ts` · `frontend/src/app/{page.tsx,layout.tsx,globals.css}` · `frontend/next.config.ts` · `package.json` · `vitest.config.ts` · `playwright.config.ts` · `tsconfig.json` · `infra/{versions.tf,test/architecture.test.ts}` · `.github/workflows/{quality,deploy}.yml` · `CLAUDE.md` · `README.md` · `docs/runbooks/*`

**Deleted**

`backend/` · `packages/domain/src/commands.ts` + its test · `frontend/src/lib/{auth,use-admin,admin-api,api}.ts` · `frontend/src/app/{quan-tri,van-dong-vien,boc-tham,lich-thi-dau,thu-chi}/` · `frontend/src/features/admin/` · `features/finance/FinanceEditor.tsx` · `features/matches/MatchEditor.tsx` · `features/draw/DrawWheel.tsx` · `scripts/{serve-local-api,seed-tournament,roster-cli,roster-config,make-local-data,serve-preview}.ts` + `scripts/test/roster-config.test.ts` · `infra/{envs,modules}/` · `data/tournament.seed.json` · `docs/runbooks/roster-config.md` · `tests/e2e/{athletes-admin,draw,finance,full-tournament}.spec.ts`

---

### Task 1: Browser-safe SHA-256 in the domain

`standings.ts` and `draw.ts` both `import { createHash } from "node:crypto"`. Deriving in the browser is impossible until that is gone. The replacement must produce **byte-identical** digests, or every `sourceResultsHash` in existing data silently stops matching and manual tiebreaks stop applying.

**Files:**
- Create: `packages/domain/src/hash.ts`
- Create: `packages/domain/test/hash.test.ts`
- Modify: `packages/domain/src/standings.ts:2`, `packages/domain/src/draw.ts:2,17`

**Interfaces:**
- Consumes: nothing.
- Produces: `sha256Hex(input: string): string` — lowercase 64-char hex, identical to `createHash("sha256").update(input).digest("hex")`. `sha256Uint32LE(input: string): number` — identical to `createHash("sha256").update(input).digest().readUInt32LE()`.

- [ ] **Step 1: Write the failing test**

`packages/domain/test/hash.test.ts`:

```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/domain/test/hash.test.ts`
Expected: FAIL — `Failed to resolve import "../src/hash"`.

- [ ] **Step 3: Write the implementation**

`packages/domain/src/hash.ts`:

```ts
// Pure TypeScript SHA-256. The domain runs in the browser now, so `node:crypto`
// is unavailable; digests must stay byte-identical to it because tieDecisions
// bind a manual tiebreak to a stored resultsHash.
const K = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n));

function digest(input: string): Uint32Array {
  const bytes = new TextEncoder().encode(input);
  const total = Math.ceil((bytes.length + 9) / 64) * 64;
  const block = new Uint8Array(total);
  block.set(bytes);
  block[bytes.length] = 0x80;
  const view = new DataView(block.buffer);
  const bits = bytes.length * 8;
  view.setUint32(total - 8, Math.floor(bits / 4294967296));
  view.setUint32(total - 4, bits >>> 0);

  const h = new Uint32Array([
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c,
    0x1f83d9ab, 0x5be0cd19,
  ]);
  const w = new Uint32Array(64);

  for (let off = 0; off < total; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4);
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15];
      const b = w[i - 2];
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3);
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (hh + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      hh = g;
      g = f;
      f = e;
      e = (d + t1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (t1 + t2) >>> 0;
    }
    const next = [a, b, c, d, e, f, g, hh];
    for (let i = 0; i < 8; i++) h[i] = (h[i] + next[i]) >>> 0;
  }
  return h;
}

export function sha256Hex(input: string): string {
  return Array.from(digest(input), (x) => x.toString(16).padStart(8, "0")).join(
    "",
  );
}

/** The first four digest bytes read little-endian — the PRNG seed in draw.ts. */
export function sha256Uint32LE(input: string): number {
  const x = digest(input)[0];
  return (
    (((x & 0xff) << 24) |
      ((x & 0xff00) << 8) |
      ((x >>> 8) & 0xff00) |
      (x >>> 24)) >>>
    0
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/domain/test/hash.test.ts`
Expected: PASS, 17 assertions.

- [ ] **Step 5: Replace `node:crypto` in `standings.ts`**

In `packages/domain/src/standings.ts`, delete `import { createHash } from "node:crypto";`, add `import { sha256Hex } from "./hash";`, and rewrite `resultsHash` to:

```ts
export function resultsHash(t: TournamentDocument): string {
  return sha256Hex(
    JSON.stringify(
      t.matches
        .filter((m) => m.phase === "group")
        .map((m) => ({ id: m.id, score: m.score, status: m.status }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ),
  );
}
```

- [ ] **Step 6: Replace `node:crypto` in `draw.ts`**

In `packages/domain/src/draw.ts`, delete `import { createHash } from "node:crypto";`, add `import { sha256Hex, sha256Uint32LE } from "./hash";`, and rewrite the two uses:

```ts
export function rosterHash(t: TournamentDocument) {
  return sha256Hex(
    JSON.stringify(
      t.athletes
        .filter((a) => a.active)
        .map((a) => ({ id: a.id, gender: a.gender, skillBand: a.skillBand }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ),
  );
}

function random(seed: string) {
  let n = sha256Uint32LE(seed);
  return () => {
    // …unchanged…
  };
}
```

- [ ] **Step 7: Verify no `node:` imports remain and all domain tests still pass**

Run: `grep -rn "node:" packages/domain/src/ ; pnpm vitest run packages/domain`
Expected: the grep prints **nothing**; every existing domain test passes unchanged. Passing `draw.test.ts` and `standings.test.ts` is the proof the digests are identical — they assert against hashes produced by the old `node:crypto` implementation.

- [ ] **Step 8: Commit**

```bash
git add packages/domain/src/hash.ts packages/domain/test/hash.test.ts \
        packages/domain/src/standings.ts packages/domain/src/draw.ts
git commit -m "$(cat <<'EOF'
refactor(domain): replace node:crypto with a pure-TS sha256

The domain now runs in the browser, where node:crypto is unavailable.
Digests are byte-identical, so stored resultsHash values keep matching
and manual tiebreaks keep applying.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ngui52jdFtBsdruwy1Awcc
EOF
)"
```

---

### Task 2: Demolition — remove the backend, admin UI and obsolete scripts

Nothing is built here; this clears the ground so later tasks touch a small repo. After this task the app still has one working route that fetches a now-nonexistent API — that is expected and fixed in Task 5.

**Files:**
- Delete: `backend/` · `packages/domain/src/commands.ts` · `packages/domain/test/commands.test.ts` (if present) · `frontend/src/lib/{auth,use-admin,admin-api}.ts` · `frontend/src/app/{quan-tri,van-dong-vien,boc-tham,lich-thi-dau,thu-chi}/` · `frontend/src/features/admin/` · `frontend/src/features/finance/FinanceEditor.tsx` · `frontend/src/features/matches/MatchEditor.tsx` · `frontend/src/features/draw/DrawWheel.tsx` · `scripts/{serve-local-api,seed-tournament,roster-cli,roster-config,make-local-data}.ts` · `scripts/test/roster-config.test.ts` · `tests/e2e/{athletes-admin,draw,finance,full-tournament}.spec.ts` · `docs/runbooks/roster-config.md`
- Modify: `pnpm-workspace.yaml` · `package.json` · `tsconfig.json` · `vitest.config.ts` · `frontend/next.config.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a repo where `pnpm typecheck` and `pnpm test` pass with only `packages/domain`, `scripts` and `infra` in scope.

- [ ] **Step 1: Delete the backend and everything that depended on it**

```bash
git rm -r backend \
  packages/domain/src/commands.ts \
  frontend/src/lib/auth.ts frontend/src/lib/use-admin.ts frontend/src/lib/admin-api.ts \
  frontend/src/app/quan-tri frontend/src/app/van-dong-vien \
  frontend/src/app/boc-tham frontend/src/app/lich-thi-dau frontend/src/app/thu-chi \
  frontend/src/features/admin \
  frontend/src/features/finance/FinanceEditor.tsx \
  frontend/src/features/matches/MatchEditor.tsx \
  frontend/src/features/draw/DrawWheel.tsx \
  scripts/serve-local-api.ts scripts/seed-tournament.ts scripts/roster-cli.ts \
  scripts/roster-config.ts scripts/make-local-data.ts scripts/test/roster-config.test.ts \
  tests/e2e/athletes-admin.spec.ts tests/e2e/draw.spec.ts \
  tests/e2e/finance.spec.ts tests/e2e/full-tournament.spec.ts \
  docs/runbooks/roster-config.md
git rm -f packages/domain/test/commands.test.ts 2>/dev/null || true
```

- [ ] **Step 2: Drop `backend` from the workspace**

`pnpm-workspace.yaml` becomes:

```yaml
packages:
  - packages/*
  - frontend
```

- [ ] **Step 3: Prune the root `package.json` scripts**

Replace the `scripts` block with (the new `draw`/`validate`/`deploy` entries land in Tasks 6, 7 and 16):

```json
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json",
    "lint": "prettier --check packages data *.json *.yaml",
    "format": "prettier --write packages data *.json *.yaml",
    "build": "pnpm -r build",
    "test:e2e": "playwright test",
    "dev": "pnpm --filter @webminton/frontend dev"
  },
```

- [ ] **Step 4: Prune `tsconfig.json` and `vitest.config.ts`**

`tsconfig.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "include": ["packages/domain/src", "packages/domain/test", "scripts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
export default defineConfig({
  test: {
    include: [
      "packages/**/test/**/*.test.ts",
      "scripts/test/**/*.test.ts",
      "infra/test/**/*.test.ts",
    ],
    exclude: ["**/node_modules/**"],
  },
});
```

- [ ] **Step 5: Remove the dev API proxy from `frontend/next.config.ts`**

The whole file becomes:

```ts
export default {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
};
```

- [ ] **Step 6: Verify**

Run: `pnpm install && pnpm typecheck && pnpm test`
Expected: install prunes the `backend` workspace; typecheck clean; every remaining domain and infra test passes.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
refactor: remove the backend, admin UI and API-backed scripts

The tournament is now a local JSON file, so the Lambda, its router,
auth, commands, projections and storage layers have no purpose, and
neither do the admin pages or the roster CLI that drove them.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ngui52jdFtBsdruwy1Awcc
EOF
)"
```

---

### Task 3: Split the schema into a public document and a private roster

**Files:**
- Modify: `packages/domain/src/schema.ts`
- Create: `packages/domain/src/roster.ts`
- Create: `packages/domain/test/roster.test.ts`
- Modify: `packages/domain/test/schema.test.ts`
- Modify: `packages/domain/src/{draw,derive,finance}.ts`
- Modify: `packages/domain/test/draw.test.ts`
- Modify: `packages/domain/src/testing/fixtures.ts`

**Interfaces:**
- Consumes: `sha256Hex` from Task 1.
- Produces:
  - `PublicTournamentSchema` (a `z.strictObject`) and `type TournamentDocument = z.infer<typeof PublicTournamentSchema>`. The name `TournamentDocument` is kept so `derive`, `standings`, `advancement` and `schedule` need no signature changes.
  - `PrivateRosterSchema`, `type PrivateRoster`, `type PrivateAthlete` from `./roster`.
  - `generateDraw(roster: PrivateRoster, teams: Team[], seed: string): DrawResult` where `DrawResult = { status: "confirmed"; algorithmVersion: "balanced-v1"; assignment: Record<string, string> }`.
  - `rosterHash(roster: PrivateRoster): string`.
  - `confirmDraw` is **deleted** — with no two-phase draft/confirm handshake there is nothing to guard against; `pnpm draw` writes the confirmed result in one step.

- [ ] **Step 1: Write the failing tests**

Add to `packages/domain/test/schema.test.ts`:

```ts
import { PublicTournamentSchema } from "../src/schema";
import { buildTournament } from "../src/testing/fixtures";

describe("PublicTournamentSchema", () => {
  it("rejects an athlete carrying a phone number", () => {
    const t = buildTournament();
    t.athletes.push({
      id: "a1",
      name: "Nguyễn Văn A",
      gender: "male",
      teamId: null,
      active: true,
      phone: "0900000000",
    } as never);
    expect(PublicTournamentSchema.safeParse(t).success).toBe(false);
  });

  it("rejects an athlete carrying a skill band", () => {
    const t = buildTournament();
    t.athletes.push({
      id: "a1",
      name: "Nguyễn Văn A",
      gender: "male",
      teamId: null,
      active: true,
      skillBand: 2,
    } as never);
    expect(PublicTournamentSchema.safeParse(t).success).toBe(false);
  });

  it("rejects a finance block carrying feePayments", () => {
    const t = buildTournament();
    (t.finance as Record<string, unknown>).feePayments = [];
    expect(PublicTournamentSchema.safeParse(t).success).toBe(false);
  });

  it("rejects a document carrying audit or requests", () => {
    for (const key of ["audit", "requests", "revision", "results"]) {
      const t = buildTournament() as Record<string, unknown>;
      t[key] = key === "revision" ? 1 : [];
      expect(PublicTournamentSchema.safeParse(t).success).toBe(false);
    }
  });

  it("accepts the fixture document", () => {
    expect(PublicTournamentSchema.safeParse(buildTournament()).success).toBe(
      true,
    );
  });
});
```

`packages/domain/test/roster.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { PrivateRosterSchema } from "../src/roster";

const athlete = {
  id: "a1",
  name: "Nguyễn Văn A",
  gender: "male",
  skillBand: 2,
  phone: "0900000000",
  note: "",
  active: true,
};

describe("PrivateRosterSchema", () => {
  it("accepts a roster with phone and skill band", () => {
    expect(
      PrivateRosterSchema.safeParse({ athletes: [athlete] }).success,
    ).toBe(true);
  });

  it("allows a null skill band and a null phone", () => {
    expect(
      PrivateRosterSchema.safeParse({
        athletes: [{ ...athlete, skillBand: null, phone: null }],
      }).success,
    ).toBe(true);
  });

  it("rejects a skill band outside 1..3", () => {
    expect(
      PrivateRosterSchema.safeParse({ athletes: [{ ...athlete, skillBand: 4 }] })
        .success,
    ).toBe(false);
  });

  it("rejects a teamId — team assignment belongs to the public file", () => {
    expect(
      PrivateRosterSchema.safeParse({
        athletes: [{ ...athlete, teamId: "t1" }],
      }).success,
    ).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run packages/domain/test/schema.test.ts packages/domain/test/roster.test.ts`
Expected: FAIL — `PublicTournamentSchema` and `../src/roster` do not exist.

- [ ] **Step 3: Create `packages/domain/src/roster.ts`**

```ts
import { z } from "zod";
import { Id } from "./schema";

const text = z.string().trim().min(1).max(500);

export const PrivateAthleteSchema = z.strictObject({
  id: Id,
  name: text,
  gender: z.enum(["male", "female"]),
  skillBand: z.union([z.literal(1), z.literal(2), z.literal(3)]).nullable(),
  phone: z.string().max(30).nullable(),
  note: z.string().max(2000),
  active: z.boolean(),
});

export const PrivateRosterSchema = z.strictObject({
  athletes: z.array(PrivateAthleteSchema),
});

export type PrivateAthlete = z.infer<typeof PrivateAthleteSchema>;
export type PrivateRoster = z.infer<typeof PrivateRosterSchema>;
```

- [ ] **Step 4: Trim `packages/domain/src/schema.ts`**

Apply exactly these changes, leaving everything else as it is:

1. `AthleteSchema` loses `skillBand`, `phone` and `note`:
   ```ts
   export const AthleteSchema = z.strictObject({
     id: Id,
     name: text,
     gender: z.enum(["male", "female"]),
     teamId: Id.nullable(),
     active: z.boolean(),
   });
   ```
2. Delete `PaymentSchema` and `StandingSchema` — `StandingSchema` moves into a local type in `standings.ts` (see Step 5).
3. Widen `InfoSchema.qrAssetPath` to `z.string().regex(/^\/[a-zA-Z0-9/._-]+$/).nullable()`.
4. Rename `TournamentSchema` → `PublicTournamentSchema` and remove the `revision`, `results`, `audit` and `requests` properties entirely.
5. In `draw`, remove `seed` and `rosterHash`; `status` becomes `z.enum(["not_started", "confirmed"])`.
6. In `finance`, remove `feePayments`.
7. Update the exported types at the bottom of the file:
   ```ts
   export type TournamentDocument = z.infer<typeof PublicTournamentSchema>;
   export type Athlete = z.infer<typeof AthleteSchema>;
   export type Team = z.infer<typeof TeamSchema>;
   export type Match = z.infer<typeof MatchSchema>;
   export type Category = z.infer<typeof CategorySchema>;
   ```
   Keep any other existing type exports that still resolve. If a `TournamentSchema` alias is referenced elsewhere, do **not** add a back-compat alias — fix the caller.

- [ ] **Step 5: Move `Standing` into `standings.ts` and make `derive` return results separately**

`derive.ts` no longer mutates a `results` field on the document, because there is no longer one. Change its signature and return shape:

```ts
import type { TournamentDocument, Category } from "./schema";
import { isFinalScore } from "./score";
import { calculateStandings, type Standing } from "./standings";

export interface DerivedResults {
  matches: TournamentDocument["matches"];
  standings: Standing[];
  champion: string | null;
  runnerUp: string | null;
  third: string | null;
  consolation: string | null;
  finalized: boolean;
  categoryWinners: Partial<Record<Category, string[]>>;
}

export function deriveTournament(input: TournamentDocument): DerivedResults;
```

The body is the existing one with three edits: `const t = structuredClone(input)` stays; every `t.results.X = …` becomes a local variable; `t.results.finalized && …` loses its first conjunct and becomes `matches.length === 24 && matches.every((m) => m.winnerTeamId !== null)`; and the function returns `{ matches: t.matches, standings, champion, runnerUp, third, consolation, finalized, categoryWinners }`.

In `standings.ts`, add:

```ts
export interface Standing {
  teamId: string;
  played: number;
  pointsFor: number;
  pointsAgainst: number;
  wins: number;
  difference: number;
  rank: number | null;
}
```

and change `calculateStandings`' return type to `Standing[]`.

- [ ] **Step 6: Refactor `draw.ts` onto the private roster**

```ts
import type { Team } from "./schema";
import type { PrivateAthlete, PrivateRoster } from "./roster";
import { sha256Hex, sha256Uint32LE } from "./hash";

export interface DrawResult {
  status: "confirmed";
  algorithmVersion: "balanced-v1";
  assignment: Record<string, string>;
}

export function rosterHash(roster: PrivateRoster): string {
  return sha256Hex(
    JSON.stringify(
      roster.athletes
        .filter((a) => a.active)
        .map((a) => ({ id: a.id, gender: a.gender, skillBand: a.skillBand }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ),
  );
}

export function generateDraw(
  roster: PrivateRoster,
  teams: Team[],
  seed: string,
): DrawResult {
  const athletes = roster.athletes
    .filter((a) => a.active)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (athletes.some((a) => a.skillBand === null))
    throw new Error("MISSING_SKILL");
  if (
    ["male", "female"].some(
      (g) => athletes.filter((a) => a.gender === g).length < 8,
    )
  )
    throw new Error("INSUFFICIENT_ROSTER");
  // …the existing 100-attempt balancing loop, with `t.teams` → `teams`,
  //    `Athlete[]` → `PrivateAthlete[]`, and the DRAW_LOCKED guard removed
  //    (the script checks the public file for that instead)…
  //  On success return:
  //    { status: "confirmed", algorithmVersion: "balanced-v1", assignment }
  throw new Error("DRAW_NOT_FOUND");
}
```

Delete `confirmDraw` entirely.

- [ ] **Step 7: Update `finance.ts`**

Delete the `fees` constant, and remove it from the `receivedVnd` and `pledgedVnd` sums:

```ts
const receivedVnd = sum([
  ...t.finance.income.filter((x) => x.received).map((x) => x.amountVnd),
  ...t.sponsorships.filter((x) => x.received).map((x) => x.amountVnd),
]);
// …
const pledgedVnd = sum([
  ...t.finance.income.map((x) => x.amountVnd),
  ...t.sponsorships.map((x) => x.amountVnd),
]);
```

- [ ] **Step 8: Update `fixtures.ts` and `draw.test.ts`**

`src/testing/fixtures.ts` builds documents from `data/tournament.seed.json`; inline the seed as a literal object in the fixture instead, since `data/tournament.seed.json` is deleted in Task 4. Export two builders:

```ts
export function buildTournament(): TournamentDocument;
export function buildRoster(count = 24): PrivateRoster;
```

`buildRoster` generates `count` athletes alternating gender with skill bands cycling 1,2,3 — enough for the ≥8-per-gender rule at the default.

In `draw.test.ts`, replace every `generateDraw(t, seed)` with `generateDraw(roster, t.teams, seed)`, every `rosterHash(t)` with `rosterHash(roster)`, and delete the `confirmDraw` and `DRAW_LOCKED` cases. Keep the balance assertions (gender spread, skill spread, team-size spread ≤ 1) and the `MISSING_SKILL` / `INSUFFICIENT_ROSTER` / `DRAW_NOT_FOUND` cases — they are the point of the algorithm.

- [ ] **Step 9: Run the full domain suite**

Run: `pnpm vitest run packages/domain && pnpm typecheck`
Expected: PASS. Fix any `advancement.ts` or `schedule.ts` compile errors caused by the `results` field disappearing — `advancement.ts::seedPlacement` should now call `deriveTournament(t).standings` rather than reading `t.results.standings`.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(domain): split the schema into a public document and a private roster

Phone numbers, notes and skill bands move to a gitignored roster file
that only local scripts read. The public document drops feePayments,
audit, requests, revision and the stored results, which are now derived
on every load instead.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ngui52jdFtBsdruwy1Awcc
EOF
)"
```

---

### Task 4: Create the data files

**Files:**
- Create: `frontend/public/tournament.json`
- Create: `.private/roster.example.json`
- Delete: `data/tournament.seed.json`, `.private/local-tournament.json`, `.private/roster-smoke.json`
- Modify: `.gitignore`, `package.json` (`lint`/`format` globs)

**Interfaces:**
- Consumes: `PublicTournamentSchema`, `PrivateRosterSchema` from Task 3.
- Produces: `frontend/public/tournament.json` — the file every later task reads.

- [ ] **Step 1: Write `frontend/public/tournament.json`**

Derived from the old seed, minus every removed field. Athletes and matches start empty, so the shipped site is purely the posters.

```json
{
  "schemaVersion": 1,
  "id": "noi-bo-2026",
  "updatedAt": "2026-09-14T00:00:00+07:00",
  "info": {
    "name": "Giải cầu lông nội bộ 2026",
    "clubName": "Hội lông thủ CN1416",
    "slogan": "Đánh hết sức · Thua hết hồn · Nhậu hết mình",
    "location": "Sân cầu lông Tấn Phúc",
    "startsAt": null,
    "dateLabel": "Cuối tháng 10.2026 — ngày cụ thể chốt sau khi đủ quân",
    "registrationDeadline": null,
    "timezone": "Asia/Ho_Chi_Minh",
    "feeVnd": null,
    "contactName": null,
    "contactPhone": null,
    "zaloUrl": null,
    "qrAssetPath": "/qr/momo.jpg",
    "qrPublished": true
  },
  "rules": {
    "teamCount": 4,
    "categories": ["mens_doubles", "womens_doubles", "mixed_doubles"],
    "setTarget": 21,
    "cap": 25,
    "changeEndsAt": 11,
    "minLead": 2,
    "ranking": ["pointsFor", "wins", "difference", "manualHeadToHead"],
    "placementWins": 2,
    "lateMinutes": 10,
    "walkoverScore": { "winner": 21, "loser": 0 }
  },
  "athletes": [],
  "teams": [
    { "id": "t1", "name": "Đội 1", "color": "#e63d27", "captainId": null },
    { "id": "t2", "name": "Đội 2", "color": "#ffd644", "captainId": null },
    { "id": "t3", "name": "Đội 3", "color": "#147f48", "captainId": null },
    { "id": "t4", "name": "Đội 4", "color": "#17150f", "captainId": null }
  ],
  "matches": [],
  "courts": [
    { "id": "c1", "name": "Sân 1" },
    { "id": "c2", "name": "Sân 2" }
  ],
  "draw": {
    "status": "not_started",
    "algorithmVersion": "balanced-v1",
    "assignment": {}
  },
  "tieDecisions": [],
  "sponsorships": [],
  "finance": {
    "published": false,
    "income": [
      {
        "id": "organizer",
        "label": "Ban tổ chức đóng góp",
        "amountVnd": 1000000,
        "received": false
      },
      {
        "id": "club-fund",
        "label": "Admin trích quỹ tháng của hội",
        "amountVnd": 0,
        "received": false
      }
    ],
    "expenses": [
      { "id": "court", "label": "Thuê sân", "quantity": 0, "unitPriceVnd": 0, "paid": false, "note": "" },
      { "id": "shuttles", "label": "Cầu thi đấu", "quantity": 0, "unitPriceVnd": 0, "paid": false, "note": "" },
      { "id": "medals", "label": "Huy chương", "quantity": 0, "unitPriceVnd": 0, "paid": false, "note": "" },
      { "id": "trophies", "label": "Cúp / kỷ niệm chương", "quantity": 0, "unitPriceVnd": 0, "paid": false, "note": "" },
      { "id": "water", "label": "Nước uống", "quantity": 0, "unitPriceVnd": 0, "paid": false, "note": "" },
      { "id": "party", "label": "Tiệc sau giải", "quantity": 0, "unitPriceVnd": 0, "paid": false, "note": "" }
    ]
  }
}
```

- [ ] **Step 2: Write `.private/roster.example.json`**

This one **is** committed, as the template. The real `.private/roster.json` is not.

```json
{
  "athletes": [
    {
      "id": "a01",
      "name": "Nguyễn Văn A",
      "gender": "male",
      "skillBand": 1,
      "phone": "0900000000",
      "note": "",
      "active": true
    },
    {
      "id": "a02",
      "name": "Trần Thị B",
      "gender": "female",
      "skillBand": 2,
      "phone": null,
      "note": "",
      "active": true
    }
  ]
}
```

- [ ] **Step 3: Update `.gitignore`**

Ensure it contains, replacing any blanket `.private` entry:

```gitignore
.private/*
!.private/roster.example.json
```

- [ ] **Step 4: Remove the old data files and update the lint globs**

```bash
git rm -r data
git rm -f .private/local-tournament.json .private/roster-smoke.json 2>/dev/null || true
```

In `package.json`, `lint` and `format` lose the now-missing `data` directory and gain the public file:

```json
    "lint": "prettier --check packages frontend/public/tournament.json *.json *.yaml",
    "format": "prettier --write packages frontend/public/tournament.json *.json *.yaml",
```

- [ ] **Step 5: Verify the file parses against the schema**

Run:
```bash
node --import tsx -e "import('./packages/domain/src/schema.ts').then(async (m)=>{const fs=await import('node:fs/promises');const d=JSON.parse(await fs.readFile('frontend/public/tournament.json','utf8'));const r=m.PublicTournamentSchema.safeParse(d);if(!r.success){console.error(r.error.issues);process.exit(1)}console.log('ok')})"
```
Expected: `ok`.

- [ ] **Step 6: Confirm no private field leaked in**

Run: `grep -E '"(phone|skillBand|note|feePayments)"' frontend/public/tournament.json`
Expected: **no output**. (`note` appears on expenses, which is fine — if the grep matches only expense notes, that is expected; it must not match anything under `athletes` or `finance.feePayments`.)

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(data): ship tournament.json with the app

The tournament is one public JSON file under frontend/public, and
private athlete details live in a gitignored .private/roster.json for
which roster.example.json is the template.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ngui52jdFtBsdruwy1Awcc
EOF
)"
```

---

### Task 5: Load and derive the tournament in the browser

**Files:**
- Rewrite: `frontend/src/lib/use-tournament.ts`
- Delete: `frontend/src/lib/api.ts`
- Create: `frontend/test/use-tournament.test.ts`
- Modify: `vitest.config.ts` (add `frontend/test/**/*.test.ts`)

**Interfaces:**
- Consumes: `PublicTournamentSchema`, `deriveTournament`, `DerivedResults` from Tasks 1–3.
- Produces:
  ```ts
  export interface TournamentView {
    t: TournamentDocument;
    derived: DerivedResults;
  }
  export function useTournament(): {
    view: TournamentView | null;
    error: string | null;
    reload: () => void;
  };
  export function parseTournament(raw: unknown): TournamentView; // pure, testable
  ```
  Every later component takes `{ t, derived }`.

- [ ] **Step 1: Write the failing test**

`frontend/test/use-tournament.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { parseTournament } from "../src/lib/use-tournament";

const shipped = JSON.parse(
  readFileSync(new URL("../public/tournament.json", import.meta.url), "utf8"),
);

describe("parseTournament", () => {
  it("parses the shipped file and derives empty results", () => {
    const { t, derived } = parseTournament(shipped);
    expect(t.info.clubName).toBe("Hội lông thủ CN1416");
    expect(derived.standings).toHaveLength(4);
    expect(derived.champion).toBeNull();
    expect(derived.finalized).toBe(false);
  });

  it("throws INVALID_DOCUMENT on a malformed document", () => {
    expect(() => parseTournament({ nope: true })).toThrow("INVALID_DOCUMENT");
  });

  it("derives a winner from a completed match", () => {
    const doc = structuredClone(shipped);
    doc.matches = [
      {
        id: "m1",
        phase: "group",
        encounterId: "e1",
        category: "mens_doubles",
        order: 1,
        teamAId: "t1",
        teamBId: "t2",
        pairA: null,
        pairB: null,
        lineupPublished: false,
        courtId: null,
        startsAt: null,
        endsAt: null,
        status: "completed",
        score: { a: 21, b: 15 },
        winnerTeamId: null,
      },
    ];
    const { derived } = parseTournament(doc);
    expect(derived.matches[0].winnerTeamId).toBe("t1");
    expect(derived.standings.find((s) => s.teamId === "t1")?.pointsFor).toBe(21);
  });
});
```

- [ ] **Step 2: Add `frontend/test` to vitest and run to verify it fails**

In `vitest.config.ts`, add `"frontend/test/**/*.test.ts"` to `include`.

Run: `pnpm vitest run frontend/test/use-tournament.test.ts`
Expected: FAIL — `parseTournament` is not exported.

- [ ] **Step 3: Write the implementation**

`frontend/src/lib/use-tournament.ts`:

```ts
"use client";
import { useCallback, useEffect, useState } from "react";
import {
  PublicTournamentSchema,
  type TournamentDocument,
} from "../../../packages/domain/src/schema";
import {
  deriveTournament,
  type DerivedResults,
} from "../../../packages/domain/src/derive";

export interface TournamentView {
  t: TournamentDocument;
  derived: DerivedResults;
}

export function parseTournament(raw: unknown): TournamentView {
  const parsed = PublicTournamentSchema.safeParse(raw);
  if (!parsed.success) throw new Error("INVALID_DOCUMENT");
  return { t: parsed.data, derived: deriveTournament(parsed.data) };
}

const messages: Record<string, string> = {
  INVALID_DOCUMENT: "Dữ liệu giải không hợp lệ.",
  INVALID_SCORE: "Có tỉ số không hợp lệ trong dữ liệu giải.",
  INVALID_TEAM: "Có trận đấu thiếu thông tin đội.",
  INVALID_WALKOVER: "Trận xử thắng phải có tỉ số 21–0.",
};

export function useTournament() {
  const [view, setView] = useState<TournamentView | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetch("/tournament.json", { cache: "no-cache" })
      .then((r) => {
        if (!r.ok) throw new Error("FETCH_FAILED");
        return r.json();
      })
      .then((raw) => setView(parseTournament(raw)))
      .catch((e: unknown) => {
        const code = e instanceof Error ? e.message : "FETCH_FAILED";
        setError(messages[code] ?? "Không tải được thông tin giải.");
      });
  }, []);

  useEffect(load, [load]);
  return { view, error, reload: load };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run frontend/test/use-tournament.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 5: Delete the old API client and fix `page.tsx` enough to compile**

```bash
git rm frontend/src/lib/api.ts
```

`frontend/src/app/page.tsx` is fully rewritten in Task 14. For now make it compile with a placeholder that renders the hero only, so `pnpm --filter @webminton/frontend typecheck` passes:

```tsx
"use client";
import { useTournament } from "../lib/use-tournament";

export default function Page() {
  const { view, error } = useTournament();
  if (error) return <main id="main"><p role="alert">{error}</p></main>;
  if (!view) return <main id="main"><p role="status">Đang tải thông tin giải…</p></main>;
  return <main id="main"><h1>{view.t.info.name}</h1></main>;
}
```

Delete or stub any `features/*` component that imports `../../lib/api`; those are rewritten in Tasks 10–13.

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm --filter @webminton/frontend typecheck && pnpm test`
Expected: all clean.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(frontend): load tournament.json and derive results in the browser

useTournament fetches the static file, validates it with zod and runs
deriveTournament, so a hand-edited score can never disagree with a
stored standings table.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ngui52jdFtBsdruwy1Awcc
EOF
)"
```

---

### Task 6: `pnpm validate`

**Files:**
- Create: `scripts/validate-tournament.ts`
- Create: `scripts/test/validate-tournament.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `PublicTournamentSchema`, `deriveTournament`, `findScheduleConflicts`, `validateLineup`.
- Produces: `validateTournament(raw: unknown): string[]` — returns Vietnamese problem descriptions, empty when the document is sound. The CLI entry point exits 1 when the array is non-empty.

- [ ] **Step 1: Write the failing test**

`scripts/test/validate-tournament.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { validateTournament } from "../validate-tournament";

const shipped = JSON.parse(
  readFileSync("frontend/public/tournament.json", "utf8"),
);

const match = {
  id: "m1",
  phase: "group",
  encounterId: "e1",
  category: "mens_doubles",
  order: 1,
  teamAId: "t1",
  teamBId: "t2",
  pairA: null,
  pairB: null,
  lineupPublished: false,
  courtId: "c1",
  startsAt: "2026-10-25T08:00:00+07:00",
  endsAt: "2026-10-25T08:30:00+07:00",
  status: "pending",
  score: null,
  winnerTeamId: null,
};

describe("validateTournament", () => {
  it("reports no problems for the shipped file", () => {
    expect(validateTournament(shipped)).toEqual([]);
  });

  it("reports a schema violation", () => {
    expect(validateTournament({ nope: true })[0]).toContain("không hợp lệ");
  });

  it("reports a score that is not a legal final score", () => {
    const doc = structuredClone(shipped);
    doc.matches = [{ ...match, status: "completed", score: { a: 21, b: 20 } }];
    expect(validateTournament(doc).join(" ")).toContain("tỉ số");
  });

  it("reports two matches sharing a court at the same time", () => {
    const doc = structuredClone(shipped);
    doc.matches = [match, { ...match, id: "m2", order: 2 }];
    expect(validateTournament(doc).join(" ")).toContain("trùng");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run scripts/test/validate-tournament.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

`scripts/validate-tournament.ts`:

```ts
import { readFileSync } from "node:fs";
import { PublicTournamentSchema } from "../packages/domain/src/schema";
import { deriveTournament } from "../packages/domain/src/derive";
import {
  findScheduleConflicts,
  validateLineup,
} from "../packages/domain/src/schedule";

const FILE = "frontend/public/tournament.json";

const derived: Record<string, string> = {
  INVALID_SCORE: "Có tỉ số không hợp lệ — mỗi séc phải tới 21, hơn 2, trần 25.",
  INVALID_TEAM: "Có trận đấu thiếu đội A hoặc đội B.",
  INVALID_WALKOVER: "Trận xử thắng phải có tỉ số 21–0.",
};

export function validateTournament(raw: unknown): string[] {
  const parsed = PublicTournamentSchema.safeParse(raw);
  if (!parsed.success)
    return parsed.error.issues.map(
      (i) => `Dữ liệu không hợp lệ tại "${i.path.join(".")}": ${i.message}`,
    );
  const t = parsed.data;
  const problems: string[] = [];

  try {
    deriveTournament(t);
  } catch (e) {
    const code = e instanceof Error ? e.message : "UNKNOWN";
    problems.push(derived[code] ?? `Lỗi khi tính kết quả: ${code}`);
  }

  for (const c of findScheduleConflicts(t))
    problems.push(`Lịch thi đấu bị trùng: ${JSON.stringify(c)}`);

  for (const m of t.matches) {
    if (!m.pairA && !m.pairB) continue;
    try {
      validateLineup(t, m);
    } catch (e) {
      problems.push(
        `Đội hình trận ${m.id} không hợp lệ: ${e instanceof Error ? e.message : e}`,
      );
    }
  }

  const expected = t.draw.status === "confirmed" ? 24 : 0;
  if (t.matches.length && t.matches.length !== expected && t.matches.length !== 18)
    problems.push(
      `Số trận phải là 18 (vòng loại) hoặc 24 (cả giải), đang có ${t.matches.length}.`,
    );

  return problems;
}

if (import.meta.filename === process.argv[1]) {
  const problems = validateTournament(JSON.parse(readFileSync(FILE, "utf8")));
  if (problems.length) {
    console.error(`✗ ${FILE} có ${problems.length} vấn đề:`);
    for (const p of problems) console.error(`  · ${p}`);
    process.exit(1);
  }
  console.log(`✓ ${FILE} hợp lệ.`);
}
```

- [ ] **Step 4: Wire the script and run the tests**

Add to `package.json` scripts: `"validate": "node --import tsx scripts/validate-tournament.ts",`

Run: `pnpm vitest run scripts/test/validate-tournament.test.ts && pnpm validate`
Expected: 4 tests PASS, and the CLI prints `✓ frontend/public/tournament.json hợp lệ.`

- [ ] **Step 5: Verify the CLI actually fails on bad input**

Run:
```bash
cp frontend/public/tournament.json /tmp/t.bak
node -e "const f='frontend/public/tournament.json';const d=require('./'+f);d.teams.pop();require('fs').writeFileSync(f,JSON.stringify(d,null,2))"
pnpm validate; echo "exit=$?"
cp /tmp/t.bak frontend/public/tournament.json
```
Expected: a Vietnamese problem list and `exit=1`, then the file is restored.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(scripts): add pnpm validate for the tournament file

Parses the public document, re-derives results, and checks schedule
conflicts and lineup legality so a hand edit fails loudly in CI rather
than quietly on the live page.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ngui52jdFtBsdruwy1Awcc
EOF
)"
```

---

### Task 7: `pnpm draw`

**Files:**
- Create: `scripts/draw-teams.ts`
- Create: `scripts/test/draw-teams.test.ts`
- Modify: `package.json`

**Interfaces:**
- Consumes: `generateDraw`, `rosterHash`, `PrivateRosterSchema`, `buildGroupMatches` from `round-robin.ts`.
- Produces: `applyDraw(t: TournamentDocument, roster: PrivateRoster, seed: string): TournamentDocument` — returns a new document with `athletes` (public shape), `draw`, and the 18 group matches filled in. Never returns a private field.

- [ ] **Step 1: Read the round-robin helper's exact signature**

Run: `grep -n "export function" packages/domain/src/round-robin.ts`

Use whatever it exports to build the 6 encounters × 3 categories. If it produces encounters rather than matches, expand each encounter into three matches with ids `g<encounter>-<category index>`, `order` running 1…18, `status: "pending"`, `score: null`, `pairA`/`pairB` `null`, `lineupPublished: false`.

- [ ] **Step 2: Write the failing test**

`scripts/test/draw-teams.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { applyDraw } from "../draw-teams";
import { buildRoster } from "../../packages/domain/src/testing/fixtures";
import { PublicTournamentSchema } from "../../packages/domain/src/schema";

const shipped = JSON.parse(
  readFileSync("frontend/public/tournament.json", "utf8"),
);

describe("applyDraw", () => {
  const roster = buildRoster(24);
  const result = applyDraw(
    PublicTournamentSchema.parse(shipped),
    roster,
    "seed-2026",
  );

  it("assigns every active athlete to a team", () => {
    expect(result.athletes).toHaveLength(24);
    expect(result.athletes.every((a) => a.teamId !== null)).toBe(true);
  });

  it("never writes a private field into the public document", () => {
    const json = JSON.stringify(result);
    for (const key of ["phone", "skillBand", "note"])
      expect(json).not.toContain(`"${key}"`);
    expect(PublicTournamentSchema.safeParse(result).success).toBe(true);
  });

  it("generates the 18 group matches", () => {
    expect(result.matches).toHaveLength(18);
    expect(result.matches.every((m) => m.phase === "group")).toBe(true);
    expect(new Set(result.matches.map((m) => m.id)).size).toBe(18);
  });

  it("marks the draw confirmed", () => {
    expect(result.draw.status).toBe("confirmed");
  });

  it("is deterministic for a given seed", () => {
    const again = applyDraw(
      PublicTournamentSchema.parse(shipped),
      roster,
      "seed-2026",
    );
    expect(again.draw.assignment).toEqual(result.draw.assignment);
  });

  it("refuses to redraw once matches have been played", () => {
    const played = structuredClone(result);
    played.matches[0].status = "completed";
    played.matches[0].score = { a: 21, b: 15 };
    expect(() => applyDraw(played, roster, "seed-2026")).toThrow("DRAW_LOCKED");
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run scripts/test/draw-teams.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

`scripts/draw-teams.ts`:

```ts
import { readFileSync, writeFileSync } from "node:fs";
import {
  PublicTournamentSchema,
  type TournamentDocument,
} from "../packages/domain/src/schema";
import {
  PrivateRosterSchema,
  type PrivateRoster,
} from "../packages/domain/src/roster";
import { generateDraw } from "../packages/domain/src/draw";
import { buildGroupMatches } from "../packages/domain/src/round-robin";

const PUBLIC = "frontend/public/tournament.json";
const PRIVATE = ".private/roster.json";

export function applyDraw(
  input: TournamentDocument,
  roster: PrivateRoster,
  seed: string,
): TournamentDocument {
  if (input.matches.some((m) => m.status !== "pending"))
    throw new Error("DRAW_LOCKED");

  const draw = generateDraw(roster, input.teams, seed);

  // Only public fields cross this boundary — phone, note and skillBand stay
  // in .private/roster.json and must never reach the deployed file.
  const athletes = roster.athletes.map((a) => ({
    id: a.id,
    name: a.name,
    gender: a.gender,
    active: a.active,
    teamId: a.active ? (draw.assignment[a.id] ?? null) : null,
  }));

  return PublicTournamentSchema.parse({
    ...input,
    updatedAt: new Date().toISOString(),
    athletes,
    draw,
    matches: buildGroupMatches(input.teams, input.rules.categories),
  });
}

if (import.meta.filename === process.argv[1]) {
  const seed = process.argv[2] ?? String(Date.now());
  const t = PublicTournamentSchema.parse(
    JSON.parse(readFileSync(PUBLIC, "utf8")),
  );
  const roster = PrivateRosterSchema.parse(
    JSON.parse(readFileSync(PRIVATE, "utf8")),
  );
  const next = applyDraw(t, roster, seed);
  writeFileSync(PUBLIC, `${JSON.stringify(next, null, 2)}\n`);
  console.log(
    `✓ Đã bốc thăm với seed "${seed}" — ${next.athletes.length} VĐV, ${next.matches.length} trận vòng loại.`,
  );
  for (const team of next.teams)
    console.log(
      `  ${team.name}: ${next.athletes.filter((a) => a.teamId === team.id).length} VĐV`,
    );
}
```

If `round-robin.ts` does not already export a `buildGroupMatches(teams, categories)` producing 18 matches, add it there (with its own unit test asserting 18 unique matches across 6 encounters) rather than inlining the logic in the script — it is domain logic.

- [ ] **Step 5: Wire the script and run the tests**

Add to `package.json` scripts: `"draw": "node --import tsx scripts/draw-teams.ts",`

Run: `pnpm vitest run scripts/test/draw-teams.test.ts`
Expected: PASS, 6 tests.

- [ ] **Step 6: Verify end to end against the example roster without committing the result**

Run:
```bash
cp frontend/public/tournament.json /tmp/t.bak
cp .private/roster.example.json /tmp/roster.bak
node -e "
const fs=require('fs');
const athletes=[...Array(24)].map((_,i)=>({id:'a'+String(i+1).padStart(2,'0'),name:'VĐV '+(i+1),gender:i%2?'female':'male',skillBand:(i%3)+1,phone:null,note:'',active:true}));
fs.writeFileSync('.private/roster.json',JSON.stringify({athletes},null,2));
"
pnpm draw test-seed && pnpm validate
grep -c '"phone"' frontend/public/tournament.json || echo "no phone leaked"
cp /tmp/t.bak frontend/public/tournament.json && rm -f .private/roster.json
```
Expected: the draw prints four teams of 6, `pnpm validate` passes, and the grep reports no `phone`. The public file is then restored to its empty state.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(scripts): add pnpm draw

Runs the balanced draw from .private/roster.json and writes only the
public result — teams, assignments and the 18 group matches — into
tournament.json. Skill bands and phone numbers never leave the machine.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ngui52jdFtBsdruwy1Awcc
EOF
)"
```

---

### Task 8: Optimise and install the poster assets

`assets/images` is 16 MB of full-size iOS captures. Shipping them unchanged would dominate the page weight.

**Files:**
- Create: `scripts/optimize-assets.ts`
- Create: `frontend/public/photos/{doi-hinh-mua-truoc,cam-vang,hiep-phu-ngoai-quan}.jpg`
- Create: `frontend/public/qr/momo.jpg`
- Modify: `package.json` (add `sharp` to root `devDependencies`)

**Interfaces:**
- Consumes: nothing.
- Produces: the four image paths above, each ≤200 KB, referenced by Tasks 10 and 12.

- [ ] **Step 1: Add the image toolchain**

Run: `pnpm add -Dw sharp`

- [ ] **Step 2: Write the script**

`scripts/optimize-assets.ts`:

```ts
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const jobs = [
  ["assets/images/20241124_101630187_iOS.jpg", "frontend/public/photos/doi-hinh-mua-truoc.jpg", 1200],
  ["assets/images/20250405_003548865_iOS.jpg", "frontend/public/photos/cam-vang.jpg", 1200],
  ["assets/images/20241006_113947225_iOS.jpg", "frontend/public/photos/hiep-phu-ngoai-quan.jpg", 1200],
  ["assets/images/momo-qr-code.jpeg", "frontend/public/qr/momo.jpg", 800],
] as const;

for (const [from, to, width] of jobs) {
  await mkdir(to.slice(0, to.lastIndexOf("/")), { recursive: true });
  await sharp(from)
    .rotate()
    .resize({ width, withoutEnlargement: true })
    .jpeg({ quality: 78, mozjpeg: true })
    .toFile(to);
  console.log(`✓ ${to}`);
}
```

- [ ] **Step 3: Pick the right three photos**

Before running, open the three source photos and confirm they match the poster's three frames — a team group shot, a person holding a medal, and a crowded table. If a filename above is wrong, correct it in `jobs`; the poster captions are `Đội hình mùa trước`, `Cầm vàng thì đừng để vàng rơi`, `Hiệp phụ ngoài quán`.

- [ ] **Step 4: Run it and check the sizes**

Run: `node --import tsx scripts/optimize-assets.ts && du -h frontend/public/photos/* frontend/public/qr/*`
Expected: four files, each well under 200 KB.

- [ ] **Step 5: Confirm the QR still scans**

Open `frontend/public/qr/momo.jpg` and scan it with a phone. If re-encoding has damaged it, re-run that one job at `quality: 92` and no resize. **Do not commit an unscannable QR** — it is the one asset whose correctness cannot be checked by a test.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(assets): add web-sized poster photos and the MoMo QR

The originals in assets/ are 16 MB of full-size captures; these are
resized to 1200px and mozjpeg-encoded for the landing page.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ngui52jdFtBsdruwy1Awcc
EOF
)"
```

---

### Task 9: The poster design system

Everything visual in Tasks 10–13 is built from these primitives. Build them once, correctly.

**Files:**
- Create: `frontend/src/styles/poster.css`
- Create: `frontend/src/features/landing/primitives.tsx`
- Modify: `frontend/src/app/globals.css`, `frontend/src/app/layout.tsx`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```tsx
  export function Slab(props: { tone: "red" | "black" | "yellow"; rotate?: number; children: ReactNode }): JSX.Element;
  export function Card(props: { title?: string; dashed?: boolean; children: ReactNode }): JSX.Element;
  export function Pill(props: { tone: "red" | "green" | "yellow" | "outline"; children: ReactNode }): JSX.Element;
  export function NumberDisc(props: { n: number; tone: "black" | "red" | "green" }): JSX.Element;
  export function PhotoFrame(props: { src: string; alt: string; caption: string; rotate: number }): JSX.Element;
  export function Section(props: { id: string; children: ReactNode }): JSX.Element;
  ```
  CSS classes: `.poster-ground`, `.slab`, `.slab--red|black|yellow`, `.card`, `.card--dashed`, `.pill`, `.disc`, `.photo-frame`, `.bubble`, `.badge-circle`, `.leaders`.

- [ ] **Step 1: Study the posters**

Open `assets/poster_designs/thong-bao-trang-1.jpg`, `-2.jpg` and `-3.jpg` and note precisely: the yellow ground carries a regular dot grid; every card and slab is cream or red or black with a **hard, un-blurred** black offset shadow roughly 8–10 px down-right; slabs and photo frames sit at slight rotations of 1–3°; headings are heavy uppercase; card titles are red uppercase; body text is dark and generously leaded.

- [ ] **Step 2: Write `frontend/src/styles/poster.css`**

```css
/* The poster design system. Tokens live in globals.css. */
:root {
  --shadow-hard: 9px 9px 0 var(--ink);
  --shadow-hard-sm: 5px 5px 0 var(--ink);
  --gutter: clamp(16px, 5vw, 64px);
}

.poster-ground {
  background-color: var(--yellow);
  background-image: radial-gradient(
    circle at 1px 1px,
    rgba(23, 21, 15, 0.18) 1.2px,
    transparent 0
  );
  background-size: 22px 22px;
}

.section {
  padding-block: clamp(40px, 8vw, 96px);
}
.container {
  width: min(1100px, 100% - var(--gutter) * 2);
  margin-inline: auto;
}

.slab {
  display: inline-block;
  padding: 0.18em 0.5em;
  border: 3px solid var(--ink);
  box-shadow: var(--shadow-hard);
  font-weight: 900;
  line-height: 1.08;
  text-transform: uppercase;
}
.slab--red { background: var(--red); color: var(--paper); }
.slab--black { background: var(--ink); color: var(--yellow); }
.slab--yellow { background: var(--yellow); color: var(--ink); }

.card {
  background: var(--paper);
  border: 3px solid var(--ink);
  box-shadow: var(--shadow-hard);
  padding: clamp(20px, 3vw, 34px);
}
.card--dashed {
  border-style: dashed;
  box-shadow: none;
}
.card > h3 {
  margin: 0 0 18px;
  color: var(--red);
  font-size: 1.15rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.02em;
}

.pill {
  display: inline-flex;
  align-items: center;
  padding: 8px 18px;
  border: 3px solid var(--ink);
  border-radius: 999px;
  box-shadow: var(--shadow-hard-sm);
  font-weight: 800;
  font-size: 0.85rem;
  text-transform: uppercase;
}
.pill--red { background: var(--red); color: var(--paper); }
.pill--green { background: var(--green); color: var(--paper); }
.pill--yellow { background: var(--yellow); color: var(--ink); }
.pill--outline { background: var(--paper); color: var(--ink); }

.disc {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  width: 34px;
  height: 34px;
  border-radius: 50%;
  color: var(--paper);
  font-weight: 800;
  font-size: 0.9rem;
}
.disc--black { background: var(--ink); }
.disc--red { background: var(--red); }
.disc--green { background: var(--green); }

.photo-frame {
  background: var(--paper);
  border: 3px solid var(--ink);
  box-shadow: var(--shadow-hard);
  padding: 12px 12px 0;
}
.photo-frame img {
  display: block;
  width: 100%;
  aspect-ratio: 4 / 3;
  object-fit: cover;
}
.photo-frame figcaption {
  padding: 10px 2px 12px;
  font-size: 0.8rem;
  font-style: italic;
  text-align: center;
}

.bubble {
  position: relative;
  display: inline-block;
  padding: 10px 18px;
  background: var(--paper);
  border: 3px solid var(--ink);
  border-radius: 999px;
  box-shadow: var(--shadow-hard-sm);
  font-weight: 800;
  font-style: italic;
}
.bubble::after {
  content: "";
  position: absolute;
  bottom: -13px;
  left: 28px;
  border: 7px solid transparent;
  border-top-color: var(--ink);
}

.badge-circle {
  display: grid;
  place-items: center;
  width: 118px;
  height: 118px;
  padding: 12px;
  border-radius: 50%;
  background: var(--green);
  color: var(--paper);
  font-weight: 800;
  font-size: 0.9rem;
  line-height: 1.25;
  text-align: center;
}

/* Dotted-leader rows, as on the QUỸ GIẢI table. */
.leaders {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding-block: 12px;
}
.leaders > span:first-child { flex: 0 1 auto; }
.leaders > i {
  flex: 1 1 auto;
  height: 0;
  border-bottom: 2px dotted rgba(23, 21, 15, 0.4);
}
.leaders > b { font-weight: 800; white-space: nowrap; }

@media (prefers-reduced-motion: no-preference) {
  .rot { transform: rotate(var(--rot, 0deg)); }
}

@media (max-width: 640px) {
  :root { --shadow-hard: 6px 6px 0 var(--ink); }
  .slab { box-shadow: var(--shadow-hard-sm); }
}
```

- [ ] **Step 3: Write `frontend/src/features/landing/primitives.tsx`**

```tsx
import type { CSSProperties, ReactNode } from "react";

export function Section({ id, children }: { id: string; children: ReactNode }) {
  return (
    <section id={id} className="section">
      <div className="container">{children}</div>
    </section>
  );
}

export function Slab({
  tone,
  rotate = 0,
  children,
}: {
  tone: "red" | "black" | "yellow";
  rotate?: number;
  children: ReactNode;
}) {
  return (
    <span
      className={`slab slab--${tone} rot`}
      style={{ "--rot": `${rotate}deg` } as CSSProperties}
    >
      {children}
    </span>
  );
}

export function Card({
  title,
  dashed = false,
  children,
}: {
  title?: string;
  dashed?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={dashed ? "card card--dashed" : "card"}>
      {title && <h3>{title}</h3>}
      {children}
    </div>
  );
}

export function Pill({
  tone,
  children,
}: {
  tone: "red" | "green" | "yellow" | "outline";
  children: ReactNode;
}) {
  return <span className={`pill pill--${tone}`}>{children}</span>;
}

export function NumberDisc({
  n,
  tone,
}: {
  n: number;
  tone: "black" | "red" | "green";
}) {
  return (
    <span className={`disc disc--${tone}`} aria-hidden="true">
      {n}
    </span>
  );
}

export function PhotoFrame({
  src,
  alt,
  caption,
  rotate,
}: {
  src: string;
  alt: string;
  caption: string;
  rotate: number;
}) {
  return (
    <figure
      className="photo-frame rot"
      style={{ "--rot": `${rotate}deg`, margin: 0 } as CSSProperties}
    >
      <img src={src} alt={alt} width={1200} height={900} loading="lazy" />
      <figcaption>{caption}</figcaption>
    </figure>
  );
}
```

- [ ] **Step 4: Wire the stylesheet in**

At the top of `frontend/src/app/globals.css`, after the font import, add `@import "../styles/poster.css";`. In `layout.tsx`, add `className="poster-ground"` to the `<body>` element and confirm `lang="vi"` is set on `<html>`.

- [ ] **Step 5: Look at it**

Run: `pnpm dev` and open `http://localhost:3000`.
Expected: the page ground is yellow with a visible dot grid. Compare the ground colour and dot spacing side by side with `thong-bao-trang-1.jpg` and adjust `background-size` until they match.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(frontend): add the poster design system

Dot-grid ground, hard offset shadows, slabs, cards, pills, numbered
discs, rotated photo frames and dotted-leader rows — the primitives
every poster section is built from.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ngui52jdFtBsdruwy1Awcc
EOF
)"
```

---

### Task 10: Poster 1 — thông báo

**Reference:** `assets/poster_designs/thong-bao-trang-1.jpg`. Open it before writing, and again before committing.

**Files:**
- Create: `frontend/src/features/landing/PosterOne.tsx`
- Delete: `frontend/src/features/landing/TournamentHero.tsx`
- Create: `frontend/test/poster-one.test.tsx`

**Interfaces:**
- Consumes: `TournamentView` (Task 5), primitives (Task 9), photos (Task 8).
- Produces: `export function PosterOne({ t }: { t: TournamentDocument }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

Three pieces of setup first, or the `.tsx` tests will not compile or run:

1. `pnpm add -Dw @testing-library/react @testing-library/dom jsdom`
2. In `vitest.config.ts`, set `test.environment: "jsdom"` and add `"frontend/test/**/*.test.tsx"` to `include`. jsdom globally is fine — the domain and script tests run under Node either way.
3. `frontend/tsconfig.json` sets `"jsx": "react-jsx"` but its `include` covers only `src/**`, so vitest's esbuild would not pick it up for `frontend/test`. Add `"test/**/*.tsx"` and `"test/**/*.ts"` to that `include` array.

Verify the setup before writing the component: `pnpm vitest run frontend/test` should report "no test files found", not a JSX syntax error.

`frontend/test/poster-one.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { PosterOne } from "../src/features/landing/PosterOne";
import { PublicTournamentSchema } from "../../packages/domain/src/schema";

const t = PublicTournamentSchema.parse(
  JSON.parse(readFileSync("frontend/public/tournament.json", "utf8")),
);

describe("PosterOne", () => {
  it("renders the title and the club badge", () => {
    render(<PosterOne t={t} />);
    expect(screen.getByText(/GIẢI CẦU LÔNG/i)).toBeDefined();
    expect(screen.getByText(/NỘI BỘ 2026/i)).toBeDefined();
    expect(screen.getByText(/HỘI LÔNG THỦ CN1416/i)).toBeDefined();
  });

  it("renders the four fact rows from info", () => {
    render(<PosterOne t={t} />);
    for (const label of ["KHI NÀO?", "Ở ĐÂU?", "ĐÁNH NHỮNG GÌ?"])
      expect(screen.getByText(label)).toBeDefined();
    expect(screen.getByText(t.info.location)).toBeDefined();
    expect(screen.getByText(t.info.dateLabel)).toBeDefined();
  });

  it("shows the ??? fee strip while feeVnd is null", () => {
    render(<PosterOne t={t} />);
    expect(screen.getByText("???")).toBeDefined();
  });

  it("shows the amount once feeVnd is set", () => {
    render(<PosterOne t={{ ...t, info: { ...t.info, feeVnd: 150000 } }} />);
    expect(screen.queryByText("???")).toBeNull();
    expect(screen.getByText(/150\.000/)).toBeDefined();
  });

  it("falls back to ĐĂNG KÝ SỚM NHÉ when there is no deadline", () => {
    render(<PosterOne t={t} />);
    expect(screen.getByText(/ĐĂNG KÝ SỚM NHÉ/i)).toBeDefined();
  });

  it("renders the three photo captions", () => {
    render(<PosterOne t={t} />);
    expect(screen.getByText("Đội hình mùa trước")).toBeDefined();
    expect(screen.getByText("Cầm vàng thì đừng để vàng rơi")).toBeDefined();
    expect(screen.getByText("Hiệp phụ ngoài quán")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run frontend/test/poster-one.test.tsx`
Expected: FAIL — `PosterOne` does not exist.

- [ ] **Step 3: Implement `PosterOne.tsx`**

Structure, in poster order — match the reference image for spacing and scale:

1. **Badge bar** — a black rounded pill, `HỘI LÔNG THỦ CN1416` in yellow on the left and `THÔNG BÁO · MÙA 2026` in cream on the right, `justify-content: space-between`.
2. **Title** — `<h1>` with `GIẢI CẦU LÔNG` in heavy black caps at `clamp(2.6rem, 9vw, 5.6rem)`, then a `<Slab tone="red" rotate={-0.6}>NỘI BỘ 2026</Slab>` on its own line.
3. **Slogan** — `<Slab tone="black">{t.info.slogan.toLocaleUpperCase("vi-VN")}</Slab>`.
4. **Intro** — the poster's paragraph: *"Bốn đội. Ba nội dung. Vòng loại xoay tua rồi vào tranh hạng — hai mươi bốn trận gói gọn trong một buổi. Và một chầu chốt sổ ngay sau đó mà đội nào cũng có phần."*
5. **Fact card** — a `<Card>` containing a `<dl>` laid out as a two-column grid (`grid-template-columns: minmax(140px, 22%) 1fr`, `row-gap: 20px`), `<dt>` red/uppercase/bold, `<dd>` normal. Rows: `KHI NÀO?` → `t.info.dateLabel`; `Ở ĐÂU?` → `t.info.location`; `ĐÁNH NHỮNG GÌ?` → *"Đôi nam · Đôi nữ · Đôi nam nữ — 4 đội đấu vòng loại xoay tua rồi tranh hạng, tổng 24 trận"*; `CẦN BAO NHIÊU NGƯỜI?` → *"Tối thiểu 16, lý tưởng 24 để chia đều 4 đội. Rủ thêm bạn cùng đánh nhé"*.
6. **Fee strip** — a black panel with a large yellow `???` on the left and, on the right, **Lệ phí tham gia — BTC còn đang bấm máy tính.** plus *"Chờ chốt xem bao nhiêu người đăng ký và tài trợ được bao nhiêu đã. Hứa báo sớm, và hứa không để ai phải bán vợt trả nợ."* When `t.info.feeVnd !== null`, replace the `???` with the formatted amount (use the existing `formatVnd` from `frontend/src/lib/format.ts`) and the body with a single line naming the fee.
7. **Photo strip** — a three-column grid (one column under 720 px) of `<PhotoFrame>` at rotations `-2`, `1.5` and `-1`, with `/photos/doi-hinh-mua-truoc.jpg`, `/photos/cam-vang.jpg`, `/photos/hiep-phu-ngoai-quan.jpg` and the captions asserted above. Alt text is descriptive Vietnamese, not the caption. Absolutely position the `<span className="bubble">Thành bại tại vợt!</span>` above the middle frame and the `<span className="badge-circle">Thua vẫn có nhậu</span>` over the top-right of the third; both become static, in-flow elements under 720 px.
8. **CTA** — an `<h2>` reading `ĐĂNG KÝ TRƯỚC {date}` when `t.info.registrationDeadline` is set and `ĐĂNG KÝ SỚM NHÉ` when it is null; beneath it *"Nhắn vào nhóm Zalo hội, hoặc liên hệ"* with `t.info.contactName`/`contactPhone` when present and a link to `t.info.zaloUrl` when present; and the right-aligned italic disclaimer *"BTC không chịu trách nhiệm với các pha smash bay ra ngoài sân, và cũng không nhận đổ lỗi cho vợt."*

Put any layout CSS this section needs in `poster.css` under a `.poster-one` prefix — not inline, except the rotation custom properties.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run frontend/test/poster-one.test.tsx`
Expected: PASS, 6 tests.

- [ ] **Step 5: Compare against the poster**

Run `pnpm dev`, then put `http://localhost:3000` and `assets/poster_designs/thong-bao-trang-1.jpg` side by side. Check in this order: title weight and scale, the red slab's proportion to the title, fact-card column split, fee-strip proportions, photo rotations, sticker placement. Adjust until they read as the same design.

Then narrow the window to 390 px. Expected: nothing overflows horizontally, the photo strip is one column, the stickers are in flow, and no text is below 14 px.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(frontend): build poster 1 as the landing hero

Badge bar, title with the red NỘI BỘ 2026 slab, slogan, fact card,
??? fee strip, the three rotated photos with their stickers, and the
registration call to action — all driven by info in tournament.json.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ngui52jdFtBsdruwy1Awcc
EOF
)"
```

---

### Task 11: Poster 2 — thể lệ thi đấu

**Reference:** `assets/poster_designs/thong-bao-trang-2.jpg`.

**Files:**
- Create: `frontend/src/features/landing/PosterTwo.tsx`
- Delete: `frontend/src/features/landing/RulesSection.tsx`
- Create: `frontend/test/poster-two.test.tsx`

**Interfaces:**
- Consumes: primitives (Task 9), `TournamentDocument` for `t.rules` and `t.info`.
- Produces: `export function PosterTwo({ t }: { t: TournamentDocument }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

`frontend/test/poster-two.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { PosterTwo } from "../src/features/landing/PosterTwo";
import { PublicTournamentSchema } from "../../packages/domain/src/schema";

const t = PublicTournamentSchema.parse(
  JSON.parse(readFileSync("frontend/public/tournament.json", "utf8")),
);

describe("PosterTwo", () => {
  it("renders all six rule cards", () => {
    render(<PosterTwo t={t} />);
    for (const title of [
      "CHIA ĐỘI & THỂ THỨC",
      "LUẬT MỖI SÉC",
      "XẾP HẠNG SAU VÒNG LOẠI",
      "VÒNG TRANH HẠNG",
      "LỆ PHÍ & QUỸ GIẢI",
      "MẤY ĐIỀU NHỚ GIÙM",
    ])
      expect(screen.getByText(title)).toBeDefined();
  });

  it("renders the four placement pills", () => {
    render(<PosterTwo t={t} />);
    for (const label of ["NHẤT", "NHÌ", "BA", "KHUYẾN KHÍCH"])
      expect(screen.getByText(label)).toBeDefined();
  });

  it("renders the three tiebreak pills in ranking order", () => {
    render(<PosterTwo t={t} />);
    expect(screen.getByText(/1 · Số trận thắng/)).toBeDefined();
    expect(screen.getByText(/2 · Hiệu số điểm/)).toBeDefined();
    expect(screen.getByText(/3 · Đối đầu trực tiếp/)).toBeDefined();
  });

  it("states the scoring numbers from rules, not hardcoded prose", () => {
    render(<PosterTwo t={t} />);
    const html = document.body.innerHTML;
    expect(html).toContain(String(t.rules.setTarget));
    expect(html).toContain(String(t.rules.cap));
    expect(html).toContain(String(t.rules.changeEndsAt));
    expect(html).toContain(String(t.rules.lateMinutes));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run frontend/test/poster-two.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `PosterTwo.tsx`**

Header: `<Slab tone="red" rotate={-1.5}>THỂ LỆ<br/>THI ĐẤU</Slab>` on the left, and on the right, right-aligned, `Giải cầu lông nội bộ 2026` over `Hội lông thủ CN1416` from `t.info`.

Then a two-column grid (`grid-template-columns: repeat(auto-fit, minmax(320px, 1fr))`, `gap: 28px`, `align-items: start`) of six `<Card>`s. Left column 1, 2, 3; right column 4, 5, 6.

1. **CHIA ĐỘI & THỂ THỨC** — four rows, each a flex row of `<NumberDisc n tone="black" />` and text:
   1. Cả hội chia thành **4 đội**. BTC bốc thăm chia đều trình độ — không ai được tự chọn đồng đội.
   2. **Vòng loại:** bốn đội đấu xoay tua, mỗi đội gặp cả ba đội còn lại — 6 lượt đấu.
   3. Mỗi lượt gặp nhau đánh **3 nội dung**: đôi nam, đôi nữ, đôi nam nữ. Mỗi nội dung đúng **1 trận, 1 séc**.
   4. Vòng loại 18 trận, mỗi đội đánh 9 trận. Cộng vòng tranh hạng nữa là **cả giải 24 trận**.
2. **LUẬT MỖI SÉC** — red bullet discs; interpolate `t.rules`:
   - Mỗi séc **{setTarget} điểm**, tính điểm trực tiếp — thắng pha cầu nào ăn điểm pha đó.
   - **Đổi sân khi một bên đạt {changeEndsAt} điểm**, áp dụng cho tất cả các trận.
   - Hoà **20-20** thì đánh tiếp, bên nào hơn {minLead} điểm trước thì thắng — 22-20, 23-21, 24-22.
   - Hoà **24-24** thì bên nào chạm **{cap}** trước thắng luôn. Trần điểm là {cap}.
3. **XẾP HẠNG SAU VÒNG LOẠI** — the paragraph *"Cộng **tổng số điểm mỗi đội ghi được** qua cả 9 trận. Đội nào tổng điểm cao nhất xếp trên — nên kể cả biết sẽ thua thì vẫn phải giành từng điểm một."*, then *"Bằng điểm thì xét lần lượt:"* and three `<Pill tone="yellow">`: `1 · Số trận thắng`, `2 · Hiệu số điểm`, `3 · Đối đầu trực tiếp`.
4. **VÒNG TRANH HẠNG** — four red bullets (nhất gặp nhì; ba gặp tư; mỗi cặp đánh đủ 3 nội dung, thắng 2 trên 3; đội trưởng xếp lại cặp theo chiến thuật, chỉ BTC biết trước), then the pills `NHẤT` (red), `NHÌ` (green), `BA` (outline), `KHUYẾN KHÍCH` (outline).
5. **LỆ PHÍ & QUỸ GIẢI** — a black panel with a yellow `???` over `ĐANG CHỐT`, then *"**Chưa có con số.** BTC chốt sau khi biết số người tham gia và số tiền tài trợ."* and *"Toàn bộ tiền của giải nằm trong **quỹ riêng do BTC lập**, thu chi công khai sau giải."* When `t.info.feeVnd !== null`, the black panel shows the amount instead of `???`.
6. **MẤY ĐIỀU NHỚ GIÙM** — five red bullets: nộp danh sách cặp trước mỗi vòng; có mặt trước giờ đánh **{lateMinutes} phút**, quá {lateMinutes} phút kể từ lúc gọi tên là xử thua; giày đế không đen, cầu BTC lo vợt tự lo; khiếu nại giải quyết ngay tại sân; thua thì cười, thắng thì cũng đừng cười to quá.

Footer: a 3px black rule, then registration contact on the left and `Nhà tài trợ xem bên dưới · Sân Tấn Phúc` on the right.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run frontend/test/poster-two.test.tsx`
Expected: PASS, 4 tests.

- [ ] **Step 5: Compare against the poster and check narrow layout**

Run `pnpm dev`, compare with `thong-bao-trang-2.jpg`: two balanced columns, red card titles, disc sizes, pill shapes and colours. At 390 px the grid must be a single column with nothing clipped.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(frontend): build poster 2 as the thể lệ section

Six rule cards in two columns with numbered discs, the tiebreak pills
and the placement pills. The scoring numbers interpolate from t.rules
rather than being written into the prose twice.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ngui52jdFtBsdruwy1Awcc
EOF
)"
```

---

### Task 12: Poster 3 — nhà tài trợ

**Reference:** `assets/poster_designs/thong-bao-trang-3.jpg`.

**Files:**
- Create: `frontend/src/features/landing/PosterThree.tsx`
- Delete: `frontend/src/features/landing/SponsorSection.tsx`
- Create: `frontend/test/poster-three.test.tsx`

**Interfaces:**
- Consumes: primitives (Task 9), `rankSponsors` and `calculateFinance` from the domain, the QR from Task 8.
- Produces: `export function PosterThree({ t }: { t: TournamentDocument }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

`frontend/test/poster-three.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { PosterThree } from "../src/features/landing/PosterThree";
import { PublicTournamentSchema } from "../../packages/domain/src/schema";

const t = PublicTournamentSchema.parse(
  JSON.parse(readFileSync("frontend/public/tournament.json", "utf8")),
);

describe("PosterThree", () => {
  it("renders the three sponsor tiers", () => {
    render(<PosterThree t={t} />);
    for (const tier of ["KIM CƯƠNG", "VÀNG", "THÂN THIỆN"])
      expect(screen.getByText(tier)).toBeDefined();
  });

  it("renders the MoMo QR", () => {
    render(<PosterThree t={t} />);
    expect(screen.getByRole("img", { name: /QR/i }).getAttribute("src")).toBe(
      "/qr/momo.jpg",
    );
  });

  it("hides the QR when qrPublished is false", () => {
    render(<PosterThree t={{ ...t, info: { ...t.info, qrPublished: false } }} />);
    expect(screen.queryByRole("img", { name: /QR/i })).toBeNull();
    expect(screen.getByText(/sẽ cập nhật sau/i)).toBeDefined();
  });

  it("renders a quỹ giải row for each income line", () => {
    render(<PosterThree t={t} />);
    for (const line of t.finance.income)
      expect(screen.getByText(line.label)).toBeDefined();
  });

  it("lists a named sponsor under its tier once one exists", () => {
    const withSponsor = {
      ...t,
      sponsorships: [
        {
          id: "s1",
          name: "Quán Gen Z",
          amountVnd: 2000000,
          received: true,
          note: "",
          tierOverride: null,
        },
      ],
    };
    render(<PosterThree t={withSponsor} />);
    expect(screen.getByText("Quán Gen Z")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run frontend/test/poster-three.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `PosterThree.tsx`**

Header: `<Slab tone="red" rotate={-1.5}>NHÀ<br/>TÀI TRỢ</Slab>` left, the two info lines right.

Intro: *"Giải này chạy bằng cầu, bằng mồ hôi, và bằng lòng hảo tâm của mấy anh mấy chị. Ai góp một tay thì cả hội nhớ mặt — và có tên hẳn hoi trên bảng vinh danh."*

Three tier `<Card>`s in a `repeat(auto-fit, minmax(260px, 1fr))` grid. Each: a `<NumberDisc>` (1 black, 2 red, 3 green), an `<h4>` with the tier name in heavy caps, the description, a dashed `<hr>`, and the italic *"Phần quà riêng — bật mí sau"*. Descriptions:
- **KIM CƯƠNG** — Dành cho nhà tài trợ đóng góp **nhiều nhất** giải. Một suất duy nhất, ai nhanh tay thì có.
- **VÀNG** — Dành cho nhà tài trợ đóng góp **nhiều thứ nhì**. Suýt soát hạng trên, vẫn oách như thường.
- **THÂN THIỆN** — Dành cho **tất cả các nhà tài trợ còn lại**. Góp bao nhiêu cũng quý, góp là có tên.

Call `rankSponsors(t)` and, under each tier's dashed rule, list the names of sponsors at that tier. Render nothing extra when there are none.

Below, a two-column row (`grid-template-columns: minmax(220px, 1fr) 2.4fr`, one column under 720 px):
- **Left** — when `t.info.qrPublished && t.info.qrAssetPath`, an `<img src={t.info.qrAssetPath} alt="Mã QR chuyển khoản quỹ giải" />` in a `<Card>`; otherwise a `<Card dashed>` with a large `QR` and *"Mã QR của quỹ giải sẽ cập nhật sau"*.
- **Right** — a `<Card title="QUỸ GIẢI">` with the paragraph *"BTC lập một quỹ riêng để quản lý toàn bộ chi phí của giải và nhận quyên góp. Mọi khoản thu chi đều công khai trong nhóm sau khi giải kết thúc — không ai ăn bớt quả cầu nào."*, then one `.leaders` row per `t.finance.income` entry showing `label` and, as the bold right-hand value, `formatVnd(amountVnd)` when `amountVnd > 0` and `Sẽ chốt` when it is 0. Append a final row `Nhà tài trợ — chỗ này còn trống` / `Mời anh chị` when `t.sponsorships.length === 0`.

Finally the CTA: a black panel with a red offset shadow (`box-shadow: 14px 14px 0 var(--red)`) containing the yellow heading `HẠNG KIM CƯƠNG ĐANG TRỐNG — AI NHANH THÌ CÓ!`, the paragraph *"Góp một tay cho giải, mai mốt cả hội gọi bằng anh. Phần quà từng hạng vẫn đang giấu kỹ, chỉ tiết lộ đúng một điều: không phải ống cầu đã qua sử dụng."*, and the contact line. When a diamond sponsor already exists, the heading instead reads `CẢM ƠN NHÀ TÀI TRỢ KIM CƯƠNG` followed by that sponsor's name.

Footer: *"Hạng tài trợ xét theo số tiền đóng góp, BTC chốt trước ngày khai mạc"* left, `Giải cầu lông nội bộ 2026` right.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run frontend/test/poster-three.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 5: Compare against the poster and check narrow layout**

Run `pnpm dev` and compare with `thong-bao-trang-3.jpg`. Check the tier-card proportions, the dashed rules, the dotted leaders in the quỹ giải table, and that the CTA's red shadow sits down-right of the black panel as on the poster. At 390 px the two-column row stacks with the QR first.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(frontend): build poster 3 as the nhà tài trợ section

Three tier cards ranked by rankSponsors, the MoMo QR, the quỹ giải
table with dotted leaders driven by finance.income, and the diamond-tier
call to action.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ngui52jdFtBsdruwy1Awcc
EOF
)"
```

---

### Task 13: The conditional live-data sections

**Files:**
- Create: `frontend/src/features/landing/LiveSections.tsx`
- Modify: `frontend/src/features/athletes/AthleteTable.tsx`, `features/draw/TeamPreview.tsx`, `features/matches/{GroupSchedule,Standings,PlacementBracket}.tsx`, `features/finance/FinanceDashboard.tsx`
- Delete: `frontend/src/features/matches/CourtSchedule.tsx` — the single page shows one chronological schedule, so the per-court view has no home. If `GroupSchedule` needs anything from it, move that in first.
- Create: `frontend/test/live-sections.test.tsx`

**Interfaces:**
- Consumes: `TournamentView` (Task 5), primitives (Task 9).
- Produces: `export function LiveSections({ view }: { view: TournamentView }): JSX.Element`.

- [ ] **Step 1: Write the failing test**

`frontend/test/live-sections.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { LiveSections } from "../src/features/landing/LiveSections";
import { parseTournament } from "../src/lib/use-tournament";

const shipped = JSON.parse(
  readFileSync("frontend/public/tournament.json", "utf8"),
);

describe("LiveSections", () => {
  it("renders nothing for the shipped empty tournament", () => {
    const { container } = render(
      <LiveSections view={parseTournament(shipped)} />,
    );
    expect(container.textContent?.trim()).toBe("");
  });

  it("shows the roster once athletes exist", () => {
    const doc = structuredClone(shipped);
    doc.athletes = [
      { id: "a1", name: "Nguyễn Văn A", gender: "male", teamId: null, active: true },
    ];
    render(<LiveSections view={parseTournament(doc)} />);
    expect(screen.getByText(/DANH SÁCH VĐV/i)).toBeDefined();
    expect(screen.getByText("Nguyễn Văn A")).toBeDefined();
  });

  it("hides the teams until the draw is confirmed", () => {
    const doc = structuredClone(shipped);
    doc.athletes = [
      { id: "a1", name: "Nguyễn Văn A", gender: "male", teamId: null, active: true },
    ];
    render(<LiveSections view={parseTournament(doc)} />);
    expect(screen.queryByText(/BỐN ĐỘI/i)).toBeNull();
  });

  it("hides thu chi until finance is published", () => {
    const doc = structuredClone(shipped);
    doc.finance.published = false;
    render(<LiveSections view={parseTournament(doc)} />);
    expect(screen.queryByText(/THU CHI/i)).toBeNull();
  });

  it("hides an unpublished lineup", () => {
    const doc = structuredClone(shipped);
    doc.draw.status = "confirmed";
    doc.athletes = [
      { id: "a1", name: "Nguyễn Văn A", gender: "male", teamId: "t1", active: true },
      { id: "a2", name: "Trần Văn B", gender: "male", teamId: "t1", active: true },
    ];
    doc.matches = [
      {
        id: "m1", phase: "group", encounterId: "e1", category: "mens_doubles",
        order: 1, teamAId: "t1", teamBId: "t2", pairA: ["a1", "a2"], pairB: null,
        lineupPublished: false, courtId: null, startsAt: null, endsAt: null,
        status: "pending", score: null, winnerTeamId: null,
      },
    ];
    render(<LiveSections view={parseTournament(doc)} />);
    expect(screen.queryByText("Nguyễn Văn A · Trần Văn B")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run frontend/test/live-sections.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Strip the editing affordances from the reused components**

Go through `AthleteTable`, `TeamPreview`, `GroupSchedule`, `Standings`, `PlacementBracket` and `FinanceDashboard` (and `git rm` `CourtSchedule.tsx`). In each: delete every `<button>`, `<input>`, `<select>` and mutation callback prop; change the props to take `{ t, derived }` instead of the old `PublicTournament` type; read winners and standings from `derived`, never from `t`; and restyle the container as a `<Card>`. Keep table markup inside a `<div style={{ overflowX: "auto" }}>`.

`AthleteTable` must render only name, gender and team — there are no other fields left on a public athlete.

- [ ] **Step 4: Implement `LiveSections.tsx`**

```tsx
import type { TournamentView } from "../../lib/use-tournament";
import { Section } from "./primitives";
import { AthleteTable } from "../athletes/AthleteTable";
import { TeamPreview } from "../draw/TeamPreview";
import { GroupSchedule } from "../matches/GroupSchedule";
import { Standings } from "../matches/Standings";
import { PlacementBracket } from "../matches/PlacementBracket";
import { FinanceDashboard } from "../finance/FinanceDashboard";

export function LiveSections({ view }: { view: TournamentView }) {
  const { t, derived } = view;
  const drawn = t.draw.status === "confirmed";
  const played = derived.matches.some((m) => m.winnerTeamId !== null);
  const placement = derived.matches.some((m) => m.phase !== "group");

  return (
    <>
      {t.athletes.length > 0 && (
        <Section id="van-dong-vien">
          <h2>DANH SÁCH VĐV</h2>
          <AthleteTable t={t} />
        </Section>
      )}
      {drawn && (
        <Section id="boc-tham">
          <h2>BỐN ĐỘI</h2>
          <TeamPreview t={t} />
        </Section>
      )}
      {drawn && derived.matches.length > 0 && (
        <Section id="lich-thi-dau">
          <h2>LỊCH THI ĐẤU</h2>
          <GroupSchedule t={t} derived={derived} />
          {placement && <PlacementBracket t={t} derived={derived} />}
        </Section>
      )}
      {played && (
        <Section id="bang-xep-hang">
          <h2>BẢNG XẾP HẠNG</h2>
          <Standings t={t} derived={derived} />
        </Section>
      )}
      {t.finance.published && (
        <Section id="thu-chi">
          <h2>THU CHI</h2>
          <FinanceDashboard t={t} />
        </Section>
      )}
    </>
  );
}
```

Every `<h2>` gets the same poster treatment as the section headings on posters 2 and 3 — red uppercase on a slab.

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run frontend/test/live-sections.test.tsx`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(frontend): add the conditional live-data sections

Roster, teams, schedule, standings and thu chi render read-only and
hide themselves when their data is empty, so today the page is purely
the posters and fills in as the tournament progresses.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ngui52jdFtBsdruwy1Awcc
EOF
)"
```

---

### Task 14: Assemble the page and prove it end to end

**Files:**
- Rewrite: `frontend/src/app/page.tsx`, `frontend/src/app/layout.tsx`
- Create: `scripts/serve-static.ts`
- Delete: `scripts/serve-preview.ts`
- Modify: `playwright.config.ts`
- Rewrite: `tests/e2e/landing.spec.ts`

**Interfaces:**
- Consumes: `PosterOne`, `PosterTwo`, `PosterThree`, `LiveSections`, `useTournament`.
- Produces: the finished single page.

- [ ] **Step 1: Write `frontend/src/app/page.tsx`**

```tsx
"use client";
import { useTournament } from "../lib/use-tournament";
import { PosterOne } from "../features/landing/PosterOne";
import { PosterTwo } from "../features/landing/PosterTwo";
import { PosterThree } from "../features/landing/PosterThree";
import { LiveSections } from "../features/landing/LiveSections";

export default function Page() {
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
    <main id="main">
      <PosterOne t={view.t} />
      <div className="marquee" aria-hidden="true">
        ĐÔI NAM <b>✦</b> ĐÔI NỮ <b>✦</b> ĐÔI NAM NỮ <b>✦</b> HẾT MÌNH TỪNG ĐIỂM
      </div>
      <PosterTwo t={view.t} />
      <PosterThree t={view.t} />
      <LiveSections view={view} />
      <footer className="container section">
        <details>
          <summary>Xem thông báo và thể lệ gốc</summary>
          <div className="poster-grid">
            {[1, 2, 3].map((i) => (
              <a href={`/posters/thong-bao-trang-${i}.jpg`} key={i}>
                <img
                  src={`/posters/thong-bao-trang-${i}.jpg`}
                  width={1333}
                  height={1888}
                  loading="lazy"
                  alt={`Thông báo gốc trang ${i}: ${["giới thiệu giải", "thể lệ", "tài trợ"][i - 1]}`}
                />
              </a>
            ))}
          </div>
        </details>
      </footer>
    </main>
  );
}
```

In `layout.tsx`: keep the skip link, set `lang="vi"`, set the `metadata` title to `Giải cầu lông nội bộ 2026 · Hội lông thủ CN1416` with a Vietnamese description, and replace any multi-page `<nav>` with in-page anchors to `#van-dong-vien`, `#lich-thi-dau`, `#bang-xep-hang`, `#thu-chi` — each rendered only as a plain anchor list, since the targets may not exist yet. Add `@media (prefers-reduced-motion: reduce) { .marquee * { animation: none } .rot { transform: none } }` to `poster.css`.

- [ ] **Step 2: Write the static server for Playwright**

`scripts/serve-static.ts`:

```ts
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";

const ROOT = "frontend/out";
const PORT = 3100;
const types: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

createServer(async (req, res) => {
  const url = (req.url ?? "/").split("?")[0];
  const rel = normalize(decodeURIComponent(url)).replace(/^(\.\.[/\\])+/, "");
  for (const candidate of [rel, join(rel, "index.html"), `${rel}.html`]) {
    try {
      const body = await readFile(join(ROOT, candidate));
      res.writeHead(200, {
        "content-type": types[extname(candidate)] ?? "application/octet-stream",
      });
      return res.end(body);
    } catch {
      /* try the next candidate */
    }
  }
  res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
  res.end("Không tìm thấy");
}).listen(PORT, () => console.log(`http://127.0.0.1:${PORT}`));
```

Update `playwright.config.ts`'s `webServer.command` to `node --import tsx scripts/serve-static.ts`, and `git rm scripts/serve-preview.ts`.

- [ ] **Step 3: Write the e2e spec**

`tests/e2e/landing.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("renders all three poster sections", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText(
    "GIẢI CẦU LÔNG",
  );
  await expect(page.getByText("NỘI BỘ 2026")).toBeVisible();
  await expect(page.getByText("THỂ LỆ")).toBeVisible();
  await expect(page.getByText("TÀI TRỢ")).toBeVisible();
  await expect(page.getByText("KIM CƯƠNG")).toBeVisible();
});

test("hides the live sections while the tournament is empty", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByText("DANH SÁCH VĐV")).toHaveCount(0);
  await expect(page.getByText("BẢNG XẾP HẠNG")).toHaveCount(0);
  await expect(page.getByText("THU CHI")).toHaveCount(0);
});

test("tournament.json exposes no private field", async ({ request }) => {
  const res = await request.get("/tournament.json");
  expect(res.ok()).toBe(true);
  const body = await res.text();
  for (const key of ["phone", "skillBand", "feePayments"])
    expect(body).not.toContain(`"${key}"`);
});

test("does not scroll horizontally on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test("the page is a single route", async ({ request }) => {
  for (const path of ["/quan-tri/", "/van-dong-vien/", "/lich-thi-dau/"])
    expect((await request.get(path)).status()).toBe(404);
});
```

- [ ] **Step 4: Build and run the e2e suite**

Run: `pnpm build && pnpm test:e2e`
Expected: all 5 tests PASS.

- [ ] **Step 5: Look at the whole page**

Run `pnpm dev` and scroll the entire page at 1440 px and at 390 px, with all three poster JPGs open alongside. This is the deliverable the user cares most about — fix anything that does not read as the same design before committing.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(frontend): assemble the single-page landing site

One route: poster 1, poster 2, poster 3, then the live data. Playwright
serves the static export directly, and asserts the page has no other
routes and that tournament.json carries no private field.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ngui52jdFtBsdruwy1Awcc
EOF
)"
```

---

### Task 15: Rebuild the Terraform

**Files:**
- Create: `infra/main.tf`, `infra/variables.tf`, `infra/outputs.tf`, `infra/terraform.tfvars.example`
- Delete: `infra/envs/`, `infra/modules/`
- Modify: `infra/versions.tf`, `infra/test/architecture.test.ts`, `infra/README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: Terraform outputs `site_bucket_name`, `distribution_id`, `site_url`.

- [ ] **Step 1: Write the failing architecture test**

Rewrite `infra/test/architecture.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const main = readFileSync("infra/main.tf", "utf8");
const versions = readFileSync("infra/versions.tf", "utf8");

describe("infrastructure", () => {
  it("keeps the site bucket private", () => {
    expect(main).toContain("block_public_acls       = true");
    expect(main).toContain("restrict_public_buckets = true");
  });

  it("versions, encrypts and protects the site bucket", () => {
    expect(main).toContain("aws_s3_bucket_versioning");
    expect(main).toContain("aws_s3_bucket_server_side_encryption_configuration");
    expect(main).toContain("prevent_destroy = true");
  });

  it("serves the custom domain over its own certificate", () => {
    expect(main).toContain('aliases = ["giaicaulong2026.nghuy.link"]');
    expect(main).toContain("acm_certificate_arn");
    expect(main).not.toContain("cloudfront_default_certificate = true");
  });

  it("issues the certificate in us-east-1", () => {
    expect(main).toMatch(/provider\s+=\s+aws\.us_east_1/);
    expect(main).toContain('region = "us-east-1"');
  });

  it("creates the DNS records in the existing zone", () => {
    expect(main).toContain('data "aws_route53_zone" "root"');
    expect(main).toContain('name = "nghuy.link"');
    expect(main).toContain('type    = "A"');
    expect(main).toContain('type    = "AAAA"');
  });

  it("has no backend left", () => {
    for (const resource of [
      "aws_lambda_function",
      "aws_api_gateway_rest_api",
      "aws_cognito_user_pool",
      "aws_dynamodb_table",
    ])
      expect(main).not.toContain(resource);
    expect(versions).not.toContain("archive");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run infra/test/architecture.test.ts`
Expected: FAIL — `infra/main.tf` does not exist.

- [ ] **Step 3: Remove the old configuration**

```bash
git rm -r infra/envs infra/modules
```

- [ ] **Step 4: Write `infra/versions.tf`**

```hcl
terraform {
  required_version = ">= 1.10, < 2.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  backend "s3" {
    key     = "webminton/prod/terraform.tfstate"
    encrypt = true
  }
}
```

- [ ] **Step 5: Write `infra/variables.tf` and `infra/terraform.tfvars.example`**

`variables.tf`:

```hcl
variable "region" {
  type        = string
  description = "Vùng AWS cho bucket và CloudFront."
  default     = "ap-southeast-1"
}

variable "name_prefix" {
  type        = string
  description = "Tiền tố đặt tên tài nguyên."
  default     = "webminton"
}

variable "site_bucket_name" {
  type        = string
  description = "Tên bucket chứa bản build tĩnh."
}

variable "domain_name" {
  type        = string
  description = "Tên miền phục vụ trang."
  default     = "giaicaulong2026.nghuy.link"
}

variable "hosted_zone_name" {
  type        = string
  description = "Hosted zone Route53 chứa tên miền."
  default     = "nghuy.link"
}
```

`terraform.tfvars.example`:

```hcl
site_bucket_name = "webminton-site-<sửa-thành-tên-duy-nhất>"
```

- [ ] **Step 6: Write `infra/main.tf`**

```hcl
provider "aws" {
  region = var.region
}

# CloudFront certificates must live in us-east-1 regardless of the site region.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
}

data "aws_route53_zone" "root" {
  name         = "nghuy.link"
  private_zone = false
}

resource "aws_s3_bucket" "site" {
  bucket = var.site_bucket_name
  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_versioning" "site" {
  bucket = aws_s3_bucket.site.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "site" {
  bucket = aws_s3_bucket.site.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_public_access_block" "site" {
  bucket                  = aws_s3_bucket.site.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_acm_certificate" "site" {
  provider          = aws.us_east_1
  domain_name       = var.domain_name
  validation_method = "DNS"
  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_route53_record" "validation" {
  for_each = {
    for o in aws_acm_certificate.site.domain_validation_options :
    o.domain_name => { name = o.resource_record_name, type = o.resource_record_type, record = o.resource_record_value }
  }
  zone_id         = data.aws_route53_zone.root.zone_id
  name            = each.value.name
  type            = each.value.type
  records         = [each.value.record]
  ttl             = 60
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "site" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.site.arn
  validation_record_fqdns = [for r in aws_route53_record.validation : r.fqdn]
}

resource "aws_cloudfront_origin_access_control" "site" {
  name                              = "${var.name_prefix}-oac"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_function" "rewrite" {
  name    = "${var.name_prefix}-rewrite"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = "function handler(event) { var request = event.request; if (request.uri.endsWith('/')) request.uri += 'index.html'; else if (!request.uri.split('/').pop().includes('.')) request.uri += '/index.html'; return request; }"
}

resource "aws_cloudfront_distribution" "site" {
  enabled             = true
  default_root_object = "index.html"
  aliases             = ["giaicaulong2026.nghuy.link"]

  origin {
    origin_id                = "site"
    domain_name              = aws_s3_bucket.site.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.site.id
  }

  default_cache_behavior {
    target_origin_id       = "site"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    # Managed-CachingOptimized
    cache_policy_id = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.rewrite.arn
    }
  }

  # The data file must never be cached at the edge: uploading it is how
  # content is published without a rebuild.
  ordered_cache_behavior {
    path_pattern           = "/tournament.json"
    target_origin_id       = "site"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    # Managed-CachingDisabled
    cache_policy_id = "4135ea2d-6df8-44a3-9df3-4b5a84f5d6f3"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate_validation.site.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

resource "aws_s3_bucket_policy" "site" {
  bucket = aws_s3_bucket.site.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudfront.amazonaws.com" }
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.site.arn}/*"
      Condition = { StringEquals = { "AWS:SourceArn" = aws_cloudfront_distribution.site.arn } }
    }]
  })
}

resource "aws_route53_record" "site_a" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = var.domain_name
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_route53_record" "site_aaaa" {
  zone_id = data.aws_route53_zone.root.zone_id
  name    = var.domain_name
  type    = "AAAA"
  alias {
    name                   = aws_cloudfront_distribution.site.domain_name
    zone_id                = aws_cloudfront_distribution.site.hosted_zone_id
    evaluate_target_health = false
  }
}
```

Note the literal `aliases = ["giaicaulong2026.nghuy.link"]` and `name = "nghuy.link"` — the architecture test greps the HCL text, so these two must stay literal even though `var.domain_name` defaults to the same value.

- [ ] **Step 7: Write `infra/outputs.tf`**

```hcl
output "site_bucket_name" { value = aws_s3_bucket.site.id }
output "distribution_id" { value = aws_cloudfront_distribution.site.id }
output "site_url" { value = "https://${var.domain_name}" }
```

- [ ] **Step 8: Verify**

Run: `terraform -chdir=infra fmt -check && terraform -chdir=infra init -backend=false && terraform -chdir=infra validate && pnpm vitest run infra/test/architecture.test.ts`
Expected: fmt clean, validate succeeds, 6 tests PASS.

- [ ] **Step 9: Document the state migration in `infra/README.md`**

Add a section explaining, with commands, that: the old data bucket carries `prevent_destroy` and must be emptied and released deliberately (download `tournaments/noi-bo-2026/tournament.json` and its versions first, then remove the lifecycle block or `terraform state rm`); and that collapsing `envs/prod` + `modules/stack` into this root moves every address, so each surviving resource needs `terraform state mv 'module.stack.aws_s3_bucket.site' 'aws_s3_bucket.site'` and the same for the OAC, the function, the distribution and the bucket policy, before the first apply.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
feat(infra): reduce Terraform to static hosting plus the custom domain

One root configuration: a private, versioned, encrypted site bucket
behind CloudFront on giaicaulong2026.nghuy.link, with a DNS-validated
us-east-1 certificate and Route53 alias records. The Lambda, API
Gateway, Cognito pool and data bucket are gone.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ngui52jdFtBsdruwy1Awcc
EOF
)"
```

---

### Task 16: Deployment and CI

**Files:**
- Create: `scripts/deploy.sh`
- Rewrite: `scripts/smoke-deployment.ts`
- Modify: `.github/workflows/quality.yml`, `.github/workflows/deploy.yml`, `package.json`
- Delete: `.github/workflows/plan.yml` if it only planned the removed dev environment

**Interfaces:**
- Consumes: Terraform outputs from Task 15.
- Produces: `pnpm deploy`.

- [ ] **Step 1: Write `scripts/deploy.sh`**

```bash
#!/usr/bin/env bash
set -euo pipefail

BUCKET="${SITE_BUCKET:-$(terraform -chdir=infra output -raw site_bucket_name)}"
DIST="${DISTRIBUTION_ID:-$(terraform -chdir=infra output -raw distribution_id)}"
OUT=frontend/out

[ -d "$OUT" ] || { echo "Chưa có bản build. Chạy pnpm build trước."; exit 1; }

# Fingerprinted assets first, cached forever.
aws s3 sync "$OUT" "s3://$BUCKET" --delete \
  --cache-control "public, max-age=31536000, immutable" \
  --exclude "*.html" --exclude "tournament.json"

# Then the mutable entry points.
aws s3 sync "$OUT" "s3://$BUCKET" \
  --cache-control "no-cache" \
  --exclude "*" --include "*.html" --include "tournament.json"

aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" >/dev/null
echo "✓ Đã triển khai lên s3://$BUCKET và làm mới CloudFront."
```

Run `chmod +x scripts/deploy.sh` and add to `package.json`: `"deploy": "./scripts/deploy.sh",`.

The two-pass sync matters: the first pass must exclude the mutable files so they don't get a one-year cache header, and `--delete` belongs only on the first pass.

- [ ] **Step 2: Rewrite `scripts/smoke-deployment.ts`**

```ts
import { PublicTournamentSchema } from "../packages/domain/src/schema";

const base = process.env.SITE_URL ?? "https://giaicaulong2026.nghuy.link";
const problems: string[] = [];

const page = await fetch(base);
if (!page.ok) problems.push(`Trang chủ trả về ${page.status}`);
const html = await page.text();
if (!html.includes("GIẢI CẦU LÔNG")) problems.push("Trang chủ thiếu tiêu đề giải");

const data = await fetch(`${base}/tournament.json`);
if (!data.ok) problems.push(`tournament.json trả về ${data.status}`);
const cache = data.headers.get("cache-control") ?? "";
if (!cache.includes("no-cache"))
  problems.push(`tournament.json phải có no-cache, đang là "${cache}"`);

const body = await data.text();
for (const key of ["phone", "skillBand", "feePayments"])
  if (body.includes(`"${key}"`)) problems.push(`tournament.json lộ trường "${key}"`);

if (!PublicTournamentSchema.safeParse(JSON.parse(body)).success)
  problems.push("tournament.json không khớp schema");

if (problems.length) {
  for (const p of problems) console.error(`✗ ${p}`);
  process.exit(1);
}
console.log(`✓ ${base} hoạt động bình thường.`);
```

- [ ] **Step 3: Update `quality.yml`**

Keep the existing job shape; change the steps to: `pnpm install --frozen-lockfile`, `pnpm lint`, `pnpm typecheck`, `pnpm --filter @webminton/frontend typecheck`, `pnpm test`, `pnpm validate`, `pnpm build`, `pnpm exec playwright install --with-deps chromium`, `pnpm test:e2e`, then `terraform fmt -check -recursive infra` and `terraform -chdir=infra init -backend=false && terraform -chdir=infra validate`. Remove every step referencing `backend`, the Lambda zip, the dev environment, or the Cognito variables.

- [ ] **Step 4: Update `deploy.yml`**

Keep `ref: ${{ github.sha }}` and the OIDC role assumption. The job becomes: checkout → setup node/pnpm → install → `terraform -chdir=infra init` + `apply -auto-approve` → `pnpm build` → `pnpm deploy` (reading `SITE_BUCKET` and `DISTRIBUTION_ID` from the Terraform outputs) → `node --import tsx scripts/smoke-deployment.ts`.

Delete every `NEXT_PUBLIC_COGNITO_*` variable and the "build after reading Terraform outputs" ordering comment — the build no longer depends on any Terraform output. Remove the repo `vars` for Cognito from the documented requirements.

If `.github/workflows/plan.yml` only ran `terraform plan` for `envs/dev`, delete it; if it plans the prod configuration on pull requests, repoint it at `infra/`.

- [ ] **Step 5: Verify the whole gate locally**

Run: `pnpm lint && pnpm typecheck && pnpm --filter @webminton/frontend typecheck && pnpm test && pnpm validate && pnpm build && pnpm test:e2e`
Expected: every command exits 0.

Then lint the workflows: `git diff --stat .github/` and re-read both files top to bottom for a stale `backend` or `cognito` reference. Run `grep -rn "cognito\|lambda\|api_gateway\|backend/" .github/ scripts/ package.json -i` and expect no hits other than the Terraform S3 `backend` block.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
ci: deploy the static site and drop the backend pipeline

Two-pass sync so fingerprinted assets are immutable while HTML and
tournament.json stay no-cache, then an invalidation and a smoke check
that the live JSON parses and carries no private field.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ngui52jdFtBsdruwy1Awcc
EOF
)"
```

---

### Task 17: Documentation

**Files:**
- Rewrite: `CLAUDE.md`, `README.md`, `frontend/CLAUDE.md`
- Rewrite: `docs/runbooks/{bootstrap,operations,rollback}.md`
- Modify: `docs/implementation-progress.md`
- Delete: `frontend/AGENTS.md` if it duplicates `frontend/CLAUDE.md`

**Interfaces:**
- Consumes: everything built in Tasks 1–16.
- Produces: documentation that matches the code.

- [ ] **Step 1: Rewrite `CLAUDE.md`**

Delete the "One document, one writer", "Derived state is never trusted from input" (rewrite — derivation still matters, but happens in the browser), "Privacy boundary", "Auth" and "Errors" sections. Keep "Project", and rewrite the rest around: the two data files and which is deployed; `pnpm dev` / `validate` / `draw` / `build` / `deploy`; `packages/domain` being browser-safe with no `node:*` imports; the single page's section structure; the lint-scope caveat, which still applies.

State plainly that there is no backend, no database and no admin UI, and that editing the tournament means editing `frontend/public/tournament.json`.

- [ ] **Step 2: Rewrite `README.md`**

A short orientation and the workflow: clone, `pnpm install`, `pnpm dev`, edit `frontend/public/tournament.json`, `pnpm validate`, `pnpm build`, `pnpm deploy`. Include the draw flow: copy `.private/roster.example.json` to `.private/roster.json`, fill in athletes with skill bands, `pnpm draw <seed>`.

- [ ] **Step 3: Rewrite the runbooks**

- `bootstrap.md` — state bucket, `terraform init`, the `terraform state mv` migration from the old module layout, the deliberate removal of the data bucket, and the first apply. Note that the ACM validation can take a few minutes on first apply.
- `operations.md` — the tournament-day loop: edit `tournament.json`, `pnpm validate`, `pnpm build && pnpm deploy`; and the faster path of uploading only `tournament.json` and invalidating `/tournament.json`, which works because that path is `no-cache`.
- `rollback.md` — restore a previous S3 object version of `tournament.json`, or redeploy an earlier commit. Include the `aws s3api list-object-versions` and `get-object --version-id` commands.

- [ ] **Step 4: Write `frontend/CLAUDE.md`**

Document the design system: the tokens, the `.slab` / `.card` / `.pill` / `.disc` / `.photo-frame` / `.leaders` primitives, the hard-shadow and rotation conventions, and the rule that the posters in `assets/poster_designs/` are the reference — any visual change gets compared against them.

- [ ] **Step 5: Append to `docs/implementation-progress.md`**

A dated entry summarising the redesign and linking the spec and this plan.

- [ ] **Step 6: Verify the docs are true**

Re-read `CLAUDE.md` and `README.md` and run every command they name. Then `grep -rn "cognito\|Lambda\|API Gateway\|compare-and-swap\|If-Match\|roster-cli\|serve-local-api" *.md docs/ frontend/*.md -i` and expect hits only in the rollback/bootstrap history notes where they are deliberately describing what was removed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
docs: rewrite the guides for the static single-page site

CLAUDE.md, README and the runbooks now describe the JSON workflow and
the script commands instead of the compare-and-swap API, Cognito and
the roster CLI.

Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01Ngui52jdFtBsdruwy1Awcc
EOF
)"
```

---

## Final verification

- [ ] `pnpm install && pnpm lint && pnpm typecheck && pnpm --filter @webminton/frontend typecheck && pnpm test && pnpm validate && pnpm build && pnpm test:e2e` — all green.
- [ ] `grep -rn "node:" packages/domain/src/` — no output.
- [ ] `grep -E '"(phone|skillBand|feePayments)"' frontend/public/tournament.json` — no output.
- [ ] `du -sh frontend/out` — the built site is a few MB, not tens.
- [ ] `terraform -chdir=infra fmt -check && terraform -chdir=infra validate` — clean.
- [ ] The page at 1440 px and at 390 px reads as the same design as the three JPGs in `assets/poster_designs/`.
