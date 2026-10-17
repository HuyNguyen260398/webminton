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

The public page is static. The organiser edits the tournament at `/quan-tri`
(Google sign-in, allow-listed emails); a Lambda stores it in DynamoDB and
rewrites `tournament.json` in the site bucket after every save. The public
page reads only that file and re-reads it every 20 seconds.

Node 24 (`.nvmrc`), pnpm 10.32.1, ESM everywhere (`"type": "module"`).

## Commands

```bash
pnpm install
pnpm dev              # next dev on :3000 + local admin API on :3100
pnpm dev:cloud        # the same, over the REAL table and live tournament.json
pnpm dev:demo         # fill a running `pnpm dev` with a giải ready to referee
pnpm typecheck        # tsc over packages/domain and scripts
pnpm --filter @webminton/frontend typecheck   # the frontend is separate
pnpm test             # vitest — domain, scripts, frontend, infra
pnpm validate         # parse + re-derive frontend/public/tournament.json
pnpm draw <seed>      # balanced draw from .private/roster.json
pnpm seed [--force]   # load frontend/public/tournament.json into the table
pnpm build            # domain tsc + next static export to frontend/out
pnpm test:e2e         # playwright; boots scripts/serve-static.ts on :3100
pnpm run deploy       # sync frontend/out to S3 + invalidate CloudFront
pnpm lint / pnpm format
```

Single test: `pnpm vitest run packages/domain/test/draw.test.ts -t "name"`.
Single e2e: `pnpm exec playwright test tests/e2e/landing.spec.ts`.

`pnpm test:e2e` needs a current `frontend/out` — run `pnpm build` first (CI does).
It reuses whatever answers on :3100 and resets it, so with `pnpm dev` running
use `E2E_PORT=3199 pnpm test:e2e` to give the suite a server of its own.

`pnpm dev` (`scripts/dev.ts`) starts two servers: `next dev` on :3000 and
`scripts/serve-static.ts` on :3100. In development only, `next.config.ts`
rewrites `/api/*` and `/tournament.json` to :3100, so
`http://localhost:3000/quan-tri/` works with hot reload. That server runs the
real router over an in-memory store seeded from the test fixture (not from
`frontend/public/tournament.json`) and offers a "Đăng nhập thử" button instead
of Google; restarting it resets the data. Once an admin save publishes, the
public page on :3000 shows that snapshot. `pnpm dev` also works from
`frontend/`.

`pnpm dev:demo` (`scripts/seed-demo.ts`), run beside `pnpm dev`, resets that
in-memory store and loads two teams of seven, the twelve bảng đấu matches, all
with pairs (one done, one live, ten ready to start), the referee
code `123456` and refereeing open. It begins with `/api/test/reset`, which only
`pnpm dev` answers, so it cannot write to `dev:cloud` or the deployed site.

`pnpm dev:cloud` is the same pair over the **real** table and site bucket,
with the API on :3200. Table and bucket names come from `TABLE_NAME` /
`SITE_BUCKET` or the Terraform outputs, credentials from the AWS profile. A
save there is a save on the live site: it writes the table and republishes
`tournament.json`, recorded in the history as `admin@example.com`. It never
seeds or resets, and `/api/test/reset` is off. The separate port matters —
Playwright reuses whatever answers on :3100, so a cloud server there would
have the e2e suite editing live data.

To test the built site instead, run
`pnpm build`, then `node --import tsx scripts/serve-static.ts` and open
`http://127.0.0.1:3100/quan-tri/`.

`pnpm install` rewrites `pnpm-lock.yaml` in a style `pnpm lint` rejects; run
`pnpm format` after adding a dependency.

**`pnpm run deploy`, not `pnpm deploy`** — a bare `pnpm deploy` resolves to
pnpm's own workspace-deploy command and never reaches `scripts/deploy.sh`.

`node scripts/screenshot.mjs <url> <out.png> [w] [h] [full]` renders a served
page to a PNG for comparing sections against the poster JPGs.

### Lint caveat

`pnpm lint` only covers `packages frontend/public/tournament.json *.json *.yaml`.
`frontend/`, `backend/` and `scripts/` are outside it, so `pnpm format` will not touch them.

## Architecture

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

Changing a group score after a placement match has been played is refused
(`PLACEMENT_RESET_REQUIRED`) when it would change who plays whom; un-played
placement matches are re-seeded automatically.

### The athletes' own team draw

`/boc-tham` lets each athlete pick their name and roll for a team, once. It is
the one public write: `POST /api/team-draw { athleteId }`, an API Gateway
route with no authorizer and its own tight throttle. The Lambda does the roll
(`packages/domain/src/team-draw.ts`), saves it through `setAthleteTeam` and
publishes, all against one read of the table; a version collision between two
athletes rolling at once is retried. History shows these as `tu-boc-tham`.

- It only works while `draw.status` is `"open"`, which the organiser toggles
  in the `Đội` tab (`setTeamDrawOpen`). A confirmed four-team draw cannot be
  opened.
