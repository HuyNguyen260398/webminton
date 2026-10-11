import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const main = readFileSync("infra/main.tf", "utf8");
const versions = readFileSync("infra/versions.tf", "utf8");
const backend = readFileSync("infra/backend.tf", "utf8");
const auth = readFileSync("infra/auth.tf", "utf8");
const all = [main, backend, auth].join("\n");

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
    expect(main).toContain("4135ea2d-6df8-44a3-9df3-4b5a84be39ad");
  });

  it("protects the tournament table", () => {
    expect(backend).toContain('resource "aws_dynamodb_table" "tournament"');
    expect(backend).toMatch(/billing_mode\s+=\s+"PAY_PER_REQUEST"/);
    expect(backend).toMatch(/deletion_protection_enabled\s+=\s+true/);
    expect(backend).toMatch(/point_in_time_recovery\s*{\s*enabled\s+=\s+true/);
  });

  it("puts every admin route behind the JWT authorizer", () => {
    const routes = [
      // Each block runs to the first "}" at the start of a line.
      ...backend.matchAll(
        /resource "aws_apigatewayv2_route" "(\w+)" {\n([\s\S]*?)\n}/g,
      ),
    ].map((m) => ({ name: m[1], body: m[2] }));
    expect(routes.map((r) => r.name).sort()).toEqual([
      "admin",
      "config",
      "team_draw",
    ]);
    const admin = routes.find((r) => r.name === "admin")!.body;
    expect(admin).toMatch(/route_key\s+=\s+"ANY \/api\/admin\/\{proxy\+\}"/);
    expect(admin).toMatch(/authorization_type\s+=\s+"JWT"/);
    expect(admin).toContain("aws_apigatewayv2_authorizer.jwt.id");
    // Two routes are open. One serves two public identifiers; the other is
    // the athletes' own team draw, which is throttled hard.
    expect(routes.find((r) => r.name === "config")!.body).toMatch(
      /route_key\s+=\s+"GET \/api\/config"/,
    );
    const teamDraw = routes.find((r) => r.name === "team_draw")!.body;
    expect(teamDraw).toMatch(/route_key\s+=\s+"POST \/api\/team-draw"/);
    expect(teamDraw).not.toContain("authorization_type");
    expect(backend).toMatch(
      /route_settings\s*{\s*route_key\s+=\s+aws_apigatewayv2_route\.team_draw\.route_key\s+throttling_rate_limit\s+=\s+2\s/,
    );
  });

  it("lets the Lambda write exactly one object in the site bucket", () => {
    expect(backend).toContain('"${aws_s3_bucket.site.arn}/tournament.json"');
    expect(backend).not.toContain('"${aws_s3_bucket.site.arn}/*"');
    expect(backend).not.toMatch(/"s3:\*"|"dynamodb:\*"|Action\s+=\s+"\*"/);
  });

  it("routes /api/* to the API without caching", () => {
    expect(main).toMatch(/path_pattern\s+=\s+"\/api\/\*"/);
    // Managed-AllViewerExceptHostHeader: forwards Authorization to the API.
    expect(main).toContain("b689b0a8-53d0-40ab-baf2-68738e2966ac");
  });

  it("signs admins in with Google only, for twelve hours", () => {
    expect(auth).toMatch(/provider_type\s+=\s+"Google"/);
    expect(auth).toMatch(/supported_identity_providers\s+=\s+\["Google"\]/);
    expect(auth).toMatch(/email_verified\s+=\s+"email_verified"/);
    expect(auth).toMatch(/generate_secret\s+=\s+false/);
    expect(auth).toMatch(/id_token_validity\s+=\s+12/);
  });

  it("keeps Lambda logs for fourteen days", () => {
    expect(backend).toMatch(/retention_in_days\s+=\s+14/);
  });

  it("adds nothing with a fixed monthly fee", () => {
    for (const resource of [
      "aws_wafv2_web_acl",
      "aws_nat_gateway",
      "aws_vpc",
      "aws_secretsmanager_secret",
      "aws_kms_key",
    ])
      expect(all).not.toContain(resource);
    expect(backend).not.toContain("PROVISIONED");
  });
});
