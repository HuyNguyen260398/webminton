import type { TournamentDocument, Athlete } from "./schema";
import { sha256Hex, sha256Uint32LE } from "./hash";
export function rosterHash(t: TournamentDocument) {
  return sha256Hex(
    JSON.stringify(
      t.athletes
        .filter((a) => a.active)
        .map((a) => ({ id: a.id, gender: a.gender, skillBand: a.skillBand }))
        .sort((a, b) => a.id.localeCompare(b.id)),
    ),
  );
}
function random(seed: string) {
  let n = sha256Uint32LE(seed);
  return () => {
    n += 0x6d2b79f5;
    let x = n;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function shuffle<T>(items: T[], rng: () => number) {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
export function generateDraw(
  t: TournamentDocument,
  seed: string,
): TournamentDocument["draw"] {
  const athletes = t.athletes
    .filter((a) => a.active)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (athletes.some((a) => a.skillBand === null))
    throw new Error("MISSING_SKILL");
  if (
    ["male", "female"].some(
      (g) => athletes.filter((a) => a.gender === g).length < 8,
    )
  )
    throw new Error("INSUFFICIENT_ROSTER");
  if (
    t.draw.status === "confirmed" ||
    t.matches.some((m) => m.status !== "pending")
  )
    throw new Error("DRAW_LOCKED");
  for (let attempt = 0; attempt < 100; attempt++) {
    const rng = random(`${seed}:${attempt}`),
      groups = t.teams.map((team) => ({
        id: team.id,
        athletes: [] as Athlete[],
      }));
    for (const gender of ["male", "female"])
      for (const skill of [1, 2, 3])
        for (const athlete of shuffle(
          athletes.filter((a) => a.gender === gender && a.skillBand === skill),
          rng,
        )) {
          const sorted = shuffle(groups, rng).sort(
            (a, b) =>
              a.athletes.filter((x) => x.gender === gender).length -
                b.athletes.filter((x) => x.gender === gender).length ||
              a.athletes.length - b.athletes.length ||
              a.athletes.reduce((s, x) => s + 4 - x.skillBand!, 0) -
                b.athletes.reduce((s, x) => s + 4 - x.skillBand!, 0),
          );
          sorted[0].athletes.push(athlete);
        }
    if (
      Math.max(...groups.map((g) => g.athletes.length)) -
        Math.min(...groups.map((g) => g.athletes.length)) <=
      1
    )
      return {
        status: "draft",
        algorithmVersion: "balanced-v1",
        seed,
        rosterHash: rosterHash(t),
        assignment: Object.fromEntries(
          groups.flatMap((g) => g.athletes.map((a) => [a.id, g.id])),
        ),
      };
  }
  throw new Error("DRAW_NOT_FOUND");
}
export function confirmDraw(
  input: TournamentDocument,
  hash: string,
): TournamentDocument {
  const t = structuredClone(input);
  if (hash !== rosterHash(t) || hash !== t.draw.rosterHash)
    throw new Error("STALE_ROSTER");
  if (t.draw.status === "not_started") throw new Error("DRAW_NOT_STARTED");
  if (t.athletes.filter((a) => a.active).some((a) => !t.draw.assignment[a.id]))
    throw new Error("INVALID_DRAW");
  t.athletes.forEach((a) => {
    a.teamId = a.active ? t.draw.assignment[a.id] : null;
  });
  t.draw.status = "confirmed";
  return t;
}
