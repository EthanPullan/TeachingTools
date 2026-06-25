/* Naked Single
   ────────────────────────────────────────────────────────────────────────────
   The simplest technique: an empty cell whose candidates have been reduced to a
   single digit — every other digit already appears somewhere in that cell's row,
   column or box, so the lone survivor must go there.

   See ./README.md for the ctx / result contract. */
(function () {
  (window.SudokuTechniques = window.SudokuTechniques || []).push({
    id: 'naked-single',
    name: 'Naked Single',
    order: 1,
    summary: 'A cell with only one candidate left.',

    find: function (ctx) {
      for (var i = 0; i < 81; i++) {
        if (ctx.values[i]) continue;            // already filled
        var cand = ctx.candidates[i];
        if (cand.size !== 1) continue;
        var d = cand.values().next().value;     // the single remaining candidate
        return {
          title: 'Naked Single',
          cells: [i],
          digits: [d],
          placements: [{ cell: i, digit: d }],
          explanation:
            'Cell ' + ctx.cellName(i) + ' has just one candidate left: ' + d +
            '. The other eight digits already appear in its row, column or box, ' +
            'so ' + d + ' must go here.'
        };
      }
      return null;
    }
  });
})();
