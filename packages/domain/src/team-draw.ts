import type { AdminState } from "./commands";
import type { TournamentDocument } from "./schema";

// The athletes draw their own team on the public page, one at a time. Only
// two of the four teams take part: fourteen people are too few for four.
export const SELF_DRAW_TEAM_IDS = ["red", "blue"] as const;

// The teams that actually exist for the organiser. The document always
// carries four, because the schedule engine is built for four; with the
// athletes' own draw only Đỏ and Xanh are in play, so the other two are left
// out unless a four-team draw is confirmed or somebody is still in one.
export function playingTeams(
  t: TournamentDocument,
): TournamentDocument["teams"] {
  if (t.draw.status === "confirmed") return t.teams;
  return t.teams.filter(
    (team) =>
      (SELF_DRAW_TEAM_IDS as readonly string[]).includes(team.id) ||
      t.athletes.some((a) => a.teamId === team.id),
  );
}

interface Group {
  size: number;
  // How many of the group each of the two teams already holds.
  held: [number, number];
}

// Can the draw still end level? Level means every group — same gender, same
// trình độ — split in half, give or take the odd one, and the two teams the
// same size, give or take one. Tries each group's two possible splits.
function canEndLevel(groups: Group[], total: number): boolean {
  let sums = new Set([0]);
  for (const g of groups) {
    const next = new Set<number>();
    for (const first of new Set([
      Math.floor(g.size / 2),
      Math.ceil(g.size / 2),
    ]))
      if (first >= g.held[0] && g.size - first >= g.held[1])
        for (const s of sums) next.add(s + first);
    sums = next;
  }
  return sums.has(Math.floor(total / 2)) || sums.has(Math.ceil(total / 2));
}

// The teams this athlete may still land in: those that leave a level finish
// possible. Counted from what is stored, so it stays right after an organiser
// moves someone by hand. With 6 strong men, a team that already has 3 is
// closed to the other strong men.
export function openTeams(state: AdminState, athleteId: string): string[] {
  const { document: t, private: priv } = state;
  if (t.draw.status !== "open") throw new Error("TEAM_DRAW_CLOSED");
  const me = t.athletes.find((a) => a.id === athleteId);
  if (!me || !me.active) throw new Error("ATHLETE_NOT_FOUND");
  if (me.teamId !== null) throw new Error("ALREADY_DRAWN");
  const key = (a: { id: string; gender: string }) =>
    `${a.gender}/${priv[a.id]?.skillBand ?? "?"}`;
  if ((priv[me.id]?.skillBand ?? null) === null)
    throw new Error("MISSING_SKILL");
  const teams = SELF_DRAW_TEAM_IDS;
  if (!teams.every((id) => t.teams.some((x) => x.id === id)))
    throw new Error("INVALID_TEAM");

  const active = t.athletes.filter((a) => a.active);
  const groups = new Map<string, Group>();
  for (const a of active) {
    const g = groups.get(key(a)) ?? { size: 0, held: [0, 0] };
    g.size++;
    const i = teams.indexOf(a.teamId as (typeof teams)[number]);
    if (i >= 0) g.held[i]++;
    groups.set(key(a), g);
  }
  const mine = groups.get(key(me))!;

  const open = teams.filter((_, i) => {
    mine.held[i]++;
    const ok = canEndLevel([...groups.values()], active.length);
    mine.held[i]--;
    return ok;
  });
  if (open.length > 0) return open;
  // Only after manual moves have made a level finish impossible: at least
  // keep this athlete's own group as even as it can be.
  const fewest = Math.min(...mine.held);
  return teams.filter((_, i) => mine.held[i] === fewest);
}

// `random` returns a number in [0, 1), like Math.random. It is passed in so
// this package stays free of node:crypto and the tests can be deterministic.
export function drawTeam(
  state: AdminState,
  athleteId: string,
  random: () => number,
): string {
  const open = openTeams(state, athleteId);
  return open[Math.min(open.length - 1, Math.floor(random() * open.length))];
}
