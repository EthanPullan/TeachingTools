// Unit tests for the Science Graph Maker core (the <script id="core"> block in index.html).
// Run:  node --test tools/science-graph-maker/science-graph-maker.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const core = /<script id="core">([\s\S]*?)<\/script>/.exec(html)[1];
const G = vm.runInNewContext(core + `;({ niceStep, niceCeil, niceRange, resolveAxis, ticks, fmtTick, normalize, blankSpec, sampleSpec,
  serialize, parseFile, migrate, parseTSV, pasteGrid, importGrid, dropIndex, scaffoldLevel, SCAFFOLD, renderSVG, analyse,
  computeAxes, boxStats, ticks, axT, axInv, logOk, makeVariant, errAmount, mulberry32, gridStepFor, tableCols, PRESETS, parseTable, compileExpr, fitLine, equationText, transformPoints, primeLabels, OP_SYMBOL, textW, HW, crc32, readability, snapValues, svgSize, fmtTick, SCAFFOLD_V1, pngWithDpi, sizeMM, mmToPx, parseNum, cellFromText, TYPES, MAX_SERIES, MAX_ROWS })`, {});

/* vm objects come from another realm; round-trip through JSON so deepEqual compares plain data */
const plain = v => JSON.parse(JSON.stringify(v));

test('niceStep gives 1, 2 or 5 x 10^n', () => {
  assert.equal(G.niceStep(0.9), 1);
  assert.equal(G.niceStep(1.4), 1);
  assert.equal(G.niceStep(1.6), 2);
  assert.equal(G.niceStep(2.9), 2);
  assert.equal(G.niceStep(3.2), 5);
  assert.equal(G.niceStep(6.9), 5);
  assert.equal(G.niceStep(7.1), 10);
  assert.equal(G.niceStep(0.023), 0.02);
  assert.equal(G.niceStep(0.06), 0.05);
  assert.equal(G.niceStep(480), 500);
  for (const bad of [0, -3, NaN, Infinity]) assert.equal(G.niceStep(bad), 1);
});

test('niceCeil never goes below the request', () => {
  assert.equal(G.niceCeil(0.65), 1);
  assert.equal(G.niceCeil(1), 1);
  assert.equal(G.niceCeil(1.01), 2);
  assert.equal(G.niceCeil(2.5), 5);
  assert.equal(G.niceCeil(5.1), 10);
  assert.equal(G.niceCeil(0.03), 0.05);
});

test('niceRange covers the data on step boundaries', () => {
  assert.deepEqual(plain(G.niceRange(0, 80, 8)), { lo: 0, hi: 80, step: 10 });
  assert.deepEqual(plain(G.niceRange(3, 47, 8)), { lo: 0, hi: 50, step: 5 });
  assert.deepEqual(plain(G.niceRange(-7, 7, 14)), { lo: -7, hi: 7, step: 1 });
  const r = G.niceRange(0.12, 0.47, 6);                 // no float noise like 0.30000000000000004
  assert.deepEqual(plain(r), { lo: 0.1, hi: 0.5, step: 0.05 });
  assert.ok(G.niceRange(5, 5, 5).hi > 5);               // degenerate span still gives a real axis
});

const AX = { label: '', unit: '', min: null, max: null, step: null, minorPerMajor: 2 };
test('resolveAxis: auto, manual overrides, and zero rule', () => {
  let a = G.resolveAxis(AX, { min: 20, max: 80 }, { target: 8 });
  assert.equal(a.lo, 0);                                // 20 <= half of 80, so start at zero
  a = G.resolveAxis(AX, { min: 60, max: 80 }, { target: 8 });
  assert.ok(a.lo >= 50 && a.lo <= 60);                  // data sit high: don't waste the axis
  a = G.resolveAxis({ ...AX, min: 5, max: 25, step: 4 }, { min: 0, max: 100 }, { target: 8 });
  assert.deepEqual([a.lo, a.hi, a.step], [5, 25, 4]);   // manual wins on all three
  a = G.resolveAxis({ ...AX, step: 5 }, { min: 0, max: 22 }, { target: 8 });
  assert.deepEqual([a.lo, a.hi, a.step], [0, 25, 5]);   // manual step, auto range snaps to it
  a = G.resolveAxis(AX, { min: -3, max: 7 }, { target: 10, mode: 'four' });
  assert.equal(a.lo, -a.hi);                            // four-quadrant grids are symmetric
  a = G.resolveAxis(AX, null, { target: 10, mode: 'one' });
  assert.deepEqual([a.lo, a.hi], [0, 10]);              // empty one-quadrant grid defaults to 0-10
  a = G.resolveAxis(AX, { min: 3, max: 9 }, { target: 8, forceZero: true });
  assert.equal(a.lo, 0);                                // bars always include zero
});

test('ticks and tick labels', () => {
  assert.deepEqual(plain(G.ticks({ lo: 0, hi: 1, step: 0.25 })), [0, 0.25, 0.5, 0.75, 1]);
  assert.equal(G.ticks({ lo: 0, hi: 1, step: 0.1 }).length, 11);   // 0.1 * 3 style float drift must not drop the end tick
  assert.equal(G.fmtTick(0.5, { lo: 0, step: 0.5 }), '0.5');
  assert.equal(G.fmtTick(1, { lo: 0, step: 0.5 }), '1.0');         // consistent decimals down an axis
  assert.equal(G.fmtTick(-2, { lo: -10, step: 2 }), '−2');    // real minus sign
  assert.equal(G.fmtTick(-0, { lo: -1, step: 1 }), '0');
});

test('Helvetica width table covers exactly chars 32-126', () => {
  assert.equal(G.HW.length, 95);
  assert.ok(Math.abs(G.textW('Hello', 10) - 22.78) < 0.01);         // H722+e556+l222+l222+o556 = 2278/1000*10
});

test('normalize is idempotent and fixes bad input', () => {
  const n1 = G.normalize({ type: 'nope', series: [], rows: [{ x: 'a', ys: [1, 'x', NaN] }], hidden: ['title', 'title', 'bogus', 'series:9', 'pt:0:0', 'pt:0:5'],
                           blanks: ['title', 'xTicks'], size: { preset: 'custom', w: 9999, h: 1 }, legend: 'weird', x: { step: -2, minorPerMajor: 99 } });
  assert.equal(n1.type, 'line');
  assert.equal(n1.series.length, 1);
  assert.deepEqual(plain(n1.rows[0].ys), [1]);                     // truncated to the series count
  assert.deepEqual(plain(n1.hidden), ['title', 'pt:0:0']);         // dupes, unknown and out-of-range tokens dropped
  assert.deepEqual(plain(n1.blanks), ['title']);
  assert.deepEqual(plain(n1.size), { preset: 'custom', w: 400, h: 20 });
  assert.equal(n1.legend, 'right');
  assert.equal(n1.x.step, null);
  assert.equal(n1.x.minorPerMajor, 10);
  assert.deepEqual(plain(G.normalize(n1)), plain(n1));
  assert.equal(G.normalize(null).specVersion, 4);
});

test('save -> load round-trip is byte-identical', () => {
  const s = G.sampleSpec();
  s.hidden = ['title', 'series:1', 'pt:0:3'];
  s.blanks = ['title'];
  s.size = { preset: 'custom', w: 120.5, h: 80 };
  s.x.min = 0; s.x.max = 12; s.x.step = 2; s.y.step = 0.5;
  s.style.colour = true;
  const text1 = G.serialize(s);
  const text2 = G.serialize(G.parseFile(text1));
  assert.equal(text2, text1);
  assert.equal(JSON.parse(text1).specVersion, 4);
  for (const type of G.TYPES) {
    const t = G.sampleSpec(); t.type = type; t.quadrants = 1;
    const a = G.serialize(t);
    assert.equal(G.serialize(G.parseFile(a)), a);
    assert.equal(G.renderSVG(G.parseFile(a)), G.renderSVG(t));   // identical graph, not just identical JSON
  }
});

test('files from the future or from elsewhere are rejected clearly', () => {
  assert.throws(() => G.parseFile('{"specVersion":99}'), /newer version/);
  assert.throws(() => G.parseFile('{"hello":1}'), /not a Science Graph Maker/);
  assert.throws(() => G.parseFile('nope'), /JSON/);
});

