# Rollback

Rollback is a release operation, not a data restore. Select the last verified
commit artifact, deploy the compatible Lambda first, then publish its matching
static export and invalidate CloudFront. Keep `tournament.json` and its S3
revision unchanged unless a separate restore is explicitly approved.

If smoke fails, leave the failed release marked in GitHub and redeploy the last
known-good SHA through the protected environment. Never run `aws s3 sync --delete`
against the data bucket. A data correction uses the admin version restore API,
which writes a new revision with CAS and an audit reason.
