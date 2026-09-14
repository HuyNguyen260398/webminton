# Webminton AWS infrastructure

Terraform provisions a private, versioned, encrypted S3 bucket holding the
static export, CloudFront in front of it with an origin access control and a
trailing-slash rewrite function, a DNS-validated ACM certificate in
`us-east-1`, and the Route53 alias records for
`giaicaulong2026.nghuy.link` in the existing `nghuy.link` hosted zone.

There is one environment. There is no Lambda, no API Gateway, no Cognito user
pool and no data bucket — the tournament is a JSON file inside the build.

```bash
terraform -chdir=infra init -backend=false   # local validation
terraform -chdir=infra validate
```

For a real deployment, supply the state bucket and region with
`-backend-config`, copy `terraform.tfvars.example` to `terraform.tfvars` and
set a globally unique `site_bucket_name`, then `terraform -chdir=infra apply`.

The first apply waits on ACM DNS validation, which usually takes a few minutes.
CloudFront distribution changes take a further 5–15 minutes to propagate.

## Migrating from the old two-environment stack

The previous layout was `infra/envs/{dev,prod}` on top of `infra/modules/stack`.
Two things need care before the first apply, and **neither is automatic**.

### 1. The data bucket will not delete itself

`aws_s3_bucket.data` carried `lifecycle { prevent_destroy = true }`, so
`terraform apply` **errors** rather than destroying it. That is the correct
behaviour: it holds every revision of the tournament document.

Download the history first:

```bash
aws s3api list-object-versions \
  --bucket <name_prefix>-data \
  --prefix tournaments/noi-bo-2026/tournament.json

aws s3api get-object \
  --bucket <name_prefix>-data \
  --key tournaments/noi-bo-2026/tournament.json \
  --version-id <id> ./tournament-<id>.json
```

Then release it deliberately — either drop the `prevent_destroy` block in the
old configuration and apply, or drop it from state and delete it by hand:

```bash
terraform -chdir=infra state rm aws_s3_bucket.data
aws s3 rm s3://<name_prefix>-data --recursive
aws s3api delete-bucket --bucket <name_prefix>-data
```

### 2. Every resource address has moved

Collapsing `envs/prod` + `modules/stack` into this root configuration renames
each address from `module.stack.aws_…` to `aws_…`. Without a state move
Terraform plans to destroy and recreate the site bucket and distribution.

```bash
terraform -chdir=infra state mv 'module.stack.aws_s3_bucket.site' 'aws_s3_bucket.site'
terraform -chdir=infra state mv 'module.stack.aws_s3_bucket_public_access_block.site' 'aws_s3_bucket_public_access_block.site'
terraform -chdir=infra state mv 'module.stack.aws_cloudfront_origin_access_control.site' 'aws_cloudfront_origin_access_control.site'
terraform -chdir=infra state mv 'module.stack.aws_cloudfront_function.rewrite' 'aws_cloudfront_function.rewrite'
terraform -chdir=infra state mv 'module.stack.aws_cloudfront_distribution.site' 'aws_cloudfront_distribution.site'
terraform -chdir=infra state mv 'module.stack.aws_s3_bucket_policy.site' 'aws_s3_bucket_policy.site'
```

Run `terraform -chdir=infra plan` afterwards and read it carefully. The
expected plan adds the certificate, the validation record, the two alias
records, bucket versioning and encryption, and modifies the distribution to
carry the alias — and **destroys nothing** except the Lambda, API Gateway and
Cognito resources.

Starting from an empty state instead is also fine: pick a new
`site_bucket_name` and let the old stack be torn down separately.
