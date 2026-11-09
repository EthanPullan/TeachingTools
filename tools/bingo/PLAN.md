# Bingo — build plan

> A brief for the AI that will build `tools/bingo/index.html`. Read this whole
> file, `CLAUDE.md` and `STYLE_GUIDE.md` before you write code. When the tool is
> finished, delete this file or cut it down to a short "how it works" note.
>
> **Goal:** the showcase tool of the site. The teacher types questions and their
> answers once. The tool prints unique, fair cards for a class, shows the
> questions full-screen one at a time, keeps track of what has been called, and
> checks a student's "BINGO!" in seconds.

---

## 1. Decisions already made (by the repo owner)

| Topic | Decision |
|---|---|
| Questions ("slides") | **Both.** The teacher can type question + answer pairs and the tool shows them as a full-screen caller deck. A plain list of answers (no questions) also works, for decks made in PowerPoint/Google Slides. |
| Answer types | **All of them:** whole numbers, negatives, decimals, fractions/mixed numbers, and short text (`√2`, `2π`, `x = 5`). |
| Card size | Teacher picks **3×3, 4×4 or 5×5**. Odd sizes can have a FREE centre. Default: **5×5 with FREE**. |
| Delivery | **Printed paper.** 1, 2 or 4 cards per page, each with a card number. On-screen student cards are out of scope. |
| Extra numbers | The tool can **make decoy answers** (numbers that are never called) to pad the cards. |
| Tracking | A caller board shows what has been called, in what order, with undo. |

House rules from `CLAUDE.md` apply in full: one self-contained HTML file, works
offline by double-click, no CDNs/fonts/network, `STYLE_GUIDE.md` tokens inlined.

---

## 2. Words used in this plan

- **Item** — one question and its answer. The question may be empty.
- **Answer** — what is printed in a card square. Shown *exactly as the teacher
  typed it*.
- **Decoy** — an answer that is on cards but never called. Good decoys are
  *plausible wrong answers* (sign slips, off-by-one), so a student who works the
  question out wrongly can find "their" answer on the card and mark it. When they
  claim BINGO, the check shows the mistake. That is a teaching moment.
- **Pool** — all distinct answers plus all decoys.
- **Game** — items + decoys + settings + the generated cards + the call log.
- **Round** — one play-through of a game with a win pattern. The same printed
  cards can be used for several rounds.

---

## 3. Screens (one page, three tabs + a present mode)

Use the style guide's tabs component. The tab bar shows the game name and a
"Saved" status.

### 3.1 Setup tab

1. **Items box** (big textarea, monospace). It accepts any of these, one item
   per line:
   - `12`. An answer only.
   - `3 × 4 | 12`. A question, then `|`, then the answer.
   - A two-column paste from a spreadsheet (a tab between question and answer).
   - On a line with no `|` and no tab, also split on commas or spaces when every
     piece reads as a number (`3, 7, -2, 0.5`). This makes a quick number list
     easy.
2. **Live preview table** under the box. Columns: #, question (rendered), answer,
   type (int/dec/frac/text). Problem rows are highlighted in red with a short
   reason:
   - empty answer
   - **duplicate answer** (warning, not an error). Two questions can share an
     answer. The answer goes into the pool once. Calling either question marks
     it, and calling the second one gives no one anything new. Show it as:
     *"Q4 and Q9 both have the answer 12."*
   - **value clash**: `1/2` and `0.5` are the same value. Treat them as the same
     answer and warn the teacher (see §5).
3. **Decoys panel**:
   - "Make decoys" button, with a count (default: enough to fill the gap, or
     about 25% of the pool, whichever is bigger) and a style:
     *Likely mistakes* (default) or *Random in range*.
   - A box where the teacher types their own decoys. This is the only option for
     text answers.
   - Made decoys appear as editable chips: delete one, lock it, or "Re-roll
     unlocked".
4. **Card settings**: size (3/4/5), FREE centre on/off (odd sizes only), number
   of cards (1–100, default 30), and **decoys per card** (slider, see §6.3).
5. **Health line** (always visible, monospace, plain words). Examples:
   - `40 answers + 10 decoys · 24 squares per card · 30 unique cards ✓`
   - Warning: *"Only 24 answers for 24 squares: every card has the same numbers,
     so everyone fills the card at the same time. Lines still differ. Add decoys
     or answers for a better game."*
   - Error: *"23 answers + decoys can't fill 24 squares."*
