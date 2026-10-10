# Webminton — admin backend and database

Date: 2026-10-10
Status: draft, awaiting review
Branch: `feat/admin-backend`

## Goal

Let the organiser run the tournament from any device. Scores, lineups, the draw,
athletes, finance and tournament info are edited on a responsive admin screen, stored
in a database on AWS, and appear on every visitor's page within about 20 seconds.

This deliberately reverses the 2026-09-14 decision to have no backend
(`2026-09-14-webminton-landing-redesign-design.md`, criterion 2). The reason: editing
JSON and running `aws s3 cp` from a laptop does not work courtside on a phone.

What the organiser asked for:

- One editor for now, from any device; the admin screen works on a phone and a big screen.
- Everything in `tournament.json` is editable online, including the draw.
- Sign in with Google.
- Least cost.

Assumptions (mine, agreed in conversation):

- It must be usable on tournament day, 2026-10-18.
- Visitors stay anonymous and read-only.
- Private fields (`phone`, `note`, `skillBand`) never reach the public page.

Success criteria:

1. A score entered on a 390px-wide phone shows on the public leaderboard within 20
   seconds, with no manual reload and no terminal.
2. Every field of `tournament.json` can be changed from `/quan-tri`.
3. Only allow-listed Google accounts can change anything.
4. `phone`, `note` and `skillBand` never appear in the served `tournament.json`.
5. If the backend is down, the public page still renders the last published snapshot.
6. No resource with a fixed monthly fee is added.
7. Every change is recorded with who and when, and any earlier version can be restored.

All user-facing copy and error messages stay Vietnamese.

## Architecture

```
visitor ──► CloudFront ──► S3  /tournament.json   (public snapshot, polled every 20 s)
                     │
admin ──► /quan-tri ─┤
   (Google sign-in   └──► /api/*  ──► HTTP API (JWT authorizer) ──► Lambda
    via Cognito)                                                     │
                                          DynamoDB  ◄────────────────┤  source of truth
                                          S3 /tournament.json  ◄─────┘  rewritten after each save
```

- DynamoDB is the source of truth. `tournament.json` in the site bucket becomes a
  published projection of it.
- The public page is unchanged except that it re-fetches the snapshot on a timer.
- `/api/*` is a second origin on the existing CloudFront distribution: same domain, no
  CORS, no new DNS record.

### Units

| Unit | Does | Depends on |
| --- | --- | --- |
| `packages/domain/src/commands.ts` | Command schema and `applyCommand(state, command, actor)` — pure, browser-safe | zod, the rest of `domain` |
| `backend/src/store.ts` | `TournamentStore` interface: read state, conditional write, history, restore. DynamoDB and in-memory implementations | AWS SDK (DynamoDB impl only) |
| `backend/src/publish.ts` | Builds the public projection and writes `tournament.json` | S3 client, `PublicTournamentSchema` |
| `backend/src/auth.ts` | Reads the verified JWT claims, checks the allow-list | — |
| `backend/src/router.ts` | Maps routes to store + commands + publish; maps errors to HTTP | the four above |
| `backend/src/handler.ts` | Lambda entry: wires real clients into the router | router |
| `frontend/src/app/quan-tri` + `features/admin/*` | Admin screen | `lib/admin-api.ts`, `lib/auth.ts`, design system |
| `frontend/src/lib/use-tournament.ts` | Adds polling to the existing hook | — |

`packages/domain` stays free of `node:*` imports. `applyCommand` is pure so it is tested
without AWS.

## Data model

One DynamoDB table, `pk` (string) + `sk` (string), on-demand billing, point-in-time
recovery on, deletion protection on, default encryption.

| `pk` | `sk` | Holds |
| --- | --- | --- |
| `T#noi-bo-2026` | `CURRENT` | `version` (number), `document` (a `TournamentDocument`), `private` (map of athlete id → `{ skillBand, phone, note }`), `recentRequests` (last 50 `{ requestId, version }`), `publishedVersion` |
| `T#noi-bo-2026` | `V#000042` | One per version: `version`, `at`, `actorEmail`, `commandType`, `requestId`, and the `document` and `private` **after** that change |

