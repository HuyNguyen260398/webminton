terraform {
  required_version = ">= 1.10, < 2.0"
  required_providers { aws = { source = "hashicorp/aws", version = "~> 6.0" } }
}
provider "aws" { region = var.region }
variable "region" { type = string }
variable "state_bucket_name" { type = string }
variable "github_repository" { type = string }
variable "oidc_provider_arn" {
  type    = string
  default = null
}
resource "aws_s3_bucket" "state" {
  bucket = var.state_bucket_name
  lifecycle { prevent_destroy = true }
}
resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}
resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "HttpsOnly"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
}
output "state_bucket_name" { value = aws_s3_bucket.state.id }
locals {
  plan_subs = compact([
    "repo:${var.github_repository}:environment:*",
    var.github_repository_immutable == null ? null : "repo:${var.github_repository_immutable}:environment:*",
  ])
}

resource "aws_iam_role" "github_plan" {
  count = var.oidc_provider_arn == null ? 0 : 1
  name  = "webminton-github-plan"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = var.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
        StringLike   = { "token.actions.githubusercontent.com:sub" = local.plan_subs }
      }
    }]
  })
}

# plan.yml only reads: it refreshes state and prints a plan, so nothing here
# grants a write. A drift it reports is applied by deploy.yml or by hand.
resource "aws_iam_role_policy" "github_plan" {
  count = local.deploy_enabled ? 1 : 0
  name  = "webminton-plan"
  role  = aws_iam_role.github_plan[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "StateBucketList"
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.state.arn
      },
      {
        Sid      = "StateObjectRead"
        Effect   = "Allow"
        Action   = "s3:GetObject"
        Resource = "${aws_s3_bucket.state.arn}/${local.state_key}"
      },
      {
        Sid    = "SiteRead"
        Effect = "Allow"
        Action = ["s3:Get*", "s3:List*"]
        Resource = [
          "arn:aws:s3:::${var.site_bucket_name}",
          "arn:aws:s3:::${var.site_bucket_name}/*",
        ]
      },
      {
        Sid    = "EdgeAndDnsRead"
        Effect = "Allow"
        Action = [
          "cloudfront:Get*",
          "cloudfront:List*",
          "cloudfront:Describe*",
          "acm:DescribeCertificate",
          "acm:ListCertificates",
          "acm:ListTagsForCertificate",
          "acm:GetCertificate",
          "route53:Get*",
          "route53:List*",
        ]
        Resource = "*"
      },
    ]
  })
}

output "github_plan_role_arn" { value = try(aws_iam_role.github_plan[0].arn, null) }

# ------------------------------------------------------------- deploy role
# Assumed by deploy.yml (environment: prod). It may converge the existing site
# stack and publish the build, but cannot create or delete a distribution or a
# certificate: first creation and teardown stay a local, deliberate apply.
data "aws_caller_identity" "current" {}

locals {
  state_key      = "webminton/prod/terraform.tfstate"
  distribution   = "arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:distribution/${coalesce(var.distribution_id, "none")}"
  deploy_enabled = var.oidc_provider_arn != null && var.site_bucket_name != null && var.distribution_id != null && var.hosted_zone_id != null
}

resource "aws_iam_role" "github_deploy" {
  count = local.deploy_enabled ? 1 : 0
  name  = "webminton-github-deploy"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = var.oidc_provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
        # GitHub may send the immutable form, owner@id/repo@id, instead of the name.
        StringLike = {
          "token.actions.githubusercontent.com:sub" = compact([
            "repo:${var.github_repository}:environment:prod",
            var.github_repository_immutable == null ? null : "repo:${var.github_repository_immutable}:environment:prod",
          ])
        }
      }
    }]
  })
}

resource "aws_iam_role_policy" "github_deploy" {
  count = local.deploy_enabled ? 1 : 0
  name  = "webminton-deploy"
  role  = aws_iam_role.github_deploy[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid      = "StateBucketList"
        Effect   = "Allow"
        Action   = "s3:ListBucket"
        Resource = aws_s3_bucket.state.arn
      },
      {
        Sid    = "StateObject"
        Effect = "Allow"
        Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = [
          "${aws_s3_bucket.state.arn}/${local.state_key}",
          "${aws_s3_bucket.state.arn}/${local.state_key}.tflock",
        ]
      },
      {
        Sid      = "SiteBucket"
        Effect   = "Allow"
        Action   = ["s3:Get*", "s3:List*", "s3:PutBucket*", "s3:PutEncryptionConfiguration"]
        Resource = "arn:aws:s3:::${var.site_bucket_name}"
      },
      {
        Sid      = "SiteObjects"
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource = "arn:aws:s3:::${var.site_bucket_name}/*"
      },
      {
        Sid      = "CloudFrontRead"
        Effect   = "Allow"
        Action   = ["cloudfront:Get*", "cloudfront:List*", "cloudfront:Describe*"]
        Resource = "*"
      },
      {
        Sid    = "CloudFrontSite"
        Effect = "Allow"
        Action = [
          "cloudfront:UpdateDistribution",
          "cloudfront:CreateInvalidation",
          "cloudfront:TagResource",
          "cloudfront:UntagResource",
        ]
        Resource = local.distribution
      },
      {
        Sid    = "CloudFrontSiteParts"
        Effect = "Allow"
        Action = [
          "cloudfront:UpdateFunction",
          "cloudfront:PublishFunction",
          "cloudfront:UpdateOriginAccessControl",
        ]
        Resource = [
          "arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:function/webminton-*",
          "arn:aws:cloudfront::${data.aws_caller_identity.current.account_id}:origin-access-control/*",
        ]
      },
      {
        Sid      = "CertificateRead"
        Effect   = "Allow"
        Action   = ["acm:DescribeCertificate", "acm:ListCertificates", "acm:ListTagsForCertificate", "acm:GetCertificate"]
        Resource = "*"
      },
      {
        Sid      = "DnsRead"
        Effect   = "Allow"
        Action   = ["route53:ListHostedZones", "route53:ListHostedZonesByName", "route53:GetChange"]
        Resource = "*"
      },
      {
        Sid    = "DnsZone"
        Effect = "Allow"
        Action = [
          "route53:GetHostedZone",
          "route53:ListResourceRecordSets",
          "route53:ChangeResourceRecordSets",
          "route53:ListTagsForResource",
        ]
        Resource = "arn:aws:route53:::hostedzone/${coalesce(var.hosted_zone_id, "none")}"
      },
    ]
  })
}

output "github_deploy_role_arn" { value = try(aws_iam_role.github_deploy[0].arn, null) }
