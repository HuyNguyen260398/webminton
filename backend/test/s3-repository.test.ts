import { test, expect } from "vitest";
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { S3Repository } from "../src/storage/s3-repository";
import { makeTournament } from "../../packages/domain/src/testing/fixtures";
test("S3 adapter preserves conditional write contract and never blind overwrites", async () => {
  let body = JSON.stringify(makeTournament()),
    version = 1;
  const transport = {
    send: async (command: unknown) => {
      if (command instanceof GetObjectCommand)
        return {
          ETag: `"${version}"`,
          Body: { transformToString: async () => body },
        };
      if (command instanceof PutObjectCommand) {
        if (command.input.IfMatch !== `"${version}"`)
          throw { $metadata: { httpStatusCode: 412 } };
        body = String(command.input.Body);
        version++;
        return { ETag: `"${version}"` };
      }
      throw new Error("unexpected transport operation");
    },
  };
  const repo = new S3Repository(
      transport as unknown as S3Client,
      "test-bucket",
    ),
    old = await repo.read();
  await repo.write({ ...old.document, revision: 1 }, old.etag);
  await expect(
    repo.write({ ...old.document, revision: 2 }, old.etag),
  ).rejects.toThrow("CONFLICT");
  expect((await repo.read()).document.revision).toBe(1);
});
test("missing or corrupt storage is not replaced by the seed", async () => {
  const missing = {
    send: async () => {
      throw { $metadata: { httpStatusCode: 404 } };
    },
  };
  await expect(
    new S3Repository(missing as unknown as S3Client, "test").read(),
  ).rejects.toBeDefined();
  const corrupt = {
    send: async () => ({
      ETag: '"x"',
      Body: { transformToString: async () => "{}" },
    }),
  };
  await expect(
    new S3Repository(corrupt as unknown as S3Client, "test").read(),
  ).rejects.toBeDefined();
});