- A write is one `TransactWriteItems`: update `CURRENT` conditional on
  `version = baseVersion`, and put the new `V#` item.
- The document is about 10 KB; hundreds of versions stay far below any DynamoDB limit.
- Names, genders, `active` and `teamId` live only in `document.athletes`. The `private`
  map adds the three private fields by athlete id, so nothing is stored twice.
- `winnerTeamId` stays `null` in storage; `derive.ts` recomputes it, as today.

## API

All under `/api`. Errors are `{ code, message }` with a Vietnamese `message`.

| Route | Auth | Purpose |
| --- | --- | --- |
| `GET /api/config` | none | `{ cognitoDomain, clientId }` so the static build needs no `NEXT_PUBLIC_*` values |
| `GET /api/admin/state` | admin | `{ version, document, private, publishedVersion }` |
| `POST /api/admin/commands` | admin | Body `{ baseVersion, requestId, command }`. Returns the new state, `409 CONFLICT` if the version moved, `422` with the domain error code if the command is invalid |
| `POST /api/admin/draw/preview` | admin | Body `{ seed }`. Returns the assignment the seed would produce. Saves nothing |
| `POST /api/admin/publish` | admin | Rewrites `tournament.json` from `CURRENT` |
| `GET /api/admin/history` | admin | Versions, newest first: `version`, `at`, `actorEmail`, `commandType` |
| `POST /api/admin/restore` | admin | Body `{ baseVersion, requestId, version }`. Writes that version's content as a new version |

Write path for `POST /commands`:

1. If `requestId` is in `recentRequests`, return the current state (idempotent replay).
2. If `baseVersion` is not the current version, return `409`.
3. `applyCommand` produces the next `document` and `private`.
4. Parse the document with `PublicTournamentSchema` and run `deriveTournament`. Any
   failure is a `422`; nothing is written.
5. Transactional write (a failed condition is a `409`).
6. Publish the snapshot; on success set `publishedVersion`.
7. Return the new state, with `published: false` if step 6 failed.

### Commands

| Area | Command | Notes |
| --- | --- | --- |
| Thông tin | `updateInfo` | Partial `InfoSchema` |
| | `setCourts` | Refused if a match uses a removed court |
| | `updateTeam` | Name, colour, captain (captain must be on that team) |
| VĐV | `upsertAthlete` | Public fields + `skillBand`, `phone`, `note`. The server assigns the next `aNN` id for a new athlete |
| | `removeAthlete` | Refused if the athlete is in any lineup |
| | `setAthleteTeam` | Manual move; refused if the athlete is in a lineup for the old team |
| Bốc thăm | `confirmDraw` | Body `{ seed }`. Re-runs `generateDraw` with the seed, sets teams, creates the 18 group matches. Refused once any match is not `pending` (`DRAW_LOCKED`) |
| | `resetDraw` | Clears assignment, matches and tie decisions. Same lock |
| Trận đấu | `setLineup` | Checked with `validateLineup` |
| | `publishLineup` | Sets `lineupPublished` |
| | `setSchedule` | Court and start/end; schedule conflicts returned as warnings |
| | `callMatch` | `pending` → `called` |
| | `setScore` | Must satisfy `isFinalScore`; sets `completed` |
| | `setWalkover` | Absent side; stores 21–0 |
| | `clearResult` | Back to `pending`, score `null` |
| | `resolveTie` | Bound to `resultsHash`, as today |
| Thu chi | `upsertSponsor`, `removeSponsor`, `upsertIncome`, `removeIncome`, `upsertExpense`, `removeExpense`, `setFinancePublished` | |

Placement matches are seeded by `seedPlacement` inside `applyCommand` whenever a result
change completes the group stage, and reset by `resetPlacement` when a group result is
cleared or changed after seeding.

