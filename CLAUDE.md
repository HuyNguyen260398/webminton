# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Webminton runs one internal badminton tournament ("Giải cầu lông nội bộ 2026", club CN1416). All user-facing copy, error messages and route segments are Vietnamese — keep new strings Vietnamese too (`/van-dong-vien/`, `/boc-tham/`, `/lich-thi-dau/`, `/thu-chi/`, `/quan-tri/`).

Node 24 (`.nvmrc`), pnpm 10.32.1, ESM everywhere (`"type": "module"`).

## Commands

```bash
pnpm install
pnpm typecheck        # tsc over packages/domain, backend, scripts (frontend has its own)
pnpm test             # vitest run — domain, backend, scripts, infra unit tests
pnpm build            # pnpm -r build: domain tsc, backend esbuild bundle, next static export
pnpm test:e2e         # playwright; boots scripts/serve-preview.ts on :3100
pnpm lint             # prettier --check (see caveat below)
pnpm format
```

Single test: `pnpm vitest run packages/domain/test/draw.test.ts -t "name"`.
Single e2e: `pnpm exec playwright test tests/e2e/draw.spec.ts`.
Frontend typecheck is separate: `pnpm --filter @webminton/frontend typecheck`.

`pnpm test:e2e` needs a current `frontend/out` — run `pnpm build` first (CI does). The preview server accepts the bearer `local-test-token` as a BTC/admin session; e2e tests set it into `sessionStorage` under `webminton.session`.

`scripts/serve-local-api.ts` is the other local runner: it persists mutations to `.private/local-tournament.json` and only accepts `LOCAL_ADMIN_TOKEN` if that env var is set.

`pnpm roster -- <export|validate|diff|apply> --file .private/roster.json` edits the athlete list against a live deployment (needs `WEBMINTON_URL` + `WEBMINTON_ACCESS_TOKEN`); see `docs/runbooks/roster-config.md`. There is no roster UI by design.

### Lint caveat

`pnpm lint` only covers `packages data *.json *.yaml`. `backend/`, `frontend/` and `scripts/` are outside it, which is why several files there (notably `frontend/src/lib/auth.ts`, `use-admin.ts`, `admin-api.ts` and the `quan-tri` page) are hand-minified one-liners. Don't reformat them as a drive-by; running `pnpm format` will not touch them either.

## Architecture

### One document, one writer

The entire tournament is a single JSON document (`TournamentDocument`, `packages/domain/src/schema.ts`) stored at `tournaments/noi-bo-2026/tournament.json` in a versioned private S3 bucket. There is no database. Every mutation is a full-document compare-and-swap:

1. Client `GET /api/admin/tournament` → document + `ETag`.
2. Client `POST /api/admin/commands` with `If-Match: <etag>` and a `TournamentCommand`.
3. `backend/src/commands/dispatch.ts` re-reads, checks the etag, applies the command, re-derives, appends audit + request records, revalidates the schema, and `PutObject` with `IfMatch`.
4. S3 412/409 → `CONFLICT`; the UI keeps the draft and asks the user to reload.

Idempotency: every command carries a client-generated `requestId`. `document.requests` stores `{id, actorSub, payloadHash}`. A replayed `requestId` with the same actor and canonical payload hash returns `{replayed: true}` without writing; a mismatch is a `CONFLICT`. `useAdmin` (frontend) and `roster apply` (CLI) both hold the same `requestId` across retries.

Restore (`POST /api/admin/restore`) reads an S3 object version and rewrites it as a _new_ revision — history is never rewound.

Size limits are enforced in three places: request body 256 KB (router), document 1 MB (dispatch, restore, S3 repository).

### Derived state is never trusted from input

`packages/domain/src/derive.ts` recomputes `winnerTeamId`, standings, champion/runner-up/third/consolation, and per-category winners from match scores on every write. `advancement.ts::seedPlacement` wraps it and additionally creates or refreshes the six placement matches (`first_place`, `third_place` × 3 categories) once all 18 group matches are done. `dispatch.ts` and `restore.ts` call `seedPlacement` unconditionally before writing, so any hand-edited results field is corrected. If placement matches already have non-pending status and the seeding would change, it throws `PLACEMENT_RESET_REQUIRED` rather than silently discarding played matches.

### Domain rules worth knowing before editing