- Only two teams take part, `SELF_DRAW_TEAM_IDS` (`red`, `blue`).
- A team is open to an athlete only if the draw can still end level: every
  gender × trình độ group split in half (give or take the odd one) and the two
  teams the same size (give or take one). Counted from stored state, so a
  manual move in the admin screen is respected.
- Levels stay private: the browser sends a name and receives a team. There is
  no identity check — the confirmation pop-up is the only guard — and undoing a
  roll is setting that athlete back to "chưa xếp đội" in the `Đội` tab.

### The two-team bảng đấu

The giải is now Đội Đỏ against Đội Xanh, and that lives in `document.duel`,
beside — not inside — the four-team `matches` engine, which is dormant unless
a four-team draw is confirmed. `packages/domain/src/duel.ts` owns it.

- `createDuel` lays out twelve matches: ten vòng loại (eight đôi nam, two đôi
  nam nữ) and two finals. With six men and one woman a side that is exactly
  three vòng loại matches per man and two per woman, the thể lệ minimum. `resetDuel` removes them.
- `saveDuelMatch` carries a whole match in one save: both pairs, the status
  (`pending` → `live` → `done`), the final score and the smash counts
  (`hit` = smash ăn điểm, `net` = smash rúc lưới, per athlete per match).
- `deriveDuel(t)` computes, in the browser, the team totals (every point
  scored, finals doubled), matches won, the leader, and the two smash tables
  summed across matches. Nothing of that is stored.
- Pairs are validated for team, gender and active status on every save
  (`finalize` re-checks all of them). How many matches each athlete plays is
  shown to the organiser but not enforced.
- Pairs are rendered publicly as soon as they are saved, on every match
  (`Chưa xếp cặp` until then). `BẢNG ĐẤU` lays matches out two per row
  (one on a phone) and names players by their given name, the last word
  (`DuelBoard.tsx::shortNames`; the last two where two athletes share one).
- There are two courts, sân 13 and 14 (`DuelBoard.tsx::DUEL_COURTS`).
  Matches go on two at a time in `order`, so each match is labelled
  `Lượt N · Sân 13/14` (`DuelBoard.tsx::duelSlot`) on the
  public board and the referees' list. It is derived, not stored.
- Two organisers scoring two courts: a stale `saveDuelMatch` is accepted when
  the match itself is unchanged since the version the screen was on
  (`router.ts::sameDuelMatch`). Any other command is also accepted stale when
  every version in between was a referee's save (`router.ts::staleButSafe`) —
  otherwise live scoring would make the off switch and every fee tick a `409`.
  Every other stale command is still a `409`.

In the admin screen the `Trận` tab is `DuelTab` unless a four-team draw is
confirmed, in which case it is the old `MatchesTab`. The public page shows
`BẢNG ĐẤU` and `SMASH OF THE DAY` once the bảng đấu exists.

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
- Restoring an old version keeps the current code and the current on/off
  switch.
- The organiser may enter a list of referee names in the same card
  (`setRefereeNames` → `document.refereeNames`). With a list, a referee picks
  their name before `Bắt đầu trận`; it is stored on the match
  (`DuelMatch.referee`) and shown in the admin screen, the referee's match
  list and under the match on the public `BẢNG ĐẤU`. It is a label, not an
  identity check. A save that leaves `referee` out keeps whoever has the
  match; `null` clears it.
- The referee always sends the whole match, so an organiser's edit of a live
  match can be overwritten by the referee's next tap. The admin editor says so.
- The page keeps a draft of the open match (`lib/use-referee.ts`) and saves it
  500ms after the last tap. The draft and its save queue are kept per match
  for the life of the page, so leaving a match and reopening it loses nothing. The poll of `tournament.json` replaces the draft
  only when nothing is unsaved and the snapshot is not older than the page's
  own last save.
- Live scoring adds 40–60 versions per match. That is expected.

### Derived state is never stored

The JSON stores **facts only**: match scores, team membership, finance lines.
`packages/domain/src/derive.ts` recomputes `winnerTeamId`, standings,
champion/runner-up/third/consolation and per-category winners **in the browser**
on every load. There is no stored standings table to disagree with a hand edit.

`deriveTournament(t)` returns a `DerivedResults` object; it does not return a
document. Components take `{ t, derived }` and read results from `derived`.

`applyCommand` nulls every `winnerTeamId` before saving for the same reason.

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

`frontend/src/app/boc-tham/page.tsx` is the team draw above; the landing page
links to it (`TeamDrawCta`) only while the draw is open, and shows `HAI ĐỘI`
once anyone has rolled.

The landing page is `frontend/src/app/page.tsx`: poster 1 → `ĐĂNG KÝ THI ĐẤU` → marquee
→ poster 2 → `GIẢI THƯỞNG` → poster 3 → the live data sections → a `<details>`
linking the original JPGs.

`features/landing/Prizes.tsx` is `GIẢI THƯỞNG`: fixed copy with no poster and
no data behind it, so it is always on the page — a gold medal for each member
of the winning team, silver for the runner-up, and one prize each for `MÁY
ĐÓNG GẠCH` and `VUA PHÁ LƯỚI`, kept secret until after the giải.