The draw rule is unchanged: at least 8 active men and 8 active women, each with a
`skillBand`. The current roster (12 men, 2 women) does not satisfy it. Changing the
format is out of scope here.

## Authentication

- Cognito user pool with Google as the only identity provider, hosted domain on
  `amazoncognito.com`, one public app client, authorization-code flow with PKCE.
- Callback URLs: `https://giaicaulong2026.nghuy.link/quan-tri/` and
  `http://localhost:3100/quan-tri/`.
- The admin page sends the **ID token** as `Authorization: Bearer`. The HTTP API's JWT
  authorizer verifies issuer, audience and signature on every `/api/admin/*` route.
- The Lambda then requires `email_verified` and an `email` in the `ADMIN_EMAILS`
  environment variable, set from the Terraform variable `admin_emails`. Otherwise `403`.
- ID token validity is 12 hours; there is no refresh-token handling. The token lives in
  `sessionStorage`.
- The Google client id and secret are Terraform variables (`google_client_id`,
  `google_client_secret`, the latter `sensitive`), supplied from the gitignored
  `terraform.tfvars` locally and from GitHub environment secrets in CI.

## Admin screen

Route `/quan-tri`, a second page in the same static export, `noindex`, not linked from
the public page.

- Tabs: `Trận đấu` (default) · `Đội & bốc thăm` · `VĐV` · `Thu chi` · `Thông tin` ·
  `Lịch sử`.
- Below 1024px: one column, tab bar fixed to the bottom, touch targets at least 44px.
- From 1024px: match list on the left, editor for the selected match on the right;
  tables replace stacked cards on the other tabs.
- Score entry: two large number fields with +/− steppers and a live validity message
  from `isFinalScore` before the save button enables.
- Draw: enter or generate a seed → preview the four teams → confirm.
- Header: signed-in email, sign-out, and "Đã công bố lúc …" with a `Công bố lại` button
  when `publishedVersion` is behind `version`.
- Built from the existing primitives (`Section`, `Card`, `Slab`, `Pill`) and tokens;
  hard shadows, no horizontal scroll at 390px.

## Public page

`useTournament` re-fetches `/tournament.json` every 20 seconds while the tab is visible
and once when it becomes visible again. A failed or invalid poll keeps the last good
view. Nothing else on the page changes.

## Failure handling

| Situation | Behaviour |
| --- | --- |
| Version moved (two tabs or devices) | `409`; the screen reloads state and shows "Dữ liệu vừa thay đổi — kiểm tra rồi lưu lại" |
| Same request sent twice | Second call returns the first result |
| Command breaks a rule | `422` with the domain code, mapped to a Vietnamese message; nothing saved |
| Saved, snapshot publish failed | Response has `published: false`; header shows `Công bố lại`; the next save republishes |
| Token expired | The unsaved edit is kept in memory/`sessionStorage`, the user signs in again and returns to the same tab |
| Email not allow-listed | `403`, "Tài khoản này không có quyền quản trị" |
| Backend down | Public page serves the last snapshot. Runbook fallback: edit the file, `pnpm validate`, `aws s3 cp`; re-seed the database from that file afterwards with `pnpm seed --force` |

## Infrastructure

Added to the single root Terraform configuration, region `ap-southeast-1`:

- `aws_dynamodb_table` as above.
- `aws_lambda_function`: `nodejs24.x`, arm64, 256 MB, 10 s timeout, one esbuild bundle
  from `backend/`. Log group retention 14 days.
- `aws_iam_role` for the Lambda: read/write on the table, `s3:PutObject` on exactly
  `<site bucket>/tournament.json`, and its own logs. Nothing else.
- `aws_apigatewayv2_api` (HTTP): `GET /api/config` open; `ANY /api/admin/{proxy+}` behind
  the JWT authorizer. Default throttling lowered to 20 requests/second.
