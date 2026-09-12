# Webminton

Ứng dụng web tiếng Việt cho giải cầu lông nội bộ Hội lông thủ CN1416. Frontend
là Next.js static export; backend là TypeScript Lambda/API Gateway; toàn bộ dữ
liệu giải nằm trong một JSON document versioned trên S3 và được ghi bằng ETag
CAS. Terraform trong `infra/` tạo CloudFront, S3 private/OAC, API Gateway,
Lambda và Cognito.

## Local development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm test:e2e` builds the static frontend and starts `scripts/serve-preview.ts`.
The local-only bearer `local-test-token` simulates a BTC session. It is not a
production credential. The seed is intentionally empty; use
`pnpm roster -- validate --file .private/roster.json` and the documented
preview/apply workflow in `docs/runbooks/roster-config.md` to manage athletes.

## Operations

Use Cognito Authorization Code + PKCE for BTC. The public site exposes only the
filtered tournament projection; phone, notes, personal payments, audit data and
unpublished lineups remain private. Finance is hidden until BTC publishes it.
The draw requires at least eight active men and eight active women and keeps the
default men’s, women’s and mixed doubles categories. A walkover is recorded as
21–0 for the present side.

Bootstrap and deploy instructions are in `docs/runbooks/bootstrap.md`,
`docs/runbooks/operations.md`, and `docs/runbooks/rollback.md`. Deployment needs
Huy’s AWS account, state bucket, repository-scoped OIDC roles, and confirmed
date/fee/contact/QR values; no real account values are committed here.
