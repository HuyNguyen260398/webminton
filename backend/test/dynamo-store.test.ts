// @vitest-environment node
import { describe, expect, it } from "vitest";
import { DynamoStore } from "../src/dynamo-store";
import { makeAdminState } from "../../packages/domain/src/testing/fixtures";

// A stand-in for DynamoDBDocumentClient that records what it was sent.
function fakeDb(reply: (name: string, input: any) => unknown) {
  const sent: { name: string; input: any }[] = [];
  return {
    sent,
    send: async (cmd: { constructor: { name: string }; input: unknown }) => {
      sent.push({ name: cmd.constructor.name, input: cmd.input });
      return reply(cmd.constructor.name, cmd.input) as never;
    },
  };
}
const entry = {
  at: "2026-10-18T08:00:00+07:00",
  actorEmail: "btc@example.com",
  commandType: "updateInfo",
  requestId: "req-1",
};

describe("DynamoStore", () => {
  it("returns null when nothing is stored", async () => {
    const db = fakeDb(() => ({}));
    expect(await new DynamoStore(db as never, "t").read()).toBeNull();
    expect(db.sent[0].input).toMatchObject({
      TableName: "t",
      Key: { pk: "T#noi-bo-2026", sk: "CURRENT" },
      ConsistentRead: true,
    });
  });

  it("writes the first version only if the table is empty", async () => {
    const db = fakeDb(() => ({}));
    const state = makeAdminState();
    state.document.athletes[0].name = "Đỗ Thái Đãm";
    const saved = await new DynamoStore(db as never, "t").write(null, state, entry);
    expect(saved.version).toBe(1);
    const [current, version] = db.sent[0].input.TransactItems;
    expect(current.Put.ConditionExpression).toBe("attribute_not_exists(pk)");
    expect(current.Put.Item).toMatchObject({ sk: "CURRENT", version: 1 });
    expect(JSON.parse(current.Put.Item.state).document.athletes[0].name).toBe(
      "Đỗ Thái Đãm",
    );
    expect(version.Put.Item).toMatchObject({
      sk: "V#000001",
      actorEmail: "btc@example.com",
      commandType: "updateInfo",
    });
  });

  it("makes later writes conditional on the version it read", async () => {
    const db = fakeDb(() => ({}));
    const prev = {
      ...makeAdminState(),
      version: 41,
      publishedVersion: 40,
      recentRequests: [],
    };
    const saved = await new DynamoStore(db as never, "t").write(prev, makeAdminState(), entry);
    expect(saved).toMatchObject({ version: 42, publishedVersion: 40 });
    const put = db.sent[0].input.TransactItems[0].Put;
    expect(put.ConditionExpression).toBe("#v = :base");
    expect(put.ExpressionAttributeValues).toEqual({ ":base": 41 });
    expect(db.sent[0].input.TransactItems[1].Put.Item.sk).toBe("V#000042");
  });

  it("turns a cancelled transaction into CONFLICT", async () => {
    const db = fakeDb(() => {
      throw Object.assign(new Error("x"), { name: "TransactionCanceledException" });
    });
    await expect(
      new DynamoStore(db as never, "t").write(null, makeAdminState(), entry),
    ).rejects.toThrow("CONFLICT");
  });

  it("reads back what it stored", async () => {
    const state = makeAdminState();
    const db = fakeDb((name) =>
      name === "GetCommand"
        ? {
            Item: {
              version: 3,
              publishedVersion: 2,
              recentRequests: [{ requestId: "r", version: 3 }],
              state: JSON.stringify(state),
            },
          }
        : {},
    );
    const read = await new DynamoStore(db as never, "t").read();
    expect(read).toMatchObject({ version: 3, publishedVersion: 2 });
    expect(read!.document).toEqual(state.document);
    expect(read!.private).toEqual(state.private);
  });

  it("lists history newest first and ignores a stale publish mark", async () => {
    const db = fakeDb((name) => {
      if (name === "QueryCommand")
        return { Items: [{ version: 2, ...entry, state: "{}" }] };
      if (name === "UpdateCommand")
        throw Object.assign(new Error("x"), {
          name: "ConditionalCheckFailedException",
        });
      return {};
    });
    const store = new DynamoStore(db as never, "t");
    expect(await store.history()).toEqual([{ version: 2, ...entry }]);
    expect(db.sent[0].input).toMatchObject({ ScanIndexForward: false });
    await expect(store.markPublished(1)).resolves.toBeUndefined();
  });

  it("lists the whole history across pages, without loading each version's state", async () => {
    const pages = [
      { Items: [{ version: 3, ...entry }], LastEvaluatedKey: { pk: "p", sk: "V#000003" } },
      { Items: [{ version: 2, ...entry }, { version: 1, ...entry }] },
    ];
    const db = fakeDb(() => pages.shift());
    const history = await new DynamoStore(db as never, "t").history();
    expect(history.map((h) => h.version)).toEqual([3, 2, 1]);
    expect(db.sent).toHaveLength(2);
    expect(db.sent[1].input.ExclusiveStartKey).toEqual({ pk: "p", sk: "V#000003" });
    for (const { input } of db.sent) {
      expect(input.Limit).toBeUndefined();
      // Only the five metadata fields: a page is capped at 1 MB of items read.
      expect(Object.values(input.ExpressionAttributeNames).sort()).toEqual([
        "actorEmail",
        "at",
        "commandType",
        "requestId",
        "version",
      ]);
    }
  });
});