6. **Generate cards** button (primary). If cards already exist and have been
   printed, ask before making new ones (*"Printed cards will no longer match."*).

### 3.2 Cards tab

- A grid of card previews in the same layout they print in. Each card shows its
  **card number**, the game title and a FREE square.
- A per-card stats strip: real answers, decoys, live lines (see §6).
- Print options: cards per page (1/2/4), show/hide title, optional "Name: ____"
  line, and an optional **answer key / call sheet** page (every item, its answer,
  and which cards have it).
- "Print" uses the browser's print with `@media print` (style guide §11). That
  handles Unicode, fractions and auto-shrink text far better than a hand-written
  PDF. A direct PDF writer like the Periodic Table's is **not** needed here.

### 3.3 Play tab (the teacher's caller board)

- **Board**: every pool answer as a tile, sorted by value (numbers) or A–Z
  (text). Decoys are hidden by default, with a toggle to show them greyed out.
  Click a tile to call it or uncall it. Called tiles get a fill **and** a
  check mark, so colour is not the only signal.
- **Next question** (primary, `Space`): picks a random uncalled item, or the next
  item in the teacher's order (a setting: *Shuffle* / *In order*). It opens
  present mode on that question.
- **Call log**: numbered list in call order (`7. 3 × 4 → 12`). Undo last
  (`Z` / `Backspace`). Counter: `14 of 40 called`.
- **Round**: win pattern selector (see §7), a "New round" button (clears calls,
  keeps cards), and a round number.
- **Check a card**: a number box plus a button (`C` opens it). It shows that
  card big, with called squares marked. The verdict:
  - ✅ *"Card 17 has BINGO — row 2."* The winning line is highlighted.
  - ❌ *"Not yet. 1 square in row 2 hasn't been called: 15."* If the square is a
    **decoy**, say so: *"15 was never an answer. Which question did you get 15
    for?"*
  - Both use the current win pattern.
