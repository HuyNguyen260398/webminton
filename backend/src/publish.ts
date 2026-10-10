import {
  PublicTournamentSchema,
  type TournamentDocument,
} from "../../packages/domain/src/schema";

export type Publisher = (body: string) => Promise<void>;

// The only way a document becomes the public file. PublicTournamentSchema is
// a strictObject all the way down, so an extra field throws here, not leaks.
export function renderSnapshot(document: TournamentDocument): string {
  return `${JSON.stringify(PublicTournamentSchema.parse(document), null, 2)}\n`;
}
