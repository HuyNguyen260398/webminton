# Webminton — the referees' page

Date: 2026-10-12
Status: draft, awaiting review
Branch: `feat/referee-page`

## Goal

On tournament day (2026-10-18) the people umpiring each court score their own
match from their phone, so the organiser is not the only one who can enter a
result and the public page shows a match as it is being played.

What the organiser asked for:

- A public page, separate from `/quan-tri`, that referees use during the giải.
- The organiser creates the matches in `/quan-tri`; they then appear on that
  page for a referee to pick and run.
- A referee edits the match's score and each athlete's two smash counts
  (smash ăn điểm, smash rúc lưới).
- Designed for a phone first: that is the device it will be used on.

Decided in conversation:

- Access is a shared **mã trọng tài** plus an on/off switch, both set by the
  organiser. No sign-in.
- A referee may change **status, score and smash counts**. Pairs stay with the
  organiser.
- Match creation is unchanged: the fixed eleven of `createDuelMatches`.
- Scoring is **live, point by point**, and each change is saved, so the public
  page shows the running score of a match that is `đang đánh`.

Assumptions (mine):

- This is for the two-team bảng đấu (`document.duel`). The dormant four-team
  engine gets no referee page.
- One referee per match. Two phones on the same match is not prevented; the
  last save wins.
- A smash ăn điểm and the point it wins are two separate taps.

Success criteria:

1. On a 390px-wide phone a referee goes from the link to a finished match —
   code, pick, start, score, smashes, finish — without the organiser.
2. A point entered by a referee shows on the public `BẢNG ĐẤU` within about 20
   seconds.
3. Without the current code, or with refereeing switched off, nothing can be
   written through the referee route.
4. The referee route cannot change pairs, a finished match, or anything
   outside the one match it names.
5. The code never appears in the served `tournament.json`.
6. Team totals, matches won and the leader count finished matches only, exactly
   as today.
7. No resource with a fixed monthly fee is added.

## Out of scope

- Choosing how many matches to create, or adding and removing single matches.
- Referee accounts, per-referee codes, or knowing which referee saved what.
- Assigning a match to a court or to a referee.
- Service order, sides, intervals, or any other umpiring aid beyond the score.
- Offline scoring. A phone without signal keeps its count on screen and saves
  when the signal returns, but only while the page stays open.

## Data

### The public document

`PublicTournamentSchema` gains one optional field beside `duel`:

```ts
// Absent means closed. The code itself is never in the document.
referee: z.strictObject({ open: z.boolean() }).optional(),
```

It is public so `/trong-tai` can tell a referee the page is closed without a
request to the Lambda. Optional, so every document already stored still
parses.

The meaning of a duel match's `score` widens:

| `status`  | `score` today      | `score` after                          |
| --------- | ------------------ | -------------------------------------- |
| `pending` | `null`             | `null`                                 |
| `live`    | `null`             | `null` or any running score, 0–25 each |
| `done`    | a final score      | a final score                          |

`validateDuelMatch` enforces the new table: a pending match with a score and a
done match without a final one are both `INVALID_SCORE`.

Because a score no longer means "finished", every reader that used
`m.score` as that test switches to `m.status === "done"`:

- `deriveDuel`: team totals, `wins`, `finalPoints`, `played`, `finished`.
- `DuelBoard`'s `Row`: the `is-winner` mark. The score cell keeps showing
  `m.score` whenever there is one, which is what makes a live match visible.

Smash counts are already stored for a live match and already summed by
`deriveDuel` regardless of status; that does not change.

### The code

The code is a secret that belongs to no athlete, so it does not fit
`PrivateMap`. `AdminState` gains a third member:

```ts
export interface AdminState {
  document: TournamentDocument;
  private: PrivateMap;
  secrets: Secrets; // { refereeCode: string | null }
}
```

- `SecretsSchema` is a `z.strictObject` with `refereeCode` as six digits or
  `null`. A stored item without `secrets` reads as `{ refereeCode: null }`, in
  both `DynamoStore` and `MemoryStore`, so no migration is needed.
- `renderSnapshot` takes only the document and parses it through the strict
  public schema, so the code cannot reach `tournament.json`.
