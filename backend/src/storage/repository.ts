import type { TournamentDocument } from "../../../packages/domain/src/schema";
export interface Snapshot {
  document: TournamentDocument;
  etag: string;
}
export interface TournamentRepository {
  read(): Promise<Snapshot>;
  write(
    document: TournamentDocument,
    expectedEtag: string,
  ): Promise<{ etag: string }>;
  create(document: TournamentDocument): Promise<void>;
  listVersions(
    cursor?: string,
  ): Promise<{
    items: Array<{ versionId: string; lastModified: string }>;
    nextCursor?: string;
  }>;
  readVersion(versionId: string): Promise<TournamentDocument>;
}
