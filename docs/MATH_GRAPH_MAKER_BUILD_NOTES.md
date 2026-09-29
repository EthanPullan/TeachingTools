# Math Graph Maker: build notes

Running log for `tools/math-graph-maker/`. Inputs: the feature blueprint (phases 1–13) and
[`MATH_GRAPH_MAKER_HANDOFF.md`](MATH_GRAPH_MAKER_HANDOFF.md) from the Science Graph Maker build.

## Reuse policy: copy from the Science Graph Maker first

**Rule for every phase: before writing a helper, look for it in `tools/science-graph-maker/index.html`.
Copy it (keeping the name) and adapt only what the math tool needs.** Tools must stay single-file, so
"reuse" means copy-and-adapt, not import. When a copied function is improved here, note it below so the
two files can be reconciled later.

### Copied as-is (or nearly)
`clean`, `clamp`, `esc`, `f3`, `isBlank`, `parseNum`, `cellFromText`/`cellClean`, the Helvetica width table
`HW` + `textW`/`fitText`/`wrapText`, `niceStep`/`niceCeil`/`niceRange`, `ticks`, `decimals`, `anchorIndex`,
`fracStr`, `parseTSV`/`parseTable`, `mulberry32`, `hatchFill`, `crc32`/`pngWithDpi`, `mmToPx`, `makeKit`
(text/title/page-shell helpers), the CSS and dialog/toast/toolbar markup, and in the UI: the `data-bind`
binding system, undo/redo snapshot stack, export (SVG, PNG at 300 DPI, question + key pair), file save/open,
keyboard guards, click/drag editing (`toData`, `freezeAxes`), print sheet, clipboard, library/recents.

### Adapted
- `resolveAxis`: square cells, a default of at least ±10 that grows to fit objects, mirrored auto range in
  four-quadrant mode, and a maximum cell count so the step adapts to the printed size.
- `markerSVG`: open (white-filled) variants of every marker.
- `fmtTick`: decimal and fraction only (science-only sci-notation / sig-figs dropped).
- `SCAFFOLD` presets, `ELEMENT_TOKENS`: math element list; object ids replace index tokens.
- The expression parser (Phase 2): extended with `f(x) =` notation, named functions and solver support.

### Rebuilt (cannot be reused as-is)
- `normalize`, `analyse`, `renderSVG`. The science tool models a graph as `type + series + rows`.
  The blueprint models one plane holding a **list of objects with stable ids**, with derived objects
  computed at render time. Copy-and-prune would have kept the series/rows model that the handoff itself
  lists as a smell (§9), so these three were rewritten around an object registry (`OBJECT_KINDS`),
  with each phase adding kinds instead of editing one large function.

### Dropped (science-only)
Error bars, log scales, dual axis, box-plot code paths, per-series units, sig-figs, climate presets, the
series/rows data table. (Data displays return in Phase 5, rebuilt for math.)

## Decisions and assumptions (defaults; each is a setting)

| Topic | Default chosen | Why / status |
| --- | --- | --- |
| Axis arrows | Both ends of each axis | Blueprint left open; a setting (`axes.arrows`: both / end / none) |
| Origin label | `0` | Setting: `0`, `O`, none |
| Prime notation (Phase 4) | A′, A″ | Setting |
| Angle mode (Phase 10) | Degrees for grades 6–9, radians in trig | Setting; not built yet |
| Quartile method (Phase 5) | Median of halves, middle value excluded (matches TI-84) | **Unconfirmed** — built as a setting (3 methods); check against the class textbook |
| Graph size | Presets set the *width*; height follows the grid so cells stay square | Custom size can fix both |
| Auto range | ±10 (or 0–10) minimum, grows to fit objects | Set Min/Max on the Axes tab to override |
| Saved file identity | `tool: "math-graph-maker"` in every file | A science file opened here fails with a clear message |
| localStorage prefix | `mathgraphmaker.*` | Never share keys with the science tool |
| High-school streams | Not decided | Needed before Phases 8+; see open questions |

## Phase 2 notes (function engine and linear relations)
- **One engine for every function.** `parseEquation` accepts `y = …`, `f(x) = …`, a bare expression, and anything solvable for y
  (`y − 2 = 3(x + 1)`, `2x + 3y = 6`, `xy = 6`); `x = 4` is a vertical line. It classifies by solving numerically for y, so no
  form needs its own code. Circles (`x² + y² = 25`) get a plain "can't be graphed yet" message until Phase 9.
- **Numeric only.** Zeros (poles rejected, double roots found), intersections and extrema are numeric; exact where both graphs are
  straight lines. Nothing symbolic, and no `eval`.
