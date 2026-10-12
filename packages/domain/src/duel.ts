import type { DuelMatch, RefereeSave, TournamentDocument } from "./schema";
import { isFinalScore } from "./score";

// Đội Đỏ against Đội Xanh. Same two teams as the athletes' own draw.
export const DUEL_TEAMS = { red: "red", blue: "blue" } as const;
export type DuelSide = keyof typeof DUEL_TEAMS;
export const DUEL_SIDES: DuelSide[] = ["red", "blue"];

// Points scored in a final count twice towards the team total.
export const FINAL_WEIGHT = 2;
export const weight = (m: Pick<DuelMatch, "stage">) =>
  m.stage === "final" ? FINAL_WEIGHT : 1;

// Ten vòng loại matches — eight đôi nam, two đôi nam nữ — then the two
// finals. With six men and one woman a side that is exactly three vòng loại
// matches for every man and two for the woman, which is the least the thể lệ
// gives them. The mixed matches sit third and eighth so she gets a rest
// between hers.
const PLAN: Array<Pick<DuelMatch, "stage" | "category">> = [
  ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({
    stage: "playoff" as const,
    category:
      n === 3 || n === 8
        ? ("mixed_doubles" as const)
        : ("mens_doubles" as const),
  })),
  { stage: "final", category: "mens_doubles" },
  { stage: "final", category: "mixed_doubles" },
];

export function createDuelMatches(): DuelMatch[] {
  let finals = 0;
  return PLAN.map((p, i) => ({
    id: p.stage === "final" ? `chung-ket-${++finals}` : `vong-loai-${i + 1}`,
    ...p,
    order: i + 1,
    pairRed: null,
    pairBlue: null,
    status: "pending",
    score: null,
    smashes: {},
  }));
}

export const pairOf = (m: DuelMatch, side: DuelSide) =>
  side === "red" ? m.pairRed : m.pairBlue;
export const playersOf = (m: DuelMatch) => [
  ...(m.pairRed ?? []),
  ...(m.pairBlue ?? []),
];

// A pair must be two different, active athletes of the right team, and one
// man with one woman for đôi nam nữ. How many matches each athlete plays is
// the captains' business and is not checked here.
export function validateDuelMatch(t: TournamentDocument, m: DuelMatch): void {
  for (const side of DUEL_SIDES) {
    const pair = pairOf(m, side);
    if (!pair) continue;
    const athletes = pair.map((id) => t.athletes.find((a) => a.id === id));
    if (
      pair[0] === pair[1] ||
      athletes.some((a) => !a || !a.active || a.teamId !== DUEL_TEAMS[side])
    )
      throw new Error("INVALID_LINEUP");
    const women = athletes.filter((a) => a!.gender === "female").length;
    if (women !== (m.category === "mixed_doubles" ? 1 : 0))
      throw new Error("INVALID_GENDER");
  }
  if (m.status !== "pending" && !(m.pairRed && m.pairBlue))
    throw new Error("DUEL_NEEDS_PAIRS");
  // No score before the match is called; any running score while it is
  // played; a final one once it is done.
  const final =
    m.score !== null && isFinalScore({ a: m.score.red, b: m.score.blue });
  if (m.status === "pending" ? m.score !== null : m.status === "done" && !final)
    throw new Error("INVALID_SCORE");
  const players = playersOf(m);
  if (Object.keys(m.smashes).some((id) => !players.includes(id)))
    throw new Error("INVALID_LINEUP");
}

type Smashes = DuelMatch["smashes"];
const sameSmashes = (a: Smashes, b: Smashes) =>
  Object.keys(a).length === Object.keys(b).length &&
  Object.entries(a).every(
    ([id, s]) => b[id]?.hit === s.hit && b[id]?.net === s.net,
  );