- Fixed format, encoded as `z.literal` in the schema: exactly 4 teams, 3 categories (men's/women's/mixed doubles), 6 encounters × 3 = 18 group matches + 6 placement matches = **24**.
- Scoring: 21 with 2-clear, cap 25 (`score.ts::isFinalScore`). A walkover is 21–0 for the present side and validated as such in `derive.ts`.
- Ranking order: `pointsFor`, `wins`, `difference`, then a manual tiebreak. A manual tiebreak (`resolveTie`) is bound to `resultsHash(t)` — it stops applying the moment any group score changes, which is deliberate.
- Draw (`draw.ts`): seeded PRNG, balanced by gender then skill band then team size, requires ≥8 active men and ≥8 active women and a `skillBand` on every active athlete. `generateDraw` produces a `draft`; `confirmDraw` requires the caller's `rosterHash` to match both the stored hash and a freshly computed one (`STALE_ROSTER`), then writes `teamId` onto athletes and generates group matches. Once confirmed, `replaceRoster` refuses membership/attribute changes (`ROSTER_LOCKED`).
- Lineup validation (`schedule.ts::validateLineup`) checks team membership, active status and gender composition per category; schedule conflicts (same court or same athlete in overlapping intervals) are rejected wholesale after any match mutation.

### Privacy boundary

`backend/src/projections/public-tournament.ts` is the only thing the unauthenticated `GET /api/public/tournament` returns. It strips phone numbers, notes, skill bands, `feePayments`, `audit`, `requests`, and draw internals; it hides unpublished lineups, hides team assignment until the draw is confirmed, hides the QR path until `qrPublished`, and returns only `{published: false}` for finance until BTC publishes. `tests/e2e/athletes-admin.spec.ts` asserts that `phone` and `feePayments` never appear in the payload — keep that true when adding fields.

### Auth

Cognito Hosted UI, Authorization Code + PKCE, implemented by hand in `frontend/src/lib/auth.ts` (no auth library). The access token lives in `sessionStorage`, never `localStorage`. API Gateway's Cognito authorizer gates `/admin/*`; `backend/src/auth.ts` then re-checks `iss`, `client_id`, `token_use === "access"`, membership in the `admins` group, and the `tournament/admin` scope.

Known gap: `infra/modules/stack/main.tf` currently grants the app client only `["openid", "email"]` and defines no resource server, so the `tournament/admin` scope that `auth.ts` requires and `beginLogin()` requests does not exist in Terraform yet. Anything touching admin auth end-to-end needs that added.

### Errors

`backend/src/errors.ts` is the single mapping from a thrown `Error(CODE)` to an HTTP status and a Vietnamese user message. Throw bare codes (`throw new Error("ROSTER_LOCKED")`) from domain and command code; add new codes to the `messages` map, and note that the status table falls through to 422 for codes matching the `INVALID_*|*_LOCKED|*_REQUIRED|*_EXISTS|...` pattern and 500 otherwise. An unmapped code leaks nothing but returns 500.

## Layout

- `packages/domain` — pure, dependency-free (except zod) tournament logic + the Zod schema that is the source of truth for both runtime validation and TypeScript types. `src/testing/fixtures.ts` builds documents from `data/tournament.seed.json`.
- `backend` — Lambda. `handler.ts` (APIGW adapter) → `router.ts` (routing, auth, etag, size) → `commands/*` (mutation) and `projections/*` (read). Storage is behind `TournamentRepository`; `S3Repository` in prod, `MemoryRepository` for tests and local servers. Bundled by esbuild to a single `dist/handler.cjs` (CJS is required — the AWS SDK's dynamic requires break under ESM bundling).
- `frontend` — Next.js App Router with `output: "export"`; **no server runtime**, so no server components fetching data, no route handlers, no `next/image` optimization. Data comes from client hooks (`use-tournament.ts` polls every 15s and on focus; `use-admin.ts` holds the document + etag + pending requestId). Types are imported across the workspace by relative path (`../../../packages/domain/src/schema`) and from the backend projection — changing a projection field changes the frontend's type immediately.
- `infra` — Terraform. `modules/stack` is shared; `envs/dev` and `envs/prod` differ only in variables and state key. `infra/test/architecture.test.ts` asserts invariants against the HCL text (buckets private/versioned/encrypted, `prevent_destroy`, public GET vs `COGNITO_USER_POOLS` admin methods, no DynamoDB) — it runs under `pnpm test`, so it fails if those properties are removed.
- `scripts` — local servers and operational tooling, all run via `node --import tsx`.
- `docs/runbooks` — bootstrap, operations, rollback, roster. `docs/implementation-progress.md` is the task-by-task build log.

## Deployment

`.github/workflows/quality.yml` (lint, typecheck, test, build, e2e, `terraform fmt`/`validate` for both envs) gates `deploy.yml`, which pins `ref: github.sha`, applies Terraform, builds the frontend _after_ reading Terraform outputs (Cognito domain/client id are build-time `NEXT_PUBLIC_*` values), uploads non-HTML immutable then HTML `no-cache`, invalidates CloudFront, and runs `scripts/smoke-deployment.ts`. Requires repo `vars` for the OIDC roles, region, state bucket and Cognito values; no real account values are committed.

Seeding is separate and create-only: `DATA_BUCKET=... node --import tsx scripts/seed-tournament.ts` uses `IfNoneMatch: "*"` and will never overwrite an existing tournament.
