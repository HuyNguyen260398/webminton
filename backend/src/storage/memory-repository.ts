import type { TournamentDocument } from "../../../packages/domain/src/schema";
import type { TournamentRepository } from "./repository";
export class MemoryRepository implements TournamentRepository {
  private versions: TournamentDocument[];
  constructor(document: TournamentDocument) {
    this.versions = [structuredClone(document)];
  }
  async read() {
    return {
      document: structuredClone(this.versions.at(-1)!),
      etag: `"${this.versions.length}"`,
    };
  }
  async write(document: TournamentDocument, expected: string) {
    if (expected !== `"${this.versions.length}"`) throw new Error("CONFLICT");
    this.versions.push(structuredClone(document));
    return { etag: `"${this.versions.length}"` };
  }
  async create(_document: TournamentDocument) {
    throw new Error("ALREADY_EXISTS");
  }
  async listVersions() {
    return {
      items: this.versions
        .map((d, i) => ({
          versionId: String(i + 1),
          lastModified: d.updatedAt,
        }))
        .reverse(),
    };
  }
  async readVersion(id: string) {
    const d = this.versions[Number(id) - 1];
    if (!d) throw new Error("NOT_FOUND");
    return structuredClone(d);
  }
}