`features/landing/SiteNav.tsx` is the sticky bar at the top. It lists only the
sections that are on the page right now: it and `LiveSections` both read
`features/landing/sections.ts::pageSections`, so add a section's condition
there and the bar cannot link to something that is not rendered. On a phone
the bar scrolls sideways inside itself.

Once the organiser starts the giải — the `Bắt đầu giải` switch at the top of
the admin screen's `Giải` tab, `info.started` through `updateInfo` — `BẢNG
ĐẤU` and `SMASH OF THE DAY` move above poster 1 and to the front of the bar
(`LiveSections.tsx::DuelSections`, `pageSections().started`). The switch moves
those two sections and nothing else; it needs the bảng đấu to exist, and a
document without the field counts as not started.

`features/landing/Registration.tsx` is the one section with no poster behind
it: a link to the Microsoft Form in `info.registrationFormUrl`. It **renders
nothing when that field is null or `info.registrationOpen` is false**. The
organiser closes and reopens registration with the `Đăng ký thi đấu` switch at
the top of the admin screen's `Giải` tab, which keeps the link — no rebuild.
A document without `registrationOpen` counts as open.

`features/landing/LiveSections.tsx` renders `DANH SÁCH VĐV`, `BỐN ĐỘI`,
`LỊCH THI ĐẤU`, `BẢNG XẾP HẠNG` and `THU CHI` — each **hides itself when its
data is empty**, so the page fills in as the tournament progresses with no
code change.

### The admin screen

`frontend/src/app/quan-tri/page.tsx` is the shell: sign-in, a status bar, and
the tabs registered in `features/admin/tabs.tsx` (`Trận`, `Đội`, `VĐV`,
`Thu chi`, `Giải`, `Lịch sử`). `lib/use-admin.ts` owns the state and is the
only caller of the API; a tab receives `admin` and calls `admin.send(command)`.
Phone first: one column with the tab bar fixed to the bottom, two panes from
1024px, touch targets at least 44px. `noindex`, and not linked from the page.

## Layout

- `packages/domain` — pure, dependency-free (except zod) tournament logic plus
  the Zod schema that is the source of truth for runtime validation and types.
  `src/testing/fixtures.ts` inlines a seed document (there is no seed file: the
  package must be importable from the browser, where there is no filesystem).
- `backend` — the Lambda: `router.ts` (transport-neutral `route(req, deps)`),
  `store.ts` (`TournamentStore` + `MemoryStore`), `dynamo-store.ts`,
  `publish.ts`, `auth.ts`, `errors.ts` (code → status + Vietnamese message),
  `handler.ts`. Bundled by `backend/build.mjs` to `backend/dist/index.mjs`.
  Real AWS clients are constructed only in `aws.ts`.
- `frontend` — Next.js App Router with `output: "export"`; **no server
  runtime**. `/quan-tri` is a second static page whose tabs live in
  `features/admin/` and whose styles are `src/styles/admin.css`. `/trong-tai`
  is a third, with its screens in `features/referee/` and its styles in
  `src/styles/referee.css`. Types are
  imported across the workspace by relative path
  (`../../../packages/domain/src/schema`). The public design system lives in
  `src/styles/poster.css` and `features/landing/primitives.tsx`.
- `infra` — one root Terraform configuration: the site bucket, CloudFront,
  ACM, Route53 (`main.tf`); the table, Lambda, its role and the HTTP API
  (`backend.tf`); Cognito with Google as the only identity provider
  (`auth.tf`). `infra/test/architecture.test.ts` asserts the invariants
  against the HCL text: admin routes behind the JWT authorizer, the two open write routes
  throttled, the Lambda
  able to write only `tournament.json`, PITR and deletion protection on the
  table, and no resource with a fixed monthly fee.
- `scripts` — `validate-tournament.ts`, `draw-teams.ts`, `seed.ts`,
  `serve-static.ts` (with `local-api.ts`),
  `optimize-assets.ts`, `smoke-deployment.ts`, `deploy.sh`, `screenshot.mjs`.
- `docs/runbooks` — bootstrap, operations, rollback.

## Deployment

`.github/workflows/quality.yml` (lint, both typechecks, test, validate, build,
e2e, `terraform fmt`/`validate`) gates `deploy.yml`, which pins
`ref: github.sha`, builds, applies Terraform, syncs in two passes and
invalidates, then runs `scripts/smoke-deployment.ts`. `pnpm build` runs before
Terraform because the Lambda zip is made from `backend/dist`. The static build
still needs no Terraform output: the admin page fetches its Cognito domain and
client id from `GET /api/config`.

The deploy role can converge existing resources but not create them: the first
apply of new infrastructure is a local one (`docs/runbooks/bootstrap.md`).

Cache headers: `/_next/static/*`, `/photos/*`, `/qr/*` immutable for a year;
`*.html` and `/tournament.json` `no-cache`. `/tournament.json` and `/api/*` are
served with caching disabled, so an admin save is live as soon as the Lambda
has written the file — no invalidation.
