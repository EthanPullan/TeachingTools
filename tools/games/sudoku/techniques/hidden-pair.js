/* Hidden Pair
   ────────────────────────────────────────────────────────────────────────────
   Within one unit (row, column or box) two digits can only be placed in the
   same two cells. Those two cells must therefore hold exactly that pair (in some
   order), so every OTHER candidate can be eliminated from them — which is what
   makes the pair useful to act on.

   See ./README.md for the ctx / result contract. */
(function () {
  (window.SudokuTechniques = window.SudokuTechniques || []).push({
    id: 'hidden-pair',
    name: 'Hidden Pair',
    order: 2,
    summary: 'Two digits confined to the same two cells of a unit.',

    find: function (ctx) {
      for (var u = 0; u < ctx.units.length; u++) {
        var unit = ctx.units[u];

        // For this unit, list which cells can still hold each digit.
        var places = {};                       // digit -> array of cell indices
        for (var d = 1; d <= 9; d++) places[d] = [];
        for (var k = 0; k < unit.cells.length; k++) {
          var i = unit.cells[k];
          if (ctx.values[i]) continue;
          ctx.candidates[i].forEach(function (dig) { places[dig].push(i); });
        }

        // Candidate digits for a hidden pair are those with exactly two homes.
        var twos = [];
        for (var dd = 1; dd <= 9; dd++) if (places[dd].length === 2) twos.push(dd);

        for (var a = 0; a < twos.length; a++) {
          for (var b = a + 1; b < twos.length; b++) {
            var da = twos[a], db = twos[b];
            var pa = places[da], pb = places[db];
            if (pa[0] !== pb[0] || pa[1] !== pb[1]) continue;   // not the same two cells

            var cells = [pa[0], pa[1]];
            // Everything in those two cells other than the pair can be removed.
            var elim = [];
            for (var c = 0; c < cells.length; c++) {
              var cell = cells[c];
              ctx.candidates[cell].forEach(function (dig) {
                if (dig !== da && dig !== db) elim.push({ cell: cell, digit: dig });
              });
            }
            if (!elim.length) continue;        // nothing to remove → not worth surfacing

            return {
              title: 'Hidden Pair',
              cells: cells,
              digits: [da, db],
              unit: { type: unit.type, index: unit.index, cells: unit.cells, name: unit.name },
              eliminations: elim,
              explanation:
                'In ' + unit.name + ', the digits ' + da + ' and ' + db +
                ' can only go in ' + ctx.cellName(cells[0]) + ' and ' + ctx.cellName(cells[1]) +
                '. They form a hidden pair, so those two cells hold only ' + da + ' and ' + db +
                ' — every other candidate can be crossed out of them.'
            };
          }
        }
      }
      return null;
    }
  });
})();
