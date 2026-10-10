import type { AdminState } from "../../packages/domain/src/commands";

export const RECENT_REQUESTS = 50;

export interface StoredState extends AdminState {
  version: number;
  publishedVersion: number;
  recentRequests: { requestId: string; version: number }[];
}

export interface HistoryEntry {
  version: number;
  at: string;
  actorEmail: string;
  commandType: string;
  requestId: string;
}

export interface TournamentStore {
  read(): Promise<StoredState | null>;
  write(
    prev: StoredState | null,
    next: AdminState,
    entry: Omit<HistoryEntry, "version">,
  ): Promise<StoredState>;
  markPublished(version: number): Promise<void>;
  history(): Promise<HistoryEntry[]>;
  snapshot(version: number): Promise<AdminState | null>;
}

// Shared by both stores so the two cannot drift on what a write produces.
export function nextStored(
  prev: StoredState | null,
  next: AdminState,
  requestId: string,
): StoredState {
  const version = (prev?.version ?? 0) + 1;
  return {
    version,
    publishedVersion: prev?.publishedVersion ?? 0,
    recentRequests: [
      ...(prev?.recentRequests ?? []),
      { requestId, version },
    ].slice(-RECENT_REQUESTS),
    document: next.document,
    private: next.private,
  };
}

// Used by tests and by the local server. Values are stored as JSON so a
// caller mutating what it wrote, or what it read, cannot change the store —
// the same guarantee DynamoDB gives.
export class MemoryStore implements TournamentStore {
  private current: string | null = null;
  private versions = new Map<number, { entry: HistoryEntry; state: string }>();

  async read() {
    return this.current ? (JSON.parse(this.current) as StoredState) : null;
  }

  async write(
    prev: StoredState | null,
    next: AdminState,
    entry: Omit<HistoryEntry, "version">,
  ) {
    const stored = await this.read();
    if ((stored?.version ?? 0) !== (prev?.version ?? 0))
      throw new Error("CONFLICT");
    const saved = nextStored(prev, next, entry.requestId);
    this.current = JSON.stringify(saved);
    this.versions.set(saved.version, {
      entry: { ...entry, version: saved.version },
      state: JSON.stringify({ document: next.document, private: next.private }),
    });
    return JSON.parse(this.current) as StoredState;
  }

  async markPublished(version: number) {
    const stored = await this.read();
    if (!stored || stored.publishedVersion >= version) return;
    this.current = JSON.stringify({ ...stored, publishedVersion: version });
  }

  async history() {
    return [...this.versions.values()]
      .map((v) => v.entry)
      .sort((a, b) => b.version - a.version);
  }

  async snapshot(version: number) {
    const v = this.versions.get(version);
    return v ? (JSON.parse(v.state) as AdminState) : null;
  }
}