- `AdminView` carries `secrets`, so the organiser can read the code back.
- Restoring an old version restores the document and private fields as today
  and **keeps the current code**: an undo must not silently change what the
  referees were told.

### Commands

Two new organiser commands, through `applyCommand` like every other edit:

- `setRefereeCode { code }` — six digits. The admin screen generates it with
  `crypto.getRandomValues`; `applyCommand` stays pure.
- `setRefereeOpen { open }` — refused with `REFEREE_NEEDS_CODE` when opening
  with no code set, and with `DUEL_REQUIRED` when there is no bảng đấu. `resetDuel` also deletes `document.referee`.

The existing `saveDuelMatch` is unchanged in shape. Its handling of a live
match's score changes with the schema (see the admin screen below).

### A referee's save

A new pure function in `packages/domain/src/duel.ts`:

```ts
applyRefereeSave(match: DuelMatch, save: RefereeSave): DuelMatch
// RefereeSave = { status: "live" | "done"; score: DuelScore | null; smashes }
```

It returns the stored match with status, score and smashes replaced, and
throws on anything a referee may not do:

| Stored status | Asked for | Result                                              |
| ------------- | --------- | --------------------------------------------------- |
| `pending`     | `live`    | allowed if both pairs are set, else `DUEL_NEEDS_PAIRS` |
| `pending`     | `done`    | `REFEREE_BAD_MOVE`                                  |
| `live`        | `live`    | score and smashes replaced                          |
| `live`        | `done`    | allowed with a final score, else `INVALID_SCORE`    |
| `done`        | anything  | `REFEREE_MATCH_DONE`                                |

Smashes are filtered the way `saveDuelMatch` filters them: only the four
players of the stored pairs, and only non-zero counts. Pairs are never read
from the request. The result then goes through `finalize`, so everything the
organiser's saves are checked for is checked here too.

## API

One new open route, `POST /api/referee/{proxy+}`, with two paths handled in
`router.ts` before the admin check:

**`POST /api/referee/check`** `{ code }` → `200 {}`. Lets the code screen say
"sai mã" at once instead of on the first point.

**`POST /api/referee/match`** `{ code, matchId, status, score, smashes }` →
`200 { match }`, the stored match after the save.

Both run the same gate first:

1. `document.referee?.open` is true, else `REFEREE_CLOSED` (403).
2. `code` equals `secrets.refereeCode` under `timingSafeEqual`, else
   `REFEREE_CODE` (401).

`match` then, against one read of the table:

1. Finds the match (`MATCH_NOT_FOUND`).
2. If the request describes the match exactly as stored, returns it without
   writing. This makes a retried save — including a retried `Kết thúc trận`
   whose reply was lost — a success rather than `REFEREE_MATCH_DONE`, and
   keeps no-op saves out of the history.
3. Applies `applyRefereeSave`, finalizes, writes and publishes.
4. On a version collision (the other court saved first) re-reads and repeats,
   up to five tries — the loop `/api/team-draw` already uses.

History records these as actor `trong-tai`, command type `refereeMatch`.

New entries in `backend/src/errors.ts`:

| Code                 | Status | Message                                                        |
| -------------------- | ------ | -------------------------------------------------------------- |
| `REFEREE_CLOSED`     | 403    | BTC chưa mở chấm điểm cho trọng tài, hoặc đã đóng rồi.         |
| `REFEREE_CODE`       | 401    | Mã trọng tài không đúng.                                       |
| `REFEREE_MATCH_DONE` | 422    | Trận đã kết thúc — nhờ BTC mở lại nếu cần sửa.                 |
| `REFEREE_BAD_MOVE`   | 422    | Phải bắt đầu trận trước khi kết thúc.                          |
| `REFEREE_NEEDS_CODE` | 422    | Tạo mã trọng tài trước khi mở.                                 |
| `DUEL_REQUIRED`      | 422    | Chưa có bảng đấu — tạo bảng đấu trước.                         |

## Infrastructure

`infra/backend.tf` gains one route with no authorizer and its own throttle:

```hcl
resource "aws_apigatewayv2_route" "referee" {
  route_key = "POST /api/referee/{proxy+}"
  ...
}
# in the stage:
route_settings {
  route_key              = aws_apigatewayv2_route.referee.route_key
  throttling_rate_limit  = 10
  throttling_burst_limit = 20
}
```

