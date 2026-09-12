# Implementation progress

Branch: `feat/webminton-implementation`. Each completed task gets a separate commit.

## Task 1

- Added strict shared schemas, command contracts, clean production seed and synthetic roster helper.
- Red: 3 validation tests failed against permissive schema. Green: all 4 schema tests pass; TypeScript check passes.
- Node 24.20.0, pnpm 10.32.1, TypeScript 7.0.2, Vitest 5.0.0, Zod 4.6.2 pinned. Next.js 16.3.5 engine compatibility checked for frontend task; provider/action pins remain in infrastructure tasks.
- Completed-group fixture intentionally added with Task 3 to avoid a forward dependency on the scoring engine.
- pnpm launcher stalls in the sandbox while resolving its managed version; direct Node 24 invocations of the installed test/typecheck tools produce the verification above.

AWS deployment/integration and GitHub environment checks remain pending credentials and deployment inputs. No cloud resources created.

## Task 2

- Scoring, 21–0 walkovers and six round-robin encounters implemented.
- Red: 10 behavioral failures; green: 23 total tests pass, TypeScript passes.
- Task 1 commit: `7990590`.

## Task 3

- Implemented standings, hash-bound manual tiebreaks, placement seeding, majority awards, and upstream correction/reset protection. Added completed-group fixture.
- Red: 5 initial failures; corrected test fixture to truly alter seeding. Green: 31 total tests and TypeScript pass.
- Task 2 commit: `1576eff`.

## Task 4

- Balanced seeded draw and roster-bound confirmation implemented.
- Red: 6 failures; green: 37 total tests, including 400 seeded roster cases, and TypeScript pass.
- Task 3 commit: `a493129`.

## Task 5

- Lineup eligibility, interval scheduling conflicts and identity-preserving order implemented.
- Red: 3 failures; green: 40 tests and TypeScript pass.
- Task 4 commit: `140a32f`.

## Task 6

- Cash/budget accounting, equal-tier sponsorships, JSON roster validation/diff/apply and CLI implemented.
- Red: 6 failures; green: 46 total tests, root TypeScript passes. API transport integration follows in Task 7.
- Task 5 commit: `2f427fa`.

Task 6 CLI smoke: fixed root ESM declaration and invoked via node --import tsx; validate accepts clean empty roster. Re-ran all 46 tests and root typecheck successfully.

## Task 7

- Protected HTTP routing, filtered public projection, command validation/audit/idempotency, CAS S3 adapter, version restore, local runner and create-only seed tool implemented.
- Red: 5 command/auth failures and 3 routing/restore failures; green: 56 tests, root TypeScript and Lambda CJS build/load smoke pass.
- S3 adapter checked with a controlled transport enforcing conditional headers; live AWS integration remains Task 12. Local runner identity never enters Lambda bundle.
- Fixed direct node_modules import in seed tool and AWS SDK dynamic-require incompatibility by exporting the client factory and bundling Lambda as handler.cjs.
- Task 6 commit: `5d80fef`.

## Task 8

- Next.js static export, Vietnamese navigation, live tournament landing, rules, sponsor tiers and original poster links implemented.
- Browser red: missing heading in scaffold. Green: 2 Playwright cases at 1440/390px, static build/typecheck passes.
- Visually inspected full-page desktop and mobile screenshots: poster palette, hierarchy and borders preserved; no horizontal overflow.
- Installed matching Chromium 1243 for Playwright 1.63.0. Preview API runs only from scripts/serve-preview.ts, outside production bundle.
- Task 7 commit: `9368ac9`.

## Task 9

- Cognito PKCE session, public read-only athlete list, tournament/court settings, and version restore UI implemented.
- Red: missing `configureCourts` command. Green: 57 Vitest tests, TypeScript, frontend static build, and two Playwright admin/athlete flows pass.
- Task 8 commit: `2d47c2a`.
