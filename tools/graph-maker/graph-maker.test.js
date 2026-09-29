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
  computeAxes, textW, HW, crc32, pngWithDpi, sizeMM, mmToPx, parseNum, cellFromText, TYPES, MAX_SERIES, MAX_ROWS })`, {});

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
  assert.equal(G.normalize(null).specVersion, 1);
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
  assert.equal(JSON.parse(text1).specVersion, 1);
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
  const bars = svg => (svg.match(/<rect [^>]*stroke="#000" stroke-width="\.3"/g) || []).length;
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