- `aws_cognito_user_pool`, its Google identity provider, domain and app client.
- CloudFront: a new origin for the API and an ordered behaviour `/api/*` with caching
  disabled, all methods allowed, and the managed `AllViewerExceptHostHeader` origin
  request policy.

Not added, to keep fixed cost at zero: WAF, VPC or NAT, Secrets Manager, KMS customer
keys, provisioned capacity, a custom auth domain.

Expected cost for the tournament: a few cents, dominated by S3 reads from visitors
polling the snapshot.

## Deployment changes

- `scripts/deploy.sh` stops uploading `tournament.json`, and excludes it from
  `--delete`. Otherwise every deploy would overwrite live data with the repo copy.
- `frontend/public/tournament.json` stays in the repo as the seed and the local fixture.
- `pnpm seed` loads it into the table as version 1 and publishes. It refuses if the table
  already has a document unless `--force` is given.
- `deploy.yml` builds the backend bundle before `terraform apply`, and passes the Google
  credentials and `admin_emails` as `TF_VAR_*`.
- `infra/bootstrap` widens the GitHub deploy role to manage Lambda, DynamoDB, API
  Gateway, Cognito and the Lambda's IAM role. Applied once by the organiser from a laptop.
- `smoke-deployment.ts` additionally checks that `GET /api/config` answers and that
  `GET /api/admin/state` without a token returns `401`.

## Testing

- **Domain** (vitest): every command and every refusal — `DRAW_LOCKED`, athlete in a
  lineup, invalid score, invalid lineup, stale tie decision, placement seeding and reset.
- **Backend** (vitest, in-memory store): conflict, idempotent replay, restore, allow-list,
  publish failure, and that the projection never contains `phone`, `note` or `skillBand`.
- **Infra** (`architecture.test.ts`): the "has no backend left" test is replaced by: the
  table has PITR and deletion protection; every `/api/admin` route uses the JWT
  authorizer; the Lambda policy names only `tournament.json` in the site bucket; no
  `aws_wafv2_web_acl`, `aws_nat_gateway` or `aws_secretsmanager_secret` exists.
- **E2E** (Playwright): `scripts/serve-static.ts` gains an in-process API with the
  in-memory store and a test-only login. Specs: enter a score at 390px and see the public
  leaderboard change; no horizontal scroll on `/quan-tri` at 390, 768 and 1280; a `409`
  is surfaced; the existing landing checks, including the private-field assertion, stay
  green.

## Documentation

Rewritten for the new shape: `CLAUDE.md` (project summary, architecture, layout,
deployment), `docs/runbooks/bootstrap.md` (Google OAuth client, allow-list, deploy role),
`operations.md` (running the day from `/quan-tri`, the laptop fallback), `rollback.md`
(restore a version, point-in-time recovery), `infra/README.md`.

## Organiser prerequisites

1. Create a Google Cloud OAuth client of type "Web application" whose authorised
   redirect URI is `https://<cognito domain>/oauth2/idpresponse` (Terraform outputs the
   domain), and supply its client id and secret.
2. Confirm the allow-list. Default: `huynguyen260398@gmail.com`.
3. Apply the `infra/bootstrap` change once.

## Build order

Tournament day is eight days out, so each stage is usable on its own:

1. Domain commands, backend, infrastructure, sign-in, seed, deploy-script change.
2. `Trận đấu` tab (scores, walkovers, lineups, schedule, ties) and public polling.
3. `Đội & bốc thăm` and `VĐV` tabs.
4. `Thu chi`, `Thông tin`, `Lịch sử` tabs.
5. Runbooks and `CLAUDE.md`.

If time runs short after stage 2, the remaining areas are handled by editing the seed
file and running `pnpm seed --force` before the day.

## Out of scope

- Live push (WebSockets); polling is enough at this size.
- More than one tournament.
- Changing the format or the 8 men / 8 women draw rule.
- Uploading images (the QR and photos still ship with the build).
- Roles beyond a single admin level.
