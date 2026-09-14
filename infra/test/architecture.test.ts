import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const main = readFileSync("infra/main.tf", "utf8");
const versions = readFileSync("infra/versions.tf", "utf8");

describe("infrastructure", () => {
  it("keeps the site bucket private", () => {
    for (const flag of [
      "block_public_acls",
      "block_public_policy",
      "ignore_public_acls",
      "restrict_public_buckets",
    ])
      expect(main).toMatch(new RegExp(`${flag}\\s+=\\s+true`));
  });

  it("versions, encrypts and protects the site bucket", () => {
    expect(main).toContain("aws_s3_bucket_versioning");
    expect(main).toContain("aws_s3_bucket_server_side_encryption_configuration");
    expect(main).toMatch(/prevent_destroy\s+=\s+true/);
  });

  it("only CloudFront may read the bucket", () => {
    expect(main).toContain("aws_cloudfront_origin_access_control");
    expect(main).toMatch(
      /"AWS:SourceArn"\s+=\s+aws_cloudfront_distribution\.site\.arn/,
    );
  });

  it("serves the custom domain over its own certificate", () => {
    expect(main).toMatch(/aliases\s+=\s+\["giaicaulong2026\.nghuy\.link"\]/);
    expect(main).toContain("acm_certificate_arn");
    expect(main).not.toContain("cloudfront_default_certificate = true");
    expect(main).toContain("redirect-to-https");
  });

  it("issues the certificate in us-east-1", () => {
    expect(main).toMatch(/provider\s+=\s+aws\.us_east_1/);
    expect(main).toMatch(/region\s+=\s+"us-east-1"/);
    expect(main).toMatch(/validation_method\s+=\s+"DNS"/);
  });

  it("creates the DNS records in the existing zone", () => {
    expect(main).toContain('data "aws_route53_zone" "root"');
    expect(main).toMatch(/name\s+=\s+"nghuy\.link"/);
    expect(main).toMatch(/type\s+=\s+"A"/);
    expect(main).toMatch(/type\s+=\s+"AAAA"/);
  });

  it("serves the data file uncached so content edits go live", () => {
    expect(main).toMatch(/path_pattern\s+=\s+"\/tournament\.json"/);
    // Managed-CachingDisabled
    expect(main).toContain("4135ea2d-6df8-44a3-9df3-4b5a84f5d6f3");
  });

  it("has no backend left", () => {
    for (const resource of [
      "aws_lambda_function",
      "aws_api_gateway_rest_api",
      "aws_cognito_user_pool",
      "aws_dynamodb_table",
      "aws_iam_role",
    ])
      expect(main).not.toContain(resource);
    expect(versions).not.toContain("archive");
  });
});
