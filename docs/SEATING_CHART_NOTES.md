# Seating Chart Generator — change notes for the next AI

Living log for `tools/seating-chart/index.html`. Read it before changing the tool;
add an entry (newest first) with every change, including *why* and anything
you left undone. Repo rules are in the root `CLAUDE.md`; this file only records
what is specific to this tool.

## How the tool is built (short)

- One self-contained file, no storage except an autosave to localStorage
  (`teachingtools:seating-chart-autosave`) and a best-effort share of rosters
  under `teachingtools:rosters`.
- `state` holds the active class's roster, pairs, `assignment` (`deskId -> name`)
  and history. The room (desks, features, settings) is **shared** by all classes.
- `Generate` (`generate()`) re-seats *everyone* with a randomised hill-climb.
  Rendering is imperative: `renderRoom()`, `renderStudents()`, `renderStatus()`.
- Desks and furniture are dragged with **pointer events** (`attachDragHandlers`),
  not the HTML5 drag-and-drop API. Keep new drag code on pointer events so mouse
  and touch both work.
- `Move desks` / `Swap seats` mode only affects dragging *desks*.

## Change log

### 2026-11 — Drag a single student from the list onto a desk

- Each row in **Students → Class list** has a grip (`⋮⋮`). Drag it onto a desk in
  the room: `attachStudentDrag()` (per-row pointer handling) calls `seatStudent()`.
- `seatStudent(name, deskId)` rules:
  - empty desk: the student sits there (and leaves any previous desk);
  - occupied desk, student already seated: the two **swap**;
  - occupied desk, student not seated: the old occupant becomes **unseated**;
  - `deskId = null` unseats. Dropping a *seated* student back on the side panel does this.
- Works in either mode (Move desks or Swap seats) and with touch (the grip has
  `touch-action:none`; the rest of the row still scrolls).
- Seated students show greyed in the list with their `desk N` tag, as before.
- Drop feedback: amber outline on the desk (`.desk.droptarget`) or the panel.

**Decisions made without asking (change if wrong):**
- `Generate` is unchanged and still re-seats everyone, **including students placed by
  hand**. There is no "pin"/"lock this seat" yet.
- A manual placement clears the red keep-apart highlight but does **not** re-check
  keep-apart / keep-together pairs. Swap mode behaves the same way.

**Not done / ideas:**
- Pin hand-placed students so Generate works around them.
- Re-check keep-apart pairs after a manual move (the logic is inline in `generate()`;
  it would need pulling into a function first).
- Keyboard way to seat a student (drag is pointer-only, as swap mode is).
- Not covered by an automated test; checked with a throwaway Playwright script
  (seat, swap, replace, unseat, drop on nothing, plain click).
