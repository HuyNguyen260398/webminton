#!/usr/bin/env bash
# Invoke as `pnpm run deploy` — a bare `pnpm deploy` hits pnpm's own
# workspace-deploy command instead of this script.
# Build must already exist. Uploads in two passes so fingerprinted assets are
# cached forever while the HTML and the data file stay revalidated.
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
  --exclude "*" --include "*.html" --include "tournament.json"

aws cloudfront create-invalidation --distribution-id "$DIST" --paths "/*" >/dev/null
echo "✓ Đã triển khai lên s3://$BUCKET và làm mới CloudFront."
