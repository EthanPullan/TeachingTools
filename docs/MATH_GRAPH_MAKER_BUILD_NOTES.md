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
| Quartile method (Phase 5) | Median of halves, middle value excluded (matches TI-84) | **Unconfirmed** — check against the class textbook before Phase 5 |
| Graph size | Presets set the *width*; height follows the grid so cells stay square | Custom size can fix both |
| Auto range | ±10 (or 0–10) minimum, grows to fit objects | Set Min/Max on the Axes tab to override |
| Saved file identity | `tool: "math-graph-maker"` in every file | A science file opened here fails with a clear message |
| localStorage prefix | `mathgraphmaker.*` | Never share keys with the science tool |
| High-school streams | Not decided | Needed before Phases 8+; see open questions |

## How Phase 1 is tested
- **Unit tests** (`node --test tools/math-graph-maker/math-graph-maker.test.js`, 55 tests): axis maths, number
  cleanup, label typography, `normalize` idempotence, save/load round trip, stable ids, paste parsing, and a
  render matrix (every layout × scaffold level × style) asserting no `NaN`/`undefined`, an identical page and
  plot rectangle in question and key, and that a hidden title/label never leaks into the question SVG.
- **Browser checks** (`node tools/math-graph-maker/e2e.js [screenshot-folder]`, 55 checks) drive the real page
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
- Very small pages: at quarter width (40 mm) labels next to points inevitably crowd; use half width or larger
  for graphs with labelled points.

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
- [ ] Phase 2: function engine and linear relations
- [ ] Phase 3: number lines
- [ ] Phase 4: transformations, geometry, paper
- [ ] Phase 5: data displays
- [ ] Phase 6: test-making toolkit
- [ ] Phase 7: workflow and comfort
- [ ] Phases 8–12: waiting on the stream decision
