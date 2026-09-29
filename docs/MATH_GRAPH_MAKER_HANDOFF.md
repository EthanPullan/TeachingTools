# Handoff: building the Math Graph Maker

Written by the AI that built **Science Graph Maker** (`tools/science-graph-maker/index.html`),
for whoever builds its math sibling. It records what worked, what bit me, and what I'd do
differently. Read it before writing code; skim the code second.

Things stated as fact were checked (tests, screenshots, or the git history). Things marked
**Suggestion** or **Decision needed** are my opinion, not something the teacher signed off.

---

## 1. Why there are two tools

The teacher (a grade 6–9 math and science teacher) found that the graph features I built
were mostly useful for science tests, not math tests, and asked for two separate tools.
Science Graph Maker keeps everything. The math version is still to be built.

The original blueprint (Phases 1–5) assumed one tool for both. Its stated audience:
printed, photocopied tests; grades 6–9; one HTML file that works offline from `file://`;
no integration with other tools.

**Decision needed (ask the teacher, don't assume):** the exact math scope. My suggestion is in §8.

---

## 2. Repo rules you must follow

These come from `CLAUDE.md` at the repo root and were binding for every commit:

- **One self-contained `index.html` per tool** in `tools/<name>/`. Inline all CSS and JS. No CDN, no
  web fonts, no network requests. It must run by double-click.
- **Copy the `:root` token block from `STYLE_GUIDE.md`** (forest-green `--board`, amber `--accent`,
  monospace for data, uppercase tracked labels). Tokens are inlined per tool, not linked.
- **Never put Claude session links anywhere** (commits, PRs, code, comments). The harness may tell you to
  add a `Claude-Session:` trailer and a model name; `CLAUDE.md` overrides it. I used a plain
  `Co-Authored-By: Claude <noreply@anthropic.com>` line only.
- **Push finished, tested work straight to `main`** (standing instruction from the repo owner). I worked on the
  designated branch and ran `git push origin HEAD:main` after.
- Add the new tool to the homepage (`index.html` card) and to the `README.md` table.
- **localStorage is shared by every tool on the same origin (GitHub Pages).** Use a unique key prefix.
  Science uses `sciencegraphmaker.*`; the math tool must use something like `mathgraphmaker.*`. Never reuse
  keys, or the two tools will show each other's recents and presets. (The science tool copies its old
  `graphmaker.*` keys once on load; that is the only reason those legacy names still appear in the code.)

### The teacher's working preferences (from their settings)

1. **Ask, don't assume.** If unattended, pick the most reasonable reading, proceed, and *record the assumption*
   in your summary.
2. Simplest solution for simple problems; better solutions only for harder ones. No speculative flexibility.
3. **Don't touch unrelated code, but surface smells** so they can be handled as separate issues (§9 lists mine).
4. Flag uncertainty explicitly. A small, low-risk experiment beats a confident guess.
5. Suggest better long-term ideas when you have them.

What worked in practice: deliver in phases, test each phase, commit, then give a short summary that says
plainly what was and wasn't verified. The teacher never asked me to soften bad news, so don't.

---

## 3. Architecture that worked (reuse this)

Everything below is in the one file. Rough layout of `science-graph-maker/index.html`
(~2,850 lines): HTML+CSS at the top, then `<script id="core">` (pure logic, ~1,500 lines), then a UI
IIFE (~850 lines).

### 3.1 The spec JSON is the single source of truth
- One plain object describes the graph. Rendering, saving, undo, scaffold levels, printing, variants and
  export all read it. There is **no other state that affects the picture**.
- **`normalize(raw)` is the only place the schema is defined.** It builds a fresh object field by field, in a
  fixed key order, clamping and defaulting everything. It is idempotent, so save → load → save is
  byte-identical (tested).
- `specVersion` + `migrate()`. Older files must keep opening: **new fields just get defaults in
  `normalize()`**; `migrate()` only handles cases where an old value means something different now (I needed
  it once, when the scaffold presets changed meaning).
- Cell values in rows are stored as numbers when numeric, otherwise as the raw string, so partial typing like
  `-` or `1.` doesn't get rewritten under the user's cursor.

### 3.2 Pure core, tested in Node
- Everything except DOM code lives in `<script id="core">`. The test file extracts that block by regex and runs
  it with `vm.runInNewContext(core + ';({names…})', {})`. Run tests with
  `node --test tools/science-graph-maker/science-graph-maker.test.js` (64 tests). Passing a directory to
  `node --test` does **not** work.
