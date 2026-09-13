# Webminton — single-page landing redesign

Date: 2026-09-14
Status: approved, ready for implementation planning
Branch: `feat/webminton-implementation`

## Goal

Turn Webminton from a five-route application backed by a Lambda + S3 compare-and-swap
write path into a **single static page** whose design is a faithful web rendition of the
three posters in `assets/poster_designs/`, driven by one JSON file that ships with the app
and is edited locally.

Success criteria:

1. The site is one route. Scrolling it reproduces poster 1, then poster 2, then poster 3,
   then the live tournament data.
2. There is no backend. No Lambda, no API Gateway, no Cognito, no data bucket.
3. All content comes from `frontend/public/tournament.json`, editable in a text editor.
4. No phone number, note, skill band or per-person payment record is reachable from the
   deployed site.
5. `https://giaicaulong2026.nghuy.link` serves the site over HTTPS, provisioned entirely
   by `terraform apply`.

All user-facing copy stays Vietnamese.

## Architecture

A static export served from S3 through CloudFront. No server runtime of any kind.

```
.private/roster.json  ──(pnpm draw)──▶  frontend/public/tournament.json
   (gitignored,                              (public facts only)
    phone/skillBand)                                │
                                                    │ fetch on load
                                                    ▼
                                        browser: zod parse ──▶ deriveTournament()
                                                                      │
                                                                      ▼
                                                          one page, poster sections
                                                          + live data sections
```

### Removed

- `backend/` in its entirety — handler, router, auth, `commands/*`, `projections/*`,
  `storage/*`, and all `backend/test/*`.
- `frontend/src/lib/auth.ts`, `use-admin.ts`, `admin-api.ts`.
- `frontend/src/app/{quan-tri,van-dong-vien,boc-tham,lich-thi-dau,thu-chi}/`.
- `frontend/src/features/admin/*`, `features/finance/FinanceEditor.tsx`,
  `features/matches/MatchEditor.tsx`, `features/draw/DrawWheel.tsx`.
- `scripts/serve-local-api.ts`, `seed-tournament.ts`, `roster-cli.ts`, `roster-config.ts`,
  `make-local-data.ts`, `serve-preview.ts`.
- `packages/domain/src/commands.ts` — the compare-and-swap mutation layer.
- `infra/envs/dev/`, and from the stack: Cognito, API Gateway, Lambda, the data bucket,
  and the `archive` provider.
- `docs/runbooks/roster-config.md`, and the parts of the other runbooks describing the
  API and Cognito.

### Kept

- `packages/domain` — `schema`, `score`, `standings`, `derive`, `advancement`, `draw`,
  `round-robin`, `schedule`, `finance`, and their tests. Still pure, zod its only
  dependency. It is now consumed by the browser and the local scripts rather than a Lambda.
- `frontend` — Next.js App Router, `output: "export"`, one route.
- `infra/bootstrap/` — the Terraform state bucket.

`frontend/next.config.ts` drops the development `/api/*` rewrite proxy; there is no API
to proxy to.

## Data model

### Public document — `frontend/public/tournament.json`

`packages/domain/src/schema.ts` replaces `TournamentSchema` with `PublicTournamentSchema`.
Relative to today's schema:

| Field | Change |
| --- | --- |
| `revision`, `audit`, `requests` | **removed** — existed only to serve compare-and-swap and idempotency |
| `athletes[].phone`, `.note`, `.skillBand` | **removed** — moved to the private roster |
| `finance.feePayments` | **removed** — per-person payment status is not public |
| `draw.seed`, `draw.rosterHash` | **removed** — draw internals |
| `results` | **removed** — derived in the browser, never stored |
| `info.qrAssetPath` | kept; regex widened to `^/[a-zA-Z0-9/._-]+$` so it can point at `/qr/momo.jpg` |
| everything else | unchanged |

The file therefore stores **facts only**: `schemaVersion`, `id`, `updatedAt`, `info`,
`rules`, `athletes`, `teams`, `matches` (including scores), `courts`, `draw.status` and
`draw.assignment`, `tieDecisions`, `sponsorships`, `finance` (`published`, `income`,
`expenses`).

Standings, `winnerTeamId`, champion/runner-up/third/consolation and per-category winners
are computed on load by `deriveTournament()`. A hand-edited score can never disagree with
a stored standings table, because there is no stored standings table.

