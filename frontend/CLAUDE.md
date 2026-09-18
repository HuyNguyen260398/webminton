@AGENTS.md

# Frontend design system

The three JPGs in `assets/poster_designs/` are the design reference. Compare
any visual change against them before committing. `node scripts/screenshot.mjs
http://127.0.0.1:3100/ /tmp/out.png 1280 900 full` renders the served page.

## Tokens (`src/app/globals.css`)

`--yellow #ffd644` · `--red #e63d27` · `--ink #17150f` · `--paper #fffdf4` ·
`--green #147f48`. Type is Be Vietnam Pro, weights 400–900.

## Primitives (`src/styles/poster.css` + `features/landing/primitives.tsx`)

| Piece | Use |
| --- | --- |
| `.poster-ground` | yellow ground with the poster's dot grid, set on `<body>` |
| `<Section id title>` | live-data section wearing the poster's title slab |
| `<Slab tone rotate as>` | reversed-out title block, hard offset shadow |
| `<Card title dashed>` | cream panel, 3px border, hard offset shadow |
| `<Pill tone>` | rounded label — red/green/yellow/outline |
| `<NumberDisc n tone>` | numbered circle for ordered rule lists |
| `<PhotoFrame>` | rotated photo with an italic caption |
| `.bullets` / `.steps` | red bullet discs / numbered rows |
| `.leaders` | dotted-leader row, as on the QUỸ GIẢI table |
| `.bubble` / `.badge-circle` | the speech bubble and green sticker, both with a hard offset shadow |
| `.draw-*` | the LỊCH THI ĐẤU draw sheet — block, tie, row, bracket |

## Conventions

- Every section title is the same red `Slab` rotated -1.5°, on **one line**
  with `white-space: nowrap`. This is a deliberate departure from the poster
  JPGs, which break `THỂ LỆ / THI ĐẤU` and `NHÀ / TÀI TRỢ` over two lines. The
  longest title clears 390px at the font-size clamp's 1.8rem floor with room to
  spare; `landing.spec.ts` measures every slab's line count at 1280/768/390, so
  raise that floor or add a longer title only with that test green.
- No section repeats the tournament name and club beside its title slab. The
  poster JPGs do, and posters 2 and 3 used to, but the pair already appears in
  poster 1's badge bar, the `<title>` and the page footer — four more
  repetitions down one page read as noise. Section titles stand alone.
- Shadows are **hard and un-blurred**: `--shadow-hard` (9px) and
  `--shadow-hard-sm` (5px), never a blur radius.
- Rotations go through the `rot` class plus a `--rot` custom property, so
  `prefers-reduced-motion: reduce` can switch them off.
- Poster 2's card grid is `repeat(2, 1fr)`, not `auto-fit` — auto-fit gives
  three columns at desktop width and breaks the poster's card pairing. DOM
  order interleaves the two columns.
- Any `<img>` with an `aspect-ratio` also needs `height: auto`, or the HTML
  `height` attribute wins and the aspect ratio is ignored.
- Photo frames are **6:5**, not the poster's 4:3. `cam-vang.jpg` is a 3:4
  portrait, so it fills the frame's width at 100% of the source; a taller
  frame is the only way to show more of that scene. Keep `poster.css`'s
  `aspect-ratio`, the `PhotoFrame` width/height attributes and
  `scripts/optimize-assets.ts` in agreement.
- LỊCH THI ĐẤU follows `assets/images/bwf.jpeg`, not the poster JPGs: a
  `.draw-block` per encounter, three `.draw-tie`s inside it, two stacked
  `.draw-row`s per tie with the team colour where BWF puts the flag and the
  score where it puts the seed. Bracket lines belong to `.draw-bracket` alone —
  a round robin has nothing to converge on, so the group stage gets none.
- The two poster-1 stickers overlap a photo frame at every width: absolutely
  positioned over the three-column strip, and stacked to one column, placed
  into the same grid cell as their frame (`.bubble` on photo 2, `.badge-circle`
  on photo 3, as on the JPG). That placement needs every photo pinned to
  `grid-column: 1` with an explicit `grid-row` — otherwise auto-placement skips
  the cells the stickers hold and pushes each frame down a row or into an
  implicit second column. `landing.spec.ts` measures the overlap at 1280 and
  390.
- Grid tracks that hold a whole panel use `minmax(min(330px, 100%), 1fr)`. A
  bare `minmax(330px, 1fr)` keeps the 330px floor below that width and scrolls
  the page sideways on a phone.
- Everything must survive 390px wide with no horizontal scroll; tables go
  inside `.table-scroll`.
- Files here are outside `pnpm lint`, so `pnpm format` will not reformat them.
