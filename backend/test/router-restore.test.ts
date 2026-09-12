import { test, expect } from "vitest";
import { makeTournament } from "../../packages/domain/src/testing/fixtures";
import { MemoryRepository } from "../src/storage/memory-repository";
import { route } from "../src/router";
import { restoreVersion } from "../src/commands/restore";
const config = { issuer: "issuer", clientId: "client" };
const claims = {
  sub: "admin",
  iss: "issuer",
  client_id: "client",
  token_use: "access",
  scope: "tournament/admin",
  "cognito:groups": "admins",
};
test("public HTTP responses remain JSON and cannot mutate", async () => {
  const repo = new MemoryRepository(makeTournament());
  expect(
    (
      await route(
        repo,
        { method: "GET", path: "/api/public/tournament", headers: {} },
        config,
      )
    ).statusCode,
  ).toBe(200);
  expect(
    (
      await route(
        repo,
        {
          method: "POST",
          path: "/api/admin/commands",
          headers: {},
          body: "{}",
        },
        config,
      )
    ).statusCode,
  ).toBe(401);
  expect(
    (
      await route(
        repo,
        { method: "GET", path: "/api/missing", headers: {} },
        config,
      )
    ).statusCode,
  ).toBe(404);
});
test("admin requires preconditions and valid JSON", async () => {
  const repo = new MemoryRepository(makeTournament());
  expect(
    (
      await route(
        repo,
        {
          method: "POST",
          path: "/api/admin/commands",
          headers: {},
          claims,
          body: "{}",
        },
        config,
      )
    ).statusCode,
  ).toBe(428);
  expect(
    (
      await route(
        repo,
        {
          method: "POST",
          path: "/api/admin/commands",
          headers: { "if-match": '"1"' },
          claims,
          body: "{",
        },
        config,
      )
    ).statusCode,
  ).toBe(422);
});
test("restore creates a new revision and rejects stale writes", async () => {
  const repo = new MemoryRepository(makeTournament());
  const initial = await repo.read();
  await repo.write(
    {
      ...initial.document,
      revision: 1,
      info: { ...initial.document.info, name: "Updated" },
    },
    initial.etag,
  );
  const result = await restoreVersion(
    repo,
    { requestId: "restore1", versionId: "1", reason: "Sửa nhầm" },
    { actorSub: "admin", etag: '"2"' },
  );
  expect(result.document.revision).toBe(2);
  expect(result.document.info.name).toBe("Giải cầu lông nội bộ 2026");
  expect(result.document.audit.at(-1)!.action).toContain("restore");
  await expect(
    restoreVersion(
      repo,
      { requestId: "restore2", versionId: "1", reason: "Sửa nhầm" },
      { actorSub: "admin", etag: '"2"' },
    ),
  ).rejects.toThrow("CONFLICT");
});