// What a referee's save makes of the stored match. Pairs never change here.
// A save that changes nothing gives back the stored match itself, so the
// caller can tell a retry from an edit — and so a repeated "kết thúc" whose
// reply was lost is answered, not refused.
export function applyRefereeSave(m: DuelMatch, save: RefereeSave): DuelMatch {
  const players = playersOf(m);
  const smashes = Object.fromEntries(
    Object.entries(save.smashes).filter(
      ([id, s]) => players.includes(id) && (s.hit > 0 || s.net > 0),
    ),
  );
  // Not mentioned: whoever has the match keeps it. Null: nobody.
  const referee =
    save.referee === undefined ? m.referee : (save.referee ?? undefined);
  if (
    m.status === save.status &&
    m.score?.red === save.score?.red &&
    m.score?.blue === save.score?.blue &&
    m.referee === referee &&
    sameSmashes(m.smashes, smashes)
  )
    return m;
  if (m.status === "done") throw new Error("REFEREE_MATCH_DONE");
  if (!(m.pairRed && m.pairBlue)) throw new Error("DUEL_NEEDS_PAIRS");
  if (m.status === "pending" && save.status === "done")
    throw new Error("REFEREE_BAD_MOVE");
  const final =
    save.score !== null &&
    isFinalScore({ a: save.score.red, b: save.score.blue });
  if (save.status === "done" && !final) throw new Error("INVALID_SCORE");
  const { referee: _was, ...rest } = m;
  return {
    ...rest,
    status: save.status,
    score: save.score,
    smashes,
    ...(referee === undefined ? {} : { referee }),
  };
}

export interface DuelTeamTotal {
  // Every point scored, finals doubled. This decides the giải.
  points: number;
  wins: number;
  // Points from the finals alone, already doubled: the second tiebreak.
  finalPoints: number;
}
export interface SmashRow {
  athleteId: string;
  name: string;
  teamId: string | null;
  hit: number;
  net: number;
}
export interface DuelResults {
  totals: Record<DuelSide, DuelTeamTotal>;
  played: number;
  // Null while level on every count, or before anything is played.
  leader: DuelSide | null;
  finished: boolean;
  // Every athlete with at least one smash counted, biggest first.
  smashHit: SmashRow[];
  smashNet: SmashRow[];
  // Matches each athlete is down for, and how many of those are finals.
  appearances: Record<string, { matches: number; finals: number }>;
}

export function deriveDuel(t: TournamentDocument): DuelResults | null {
  const matches = t.duel?.matches;
  if (!matches || matches.length === 0) return null;
  const totals: DuelResults["totals"] = {
    red: { points: 0, wins: 0, finalPoints: 0 },
    blue: { points: 0, wins: 0, finalPoints: 0 },
  };
  const smashes = new Map<string, { hit: number; net: number }>();
  const appearances: DuelResults["appearances"] = {};
  for (const m of matches) {
    for (const id of playersOf(m)) {
      const a = (appearances[id] ??= { matches: 0, finals: 0 });
      a.matches++;
      if (m.stage === "final") a.finals++;
    }
    for (const [id, s] of Object.entries(m.smashes)) {
      const sum = smashes.get(id) ?? { hit: 0, net: 0 };
      smashes.set(id, { hit: sum.hit + s.hit, net: sum.net + s.net });
    }
    // A live match shows its score but only a finished one counts.
    if (m.status !== "done" || !m.score) continue;
    for (const side of DUEL_SIDES) {
      const scored = m.score[side] * weight(m);
      totals[side].points += scored;
      if (m.stage === "final") totals[side].finalPoints += scored;
    }
    totals[m.score.red > m.score.blue ? "red" : "blue"].wins++;
  }
  const rows: SmashRow[] = [...smashes].map(([athleteId, s]) => {
    const a = t.athletes.find((x) => x.id === athleteId);
    return { athleteId, name: a?.name ?? "?", teamId: a?.teamId ?? null, ...s };
  });
  const top = (key: "hit" | "net") =>
    rows
      .filter((r) => r[key] > 0)
      .sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name, "vi"));
  // Tổng điểm, then số trận thắng, then điểm chung kết. Beyond that it is
  // the golden rally on court, which no table can decide.
  const order: Array<keyof DuelTeamTotal> = ["points", "wins", "finalPoints"];
  const key = order.find((k) => totals.red[k] !== totals.blue[k]);
  const played = matches.filter((m) => m.status === "done").length;
  return {
    totals,
    played,
    leader:
      played === 0 || !key
        ? null
        : totals.red[key] > totals.blue[key]
          ? "red"
          : "blue",
    finished: played === matches.length,
    smashHit: top("hit"),
    smashNet: top("net"),
    appearances,
  };
}
