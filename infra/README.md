# Webminton AWS infrastructure

Terraform provisions the private S3 site and JSON data buckets, CloudFront with
an OAC and trailing-slash rewrite, API Gateway REST `/api`, Node.js 24 Lambda,
and Cognito admin authentication. `envs/dev` and `envs/prod` share the stack
module and use separate S3 state keys. Bootstrap is a one-time operation; it
does not seed `tournament.json`.

Run `terraform -chdir=infra/envs/dev init -backend=false` for local validation.
For a real deployment, provide the state bucket and region via
`-backend-config`, then use the outputs to configure the frontend build.