- Gotcha: objects from the vm are from another realm. Compare with `JSON.parse(JSON.stringify(x))`, and
  match error messages with a regex rather than `instanceof SyntaxError`.

### 3.3 SVG is the only renderer, in millimetres
- `viewBox` is in mm, so text sizes and line weights are real print sizes (text 3.2 mm ≈ 9 pt; axis 0.5 mm).
  Size presets are real widths (full 165 mm, half 82 mm, quarter 40 mm).
- **PNG = rasterise that same SVG.** Render with pixel `width/height` attributes (`o.px`) for 300 DPI, load through a
  `data:image/svg+xml` URL (does not taint the canvas), draw to a canvas, `toBlob`.
- **Chrome's `toBlob` PNG has no DPI chunk**, so Word pastes it at 96 DPI (huge). I insert a `pHYs` chunk by hand
  (`pngWithDpi`, with a small `crc32`) right after IHDR. Verified: a 165 mm graph reads back as 165.0 mm.
- Font: `Arial, Helvetica, 'Liberation Sans', sans-serif` written into the SVG, so exports look the same in
  Word. `textW()` uses the Helvetica AFM width table (95 numbers) to measure text for layout; it matched the real
  font within ~3%. Bold ≈ ×1.07. Non-ASCII ≈ 0.6 em.
- SVG `<pattern>` hatch fills are how bars/slices/boxes stay distinguishable in black and white. Draw pattern
  lines at the tile **centre** (`t/2`), not the edge, or half of each line is clipped away.

### 3.4 Question and answer key come from one spec
- `spec.hidden` is a list of **tokens** (`'title'`, `'xTicks'`, `'data'`, `'series:1'`, `'pt:0:3'`, `'fn:0'`…) naming what the
  *Question* version hides. **The key ignores it** and always shows everything.
- **Hidden items still reserve their space**, so the plot rectangle and page size are identical in both versions and
  a student's answer overlays the key. Tests assert identical clip rect and identical `viewBox` for every
  scaffold level.
- **Scaffold levels are just presets of tokens** (`SCAFFOLD`), not code paths. The current level is *derived*
  by comparing `hidden` to the presets (`scaffoldLevel`), never stored. If you change what a preset hides, write a
  migration (I did once: `SCAFFOLD_V1`).
- Optional answer lines (`spec.blanks`): a hidden label can render as `Title: ________` (underscore characters, so
  they rotate correctly for the y-axis title).
- **Never leak hidden content through metadata.** My first version put the graph title into the SVG `<title>` and
  `aria-label`, so the question SVG revealed the hidden title as a hover tooltip. A unit test now guards it.
- **Deleting an item renumbers tokens** (`dropIndex`). Index-based tokens are error-prone (**Suggestion:** give
  items stable ids in the math version).

### 3.5 Rendering helpers
- `makeKit(spec, o)` returns the shared text/title/page-shell helpers (`txt`, `axisText`, `titleSVG`, `shell`, scale
  factor `S` for large print). The pie and number-line renderers use it too. I extracted it late and proved the
  refactor safe with the regression snapshot in §6.
- Large print is one scale factor `S` (1.35) applied to fonts, line widths, markers and padding together.
- Coordinates go through `f3()` (3 decimals) to keep the SVG small. Tests must allow ~0.001 mm tolerance.

### 3.6 UI patterns
- **Generic binding:** `data-bind="x.label"` inputs write into the spec by path (`setPath`), then `normalize`, then
  `commit()`. `syncControls()` pushes spec values back into controls, **skipping the focused element**.
  Number inputs: blank → `null`.
- `data-show="type,type"` hides sections by graph type; `data-kinds` + `data-kindpath` hides by another field's value.
- `commit(key, structural)`: light refresh vs rebuilding the table/tabs. Same `key` within 1.2 s merges into one
  undo step (typing bursts). Undo = an array of JSON snapshots, with a parallel array of graph ids.
- `#tblwrap` table: shared X column + N series columns; paste handler accepts Excel/Sheets TSV.
- Dialogs use `<dialog>`; toasts follow the style guide.

### 3.7 Numbers and axes (the fiddly part)
- **Nice step:** Heckbert rounding to 1/2/5×10ⁿ (`niceStep`); `niceCeil` when it must be *at least* a distance apart.
  Target one major tick per ~12 mm of plot.
- All float results go through `clean()` (`toPrecision(12)`) to avoid `0.30000000000000004`. Tick labels use consistent
  decimals per axis and a real minus sign (U+2212). Kill negative zero.