- **Near-winners** (off by default, it's a spoiler): *"Cards 4, 17 have a line.
  Cards 2, 9, 30 need 1 more."* Useful for pacing.

### 3.4 Present mode (projector)

Full-screen, like `name-caller`'s `present` class with `requestFullscreen` and a
`fullscreenchange` fallback.

- Big question text in the middle, with the question number and `n of N`.
- **Reveal answer** (`R`), so students work it out first. The answer stays
  hidden until revealed. A setting can reveal it right away.
- A strip of called answers along the bottom (setting: show/hide) so late
  students can catch up.
- Keys: `Space`/`→` = next (reveal first if hidden, then next question), `←` =
  back to the previous question (view only, nothing is uncalled), `R` = reveal,
  `F` = fullscreen, `Esc` = leave.
- With answers only (no questions), show the answer itself, large, like a classic
  bingo call.
- Text auto-fits: shrink to fit and never overflow.

---

## 4. Question formatting (no libraries)

MathJax/KaTeX are not allowed (no CDN, and too big to inline). Add a **tiny**
markup renderer instead. It is used only for question text, and the answers on
cards reuse the same function:

- `x^2` → x², `x^(n+1)` → superscript group. `x_1` → subscript.
- `a/b` written as `{a}/{b}` → a stacked fraction (inline-flex). Plain `3/4` in
  questions stays inline.
- `sqrt(x)` → √x with an overline. `*` → ×. `-` between spaces → −.
  `pi` → π. `<=` `>=` `!=` → ≤ ≥ ≠.
- Escape HTML first, then apply the rules. No raw HTML from the teacher.

Leave images for later (§11). Note it in the UI as "coming later" only if asked.

---

## 5. Parsing and values

Each answer has `display` (exactly as typed, trimmed) and `key` (used to find
equal answers and clashes):

| Typed | Type | Key |
|---|---|---|
| `12`, `-7`, `−7` (Unicode minus) | int | exact rational |
| `3.50`, `.5`, `-0.25` | dec | exact rational (`3.50` = `7/2`) |
| `3/4`, `-3/4`, `1 3/4` | frac | exact rational, reduced |
| anything else (`√2`, `2π`, `x = 5`, `50%`) | text | lower-case, spaces squeezed, Unicode minus → `-` |

- Store rationals as a reduced pair of **BigInt** numerator and denominator. Don't
  compare with floats.
- Two answers with the same key are **the same answer**. Show the first spelling
  and warn about the others. This means `0.5` and `1/2` cannot both be on cards.
  It would be unfair, because a student can't know which one a question means.
- Decoys must never share a key with any answer.

---

## 6. Card generation (the heart of the tool: make it fair)

### 6.1 Randomness

- Use a small **seeded PRNG** (sfc32 or mulberry32) seeded from
  `crypto.getRandomValues`. Keep the seed in the game. Use Fisher–Yates for
  shuffles. Never use `Math.random()` in the generator. This keeps bugs
  repeatable.
- **Save the generated cards in the game file as well as the seed.** If the
  generator changes in a later version, cards that were already printed must
  still match what the Check button sees.

### 6.2 Uniqueness rules (hard)

1. No two cards have the same **set** of answers. Same answers in a different
   order counts as the same card for fairness, because they win a full card at
   the same moment.
2. If the pool allows it, no two cards share a **complete line**, meaning the
   same set of answers in any row, column or diagonal. Then two cards can't win
   the same line on the same call. If this can't be met, relax it and say so in
   the health line.
3. If 1 can't be met (the pool is too small for N unique cards), stop and tell
   the teacher the most cards these settings allow.

Count the possible cards for the error message: `C(pool, squares)` (use BigInt,
and cap the displayed number).

### 6.3 Fairness rules (soft, aim for them, show them)

- **Same number of decoys on every card** (the "decoys per card" slider). A card
  with more decoys has fewer callable squares and is less likely to win.
- **Same number of live lines on every card.** A line with a decoy in it can
  never be completed. Place decoys so every card has the same count of live
  lines (and at least 3 on a 5×5, so a line game is always possible). Pick a
  decoy *layout* first (positions only), then fill it. All cards can share one
  set of good decoy layouts, rotated and reflected so they don't look the same.
  On full-card rounds the decoys don't matter: no card can ever win a full card
  if it has a decoy, so **turn decoys into a warning for full-card patterns**
  (see §7).
- **Even coverage.** Every answer should be on about the same number of cards
  (`≈ N × realPerCard / answers`). Choose answers "least used first" with
  random tie-breaks. Then no question is a dud that helps nobody, and no
  question helps everyone.
- Shuffle positions last. A small number is not more likely to sit top-left.

### 6.4 Algorithm sketch

```
squares   = size² − (free ? 1 : 0)
decoysPer = slider value d (0 … min(decoys, squares − 1))
realPer   = squares − d
layouts   = decoy position sets with exactly L live lines (pre-search once)

for i in 1..N:
  repeat up to 2000 tries:
    real   = pick realPer answers, least-used first
    decoy  = pick d decoys, least-used first
    layout = random pick from layouts, with a random rotation/reflection
    card   = place decoys at layout, shuffle real into the rest
    if passes 6.2 against cards so far: accept, update use counts, break
  if no try passed: relax the line rule once, else report how many fit
```

It runs in well under a second for 100 cards, so there is no need for a worker.

### 6.5 Decoy maker

Decoys follow the answers' types. Never make a decoy whose key matches an
answer or another decoy.

- **Likely mistakes** (default): for each source answer, collect candidates and
  pick a mix:
  - int: `−a`, `a ± 1`, `a ± 10`, digits reversed (`21 → 12`), `a × 10`
  - dec: shift the decimal point (`0.25 → 2.5`), `a ± 0.1`, keep the same number
    of decimal places
  - frac: flip it (`3/4 → 4/3`), `num ± 1`, `den ± 1`, add the parts instead
    of using them properly (`1/2 + 1/3 → 2/5`). Never an unreduced copy like
    `6/8`, because it equals an answer by value.
  - Use `−a` only when the answers include negatives, or when the teacher turns
    on "sign slips".
- **Random in range**: a uniform pick between the answers' min and max, widened
  10%, with the same type and decimal places.
- **Text answers**: no automatic decoys. Ask the teacher to type them.
- Made decoys go into the editable chip list (§3.1). Re-rolling keeps locked
  ones.

---

## 7. Win patterns

Line (any row, column or diagonal; on by default), Row only, Column only,
Four corners, X (both diagonals), Picture frame (outer ring), Full card. The
same `checkCard(card, calledKeys, pattern)` function powers **Check a card**,
**Near-winners** and the simulator (§11). It returns
`{ win, line, missing: [answer…], decoysMissing: [answer…] }`.

- FREE counts as called.
- Patterns that need squares a size doesn't have are disabled (3×3 has no
  "frame" distinct from full).
