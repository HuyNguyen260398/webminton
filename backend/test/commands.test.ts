import { test, expect } from "vitest";
import {
  makeTournament,
  makeRoster,
} from "../../packages/domain/src/testing/fixtures";
import { MemoryRepository } from "../src/storage/memory-repository";
import { executeCommand } from "../src/commands/dispatch";
test("two writers with the same ETag cannot overwrite each other", async () => {
  const repo = new MemoryRepository(makeTournament()),
    old = await repo.read();
  const results = await Promise.allSettled(
    ["one", "two"].map((requestId) =>
      executeCommand(
        repo,
        {
          requestId,
          type: "renameTeam",
          payload: { teamId: "red", name: requestId },
        },
        { actorSub: "admin", etag: old.etag },
      ),
    ),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect((await repo.read()).document.revision).toBe(1);
});
test("retrying a payment request does not duplicate it; changed payload conflicts", async () => {
  const t = makeTournament();
  t.athletes = makeRoster(16);
  const repo = new MemoryRepository(t),
    old = await repo.read();
  const command = {
    requestId: "pay1",
    type: "recordFeePayment" as const,
    payload: {
      id: "payment1",
      athleteId: "athlete-1",
      amountVnd: 100000,
      receivedAt: "2026-10-25T00:00:00Z",
    },
  };
  await executeCommand(repo, command, { actorSub: "admin", etag: old.etag });
  const replay = await executeCommand(repo, command, {
    actorSub: "admin",
    etag: old.etag,
  });
  expect(replay.replayed).toBe(true);
  expect((await repo.read()).document.finance.feePayments).toHaveLength(1);
  await expect(
    executeCommand(
      repo,
      { ...command, payload: { ...command.payload, amountVnd: 200000 } },
      { actorSub: "admin", etag: old.etag },
    ),
  ).rejects.toThrow("CONFLICT");
});
test("roster edits preserve unrelated data and cannot remove a paid athlete", async () => {
  const t = makeTournament();
  t.athletes = makeRoster(16);
  t.finance.feePayments = [
    {
      id: "p",
      athleteId: "athlete-1",
      amountVnd: 100,
      receivedAt: "2026-10-25T00:00:00Z",
    },
  ];
  const repo = new MemoryRepository(t),
    r = await repo.read();
  await expect(
    executeCommand(
      repo,
      { requestId: "r1", type: "replaceRoster", payload: { athletes: [] } },
      { actorSub: "admin", etag: r.etag },
    ),
  ).rejects.toThrow();
  t.athletes[0].name = "Tên mới";
  await executeCommand(
    repo,
    {
      requestId: "r2",
      type: "replaceRoster",
      payload: { athletes: t.athletes },
    },
    { actorSub: "admin", etag: r.etag },
  );
  const next = (await repo.read()).document;
  expect(next.finance).toEqual(t.finance);
  expect(next.athletes[0].name).toBe("Tên mới");
});
