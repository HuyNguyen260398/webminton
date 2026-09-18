# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Webminton is a **single static page** for one internal badminton tournament
("Giải cầu lông nội bộ 2026", club CN1416), served at
`https://giaicaulong2026.nghuy.link`. All user-facing copy and error messages
are Vietnamese — keep new strings Vietnamese too.

The page is a faithful web rendition of the three posters in
`assets/poster_designs/`. **Those JPGs are the design reference**: compare any
visual change against them before committing.

There is no backend, no database and no admin UI. Editing the tournament means
editing `frontend/public/tournament.json`.

Node 24 (`.nvmrc`), pnpm 10.32.1, ESM everywhere (`"type": "module"`).

## Commands

```bash
pnpm install
pnpm dev              # next dev on :3000
pnpm typecheck        # tsc over packages/domain and scripts
pnpm --filter @webminton/frontend typecheck   # the frontend is separate
pnpm test             # vitest — domain, scripts, frontend, infra
pnpm validate         # parse + re-derive frontend/public/tournament.json
pnpm draw <seed>      # balanced draw from .private/roster.json
pnpm build            # domain tsc + next static export to frontend/out
pnpm test:e2e         # playwright; boots scripts/serve-static.ts on :3100
pnpm run deploy       # sync frontend/out to S3 + invalidate CloudFront
pnpm lint / pnpm format
```

Single test: `pnpm vitest run packages/domain/test/draw.test.ts -t "name"`.
Single e2e: `pnpm exec playwright test tests/e2e/landing.spec.ts`.

`pnpm test:e2e` needs a current `frontend/out` — run `pnpm build` first (CI does).

**`pnpm run deploy`, not `pnpm deploy`** — a bare `pnpm deploy` resolves to
pnpm's own workspace-deploy command and never reaches `scripts/deploy.sh`.

`node scripts/screenshot.mjs <url> <out.png> [w] [h] [full]` renders a served
page to a PNG for comparing sections against the poster JPGs.

### Lint caveat

`pnpm lint` only covers `packages frontend/public/tournament.json *.json *.yaml`.
`frontend/` and `scripts/` are outside it, so `pnpm format` will not touch them.

## Architecture

### Two data files, one of them deployed

- **`frontend/public/tournament.json`** — the only data that ships. Fetched by
  the browser, validated with zod, and rendered. Public fields only.
- **`.private/roster.json`** — gitignored, holds `phone`, `note` and
  `skillBand`. Only `pnpm draw` reads it; `roster.example.json` is the template.

Whatever is in the public file is readable by anyone. The old server-side
privacy projection is gone, so private fields must be **absent from the file**,
not filtered. `PublicTournamentSchema` is a `z.strictObject`, so an athlete
carrying `phone` fails validation — and `tests/e2e/landing.spec.ts` asserts that
`phone`, `skillBand` and `feePayments` never appear in the served JSON. Keep
that true.

### Derived state is never stored

The JSON stores **facts only**: match scores, team membership, finance lines.
`packages/domain/src/derive.ts` recomputes `winnerTeamId`, standings,
champion/runner-up/third/consolation and per-category winners **in the browser**
on every load. There is no stored standings table to disagree with a hand edit.

`deriveTournament(t)` returns a `DerivedResults` object; it does not return a
document. Components take `{ t, derived }` and read results from `derived`.

### packages/domain must stay browser-safe

It is bundled into the page, so **no `node:*` imports anywhere in
`packages/domain/src`**. `hash.ts` is a pure-TS SHA-256 that exists for exactly
this reason; its digests are byte-identical to `node:crypto`, which is what
keeps stored `sourceResultsHash` values matching.

### Domain rules worth knowing before editing

- Fixed format, encoded as `z.literal`: exactly 4 teams, 3 categories
  (men's/women's/mixed doubles), 6 encounters × 3 = 18 group matches + 6
  placement matches = **24**.
- Scoring: 21 with 2-clear, cap 25 (`score.ts::isFinalScore`). A walkover is
  21–0 for the present side and validated as such in `derive.ts`.
- Ranking: `pointsFor`, `wins`, `difference`, then a manual tiebreak. A manual
  tiebreak is bound to `resultsHash(t)` — it stops applying the moment any group
  score changes, which is deliberate.
- Draw (`draw.ts`): seeded PRNG, balanced by gender then skill band then team
  size; requires ≥8 active men, ≥8 active women and a `skillBand` on every
  active athlete. `generateDraw(roster, teams, seed)` takes the **private
  roster**, not a document, so skill bands never reach the public file.
- Lineup validation (`schedule.ts::validateLineup`) checks team membership,
  active status and gender composition per category. An unpublished lineup
  (`lineupPublished: false`) is not rendered — teams must not learn the opposing
  pairs before the organisers call them.

### The page

One route, `frontend/src/app/page.tsx`: poster 1 → `ĐĂNG KÝ THI ĐẤU` → marquee
→ poster 2 → poster 3 → the live data sections → a `<details>` linking the
original JPGs.

`features/landing/Registration.tsx` is the one section with no poster behind
it: a link to the Microsoft Form in `info.registrationFormUrl`. It **renders
nothing when that field is null**, so registration closes with a one-field edit
to `tournament.json` and an invalidation — no rebuild.

`features/landing/LiveSections.tsx` renders `DANH SÁCH VĐV`, `BỐN ĐỘI`,
`LỊCH THI ĐẤU`, `BẢNG XẾP HẠNG` and `THU CHI` — each **hides itself when its
data is empty**. With the shipped file the page is purely the posters, and it
fills in as the tournament progresses with no code change.

## Layout

- `packages/domain` — pure, dependency-free (except zod) tournament logic plus
  the Zod schema that is the source of truth for runtime validation and types.
  `src/testing/fixtures.ts` inlines a seed document (there is no seed file: the
  package must be importable from the browser, where there is no filesystem).
- `frontend` — Next.js App Router with `output: "export"`; **no server
  runtime**. Types are imported across the workspace by relative path
  (`../../../packages/domain/src/schema`). The design system lives in
  `src/styles/poster.css` and `features/landing/primitives.tsx`.
- `infra` — one root Terraform configuration: private/versioned/encrypted S3
  bucket, CloudFront, ACM in `us-east-1`, Route53 alias records.
  `infra/test/architecture.test.ts` asserts those invariants against the HCL
  text and that no Lambda/API Gateway/Cognito/DynamoDB resource returns.
- `scripts` — `validate-tournament.ts`, `draw-teams.ts`, `serve-static.ts`,
  `optimize-assets.ts`, `smoke-deployment.ts`, `deploy.sh`, `screenshot.mjs`.
- `docs/runbooks` — bootstrap, operations, rollback.

## Deployment

`.github/workflows/quality.yml` (lint, both typechecks, test, validate, build,
e2e, `terraform fmt`/`validate`) gates `deploy.yml`, which pins
`ref: github.sha`, applies Terraform, builds, syncs in two passes and
invalidates, then runs `scripts/smoke-deployment.ts`. The build needs no
Terraform output — there are no `NEXT_PUBLIC_*` values any more.

Cache headers: `/_next/static/*`, `/photos/*`, `/qr/*` immutable for a year;
`*.html` and `/tournament.json` `no-cache`. That last one is what lets a content
edit go live by uploading one small file and invalidating, with no rebuild.