Two courts saving at most twice a second each need 4 requests a second. At 10
a second, guessing a six-digit code takes about fourteen hours on average,
longer than the giải, and the organiser can change the code or switch
refereeing off at any moment.

`infra/test/architecture.test.ts` asserts the route exists, has no authorizer
and has that throttle, alongside the same assertions for `team_draw`.

No new Lambda permission, bucket, table or CloudFront behaviour: `/api/*`
already reaches the API and `/trong-tai/` is one more static page.

**The first apply is local.** The deploy role cannot create the route, so it
is applied once by hand as `docs/runbooks/bootstrap.md` describes, before the
merge is deployed.

## The referees' page — `/trong-tai`

A third static page: `frontend/src/app/trong-tai/{layout,page}.tsx`, `noindex`,
not linked from the landing page. It reads `tournament.json` through
`useTournament` like the other two pages and writes only through the referee
route.

| File | Does |
| --- | --- |
| `app/trong-tai/page.tsx` | loading and error shell, as `/boc-tham` |
| `features/referee/RefereePortal.tsx` | chooses the screen: closed, code, list, scorer |
| `features/referee/CodeGate.tsx` | the code screen |
| `features/referee/MatchList.tsx` | the list of matches |
| `features/referee/MatchScorer.tsx` | the scoring screen |
| `lib/use-referee.ts` | the stored code, the draft of the open match and its save queue; the only caller of the referee API |
| `styles/referee.css` | the page's styles, on the existing tokens |

It uses the poster tokens and the `Card`/`Pill` primitives so it looks like
the rest of the site, but the scoring screen is laid out for thumbs rather
than for the poster: one column, no horizontal scroll at 390px, every control
at least 48px, the two `+1` buttons at least 96px tall.

### Screens

**Closed.** When `referee.open` is not true, or there is no bảng đấu: one card,
"BTC chưa mở chấm điểm." Nothing else.

**Code.** One numeric field (`inputMode="numeric"`, six digits, large) and
`Vào chấm điểm`. It calls `check`; on success the code is kept in
`localStorage` and not asked for again on that phone. Wrong code: the message
from the API, field cleared.

**Match list.** Every match of the bảng đấu as a full-width button, grouped:

1. `Đang đánh` — live matches, first, so a referee who reloads lands on theirs.
2. `Sẵn sàng` — pending with both pairs set.
3. `Chưa xếp cặp` — pending without pairs; shown greyed and disabled, so the
   referee can see the match exists and whom to ask.
4. `Đã xong` — finished, with the final score; opens read-only.

Each row shows the title and category (`duelTitle`, `duelCategory`), the two
pairs by given name with their team colour, the score if any, and a status
pill. Finals carry `Điểm nhân đôi`.

The pairs of a pending match are already in `tournament.json`; the public page
simply does not render them. This page renders them, behind the code screen.
That is the same protection they have today and no weaker.

**Scorer.** Top to bottom:

- A header with a back button, the match title and the save indicator.
- Pending: both pairs in full and one button, `Bắt đầu trận`.
- Live:
  - Two team-coloured blocks side by side. Each has the team name, the pair,
    the score in very large figures, a `+1` filling the block's width and a
    small `−1` beneath it. `+1` stops at 25, `−1` at 0.
  - `Đếm smash`: one row per player, grouped by team, each with two counters —
    `Ăn điểm` and `Rúc lưới` — as a count between `−` and `+`.
  - `Kết thúc trận`, enabled only when the score is final by `isFinalScore`,
    with the same hint text the admin editor shows. It asks for confirmation
    showing the score, since a referee cannot undo it.
- Done: the same layout with no buttons, and "Trận đã kết thúc — nhờ BTC mở
  lại nếu cần sửa."

While a match is live on screen the page holds a screen wake lock
(`navigator.wakeLock`, where the browser has it), re-acquired when the tab
becomes visible again.

### Saving

`use-referee.ts` keeps a draft of the open match and treats it as the truth
on screen:

- A tap changes the draft at once. A save of the whole draft is sent 500ms
  after the last tap, so a burst of taps is one request.
- One request at a time. Taps during a request are saved by the next one.
- `Bắt đầu trận`, `Kết thúc trận`, the back button and the tab being hidden
  send immediately rather than waiting.