test('parseTSV handles Excel output, quotes and trailing newline', () => {
  assert.deepEqual(plain(G.parseTSV('a\tb\n1\t2\n')), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(plain(G.parseTSV('a\tb\r\n1\t\r\n')), [['a', 'b'], ['1', '']]);
  assert.deepEqual(plain(G.parseTSV('"x\ty"\t"say ""hi"""\n')), [['x\ty', 'say "hi"']]);
});

test('importGrid: headers, units, series and labels', () => {
  const s = G.blankSpec();
  assert.ok(G.importGrid(s, G.parseTSV('Time (min)\tTemperature (°C)\n0\t20\n1\t27\n2\t35\n')));
  assert.equal(s.x.label, 'Time'); assert.equal(s.x.unit, 'min');
  assert.equal(s.y.label, 'Temperature'); assert.equal(s.y.unit, '°C');
  assert.equal(s.series.length, 1);
  assert.deepEqual(plain(s.rows.map(r => [r.x, r.ys[0]])), [[0, 20], [1, 27], [2, 35]]);

  const two = G.blankSpec();
  G.importGrid(two, G.parseTSV('t\tA\tB\n0\t1\t2\n1\t3\t4'));
  assert.deepEqual(plain(two.series.map(x => x.name)), ['A', 'B']);
  assert.deepEqual(plain(two.rows[1].ys), [3, 4]);

  const noHead = G.blankSpec();
  G.importGrid(noHead, G.parseTSV('0\t5\n1\t6'));
  assert.equal(noHead.rows.length, 2);                              // numbers only: no header row eaten
  assert.equal(noHead.rows[0].x, 0);

  const bar = G.blankSpec(); bar.type = 'bar';
  G.importGrid(bar, G.parseTSV('Fruit\tSold\nApples\t12\nPears\t7'));
  assert.deepEqual(plain(bar.rows.map(r => [r.x, r.ys[0]])), [['Apples', 12], ['Pears', 7]]);

  const pts = G.blankSpec(); pts.type = 'coordinate';
  G.importGrid(pts, G.parseTSV('A\t2\t3\nB\t-4\t5'));
  assert.deepEqual(plain(pts.rows.map(r => [r.label, r.x, r.ys[0]])), [['A', 2, 3], ['B', -4, 5]]);
  assert.equal(G.importGrid(G.blankSpec(), []), false);
});

test('pasteGrid fills from a cell and grows rows and series', () => {
  const s = G.blankSpec();                                          // 6 rows, 1 series
  const res = G.pasteGrid(s, [['1', '2', '3'], ['4', '5', '6']], 5, 0);
  assert.equal(res.ignored, 0);
  assert.equal(s.rows.length, 7);                                   // grew by one row
  assert.equal(s.series.length, 2);                                 // grew by one series
  assert.deepEqual(plain(s.rows[5]), { x: 1, ys: [2, 3], label: '' });
  assert.deepEqual(plain(s.rows[6].ys), [5, 6]);
  assert.equal(s.rows[0].ys.length, 2);                             // older rows stay rectangular
});

test('dropIndex renumbers hidden tokens when a series or row is removed', () => {
  const s = { hidden: ['series:0', 'series:2', 'pt:1:4', 'pt:2:0', 'title'] };
  G.dropIndex(s, 'series', 1);
  assert.deepEqual(plain(s.hidden), ['series:0', 'series:1', 'pt:1:0', 'title']);
  const r = { hidden: ['pt:0:1', 'pt:0:3', 'pt:0:2'] };
  G.dropIndex(r, 'row', 2);
  assert.deepEqual(plain(r.hidden), ['pt:0:1', 'pt:0:2']);
});

test('scaffold levels are visibility presets over the same spec', () => {
  const s = G.sampleSpec();
  assert.equal(G.scaffoldLevel(s), 'complete');
  for (const k of ['labels', 'axes', 'blank']) {
    s.hidden = [...G.SCAFFOLD[k]];
    assert.equal(G.scaffoldLevel(G.normalize(s)), k);
  }
  s.hidden = ['title'];
  assert.equal(G.scaffoldLevel(s), 'custom');
});

test('renderer: key vs question versions differ only by what is hidden', () => {
  const s = G.sampleSpec();
  const key = G.renderSVG(s, { version: 'key' });
  assert.ok(key.startsWith('<svg') && key.includes('Temperature of Water Over Time'));
  assert.ok(key.includes('<polyline'));
  s.hidden = [...G.SCAFFOLD.blank];
  assert.equal(G.renderSVG(s, { version: 'key' }), key);            // the key ignores hidden
  const q = G.renderSVG(s, { version: 'question' });
  assert.ok(!q.includes('<polyline') && !q.includes('Temperature of Water') && !q.includes('Beaker'));
  assert.ok(!/>\d+<\/text>/.test(q));                               // blank grid: no axis numbers either
  assert.ok(q.includes('<path d="M'));                              // ...but the grid is there
});

test('renderer: hiding items keeps the plot area identical so key and question overlay', () => {
  const s = G.sampleSpec();
  const clip = svg => /<clipPath[^>]*><rect ([^>]*)\/>/.exec(svg)[1];
  const base = clip(G.renderSVG(s, { version: 'key' }));
  for (const level of ['labels', 'axes', 'blank']) {
    s.hidden = [...G.SCAFFOLD[level]];
    assert.equal(clip(G.renderSVG(s, { version: 'question' })), base, level);
  }
});

test('renderer: answer lines replace hidden labels only in the question', () => {
  const s = G.sampleSpec();
  s.hidden = ['title', 'xTitle', 'units']; s.blanks = ['title', 'xTitle', 'units'];
  const q = G.renderSVG(s, { version: 'question' });
  assert.ok(/Title: _{3,}/.test(q));
  assert.ok(/>_{3,}</.test(q));                                     // x-axis title blank
  assert.ok(/Temperature \(_{3,}\)/.test(q));                       // the Units toggle covers both axes; the label itself stays
  s.hidden = ['title']; s.blanks = [];
  assert.ok(!/_{3,}/.test(G.renderSVG(s, { version: 'question' })));   // hidden without a blank leaves nothing
  s.blanks = ['title'];
  assert.ok(!/_{3,}/.test(G.renderSVG(s, { version: 'key' })));
});

test('renderer: series are distinguishable without colour', () => {
  const s = G.sampleSpec();
  const svg = G.renderSVG(s);
  assert.ok(!/#0072b2|#d55e00/i.test(svg));                         // black and white by default
  assert.ok(svg.includes('stroke-dasharray'));                      // series 2 is dashed
  assert.ok(svg.includes('<circle') && svg.includes('<rect x'));    // circle and square markers
  s.style.colour = true;
  assert.ok(/#0072b2/i.test(G.renderSVG(s)));
  const bar = G.sampleSpec(); bar.type = 'bar';
  const b = G.renderSVG(bar);
  assert.ok(b.includes('<pattern'));                                // hatched fills
  assert.equal(b.match(/<rect x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" fill="(url\(#g-h1\)|#a6a6a6)"/g).length > 0, true);
});

test('renderer: real size in millimetres and hidden points break the line', () => {
  const s = G.sampleSpec();
  const svg = G.renderSVG(s);
  assert.ok(svg.includes('width="165mm" height="105mm" viewBox="0 0 165 105"'));
  s.size = { preset: 'half' };
  assert.ok(G.renderSVG(s).includes('width="82mm" height="68mm"'));
  assert.ok(G.renderSVG(s, { px: { w: 100, h: 50 } }).includes('width="100" height="50"'));
  s.size = { preset: 'full' };
  const lines = x => (x.match(/<polyline/g) || []).length;
  const before = lines(G.renderSVG(s, { version: 'question' }));
  s.hidden = ['pt:0:5'];
  assert.equal(lines(G.renderSVG(s, { version: 'question' })), before + 1);   // series 0 now has two runs
  assert.equal(lines(G.renderSVG(s, { version: 'key' })), before);
});

test('renderer: each graph type renders, including empty data', () => {
  for (const type of G.TYPES) for (const quadrants of [1, 4]) for (const axes of ['edges', 'origin']) {
    for (const make of [G.sampleSpec, G.blankSpec]) {
      const s = make(); s.type = type; s.quadrants = quadrants; s.axes = axes;
      const svg = G.renderSVG(s);
      assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), `${type}/${quadrants}/${axes}`);
      assert.ok(!/NaN|undefined|Infinity/.test(svg), `${type}/${quadrants}/${axes}: bad number in output`);
    }
  }
});

test('coordinate grids keep square cells and a shared step', () => {
  const s = G.blankSpec(); s.type = 'coordinate'; s.axes = 'origin';
  const ax = G.computeAxes(s);
  assert.equal(ax.x.step, ax.y.step);
  assert.deepEqual([ax.x.lo, ax.x.hi, ax.y.lo, ax.y.hi], [-10, 10, -10, 10]);
  const svg = G.renderSVG(s);
  const clip = /<clipPath[^>]*><rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/.exec(svg);
  assert.ok(Math.abs(+clip[3] - +clip[4]) < 0.01);                  // plot area is square for a square range
});

test('bar graphs: categories, grouped bars, hidden bars', () => {
  let s = G.sampleSpec(); s.type = 'bar';
  s.rows = [{ x: 'Apples', ys: [12, 9], label: '' }, { x: 'Pears', ys: [7, 11], label: '' }];
  s = G.normalize(s);
  const bars = svg => (svg.match(/<rect [^>]*stroke="#000" stroke-width="0\.3"/g) || []).length;
  const all = bars(G.renderSVG(s));
  assert.equal(all, 4);                                             // 2 categories x 2 series
  s.hidden = ['pt:1:0'];
  assert.equal(bars(G.renderSVG(s, { version: 'question' })), all - 1);
  assert.ok(G.renderSVG(s).includes('Apples'));
});

test('PNG helpers: CRC32 and DPI chunk', () => {
  assert.equal(G.crc32(new TextEncoder().encode('IEND')), 0xAE426082);   // the well-known CRC of an empty IEND chunk
  const fake = new Uint8Array(60).map((_, i) => i);
  const out = G.pngWithDpi(fake, 300);
  assert.equal(out.length, 81);
  assert.equal(String.fromCharCode(...out.subarray(37, 41)), 'pHYs');
  const dv = new DataView(out.buffer);
  assert.equal(dv.getUint32(41), 11811);                            // 300 DPI in pixels per metre
  assert.equal(out[49], 1);
  assert.deepEqual([...out.subarray(54)], [...fake.subarray(33)]);  // everything after IHDR preserved
});

test('sizes are real units and PNG pixel size follows 300 DPI', () => {
  assert.deepEqual(plain(G.sizeMM({ preset: 'full' })), { w: 165, h: 105 });
  assert.equal(G.mmToPx(165, 300), 1949);
  assert.equal(G.mmToPx(25.4, 300), 300);
});

/* ---------------------------- Phase 2 ---------------------------- */
const ax = (o = {}) => ({ lo: 0, hi: 2, step: 0.5, minor: 2, fmt: { format: 'decimal', decimals: null, sigfigs: null, ...o } });

test('tick formats: fractions, decimals, negatives, scientific, sig figs', () => {
  assert.equal(G.fmtTick(0.5, ax({ format: 'fraction' })), '1/2');
  assert.equal(G.fmtTick(1.5, ax({ format: 'fraction' })), '1 1/2');
  assert.equal(G.fmtTick(0.75, ax({ format: 'fraction' })), '3/4');
  assert.equal(G.fmtTick(2, ax({ format: 'fraction' })), '2');
  assert.equal(G.fmtTick(0, ax({ format: 'fraction' })), '0');
  assert.equal(G.fmtTick(-1.5, ax({ format: 'fraction' })), '\u22121 1/2');   // negative mixed number
  assert.equal(G.fmtTick(-0.25, ax({ format: 'fraction' })), '\u22121/4');
  assert.equal(G.fmtTick(1 / 3, ax({ format: 'fraction' })), '1/3');
  assert.equal(G.fmtTick(0.123456, ax({ format: 'fraction' })), '0.1');        // no small denominator: falls back to the axis's decimals
  assert.equal(G.fmtTick(-2, ax()), '\u22122.0');
  assert.equal(G.fmtTick(1, ax({ decimals: 2 })), '1.00');
  assert.equal(G.fmtTick(1234.5678, ax({ sigfigs: 3 })), '1230');
  assert.equal(G.fmtTick(2.5, ax({ sigfigs: 3 })), '2.50');
  assert.equal(G.fmtTick(0.004567, ax({ sigfigs: 2 })), '0.0046');
  assert.equal(G.fmtTick(2500, ax({ format: 'sci' })), '2.5\u00d710^3');
  assert.equal(G.fmtTick(0.00031, ax({ format: 'sci' })), '3.1\u00d710^-4'.replace('-', '\u2212') );
  assert.equal(G.fmtTick(2500, ax({ format: 'sci', sigfigs: 3 })), '2.50\u00d710^3');
  assert.equal(G.fmtTick(9999, ax({ format: 'sci', sigfigs: 2 })), '1.0\u00d710^4');   // rounding up carries into the exponent
  assert.equal(G.fmtTick(-3000, ax({ format: 'sci' })), '\u22123\u00d710^3');
});

test('readability: finds values between gridlines and snaps them', () => {
  const t = G.blankSpec();
  t.rows = [{ x: 1, ys: [37], label: '' }, { x: 2, ys: [40], label: '' }];
  t.y.step = 10; t.y.min = 0; t.y.max = 50; t.y.minorPerMajor = 2; t.x.step = 1; t.x.min = 0; t.x.max = 5; t.x.minorPerMajor = 1;
  let r = G.readability(t);
  assert.deepEqual(plain(r), [{ j: 0, r: 0, axis: 'y', value: 37 }]);   // 40 is on a gridline, 37 is not
  t.grid.minor = false;                                              // minor lines off -> only multiples of 10 are readable
  assert.equal(G.readability(t)[0].value, 37);
  t.y.minorPerMajor = 5; t.grid.minor = true;                        // step 2 lines: 37 still off
  assert.equal(G.readability(t).length, 1);
  t.y.minorPerMajor = 10;                                            // step 1 lines: 37 fine
  assert.equal(G.readability(t).length, 0);
  t.y.minorPerMajor = 2;
  assert.equal(G.snapValues(t), 1);
  assert.equal(t.rows[0].ys[0], 35);                                 // nearest 5-gridline
  assert.equal(G.readability(t).length, 0);
  assert.equal(G.snapValues(t), 0);                                  // idempotent
});

test('readability: bar graphs check heights only; text cells are left alone', () => {
  const s = G.blankSpec(); s.type = 'bar';
  s.rows = [{ x: 'Apples', ys: [12.3], label: '' }, { x: 'Pears', ys: [8], label: '' }];
  s.y.step = 2; s.y.minorPerMajor = 1; s.y.min = 0; s.y.max = 14;
  assert.deepEqual(plain(G.readability(s).map(i => [i.r, i.value])), [[0, 12.3]]);
  G.snapValues(s);
  assert.deepEqual(plain(s.rows.map(r => [r.x, r.ys[0]])), [['Apples', 12], ['Pears', 8]]);
});

test('annotations and regions render, hide and renumber', () => {
  const s = G.sampleSpec();
  s.annotations = [{ kind: 'text', text: 'Boiling', x: 5, y: 60, x2: 0, y2: 0 },
                   { kind: 'arrow', text: 'Melts here', x: 3, y: 30, x2: 4, y2: 50 },
                   { kind: 'callout', text: 'Start', x: 1, y: 70, x2: 0, y2: 20 }];
  s.regions = [{ from: 0, to: 4, label: 'A', shade: 'light' }, { from: 4, to: 10, label: 'B', shade: 'hatch' }];
  s.hidden = [];
  const key = G.renderSVG(s, { version: 'key' });
  for (const w of ['Boiling', 'Melts here', 'Start']) assert.ok(key.includes('>' + w + '<'), w);
  assert.ok(key.includes('>A<') && key.includes('>B<') && key.includes('-rg'));
  assert.ok(key.includes('<polygon'));                               // arrowheads
  s.hidden = ['ann:1', 'region:0'];
  const q = G.renderSVG(s, { version: 'question' });
  assert.ok(!q.includes('Melts here') && !q.includes('>A<') && q.includes('Boiling') && q.includes('>B<'));
  s.hidden = ['annotations', 'regions'];
  const q2 = G.renderSVG(s, { version: 'question' });
  assert.ok(!q2.includes('Boiling') && !q2.includes('>B<'));
  s.hidden = ['ann:0', 'ann:2', 'region:1'];
  G.dropIndex(s, 'ann', 1); assert.deepEqual(plain(s.hidden), ['ann:0', 'ann:1', 'region:1']);
  G.dropIndex(s, 'region', 0); assert.deepEqual(plain(s.hidden), ['ann:0', 'ann:1', 'region:0']);
  const bad = G.normalize({ annotations: [{ kind: 'nope', x: 'a' }], regions: [{ shade: 'x' }], hidden: ['ann:0', 'ann:4', 'region:3'] });
  assert.deepEqual(plain(bad.annotations[0]), { kind: 'text', text: '', x: 0, y: 0, x2: 0, y2: 0 });
  assert.equal(bad.regions[0].shade, 'light');
  assert.deepEqual(plain(bad.hidden), ['ann:0']);
  const b = G.sampleSpec(); b.type = 'bar'; b.regions = [{ from: 1, to: 3, label: 'X', shade: 'light' }];
  assert.ok(G.renderSVG(b).includes('>X<'));                         // regions work on bar graphs too
});

test('axis break zigzag appears only when an axis starts above zero', () => {
  const s = G.sampleSpec(); s.y.min = 10;
  const count = svg => (svg.match(/<rect x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" fill="#fff"\/><polyline/g) || []).length;
  assert.equal(count(G.renderSVG(s)), 1);
  s.y.breakMark = false; assert.equal(count(G.renderSVG(s)), 0);
  s.y.breakMark = true; s.y.min = null; assert.equal(count(G.renderSVG(s)), 0);       // starts at zero
  s.x.min = 2; s.y.min = 10; assert.equal(count(G.renderSVG(s)), 2);                  // both axes
  s.misleading.truncate = true; assert.equal(count(G.renderSVG(s)), 0);               // a truncated graph is deliberately unmarked
});

test('physical scale lock: one grid square prints at the exact size', () => {
  const s = G.blankSpec(); s.type = 'coordinate'; s.axes = 'origin'; s.grid.minor = false;
  s.scale = { lock: true, mm: 10 };
  const svg = G.renderSVG(s);
  const c = /<clipPath[^>]*><rect x="([\d.-]+)" y="([\d.-]+)" width="([\d.]+)" height="([\d.]+)"/.exec(svg);
  const ax = G.computeAxes(s);
  const cells = (ax.x.hi - ax.x.lo) / ax.x.step;
  assert.ok(Math.abs((+c[3] - 4) - cells * 10) < 0.01, 'plot width = cells x 10 mm');
  assert.ok(Math.abs((+c[4] - 4) - cells * 10) < 0.01);
  const size = G.svgSize(s);
  assert.ok(size.w > cells * 10 && size.h > cells * 10);            // page grew to fit the grid
  s.scale.mm = 5; assert.ok(G.svgSize(s).w < size.w);
  s.type = 'bar'; assert.deepEqual(plain(G.svgSize(s)), { w: 165, h: 105 });   // not applicable to bar graphs: size preset wins
});

test('large print scales text and lines together', () => {
  const s = G.sampleSpec();
  const fonts = svg => [...svg.matchAll(/font-size="([\d.]+)"/g)].map(m => +m[1]);
  const a = fonts(G.renderSVG(s)), b = (s.style.largePrint = true, fonts(G.renderSVG(s)));
  assert.equal(a.length, b.length);
  a.forEach((v, i) => assert.ok(Math.abs(b[i] / v - 1.35) < 0.03, `font ${v} -> ${b[i]}`));
  assert.ok(G.renderSVG(s).includes('stroke-width="0.675"'));        // axis line .5 x 1.35
  assert.ok(!/NaN|undefined/.test(G.renderSVG(s)));
});

test('photocopy-safe darkens the grid', () => {
  const s = G.sampleSpec();
  assert.ok(G.renderSVG(s).includes('#c4c4c4'));
  s.style.photocopySafe = true;
  const svg = G.renderSVG(s);
  assert.ok(!svg.includes('#c4c4c4') && svg.includes('#787878') && svg.includes('#3a3a3a'));
});

test('misleading-graph options: truncated axis, uneven intervals, stretched shape', () => {
  let s = G.sampleSpec(); s.type = 'bar';
  s.rows = [{ x: 'A', ys: [52, 50], label: '' }, { x: 'B', ys: [58, 55], label: '' }];
  s = G.normalize(s);
  assert.equal(G.computeAxes(s).y.lo, 0);
  s.misleading.truncate = true;
  const y = G.computeAxes(s).y;
  assert.ok(y.lo > 30 && y.lo < 50, 'truncated axis starts near the data: ' + y.lo);
  assert.ok(!/NaN|undefined/.test(G.renderSVG(s)));

  const l = G.sampleSpec();
  const ys = svg => { const d = /<path d="([^"]*)" stroke="#8c8c8c"/.exec(svg)[1]; return [...d.matchAll(/M[\d.]+,([\d.]+)H/g)].map(m => +m[1]); };   // horizontal major gridlines
  const even = ys(G.renderSVG(l)), gaps = a => a.slice(1).map((v, i) => a[i] - v);
  assert.ok(Math.max(...gaps(even)) - Math.min(...gaps(even)) < 0.01);              // normally even
  l.misleading.unevenY = true;
  const g2 = gaps(ys(G.renderSVG(l)));
  assert.ok(Math.max(...g2) - Math.min(...g2) > 1, 'gridline spacing is now uneven');

  const t = G.sampleSpec(); t.misleading.shape = 'tall';
  const c = svg => /<clipPath[^>]*><rect x="[\d.-]+" y="[\d.-]+" width="([\d.]+)" height="([\d.]+)"/.exec(svg).slice(1).map(Number);
  const [w, h] = c(G.renderSVG(t)); assert.ok(h / w > 2, 'tall and narrow');
  t.misleading.shape = 'wide'; const [w2, h2] = c(G.renderSVG(t)); assert.ok(h2 / w2 < 0.5, 'short and wide');
  const q = G.renderSVG(t, { version: 'question' });
  assert.ok(!/NaN|undefined/.test(q));
});

test('v1 files migrate: new fields default, scaffold level survives', () => {
  const v1 = JSON.parse(JSON.stringify(plain(G.sampleSpec())));
  for (const k of ['scale', 'annotations', 'regions', 'misleading']) delete v1[k];
  delete v1.style.photocopySafe; delete v1.style.largePrint;
  delete v1.x.format; delete v1.x.breakMark;
  v1.specVersion = 1;
  for (const level of ['axes', 'blank']) {
    v1.hidden = [...G.SCAFFOLD_V1[level]];
    const s = G.parseFile(JSON.stringify(v1));
    assert.equal(s.specVersion, 4);
    assert.equal(G.scaffoldLevel(s), level);
    assert.equal(s.x.format, 'decimal'); assert.equal(s.x.breakMark, true);
    assert.deepEqual(plain(s.annotations), []);
    assert.equal(s.scale.lock, false);
  }
  v1.hidden = ['title', 'pt:0:1'];
  assert.deepEqual(plain(G.parseFile(JSON.stringify(v1)).hidden), ['title', 'pt:0:1']);   // custom hides untouched
});

test('every option combined still renders cleanly and round-trips', () => {
  const s = G.sampleSpec();
  s.style = { colour: true, lineMarkers: true, photocopySafe: true, largePrint: true };
  s.x.format = 'fraction'; s.y.format = 'sci'; s.y.sigfigs = 3; s.x.step = 0.5; s.x.decimals = 1;
  s.scale = { lock: true, mm: 8 };
  s.misleading = { truncate: true, unevenX: true, unevenY: true, shape: 'tall' };
  s.annotations = [{ kind: 'callout', text: 'x', x: 1, y: 2, x2: 3, y2: 4 }];
  s.regions = [{ from: 1, to: 2, label: 'R', shade: 'hatch' }];
  s.hidden = [...G.SCAFFOLD.blank, 'pt:0:1'];
  for (const type of G.TYPES) for (const version of ['key', 'question']) {
    const t = G.normalize({ ...plain(s), type });
    const svg = G.renderSVG(t, { version });
    assert.ok(!/NaN|undefined|Infinity/.test(svg), type + ' ' + version);
  }
  const a = G.serialize(s);
  assert.equal(G.serialize(G.parseFile(a)), a);
});

/* ---------------------------- Phase 3 ---------------------------- */
test('parseTable picks tabs, commas or semicolons and copes with quotes and a BOM', () => {
  assert.deepEqual(plain(G.parseTable('a\tb\n1\t2')), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(plain(G.parseTable('\ufeffTime (min),Temp\n0,20\n1,27\n')), [['Time (min)', 'Temp'], ['0', '20'], ['1', '27']]);
  assert.deepEqual(plain(G.parseTable('a;b;c\n1;2;3')), [['a', 'b', 'c'], ['1', '2', '3']]);
  assert.deepEqual(plain(G.parseTable('name,note\n"Smith, J","said ""hi"""\n')), [['name', 'note'], ['Smith, J', 'said "hi"']]);
  assert.deepEqual(plain(G.parseTable('x,y\r\n1,2\r\n')), [['x', 'y'], ['1', '2']]);          // Windows line endings
  assert.deepEqual(plain(G.parseTable('one\ntwo')), [['one'], ['two']]);                       // single column stays single
  const s = G.blankSpec();                                                                       // a CSV imports exactly like a paste
  assert.ok(G.importGrid(s, G.parseTable('Time (s),Distance (m)\n0,0\n1,4.9\n2,19.6')));
  assert.equal(s.x.unit, 's'); assert.equal(s.y.unit, 'm'); assert.equal(s.rows.length, 3);
});

test('built-in presets are valid, distinct and render in both versions', () => {
  assert.ok(G.PRESETS.length >= 4);
  assert.equal(new Set(G.PRESETS.map(p => p.id)).size, G.PRESETS.length);
  for (const p of G.PRESETS) {
    const s = p.build();
    assert.deepEqual(plain(G.normalize(s)), plain(s), p.id);            // already normalised
    for (const version of ['key', 'question']) assert.ok(!/NaN|undefined/.test(G.renderSVG(s, { version })), p.id);
    assert.equal(G.serialize(G.parseFile(G.serialize(s))), G.serialize(s), p.id);
  }
  const g4 = G.PRESETS.find(p => p.id === 'grid4').build();
  assert.equal(g4.type, 'coordinate'); assert.equal(g4.axes, 'origin');
  const ax = G.computeAxes(g4);
  assert.deepEqual([ax.x.lo, ax.x.hi, ax.y.lo, ax.y.hi], [-10, 10, -10, 10]);
  const sci = G.PRESETS.find(p => p.id === 'science-line').build();
  assert.equal(sci.type, 'line'); assert.equal(sci.x.label, 'Time');
  assert.notEqual(G.serialize(g4), G.serialize(G.PRESETS.find(p => p.id === 'grid1').build()));
});

test('geometry export lets the editor map a mouse position back to graph values', () => {
  const s = G.sampleSpec(), geom = {};
  G.renderSVG(s, { geom });
  assert.ok(geom.x1 > geom.x0 && geom.y1 > geom.y0 && geom.ax.hi === 10 && geom.ay.hi === 80);
  // the plot's bottom-left corner is (lo, lo); top-right is (hi, hi)
  const xAt = px => geom.ax.lo + (px - geom.x0) / (geom.x1 - geom.x0) * (geom.ax.hi - geom.ax.lo);
  assert.equal(xAt(geom.x0), 0); assert.ok(Math.abs(xAt(geom.x1) - 10) < 1e-9);
  const b = G.sampleSpec(); b.type = 'bar'; const g2 = {}; G.renderSVG(b, { geom: g2 });
  assert.equal(g2.isBar, true); assert.equal(g2.ax, null);
});

/* ---------------------------- Phase 4 ---------------------------- */
const f = (src, x) => { const c = G.compileExpr(src); assert.equal(c.error, null, src + ': ' + c.error); return c.fn(x); };
const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 1e-9, `${msg || ''} ${a} vs ${b}`);

test('equation parser: arithmetic, precedence and implicit multiplication', () => {
  near(f('2x+1', 3), 7); near(f('2 * x + 1', 3), 7); near(f('y = 3x - 2', 2), 4); near(f('f(x) = x/2', 5), 2.5);
  near(f('-x^2', 3), -9, 'unary minus binds looser than ^');
  near(f('(-x)^2', 3), 9); near(f('2^3^2', 0), 512, 'right associative'); near(f('2^-1', 0), 0.5);
  near(f('3(x+1)', 2), 9); near(f('(x+1)(x-1)', 3), 8); near(f('2x^2+3x-5', 2), 9);
  near(f('1/2x', 4), 2, '(1/2)x'); near(f('x/2x', 4), 8, 'left to right: (x/2)*x');
  near(f('10 - 4 - 3', 0), 3, 'left associative'); near(f('.5x + 1.25', 2), 2.25);
  near(f('x\u00b2 - 4', 3), 5); near(f('2\u00d7x \u2212 1', 3), 5); near(f('\u03c0x', 1), Math.PI);
  near(f('sqrt(x)+1', 9), 4); near(f('abs(x)', -3), 3); near(f('sin(x)^2 + cos(x)^2', 1.3), 1);
  near(f('2sin x', Math.PI / 2), 2); near(f('ln(e)', 0), 1); near(f('log(1000)', 0), 3); near(f('exp(0)', 0), 1);
  near(f('xsin(x)', Math.PI / 2), Math.PI / 2, 'letters run together split into names');
  near(f('2e3', 0), 2000, 'scientific notation'); near(f('2e', 0), 2 * Math.E, '2e is 2 times e');
  assert.ok(Number.isNaN(f('sqrt(x)', -1))); assert.equal(f('1/x', 0), Infinity);
});

test('equation parser: clear errors, and no eval anywhere', () => {
  for (const bad of ['', '   ', '2+', '(x', 'x)', '2 $ x', 'foo(x)', 'x=', 'y=x+y', '*3', '2**', '1 2 +']) {
    const c = G.compileExpr(bad);
    assert.ok(c.error && c.fn === null, `"${bad}" should fail`);
  }
  assert.match(G.compileExpr('foo(x)').error, /Unknown name/);
  assert.match(G.compileExpr('(x').error, /bracket/);
  assert.equal(G.compileExpr('2x').error, null);
  assert.ok(!/\beval\s*\(|new Function|\bFunction\s*\(/.test(core), 'core must never use eval or Function()');
  assert.doesNotThrow(() => G.compileExpr('x'.repeat(200) + '+' + '('.repeat(50)));   // hostile input fails, never hangs
});

test('line of best fit: least squares, manual, degenerate, equation text', () => {
  const s = G.blankSpec(); s.type = 'scatter';
  s.rows = [[1, 3], [2, 5], [3, 7], [4, 9]].map(([x, y]) => ({ x, ys: [y], label: '' }));
  s.fit.mode = 'calc';
  let fit = G.fitLine(s); near(fit.m, 2); near(fit.c, 1);
  s.rows = [[0, 1], [1, 3], [2, 2], [3, 5], [4, 4]].map(([x, y]) => ({ x, ys: [y], label: '' }));
  fit = G.fitLine(s); near(fit.m, 0.8); near(fit.c, 1.4, 'textbook example');
  s.fit.mode = 'manual'; s.fit.slope = -0.5; s.fit.intercept = 3;
  assert.deepEqual(plain(G.fitLine(s)), { m: -0.5, c: 3 });
  s.fit.mode = 'none'; assert.equal(G.fitLine(s), null);
  s.fit.mode = 'calc'; s.rows = [{ x: 2, ys: [1], label: '' }, { x: 2, ys: [5], label: '' }];
  assert.equal(G.fitLine(s), null, 'vertical data has no unique line');
  s.rows = [{ x: 2, ys: [1], label: '' }]; assert.equal(G.fitLine(s), null, 'one point is not enough');
  assert.equal(G.equationText(2, 1), 'y = 2x + 1'); assert.equal(G.equationText(1, 0), 'y = x');
  assert.equal(G.equationText(-1, -2.5), 'y = \u2212x \u2212 2.5'); assert.equal(G.equationText(0, 4), 'y = 4');
  assert.equal(G.equationText(2.34567, 10.9876), 'y = 2.35x + 11');
});

test('best fit, equations and shapes render, and hide by token', () => {
  const s = G.PRESETS.find(p => p.id === 'function').build();
  assert.ok(G.renderSVG(s).includes('y = 2x + 1'));
  s.hidden = ['fn:0']; assert.ok(!G.renderSVG(s, { version: 'question' }).includes('y = 2x + 1'));
  s.hidden = ['data']; assert.ok(!G.renderSVG(s, { version: 'question' }).includes('y = 2x + 1'));
  const t = G.sampleSpec(); t.fit = { mode: 'calc', series: 0, slope: 1, intercept: 0, equation: true, dash: 'dashed' };
  assert.ok(/y = [\d.]+x/.test(G.renderSVG(t)));
  t.hidden = ['fit']; const q = G.renderSVG(t, { version: 'question' });
  assert.ok(!/y = [\d.]+x/.test(q) && q.includes('<polyline'), 'the data stay, only the fit is hidden');
  const tr = G.PRESETS.find(p => p.id === 'transform').build();
  const key = G.renderSVG(tr);
  assert.equal((key.match(/<polygon points="[^"]*" fill="none" stroke="#000"/g) || []).length, 2);
  for (const l of ['A', 'B', 'C', "A'", "B'", "C'"]) assert.ok(key.includes('>' + l.replace("'", "'") + '<'), l);
  tr.hidden = ['shape:1']; const q2 = G.renderSVG(tr, { version: 'question' });
  assert.equal((q2.match(/<polygon points="[^"]*" fill="none" stroke="#000"/g) || []).length, 1);
  assert.ok(!q2.includes(">A'<") && q2.includes('>A<'), 'original stays, image is hidden');
  const bad = G.PRESETS.find(p => p.id === 'function').build(); bad.functions[0].expr = '2x +';
  assert.ok(!/NaN|undefined/.test(G.renderSVG(bad)), 'a broken equation just draws nothing');
});

test('functions: asymptotes and domain errors do not draw across gaps', () => {
  const s = G.PRESETS.find(p => p.id === 'grid4').build();
  s.functions = [{ expr: '1/x', dash: 'solid', label: false }];
  const svg = G.renderSVG(s);
  assert.equal((svg.match(/<polyline points/g) || []).length, 2, 'two branches, not one line through the asymptote');
  s.functions = [{ expr: 'sqrt(x)', dash: 'solid', label: false }];
  assert.equal((G.renderSVG(s).match(/<polyline points/g) || []).length, 1, 'only the real half is drawn');
  s.functions = [{ expr: 'x^2', dash: 'dashed', label: true }];
  assert.ok(G.renderSVG(s).includes('stroke-dasharray'));
});

test('shape transformations', () => {
  const tri = [{ x: 1, y: 1 }, { x: 4, y: 1 }, { x: 1, y: 3 }], t = (op) => plain(G.transformPoints(tri, op));
  assert.deepEqual(t({ t: 'translate', dx: -6, dy: -5 }), [{ x: -5, y: -4 }, { x: -2, y: -4 }, { x: -5, y: -2 }]);
  assert.deepEqual(t({ t: 'reflectX' }), [{ x: 1, y: -1 }, { x: 4, y: -1 }, { x: 1, y: -3 }]);
  assert.deepEqual(t({ t: 'reflectY' })[1], { x: -4, y: 1 });
  assert.deepEqual(t({ t: 'reflectYX' })[2], { x: 3, y: 1 });
  assert.deepEqual(t({ t: 'rot90' })[1], { x: -1, y: 4 });
  assert.deepEqual(t({ t: 'rot180' })[1], { x: -4, y: -1 });
  assert.deepEqual(t({ t: 'rot270' })[1], { x: 1, y: -4 });
  assert.deepEqual(t({ t: 'dilate', k: 2 })[2], { x: 2, y: 6 });
  assert.deepEqual(t({ t: 'dilate', k: 0.5 })[1], { x: 2, y: 0.5 });
  const back = G.transformPoints(G.transformPoints(tri, { t: 'rot90' }), { t: 'rot270' });
  assert.deepEqual(plain(back), plain(tri), 'rot90 then rot270 is the identity');
  assert.equal(G.primeLabels('A B C'), "A' B' C'");
  assert.ok(Object.is(G.transformPoints([{ x: 0, y: 0 }], { t: 'reflectX' })[0].y, 0), 'no negative zero');
});

test('histogram: bins, counts, axes and hiding', () => {
  const s = G.PRESETS.find(p => p.id === 'histogram').build();
  const a = G.analyse(s), h = a.hist;
  assert.equal(h.counts.reduce((x, y) => x + y, 0), 18, 'every value lands in exactly one bin');
  assert.equal(h.edges.length, h.counts.length + 1);
  h.edges.slice(1).forEach((e, i) => near(e - h.edges[i], h.w, 'equal-width bins'));
  assert.ok(h.edges[0] <= 148 && h.edges[h.edges.length - 1] > 175);
  assert.deepEqual([a.ax.lo, a.ax.hi, a.ax.step], [h.edges[0], h.edges[h.edges.length - 1], h.w]);
  assert.ok(a.ay.step >= 1 && a.ay.lo === 0 && a.ay.hi >= Math.max(...h.counts), 'frequency axis is whole numbers from zero');
  s.hist = { binWidth: 5, start: 145 };
  const h2 = G.analyse(s).hist;
  assert.deepEqual(plain(h2.edges), [145, 150, 155, 160, 165, 170, 175, 180]);
  assert.deepEqual(plain(h2.counts), [1, 3, 5, 5, 2, 1, 1], 'counts by [a,b): 175 belongs to 175-180');
  assert.equal(h2.counts.reduce((x, y) => x + y, 0), 18);
  s.hist = { binWidth: 10, start: 140 };
  assert.deepEqual(plain(G.analyse(s).hist.counts), [1, 8, 7, 2]);
  const key = G.renderSVG(s), bars = svg => (svg.match(/<rect [^>]*stroke="#000" stroke-width="0\.3"/g) || []).length;
  assert.equal(bars(key), G.analyse(s).hist.counts.filter(Boolean).length);
  s.hidden = ['pt:0:1']; assert.equal(bars(G.renderSVG(s, { version: 'question' })), bars(key) - 1);
  s.hidden = ['data']; assert.equal(bars(G.renderSVG(s, { version: 'question' })), 0);
  const empty = G.blankSpec(); empty.type = 'histogram';
  assert.ok(!/NaN|undefined/.test(G.renderSVG(empty)));
  assert.equal(G.analyse(empty).hist.counts.length, 5, 'an empty histogram still draws a usable grid');
});

test('histogram: a single column pastes straight in', () => {
  const s = G.blankSpec(); s.type = 'histogram';
  assert.ok(G.importGrid(s, G.parseTable('Height (cm)\n148\n151\n152\n')));
  assert.deepEqual(plain(s.rows.map(r => r.x)), [148, 151, 152]);
  assert.equal(s.x.label, 'Height'); assert.equal(s.x.unit, 'cm');
  assert.deepEqual(plain(G.tableCols(s)), [{ k: 'x' }]);
  const r = G.pasteGrid(s, [['1', '2', '3']], 0, 0);
  assert.equal(r.ignored, 2, 'extra columns are ignored, not turned into series');
  assert.equal(s.series.length, 1);
});

test('pie graph: slices, angles, percent/degree labels, hiding', () => {
  const s = G.PRESETS.find(p => p.id === 'pie').build();       // 40, 25, 20, 15 -> 100
  const key = G.renderSVG(s);
  for (const l of ['40%', '25%', '20%', '15%', 'Apples', 'Bananas']) assert.ok(key.includes('>' + l + '<'), l);
  assert.equal((key.match(/<path d="M[^"]*A/g) || []).length, 4);
  s.pie.labels = 'degrees'; const deg = G.renderSVG(s);
  for (const l of ['144\u00b0', '90\u00b0', '72\u00b0', '54\u00b0']) assert.ok(deg.includes('>' + l + '<'), l);
  s.pie.labels = 'value'; s.y.unit = 'kg'; assert.ok(G.renderSVG(s).includes('>40 kg<'));
  s.pie.labels = 'percent'; s.y.decimals = 0;
  s.rows = [{ x: 'A', ys: [1], label: '' }, { x: 'B', ys: [2], label: '' }]; assert.ok(G.renderSVG(s).includes('>33%<'));
  s.y.decimals = null; assert.ok(G.renderSVG(s).includes('>33.3%<'));
  s.rows = [{ x: 'Only', ys: [5], label: '' }]; assert.ok(!/NaN/.test(G.renderSVG(s)), 'a single slice is a full circle');
  const p = G.PRESETS.find(q => q.id === 'pie').build();
  p.hidden = ['pointLabels']; let q = G.renderSVG(p, { version: 'question' });
  assert.ok(!q.includes('>40%<') && q.includes('>Apples<'), 'values hidden, names kept');
  p.hidden = ['xTicks']; q = G.renderSVG(p, { version: 'question' });
  assert.ok(q.includes('>40%<') && !q.includes('>Apples<'));
  p.hidden = ['pt:0:1']; assert.equal((G.renderSVG(p, { version: 'question' }).match(/<path d="M[^"]*A/g) || []).length, 3);
  p.hidden = [...G.SCAFFOLD.labels]; q = G.renderSVG(p, { version: 'question' });
  assert.ok(!q.includes('<path d="M') && q.includes('<circle'), 'a hidden pie leaves the empty circle to draw on');
  const z = G.blankSpec(); z.type = 'pie'; assert.ok(!/NaN|undefined/.test(G.renderSVG(z)));
  const neg = G.blankSpec(); neg.type = 'pie'; neg.rows = [{ x: 'a', ys: [-3], label: '' }, { x: 'b', ys: [4], label: '' }];
  assert.ok(!/NaN|undefined/.test(G.renderSVG(neg)), 'negative amounts count as zero');
});

test('pie slices add up to a full turn', () => {
  const s = G.PRESETS.find(p => p.id === 'pie').build();
  const svg = G.renderSVG(s), cx = 165 / 2;
  const arcs = [...svg.matchAll(/<path d="M[\d.-]+,[\d.-]+L([\d.-]+),([\d.-]+)A/g)];
  assert.equal(arcs.length, 4);
  const cy = +[...svg.matchAll(/<circle cx="[\d.]+" cy="([\d.]+)" r="([\d.]+)" fill="none"/g)].pop()[1];   // the outline circle (patterns have circles too)
  const angs = arcs.map(m => (Math.atan2(+m[2] - cy, +m[1] - cx) * 180 / Math.PI + 90 + 360) % 360);
  const deg = (a, b, m) => assert.ok(Math.abs(a - b) < 0.05, `${m || ''} ${a} vs ${b}`);   // coordinates are rounded to 0.001 mm
  deg(angs[0], 0, 'first slice starts at twelve o\u2019clock'); deg(angs[1], 144); deg(angs[2], 234); deg(angs[3], 306);
});

test('number line: ticks, marks, inequality notation, hiding', () => {
  const s = G.PRESETS.find(p => p.id === 'numberline').build();
  const key = G.renderSVG(s);
  assert.ok(key.includes('>\u221210<') && key.includes('>0<') && key.includes('>10<'));
  assert.ok(key.includes('>x \u2265 2<'), 'notation label');
  const dots = svg => [...svg.matchAll(/<circle [^>]*r="1\.7[^"]*" fill="([^"]+)"/g)].map(m => m[1]);
  assert.deepEqual(dots(key), ['#000'], 'x \u2265 2 has a closed dot');
  s.marks[0].op = 'gt'; assert.deepEqual(dots(G.renderSVG(s)), ['#fff'], 'x > 2 has an open dot');
  s.marks = [{ kind: 'point', at: -3, to: 0, op: 'ge', closed: true, closedTo: true, label: '' },
             { kind: 'interval', at: 1, to: 6, op: 'ge', closed: false, closedTo: true, label: '1 < x \u2264 6' }];
  assert.deepEqual(dots(G.renderSVG(s)), ['#000', '#fff', '#000']);
  s.hidden = ['mark:0']; assert.equal(dots(G.renderSVG(s, { version: 'question' })).length, 2);
  s.hidden = [...G.SCAFFOLD.blank]; const q = G.renderSVG(s, { version: 'question' });
  assert.equal(dots(q).length, 0); assert.ok(!/>\u221210</.test(q) && q.includes('<path d="M'), 'blank number line: axis and ticks only');
  s.x.format = 'fraction'; s.x.min = -2; s.x.max = 2; s.x.step = 0.5; s.hidden = [];
  const fr = G.renderSVG(s); assert.ok(fr.includes('>\u22121 1/2<') && fr.includes('>1/2<'), 'fractions on a number line');
  const dims = G.svgSize(s); assert.equal(dims.w, 165); assert.ok(dims.h < 50, 'height follows the content');
  s.style.largePrint = true; assert.ok(G.svgSize(s).h > dims.h);
  const empty = G.blankSpec(); empty.type = 'numberline'; assert.ok(!/NaN|undefined/.test(G.renderSVG(empty)));
  assert.equal(OPS_OK(G), true);
});
const OPS_OK = G => ['lt', 'le', 'gt', 'ge'].every(k => typeof G.OP_SYMBOL[k] === 'string');

test('new types work with scaffold levels, hiding, colour, print styles and exports (one code path)', () => {
  const kinds = ['function', 'transform', 'numberline', 'histogram', 'pie', 'grid4', 'science-line'];
  for (const id of kinds) for (const level of ['complete', 'labels', 'axes', 'blank']) for (const variant of ['plain', 'colour', 'large', 'safe', 'misc']) {
    const s = G.PRESETS.find(p => p.id === id).build();
    s.hidden = [...G.SCAFFOLD[level]]; s.blanks = ['title', 'xTitle', 'yTitle', 'units'];
    s.title = 'T'; s.x.label = 'X'; s.x.unit = 'u'; s.y.label = 'Y'; s.y.unit = 'v';
    s.annotations = [{ kind: 'callout', text: 'n', x: 1, y: 1, x2: 2, y2: 2 }]; s.regions = [{ from: 1, to: 2, label: 'A', shade: 'hatch' }];
    if (variant === 'colour') s.style.colour = true;
    if (variant === 'large') s.style.largePrint = true;
    if (variant === 'safe') s.style.photocopySafe = true;
    if (variant === 'misc') { s.legend = 'bottom'; s.axes = 'origin'; s.misleading.unevenY = true; s.misleading.shape = 'wide'; s.scale = { lock: true, mm: 8 }; }
    const n = G.normalize(s);
    for (const version of ['key', 'question']) {
      const svg = G.renderSVG(n, { version, ghost: true, hits: true, flags: new Set(['0:0']), geom: {} });
      assert.ok(svg.startsWith('<svg') && svg.endsWith('</svg>'), [id, level, variant, version].join('/'));
      assert.ok(!/NaN|undefined|Infinity/.test(svg), [id, level, variant, version].join('/') + ' has a bad number');
      assert.ok(/viewBox="0 0 [\d.]+ [\d.]+"/.test(svg));
    }
    assert.equal(G.serialize(G.parseFile(G.serialize(n))), G.serialize(n));
    assert.equal(G.renderSVG(G.parseFile(G.serialize(n))), G.renderSVG(n), 'save/load draws the identical graph');
    assert.ok(Array.isArray(G.readability(n)));
    G.snapValues(G.normalize(n));                                    // never throws on any type
  }
});

test('question versions keep the same page and plot as the key for every new type', () => {
  for (const id of ['histogram', 'pie', 'numberline', 'function']) {
    const s = G.PRESETS.find(p => p.id === id).build(); s.title = 'Title'; s.x.label = 'X'; s.y.label = 'Y';
    const size = svg => /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg).slice(1).join('x');
    const base = size(G.renderSVG(s, { version: 'key' }));
    for (const level of ['labels', 'axes', 'blank']) { s.hidden = [...G.SCAFFOLD[level]]; assert.equal(size(G.renderSVG(s, { version: 'question' })), base, id + '/' + level); }
    const clip = svg => (/<clipPath[^>]*><rect ([^>]*)\/>/.exec(svg) || [])[1];
    if (id !== 'pie' && id !== 'numberline') { s.hidden = []; const k = clip(G.renderSVG(s)); for (const level of ['labels', 'axes', 'blank']) { s.hidden = [...G.SCAFFOLD[level]]; assert.equal(clip(G.renderSVG(s, { version: 'question' })), k, id + '/' + level); } }
  }
});

test('v2 files migrate to v3 with defaults for the new fields', () => {
  const v2 = plain(G.sampleSpec());
  for (const k of ['fit', 'functions', 'shapes', 'marks', 'hist', 'pie']) delete v2[k];
  v2.specVersion = 2;
  const s = G.parseFile(JSON.stringify(v2));
  assert.equal(s.specVersion, 4); assert.equal(s.fit.mode, 'none'); assert.deepEqual(plain(s.functions), []);
  assert.equal(s.pie.labels, 'percent'); assert.equal(s.hist.binWidth, null);
  assert.equal(G.renderSVG(s), G.renderSVG(G.sampleSpec()), 'an old graph draws exactly as before');
});

test('normalize sanitises the new fields', () => {
  const s = G.normalize({ type: 'pie', fit: { mode: 'weird', series: 9, slope: 'x' }, functions: [{ expr: 5 }, null],
    shapes: [{ kind: 'blob', points: [{ x: 'a', y: 2 }, null] }], marks: [{ kind: 'zzz', op: 'no', at: 'q' }],
    hist: { binWidth: -2, start: 'x' }, pie: { labels: 'nope' }, hidden: ['fn:1', 'fn:2', 'shape:0', 'shape:3', 'mark:0', 'mark:1', 'fit'] });
  assert.equal(s.fit.mode, 'none'); assert.equal(s.fit.series, 0); assert.equal(s.fit.slope, 0);
  assert.deepEqual(plain(s.functions.map(f => f.expr)), ['', '']);
  assert.deepEqual(plain(s.shapes[0].points), [{ x: 0, y: 2 }, { x: 0, y: 0 }]); assert.equal(s.shapes[0].kind, 'polygon');
  assert.equal(s.marks[0].kind, 'point'); assert.equal(s.marks[0].op, 'ge'); assert.equal(s.marks[0].at, 0);
  assert.equal(s.hist.binWidth, null); assert.equal(s.hist.start, null); assert.equal(s.pie.labels, 'percent');
  assert.deepEqual(plain(s.hidden), ['fn:1', 'shape:0', 'mark:0', 'fit']);
  const h = G.normalize({ type: 'histogram', hidden: ['pt:0:40'] }); assert.deepEqual(plain(h.hidden), ['pt:0:40'], 'histogram tokens count bins');
  const l = G.normalize({ type: 'line', hidden: ['pt:0:40'] }); assert.deepEqual(plain(l.hidden), []);
  const d = { shapes: [{}, {}, {}], hidden: ['shape:0', 'shape:1', 'shape:2', 'fn:0'], functions: [{}] };
  const n = G.normalize(d); n.shapes.splice(1, 1); G.dropIndex(n, 'shape', 1);
  assert.deepEqual(plain(n.hidden), ['shape:0', 'shape:1', 'fn:0']);
});

test('only the digits after ^ are raised, so "x^2 - 4" keeps its minus on the line', () => {
  const s = G.PRESETS.find(p => p.id === 'function').build(); s.functions[0].expr = 'x^2 - 4';
  const svg = G.renderSVG(s);
  assert.match(svg, />y = x<tspan dy="-[\d.]+" font-size="[\d.]+">2<\/tspan><tspan dy="[\d.]+"> - 4<\/tspan><\/text>/);
  s.functions[0].expr = '2^-1x'; assert.ok(!/NaN|undefined/.test(G.renderSVG(s)));
});

test('coordinate grids use whole-unit steps once they are a few units wide', () => {
  const s = G.PRESETS.find(p => p.id === 'transform').build();     // shapes only reach 5
  const ax = G.computeAxes(s); assert.equal(ax.x.step, 1); assert.equal(ax.y.step, 1);
  const tiny = G.PRESETS.find(p => p.id === 'grid4').build(); tiny.rows = [{ x: 0.5, ys: [1.5], label: '' }];
  assert.ok(G.computeAxes(tiny).x.step < 1, 'a grid only 1.5 wide still gets fine steps');
});

test('histograms never get an axis-break zigzag over their bars', () => {
  const s = G.PRESETS.find(p => p.id === 'histogram').build(); s.hist = { binWidth: 5, start: 145 };
  assert.ok(!/<rect x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" fill="#fff"\/><polyline/.test(G.renderSVG(s)));
});

/* ---------------------------- Phase 5 ---------------------------- */
test('error bars: fixed and percentage, on points and bars, hidden by token, counted in the range', () => {
  const s = G.blankSpec(); s.type = 'scatter';
  s.rows = [{ x: 1, ys: [10], label: '' }, { x: 2, ys: [20], label: '' }];
  const caps = svg => (svg.match(/<path d="M[\d.]+,[\d.]+V[\d.]+M[\d.]+,[\d.]+H[\d.]+M[\d.]+,[\d.]+H[\d.]+" stroke="#000"/g) || []).length;
  assert.equal(caps(G.renderSVG(s)), 0);
  s.errorBars = { mode: 'fixed', value: 2 };
  assert.equal(caps(G.renderSVG(s)), 2);
  assert.equal(G.errAmount(s, 50), 2);
  s.errorBars = { mode: 'percent', value: 10 }; assert.equal(G.errAmount(s, -50), 5);
  s.errorBars = { mode: 'fixed', value: 15 };                               // 20 + 15 = 35 must fit on the axis
  assert.ok(G.computeAxes(s).y.hi >= 35, 'axis grows to hold the bar tops');
  s.hidden = ['errorBars']; assert.equal(caps(G.renderSVG(s, { version: 'question' })), 0);
  s.hidden = ['data']; assert.equal(caps(G.renderSVG(s, { version: 'question' })), 0);
  const b = G.sampleSpec(); b.type = 'bar'; b.rows = [{ x: 'a', ys: [5, 6], label: '' }, { x: 'b', ys: [7, 8], label: '' }];
  b.errorBars = { mode: 'fixed', value: 1 }; assert.equal(caps(G.renderSVG(G.normalize(b))), 4, 'one per bar');
  for (const type of G.TYPES) { const x = G.sampleSpec(); x.type = type; x.errorBars = { mode: 'percent', value: 20 }; assert.ok(!/NaN|undefined/.test(G.renderSVG(G.normalize(x))), type); }
  assert.deepEqual(plain(G.normalize({ errorBars: { mode: 'zzz', value: -5 } }).errorBars), { mode: 'none', value: 0 });
});

test('variants: deterministic, on the grid, within bounds, never identical, axes pinned', () => {
  const s = G.sampleSpec(); s.x.step = 1;
  const a = G.makeVariant(s, 42, 1), b = G.makeVariant(s, 42, 1), c = G.makeVariant(s, 43, 1);
  assert.equal(G.serialize(a), G.serialize(b), 'same seed, same variant');
  assert.notEqual(G.serialize(a), G.serialize(c), 'different seed, different variant');
  assert.notEqual(G.serialize(a), G.serialize(s));
  const g = G.gridStepFor(G.analyse(s).ay, s);
  s.rows.forEach((row, i) => row.ys.forEach((y, j) => {
    const ny = a.rows[i].ys[j];
    assert.ok(Math.abs(ny - y) <= 1.5 * g + 1e-9, `row ${i}: moved too far (${y} -> ${ny})`);   // half a gridline to snap, plus one nudge
    assert.equal(G.readability(Object.assign(G.normalize(plain(a)), {})).filter(q => q.r === i && q.j === j && q.axis === 'y').length, 0, 'still on a gridline');
  }));
  assert.deepEqual(plain(a.rows.map(r => r.x)), plain(s.rows.map(r => r.x)), 'x values untouched');
  assert.ok(a.y.min !== null && a.y.max !== null && a.y.step !== null, 'axes pinned');
  assert.deepEqual([a.y.min, a.y.max], [G.computeAxes(s).y.lo, G.computeAxes(s).y.hi]);
  const big = G.makeVariant(s, 7, 3);
  s.rows.forEach((row, i) => row.ys.forEach((y, j) => assert.ok(Math.abs(big.rows[i].ys[j] - y) <= 3.5 * g + 1e-9)));
  const tiny = G.blankSpec(); tiny.rows = [{ x: 1, ys: [5], label: '' }];   // a single value still changes
  assert.notEqual(G.makeVariant(tiny, 1, 1).rows[0].ys[0], 5);
  const bar = G.sampleSpec(); bar.type = 'bar'; bar.rows = [{ x: 'a', ys: [10, 20], label: '' }, { x: 'b', ys: [30, 40], label: '' }];
  const bv = G.makeVariant(G.normalize(bar), 5, 2); assert.deepEqual(plain(bv.rows.map(r => r.x)), ['a', 'b']);
  for (const type of ['pie', 'histogram', 'numberline']) { const x = G.sampleSpec(); x.type = type; assert.equal(G.makeVariant(x, 1, 1), null, type); }
  const r1 = G.mulberry32(9), r2 = G.mulberry32(9); assert.equal(r1(), r2()); assert.ok(r1() >= 0 && r1() < 1);
});

test('log axes: decade ticks, mapping, gridlines, dropped non-positive values', () => {
  const s = G.blankSpec(); s.type = 'scatter'; s.y.scale = 'log';
  s.rows = [1, 10, 100, 1000, 20000].map((y, i) => ({ x: i + 1, ys: [y], label: '' })).concat([{ x: 9, ys: [0], label: '' }, { x: 10, ys: [-5], label: '' }]);
  const ay = G.computeAxes(s).y;
  assert.equal(ay.log, true); assert.deepEqual([ay.lo, ay.hi], [1, 100000]);
  assert.deepEqual(plain(G.ticks(ay)), [1, 10, 100, 1000, 10000, 100000]);
  const svg = G.renderSVG(s), geom = {}; G.renderSVG(s, { geom });
  assert.ok(!/NaN|undefined|Infinity/.test(svg));
  assert.ok(svg.includes('>10<tspan') && svg.includes('>1000<'), 'labels: 1000 plain, 10^5 raised');
  assert.equal((svg.match(/<circle [^>]*r="1\.35"/g) || []).length, 5, 'zero and negative values are left off');
  // equal decades take equal heights
  const at = v => geom.y1 - (G.axT(ay, v) - G.axT(ay, ay.lo)) / (G.axT(ay, ay.hi) - G.axT(ay, ay.lo)) * (geom.y1 - geom.y0);
  assert.ok(Math.abs((at(1) - at(10)) - (at(10) - at(100))) < 1e-9 && Math.abs((at(100) - at(1000)) - (at(1) - at(10))) < 1e-9);
  assert.equal(G.axInv(ay, 3), 1000);
  const grid = /<path d="([^"]*)" stroke="#c4c4c4"/.exec(svg)[1];
  assert.equal((grid.match(/H/g) || []).length, 5 * 8, 'minor lines at 2..9 in each of 5 decades');
  s.grid.minor = false; assert.ok(!/stroke="#c4c4c4"/.test(G.renderSVG(s)));
  s.y.scale = 'linear'; assert.equal(G.computeAxes(s).y.log, undefined);
  const x = G.blankSpec(); x.type = 'coordinate'; x.y.scale = 'log'; assert.equal(G.computeAxes(x).y.log, undefined, 'coordinate grids stay linear');
  const b = G.sampleSpec(); b.type = 'bar'; b.y.scale = 'log'; b.rows = [{ x: 'a', ys: [10, 500], label: '' }, { x: 'b', ys: [0, 3], label: '' }];
  const bs = G.renderSVG(G.normalize(b)); assert.ok(!/NaN|undefined/.test(bs)); assert.equal(G.computeAxes(G.normalize(b)).y.lo, 1);
  const mn = G.blankSpec(); mn.type = 'line'; mn.x.scale = 'log'; mn.x.min = 5; mn.x.max = 500;
  mn.rows = [{ x: 10, ys: [1], label: '' }, { x: 100, ys: [2], label: '' }];
  assert.deepEqual(plain(G.ticks(G.computeAxes(mn).x)), [10, 100], 'manual limits keep only the decades inside');
});

test('log axes with everything else: equations, fits, shapes, annotations, regions, print styles', () => {
  const s = G.sampleSpec(); s.type = 'scatter'; s.x.scale = 'log'; s.y.scale = 'log'; s.rows = [1, 2, 5, 10, 50].map(x => ({ x, ys: [x * x, x * 3], label: '' }));
  s.functions = [{ expr: 'x^2', dash: 'solid', label: true }, { expr: 'x - 5', dash: 'solid', label: true }];
  s.fit = { mode: 'calc', series: 0, slope: 1, intercept: 0, equation: true, dash: 'dashed' };
  s.shapes = [{ kind: 'polygon', points: [{ x: 1, y: 1 }, { x: 10, y: 1 }, { x: -3, y: 10 }], vlabels: 'A B C', fill: 'hatch', dash: 'solid' }];
  s.annotations = [{ kind: 'arrow', text: 'a', x: 0, y: -1, x2: 10, y2: 10 }]; s.regions = [{ from: -2, to: 5, label: 'R', shade: 'hatch' }];
  s.errorBars = { mode: 'percent', value: 20 }; s.style = { colour: true, lineMarkers: true, photocopySafe: true, largePrint: true };
  for (const version of ['key', 'question']) for (const level of ['complete', 'labels', 'axes', 'blank']) {
    s.hidden = [...G.SCAFFOLD[level]];
    const svg = G.renderSVG(G.normalize(s), { version, ghost: true, hits: true, flags: new Set(), geom: {} });
    assert.ok(!/NaN|undefined|Infinity/.test(svg), version + '/' + level);
  }
  assert.equal(G.makeVariant(G.normalize(s), 1, 1), null, 'no variants on log axes');
  assert.equal(G.readability(G.normalize(s)).length, 0);
  assert.equal(G.serialize(G.parseFile(G.serialize(s))), G.serialize(s));
});

test('box plot statistics: quartiles, whiskers, outliers', () => {
  const b = G.boxStats([7, 15, 36, 39, 40, 41], 'minmax');
  assert.deepEqual([b.min, b.q1, b.median, b.q3, b.max], [7, 15, 37.5, 40, 41], 'even count: halves of three');
  const odd = G.boxStats([1, 2, 3, 4, 5, 6, 7], 'minmax');
  assert.deepEqual([odd.q1, odd.median, odd.q3], [2, 4, 6], 'odd count: the middle value is left out of both halves');
  const one = G.boxStats([5], 'iqr'); assert.deepEqual([one.q1, one.median, one.q3, one.outliers.length], [5, 5, 5, 0]);
  assert.equal(G.boxStats([], 'iqr'), null); assert.equal(G.boxStats([NaN], 'iqr'), null);
  const o = G.boxStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 30], 'iqr');   // q1 3, q3 8, iqr 5, fence 15.5
  assert.deepEqual([o.q1, o.q3, o.whiskerHi, o.whiskerLo], [3, 8, 9, 1]); assert.deepEqual(plain(o.outliers), [30]);
  const all = G.boxStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 30], 'minmax'); assert.equal(all.whiskerHi, 30); assert.equal(all.outliers.length, 0);
  assert.deepEqual([G.boxStats([9, 1, 5], 'minmax').min, G.boxStats([9, 1, 5], 'minmax').median], [1, 5], 'input order does not matter');
});

test('box plot: one box per column, hiding, table shape, import', () => {
  const s = G.PRESETS.find(p => p.id === 'boxplot').build();
  const key = G.renderSVG(s);
  const boxes = svg => (svg.match(/<rect x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" fill="[^"]*" stroke="#000" stroke-width="0\.5"\/>/g) || []).length;
  assert.equal(boxes(key), 2);
  assert.ok(key.includes('>Class A<') && key.includes('>Class B<'), 'box names sit on the category axis');
  assert.equal((key.match(/<circle [^>]*fill="#fff" stroke="#000"/g) || []).length, 2, 'Class B has two outliers (30 and 100)');
  s.hidden = ['series:1']; assert.equal(boxes(G.renderSVG(s, { version: 'question' })), 1);
  s.hidden = ['data']; assert.equal(boxes(G.renderSVG(s, { version: 'question' })), 0);
  s.hidden = [...G.SCAFFOLD.blank]; assert.ok(!G.renderSVG(s, { version: 'question' }).includes('Class A'));
  s.hidden = []; s.box.whiskers = 'minmax'; assert.equal((G.renderSVG(s).match(/<circle [^>]*fill="#fff" stroke="#000"/g) || []).length, 0);
  assert.deepEqual(plain(G.tableCols(s)), [{ k: 'y', i: 0 }, { k: 'y', i: 1 }], 'no x column');
  const a = G.analyse(s); assert.equal(a.isBar, true); assert.equal(a.box.length, 2);
  assert.ok(a.ay.hi >= 100, 'axis holds the outliers');
  const t = G.blankSpec(); t.type = 'boxplot';
  assert.ok(G.importGrid(t, G.parseTable('Girls (cm),Boys (cm),Staff\n150,152,160\n155,158,170\n160,,175')));
  assert.deepEqual(plain(t.series.map(x => x.name)), ['Girls', 'Boys', 'Staff']); assert.equal(t.y.unit, 'cm');
  assert.deepEqual(plain(t.rows.map(r => r.ys)), [[150, 152, 160], [155, 158, 170], [160, null, 175]]);
  const u = G.blankSpec(); u.type = 'boxplot'; G.importGrid(u, G.parseTable('1,2\n3,4')); assert.equal(u.series.length, 2, 'no header: columns are simply boxes');
  assert.equal(G.readability(s).length, 0); assert.equal(G.makeVariant(s, 1, 1), null);
  const e = G.blankSpec(); e.type = 'boxplot'; assert.ok(!/NaN|undefined/.test(G.renderSVG(e)), 'an empty box plot still draws');
  for (const opt of [{ colour: true }, { largePrint: true }, { photocopySafe: true }]) { const z = G.PRESETS.find(p => p.id === 'boxplot').build(); Object.assign(z.style, opt); assert.ok(!/NaN|undefined/.test(G.renderSVG(z))); }
  assert.equal(G.serialize(G.parseFile(G.serialize(s))), G.serialize(s));
});

test('combo graph: bars on the left axis, a line on the right axis', () => {
  const s = G.PRESETS.find(p => p.id === 'climatograph').build();
  const a = G.analyse(s);
  assert.ok(a.ay2 && a.ay2.hi >= 20 && a.ay.hi >= 70, 'two independent axes');
  assert.notDeepEqual([a.ay.lo, a.ay.hi], [a.ay2.lo, a.ay2.hi]);
  const svg = G.renderSVG(s);
  const bars = v => (v.match(/<rect x="[^"]*" y="[^"]*" width="[^"]*" height="[^"]*" fill="[^"]*" stroke="#000" stroke-width="0\.3"/g) || []).length;
  assert.equal(bars(svg), 12, 'only the bar series draws bars');
  assert.equal((svg.match(/<polyline points=/g) || []).length, 1, 'the line series draws one polyline');
  assert.ok(svg.includes('>Temperature (°C)<') && svg.includes('>Rainfall (mm)<'), 'both axis titles');
  const q = G.renderSVG(Object.assign(s, { hidden: ['yTicks'] }), { version: 'question' }); s.hidden = [];
  assert.ok(!/<text[^>]*text-anchor="start"[^>]*>\d+<\/text>/.test(q), 'hiding y numbers hides the right-hand ones too');
  s.hidden = ['series:1']; const hq = G.renderSVG(s, { version: 'question' });
  assert.equal((hq.match(/<polyline points=/g) || []).length, 0); assert.equal(bars(hq), 12);
  s.hidden = ['pt:1:3']; assert.equal((G.renderSVG(s, { version: 'question' }).match(/<polyline points=/g) || []).length, 2, 'a hidden point breaks the line');
  s.hidden = []; const clip = v => /<clipPath[^>]*><rect ([^>]*)\/>/.exec(v)[1];
  const w0 = +/width="([\d.]+)"/.exec(clip(svg))[1]; s.series[1].axis = 'left'; s.series[1].draw = 'bar';
  const plain2 = G.renderSVG(s); assert.ok(+/width="([\d.]+)"/.exec(clip(plain2))[1] > w0, 'without a right axis the plot is wider');
  assert.equal(G.analyse(s).ay2, null);
  s.series[1].draw = 'line';                                        // a line on the left axis is fine too
  assert.ok(!/NaN|undefined/.test(G.renderSVG(s)) && (G.renderSVG(s).match(/<polyline points=/g) || []).length === 1);
  s.series[1].axis = 'right'; s.series[1].draw = 'bar';             // two bar series, one per axis
  const two = G.renderSVG(s); assert.equal(bars(two), 24); assert.ok(!/NaN|undefined/.test(two));
});

test('combo graph: legend, readability, snapping, variants and every style use the right axis', () => {
  const s = G.PRESETS.find(p => p.id === 'climatograph').build();
  const legend = G.renderSVG(s);
  assert.ok(/<line [^>]*stroke="#000"[^>]*\/>/.test(legend) && legend.includes('>Rainfall<') && legend.includes('>Temperature<'));
  s.rows[0].ys[1] = 4.3; s.y2.step = 2; s.y2.min = 0; s.y2.max = 24; s.y2.minorPerMajor = 1;
  const r = G.readability(s).filter(q => q.j === 1); assert.ok(r.some(q => q.r === 0 && q.value === 4.3), 'judged against the right axis grid (step 2)');
  assert.ok(G.snapValues(s) >= 1); assert.equal(s.rows[0].ys[1] % 2, 0, 'snapped to the right axis gridlines');
  const v = G.makeVariant(s, 3, 1);
  v.rows.forEach((row, i) => { assert.equal(row.ys[1] % 2, 0, 'right-axis values stay on its grid'); assert.ok(row.ys[1] >= 0 && row.ys[1] <= 24); });
  assert.ok(v.y2.min === 0 && v.y2.max === 24 && v.y2.step === 2, 'right axis pinned');
  for (const opt of [{ colour: true }, { largePrint: true }, { photocopySafe: true }]) for (const version of ['key', 'question']) {
    const z = G.PRESETS.find(p => p.id === 'climatograph').build(); Object.assign(z.style, opt); z.errorBars = { mode: 'percent', value: 10 };
    z.hidden = version === 'question' ? [...G.SCAFFOLD.axes] : [];
    assert.ok(!/NaN|undefined/.test(G.renderSVG(z, { version, ghost: true, hits: true, flags: new Set(['1:2']), geom: {} })), JSON.stringify(opt));
  }
  const n = G.normalize({ series: [{ draw: 'zzz', axis: 'up' }] }); assert.equal(n.series[0].draw, 'bar'); assert.equal(n.series[0].axis, 'left');
  assert.equal(G.serialize(G.parseFile(G.serialize(s))), G.serialize(s));
});