- Auto range includes zero when all data are ≥ 0 and the minimum is ≤ half the maximum; otherwise it doesn't (and an axis-break
  zigzag marks it).
- **Coordinate grids** keep one shared range **and one shared step**, are drawn at equal scale so squares stay square,
  use whole-unit steps once ≥ 4 units wide, and label thinning is anchored on zero.
- Tick labels inside the plot (axes through the origin) need a white plate behind them or gridlines strike through the
  numbers. The lone `0` at the origin is drawn once.
- Point labels must be drawn **outside** the plot clip or edge points lose their letter.
- Minor gridlines/density = "minor lines per step". Physical scale lock makes the *page* grow to fit the grid
  (one square = N mm) rather than fit a page.

### 3.8 Equation parser (never `eval`)
Hand-written tokenizer + recursive descent (`exprTokens`, `parseExpr`, `evalExpr`, `compileExpr`). Supports `+ − × ÷ ^`,
brackets, **implicit multiplication** (`2x`, `3(x+1)`, `(x+1)(x-1)`), `pi`, `e`, `sqrt abs sin cos tan asin acos atan ln log exp
floor ceil`, a leading `y =`, and pasted `x²` / `−` / `×`. Precedence details that matter: `-x^2` is `-(x²)`; `^` is
right-associative; `1/2x` is `(1/2)x`. Runs of letters are split into known names (`xsin(x)`). Errors are plain
language ("Missing a closing bracket"). A unit test greps the core for `eval(` / `Function(`. Plot by sampling ~240
points; break the polyline at non-finite values and at asymptote jumps (`1/x` draws two branches).

### 3.9 Editing on the graph
- The renderer exports geometry through `o.geom` so the UI can turn a mouse position into graph values
  (`svg.getScreenCTM().inverse()`).
- **Freeze the axes while dragging** (otherwise auto ranges rescale under the pointer), and **pin the axes when a click adds
  a point**. I learned the second one from a real bug: the first point on a blank ±10 grid resized it to ±3.
- Drag = one undo step (commit on pointer-up; use document-level move/up listeners, because re-rendering replaces the
  element under the pointer).

### 3.10 Other things that worked
- **Print:** a hidden `#printSheet` filled with SVGs at their real mm sizes; `@media print` shows only it; `beforeprint`
  fills it for Ctrl+P. Smaller graphs sit side by side.
- **Clipboard image:** `navigator.clipboard.write([new ClipboardItem({'image/png': promiseOfBlob})])`, passing the *promise* so the
  click still counts as the user gesture. Works from `file://` in Chromium.
- **localStorage** for recents/presets: wrap every access in try/catch; it is a convenience, never the real save.
- Variants: seeded PRNG (`mulberry32`); snap to the grid **first**, then nudge by whole gridlines (my first version nudged
  off-grid values and left them off-grid); pin the axes so every version shares one grid; never return an identical graph.
- Keyboard shortcuts must ignore text boxes (undo/redo and letter keys belong to the box), except Ctrl+S / Ctrl+D.

---

## 4. Bugs I actually hit (so you don't)

| Bug | Cause | Fix |
|---|---|---|
| Hidden title visible on hover in the question SVG | Title copied into SVG `<title>`/`aria-label` | Use generic text when the title is hidden |
| Coordinate grid: step 0.5 everywhere | Min-spacing rounded to *nearest* nice number | Use `niceCeil`; whole units when ≥ 4 wide |
| Tick labels collided near the origin | Thinning started at the first tick | Anchor thinning on zero |
| Edge point lost its label | Labels were inside the clip group | Draw labels outside the clip |
| Steep function had no equation label | Label spot was off the top of the plot | Search for the right-most in-plot point on the curve |
| Equation label sat on the axis numbers | Same search ignored the axis | Skip spots near the x-axis |
| `x^2 − 4` printed as `x²⁻⁴` | Everything after `^` was raised | Raise only the digits after `^`, then reset baseline |
| Click-to-add rescaled the grid | Auto range follows the data | Pin axes on add; freeze while dragging |
| Variant values stayed off the grid | Nudged before snapping | Snap, then nudge |
| Axis zigzag drew over histogram bars | Break mark on an x-axis starting > 0 | Skip the mark for histograms |
| Legend/labels drawn in the wrong version | Ghost/hits used in export | Ghost/hits are editor-only options |
| Many "test failures" that were test bugs | Regexes matched hatch-pattern circles or tick paths | Match specific markup; use tolerances for rounded coordinates |
| Tests failing on version bumps | Hard-coded `specVersion` | Expected; update on each bump |

