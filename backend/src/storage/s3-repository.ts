import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectVersionsCommand,
} from "@aws-sdk/client-s3";
import {
  TournamentSchema,
  type TournamentDocument,
} from "../../../packages/domain/src/schema";
import type { TournamentRepository } from "./repository";
export class S3Repository implements TournamentRepository {
  constructor(
    private client: S3Client,
    private bucket: string,
    private key = "tournaments/noi-bo-2026/tournament.json",
  ) {}
  private async get(versionId?: string) {
    const r = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: this.key,
        ...(versionId ? { VersionId: versionId } : {}),
      }),
    );
    if (!r.Body || !r.ETag) throw new Error("INVALID_STORAGE");
    if ((r.ContentLength ?? 0) > 1024 * 1024)
      throw new Error("DOCUMENT_TOO_LARGE");
    const body = await r.Body.transformToString();
    if (Buffer.byteLength(body) > 1024 * 1024)
      throw new Error("DOCUMENT_TOO_LARGE");
    return { document: TournamentSchema.parse(JSON.parse(body)), etag: r.ETag };
  }
  async read() {
    return this.get();
  }
  async readVersion(versionId: string) {
    return (await this.get(versionId)).document;
  }
  private async put(
    document: TournamentDocument,
    condition: { IfMatch: string } | { IfNoneMatch: string },
  ) {
    TournamentSchema.parse(document);
    const body = JSON.stringify(document);
    if (Buffer.byteLength(body) > 1024 * 1024)
      throw new Error("DOCUMENT_TOO_LARGE");
    try {
      const r = await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: this.key,
          Body: body,
          ContentType: "application/json",
          ...condition,
        }),
      );
      if (!r.ETag) throw new Error("INVALID_STORAGE");
      return { etag: r.ETag };
    } catch (e) {
      const status = (e as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      if (status === 409 || status === 412) throw new Error("CONFLICT");
      throw e;
    }
  }
  async write(document: TournamentDocument, expectedEtag: string) {
    if (!expectedEtag) throw new Error("PRECONDITION_REQUIRED");
    return this.put(document, { IfMatch: expectedEtag });
  }
  async create(document: TournamentDocument) {
    await this.put(document, { IfNoneMatch: "*" });
  }
  async listVersions(cursor?: string) {
    let marker: { key?: string; version?: string } = {};
    if (cursor) {
      try {
        marker = JSON.parse(Buffer.from(cursor, "base64url").toString());
        if (marker.key !== this.key || typeof marker.version !== "string")
          throw new Error();
      } catch {
        throw new Error("INVALID_CURSOR");
      }
    }
    const r = await this.client.send(
      new ListObjectVersionsCommand({
        Bucket: this.bucket,
        Prefix: this.key,
        MaxKeys: 20,
        KeyMarker: marker.key,
        VersionIdMarker: marker.version,
      }),
    );
    return {
      items: (r.Versions ?? [])
        .filter((v) => v.Key === this.key && v.VersionId && v.LastModified)
        .map((v) => ({
          versionId: v.VersionId!,
          lastModified: v.LastModified!.toISOString(),
        })),
      ...(r.IsTruncated
        ? {
            nextCursor: Buffer.from(
              JSON.stringify({
                key: r.NextKeyMarker,
                version: r.NextVersionIdMarker,
              }),
            ).toString("base64url"),
          }
        : {}),
    };
  }
}

export function createS3Repository(bucket: string) {
  return new S3Repository(new S3Client({}), bucket);
}