- **Sampling** is adaptive (judged in millimetres on the page), clipped to the window with exact edge points, and simplified (a line is
  two points). A run ends 'clip' (curve carries on: arrowhead), 'start'/'end' (domain edge: filled or open dot) or 'break' (gap or jump).
  Removable holes are bridged; poles, `tan` and `floor` never join across the gap.
- **New object kinds:** `function`, `related` (parallel/perpendicular, right-angle marker), `table`, `guide`, `intersect`, `vlt`.
  Each is one registry entry. Derived parts (curve, intercepts, table y-values, intersections) are computed at render time.
- **Tables answer to their own token** (`tables`), not "all points, shapes and graphs", so the standard question
  (blank grid + table with blank cells) is one spec. Their space is reserved even when hidden, like everything else.
  A table can also plot itself (`plot`), shown in the key and only in the question if asked.
- **New tokens:** `equations`, `keyPoints`, `slopeTriangle`, `tables`. Scaffold presets are unchanged, so nothing migrates.
- **specVersion is now 2.** New kinds would be silently dropped by a version-1 reader, so the number was bumped; version-1 files still open.
- **Stacked fractions** are part of the label formatter: `{1/2}`. Equations are re-typeset from the parsed expression, so `y = 1/2x + 1`
  is drawn with a real fraction. Caveat for Phase 3's set notation: `{a/b}` with a slash is a fraction, so sets must avoid that form.
- **Readability check** (Test tab) warns about values between gridlines, lines with fewer than two gridline crossings, off-grid
  intercepts, tables whose y is not a whole number (with suggested x-values), unreadable equations, and perpendicular lines
  drawn with different x and y steps. "Snap points and corners" fixes the points.
- Assumption: the equation label defaults to "the equation" for a new line; intercept marks, slope triangles and every table are opt-in.

## Phase 3 notes (number lines)
- **Same spec, second type.** `type` is `plane` or `numberline`. Objects keep their kind's `on` (`plane` / `numberline`) and the
  resolver only sees the current type's objects, so switching the type loses nothing (checked in unit and browser tests).
  The plane's `x` axis settings are the line's scale, so range, step, minor ticks and number format work as before.
- **New kinds:** `nlpoint`, `inequality` (one, "and", or "or"; real numbers or integer dots), `hops`, `signchart`. The line itself
  lives in `spec.line` (orientation, join-ticks, rows). Rows can share one scale (stacked) or each have their own (double number line,
  optional connectors between matching ticks). Vertical is the same code in a rotated (u, v) frame.
- **Notation is derived from the segments**, never typed: inequality, interval and set-builder lines (∞ ∪ ∈ ℝ ℤ ∅), each optional,
  hidden together by the `notation` token. Solution drawing hides under `results`; sign-chart signs under `signs`, its zeros under `keyPoints`.
- **Sign chart** reuses the Phase 2 zero finder plus a new `findPoles`; a pole is never included in a solution, a zero is for ≥ and ≤,
  and a double root is a lone point for ≤. Or type the critical values and signs by hand.
- **Blank boxes** replace chosen tick numbers in the question only ("fill in the missing numbers"). Quick setups: integers, eighths,
  tenths, quarters (mixed numbers), cost/percent double line, thermometer.
- **Fractions:** a third number format, improper fractions.
- **specVersion is now 3** (an older reader would silently drop number-line objects). Science files are still refused.
- Bug found by testing, fixed: `findPoles` missed a pole that fell exactly on a sample point when the neighbours were small
  (`(x−1)/((x+2)(x−3))` on −10..10). It now probes just beside the point; a removable hole stays a hole. Still not found: an even-order pole
  (`1/(x−1)²`) that falls *between* samples, because the sign does not flip. Rare for classroom expressions; not chased.
- Accepted on purpose: a sign chart takes `y = 2x` as well as `2x` (it is the same expression in x). Only `x = 4` is refused.
- Smell noticed: the Number line tab's mark cards use array positions in `data-bind` like the other tabs (see below).

## Phase 4 notes (transformations, geometry, paper)
- **Transformations** (`transform` kind). The image is derived at render time from the original, so editing a vertex of the original moves the
  image (checked in a unit and a browser test). Successive transformations chain (`of` may be another transformation): A → A′ → A″.
  Pure point maps (`translatePt`, `reflectPt`, `rotatePt`, `dilatePt`) are exact for quarter turns and tested as properties (a reflection twice is
  the identity, four quarter turns are the identity, dilating by k then 1/k returns the point, …).
- **Aids vs image vs text are three separate switches.** The image hides with the object's own name (Test tab, "Individual points and shapes");
  the mirror line, centre and arrows hide with the new `aids` token; the description and mapping rule hide with `notation`, which can leave an
  answer line ("Mapping: ______"). So "Reflect ABC in the y-axis" (original only, mirror line shown) and "Describe this transformation" (image
  shown, everything else hidden) are both one spec. Implementation: a kind may set `keep: true` to be drawn (aids only) when hidden by name, and
  a kind may return `captions()`; the plane renderer reserves room for caption lines whether or not the question shows them.