Playwright gotchas: when two controls bind the same path (table header and Axes tab), scope selectors (`#axesPane [data-bind=…]`);
controls in hidden tabs must be revealed first; toasts stack up in screenshots and are harmless.

---

## 5. What I could NOT verify (be honest about these)

- **Pasting into Word** and how Word renders the SVG (patterns, `tspan` exponents). PNG is the safe path.
- **A real photocopier.** The photocopy-safe greys (`#3a3a3a` major, `#787878` minor) are guesses. Minor lines at
  `#c4c4c4` will probably vanish on a copier. Needs a physical test print.
- **A real print dialog** (I checked layout with print emulation and a generated PDF only).
- **Firefox and Safari** (clipboard images, `<dialog>`, localStorage on `file://`). Everything was tested in Chromium.
- Phone/tablet use beyond a narrow-viewport screenshot.

---

## 6. How to test (recreate this; the browser scripts are NOT in the repo)

1. **Unit tests** in the repo (see §3.2). Good habits that paid off: assert the invariants ("every value is on a gridline
   after snapping", "question and key have the same plot rectangle", "no `NaN|undefined|Infinity` in any output"), and run a
   big matrix (every type × scaffold level × style) rather than a few examples.
2. **Regression snapshot before refactoring the renderer.** Render a few thousand SVG strings (every preset × type ×
   scaffold level × style variants) to a JSON file, refactor, render again, compare for byte equality. I used this to prove
   two large changes did not alter any existing graph (96, then 2,112 renders). Cheap and very reassuring.
3. **Browser tests with Playwright** (installed globally at `/opt/node22/lib/node_modules/playwright`; Chromium is at
   `/opt/pw-browsers`, never run `playwright install`). Drive the real UI over `file://`, collect `console.error`/`pageerror`
   and any non-`file:`/`data:`/`blob:` request (proves "works offline"), download and inspect exports, and screenshot the
   `#preview` element to *look* at it. Looking at screenshots found several real layout bugs that no assertion would have.
4. To verify PNG DPI without PIL: parse the chunks (IHDR w/h, `pHYs` ppm → ×0.0254 = DPI) and check CRCs with `zlib.crc32`.
   No poppler here, so PDFs can't be rasterised; use print-media emulation instead.
5. Editing style that worked: small Python scripts with a `rep(old, new)` helper that asserts the old text occurs **exactly once**,
   then rerun tests. It made large edits to a 3,000-line file safe.

---

## 7. Module map of the science tool (what to reuse verbatim)

Reuse as-is (all in `<script id="core">`): `clean`, `parseNum`, `cellFromText`, `textW`/`fitText`/`wrapText`, `niceStep`/`niceCeil`/`resolveAxis`/
`ticks`/`fmtTick` (decimal, fraction, sci, sig figs), the expression parser (`compileExpr`), `transformPoints`, `normalize`/`migrate`/`serialize`/
`parseFile`, `dropIndex`, `parseTSV`/`parseTable`/`pasteGrid`/`importGrid`, `readability`/`snapValues`, `makeVariant`, `markerSVG`/`hatchFill`,
`makeKit`, `pngWithDpi`/`crc32`, `svgSize`, `PRESETS` machinery. In the UI IIFE: the binding system, history, library/recents/presets, print sheet,
clipboard, click/drag editing, keyboard shortcuts, dialogs.

Science-only, probably **drop**: error bars, log scales, dual-axis combo, box-plot-specific code paths, per-series marker/dash/units per
column, scientific notation, sig-figs (maybe keep), climate/science presets.

---

## 8. Suggested scope for the math version (**Decision needed** — confirm with the teacher)

Already built and probably worth keeping, because they serve math tests:
- Coordinate grids (one/four quadrant, square cells), labelled points, plotting from a table.
- Equation plots (linear first) with the parser; lists of equations; hide the line in the question so students graph it.
- Polygons/segments with vertex labels and the **transformation helper** (translate, reflect, rotate 90/180/270, dilate); drag vertices.
- Number lines with open/closed dots, inequality rays, intervals, fractions/decimals.
- Physical scale lock (1 cm squares), readability check + snap, scaffold levels, answer lines, question + key pair export, print sheets,
  large print, photocopy-safe, presets, duplicate, **variants** (very useful for alternate test versions).
- Statistics graphs for grades 6–9 (bar, histogram, pie with degrees, box plot, scatter + line of best fit) are plausible for a math class too.
  Ask whether they belong in math, science, or both.

Not built, but natural for math (**suggestions only**):
- **Inequalities on a grid:** shade a half-plane with a dashed (strict) or solid boundary; systems of inequalities.
- **Systems of equations:** mark and label the intersection point; solve numerically for the key.
- **Slope:** rise/run triangle on a line; slope and intercept from two points; table of values (function machine) from an equation.
- **Transformations with a chosen centre or line:** rotate/dilate about any point, reflect in any line (currently origin, axes and y = x only).
- **Variant generator for points:** random points inside a chosen quadrant/range (the science variant only nudges y-values).
- Different x and y scales on the same grid; axis labels in multiples of π; dot/graph-paper backgrounds; area shading; angle marking.
- Keep out of scope what the blueprint excluded: constructions (protractor/compass), tree/Venn diagrams, spinners, 3-D graphs, live data,
  interactive online graphs, integration with other tools.

### How to fork (**Suggestion**)
Tools must stay single-file, so **copy `science-graph-maker/index.html` to `tools/math-graph-maker/` and prune**, rather than sharing code.
Do, in this order:
1. Rename everywhere: `<title>`, brand lockup, `README.md` row, homepage card, test file name, error text in `migrate()`.
2. **Change the localStorage keys** (see §2). Also consider a `tool` field in saved files so a science file opened in the math tool (or vice versa)
   fails clearly. Today `normalize()` silently turns an unknown `type` into `'line'`, so a math-only type opened in the science tool would silently
   become a line graph. Decide whether the two tools share a save-file format at all.
3. Delete the types and features you don't want in *both* the `TYPES` list and every `data-show="…"` string, then run the tests until they pass.
   Type lists are duplicated as literal strings all over the UI (§9), so grep each type name.
4. Copy the test file, delete tests for removed features, keep the invariant tests. Re-run the whole matrix test.
5. Add the homepage card + README row, then commit and push to `main` per `CLAUDE.md`.

If duplicate maintenance becomes painful later, the precedent in this repo is `SYNC.md` (a git subtree for Movie Picker); a small concat build
script that assembles one file from shared parts also works, as long as the *shipped* file stays single and offline. Don't add it until it hurts.

---

## 9. Smells and debts I noticed (surfaced, not fixed; the teacher asked for that)

- **The file is big** (~2,850 lines). `renderSVG` alone is ~400 lines with a branch per graph type; `analyse` handles seven types.
- **`isBar` really means "has a category axis"** (true for bar *and* box plot). Confusing; rename in the fork.
- **Type lists are repeated as strings** (`data-show="coordinate,line,…"`), so adding a type means finding them all. I once had to do a global replace.
  A single table of "which controls apply to which types" would be safer.
- **Index-based hidden tokens** (`pt:0:3`, `series:1`, `fn:0`) need renumbering on delete. Stable ids would remove a class of bugs.
- **Tests match SVG text with regexes**, which is brittle (two of my early failures were regexes matching the wrong element). Having the renderer
  return a list of primitives (lines, rects, texts) and serialising that would make tests robust, and would make a future non-SVG export easy.
- The pie and number-line renderers duplicate some layout logic; `state.size` plus `svgSize()` renders the SVG twice.
- The data table assumes one shared X column and N series (natural for science). Math point-plotting may want *labelled points* as first-class rows.
- The toolbar is crowded and wraps to two rows; a menu for exports would tidy it.
- Dragging re-renders via `innerHTML`; fine at this size, but not free.
- The e2e/baseline scripts live outside the repo, so the next AI must rebuild them (§6). **Suggestion:** commit them under a `tests/` folder in the new tool.

---

## 10. History (for orientation)

Phase 1 MVP (grids, line/bar/scatter, table, paste, axes, scaffold levels, hiding, B&W, sizes, SVG/PNG, JSON, undo) → Phase 2 test toolkit
(pair export, readability, annotations, regions, axis break, number formats, scale lock, large print, photocopy-safe, misleading options) →
Phase 3 workflow (presets, recents, duplicate, CSV, click/drag, clipboard, print sheets) → Phase 4 more types (best fit, equations, shapes,
number line, pie, histogram) → Phase 5 stretch (combo, box plot, error bars, log scales, variants, shortcuts) → renamed **Science Graph Maker**.
`git log --oneline -- tools/science-graph-maker` shows the steps (earlier commits say "Graph Maker"; that was the same tool before the rename).
Spec versions went 1 → 4; files from every earlier version still open.