The domain rules that survive unchanged: 4 teams, 3 categories, 18 group + 6 placement =
24 matches; 21 points with 2 clear, cap 25; ranking by `pointsFor`, `wins`, `difference`,
then manual tiebreak bound to `resultsHash`; a walkover is 21–0.

### Private roster — `.private/roster.json`

Gitignored. A new small `PrivateRosterSchema`:

```ts
{ athletes: [{ id, name, gender, skillBand, phone, note, active }] }
```

`draw.ts` is refactored so `generateDraw`, `rosterHash` and `confirmDraw` take
`{ athletes: PrivateAthlete[], teams: Team[] }` rather than a whole `TournamentDocument`.
The balancing rules are unchanged: balanced by gender, then skill band, then team size;
requires ≥8 active men, ≥8 active women, and a `skillBand` on every active athlete.

`finance.ts::calculateFinance` drops its `feePayments` term and totals `income` and
`expenses` only.

## Scripts

All run via `node --import tsx`, as today.

| Command | Behaviour |
| --- | --- |
| `pnpm draw` | Reads `.private/roster.json` and `frontend/public/tournament.json`, runs the balanced draw, writes `teams`, `athletes[].teamId`, `draw.status: "confirmed"`, `draw.assignment` and the 18 group matches into the public file. Public athletes are written as name/gender/active/teamId only — skill bands and phone numbers never leave `.private/`. |
| `pnpm validate` | Parses the public file against `PublicTournamentSchema`, runs `deriveTournament`, `findScheduleConflicts` and `validateLineup` over every match, and exits non-zero with a Vietnamese message on any failure. Runs in CI. |
| `pnpm deploy` | `pnpm build`, `aws s3 sync` with the cache headers below, then a CloudFront invalidation. |

## The page

One route, `frontend/src/app/page.tsx`, composed of section components under
`frontend/src/features/landing/`. Sections appear in poster order.

### Poster 1 — `thong-bao-trang-1.jpg`

- Pill bar: `HỘI LÔNG THỦ CN1416` left, `THÔNG BÁO · MÙA 2026` right — black rounded pill,
  yellow and white text.
- `GIẢI CẦU LÔNG` in heavy black caps, then `NỘI BỘ 2026` reversed out of a red slab with a
  hard black offset shadow.
- Slogan on a black slab, yellow text, from `info.slogan`.
- Intro paragraph: four teams, three categories, round robin into placement, 24 matches.
- Fact card — cream, black border, hard shadow, red labels in the left column:
  `KHI NÀO?` (`info.dateLabel`), `Ở ĐÂU?` (`info.location`), `ĐÁNH NHỮNG GÌ?`,
  `CẦN BAO NHIÊU NGƯỜI?`.
- Black fee strip with a yellow `???`, shown while `info.feeVnd` is null; once it is set,
  the strip shows the amount instead.
- Photo strip: three photos in rotated cream frames with italic captions
  (`Đội hình mùa trước`, `Cầm vàng thì đừng để vàng rơi`, `Hiệp phụ ngoài quán`), the
  `Thành bại tại vợt!` speech bubble, and the green `Thua vẫn có nhậu` circle badge.
- `ĐĂNG KÝ TRƯỚC` heading — the date comes from `info.registrationDeadline`; while that is
  null the heading reads `ĐĂNG KÝ SỚM NHÉ` rather than printing an empty bracket. Beneath
  it the Zalo link and contact from `info`, and the italic disclaimer about smashes flying
  off court.

### Poster 2 — `thong-bao-trang-2.jpg`

Red `THỂ LỆ THI ĐẤU` title slab, then six cream cards in a two-column masonry that
collapses to one column on narrow screens:

1. `CHIA ĐỘI & THỂ THỨC` — four items with black numbered discs.
2. `LUẬT MỖI SÉC` — red bullet discs.
3. `XẾP HẠNG SAU VÒNG LOẠI` — prose plus three yellow tiebreak pills.
4. `VÒNG TRANH HẠNG` — bullets plus the `NHẤT` (red), `NHÌ` (green), `BA` and
   `KHUYẾN KHÍCH` (outline) pills.
5. `LỆ PHÍ & QUỸ GIẢI` — the black `??? / ĐANG CHỐT` panel.
6. `MẤY ĐIỀU NHỚ GIÙM`.

Footer rule: registration contact left, `Nhà tài trợ · Sân Tấn Phúc` right.

### Poster 3 — `thong-bao-trang-3.jpg`

