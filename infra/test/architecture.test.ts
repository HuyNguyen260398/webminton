import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8');
describe('Terraform architecture contract', () => {
  it('keeps buckets private, versioned, and encrypted', () => {
    const stack = read('infra/modules/stack/main.tf');
    const frontend = read('infra/modules/stack/frontend.tf');
    expect(stack).toContain('prevent_destroy = true');
    expect(stack).toContain('status = "Enabled"');
    expect(frontend).toContain('block_public_policy');
    expect(frontend).toContain('origin_access_control_id');
  });
  it('separates public GET from Cognito protected admin methods', () => {
    const stack = read('infra/modules/stack/main.tf');
    const env = read('infra/envs/dev/main.tf');
    expect(stack).toContain('authorization = "NONE"');
    expect(stack).toContain('authorization = "COGNITO_USER_POOLS"');
    expect(env).toContain('webminton/dev/terraform.tfstate');
    expect(stack).not.toContain('aws_dynamodb_table');
  });
});