- **Mapping rule** is written for translations, reflections and rotations or dilations about the origin. About another centre no one-line rule is
  shown (the field stays empty rather than showing a clumsy one). Words ("3 right, 2 down") work for everything.
- **Geometry kinds:** `symmetry` (lines and order of rotational symmetry worked out from the vertices: candidate axes through the vertex mean
  are tested by reflecting the vertex list and matching it cyclically), `areacount` (shoelace area, exact for gridline shapes, unit-square
  shading, perimeter marked "≈" when a side is slanted), `pythag` (squares on the sides, either orientation, with areas and `3² + 4² = 5²`,
  or `≠` when the triangle is not a right one), `measure` (distance working, midpoint, dashed legs with Δx and Δy), `mark` (right-angle squares,
  equal-length ticks grouped by length) and `circle` (drawn as an ellipse in page space; window grows to show it).
  They all work on a polygon, line segments **or a transformation's image**.
- **Paper** is a third type (`paper`), with no objects and no question / key pair: page (Letter or A4, portrait or landscape), square or
  isometric lattice, lines or dots, spacing in mm, margins, several grids per page (up to 4 × 6), optional axes with numbers for practice graphs, a
  Name / Date line. Only whole squares are drawn, centred. `paperLayout` is pure and tested (panels inside the margins, never overlapping).
  PNG is the real page size at 300 DPI (Letter = 2550 × 3300).
- **specVersion is now 4.** Old files still open; the tab strip was tightened ("Points & shapes" is now "Shapes"; new "Geometry" and "Paper" tabs).
- Bugs found by testing, fixed: the page shrank when "all objects" was hidden because caption room was only reserved for visible objects; a
  pole exactly on a sample point was missed by the sign-chart finder (phase 3, see above); a crash from reusing the shapes card's name pill.
- Assumptions to check with the teacher: the paper presets (cm, ¼ inch, 5 mm, 4 mm), three approximations of "standard" isometric paper (dots at
  1 cm along the row, rows √3/2 apart), and the default look of a dilation (dashed rays through the centre).

## Phase 5 notes (data displays)
- **A fourth type, `data`,** with its own small model (`dataModel`) and renderer (`renderData`). It reuses the axis maths (`niceRange`, `ticks`,
  `fmtTick`), the label formatter, marker shapes, `linearFit`-style least squares, and the Axes tab (vertical axis = the values, horizontal =
  categories or the number line). Bars, line, circle, pictograph, histogram, dot plot, stem-and-leaf (also back-to-back), box plot (one to three
  data sets) and scatter with a calculated or hand-set line of best fit.
- **Pure statistics first, tested:** mean, median, mode(s) (none when nothing repeats), quartiles by **three selectable methods**, five-number
  summary with the 1.5 × IQR outliers, histogram bins (`[a, b)`, nothing lost on an edge, automatic width, values below a chosen start are
  reported), circle-graph angles by largest remainder (always exactly 360°, and percents exactly 100), stem-and-leaf (whole numbers or one
  decimal, empty stems kept), least squares, pictograph half symbols, list and spreadsheet parsing. Circle-graph totals are property-tested
  on 300 random data sets.
- **Quartile method (open decision, still unconfirmed):** the default is the median of each half with the middle value left out (matches the
  TI-84). "Middle value included" and "interpolated (Excel)" are one click away. The box-plot done-when says quartiles must match the chosen
  method: they do, and the choice is on the Data tab, not buried. **Please check the default against your textbook.** With an even number of
  values the first two methods agree.
- **Question / key uses the same switches as everything else.** The graph itself (bars, dots, sectors, boxes, leaves) hides with "objects";
  value and percent labels with "point labels"; the frequency table with "tables" (its cells can be blank instead: only the numbers, or
  everything but the headings); mean / median / mode / five-number lines with "notation" (with an answer line); the best-fit line with
  "equations"; mean and median markers with "key points". The page is identical either way, and a test checks that no hidden mark leaks
  into the question SVG for any of the nine kinds. "Print the data list above the graph" gives the classic "make a histogram from this data".
- **Frequency table** beside or below the graph, with a real tally column (strokes in fives, the fifth struck through, drawn as lines so it needs
  no font). A table that would squeeze the graph on a narrow page moves underneath by itself.
- **Bars can be told apart without colour** with six fills (grey, hatching, dots, cross-hatching, dark grey, lines) and lines by dash and marker.
- **Misleading graphs (critique questions):** start the axis at a chosen value, an uneven (squeezed) scale, a stretched height. They are flagged
  on the Test tab as "misleading on purpose" so nobody prints one by accident.