- The indicator reads `Đang lưu…`, `Đã lưu`, or `Mất mạng — đang thử lại`. A
  network failure or a 5xx is retried every two seconds for as long as the
  page is open; the draft stays on screen.
- `REFEREE_CODE` forgets the stored code and returns to the code screen.
  `REFEREE_CLOSED` shows the closed card. `REFEREE_MATCH_DONE` and any other
  refusal replace the draft with the match as the server has it and show the
  API's message.
- While there is nothing unsaved and no request in flight, the 20-second poll
  of `tournament.json` may replace the draft — this is how an organiser's
  correction reaches the referee's screen. Otherwise the poll is ignored for
  that match.

## The admin screen

In `DuelTab`, once the bảng đấu exists, a `Trọng tài` card above the match
list:

- A switch, `Mở chấm điểm cho trọng tài` (`setRefereeOpen`).
- The code in large type, `Tạo mã` when there is none and `Đổi mã` (with
  confirmation) when there is. Changing it locks out every phone still
  holding the old one, which is the point.
- The page's address with a copy button.

`MatchEditor` changes because a live match can now hold a score:

- `Lưu số smash` on a live match sends the score fields as they stand instead
  of `null`, so an organiser saving a smash count does not erase a referee's
  running score. The editor is already re-keyed on the stored match, so it
  shows the referee's latest numbers after each reload of the state.
- `Mở lại trận` keeps the score and returns the match to `live`, where either
  the organiser or the referee can correct it by a point. Its confirmation
  text changes to match.
- The match list shows the running score of a live match.

`sameDuelMatch` is unchanged and still does its job: an organiser's save of a
match a referee has since touched is a `409`.

## Local development

`scripts/local-api.ts` runs the real router, so both paths work under
`pnpm dev` with no change beyond `MemoryStore` carrying `secrets`. There is no
default code: the developer sets one in the `Trận` tab, as the organiser will.

## Testing

**Domain** (`packages/domain/test`)
- `applyRefereeSave`: every row of the table above; smashes for a non-player
  dropped; pairs untouched.
- `validateDuelMatch`: the new score-by-status table.
- `deriveDuel`: a live match with a running score adds nothing to totals,
  wins or `played`; its smashes are counted.
- `setRefereeCode`, `setRefereeOpen` and `resetDuel` clearing `referee`.

**Backend** (`backend/test`)
- Gate: closed, wrong code, missing code, right code.
- `match`: start, score, finish; refusal on a done match; an identical save
  writes nothing; a retried finish succeeds; a version collision is retried;
  pairs in the request body are rejected by the strict schema.
- The published snapshot after a referee save contains no code.
- Restore keeps the current code.
- A stored item without `secrets` reads back with a null code.

**Infra** — the route assertions above.

**Frontend unit** — `use-referee`'s queue with fake timers: taps coalesce, a
failed save retries, a poll does not overwrite an unsaved draft.

**End to end** (`tests/e2e/referee.spec.ts`, 390×844)
- Closed card when refereeing is off.
- Wrong code refused; right code remembered across a reload.
- Start a match, score to 21–15 with smashes, finish; the public page shows
  the running score while live and the result when done.
- No horizontal scroll and no control under 48px on the scorer.
- The served `tournament.json` carries no `refereeCode`.

## Operations

- **History.** Live scoring adds roughly 40–60 versions per match, several
  hundred over the day, each a full snapshot in DynamoDB and a rewrite of
  `tournament.json`. The cost is cents. The `Lịch sử` tab will be long;
  filtering it is not part of this work.
- **Match day.** Create the code and open refereeing in the `Trận` tab, send
  referees the link and the code. To lock a phone out, change the code. To
  stop all referee writes, switch it off. `docs/runbooks/operations.md` gains
  this paragraph, and `CLAUDE.md` a section for the page.

## Rollout

1. Domain: schema, `applyRefereeSave`, `deriveDuel`, commands, `secrets`.
2. Backend: stores, router, errors.
3. Admin screen: the `Trọng tài` card and the `MatchEditor` changes.
4. `/trong-tai`.
5. Terraform route, applied locally once, then the normal deploy.

Steps 1–3 are safe to ship before the page exists: with no code set,
refereeing cannot be opened and the route refuses everything.