Red `NHÀ TÀI TRỢ` title slab, intro paragraph, then three tier cards —
`KIM CƯƠNG` (black disc), `VÀNG` (red disc), `THÂN THIỆN` (green disc) — each with a
dashed rule and the italic `Phần quà riêng — bật mí sau`.

Below: the MoMo QR from `assets/images/momo-qr-code.jpeg`, shown immediately, beside the
`QUỸ GIẢI` card whose rows come from `finance.income` with dotted leaders. Then the
black-on-red CTA slab, `HẠNG KIM CƯƠNG ĐANG TRỐNG — AI NHANH THÌ CÓ!`.

Named sponsors from `sponsorships` are listed under their tier card once any exist;
`rankSponsors` assigns diamond/gold/friendly as it does today.

### Live data sections

`DANH SÁCH VĐV`, `BỐN ĐỘI`, `LỊCH THI ĐẤU` (24 matches, group then placement),
`BẢNG XẾP HẠNG`, `THU CHI` — all read-only, reusing the existing `AthleteTable`,
`TeamPreview`, `GroupSchedule`, `CourtSchedule`, `Standings`, `PlacementBracket` and
`FinanceDashboard` components with their editing affordances removed.

**Each section renders nothing when its data is empty**: no athletes → no roster section;
`draw.status !== "confirmed"` → no teams and no schedule; no completed matches → no
standings; `finance.published === false` → no thu chi. Today the page is therefore purely
the three posters, and it fills in as the tournament progresses with no code change.

Unpublished lineups (`lineupPublished: false`) are not rendered, preserving the one piece
of the old privacy projection that is about fairness rather than personal data.

### Visual system

`globals.css` already carries the right tokens — `--yellow: #ffd644`, `--red: #e63d27`,
`--ink: #17150f`, `--paper: #fffdf4`, `--green: #147f48`, Be Vietnam Pro. Added:

- the yellow dot-grid page ground (`radial-gradient` + `background-size`),
- a `--shadow-hard` offset-shadow convention for slabs and cards,
- slight rotations on photo frames and title slabs,
- section rhythm matching the posters' generous vertical spacing.

Responsive down to 360 px: two-column card grids collapse to one, the photo strip becomes
a horizontal scroller, and heading sizes use `clamp()`. Tables scroll horizontally inside
their own container rather than widening the page.

Accessibility: `prefers-reduced-motion` disables the marquee and rotations; the skip link
and `:focus-visible` treatment are kept; every photo keeps a real Vietnamese `alt`.

### Assets

Poster photos are copied to `frontend/public/photos/` and the QR to `frontend/public/qr/`,
**resized and re-encoded** — `assets/images` is 16 MB of full-size iOS captures, far too
heavy for a landing page. Target: ≤200 KB per photo at ~1200 px on the long edge. The
originals stay in `assets/` untouched. The three poster JPGs stay in
`frontend/public/posters/` and remain linked from a `<details>` at the foot of the page
for anyone who wants the printable original.

## Infrastructure

`infra/` collapses to a single root configuration plus `bootstrap/`. No `modules/`, no
`envs/`.

```
infra/
  versions.tf      terraform + aws provider (archive provider removed)
  main.tf          S3 site bucket, OAC, CloudFront, ACM, Route53
  variables.tf
  outputs.tf
  terraform.tfvars.example
  bootstrap/       unchanged — Terraform state bucket
  test/architecture.test.ts
```

- S3 site bucket: private (full public access block), with a bucket policy granting
  `s3:GetObject` only to the CloudFront distribution ARN. It **gains** three things the
  site bucket does not have today and the deleted data bucket did: explicit versioning,
  an explicit `aws_s3_bucket_server_side_encryption_configuration`, and
  `lifecycle { prevent_destroy = true }`. Versioning is what makes the rollback runbook
  work — every past `tournament.json` stays retrievable as an object version.
- CloudFront: OAC origin, the existing directory-index rewrite function,
  `aliases = ["giaicaulong2026.nghuy.link"]`, `redirect-to-https`.
- ACM certificate for `giaicaulong2026.nghuy.link` in `us-east-1` via a second aliased
  provider, DNS-validated.
- `data "aws_route53_zone" "root" { name = "nghuy.link" }` in the same account, plus the
  validation record and the A and AAAA alias records to the distribution.
- The `/api/*` cache behaviour and the API origin are removed.

Cache headers on deploy:

| Path | `Cache-Control` |
| --- | --- |
| `/_next/static/*`, `/photos/*`, `/qr/*` | `public, max-age=31536000, immutable` |
| `*.html` | `no-cache` |
| `/tournament.json` | `no-cache` |

`tournament.json` being `no-cache` is what lets a content edit go live by uploading one
small file and invalidating, with no rebuild.

`infra/test/architecture.test.ts` is rewritten to assert against the HCL text: the site
bucket is private, versioned, encrypted and carries `prevent_destroy`; the distribution
carries the alias and a non-default viewer certificate; the certificate is created in
`us-east-1`; and there is **no** `aws_lambda_function`, `aws_api_gateway_rest_api`,
`aws_cognito_user_pool` or DynamoDB resource anywhere.

### Migration note

The data bucket carries `lifecycle { prevent_destroy = true }`, so `terraform apply` will
**refuse** to delete it — the plan errors rather than destroying. Removing it is therefore
a deliberate two-step: drop the `prevent_destroy` line and apply, or
`terraform state rm` the bucket and its companion resources and delete the bucket by hand.
This is the correct behaviour, since that bucket holds the tournament history; the data
should be downloaded before either step. Collapsing `envs/prod` + `modules/stack` into a
single root configuration also moves every resource address (`module.stack.aws_...` →
`aws_...`), which needs `terraform state mv` or a one-time `terraform import`, so the
existing state is not orphaned. Both steps belong in the bootstrap runbook.

## CI/CD

- `quality.yml`: `pnpm lint`, `typecheck`, `test`, `validate`, `build`, `test:e2e`,
  and `terraform fmt -check` / `validate` for the single configuration.
- `deploy.yml`: still pinned to `ref: github.sha`. `terraform apply`, then `pnpm build`
  (no `NEXT_PUBLIC_*` Cognito values are needed any more, so the build no longer has to
  wait on Terraform outputs), then sync with the cache headers above, then invalidate,
  then the smoke check.
- `scripts/smoke-deployment.ts` is reduced to: the page returns 200 at the custom domain,
  `/tournament.json` parses against the schema, and the response carries `no-cache`.

## Testing

- **Domain unit tests** (`vitest`) — kept as they are, minus the `commands` suite;
  `draw.test.ts` is updated for the new roster-shaped input.
- **New unit tests** — `PublicTournamentSchema` rejects a document containing `phone`,
  `skillBand` or `feePayments` (it is a `strictObject`, so this is enforced, not merely
  documented); `pnpm validate` fails on a conflicting schedule and on an illegal score.
- **Infra test** — as described above.
- **E2E** (`playwright`, against `frontend/out` served statically — `serve-preview.ts` is
  replaced by a plain static file server, since there is no API or bearer token to fake):
  - the page renders all three poster sections with their headings;
  - the live sections are absent for the shipped empty-tournament file, and present for a
    fixture with a confirmed draw and completed matches;
  - **`/tournament.json` contains no `phone`, `skillBand`, `note` or `feePayments` key** —
    the direct successor to today's `athletes-admin.spec.ts` assertion;
  - the page is usable at 390 px wide.

## Documentation

- `CLAUDE.md` rewritten: no more one-document/one-writer, compare-and-swap, privacy
  projection, or auth sections; new sections for the JSON workflow and the scripts.
- `README.md` rewritten around `pnpm dev` → edit JSON → `pnpm validate` → `pnpm deploy`.
- `docs/runbooks/`: `bootstrap.md` and `rollback.md` updated (rollback becomes "restore a
  previous S3 object version of `tournament.json`, or re-deploy an earlier commit");
  `operations.md` rewritten around editing the JSON; `roster-config.md` deleted.
- The frontend design language — tokens, slab/shadow conventions, section rhythm — is
  documented in `frontend/CLAUDE.md`.

## Consequences

Deleting Cognito removes the admin authentication story entirely, and with it the known
gap where `infra/modules/stack/main.tf` never defined the `tournament/admin` resource
server scope that `auth.ts` required. Should a hosted admin UI be wanted later, auth has
to be built from scratch; the JSON-plus-scripts workflow is the intended substitute.

Editing the tournament now requires a laptop with the repo checked out. This is a
deliberate trade: it is the same person doing it either way, and it removes a Lambda, an
API Gateway, a Cognito pool, a second S3 bucket and roughly 1,500 lines of mutation,
auth and idempotency code from the system.
