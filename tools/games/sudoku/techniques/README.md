# Sudoku solving techniques

Each human solving technique lives in **its own file** in this folder. The game
(`../index.html`) loads them with plain `<script src>` tags and builds the
**Techniques** menu from whatever registered itself — so adding a technique is
just dropping a new file here and adding one `<script>` line in `index.html`.

These are classic (non-module) scripts on purpose: that keeps the game working
when the folder is opened straight off disk (`file://`), not only over http.

## The contract

A technique file registers one descriptor:

```js
(window.SudokuTechniques = window.SudokuTechniques || []).push({
  id: 'naked-single',          // unique slug
  name: 'Naked Single',        // shown in the menu
  order: 1,                    // menu position (low → first)
  summary: 'One short line shown under the name.',
  find: function (ctx) { /* … */ return result | null; }
});
```

`find(ctx)` searches the **current board** and returns the **first** example it
finds (or `null` if there is none). The game highlights that example and shows
the explanation; the player then solves it themselves.

### `ctx` — what the game hands you (read-only)

| field | type | meaning |
|---|---|---|
| `values` | `number[81]` | the board, row-major; `0` = empty (givens **and** entered digits) |
| `candidates` | `Set<number>[81]` | basic candidates for each empty cell (a digit not already in that cell's row, column or box). Filled cells get an empty set. |
| `units` | `Unit[27]` | every row, column and box as `{ type:'row'|'col'|'box', index, cells:number[9], name:'row 3' }` |
| `rowOf(i)`,`colOf(i)`,`boxOf(i)` | `(i)=>number` | 0-based unit index for a cell |
| `peers` | `number[81][]` | the cells each cell "sees" (its row + column + box, minus itself) |
| `cellName(i)` | `(i)=>string` | e.g. `"R3C5"` |

Candidates are computed only from the placed digits — independent of the
player's own pencil marks — so a technique always reasons from the true board.

### The result you return

```js
{
  title: 'Naked Single',                 // heading for the explanation
  cells: [40],                           // the cells to highlight (the heart of it)
  digits: [7],                           // digit(s) the technique is about
  unit: { type, index, cells, name },    // optional: the row/col/box it lives in (also highlighted, faintly)
  placements:   [{ cell, digit }],       // optional: digits that can be placed
  eliminations: [{ cell, digit }],       // optional: candidates that can be removed
  explanation: 'Plain-English why, naming cells and digits.'
}
```

Return `null` when the technique isn't present in the current position.

## Adding a technique

1. Copy an existing file (e.g. `naked-single.js`) to `your-technique.js`.
2. Implement `find(ctx)` and set a unique `id`, a `name`, and the `order`.
3. Add `<script src="techniques/your-technique.js"></script>` to `index.html`,
   next to the others (before the main game script).

That's it — the menu picks it up automatically.