- If the pattern can't be won on some cards because of decoys (full card with
  decoys, or four corners where a corner is a decoy), warn before the round:
  *"With decoys on cards, no one can win Full card. Turn decoys off for this
  pattern or pick Line."* For Four corners, place decoys outside the corners
  when that pattern is the default for the game.

---

## 8. Saving

- **Autosave** the current game (items, decoys, settings, seed, cards, rounds,
  call log) to `localStorage` on every change, under a versioned key like
  `bingo.v1.current`. Refreshing mid-lesson must lose nothing.
- **Game library**: name a game and keep several (`bingo.v1.games`). "Open",
  "Duplicate", "Delete". Teachers will reuse a deck next year.
- **Save file / Open file**: JSON with `{ type:'teachingtools-bingo', version:1,
  … }`, following `periodic-table`'s `buildData`/`importData`/`openFile`
  pattern (validate `type`, confirm before replacing). It is the safe backup and
  the way to move a game to another computer.
- Wrap every `localStorage` call in try/catch. The tool must still work when
  storage is blocked.

---

## 9. Code layout inside the one file

Keep the logic as pure functions at the top of the script, with no DOM access,
so they can be tested in Node by pasting or extracting that block:

```
/* <bingo-core> */
parseItems(text)        → { items, problems }
valueKey(str)           → { type, key, rational? }
makeDecoys(answers, opts, rng) → [decoy…]
rng(seed)               → () => float  (sfc32)
generateCards(pool, settings, rng) → { cards, report }
checkCard(card, calledSet, pattern) → result
renderMath(str)         → safe HTML string
/* </bingo-core> */
```

Then: state + save/load → render (setup / cards / play / present) → events and
keys. Use one `state` object and one `render()` per tab, the same as the other
tools.

---

## 10. Testing (no test framework in the repo)

1. **Core**: a Node script in the scratchpad (not committed) extracts the
   `<bingo-core>` block and checks:
   - parsing for every row of the §5 table, `1/2` = `0.5` clash, Unicode minus
   - uniqueness with 100 cards at 5×5 from 40 answers + 10 decoys
   - equal decoys and live lines per card, even coverage (max − min ≤ 1)
   - the "pool too small" error at exactly squares − 1
   - `checkCard` for every pattern, including FREE and decoy misses
   - the same seed gives the same cards
2. **UI**: Playwright (pre-installed, see the environment notes). Run the full
   flow: paste items → make decoys → generate 30 → print preview screenshot at
   1/2/4 per page → call 10 → undo → check a winning and a losing card → reload
   and confirm state survived → present mode keys.
3. Check at phone width (style guide §10), with `prefers-reduced-motion`, and
   with long answers (`x = −3.25`) shrinking to fit their squares on print.
4. Open the file by double-click (`file://`) and confirm there are no network
   requests.

---

## 11. Build order

Land each phase on `main` when it works (see `CLAUDE.md`).

1. **Core + Setup + Cards + Print.** Answers only, decoy maker, generation with
   every §6 rule, health line, print sheets, autosave.
2. **Play tab.** Board, call log, undo, rounds, win patterns, Check a card.
3. **Questions + Present mode.** `question | answer` parsing, math markup,
   reveal flow, keyboard controls.
4. **Library + Save/Open file.** Answer-key page, near-winners.
5. **Polish (the "best tool out there" part):**
   - **Game-length estimate**: simulate about 500 random call orders with the
     real cards and show *"First line usually after about 9 questions; most
     cards have a line by about 22."* That tells the teacher whether they have
     enough questions before printing.
   - A sample game (a times-table deck) on first open, so the tool explains
     itself.
   - Optional: images in questions (paste/drop, stored as data URLs. Watch the
     `localStorage` size and warn above about 3 MB).
6. **Home page card** in `/index.html` (same markup as the other `.card`s, mark
   `▦` or similar). Tags: `unique cards`, `question deck`, `decoys`,
   `check a winner`, `print`.

---

## 12. Open questions: ask the owner before building

- Should students see the called-answers strip on the projector by default? The
  plan says **yes, with a toggle**.
- Is it right to treat `1/2` and `0.5` as the **same** answer (§5)? The plan
  says yes.
- What is the largest class size? The plan assumes up to 100 cards.
- Is a direct PDF save (data embedded, like the Periodic Table) wanted, or is
  browser print + a JSON save file enough? The plan says print + JSON.
