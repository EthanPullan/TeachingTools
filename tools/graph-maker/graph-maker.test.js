// Unit tests for the Graph Maker core (the <script id="core"> block in index.html).
// Run:  node --test tools/graph-maker/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const core = /<script id="core">([\s\S]*?)<\/script>/.exec(html)[1];
const G = vm.runInNewContext(core + `;({ niceStep, niceCeil, niceRange, resolveAxis, ticks, fmtTick, normalize, blankSpec, sampleSpec,
  serialize, parseFile, migrate, parseTSV, pasteGrid, importGrid, dropIndex, scaffoldLevel, SCAFFOLD, renderSVG, analyse,
  computeAxes, textW, HW, crc32, readability, snapValues, svgSize, fmtTick, SCAFFOLD_V1, pngWithDpi, sizeMM, mmToPx, parseNum, cellFromText, TYPES, MAX_SERIES, MAX_ROWS })`, {});

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
  assert.equal(G.normalize(null).specVersion, 2);
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
  assert.equal(JSON.parse(text1).specVersion, 2);
  for (const type of G.TYPES) {
    const t = G.sampleSpec(); t.type = type; t.quadrants = 1;
    const a = G.serialize(t);
    assert.equal(G.serialize(G.parseFile(a)), a);
    assert.equal(G.renderSVG(G.parseFile(a)), G.renderSVG(t));   // identical graph, not just identical JSON
  }
});

test('files from the future or from elsewhere are rejected clearly', () => {
  assert.throws(() => G.parseFile('{"specVersion":99}'), /newer version/);
  assert.throws(() => G.parseFile('{"hello":1}'), /not a Graph Maker/);
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
    assert.equal(s.specVersion, 2);
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
