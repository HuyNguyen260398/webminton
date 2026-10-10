import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from "@aws-sdk/lib-dynamodb";
import type { AdminState } from "../../packages/domain/src/commands";
import {
  nextStored,
  type HistoryEntry,
  type StoredState,
  type TournamentStore,
} from "./store";

const PK = "T#noi-bo-2026";
const versionKey = (v: number) => `V#${String(v).padStart(6, "0")}`;
const named = (e: unknown, name: string) =>
  (e as { name?: string } | null)?.name === name;

export class DynamoStore implements TournamentStore {
  constructor(
    private db: Pick<DynamoDBDocumentClient, "send">,
    private table: string,
  ) {}

  async read(): Promise<StoredState | null> {
    const { Item } = await this.db.send(
      new GetCommand({
        TableName: this.table,
        Key: { pk: PK, sk: "CURRENT" },
        ConsistentRead: true,
      }),
    );
    if (!Item) return null;
    return {
      version: Item.version,
      publishedVersion: Item.publishedVersion,
      recentRequests: Item.recentRequests,
      ...(JSON.parse(Item.state) as AdminState),
    };
  }

  async write(
    prev: StoredState | null,
    next: AdminState,
    entry: Omit<HistoryEntry, "version">,
  ): Promise<StoredState> {
    const saved = nextStored(prev, next, entry.requestId);
    const state = JSON.stringify({
      document: next.document,
      private: next.private,
    });
    try {
      // One transaction: the current item moves only if nobody else moved it,
      // and the history item for that version is written with it.
      await this.db.send(
        new TransactWriteCommand({
          TransactItems: [
            {
              Put: {
                TableName: this.table,
                Item: {
                  pk: PK,
                  sk: "CURRENT",
                  version: saved.version,
                  publishedVersion: saved.publishedVersion,
                  recentRequests: saved.recentRequests,
                  state,
                },
                ...(prev
                  ? {
                      ConditionExpression: "#v = :base",
                      ExpressionAttributeNames: { "#v": "version" },
                      ExpressionAttributeValues: { ":base": prev.version },
                    }
                  : { ConditionExpression: "attribute_not_exists(pk)" }),
              },
            },
            {
              Put: {
                TableName: this.table,
                Item: {
                  pk: PK,
                  sk: versionKey(saved.version),
                  version: saved.version,
                  ...entry,
                  state,
                },
              },
            },
          ],
        }),
      );
    } catch (e) {
      if (named(e, "TransactionCanceledException")) throw new Error("CONFLICT");
      throw e;
    }
    return saved;
  }

  async markPublished(version: number): Promise<void> {
    try {
      await this.db.send(
        new UpdateCommand({
          TableName: this.table,
          Key: { pk: PK, sk: "CURRENT" },
          UpdateExpression: "SET publishedVersion = :v",
          ConditionExpression: "publishedVersion < :v",
          ExpressionAttributeValues: { ":v": version },
        }),
      );
    } catch (e) {
      // A newer version is already marked; nothing to do.
      if (!named(e, "ConditionalCheckFailedException")) throw e;
    }
  }

  async history(): Promise<HistoryEntry[]> {
    const { Items = [] } = await this.db.send(
      new QueryCommand({
        TableName: this.table,
        KeyConditionExpression: "pk = :pk AND begins_with(sk, :v)",
        ExpressionAttributeValues: { ":pk": PK, ":v": "V#" },
        ScanIndexForward: false,
        Limit: 200,
      }),
    );
    return Items.map((i) => ({
      version: i.version,
      at: i.at,
      actorEmail: i.actorEmail,
      commandType: i.commandType,
      requestId: i.requestId,
    }));
  }

  async snapshot(version: number): Promise<AdminState | null> {
    const { Item } = await this.db.send(
      new GetCommand({
        TableName: this.table,
        Key: { pk: PK, sk: versionKey(version) },
      }),
    );
    return Item ? (JSON.parse(Item.state) as AdminState) : null;
  }
}
