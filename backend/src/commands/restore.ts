import type { TournamentRepository } from "../storage/repository";
import { TournamentSchema, Id } from "../../../packages/domain/src/schema";
import { seedPlacement } from "../../../packages/domain/src/advancement";
import { payloadHash } from "./dispatch";
import { randomUUID } from "node:crypto";
export async function restoreVersion(
  repo: TournamentRepository,
  input: { requestId: string; versionId: string; reason: string },
  context: { actorSub: string; etag: string },
) {
  if (!context.actorSub) throw new Error("UNAUTHORIZED");
  if (!context.etag) throw new Error("PRECONDITION_REQUIRED");
  Id.parse(input.requestId);
  if (
    typeof input.versionId !== "string" ||
    !input.versionId ||
    typeof input.reason !== "string" ||
    !input.reason.trim() ||
    input.reason.length > 300
  )
    throw new Error("INVALID_INPUT");
  const current = await repo.read(),
    hash = payloadHash({ type: "restore", ...input }),
    prior = current.document.requests.find((r) => r.id === input.requestId);
  if (prior) {
    if (prior.actorSub !== context.actorSub || prior.payloadHash !== hash)
      throw new Error("CONFLICT");
    return { ...current, replayed: true };
  }
  if (current.etag !== context.etag) throw new Error("CONFLICT");
  const t = seedPlacement(
    TournamentSchema.parse(await repo.readVersion(input.versionId)),
  );
  t.revision = current.document.revision + 1;
  t.updatedAt = new Date().toISOString();
  t.audit = [
    ...current.document.audit,
    {
      id: randomUUID(),
      actorSub: context.actorSub,
      action: `restore ${input.versionId}: ${input.reason}`,
      at: t.updatedAt,
      revision: t.revision,
    },
  ];
  t.requests = [
    ...current.document.requests,
    {
      id: input.requestId,
      actorSub: context.actorSub,
      payloadHash: hash,
      committedRevision: t.revision,
    },
  ];
  TournamentSchema.parse(t);
  if (Buffer.byteLength(JSON.stringify(t)) > 1024 * 1024)
    throw new Error("DOCUMENT_TOO_LARGE");
  return {
    document: t,
    ...(await repo.write(t, current.etag)),
    replayed: false,
  };
}