- **Data entry:** typed into a table (categories) or a box (lists) or pasted from a spreadsheet (`dataFromPaste`, tested); ten samples cover
  every kind. Files stay tidy: numbers are stored as numbers, kept as text only while half-typed.
- Not built (would be easy next): circle-graph leader lines for crowded sectors, grouped/stacked bars beyond side-by-side, a dual-axis line graph, a
  cumulative-frequency graph. Widths of long category names are wrapped to two lines, never rotated.
- Assumptions to check: the sample data, the histogram interval text ("50–59" for whole numbers, "0 ≤ x < 1" otherwise), circle sectors start at 12 o'clock and
  run clockwise, dot plots are padded by one step each side, whole-symbol pictographs use plain outlined symbols.

## How Phase 1 is tested
- **Unit tests** (`node --test tools/math-graph-maker/math-graph-maker.test.js`, 123 tests after Phase 5): axis maths, number
  cleanup, label typography, `normalize` idempotence, save/load round trip, stable ids, paste parsing, and a
  render matrix (every layout × scaffold level × style) asserting no `NaN`/`undefined`, an identical page and
  plot rectangle in question and key, and that a hidden title/label never leaks into the question SVG.
- **Browser checks** (`node tools/math-graph-maker/e2e.js [screenshot-folder]`, 165 checks after Phase 5) drive the real page
  over `file://` in Chromium: no network requests, table entry and paste, click-to-place and drag with snapping,
  scaffold levels, pick-to-hide, export names (`q4-q.png` / `q4-key.png`), PNG stamped 300 DPI with pixel size
  matching the millimetres, the locked scale **measured by the browser** (ten 10 mm squares = 100 mm),
  save and reopen giving an identical graph, and the print layout. Committed so the next builder does not rebuild it.
- Contact sheets of layout variants were viewed by eye; that found label/number collisions (fixed: object labels
  are now drawn above tick numbers, with a white halo).

## Not verified (need a person or a device)
- Pasting into Word and how Word renders the SVG. PNG is the safe path.
- A real photocopier and a real print dialog (print layout was checked with print-media emulation only).
- Firefox and Safari. Everything was tested in Chromium.
- Phase 2: how the equation-label placer copes with many crowded graphs on a small page was checked by eye only; expect overlaps when
  six or more labelled graphs share a half-width grid. Different x and y steps make perpendicular lines look wrong (warned, not prevented).
- Very small pages: at quarter width (40 mm) labels next to points inevitably crowd; use half width or larger
  for graphs with labelled points.

- Phase 3: glyphs ℝ ℤ ∈ ∪ ∞ ∅ render in Chromium; whether they survive in a Word/Google Docs paste of the SVG, or a machine without a
  font that has them, is unchecked (PNG is safe). Crowding when several mark types share one short line is left to the teacher (see the
  screenshot habit: use stacked lines). Vertical lines take their length from the page height, not the range.

- Phase 4: a symmetry line that runs along an axis is drawn under the axis and cannot be seen (move the shape off centre); labels of a shape and
  its reflection can collide when a vertex sits near the mirror line (label placement is greedy, not global). Mirror lines drawn exactly over
  the axes are not drawn at all (the axis is the line). Paper: no real printer test (margins under about 6 mm are warned about, not verified).

## Smells noticed while building (not fixed; for separate issues)
- The toolbar is crowded (also true of the science tool); a menu for exports would tidy it.
- The science tool's `renderSVG` and this one share a lot of tick/axis code by copy. If both tools live on,
  consider the `SYNC.md`-style shared source or a small concat build. Not added: it does not hurt yet.
- `data-bind` paths use array positions (`objects.3.marker`). Ids are stable, but the UI rebuilds on every
  add/delete, so positions are always current. Worth remembering if a UI ever edits objects while reordering.

## Open questions for the teacher
1. Which high-school streams to support (decides Phases 8–12).
2. Quartile method used in the class resource (Phase 5).
3. Diploma-exam look for the exam-style preset (Phase 6): needs a few released items to compare against.
4. Photocopier grey levels (Phase 6) need a test print.

## Progress
- [x] Phase 1: MVP (`tools/math-graph-maker/`, specVersion 1)
- [x] Phase 2: function engine and linear relations (specVersion 2)
- [x] Phase 3: number lines (specVersion 3)
- [x] Phase 4: transformations, geometry, paper (specVersion 4)
- [x] Phase 5: data displays
- [ ] Phase 6: test-making toolkit
- [ ] Phase 7: workflow and comfort
- [ ] Phases 8–12: waiting on the stream decision
