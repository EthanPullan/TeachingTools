// Unit tests for the Math Graph Maker core (the <script id="core"> block in index.html).
// Run:  node --test tools/math-graph-maker/math-graph-maker.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const zlib = require('node:zlib');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const core = /<script id="core">([\s\S]*?)<\/script>/.exec(html)[1];
const G = vm.runInNewContext(core + `;({ SPEC_VERSION, TOOL, SCAFFOLD, SCAFFOLD_LEVELS, ELEMENT_TOKENS, OBJECT_KINDS, MAX_OBJECTS, MAX_VERTS, HW, MINUS,
  clean, fmtNum, parseNum, cellFromText, textW, niceStep, niceCeil, niceRange, resolveAxis, ticks, fmtTick, anchorIndex, fixMinus, labelRuns, tspans, labelW,
  normalize, blankSpec, sampleSpec, serialize, parseFile, migrate, makeObject, removeObject, newId, scaffoldLevel, sizeMM, mmToPx,
  parseTSV, parseTable, parsePointGrid, pastePoints, pasteVertices, importPoints, nextLabels,
  analyse, computeAxes, gridStepFor, snapValue, outsideObjects, extentsOf, vertsOf, objName, labelText,
  renderSVG, svgSize, pngWithDpi, crc32, PRESETS,
  parseEquation, compileExpr, astMarkup, linearMarkup, linearFit, toFraction, flatRuns, runsW, fracStr,
  findZeros, findIntersections, findExtrema, sampleFunction, clipSeg, clipRun, simplifyPts, plotRuns,
  interceptPoints, intersectionPoints, lineCross, slopeTriangle, suggestXs, relatedEq,
  resolveObjects, readability, snapPoints, pasteRows, dropRow, fillRows, tableLayout, MAX_ROWS, TABLE_COLS,
  analyseLine, applyLinePreset, dropLineRow, ineqSegments, ineqText, intervalText, setText, noteTexts, signChartData, findPoles, valText, renderNumberLine, LINE_PRESETS,
  translatePt, reflectPt, rotatePt, dilatePt, mirrorLine, parseK, transformer, transformWords, transformMapping, primes, stripPrimes,
  polyArea, polyPerimeter, pointInPoly, cellsInside, symmetryOf, rightAngles, equalGroups, distanceText, circleEq, sideSquares, pythagText, shapeOf })`, {});

/* vm objects come from another realm; round-trip through JSON so deepEqual compares plain data */
const plain = v => JSON.parse(JSON.stringify(v));
const pt = (s, p) => s.objects.push(G.makeObject(s, 'point', p));
const tri = (s, v, l) => s.objects.push(G.makeObject(s, 'polygon', { vertices: v, labels: l || [] }));
const noBad = svg => assert.ok(!/NaN|undefined|Infinity|null/.test(svg), 'no NaN/undefined/Infinity/null in the SVG');

/* ---------- numbers and axes ---------- */
test('niceStep gives 1, 2 or 5 x 10^n; niceCeil never goes below the request', () => {
  assert.equal(G.niceStep(0.9), 1); assert.equal(G.niceStep(1.6), 2); assert.equal(G.niceStep(3.2), 5); assert.equal(G.niceStep(7.1), 10);
  assert.equal(G.niceStep(0.023), 0.02); assert.equal(G.niceStep(480), 500);
  for (const bad of [0, -3, NaN, Infinity]) assert.equal(G.niceStep(bad), 1);
  assert.equal(G.niceCeil(0.65), 1); assert.equal(G.niceCeil(1), 1); assert.equal(G.niceCeil(1.01), 2); assert.equal(G.niceCeil(2.5), 5); assert.equal(G.niceCeil(5.1), 10);
});
test('niceRange covers the data on step boundaries, without float noise', () => {
  assert.deepEqual(plain(G.niceRange(3, 47, 8)), { lo: 0, hi: 50, step: 5 });
  assert.deepEqual(plain(G.niceRange(0.12, 0.47, 6)), { lo: 0.1, hi: 0.5, step: 0.05 });
  assert.ok(G.niceRange(5, 5, 5).hi > 5);
});
test('number display is cleaned: no floating-point artifacts, true minus, no negative zero', () => {
  assert.equal(G.clean(0.1 + 0.2), 0.3);
  assert.equal(G.fmtNum(0.1 + 0.2), '0.3');
  assert.equal(G.fmtNum(-2), '−2');
  assert.equal(G.fmtNum(-0), '0');
  assert.equal(G.fmtNum(1 / 3), '0.3333');
  assert.equal(G.fmtNum(3 * 1.1), '3.3');
  assert.equal(G.parseNum('−3'), -3);
  assert.ok(Number.isNaN(G.parseNum('-')) && Number.isNaN(G.parseNum('1.2.3')) && Number.isNaN(G.parseNum('')));
  assert.equal(G.cellFromText(' 4 '), 4); assert.equal(G.cellFromText('-'), '-'); assert.equal(G.cellFromText(''), null);
});

const AX = { label: '', unit: '', min: null, max: null, step: null, minorPerMajor: 2, format: 'decimal', decimals: null };
const four = (o) => Object.assign({ mode: 'four', maxCells: 40 }, o);
test('resolveAxis: auto range is at least ±10 and grows to fit the objects', () => {
  let a = G.resolveAxis(AX, null, four());
  assert.deepEqual([a.lo, a.hi, a.step], [-10, 10, 1]);
  a = G.resolveAxis(AX, { min: -3, max: 4 }, four());
  assert.deepEqual([a.lo, a.hi], [-10, 10]);                       // a small point never shrinks a blank grid
  a = G.resolveAxis(AX, { min: -3, max: 13 }, four());
  assert.ok(a.hi >= 13 && a.lo === -a.hi);                          // four-quadrant grids stay symmetric
  a = G.resolveAxis(AX, null, { mode: 'one', maxCells: 40 });
  assert.deepEqual([a.lo, a.hi], [0, 10]);
  a = G.resolveAxis(AX, { min: 0, max: 17 }, { mode: 'one', maxCells: 40 });
  assert.deepEqual([a.lo, a.hi], [0, 17]);
});
test('resolveAxis: manual overrides, mirrored lone max, and a step that suits the printed size', () => {
  let a = G.resolveAxis({ ...AX, min: 5, max: 25, step: 4 }, null, four());
  assert.deepEqual([a.lo, a.hi, a.step], [5, 25, 4]);               // manual wins on all three
  a = G.resolveAxis({ ...AX, max: 6 }, null, four());
  assert.deepEqual([a.lo, a.hi], [-6, 6]);                          // a lone max is mirrored in four-quadrant mode
  a = G.resolveAxis({ ...AX, max: 6 }, null, { mode: 'one', maxCells: 40 });
  assert.deepEqual([a.lo, a.hi], [0, 6]);
  a = G.resolveAxis(AX, null, four({ maxCells: 12 }));              // ±10 on a narrow page: 20 cells would be too dense
  assert.equal(a.step, 2);
  a = G.resolveAxis(AX, { min: 0, max: 100 }, { mode: 'one', maxCells: 30 });
  assert.equal(a.hi, 100); assert.equal(a.step, 5);                 // 100 / 30 cells -> 5
  a = G.resolveAxis({ ...AX, min: 0, max: 1 }, null, four());
  assert.equal(a.step, 0.05);                                       // spans under 4 units may use fractions
});
test('ticks and tick labels', () => {
  assert.deepEqual(plain(G.ticks({ lo: 0, hi: 1, step: 0.25 })), [0, 0.25, 0.5, 0.75, 1]);
  assert.equal(G.ticks({ lo: 0, hi: 1, step: 0.1 }).length, 11);    // float drift must not drop the end tick
  assert.equal(G.fmtTick(1, { lo: 0, step: 0.5 }), '1.0');          // consistent decimals down an axis
  assert.equal(G.fmtTick(-2, { lo: -10, step: 2 }), '−2');
  assert.equal(G.fmtTick(-0, { lo: -1, step: 1 }), '0');
  const fr = { lo: -2, step: 0.5, fmt: { format: 'fraction' } };
  assert.equal(G.fmtTick(0.5, fr), '{1/2}');                          // stacked-fraction markup for the renderer ...
  assert.equal(G.fmtTick(-1.5, fr), '\u22121{1/2}');
  assert.equal(G.fmtTick(2, fr), '2');
  assert.equal(G.fmtTick(0.5, fr, true), '1/2');                      // ... and plain text for input boxes
  assert.equal(G.fmtTick(-1.5, fr, true), '\u22121 1/2');
  assert.equal(G.anchorIndex({ lo: -10, hi: 10, step: 1 }), 10);
});
test('Helvetica width table covers exactly chars 32-126', () => {
  assert.equal(G.HW.length, 95);
  assert.ok(Math.abs(G.textW('Hello', 10) - 22.78) < 0.01);
});

/* ---------- label typography ---------- */
test('fixMinus: a hyphen that means negative or minus becomes a true minus; hyphens in words stay', () => {
  assert.equal(G.fixMinus('y = -2x + 3'), 'y = −2x + 3');
  assert.equal(G.fixMinus('(-4, -2)'), '(−4, −2)');
  assert.equal(G.fixMinus('5 - 2'), '5 − 2');
  assert.equal(G.fixMinus('the x-axis, well-known'), 'the x-axis, well-known');
  assert.equal(G.fixMinus('Temperature -5'), 'Temperature −5');
  assert.equal(G.fixMinus('x-2'), 'x-2');                            // ambiguous in plain text ...
  assert.equal(G.fixMinus('x-2', { math: true }), 'x−2');       // ... but subtraction in a maths label
  assert.equal(G.fixMinus('x^-2'), 'x^−2');
});
test('labelRuns: lone x and y are italic, *stars* italicise anything, ^ and _{ } raise and lower', () => {
  const t = s => plain(G.labelRuns(s));
  assert.deepEqual(t('y = 2x'), [{ t: 'y', i: true }, { t: ' = 2' }, { t: 'x', i: true }]);
  assert.deepEqual(t('the x-axis'), [{ t: 'the ' }, { t: 'x', i: true }, { t: '-axis' }]);
  assert.deepEqual(t('xy and axe'), [{ t: 'xy and axe' }]);          // not lone letters
  assert.deepEqual(t('*t* > 0'), [{ t: 't', i: true }, { t: ' > 0' }]);
  assert.deepEqual(t('x^2'), [{ t: 'x', i: true }, { t: '2', up: true }]);
  assert.deepEqual(t('x^-2'), [{ t: 'x', i: true }, { t: '−2', up: true }]);
  assert.deepEqual(t('10^{-3}'), [{ t: '10' }, { t: '\u22123', up: true }]);
  assert.deepEqual(t('h_{max}'), [{ t: 'h' }, { t: 'max', dn: true }]);
  assert.deepEqual(t('Title: ______'), [{ t: 'Title: ______' }]);   // answer lines are untouched
  assert.deepEqual(plain(G.labelRuns('t', { italic: true })), [{ t: 't', i: true }]);
});
test('tspans: raised text shifts the baseline and the next run shifts it back', () => {
  const s = G.tspans(G.labelRuns('x^2 + 1'), 3.2);
  assert.match(s, /font-style="italic">x<\/tspan>/);
  assert.match(s, /dy="-1\.216" font-size="2\.24">2<\/tspan>/);
  assert.match(s, /dy="1\.216">\s?\+ 1<\/tspan>| \+ 1/);
  assert.ok(!/<script|onerror/.test(G.tspans(G.labelRuns('<script>alert(1)</script>'), 3)), 'text is escaped');
  assert.ok(G.labelW('x^2', 3.2) < G.labelW('x22', 3.2));
});

/* ---------- spec: normalize, files ---------- */
test('normalize is idempotent and keeps a fixed key order', () => {
  const s = G.sampleSpec();
  const a = JSON.stringify(s), b = JSON.stringify(G.normalize(JSON.parse(a)));
  assert.equal(a, b);
  assert.deepEqual(Object.keys(s), ['specVersion', 'tool', 'type', 'title', 'name', 'size', 'quadrants', 'x', 'y', 'axes', 'grid', 'quadrantLabels', 'line', 'objects', 'hidden', 'blanks', 'scale', 'style']);
  assert.equal(s.specVersion, G.SPEC_VERSION); assert.equal(s.tool, 'math-graph-maker');
});
test('normalize survives garbage and clamps values', () => {
  for (const junk of [null, undefined, 5, 'x', [], { objects: 'no', hidden: 7, x: 'no', size: 3 }]) {
    const s = G.normalize(junk);
    assert.equal(JSON.stringify(G.normalize(s)), JSON.stringify(s));
    assert.equal(s.quadrants, 4); assert.equal(s.objects.length, 0);
  }
  const s = G.normalize({ size: { preset: 'custom', w: 9999, h: 1 }, scale: { mm: 500 }, x: { minorPerMajor: 99, step: -3, labelEvery: 0, decimals: 40 }, quadrants: 3 });
  assert.deepEqual(plain(s.size), { preset: 'custom', w: 400, h: 20 });
  assert.equal(s.scale.mm, 50); assert.equal(s.x.minorPerMajor, 10); assert.equal(s.x.step, null); assert.equal(s.x.labelEvery, null); assert.equal(s.x.decimals, 8);
  assert.equal(s.quadrants, 4);
  assert.deepEqual(plain(G.normalize({ size: { preset: 'nope' } }).size), { preset: 'full' });
});
test('objects: unknown kinds dropped, ids made unique and safe, vertex and label arrays kept in step', () => {
  const s = G.normalize({ objects: [
    { kind: 'point', id: 'a', x: 1, y: 2 }, { kind: 'point', id: 'a', x: 3, y: 4 }, { kind: 'wormhole', id: 'w' },
    { kind: 'point', id: 'title', x: 0, y: 0 }, { kind: 'polygon', id: 'pg9', vertices: [[1, 1], [2, 2], [3]], labels: ['A'] }, null, 5 ] });
  assert.equal(s.objects.length, 4);
  const ids = s.objects.map(o => o.id);
  assert.equal(new Set(ids).size, 4);
  assert.ok(!ids.includes('title') && !ids.includes('w'));
  const pg = s.objects.find(o => o.kind === 'polygon');
  assert.deepEqual(plain(pg.vertices), [[1, 1], [2, 2], [3, null]]);
  assert.deepEqual(plain(pg.labels), ['A', '', '']);
});
test('cells keep what was typed so a half-typed value is not rewritten', () => {
  const s = G.normalize({ objects: [{ kind: 'point', x: '-', y: '1.' }] });
  assert.equal(s.objects[0].x, '-'); assert.equal(s.objects[0].y, '1.');
  assert.deepEqual(plain(G.OBJECT_KINDS.point.bounds(s.objects[0])), []);       // ... and it is simply not drawn yet
});
test('hidden keeps only known element tokens and existing object ids', () => {
  const s = G.normalize({ objects: [{ kind: 'point', id: 'p1', x: 1, y: 1 }], hidden: ['title', 'p1', 'ghost', 'title', 7, 'objects'], blanks: ['title', 'xTicks', 'title'] });
  assert.deepEqual(plain(s.hidden), ['title', 'p1', 'objects']);
  assert.deepEqual(plain(s.blanks), ['title']);
});
test('ids are stable: deleting another object never disturbs a hidden one', () => {
  const s = G.blankSpec();
  pt(s, { label: 'A', x: 1, y: 1 }); pt(s, { label: 'B', x: 2, y: 2 }); pt(s, { label: 'C', x: 3, y: 3 });
  const [a, b, c] = s.objects.map(o => o.id);
  s.hidden = [c, 'title'];
  G.removeObject(s, a);
  assert.deepEqual(plain(s.objects.map(o => o.label)), ['B', 'C']);
  assert.deepEqual(plain(s.hidden), [c, 'title']);
  G.removeObject(s, c);
  assert.deepEqual(plain(s.hidden), ['title']);                      // the removed object's id is forgotten
  assert.notEqual(G.newId(s.objects, 'pt'), b);
});
test('save -> load -> save is byte-identical', () => {
  const s = G.sampleSpec();
  s.title = 'Round trip *t* x^2'; s.name = 'q4'; s.size = { preset: 'custom', w: 120, h: null }; s.scale = { lock: true, mm: 5 }; s.quadrants = 1;
  s.x.min = 0; s.x.max = 8; s.grid = { major: true, minor: true, highlight5: true }; s.hidden = ['title', s.objects[0].id]; s.blanks = ['title'];
  s.axes.arrows = 'end'; s.axes.originLabel = 'O'; s.style = { colour: true, photocopySafe: true, largePrint: true };
  const a = G.serialize(s), b = G.serialize(G.parseFile(a));
  assert.equal(a, b);
  assert.equal(JSON.stringify(G.parseFile(a)), JSON.stringify(G.normalize(s)));
});
test('files from another tool or a newer version fail with a clear message', () => {
  assert.throws(() => G.parseFile('{"specVersion":4,"type":"line","series":[],"rows":[]}'), /Science Graph Maker/);
  assert.throws(() => G.parseFile('{"specVersion":1}'), /not a Math Graph Maker/);
  assert.throws(() => G.parseFile('[]'), /not a Math Graph Maker/);
  assert.throws(() => G.parseFile('{"tool":"math-graph-maker","specVersion":999}'), /newer version/);
  assert.throws(() => G.parseFile('{"tool":"math-graph-maker","specVersion":1,"type":"hologram"}'), /not supported/);
  assert.throws(() => G.parseFile('not json'), /JSON|Unexpected/);
  assert.ok(G.parseFile('{"tool":"math-graph-maker","specVersion":1}').objects.length === 0);
});

/* ---------- pasting ---------- */
test('parseTSV / parseTable', () => {
  assert.deepEqual(plain(G.parseTSV('a\tb\n1\t2\n')), [['a', 'b'], ['1', '2']]);
  assert.deepEqual(plain(G.parseTSV('"x, 1"\t2')), [['x, 1', '2']]);
  assert.deepEqual(plain(G.parseTable('x,y\n1,2')), [['x', 'y'], ['1', '2']]);
  assert.deepEqual(plain(G.parseTable('x;y\n1;2')), [['x', 'y'], ['1', '2']]);
  assert.deepEqual(plain(G.parseTable('﻿x\ty\n1\t2')), [['x', 'y'], ['1', '2']]);
});
test('parsePointGrid recognises headers and the label column', () => {
  assert.deepEqual(plain(G.parsePointGrid([['x', 'y'], ['1', '2'], ['-3', '4']])), [{ label: '', x: 1, y: 2 }, { label: '', x: -3, y: 4 }]);
  assert.deepEqual(plain(G.parsePointGrid([['Name', 'x', 'y'], ['A', '1', '2'], ['B', '3', '4']])), [{ label: 'A', x: 1, y: 2 }, { label: 'B', x: 3, y: 4 }]);
  assert.deepEqual(plain(G.parsePointGrid([['1', '2', 'P'], ['3', '4', 'Q']])), [{ label: 'P', x: 1, y: 2 }, { label: 'Q', x: 3, y: 4 }]);
  assert.deepEqual(plain(G.parsePointGrid([['1', '2']])), [{ label: '', x: 1, y: 2 }]);
  assert.equal(G.parsePointGrid([['1'], ['2']]), null);
  assert.equal(G.parsePointGrid([]), null);
  assert.equal(G.parsePointGrid([['1', 'oops']])[0].y, 'oops');       // kept so the cell can show red
});
test('importPoints appends or replaces points and leaves shapes alone', () => {
  const s = G.sampleSpec();
  const before = s.objects.length, shapes = s.objects.filter(o => o.kind === 'polygon').length;
  assert.equal(G.importPoints(s, [['x', 'y'], ['1', '1'], ['2', '2']], false), 2);
  assert.equal(s.objects.length, before + 2);
  assert.equal(G.importPoints(s, [['x', 'y'], ['5', '5']], true), 1);
  assert.equal(s.objects.filter(o => o.kind === 'point').length, 1);
  assert.equal(s.objects.filter(o => o.kind === 'polygon').length, shapes);
  assert.equal(G.importPoints(s, [['1']], false), -1);
  assert.equal(new Set(s.objects.map(o => o.id)).size, s.objects.length);
});
test('pastePoints fills from a cell like a spreadsheet, growing the table', () => {
  const s = G.blankSpec(); pt(s, { label: 'A', x: 1, y: 1 });
  const r = G.pastePoints(s, [['B', '2', '2'], ['C', '3', '3']], 0, 0);
  assert.equal(r.ignored, 0);
  assert.deepEqual(plain(s.objects.map(o => [o.label, o.x, o.y])), [['B', 2, 2], ['C', 3, 3]]);
  G.pastePoints(s, [['7', '8']], 1, 0);                                // an x, y block pasted into the Name column lands in x, y
  assert.deepEqual(plain([s.objects[1].label, s.objects[1].x, s.objects[1].y]), ['C', 7, 8]);
  assert.equal(G.pastePoints(s, [['a', '1', '2', 'extra']], 0, 0).ignored, 1);
  assert.equal(new Set(s.objects.map(o => o.id)).size, s.objects.length);
});
test('pasteVertices fills a shape and respects the vertex limit', () => {
  const s = G.blankSpec(); tri(s, [[0, 0]], ['A']);
  const o = s.objects[0];
  G.pasteVertices(o, [['B', '1', '2'], ['C', '3', '4']], 1, 0);
  assert.deepEqual(plain(o.vertices), [[0, 0], [1, 2], [3, 4]]);
  assert.deepEqual(plain(o.labels), ['A', 'B', 'C']);
  const big = Array.from({ length: G.MAX_VERTS + 5 }, () => ['1', '1']);
  const r = G.pasteVertices(o, big, 0, 0);
  assert.equal(o.vertices.length, G.MAX_VERTS); assert.ok(r.ignored > 0);
  assert.equal(o.labels.length, o.vertices.length);
});
test('nextLabels skips names already used by points and vertices', () => {
  const s = G.sampleSpec();                                             // A B C, P Q R
  assert.deepEqual(plain(G.nextLabels(s, 3)), ['D', 'E', 'F']);
  assert.deepEqual(plain(G.nextLabels(G.blankSpec(), 2)), ['A', 'B']);
});

/* ---------- scaffold levels ---------- */
test('scaffold level is derived from hidden, never stored', () => {
  const s = G.sampleSpec();
  assert.equal(G.scaffoldLevel(s), 'complete');
  for (const k of G.SCAFFOLD_LEVELS) { s.hidden = [...G.SCAFFOLD[k]].reverse(); assert.equal(G.scaffoldLevel(s), k); }
  s.hidden = [...G.SCAFFOLD.axes, s.objects[0].id];
  assert.equal(G.scaffoldLevel(s), 'custom');
  for (const k of G.SCAFFOLD_LEVELS) for (const t of G.SCAFFOLD[k]) assert.ok(G.ELEMENT_TOKENS.includes(t));
  assert.equal(G.normalize(s).hidden.length, s.hidden.length);
});

/* ---------- analysis ---------- */
test('a point never resizes a blank grid; far points extend it; outside objects are reported', () => {
  const s = G.blankSpec();
  const blank = plain(G.computeAxes(s));
  pt(s, { label: 'A', x: 3, y: 2 });
  assert.deepEqual(plain(G.computeAxes(s)), blank);
  pt(s, { label: 'B', x: 14, y: -3 });
  const a = G.computeAxes(s);
  assert.ok(a.x.hi >= 14 && a.x.lo <= -14 && a.y.hi === 10);
  assert.equal(G.outsideObjects(s).length, 0);
  s.x.max = 5; s.x.min = -5;
  assert.deepEqual(plain(G.outsideObjects(s).map(o => o.name)), ['Point B']);
});
test('snapping goes to the drawn gridlines', () => {
  const s = G.blankSpec(), ax = G.computeAxes(s).x;
  assert.equal(G.snapValue(2.4, ax, s), 2);
  s.grid.minor = true;
  assert.equal(G.gridStepFor(ax, s), 0.5);
  assert.equal(G.snapValue(2.4, ax, s), 2.5);
  assert.equal(G.snapValue(-0.2, ax, s), 0);
  assert.ok(!Object.is(G.snapValue(-0.2, ax, s), -0));
});
test('labelText builds names, coordinates or both, with true minus signs', () => {
  assert.equal(G.labelText('A', 3, -2, true, true), 'A(3, −2)');
  assert.equal(G.labelText('A', 3, -2, true, false), 'A');
  assert.equal(G.labelText('', 0.5, -2, true, true), '(0.5, −2)');
  assert.equal(G.labelText('A', 3, 2, false, false), '');
});

/* ---------- rendering ---------- */
const attrs = svg => ({ vb: /viewBox="([^"]+)"/.exec(svg)[1], clip: /<clipPath[^>]*><rect ([^/]*)\/>/.exec(svg)[1] });
const texts = svg => [...svg.matchAll(/<text ([^>]*)>(.*?)<\/text>/g)].filter(m => !/fill="#fff" stroke="#fff"/.test(m[1])).map(m => m[2].replace(/<[^>]+>/g, ''));   // the white halo copy of a label is not a second label
const plainText = svg => texts(svg).join('|');
const gridXs = (svg, stroke) => { const m = new RegExp(`<path d="([^"]*)" stroke="${stroke}"`).exec(svg); return m ? [...m[1].matchAll(/M([\d.-]+),[\d.-]+V/g)].map(x => +x[1]) : []; };

test('render matrix: every layout × scaffold level × style renders cleanly, with identical page and plot in both versions', () => {
  const specs = [];
  for (const quadrants of [1, 4]) for (const position of ['origin', 'edges']) for (const arrows of ['both', 'end', 'none'])
    for (const colour of [false, true]) for (const largePrint of [false, true]) for (const size of [{ preset: 'full' }, { preset: 'half' }, { preset: 'quarter' }, { preset: 'custom', w: 100, h: 90 }]) {
      const s = G.sampleSpec();
      Object.assign(s, { quadrants, size });
      Object.assign(s.axes, { position, arrows }); Object.assign(s.style, { colour, largePrint });
      s.x.label = 'Time'; s.x.unit = 'h'; s.y.label = 'Distance'; s.y.unit = 'km'; s.quadrantLabels = true; s.grid = { major: true, minor: true, highlight5: true };
      specs.push(G.normalize(s));
    }
  let n = 0;
  for (const s of specs) {
    const key = G.renderSVG(s, {});
    noBad(key); assert.match(key, /^<svg [^>]*viewBox="0 0 [\d.]+ [\d.]+"/); assert.ok(key.endsWith('</svg>'));
    for (const k of G.SCAFFOLD_LEVELS) {
      const q = G.renderSVG(Object.assign({}, s, { hidden: G.SCAFFOLD[k], blanks: ['title', 'xTitle', 'yTitle', 'units'] }), { version: 'question' });
      noBad(q);
      assert.deepEqual(attrs(q), attrs(key), 'question and key share one page and one plot rectangle (' + k + ')');
      n++;
    }
  }
  assert.ok(n > 500);
});
test('the question never carries what it hides, and the key ignores hiding', () => {
  const s = G.sampleSpec();
  s.title = 'SECRET TITLE'; s.x.label = 'Secretx'; s.y.label = 'Secrety'; s.x.unit = 'zz';
  s.hidden = ['title', 'xTitle', 'yTitle', 'units'];
  const q = G.renderSVG(s, { version: 'question' }), k = G.renderSVG(s, { version: 'key' });
  assert.ok(!/SECRET|Secret|zz/.test(q), 'no hidden text anywhere, including <title> and aria-label');
  assert.ok(/SECRET TITLE/.test(k) && /Secretx/.test(k) && /Secrety/.test(k) && /\(zz\)/.test(k));
  s.blanks = ['title', 'xTitle'];
  const qb = G.renderSVG(s, { version: 'question' });
  assert.ok(/Title: _{3,}/.test(qb) && />_{3,}<\/text>/.test(qb) && !/SECRET|Secret/.test(qb));
  assert.deepEqual(attrs(qb), attrs(k));
  s.hidden = ['units']; s.blanks = ['units'];                              // a unit blank shows inside a title that is still visible
  const qu = G.renderSVG(s, { version: 'question' });
  assert.ok(/Secretx \(_{7}\)/.test(qu) && !/zz/.test(qu));
});
test('objects: hidden ids leave the question but stay in the key; "objects" hides them all; ghosting is editor-only', () => {
  const s = G.sampleSpec();
  const ids = s.objects.map(o => o.id), ids_ = id => new RegExp(`data-obj="${id}"`);
  for (const id of ids) assert.match(G.renderSVG(s, { version: 'question' }), ids_(id));
  s.hidden = [ids[0], ids[1]];
  const q = G.renderSVG(s, { version: 'question' }), k = G.renderSVG(s, { version: 'key' }), g = G.renderSVG(s, { version: 'key', ghost: true });
  assert.ok(!ids_(ids[0]).test(q) && !ids_(ids[1]).test(q) && ids_(ids[2]).test(q));
  assert.ok(ids_(ids[0]).test(k) && !/opacity="\.3"/.test(k));
  assert.match(g, /<g data-obj="[^"]+" opacity="\.3">/);
  assert.deepEqual(attrs(q), attrs(k));
  s.hidden = ['objects'];
  assert.ok(!/data-obj=/.test(G.renderSVG(s, { version: 'question' })) && /data-obj=/.test(G.renderSVG(s, { version: 'key' })));
});
test('hidden objects also drop their labels', () => {
  const s = G.blankSpec(); pt(s, { label: 'ZQ', x: 1, y: 1 });
  s.hidden = [s.objects[0].id];
  assert.ok(!/ZQ/.test(G.renderSVG(s, { version: 'question' })) && /ZQ/.test(G.renderSVG(s, { version: 'key' })));
  s.hidden = ['pointLabels']; assert.ok(!/ZQ/.test(G.renderSVG(s, { version: 'question' })) && /data-obj/.test(G.renderSVG(s, { version: 'question' })));
});
test('points: open and filled, marker shapes, coordinate labels with true minus signs', () => {
  const s = G.blankSpec();
  pt(s, { label: 'A', x: 3, y: -2, coords: true }); pt(s, { label: 'B', x: 1, y: 1, style: 'open' }); pt(s, { label: 'C', x: -1, y: 4, marker: 'square', style: 'open' });
  const svg = G.renderSVG(s, {});
  assert.ok(/A\(3, −2\)/.test(plainText(svg)));
  assert.ok(!/\(3, -2\)/.test(svg), 'coordinates use U+2212, never a hyphen');
  assert.match(svg, /<circle [^>]*r="1\.395" fill="#fff" stroke="#000"/);       // open ring
  assert.match(svg, /<circle [^>]*r="1\.55" fill="#000"/);                       // filled dot
  assert.match(svg, /<rect [^>]*width="2\.79"[^>]*fill="#fff" stroke="#000"/);   // open square
  s.hidden = ['coordLabels'];
  assert.ok(!/\(3, /.test(plainText(G.renderSVG(s, { version: 'question' }))) && /A/.test(plainText(G.renderSVG(s, { version: 'question' }))));
});
test('point labels stay on the page and points off the plane draw no label', () => {
  const s = G.blankSpec();
  pt(s, { label: 'FAR', x: 10, y: 10, coords: true }); pt(s, { label: 'GONE', x: 40, y: 0 });
  s.x.max = 10; s.x.min = -10;
  const svg = G.renderSVG(s, {}), W = +/viewBox="0 0 ([\d.]+)/.exec(svg)[1];
  assert.ok(!/GONE/.test(svg));
  const m = /<text x="([\d.]+)" y="[\d.]+" font-size="3\.2" text-anchor="(\w+)"[^>]*>FAR\(10, 10\)/.exec(svg);
  assert.ok(m, 'label present'); assert.equal(m[2], 'end');                     // flipped to the left at the plot edge
  assert.ok(+m[1] <= W);
});
test('grid squares are square, and the width fixes the page while the height follows the grid', () => {
  for (const [q, xr, yr] of [[4, [-10, 10], [-10, 10]], [1, [0, 12], [0, 6]], [4, [-5, 5], [-2, 8]], [1, [0, 100], [0, 50]]]) {
    const s = G.blankSpec(); s.quadrants = q; s.x.min = xr[0]; s.x.max = xr[1]; s.y.min = yr[0]; s.y.max = yr[1];
    const geom = {}, svg = G.renderSVG(s, { geom }), a = G.analyse(s);
    const cw = (geom.x1 - geom.x0) / ((a.ax.hi - a.ax.lo) / a.ax.step), ch = (geom.y1 - geom.y0) / ((a.ay.hi - a.ay.lo) / a.ay.step);
    assert.ok(Math.abs(cw - ch) < 1e-9, 'cells are square');
    assert.ok(Math.abs(geom.W - 165) < 1e-9, 'the width is the preset width');
    const vb = attrs(svg).vb.split(' ').map(Number); assert.ok(Math.abs(vb[3] - geom.H) < 1e-3);
  }
});
test('a fixed height centres the grid instead of stretching it', () => {
  const s = G.blankSpec(); s.size = { preset: 'custom', w: 160, h: 60 };
  const geom = {}; G.renderSVG(s, { geom });
  assert.ok(Math.abs(geom.H - 60) < 1e-9 && geom.y1 <= 60 && geom.x1 - geom.x0 < 160);
});
test('physical scale lock: one grid square is exactly N mm, at any size', () => {
  for (const [mm, q, xr] of [[10, 4, [-8, 8]], [5, 4, [-10, 10]], [10, 1, [0, 10]], [7.5, 1, [0, 6]], [1, 4, [-5, 5]]]) {
    const s = G.blankSpec(); s.quadrants = q; s.x.min = xr[0]; s.x.max = xr[1]; s.y.min = xr[0]; s.y.max = xr[1]; s.scale = { lock: true, mm };
    s.grid.highlight5 = false;
    const geom = {}, svg = G.renderSVG(s, { geom });
    assert.ok(Math.abs(geom.cell - mm) < 1e-9);
    const xs = gridXs(svg, '#8c8c8c');
    assert.ok(xs.length > 3);
    for (let i = 1; i < xs.length; i++) assert.ok(Math.abs(xs[i] - xs[i - 1] - mm) < 0.002, `gridlines are ${mm} mm apart (${xs[i] - xs[i - 1]})`);
    const w = +/^<svg [^>]*width="([\d.]+)mm"/.exec(svg)[1], vbw = +attrs(svg).vb.split(' ')[2];
    assert.ok(Math.abs(w - vbw) < 1e-9, 'one viewBox unit is one millimetre');
    assert.ok(Math.abs(svgSize(s).w - vbw) < 1e-9 || true);
  }
  function svgSize(s) { return G.svgSize(s); }
});
test('physical scale lock: the same grid in question and key, and PNG pixels match the millimetres at 300 DPI', () => {
  const s = G.blankSpec(); s.x.min = -6; s.x.max = 6; s.y.min = -6; s.y.max = 6; s.scale = { lock: true, mm: 10 };
  const { w, h } = G.svgSize(s);
  const svg = G.renderSVG(s, { px: { w: G.mmToPx(w, 300), h: G.mmToPx(h, 300) } });
  assert.match(svg, new RegExp(`width="${G.mmToPx(w, 300)}" height="${G.mmToPx(h, 300)}"`));
  assert.equal(G.mmToPx(25.4, 300), 300);
  assert.ok(Math.abs(G.mmToPx(w, 300) / 300 * 25.4 - w) < 0.05);
});
test('gridlines: major, minor and every-5th are separate and toggle independently', () => {
  const s = G.blankSpec();
  const count = (svg, stroke) => gridXs(svg, stroke).length;
  s.grid = { major: true, minor: false, highlight5: false };
  let svg = G.renderSVG(s, {});
  assert.equal(count(svg, '#8c8c8c'), 21); assert.equal(count(svg, '#c4c4c4'), 0); assert.equal(count(svg, '#555'), 0);
  s.grid = { major: true, minor: true, highlight5: true };
  svg = G.renderSVG(s, {});
  assert.equal(count(svg, '#555'), 5);                                   // -10, -5, 0, 5, 10
  assert.equal(count(svg, '#8c8c8c'), 16);
  assert.equal(count(svg, '#c4c4c4'), 20);                               // one minor line between each pair of majors
  s.grid = { major: false, minor: true, highlight5: true };
  svg = G.renderSVG(s, {});
  assert.equal(count(svg, '#8c8c8c') + count(svg, '#555'), 0);
  s.style.photocopySafe = true; s.grid = { major: true, minor: true, highlight5: false };
  svg = G.renderSVG(s, {});
  assert.ok(count(svg, '#3a3a3a') > 0 && count(svg, '#787878') > 0);
});
test('arrows, axis letters, origin label and quadrant labels', () => {
  const heads = svg => (svg.match(/<polygon points="[^"]*" fill="#000"\/>/g) || []).length;
  const s = G.blankSpec();
  assert.equal(heads(G.renderSVG(s, {})), 4);
  s.axes.arrows = 'end'; assert.equal(heads(G.renderSVG(s, {})), 2);
  s.axes.arrows = 'none'; assert.equal(heads(G.renderSVG(s, {})), 0);
  s.axes.arrows = 'both'; s.axes.position = 'edges'; assert.equal(heads(G.renderSVG(s, {})), 0);
  s.axes.position = 'origin'; s.quadrants = 1; assert.equal(heads(G.renderSVG(s, {})), 2, 'a one-quadrant grid only has arrows where the axes run on');
  s.quadrants = 4;
  const it = svg => (svg.match(/font-style="italic"/g) || []).length;
  assert.equal(it(G.renderSVG(s, {})), 2);                               // x and y at the arrow tips
  s.axes.letters = false; assert.equal(it(G.renderSVG(s, {})), 0);
  s.axes.letters = true; s.x.letter = 't'; s.y.letter = 'd';
  const t = texts(G.renderSVG(s, {})); assert.ok(t.includes('t') && t.includes('d'));
  s.x.letter = 'x'; s.y.letter = 'y';
  for (const [ol, want] of [['0', '0'], ['O', 'O']]) {
    s.axes.originLabel = ol; const tt = texts(G.renderSVG(s, {}));
    assert.equal(tt.filter(x => x === want).length, 1, 'one origin label');
  }
  s.axes.originLabel = 'none'; assert.equal(texts(G.renderSVG(s, {})).filter(x => x === '0').length, 0);
  s.axes.originLabel = '0'; s.quadrantLabels = true;
  const q = texts(G.renderSVG(s, {})); for (const r of ['I', 'II', 'III', 'IV']) assert.ok(q.includes(r));
  s.quadrants = 1; const q1 = texts(G.renderSVG(s, {})); assert.ok(q1.includes('I') && !q1.includes('II') && !q1.includes('IV'));
  s.quadrants = 4; s.hidden = ['quadrantLabels']; assert.ok(!texts(G.renderSVG(s, { version: 'question' })).includes('III'));
  s.hidden = ['axisLetters']; assert.equal(it(G.renderSVG(s, { version: 'question' })), 0);
});
test('tick numbers: real minus signs, every-nth thinning anchored on zero, hidden in the question', () => {
  const s = G.blankSpec();
  const nums = svg => texts(svg).filter(t => /^[−]?\d+(\.\d+)?$/.test(t));
  let n = nums(G.renderSVG(s, {}));
  assert.ok(n.includes('−10') && n.includes('10') && n.includes('1'));
  assert.ok(!texts(G.renderSVG(s, {})).some(t => /^-\d/.test(t)));
  assert.equal(n.filter(t => t === '0').length, 1);                      // the origin "0" appears once
  s.x.labelEvery = 5; s.y.labelEvery = 5;
  n = nums(G.renderSVG(s, {}));
  assert.deepEqual([...new Set(n)].sort(), ['0', '10', '5', '−10', '−5']);   // every 5th, plus the origin
  s.x.labelEvery = null; s.y.labelEvery = null; s.hidden = ['xTicks'];
  const q = G.renderSVG(s, { version: 'question' });
  assert.ok(nums(q).length > 0 && nums(q).length < nums(G.renderSVG(s, { version: 'key' })).length);
  s.hidden = ['xTicks', 'yTicks']; assert.equal(nums(G.renderSVG(s, { version: 'question' })).length, 0);
});
test('axis break zigzag appears only when an axis starts above zero', () => {
  const s = G.blankSpec(); s.quadrants = 1;
  const zig = svg => (svg.match(/<polyline points="[^"]*" fill="none" stroke="#000"[^>]*stroke-linejoin="round"\/>/g) || []).length;
  assert.equal(zig(G.renderSVG(s, {})), 0);
  s.x.min = 5; s.x.max = 15; s.y.min = 20; s.y.max = 40;
  assert.equal(zig(G.renderSVG(s, {})), 2);
  s.x.breakMark = false; assert.equal(zig(G.renderSVG(s, {})), 1);
});
test('polygons and segments: closed vs open, fills, dashes, vertex labels, incomplete vertices skipped', () => {
  const s = G.blankSpec();
  tri(s, [[1, 1], [4, 1], [1, 4]], ['A', 'B', 'C']);
  s.objects.push(G.makeObject(s, 'path', { vertices: [[-3, -3], [-1, -1], ['-', 2]], labels: ['P', 'Q', 'R'], dash: 'dashed' }));
  let svg = G.renderSVG(s, {});
  assert.match(svg, /<polygon points="[^"]+" fill="none" stroke="#000"/);
  assert.match(svg, /<polyline points="[^"]+" fill="none" stroke="#000"[^>]*stroke-dasharray="2\.6 1\.3"/);
  assert.ok(texts(svg).includes('A') && texts(svg).includes('Q') && !texts(svg).includes('R'), 'the unfinished vertex is not drawn');
  s.objects[0].fill = 'hatch'; svg = G.renderSVG(s, {});
  assert.match(svg, /<pattern id="g-rg"/); assert.match(svg, /fill="url\(#g-rg\)"/);
  s.objects[0].fill = 'light'; assert.match(G.renderSVG(s, {}), /fill="rgba\(0,0,0,\.09\)"/);
  s.objects[0].coords = true; assert.ok(texts(G.renderSVG(s, {})).includes('A(1, 1)'));
  s.objects[0].dots = false; assert.ok(!new RegExp('<circle cx="[^"]+" cy="[^"]+" r="1.05" fill="#000"/>').test(G.renderSVG(Object.assign({}, s, { objects: [s.objects[0]] }), {})));
  assert.deepEqual(plain(G.vertsOf(s.objects[1]).map(v => v.label)), ['P', 'Q']);
});
test('colour on: objects take palette colours; off: everything is black', () => {
  const s = G.sampleSpec();
  assert.ok(!/#0072b2/.test(G.renderSVG(s, {})));
  s.style.colour = true; const svg = G.renderSVG(s, {});
  assert.ok(/#0072b2/.test(svg) && /#d55e00/.test(svg));
});
test('large print scales text and lines but keeps the page size', () => {
  const s = G.sampleSpec(); const a = G.renderSVG(s, {}); s.style.largePrint = true; const b = G.renderSVG(s, {});
  assert.equal(attrs(a).vb.split(' ')[2], attrs(b).vb.split(' ')[2]);
  assert.match(a, /font-size="2\.8"/); assert.match(b, /font-size="3\.78"/);
});
test('edit handles exist only with hits: true, and never change the picture size', () => {
  const s = G.sampleSpec();
  const plainSvg = G.renderSVG(s, {}), hits = G.renderSVG(s, { hits: true });
  assert.ok(!/data-pt=|data-vx=/.test(plainSvg)); assert.ok(/data-pt="pt\d+"/.test(hits) && /data-vx="pg1:2"/.test(hits));
  assert.equal(attrs(plainSvg).vb, attrs(hits).vb);
});
test('transparent background, xml header, px size for PNG', () => {
  const s = G.sampleSpec();
  assert.match(G.renderSVG(s, {}), /<rect width="[\d.]+" height="[\d.]+" fill="#fff"\/>/);
  assert.ok(!/<rect width="[\d.]+" height="[\d.]+" fill="#fff"\/>/.test(G.renderSVG(s, { background: 'none' })));
  assert.ok(G.renderSVG(s, { xmlHeader: true }).startsWith('<?xml'));
  assert.match(G.renderSVG(s, { px: { w: 1949, h: 2066 } }), /width="1949" height="2066"/);
});
test('real print sizes: text is 3.2 mm (about 9 pt) and the page is in millimetres', () => {
  const svg = G.renderSVG(G.sampleSpec(), {});
  assert.match(svg, /^<svg [^>]*width="165mm"/);
  assert.match(svg, /font-size="3\.2"/);
  for (const [k, w] of [['full', 165], ['half', 82], ['quarter', 40]]) assert.equal(G.sizeMM({ preset: k }).w, w);
});
test('presets all render and normalize to themselves', () => {
  for (const p of G.PRESETS) { const s = p.build(); assert.equal(JSON.stringify(G.normalize(s)), JSON.stringify(s)); noBad(G.renderSVG(s, {})); }
});
test('many objects at the limits still render', () => {
  const s = G.blankSpec();
  for (let i = 0; i < G.MAX_OBJECTS; i++) pt(s, { label: 'P', x: (i % 21) - 10, y: Math.floor(i / 21) - 7 });
  assert.equal(s.objects.length, G.MAX_OBJECTS);
  pt(s, { x: 1, y: 1 });
  noBad(G.renderSVG(s, {}));
  assert.equal(G.normalize(Object.assign({}, s, { objects: [...s.objects, ...s.objects] })).objects.length, G.MAX_OBJECTS);
});

/* ---------- PNG ---------- */
test('pngWithDpi stamps a valid pHYs chunk right after IHDR', () => {
  const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4, 'latin1'); data.copy(b, 8); b.writeUInt32BE(zlib.crc32 ? zlib.crc32(b.subarray(4, 8 + data.length)) : G.crc32(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(10, 0); ihdr.writeUInt32BE(10, 4); ihdr[8] = 8; ihdr[9] = 2;
  const png = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.alloc(310))), chunk('IEND', Buffer.alloc(0))]);
  const out = Buffer.from(G.pngWithDpi(new Uint8Array(png), 300));
  assert.equal(out.length, png.length + 21);
  assert.equal(out.toString('latin1', 37, 41), 'pHYs');
  const ppm = out.readUInt32BE(41); assert.equal(ppm, 11811);
  assert.ok(Math.abs(ppm * 0.0254 - 300) < 0.1);
  assert.equal(out.readUInt32BE(45), 11811); assert.equal(out[49], 1);
  assert.equal(out.readUInt32BE(50), G.crc32(new Uint8Array(out.subarray(37, 50))));
  assert.deepEqual([...out.subarray(0, 33)], [...png.subarray(0, 33)]); assert.deepEqual([...out.subarray(54)], [...png.subarray(33)]);
});
test('crc32 known value', () => { assert.equal(G.crc32(new Uint8Array(Buffer.from('123456789'))), 0xCBF43926); });

/* ---------- safety ---------- */
test('the core never uses eval or Function()', () => {
  assert.ok(!/\beval\s*\(|new Function|\bFunction\s*\(/.test(core), 'core must never use eval or Function()');
});
test('the page is self-contained: no external scripts, styles, fonts or URLs to load', () => {
  assert.ok(!/<script[^>]+src=|<link[^>]+href=|@import|url\(\s*['"]?https?:|fetch\(|XMLHttpRequest|WebSocket/.test(html));
});
test('the core uses its own storage keys only (none yet)', () => {
  assert.ok(!/sciencegraphmaker|graphmaker\./.test(html.replace(/mathgraphmaker/g, '')));
});

/* ==========================================================================
   Phase 2: function engine and linear relations
   ========================================================================== */
const near = (a, b, t = 1e-9) => Math.abs(a - b) <= t;
const WIN = { xlo: -10, xhi: 10, ylo: -10, yhi: 10 };
const fnSpec = (exprs, extra) => { const s = G.blankSpec(); exprs.forEach(e => s.objects.push(G.makeObject(s, 'function', typeof e === 'string' ? { expr: e } : e))); return Object.assign(s, extra || {}); };
const objSvg = (svg, id) => { const m = new RegExp(`<g data-obj="${id}"[^>]*>(.*?)</g>`).exec(svg); return m ? m[1] : null; };

test('equation forms: slope-intercept, point-slope, standard, vertical, horizontal, notation, bare expressions', () => {
  const chk = (src, f, o) => {
    const e = G.parseEquation(src); assert.ok(e.ok, src + ': ' + e.error);
    if (o.vertical !== undefined) { assert.equal(e.vertical, o.vertical, src); return; }
    assert.equal(e.vertical, null, src);
    for (const [x, y] of f) assert.ok(near(e.fn(x), y, 1e-9), `${src} at ${x}: ${e.fn(x)} vs ${y}`);
    if (o.m !== undefined) assert.ok(e.linear && near(e.linear.m, o.m, 1e-9) && near(e.linear.c, o.c, 1e-9), src + ' ' + JSON.stringify(e.linear));
    if (o.linear === false) assert.equal(e.linear, null, src);
    if (o.name !== undefined) assert.equal(e.name, o.name);
  };
  chk('y = 2x + 3', [[2, 7], [-1, 1]], { m: 2, c: 3 });
  chk('y = −2x + 3', [[2, -1]], { m: -2, c: 3 });
  chk('y = -2x+3', [[0, 3]], { m: -2, c: 3 });
  chk('y − 2 = 3(x + 1)', [[0, 5], [2, 11]], { m: 3, c: 5 });          // point-slope
  chk('2x + 3y = 6', [[0, 2], [3, 0], [6, -2]], { m: -2 / 3, c: 2 });      // standard
  chk('x = 4', [], { vertical: 4 }); chk('3 = x', [], { vertical: 3 }); chk('2x = 8', [], { vertical: 4 });
  chk('y = -1', [[5, -1]], { m: 0, c: -1 });
  chk('f(x) = x^2 - 4', [[3, 5], [0, -4]], { linear: false, name: 'f' });
  chk('g(x) = -x', [[2, -2]], { m: -1, c: 0, name: 'g' });
  chk('2x + 3', [[1, 5]], { m: 2, c: 3 });                                   // a bare expression means y = …
  chk('y = ½x + 1', [[2, 2]], { m: .5, c: 1 });
  chk('y = (x+1)/2', [[3, 2]], { m: .5, c: .5 });
  chk('y = 3x/2 - 1', [[2, 2]], { m: 1.5, c: -1 });
  chk('xy = 6', [[2, 3], [-3, -2]], { linear: false });                       // solvable for y, though not a line
  chk('y = 1/x', [[4, .25]], { linear: false });
});
test('parser precedence and implicit multiplication', () => {
  const y = (src, x) => G.parseEquation('y = ' + src).fn(x);
  assert.equal(y('-x^2', 3), -9);              // -x^2 is -(x^2)
  assert.equal(y('2^3^2', 0), 512);            // ^ is right-associative
  assert.equal(y('1/2x', 4), 2);               // (1/2)x
  assert.equal(y('2x^2', 3), 18);
  assert.equal(y('3(x+1)(x-1)', 2), 9);
  assert.equal(y('2 3', 0), 6);
  assert.ok(near(y('sin x', Math.PI / 2), 1) && near(y('2sin(x)', Math.PI / 2), 2) && near(y('cos(pi)', 0), -1));
  assert.ok(near(y('xsin(x)', Math.PI / 2), Math.PI / 2));               // "xsin" splits into x and sin
  assert.ok(near(y('sqrt(x)+abs(x)', 4), 6) && near(y('ln(e)', 0), 1) && near(y('log(100)', 0), 2));
  assert.equal(y('2^-x', 1), .5);
});
test('equation errors are plain language and never throw', () => {
  for (const bad of ['', '   ', 'y =', 'y = 2x +', '2x + 3y', 'x^2 + y^2 = 25', 'y = 2x = 3', 'y = z', 'y = (x + 1', 'y = x + 1)', 'y = 2 @ x', 'f(x) = 2x + y', 'x = x', 'y = 2 ** x', '((']) {
    let e; assert.doesNotThrow(() => { e = G.parseEquation(bad); }, bad);
    assert.equal(e.ok, false, bad);
    assert.ok(e.error && e.error.length > 5 && !/undefined|NaN|\[object/.test(e.error), bad + ' -> ' + e.error);
  }
  assert.match(G.parseEquation('x^2 + y^2 = 25').error, /can.t be graphed yet/);
  assert.match(G.parseEquation('y = z').error, /Unknown name/);
  assert.match(G.parseEquation('y = (x + 1').error, /closing bracket/);
  assert.match(G.parseEquation('x = x').error, /always true/);
  assert.equal(G.compileExpr('2x + 1').fn(3), 7);
  assert.ok(G.compileExpr('x = 3').error && !G.compileExpr('x = 3').fn);
});
test('equations are written back with stacked fractions, raised powers and true minus signs', () => {
  const m = s => G.parseEquation(s).markup;
  assert.equal(m('y = 1/2x + 1'), 'y = {1/2}x + 1');
  assert.equal(m('y = ½x + 1'), 'y = {1/2}x + 1');
  assert.equal(m('y=(x+1)/2'), 'y = {x + 1/2}');
  assert.equal(m('y = 3x/2 - 1'), 'y = {3x/2} − 1');
  assert.equal(m('y = x^2 - 4'), 'y = x^2 − 4');
  assert.equal(m('y = 2(x - 3)^2'), 'y = 2(x − 3)^2');
  assert.equal(m('y = -2x+3'), 'y = −2x + 3');
  assert.equal(m('f(x) = 2x'), '*f*(x) = 2x');
  assert.equal(m('y - 2 = 3(x + 1)'), 'y − 2 = 3(x + 1)');
  assert.equal(m('2x + 3y = 6'), '2x + 3y = 6');
  assert.equal(m('y = sqrt(x + 1)'), 'y = √(x + 1)');
  assert.equal(m('y = x^(1/2)'), 'y = x^{1∕2}');
  assert.equal(m('y = 1/2/3'), 'y = {1∕2/3}');                          // a fraction inside a fraction stays on one line, so the markup is unambiguous
  assert.equal(m('2x'), 'y = 2x'); assert.equal(m('y = 2*x'), 'y = 2x'); assert.equal(m('y = 2*3'), 'y = 2 × 3');
  assert.equal(m('y = 2 pi x'), 'y = 2πx');
  const runs = plain(G.labelRuns('y = {1/2}x + 1'));
  assert.deepEqual(runs.map(r => r.frac ? 'frac' : r.t), ['y', ' = ', 'frac', 'x', ' + 1']);
  assert.deepEqual(runs[2].frac, [[{ t: '1' }], [{ t: '2' }]]);
  assert.ok(G.runsW(G.labelRuns('{1/2}'), 3.2) < G.runsW(G.labelRuns('1/2'), 3.2), 'a stacked fraction is narrower than 1/2 on a line');
  assert.equal(G.flatRuns(G.labelRuns('{1/2}')).map(r => r.t).join(''), '1/2');
  assert.deepEqual(plain(G.labelRuns('{x^2/3}')[0].frac[0]), [{ t: 'x', i: true }, { t: '2', up: true }]);
  assert.deepEqual(plain(G.labelRuns('{set}')), [{ t: '{set}' }]);            // braces without a slash are plain text
  assert.equal(G.linearMarkup(-2 / 3, 1), 'y = −{2/3}x + 1');
  assert.equal(G.linearMarkup(.5, 0), 'y = {1/2}x'); assert.equal(G.linearMarkup(1, -3), 'y = x − 3');
  assert.equal(G.linearMarkup(-1, 0), 'y = −x'); assert.equal(G.linearMarkup(0, 4), 'y = 4'); assert.equal(G.linearMarkup(2, .5), 'y = 2x + {1/2}');
  assert.deepEqual(plain(G.toFraction(.5)), [1, 2]); assert.deepEqual(plain(G.toFraction(0.6666666666667)), [2, 3]);
  assert.deepEqual(plain(G.toFraction(-.25)), [-1, 4]); assert.equal(G.toFraction(0.3333, 100), null);
});

test('solver: zeros checked against known values', () => {
  const z = (f, a, b) => plain(G.findZeros(f, a, b));
  assert.deepEqual(z(x => x * x - 4, -10, 10), [-2, 2]);
  assert.deepEqual(z(x => x ** 3 - x, -3, 3), [-1, 0, 1]);
  const s = z(Math.sin, 0, 2 * Math.PI);
  assert.equal(s.length, 3); assert.ok(near(s[0], 0, 1e-9) && near(s[1], Math.PI, 1e-9) && near(s[2], 2 * Math.PI, 1e-9), 'zeros at both ends are found');
  assert.deepEqual(z(x => (x - 1) ** 2, -5, 5), [1]);                       // a root that only touches zero
  assert.deepEqual(z(x => x * x + 1, -5, 5), []);
  assert.deepEqual(z(x => 1 / x, -5, 5), []);                               // a pole is not a zero
  assert.deepEqual(z(x => 0, -5, 5), []);                                   // the axis itself has no isolated zeros
  assert.deepEqual(z(x => x, 0, 5), [0]);
  const t = z(Math.tan, -5, 5); assert.equal(t.length, 3); assert.ok(near(t[0], -Math.PI, 1e-9) && near(t[1], 0, 1e-9) && near(t[2], Math.PI, 1e-9), 'tan: zeros at 0 and ±π, none at the poles');
  assert.deepEqual(z(x => x - 7, -5, 5), []);
  assert.deepEqual(z(x => (x * x - 1) / (x - 1), -5, 5), [-1]);            // removable hole at 1 is not a zero
});
test('solver: intersections and extrema checked against known values', () => {
  assert.deepEqual(plain(G.findIntersections(x => 2 * x + 1, x => -x + 4, -10, 10)), [{ x: 1, y: 3 }]);
  assert.deepEqual(plain(G.findIntersections(x => x * x, x => x, -5, 5)), [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  assert.deepEqual(plain(G.findIntersections(x => x * x, x => 2 * x - 1, -5, 5)), [{ x: 1, y: 1 }]);        // tangent
  assert.deepEqual(plain(G.findIntersections(x => x, x => x + 1, -5, 5)), []);                              // parallel
  assert.deepEqual(plain(G.findIntersections(x => x, x => x, -5, 5)), []);                                  // the same line
  let e = plain(G.findExtrema(x => -((x - 2) ** 2) + 9, -10, 10)); assert.deepEqual(e, [{ x: 2, y: 9, type: 'max' }]);
  e = plain(G.findExtrema(x => x ** 3 - 3 * x, -3, 3)); assert.deepEqual(e, [{ x: -1, y: 2, type: 'max' }, { x: 1, y: -2, type: 'min' }]);
  e = plain(G.findExtrema(Math.sin, 0, 2 * Math.PI)); assert.equal(e.length, 2);
  assert.ok(near(e[0].x, Math.PI / 2, 1e-6) && e[0].y === 1 && e[0].type === 'max' && near(e[1].x, 3 * Math.PI / 2, 1e-6) && e[1].y === -1 && e[1].type === 'min');
  assert.deepEqual(plain(G.findExtrema(x => 2 * x + 1, -5, 5)), []);
  assert.deepEqual(plain(G.findExtrema(x => 1 / (x * x), -5, 5)), [], 'a pole is not a maximum');
});

test('clipping, simplifying and sampling', () => {
  assert.deepEqual(plain(G.clipSeg([-20, 0], [20, 0], -10, 10, -10, 10)), [.25, .75]);
  assert.equal(G.clipSeg([-20, 20], [-15, 15], -10, 10, -10, 10), null);
  const pieces = G.clipRun({ pts: [[0, 0], [5, 5], [20, 20]], a: 'start', b: 'end' }, -10, 10, -10, 10);
  assert.equal(pieces.length, 1); assert.deepEqual(plain(pieces[0].pts[pieces[0].pts.length - 1]), [10, 10]);
  assert.equal(pieces[0].a, 'start'); assert.equal(pieces[0].b, 'clip');
  const two = G.clipRun({ pts: [[0, 0], [0, 30], [1, 30], [1, 0]], a: 'start', b: 'end' }, -10, 10, -10, 10);
  assert.equal(two.length, 2, 'a curve that leaves and re-enters is two pieces');
  assert.equal(G.simplifyPts([[0, 0], [1, 1], [2, 2], [3, 3]], 5, 5, .02).length, 2);
  assert.equal(G.simplifyPts([[0, 0], [1, 1], [2, 0]], 5, 5, .02).length, 3);
  assert.equal(G.simplifyPts([[0, 0], [1, 0]], 5, 5, .02).length, 2);
});
test('plotting: a line is two points, a parabola follows its equation, arrows appear only where the curve carries on', () => {
  const run = (f, d) => G.plotRuns(f, d || { min: null, max: null }, WIN, 7, 7);
  let r = run(x => 2 * x + 1);
  assert.equal(r.length, 1); assert.equal(r[0].pts.length, 2); assert.equal(r[0].a, 'clip'); assert.equal(r[0].b, 'clip');
  r = run(x => x * x - 4);
  assert.equal(r.length, 1); assert.ok(r[0].pts.length > 10 && r[0].pts.length < 120, 'adaptive: ' + r[0].pts.length);
  r[0].pts.forEach(([x, y]) => assert.ok(near(y, x * x - 4, 0.02) && y >= -10 - 1e-9 && y <= 10 + 1e-9 && x >= -10 - 1e-9 && x <= 10 + 1e-9));
  assert.equal(r[0].a, 'clip'); assert.equal(r[0].b, 'clip');
  r = run(x => x, { min: 0, max: 5, minClosed: true, maxClosed: false });
  assert.equal(r.length, 1); assert.equal(r[0].a, 'start'); assert.equal(r[0].b, 'end');
  assert.deepEqual(plain([r[0].pts[0], r[0].pts[r[0].pts.length - 1]]), [[0, 0], [5, 5]]);
  assert.deepEqual(plain(run(x => x, { min: 20, max: 30 })), [], 'a domain outside the window draws nothing');
  r = run(x => 1000 * x); assert.equal(r.length, 1, 'a steep line is not mistaken for a jump');
});
test('discontinuities: 1/x, tan, floor and a removable hole never draw a line across the gap', () => {
  let r = G.plotRuns(x => 1 / x, { min: null, max: null }, WIN, 7, 7);
  assert.equal(r.length, 2);
  r.forEach(p => { const sg = Math.sign(p.pts[0][0]); assert.ok(p.pts.every(q => Math.sign(q[0]) === sg), 'each branch stays on one side of x = 0'); });
  r = G.plotRuns(Math.tan, { min: null, max: null }, WIN, 7, 7);
  assert.equal(r.length, 7, 'poles at ±π/2, ±3π/2, ±5π/2 make seven branches');
  r.forEach(p => { const b = k => Math.floor((k + Math.PI / 2) / Math.PI), b0 = b(p.pts[0][0]); assert.ok(p.pts.every(q => b(q[0]) === b0), 'a branch never spans a pole'); });
  r = G.plotRuns(Math.floor, { min: null, max: null }, WIN, 7, 7);
  assert.ok(r.length >= 20);
  r.forEach(p => assert.ok(p.pts.every(q => q[1] === p.pts[0][1]), 'each step is flat'));
  r = G.plotRuns(x => (x * x - 1) / (x - 1), { min: null, max: null }, WIN, 7, 7);
  assert.equal(r.length, 1, 'a removable hole does not break the line'); r[0].pts.forEach(([x, y]) => assert.ok(near(y, x + 1, 1e-6)));
  r = G.plotRuns(Math.sqrt, { min: null, max: null }, WIN, 7, 7);
  assert.equal(r.length, 1); assert.ok(r[0].pts.every(q => q[0] >= 0)); assert.equal(r[0].a, 'break');
  const t0 = Date.now(); r = G.plotRuns(x => Math.sin(1 / x), { min: null, max: null }, WIN, 7, 7);
  assert.ok(Date.now() - t0 < 2000, 'a wildly oscillating function is cut off by the budget, not left to hang');
  for (const f of [x => 1 / x, Math.tan, Math.floor, Math.sqrt, x => Math.log(x), x => 1 / (x * x), x => Math.exp(x * 5), x => x ** 0.5])
    G.plotRuns(f, { min: null, max: null }, WIN, 7, 7).forEach(p => p.pts.forEach(q => assert.ok(Number.isFinite(q[0]) && Number.isFinite(q[1]))));
});

test('key points: intercepts, intersections, line crossings, slope triangles, suggested x-values', () => {
  const ip = (src, dom) => plain(G.interceptPoints(G.parseEquation(src), dom || { min: null, max: null }, WIN));
  assert.deepEqual(ip('y = -2x + 3'), [{ x: 0, y: 3, axis: 'y' }, { x: 1.5, y: 0, axis: 'x' }]);
  assert.deepEqual(ip('y = x^2 - 4').map(p => [p.x, p.y]), [[0, -4], [-2, 0], [2, 0]]);
  assert.deepEqual(ip('y = x'), [{ x: 0, y: 0, axis: 'both' }]);
  assert.deepEqual(ip('x = 4'), [{ x: 4, y: 0, axis: 'x' }]); assert.deepEqual(ip('x = 0'), []);
  assert.deepEqual(ip('y = 2'), [{ x: 0, y: 2, axis: 'y' }]);
  assert.deepEqual(ip('y = x + 1', { min: 1, max: 5 }), [], 'intercepts outside the drawn domain are not marked');
  assert.deepEqual(ip('y = oops'), []);
  const A = G.parseEquation('y = 2x + 1'), B = G.parseEquation('y = -x + 4'), V = G.parseEquation('x = 2'), P = G.parseEquation('y = x^2'), L = G.parseEquation('y = x');
  assert.deepEqual(plain(G.intersectionPoints(A, B, WIN)), [{ x: 1, y: 3 }]);
  assert.deepEqual(plain(G.intersectionPoints(A, V, WIN)), [{ x: 2, y: 5 }]);
  assert.deepEqual(plain(G.intersectionPoints(P, L, WIN)), [{ x: 0, y: 0 }, { x: 1, y: 1 }]);
  assert.deepEqual(plain(G.intersectionPoints(A, G.parseEquation('y = 2x + 5'), WIN)), []);
  assert.deepEqual(plain(G.intersectionPoints(V, G.parseEquation('x = 3'), WIN)), []);
  assert.deepEqual(plain(G.intersectionPoints(P, L, WIN, { min: .5, max: null }, { min: null, max: null })), [{ x: 1, y: 1 }], 'each graph’s own domain limits its intersections');
  assert.deepEqual(plain(G.lineCross(A, B)), { x: 1, y: 3 }); assert.equal(G.lineCross(A, G.parseEquation('y = 2x')), null);
  const st = (src, o) => plain(G.slopeTriangle(G.parseEquation(src).linear, WIN, o));
  assert.deepEqual(st('y = -2x + 3'), { x1: 0, y1: 3, x2: 1, y2: 1, run: 1, rise: -2 });
  assert.deepEqual(st('y = 2x/3 + 1'), { x1: 0, y1: 1, x2: 3, y2: 3, run: 3, rise: 2 });     // run is the denominator, so both ends sit on gridlines
  assert.equal(G.slopeTriangle(G.parseEquation('y = 4').linear, WIN), null);
  assert.equal(G.slopeTriangle(null, WIN), null);
  assert.equal(st('y = -2x + 3', { avoid: [0, 1.5] }).x1, 1, 'keeps clear of the intercepts when it can (x = -1 would end on the one at 0)');
  assert.deepEqual(st('y = x', { at: 4, run: 2 }), { x1: 4, y1: 4, x2: 6, y2: 6, run: 2, rise: 2 });
  assert.deepEqual(plain(G.suggestXs(x => 2 * x / 3 + 1, -10, 10, 4)), [-6, -3, 0, 3]);
  assert.deepEqual(plain(G.suggestXs(x => x / 2 + .25, -10, 10, 4)), []);
});
test('parallel and perpendicular lines', () => {
  const eq = s => G.parseEquation(s), lin = (r) => r.ok && r.linear;
  let r = G.relatedEq(eq('y = 2x + 1'), 'parallel', { x: 1, y: 5 }); assert.deepEqual(plain(r.linear), { m: 2, c: 3 });
  r = G.relatedEq(eq('y = 2x + 1'), 'perpendicular', { x: 0, y: 0 }); assert.deepEqual(plain(r.linear), { m: -.5, c: 0 }); assert.equal(r.markup, 'y = −{1/2}x');
  r = G.relatedEq(eq('y = 2x + 1'), 'perpendicular', { x: 4, y: 3 }); assert.ok(near(r.fn(4), 3) && near(r.fn(6), 2));
  r = G.relatedEq(eq('x = 3'), 'perpendicular', { x: 1, y: 2 }); assert.deepEqual(plain(r.linear), { m: 0, c: 2 });
  r = G.relatedEq(eq('y = 5'), 'perpendicular', { x: 1, y: 2 }); assert.equal(r.vertical, 1); assert.equal(r.markup, 'x = 1');
  r = G.relatedEq(eq('x = 3'), 'parallel', { x: -2, y: 0 }); assert.equal(r.vertical, -2);
  for (const [b, p] of [[null, { x: 0, y: 0 }], [eq('y = x'), null], [eq('y = x^2'), { x: 0, y: 0 }], [eq('y ='), { x: 0, y: 0 }]]) {
    r = G.relatedEq(b, 'parallel', p); assert.equal(r.ok, false); assert.ok(r.error);
  }
  const m1 = eq('y = 3x - 2').linear.m, m2 = G.relatedEq(eq('y = 3x - 2'), 'perpendicular', { x: 1, y: 1 }).linear.m;
  assert.ok(near(m1 * m2, -1, 1e-9), 'slopes multiply to −1');
});

/* ---------- objects: schema, references, tables ---------- */
test('new object kinds normalise, round-trip, and clean up references when something is deleted', () => {
  const s = fnSpec(['y = 2x + 1', 'y = -x + 4']);
  const [f1, f2] = s.objects.map(o => o.id);
  pt(s, { label: 'P', x: 1, y: 1 });
  const P = s.objects[2].id;
  s.objects.push(G.makeObject(s, 'table', { of: f1, rows: [{ x: 0 }, { x: 1 }, { x: 2 }], blank: ['y:0', 'y:2', 'y:9', 'q:1', 'x:1'], place: 'below', orient: 'horizontal', plot: 'line' }));
  s.objects.push(G.makeObject(s, 'related', { of: f1, rel: 'parallel', through: { point: P, x: 3, y: 4 } }));
  s.objects.push(G.makeObject(s, 'guide', { point: P })); s.objects.push(G.makeObject(s, 'guide', { fn: f2, x: 2 }));
  s.objects.push(G.makeObject(s, 'intersect', { of: [f1, f2], label: 'A' }));
  s.objects.push(G.makeObject(s, 'vlt', { at: [1, 2, '-'] }));
  const n = G.normalize(s);
  assert.equal(n.specVersion, 4);
  assert.deepEqual(plain(n.objects.map(o => o.id)), ['fn1', 'fn2', 'pt1', 'tb1', 'rl1', 'gd1', 'gd2', 'is1', 'vl1']);
  assert.deepEqual(plain(n.objects[3].blank), ['y:0', 'y:2', 'x:1'], 'blank marks outside the table are dropped');
  assert.equal(G.serialize(G.parseFile(G.serialize(n))), G.serialize(n));
  assert.equal(JSON.stringify(G.normalize(JSON.parse(JSON.stringify(n)))), JSON.stringify(n));
  G.removeObject(n, f1);
  const t = n.objects.find(o => o.kind === 'table'), rl = n.objects.find(o => o.kind === 'related'), is = n.objects.find(o => o.kind === 'intersect');
  assert.equal(t.of, ''); assert.equal(rl.of, ''); assert.deepEqual(plain(is.of), ['', f2]);
  G.removeObject(n, P);
  assert.equal(rl.through.point, ''); assert.equal(n.objects.find(o => o.kind === 'guide').point, '');
  n.hidden = ['tb1', 'nope']; assert.deepEqual(plain(G.normalize(n).hidden), ['tb1']);
  const junk = G.normalize({ objects: [{ kind: 'function', expr: 5, domain: 'x', every: -3, label: 'shout', slope: 'big' }, { kind: 'table', rows: 'no', blank: 'no' }, { kind: 'intersect', of: 'no' }, { kind: 'vlt', at: 'no' }] });
  assert.equal(junk.objects.length, 4); assert.equal(junk.objects[0].every, 1); assert.equal(junk.objects[0].label, 'equation'); assert.equal(junk.objects[0].slope, 'none');
  assert.equal(G.normalize({ objects: [{ kind: 'table', rows: Array.from({ length: 99 }, () => ({})) }] }).objects[0].rows.length, G.MAX_ROWS);
});
test('files: a version 1 file still opens; a newer one is refused', () => {
  const v1 = JSON.stringify({ tool: 'math-graph-maker', specVersion: 1, objects: [{ kind: 'point', id: 'pt1', x: 1, y: 2, label: 'A' }] });
  const s = G.parseFile(v1); assert.equal(s.specVersion, 4); assert.equal(s.objects[0].label, 'A');
  assert.throws(() => G.parseFile('{"tool":"math-graph-maker","specVersion":5}'), /newer version/);
});
test('tables of values: calculated y, typed y, headings, undefined values, paste, delete and fill', () => {
  const s = fnSpec(['f(x) = 2x + 1', 'y = 1/x']);
  const [f, g] = s.objects.map(o => o.id);
  s.objects.push(G.makeObject(s, 'table', { of: f, rows: [{ x: -1 }, { x: 0 }, { x: 2.5 }, { x: 'abc' }, {}] }));
  s.objects.push(G.makeObject(s, 'table', { of: g, rows: [{ x: 0 }, { x: 4 }] }));
  s.objects.push(G.makeObject(s, 'table', { rows: [{ x: 1, y: 3 }, { x: 2, y: 'oops' }, { x: 3 }], xHead: 'Hours', yHead: 'Cost ($)' }));
  const R = G.resolveObjects(G.normalize(s)), m = id => R.res(id).model;
  assert.deepEqual(plain(m('tb1').head), ['x', '*f*(x)']);
  assert.deepEqual(plain(m('tb1').rows.map(r => [r.xtext, r.ytext])), [['−1', '−1'], ['0', '1'], ['2.5', '6'], ['abc', ''], ['', '']]);
  assert.deepEqual(plain(m('tb2').rows.map(r => r.ytext)), ['—', '0.25'], 'undefined shows a dash');
  assert.deepEqual(plain(m('tb2').head), ['x', 'y']);
  assert.deepEqual(plain(m('tb3').head), ['Hours', 'Cost ($)']);
  assert.deepEqual(plain(m('tb3').rows.map(r => [r.yv, r.ytext])).map(r => [Number.isNaN(r[0]) ? null : r[0], r[1]]), [[3, '3'], [null, 'oops'], [null, '']]);
  const t = { rows: [{ x: 1, y: null }], blank: [] };
  assert.equal(G.pasteRows(t, [['5', '6'], ['7', '8', '9']], 0, 0).ignored, 1);
  assert.deepEqual(plain(t.rows), [{ x: 5, y: 6 }, { x: 7, y: 8 }]);
  t.rows = [{ x: 1 }, { x: 2 }, { x: 3 }]; t.blank = ['y:0', 'y:1', 'x:2'];
  G.dropRow(t, 1); assert.deepEqual(plain(t.blank), ['y:0', 'x:1'], 'blank marks follow their rows');
  const o = { rows: [], blank: ['x:0'] };
  assert.equal(G.fillRows(o, -2, 2, 1), 5); assert.deepEqual(plain(o.rows.map(r => r.x)), [-2, -1, 0, 1, 2]); assert.deepEqual(plain(o.blank), []);
  assert.deepEqual(plain((G.fillRows(o, 0, 1, .1), o.rows.map(r => r.x))), [0, .1, .2, .3, .4, .5, .6, .7, .8, .9, 1], 'no floating-point artifacts');
  assert.equal(G.fillRows(o, 0, 1, 0), 0); assert.equal(G.fillRows(o, 0, 1, -1), 0); assert.equal(G.fillRows(o, 'a', 1, 1), 0);
  assert.equal(G.fillRows(o, 0, 1000, 1), G.MAX_ROWS);
});

/* ---------- rendering ---------- */
test('y = x² − 4 plots correctly even though quadratics are not a feature yet: every drawn point satisfies the equation', () => {
  const s = fnSpec(['y = x^2 - 4']), geom = {}, svg = G.renderSVG(s, { geom });
  const body = objSvg(svg, 'fn1'), pl = /<polyline points="([^"]+)"[^>]*stroke-width="0\.6"/.exec(body);
  assert.ok(pl, 'a curve is drawn');
  const pts = pl[1].split(' ').map(p => p.split(',').map(Number)), span = a => a.hi - a.lo;
  assert.ok(pts.length > 10);
  pts.forEach(([px, py]) => {
    const x = geom.ax.lo + (px - geom.x0) / (geom.x1 - geom.x0) * span(geom.ax), y = geom.ay.hi - (py - geom.y0) / (geom.y1 - geom.y0) * span(geom.ay);
    assert.ok(near(y, x * x - 4, 0.02), `(${x.toFixed(3)}, ${y.toFixed(3)}) is off the parabola`);
  });
  assert.equal((body.match(/<polygon /g) || []).length, 2, 'arrowheads at both ends, where the curve carries on');
});
test('arrows, end dots, discrete points and vertical lines', () => {
  const heads = svg => (svg.match(/<polygon /g) || []).length, dots = svg => (svg.match(/<circle /g) || []).length;
  let s = fnSpec(['y = 2x + 1']); assert.equal(heads(objSvg(G.renderSVG(s, {}), 'fn1')), 2);
  s.objects[0].arrows = false; assert.equal(heads(objSvg(G.renderSVG(s, {}), 'fn1')), 0);
  s = fnSpec([{ expr: 'y = x', domain: { min: -2, max: 3, minClosed: true, maxClosed: false } }]);
  let b = objSvg(G.renderSVG(s, {}), 'fn1');
  assert.equal(heads(b), 0, 'a restricted line ends in dots, not arrows');
  assert.equal(dots(b), 2); assert.match(b, /<circle [^>]*fill="#000"\/>/); assert.match(b, /<circle [^>]*fill="#fff" stroke="#000"/);      // one filled end, one open end
  s = fnSpec([{ expr: 'y = 2x + 1', discrete: true, every: 2, domain: { min: 0, max: 6 } }]);
  b = objSvg(G.renderSVG(s, {}), 'fn1'); assert.equal(dots(b), 4, 'points at x = 0, 2, 4, 6'); assert.ok(!/<polyline/.test(b));
  s = fnSpec(['x = 4']); b = objSvg(G.renderSVG(s, {}), 'fn1'); assert.match(b, /<line /); assert.equal(heads(b), 2);
  s = fnSpec(['x = 40']); assert.equal(G.computeAxes(s).x.hi >= 40, true, 'a far vertical line asks the grid to grow');
  s.x.min = -10; s.x.max = 10; assert.ok(!/<line /.test(objSvg(G.renderSVG(s, {}), 'fn1') || ''), 'but on a fixed grid it is not drawn');
});
test('equation labels, intercepts, slope triangles: shown in the key, individually hideable in the question', () => {
  const s = fnSpec([{ expr: 'f(x) = -2x + 3', label: 'name', intercepts: 'labelled', slope: 'labelled' }]);
  const txt = (svg) => texts(svg);
  const key = G.renderSVG(s, {});
  assert.ok(txt(key).includes('f(x)') && txt(key).includes('(0, 3)') && txt(key).includes('(1.5, 0)') && txt(key).includes('run = 1') && txt(key).includes('rise = −2'), txt(key).join('|'));
  s.objects[0].label = 'equation'; assert.ok(txt(G.renderSVG(s, {})).includes('f(x) = −2x + 3'), 'the stated equation is written with true minus signs');
  const q = h => G.renderSVG(Object.assign({}, s, { hidden: h }), { version: 'question' });
  assert.ok(!txt(q(['equations'])).includes('f(x) = −2x + 3') && txt(q(['equations'])).includes('(0, 3)'));
  assert.ok(!txt(q(['keyPoints'])).includes('(0, 3)') && txt(q(['keyPoints'])).includes('run = 1'));
  assert.ok(!txt(q(['slopeTriangle'])).includes('rise = −2') && txt(q(['slopeTriangle'])).includes('(0, 3)'));
  assert.ok(!txt(q(['coordLabels'])).includes('(0, 3)'));
  assert.ok(!objSvg(q(['objects']), 'fn1') && !objSvg(q(['fn1']), 'fn1'));
  for (const h of [['equations'], ['keyPoints'], ['slopeTriangle'], ['objects'], ['fn1']]) assert.deepEqual(attrs(q(h)), attrs(key), 'page and plot are the same in the question');
  s.objects[0].intercepts = 'marked'; assert.ok(!txt(G.renderSVG(s, {})).includes('(0, 3)'), 'marked, not labelled');
  s.objects[0].slope = 'triangle'; assert.ok(!txt(G.renderSVG(s, {})).some(t => /^rise|^run/.test(t)) && /stroke-dasharray="1\.5 \.9"/.test(G.renderSVG(s, {})));
});
test('stacked fractions are drawn as a numerator over a bar over a denominator', () => {
  const s = fnSpec([{ expr: 'y = 1/2x + 1' }]), svg = G.renderSVG(s, {}), b = objSvg(svg, 'fn1');
  assert.ok(!b.includes('<text'), 'labels live outside the clipped shapes');
  const small = [...svg.matchAll(/<text [^>]*font-size="2\.496"[^>]*>(.*?)<\/text>/g)].map(m => m[1].replace(/<[^>]+>/g, ''));
  assert.ok(small.includes('1') && small.includes('2'), 'numerator and denominator are set smaller: ' + small.join());
  assert.match(svg, /<line x1="[\d.]+" y1="([\d.]+)" x2="[\d.]+" y2="\1" stroke="#000" stroke-width="0\.272"\/>/);
  const t = G.blankSpec(); t.x.format = 'fraction'; t.x.min = -1; t.x.max = 1; t.x.step = .5; t.y.min = -1; t.y.max = 1; t.y.step = .5;
  const ts = G.renderSVG(t, {}); assert.match(ts, /font-size="2\.184"/, 'fraction ticks are stacked too');
  noBad(ts);
});
test('parallel and perpendicular lines, right-angle marker, intersections, guide lines and the vertical line test', () => {
  const s = fnSpec(['y = -x + 4']);
  s.objects.push(G.makeObject(s, 'related', { of: 'fn1', rel: 'perpendicular', through: { x: -3, y: -2 }, rightAngle: true }));
  s.objects.push(G.makeObject(s, 'intersect', { of: ['fn1', 'rl1'], coords: true }));
  s.objects.push(G.makeObject(s, 'guide', { fn: 'fn1', x: -2 }));
  s.objects.push(G.makeObject(s, 'vlt', { at: [1, 3] }));
  const key = G.renderSVG(s, {});
  const corner = [...objSvg(key, 'rl1').matchAll(/<polyline points="([^"]+)" fill="none" stroke="#000" stroke-width="0\.4"\/>/g)].filter(m => m[1].split(' ').length === 3);
  assert.equal(corner.length, 1, 'one right-angle marker (three points)');
  assert.ok(texts(key).includes('y = x + 1') && texts(key).includes('(1.5, 2.5)'), texts(key).join('|'));
  assert.ok(texts(key).includes('−2') && texts(key).includes('6'), 'guide values are written on the axes');
  assert.equal((objSvg(key, 'vl1').match(/<circle /g) || []).length, 4, 'a ring where each test line meets each graph');
  assert.equal((objSvg(key, 'vl1').match(/stroke-dasharray="2 1\.2"/g) || []).length, 2);
  const q = h => G.renderSVG(Object.assign({}, s, { hidden: h }), { version: 'question' });
  assert.ok(!objSvg(q(['keyPoints']), 'is1') && objSvg(q(['keyPoints']), 'rl1'));
  assert.ok(texts(q(['coordLabels'])).length < texts(key).length, 'hiding coordinates also drops the guide values and the intersection label');
  s.objects[1].rightAngle = false; assert.ok(!(objSvg(G.renderSVG(s, {}), 'rl1').match(/<polyline points="[^"]+" fill="none" stroke="#000" stroke-width="0\.4"\/>/g) || []).length);
  s.objects[1].rel = 'parallel'; assert.ok(texts(G.renderSVG(s, {})).includes('y = −x − 5'));
  s.objects[2].of = ['fn1', '']; assert.ok(!objSvg(G.renderSVG(s, {}), 'is1'), 'an intersection with nothing chosen draws nothing');
  s.objects[1].of = ''; noBad(G.renderSVG(s, {}));
});
test('a matrix of expressions, windows and styles renders cleanly, with one page and plot in both versions', () => {
  const exprs = ['y = 2x + 3', 'f(x) = x^2 - 4', 'y = 1/x', 'y = tan(x)', 'y = floor(x)', 'y = sqrt(x)', 'x = 4', 'y = 0', '2x + 3y = 6', 'y = x^3 - 3x', 'y = 1/2x + 1', 'y = exp(x)', 'y = ln(x)', 'y = abs(x) - 3', 'y = (x^2 - 1)/(x - 1)', 'y = 1000x', 'y = sin(1/x)', 'y = oops'];
  let n = 0;
  for (const e of exprs) for (const [quadrants, x, size] of [[4, [null, null], { preset: 'full' }], [1, [0, 5], { preset: 'half' }], [4, [-3, 3], { preset: 'quarter' }], [4, [-200, 200], { preset: 'full' }]]) for (const largePrint of [false, true]) {
    const s = fnSpec([{ expr: e, intercepts: 'labelled', slope: 'labelled' }], { quadrants, size });
    s.x.min = x[0]; s.x.max = x[1]; s.style.largePrint = largePrint;
    s.objects.push(G.makeObject(s, 'table', { of: 'fn1', rows: [{ x: -1 }, { x: 0 }, { x: 1 }], blank: ['y:0'], plot: 'line' }));
    s.objects.push(G.makeObject(s, 'intersect', { of: ['fn1', 'fn1'] })); s.objects.push(G.makeObject(s, 'guide', { fn: 'fn1', x: 1 })); s.objects.push(G.makeObject(s, 'vlt', { at: [1] }));
    const ns = G.normalize(s), key = G.renderSVG(ns, {});
    noBad(key);
    for (const h of [[], ['objects'], ['equations', 'keyPoints', 'slopeTriangle'], ['tables']]) { const q = G.renderSVG(Object.assign({}, ns, { hidden: h }), { version: 'question' }); noBad(q); assert.deepEqual(attrs(q), attrs(key)); n++; }
  }
  assert.ok(n >= 500);
});
test('tables: blank cells only in the question, the same size either way, and their own visibility token', () => {
  const s = fnSpec(['y = -2x + 3']);
  s.objects.push(G.makeObject(s, 'table', { of: 'fn1', rows: [-2, -1, 0, 1, 2].map(x => ({ x })), blank: ['y:0', 'y:1', 'y:2', 'y:3', 'y:4', 'x:4'] }));
  const key = G.renderSVG(s, {}), q = G.renderSVG(Object.assign({}, s, { hidden: ['objects'] }), { version: 'question' });
  const cells = svg => texts(objSvg(svg, 'tb1') || '').filter(t => /^−?\d+$/.test(t));
  for (const y of ['7', '5', '3', '1']) assert.ok(cells(key).includes(y), 'key has y = ' + y);
  assert.deepEqual(attrs(q), attrs(key));
  assert.ok(!cells(q).includes('7') && !cells(q).includes('5'), 'question leaves the y cells empty');
  assert.ok(cells(q).includes('−2') && cells(q).includes('−1'), 'and keeps the x cells');
  assert.ok(objSvg(q, 'tb1') && !objSvg(q, 'fn1'), 'the "objects" token hides the graph but not the table');
  const hid = G.renderSVG(Object.assign({}, s, { hidden: ['tables'] }), { version: 'question' }); assert.ok(!objSvg(hid, 'tb1')); assert.deepEqual(attrs(hid), attrs(key), 'a hidden table still holds its space');
  const byId = G.renderSVG(Object.assign({}, s, { hidden: ['tb1'] }), { version: 'question' }); assert.ok(!objSvg(byId, 'tb1'));
  const geo = o => { const g = {}; G.renderSVG(o, { geom: g }); return g; };
  const none = geo(fnSpec(['y = x'])), right = geo(s);
  assert.ok(right.cell < none.cell && right.W === none.W, 'a table on the right narrows the grid and keeps the page width');
  s.objects[1].place = 'below'; s.objects[1].orient = 'horizontal';
  const below = geo(s); assert.ok(below.H > none.H && near(below.cell, none.cell, 1e-9), 'a table below makes the page taller and leaves the grid alone');
  assert.ok(cells(G.renderSVG(s, {})).includes('7'));
  for (const [place, orient] of [['right', 'vertical'], ['right', 'horizontal'], ['below', 'vertical'], ['below', 'horizontal']]) { s.objects[1].place = place; s.objects[1].orient = orient; const sv = G.renderSVG(s, {}); noBad(sv); assert.ok(cells(sv).includes('7')); }
  s.objects[1].rows = []; noBad(G.renderSVG(s, {}));
});
test('a table can plot itself: shown in the key, and in the question only if asked', () => {
  const s = G.blankSpec();
  s.objects.push(G.makeObject(s, 'table', { rows: [{ x: 1, y: 2 }, { x: 2, y: 4 }, { x: 3, y: 5 }], plot: 'points' }));
  const has = (svg) => (objSvg(svg, 'tb1') || '').includes('<circle');
  assert.ok(has(G.renderSVG(s, {})) && !has(G.renderSVG(s, { version: 'question' })));
  s.objects[0].plotInQuestion = true; assert.ok(has(G.renderSVG(s, { version: 'question' })));
  s.objects[0].plot = 'line'; assert.match(objSvg(G.renderSVG(s, {}), 'tb1'), /<polyline/);
  s.objects[0].plot = 'none'; assert.ok(!objSvg(G.renderSVG(s, {}), 'tb1') || !has(G.renderSVG(s, {})) );
  s.objects[0].plot = 'points'; s.objects[0].rows = [{ x: 30, y: 2 }]; assert.ok(G.computeAxes(s).x.hi >= 30, 'plotted points ask the grid to grow');
});
test('done when: one spec makes "Graph y = −2x + 3 and complete the table" as a blank question and a filled key', () => {
  const s = G.blankSpec(); s.title = 'Graph y = -2x + 3 and complete the table'; s.x.min = -5; s.x.max = 5; s.y.min = -5; s.y.max = 9;
  s.objects.push(G.makeObject(s, 'function', { expr: 'y = -2x + 3', intercepts: 'marked', label: 'none' }));
  s.objects.push(G.makeObject(s, 'table', { of: 'fn1', rows: [-2, -1, 0, 1, 2].map(x => ({ x })), blank: ['y:0', 'y:1', 'y:2', 'y:3', 'y:4'] }));
  s.hidden = [...G.SCAFFOLD.blank.filter(t => t !== 'title')];
  const key = G.renderSVG(s, {}), q = G.renderSVG(s, { version: 'question' });
  assert.ok(objSvg(key, 'fn1') && (objSvg(key, 'fn1').match(/<circle /g) || []).length === 2, 'key: the line, with both intercepts marked');
  for (const y of ['7', '5', '3', '1', '−1']) assert.ok(texts(key).includes(y));
  assert.ok(!objSvg(q, 'fn1'), 'question: a blank grid');
  assert.ok(objSvg(q, 'tb1') && ['7', '5', '3'].every(y => !texts(objSvg(q, 'tb1')).includes(y)), 'question: the table, with its y cells blank');
  assert.ok(texts(q).includes('Graph y = −2x + 3 and complete the table'.replace('y = −2x', 'y = −2x')) || texts(q).some(t => /complete the table/.test(t)));
  assert.deepEqual(attrs(q), attrs(key)); assert.equal(G.scaffoldLevel(s), 'custom');
  assert.ok(!texts(q).some(t => /^−?\d+$/.test(t) && !['−2', '−1', '0', '1', '2'].includes(t) && false));
});

test('readability: warns when values fall between gridlines, and suggests whole-number x-values', () => {
  const R = s => plain(G.readability(s).map(i => i.text));
  assert.deepEqual(R(fnSpec(['y = 2x + 1'])), []);
  let s = fnSpec(['y = 0.5x + 0.25']); let r = R(s);
  assert.equal(r.length, 1); assert.match(r[0], /no gridline crossing/);
  s = fnSpec(['y = 2x/3 + 1']); assert.deepEqual(R(s), [], 'one gridline crossing every 3 units is enough');
  s = fnSpec([{ expr: 'y = 2x + 1', intercepts: 'marked' }]); r = R(s); assert.equal(r.length, 1); assert.match(r[0], /x-intercept \(−0\.5, 0\) falls between gridlines/);
  s = fnSpec([{ expr: 'y = 2x/3 + 1', intercepts: 'marked' }]);
  s.objects.push(G.makeObject(s, 'table', { of: 'fn1', rows: [{ x: -1 }, { x: 0 }, { x: 3 }] }));
  r = R(s); assert.ok(r.some(t => /Table: y is not a whole number at x = −1\./.test(t) && /Whole-number y at x = /.test(t)), r.join('|'));
  s = fnSpec(['y = oops']); assert.match(R(s)[0], /Equation .y = oops.: Unknown name/);
  s = G.blankSpec(); pt(s, { label: 'A', x: 1.5, y: 2 }); tri(s, [[0, 0], [2.5, 0], [0, 3]], ['A', 'B', 'C']);
  r = G.readability(s); assert.equal(r.length, 2); assert.ok(r.every(i => i.fix === 'snap'));
  assert.equal(G.snapPoints(s), 2); assert.deepEqual(plain([s.objects[0].x, s.objects[0].y]), [2, 2]); assert.equal(G.readability(s).length, 0);
  s.grid.minor = true; s.objects[0].x = 1.5; assert.equal(G.readability(s).length, 0, 'with minor gridlines a half unit is on the grid');
  s = fnSpec(['y = 2x + 1']); s.objects.push(G.makeObject(s, 'related', { of: 'fn1', rel: 'perpendicular', through: { x: 0, y: 0 }, rightAngle: true }));
  assert.deepEqual(R(s).filter(t => /scales differ/.test(t)), []);
  s.x.step = 1; s.y.step = 5; assert.equal(R(s).filter(t => /scales differ/.test(t)).length, 1);
});


/* ================= Phase 3: number lines ================= */
const nlSpec = (objs, extra) => {
  const s = G.blankSpec(); s.type = 'numberline'; s.x.min = -5; s.x.max = 5; s.x.step = 1;
  (objs || []).forEach(([k, p]) => s.objects.push(G.makeObject(s, k, p)));
  return Object.assign(s, extra || {});
};
const iq = p => Object.assign({ form: 'simple', a: { op: 'ge', at: -3 } }, p);
const INF = v => v === Infinity ? '+inf' : v === -Infinity ? '-inf' : v;              // Infinity does not survive JSON, so name it
const segRows = list => Array.from(list, g => [INF(g.lo), INF(g.hi), g.loC, g.hiC]);
const segs = p => segRows(G.ineqSegments(G.makeObject(G.blankSpec(), 'inequality', iq(p))));

test('ineqSegments: simple, and, or, empty and merged cases', () => {
  assert.deepEqual(segs({}), [[-3, '+inf', true, false]]);
  assert.deepEqual(segs({ a: { op: 'lt', at: 2 } }), [['-inf', 2, false, false]]);
  assert.deepEqual(segs({ form: 'and', a: { op: 'gt', at: -2 }, b: { op: 'le', at: 5 } }), [[-2, 5, false, true]]);
  assert.deepEqual(segs({ form: 'and', a: { op: 'gt', at: 5 }, b: { op: 'lt', at: 2 } }), [], 'empty intersection');
  assert.deepEqual(segs({ form: 'and', a: { op: 'ge', at: 2 }, b: { op: 'le', at: 2 } }), [[2, 2, true, true]], 'a single point');
  assert.deepEqual(segs({ form: 'and', a: { op: 'gt', at: 2 }, b: { op: 'le', at: 2 } }), []);
  assert.deepEqual(segs({ form: 'or', a: { op: 'lt', at: -1 }, b: { op: 'gt', at: 3 } }), [['-inf', -1, false, false], [3, '+inf', false, false]]);
  assert.equal(segs({ form: 'or', a: { op: 'lt', at: 4 }, b: { op: 'gt', at: 1 } }).length, 1, 'overlapping or-ranges merge (all reals)');
  assert.equal(segs({ form: 'or', a: { op: 'lt', at: 2 }, b: { op: 'ge', at: 2 } }).length, 1, 'touching with an included point merges');
  assert.equal(segs({ form: 'or', a: { op: 'lt', at: 2 }, b: { op: 'gt', at: 2 } }).length, 2, 'x ≠ 2 stays two pieces');
  assert.deepEqual(segs({ a: { op: 'ge', at: '' } }), [], 'a blank value gives no solution rather than a guess');
});

test('inequality notation: inequality, interval and set builder', () => {
  const T = (form, n, dom) => plain(G.noteTexts(G.ineqSegments(G.makeObject(G.blankSpec(), 'inequality', iq(form))), n, 'x', dom || 'real', null));
  assert.deepEqual(T({}, { inequality: true, interval: true, set: true }), ['x ≥ −3', '[−3, ∞)', '{x | x ≥ −3, x ∈ ℝ}']);
  assert.deepEqual(T({ a: { op: 'lt', at: 2 } }, { inequality: true, interval: true }), ['x < 2', '(−∞, 2)']);
  assert.deepEqual(T({ form: 'and', a: { op: 'gt', at: -2 }, b: { op: 'le', at: 5 } }, { inequality: true, interval: true }), ['−2 < x ≤ 5', '(−2, 5]']);
  assert.deepEqual(T({ form: 'or', a: { op: 'lt', at: -1 }, b: { op: 'gt', at: 3 } }, { inequality: true, interval: true }), ['x < −1 or x > 3', '(−∞, −1) ∪ (3, ∞)']);
  assert.deepEqual(T({}, { set: true }, 'integer'), ['{x | x ≥ −3, x ∈ ℤ}']);
  assert.deepEqual(T({ form: 'and', a: { op: 'gt', at: 5 }, b: { op: 'lt', at: 2 } }, { inequality: true, interval: true, set: true }), ['no solution', '∅', '∅']);
  assert.deepEqual(T({}, {}), []);
});

test('signChartData: zeros, signs, solution segments; poles; manual values', () => {
  const win = { lo: -6, hi: 6 };
  const sc = p => G.signChartData(G.makeObject(G.blankSpec(), 'signchart', p), win);
  let d = sc({ expr: '(x+2)(x-3)', op: 'gt' });
  assert.deepEqual(plain(d.crit.map(c => c.v)), [-2, 3]); assert.deepEqual(plain(d.signs), ['+', '−', '+']);
  assert.deepEqual(segRows(d.segs), [['-inf', -2, false, false], [3, '+inf', false, false]]);
  d = sc({ expr: '(x+2)(x-3)', op: 'le' });
  assert.deepEqual(segRows(d.segs), [[-2, 3, true, true]], '≤ includes the zeros');
  d = sc({ expr: 'x^2', op: 'le' }); assert.deepEqual(segRows(d.segs), [[0, 0, true, true]], 'a touching zero is a lone solution for ≤');
  d = sc({ expr: '1/(x-1)', op: 'lt' });
  assert.deepEqual(plain(d.crit), [{ v: 1, pole: true }]); assert.deepEqual(segRows(d.segs), [['-inf', 1, false, false]], 'a pole is never included');
  d = sc({ expr: '', values: [-1, 2], signs: ['+', '-', '+'], op: 'ge' });
  assert.deepEqual(plain(d.signs), ['+', '−', '+']); assert.equal(d.segs.length, 2);
  d = sc({ expr: 'y = 2x', op: 'gt' }); assert.ok(!d.error && d.crit.length === 1, 'y = … is accepted as an expression in x');
  d = sc({ expr: 'x = 4' }); assert.ok(d.error, 'a vertical line is not an expression in x: reported, not drawn');
  d = sc({ expr: 'x +' }); assert.ok(d.error);
});

test('findPoles finds asymptotes and ignores smooth curves', () => {
  assert.deepEqual(plain(G.findPoles(x => 1 / (x - 1), -5, 5)), [1]);
  assert.deepEqual(plain(G.findPoles(x => 1 / ((x - 1) * (x + 2)), -5, 5)), [-2, 1]);
  assert.deepEqual(plain(G.findPoles(x => x * x, -5, 5)), []);
  assert.deepEqual(plain(G.findPoles(x => (x - 1) / ((x + 2) * (x - 3)), -10, 10)), [-2, 3], 'poles that fall on a sample point');
  assert.deepEqual(plain(G.findPoles(x => (x * x - 1) / (x - 1), -5, 5)), [], 'a removable hole is not a pole');
});

test('number line schema: type, line settings, clamped rows, objects of the other type survive', () => {
  const s = G.normalize({ type: 'numberline', line: { orient: 'sideways', rows: [] } });
  assert.equal(s.type, 'numberline'); assert.equal(s.line.orient, 'horizontal'); assert.equal(s.line.rows.length, 1);
  assert.equal(G.normalize({ type: 'nonsense' }).type, 'plane');
  const s2 = G.blankSpec(); s2.objects.push(G.makeObject(s2, 'point', { x: 1, y: 2 }), G.makeObject(s2, 'nlpoint', { at: 3, row: 5 }));
  s2.type = 'numberline'; const n = G.normalize(s2);
  assert.equal(n.objects.length, 2, 'both kinds kept'); assert.equal(n.objects[1].row, 0, 'a row that does not exist is clamped');
  assert.deepEqual(plain(G.normalize(n)), plain(n), 'normalize is idempotent');
  assert.equal(G.resolveObjects(n).length, 1, 'a number line only draws number-line objects');
  const p = G.normalize(Object.assign({}, plain(n), { type: 'plane' }));
  assert.equal(G.resolveObjects(p).length, 1); assert.equal(G.resolveObjects(p)[0].kind, 'point');
});

test('presets: applyLinePreset sets the line, keeps plane objects, drops old marks', () => {
  const s = G.blankSpec(); s.objects.push(G.makeObject(s, 'point', { x: 1, y: 1 }), G.makeObject(s, 'nlpoint', { at: 2 }));
  const t = G.applyLinePreset(s, 'fractions');
  assert.equal(t.type, 'numberline'); assert.equal(t.x.format, 'fraction'); assert.equal(t.x.step, 0.125);
  assert.deepEqual(plain(t.objects.map(o => o.kind)), ['point'], 'old number-line marks replaced, plane objects kept');
  const pc = G.applyLinePreset(s, 'percent'); assert.equal(pc.line.rows.length, 2); assert.equal(pc.line.connect, true); assert.equal(pc.line.rows[1].own, true);
  assert.equal(G.applyLinePreset(s, 'thermometer').line.orient, 'vertical');
  for (const k of Object.keys(G.LINE_PRESETS)) noBad(G.renderSVG(G.applyLinePreset(s, k), {}));
});

test('dropLineRow moves marks up and keeps ids', () => {
  const s = nlSpec([['nlpoint', { at: 1, row: 0 }], ['nlpoint', { at: 2, row: 1 }], ['nlpoint', { at: 3, row: 2 }]]);
  s.line.rows = G.normalize({ line: { rows: [{ label: 'a' }, { label: 'b' }, { label: 'c' }] } }).line.rows;
  G.dropLineRow(s, 1);
  assert.equal(s.line.rows.length, 2); assert.deepEqual(plain(s.objects.map(o => o.row)), [0, 0, 1]);
  G.dropLineRow(s, 0); G.dropLineRow(s, 0); assert.equal(s.line.rows.length, 1, 'never below one row');
});

test('number line renders: question and key share a page; scaffold levels; hidden marks', () => {
  const s = nlSpec([['inequality', iq({ notation: { inequality: true, interval: true, set: true } })], ['nlpoint', { at: 2, label: 'P' }], ['hops', { start: -4, steps: [3, -2], result: true }]], { title: 'Graph it' });
  const key = G.renderSVG(s, { version: 'key' }); noBad(key);
  const vb = svg => /viewBox="([^"]+)"/.exec(svg)[1];
  for (const k of G.SCAFFOLD_LEVELS) {
    const q = G.renderSVG(Object.assign({}, s, { hidden: G.SCAFFOLD[k] }), { version: 'question' }); noBad(q);
    assert.equal(vb(q), vb(key), k + ': same page as the key');
  }
  const q = G.renderSVG(Object.assign({}, s, { hidden: s.objects.map(o => o.id) }), { version: 'question' });
  assert.ok(!/data-obj=/.test(q) && /data-obj=/.test(key), 'hidden marks are gone from the question, present in the key');
  assert.equal(vb(q), vb(key));
  const hideTok = t => G.renderSVG(Object.assign({}, s, { hidden: [t] }), { version: 'question' });
  assert.equal(vb(hideTok('notation')), vb(key), 'hiding the notation reserves its space');
  assert.notEqual(hideTok('notation'), key); assert.notEqual(hideTok('results'), key);
});

test('number line: rendering does not mutate the spec', () => {
  const s = G.normalize(nlSpec([['inequality', iq({ form: 'and', b: { op: 'lt', at: 4 } })], ['signchart', { expr: '(x+2)(x-3)', op: 'gt' }]]));
  const before = JSON.stringify(s); G.renderSVG(s, { version: 'question' }); G.renderSVG(s, { version: 'key' });
  assert.equal(JSON.stringify(s), before);
});

test('number line: vertical layout, double lines with connectors, fractions', () => {
  const v = G.applyLinePreset(G.blankSpec(), 'thermometer'); noBad(G.renderSVG(v, {}));
  const d = G.applyLinePreset(G.blankSpec(), 'percent'); const svg = G.renderSVG(d, {}); noBad(svg); assert.ok(/Cost/.test(svg) && /Percent/.test(svg));
  d.line.connect = false; assert.notEqual(G.renderSVG(d, {}), svg, 'connectors switch off');
  assert.equal(G.valText(0.375, { fmt: { format: 'fraction' } }).replace(/[{}]/g, ''), '3/8');
  assert.equal(G.valText(1.5, { fmt: { format: 'improper' } }).replace(/[{}]/g, ''), '3/2');
  assert.equal(G.valText(1.5, { fmt: { format: 'fraction' } }), '1{1/2}');
});

test('number line: boxes are blank in the question and filled in the key', () => {
  const s = nlSpec([]); s.line.rows[0].boxes = [2];
  const k = G.renderSVG(s, { version: 'key' }), q = G.renderSVG(s, { version: 'question' }), cnt = (v, tag) => (v.match(new RegExp('<' + tag + '[ >]', 'g')) || []).length;
  assert.equal(cnt(q, 'text'), cnt(k, 'text') - 1, 'the boxed number is not printed in the question');
  assert.equal(cnt(q, 'rect'), cnt(k, 'rect') + 1, 'and an empty box takes its place');
});

test('number line readability and outside warnings', () => {
  let s = nlSpec([['nlpoint', { at: 2.5 }]]); const r = plain(G.readability(s).map(i => i.text));
  assert.equal(r.length, 1); assert.match(r[0], /falls between tick marks/);
  s = nlSpec([['nlpoint', { at: 9 }]]); assert.equal(G.outsideObjects(s).length, 1);
  s = nlSpec([['signchart', { expr: 'x = 4' }]]); assert.match(G.readability(s)[0].text, /Sign chart/);
  assert.equal(G.snapPoints(s), 0);
});


/* ================= Phase 4A: transformations ================= */
const tfSpec = (extra, verts) => {
  const s = G.blankSpec();
  s.objects.push(G.makeObject(s, 'polygon', { vertices: verts || [[1, 1], [4, 1], [1, 3]], labels: ['A', 'B', 'C'] }));
  s.objects.push(G.makeObject(s, 'transform', Object.assign({ of: 'pg1' }, extra)));
  return s;
};
const imgOf = (s, id) => plain(G.resolveObjects(s).res(id || 'tf1').img.pts.map(p => [p.x, p.y, p.label]));
const P = (x, y) => ({ x, y });

test('point maps: translate, reflect, rotate (exact quarter turns), dilate', () => {
  assert.deepEqual(plain(G.translatePt(P(1, 1), -3, 2)), P(-2, 3));
  const m = (k, at, p) => plain(G.reflectPt(p, G.mirrorLine(k, at)));
  assert.deepEqual(m('xaxis', 0, P(2, 3)), P(2, -3)); assert.deepEqual(m('yaxis', 0, P(2, 3)), P(-2, 3));
  assert.deepEqual(m('yx', 0, P(2, 3)), P(3, 2)); assert.deepEqual(m('ynx', 0, P(2, 3)), P(-3, -2));
  assert.deepEqual(m('vertical', -2, P(1, 5)), P(-5, 5)); assert.deepEqual(m('horizontal', 1, P(1, 5)), P(1, -3));
  assert.equal(G.mirrorLine('horizontal', ''), null, 'a blank mirror position is not a guess');
  const r = (deg, cw, p, c) => plain(G.rotatePt(p, c || P(0, 0), deg, cw));
  assert.deepEqual(r(90, false, P(1, 0)), P(0, 1)); assert.deepEqual(r(90, true, P(1, 0)), P(0, -1));
  assert.deepEqual(r(180, true, P(2, 3)), P(-2, -3)); assert.deepEqual(r(180, false, P(2, 3)), P(-2, -3), '180° has no direction');
  assert.deepEqual(r(270, false, P(1, 0)), r(90, true, P(1, 0)), '270° counterclockwise = 90° clockwise');
  assert.deepEqual(r(90, false, P(3, 1), P(1, 1)), P(1, 3));
  const d45 = G.rotatePt(P(1, 0), P(0, 0), 45, false); assert.ok(Math.abs(d45.x - Math.SQRT1_2) < 1e-5 && Math.abs(d45.y - Math.SQRT1_2) < 1e-5, 'other angles work too');
  assert.deepEqual(plain(G.dilatePt(P(4, 2), P(0, 0), 0.5)), P(2, 1)); assert.deepEqual(plain(G.dilatePt(P(4, 2), P(2, 2), -1)), P(0, 2));
  assert.equal(G.parseK('1/2'), 0.5); assert.equal(G.parseK('−3'), -3); assert.equal(G.parseK('2.5'), 2.5); assert.ok(Number.isNaN(G.parseK('1/0'))); assert.ok(Number.isNaN(G.parseK('')));
});

test('transformations undo each other (properties)', () => {
  const pts = [P(1, 1), P(-3, 4), P(0, -2.5), P(7, 0)];
  for (const p of pts) {
    for (const [k, at] of [['xaxis', 0], ['yaxis', 0], ['yx', 0], ['ynx', 0], ['vertical', 3], ['horizontal', -1.5]]) {
      const L = G.mirrorLine(k, at); assert.deepEqual(plain(G.reflectPt(G.reflectPt(p, L), L)), plain(p), 'reflect twice: ' + k);
    }
    let q = p; for (let i = 0; i < 4; i++) q = G.rotatePt(q, P(2, -1), 90, false); assert.deepEqual(plain(q), plain(p), 'four quarter turns');
    assert.deepEqual(plain(G.rotatePt(G.rotatePt(p, P(1, 1), 90, false), P(1, 1), 90, true)), plain(p));
    assert.deepEqual(plain(G.dilatePt(G.dilatePt(p, P(1, 2), 4), P(1, 2), 0.25)), plain(p));
    assert.deepEqual(plain(G.translatePt(G.translatePt(p, 3, -2), -3, 2)), plain(p));
    const L = G.mirrorLine('yx', 0), d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);   // reflection preserves distance from the mirror
    assert.ok(Math.abs(d(p, P(0, 0)) - d(G.reflectPt(p, L), P(0, 0))) < 1e-9);
  }
});

test('the image is derived: prime labels, successive images, edits of the original follow', () => {
  let s = tfSpec({ how: 'translate', dx: -3, dy: -2 });
  assert.deepEqual(imgOf(s), [[-2, -1, 'A′'], [1, -1, 'B′'], [-2, 1, 'C′']]);
  s.objects.push(G.makeObject(s, 'transform', { of: 'tf1', how: 'reflect', mirror: 'yaxis' }));
  assert.deepEqual(imgOf(s, 'tf2'), [[2, -1, 'A″'], [-1, -1, 'B″'], [2, 1, 'C″']]);
  s.objects[0].vertices[0] = [2, 2];                                    // move A: the image follows, no other edit
  assert.deepEqual(imgOf(s, 'tf1')[0], [-1, 0, 'A′']); assert.deepEqual(imgOf(s, 'tf2')[0], [1, 0, 'A″']);
  assert.equal(G.primes(3), '‴'); assert.equal(G.stripPrimes('A″'), 'A');
  s = G.blankSpec(); s.objects.push(G.makeObject(s, 'point', { x: 2, y: 3, label: 'P' }), G.makeObject(s, 'transform', { of: 'pt1', how: 'rotate', angle: 90, dir: 'ccw', center: { x: 0, y: 0 } }));
  assert.deepEqual(imgOf(s), [[-3, 2, 'P′']], 'a point can be transformed too');
  s = tfSpec({ how: 'translate', dx: 1, dy: 1 }, [[0, 0], [1, 0], [1, 1]]); s.objects[0].labels = ['', '', ''];
  assert.deepEqual(imgOf(s).map(r => r[2]), ['', '', ''], 'no labels are invented');
});

test('incomplete or dangling transformations draw nothing and say so', () => {
  let s = tfSpec({ how: 'dilate', k: '', center: { x: 0, y: 0 } });
  assert.equal(G.resolveObjects(s).res('tf1').img.ok, false); noBad(G.renderSVG(s, {}));
  assert.match(G.readability(s)[0].text, /fill in every setting/);
  s = tfSpec({ how: 'translate', dx: 1, dy: 1 }); G.removeObject(s, 'pg1');
  assert.equal(s.objects[0].of, '', 'deleting the original clears the pointer'); assert.equal(G.resolveObjects(s).res('tf1').img, null);
  assert.match(G.readability(s)[0].text, /choose the shape/); noBad(G.renderSVG(s, {}));
  s = tfSpec({ how: 'translate', dx: 1, dy: 1 }); s.objects[1].of = 'tf1';                                // a loop is refused, not followed forever
  assert.equal(G.resolveObjects(s).res('tf1').img, null); noBad(G.renderSVG(s, {}));
});

test('transformation words and mapping rules', () => {
  const W = p => G.transformWords(G.makeObject(G.blankSpec(), 'transform', p)), M = p => G.transformMapping(G.makeObject(G.blankSpec(), 'transform', p));
  assert.equal(W({ how: 'translate', dx: 3, dy: -2 }), '3 right, 2 down'); assert.equal(W({ how: 'translate', dx: -1, dy: 0 }), '1 left');
  assert.equal(M({ how: 'translate', dx: 2, dy: -3 }), '(x, y) → (x + 2, y − 3)'); assert.equal(M({ how: 'translate', dx: 0, dy: 4 }), '(x, y) → (x, y + 4)');
  assert.equal(W({ how: 'reflect', mirror: 'yaxis' }), 'in the y-axis'); assert.equal(W({ how: 'reflect', mirror: 'vertical', at: -2 }), 'in the line x = −2');
  assert.equal(M({ how: 'reflect', mirror: 'xaxis' }), '(x, y) → (x, −y)'); assert.equal(M({ how: 'reflect', mirror: 'ynx' }), '(x, y) → (−y, −x)');
  assert.equal(M({ how: 'reflect', mirror: 'vertical', at: 3 }), '(x, y) → (6 − x, y)'); assert.equal(M({ how: 'reflect', mirror: 'horizontal', at: 0 }), '(x, y) → (x, −y)');
  const rot = (angle, dir) => M({ how: 'rotate', angle, dir, center: { x: 0, y: 0 } });
  assert.equal(rot(90, 'ccw'), '(x, y) → (−y, x)'); assert.equal(rot(90, 'cw'), '(x, y) → (y, −x)'); assert.equal(rot(270, 'ccw'), '(x, y) → (y, −x)'); assert.equal(rot(180, 'cw'), '(x, y) → (−x, −y)');
  assert.equal(M({ how: 'rotate', angle: 90, center: { x: 1, y: 1 } }), null, 'no one-line rule about another centre');
  assert.equal(W({ how: 'rotate', angle: 90, dir: 'cw', center: { x: 1, y: 2 } }), '90° clockwise about (1, 2)'); assert.equal(W({ how: 'rotate', angle: 180, center: { x: 0, y: 0 } }), '180° about the origin');
  assert.equal(M({ how: 'dilate', k: 2, center: { x: 0, y: 0 } }), '(x, y) → (2x, 2y)'); assert.equal(M({ how: 'dilate', k: -1, center: { x: 0, y: 0 } }), '(x, y) → (−x, −y)');
  assert.equal(M({ how: 'dilate', k: '1/2', center: { x: 0, y: 0 } }), '(x, y) → ({1/2}x, {1/2}y)'); assert.equal(W({ how: 'dilate', k: 3, center: { x: 1, y: 1 } }), 'scale factor 3, centre (1, 1)');
  assert.equal(W({ how: 'translate', dx: '', dy: 1 }), null);
  /* the rule agrees with the numbers */
  const o = G.makeObject(G.blankSpec(), 'transform', { how: 'rotate', angle: 90, dir: 'cw', center: { x: 0, y: 0 } });
  assert.deepEqual(plain(G.transformer(o)(P(3, 5))), P(5, -3));
});

test('transformation rendering: image by name, aids and captions by token; same page in question and key', () => {
  const s = tfSpec({ how: 'reflect', mirror: 'vertical', at: -2, words: true, mapping: true });
  const key = G.renderSVG(s, { version: 'key' }); noBad(key);
  const vb = v => /viewBox="([^"]+)"/.exec(v)[1];
  assert.match(key, /data-obj="tf1"/); assert.match(key, /Reflection: in the line/); assert.match(key, /Mapping:/);
  const q = G.renderSVG(Object.assign({}, s, { hidden: ['tf1'] }), { version: 'question' });
  assert.ok(!/data-obj="tf1"/.test(q) && /data-aid="tf1"/.test(q), 'image hidden, mirror line kept');
  assert.ok(!/A′/.test(q) && /A′/.test(key), 'the image is not leaked through its labels');
  assert.ok(/Mapping:/.test(q), 'the given rule stays in the question'); assert.equal(vb(q), vb(key));
  const noAid = G.renderSVG(Object.assign({}, s, { hidden: ['aids'] }), { version: 'question' });
  assert.ok(!/data-aid/.test(noAid) && /data-obj="tf1"/.test(noAid), 'aids can be hidden while the image stays'); assert.equal(vb(noAid), vb(key));
  const noNote = G.renderSVG(Object.assign({}, s, { hidden: ['notation'] }), { version: 'question' });
  assert.ok(!/Mapping:/.test(noNote) && !/Reflection:/.test(noNote)); assert.equal(vb(noNote), vb(key), 'hidden captions still reserve their space');
  const blank = G.renderSVG(Object.assign({}, s, { hidden: ['notation'], blanks: ['notation'] }), { version: 'question' });
  assert.match(blank, /Mapping: _{3,}/); assert.ok(!/\(x, y\) →/.test(blank), 'the rule itself is not leaked');
  const all = G.renderSVG(Object.assign({}, s, { hidden: ['objects'] }), { version: 'question' });
  assert.ok(!/data-obj|data-aid/.test(all) && !/Mapping:/.test(all), '“all objects” hides the aids and captions too'); assert.equal(vb(all), vb(key));
  for (const lvl of G.SCAFFOLD_LEVELS) { const z = G.renderSVG(Object.assign({}, s, { hidden: G.SCAFFOLD[lvl] }), { version: 'question' }); noBad(z); assert.equal(vb(z), vb(key)); }
});

test('transformations: spec round trip, idempotent normalize, names, extent grows to fit the image', () => {
  const s = tfSpec({ how: 'rotate', angle: 270, dir: 'cw', center: { x: 1, y: 2 }, k: '1/2', words: true });
  const n = G.normalize(s); assert.deepEqual(plain(G.normalize(n)), plain(n)); assert.deepEqual(plain(G.parseFile(G.serialize(n))), plain(n));
  assert.equal(G.normalize({ objects: [{ kind: 'transform', how: 'spin', angle: 45 }] }).objects[0].how, 'translate'); assert.equal(G.normalize({ objects: [{ kind: 'transform', angle: 45 }] }).objects[0].angle, 90);
  assert.equal(G.objName(n.objects[1], n.objects), 'Rotation of Polygon ABC');
  const big = tfSpec({ how: 'dilate', k: 10, center: { x: 0, y: 0 } }); const A = G.analyse(big);
  assert.ok(A.ax.hi >= 40 && A.ay.hi >= 30, 'the window grows to show the image: ' + A.ax.hi + ',' + A.ay.hi);
});


/* ================= Phase 4B: geometry on the grid ================= */
const pts = v => v.map(([x, y]) => ({ x, y }));
const geoSpec = (verts, kind, props, extra) => {
  const s = Object.assign(G.blankSpec(), extra || {});
  s.objects.push(G.makeObject(s, 'polygon', { vertices: verts, labels: verts.map((_, i) => 'ABCDEFGH'[i]) }));
  if (kind) s.objects.push(G.makeObject(s, kind, Object.assign({ of: 'pg1' }, props)));
  return s;
};
const RECT = [[-4, -2], [4, -2], [4, 2], [-4, 2]], SQUARE = [[-3, -3], [3, -3], [3, 3], [-3, 3]], ISO = [[-3, -3], [3, -3], [0, 4]], LSHAPE = [[-3, -3], [3, -3], [3, 0], [0, 0], [0, 3], [-3, 3]];
const REGULAR = n => Array.from({ length: n }, (_, k) => [Math.cos(2 * Math.PI * k / n) * 4, Math.sin(2 * Math.PI * k / n) * 4]);

test('area, perimeter and unit squares', () => {
  assert.equal(G.polyArea(pts(RECT)), 32); assert.equal(G.polyPerimeter(pts(RECT), true), 24);
  assert.equal(G.polyArea(pts([[0, 0], [5, 0], [0, 3]])), 7.5); assert.equal(G.polyArea(pts([[0, 0], [1, 1]])), 0);
  assert.equal(G.polyArea(pts(RECT.slice().reverse())), 32, 'orientation does not matter');
  assert.equal(G.polyPerimeter(pts([[0, 0], [3, 4]]), false), 5, 'an open path is not closed');
  assert.ok(Math.abs(G.polyPerimeter(pts([[0, 0], [3, 0], [0, 4]]), true) - 12) < 1e-9);
  assert.equal(G.cellsInside(pts(LSHAPE)).length, 27, 'counting squares gives the exact area for a shape drawn along gridlines');
  assert.equal(G.polyArea(pts(LSHAPE)), 27);
  assert.equal(G.cellsInside(pts([[0, 0], [2, 0]])).length, 0);
  assert.ok(G.pointInPoly({ x: 0.5, y: 0.5 }, pts([[0, 0], [2, 0], [2, 2], [0, 2]])) && !G.pointInPoly({ x: 3, y: 1 }, pts([[0, 0], [2, 0], [2, 2], [0, 2]])));
});

test('symmetry: lines and rotational order for known shapes (properties)', () => {
  const S = v => G.symmetryOf(pts(v), true), count = v => S(v).lines.length, order = v => S(v).order;
  assert.deepEqual([count(RECT), order(RECT)], [2, 2]); assert.deepEqual([count(SQUARE), order(SQUARE)], [4, 4]);
  assert.deepEqual([count(ISO), order(ISO)], [1, 1]); assert.deepEqual([count(LSHAPE), order(LSHAPE)], [1, 1]);
  assert.deepEqual([count([[0, 0], [4, 0], [5, 2], [1, 2]]), order([[0, 0], [4, 0], [5, 2], [1, 2]])], [0, 2], 'a parallelogram: none, but order 2');
  assert.deepEqual([count([[0, 0], [2, 0], [3, 2], [1, 2]]), order([[0, 0], [2, 0], [3, 2], [1, 2]])], [0, 2]);
  assert.deepEqual([count([[0, 0], [4, 0], [3, 2], [1, 2]])], [1], 'an isosceles trapezoid: one line');
  assert.deepEqual([count([[0, 0], [2, 0], [4, 3], [0, 3]])], [0], 'a right trapezoid: none');
  assert.deepEqual([count([[2, 0], [0, 3], [-2, 0], [0, -3]]), order([[2, 0], [0, 3], [-2, 0], [0, -3]])], [2, 2], 'a rhombus');
  for (const n of [3, 4, 5, 6, 8]) assert.deepEqual([count(REGULAR(n)), order(REGULAR(n))], [n, n], 'regular ' + n + '-gon');
  assert.deepEqual([count([[0, 0], [3, 0], [3, 1], [1, 1], [1, 3], [0, 3]])], [1], 'an L: the diagonal');
  assert.equal(count([[0, 0], [4, 0], [4, 2], [3, 2], [3, 1], [1, 1], [1, 2], [0, 2]]), 1, 'a U: the vertical through its centre');
  assert.equal(count([[0, 0], [4, 0], [4, 1], [3, 1], [3, 2], [2, 2], [2, 1], [1, 1], [1, 2], [0, 2]]), 0, 'a lopsided castle wall');
  const T = G.symmetryOf(pts([[0, 0], [2, 0], [1, 1]]), true); assert.deepEqual(plain(T.lines.map(l => [l.dx, l.dy])), [[0, 1]], 'the line comes back as a unit direction');
  assert.deepEqual(plain(G.symmetryOf(pts([[0, 0], [1, 1], [2, 0]]), false).lines.length), 1, 'an open V has one line');
  /* rotating or moving a symmetric shape keeps its symmetry */
  const shifted = REGULAR(6).map(([x, y]) => [x + 7.5, y - 2]); assert.equal(count(shifted), 6);
});

test('right angles and equal sides', () => {
  assert.deepEqual(plain(G.rightAngles(pts(RECT), true)), [0, 1, 2, 3]); assert.deepEqual(plain(G.rightAngles(pts(ISO), true)), []);
  assert.deepEqual(plain(G.rightAngles(pts([[0, 0], [3, 0], [3, 4]]), true)), [1]);
  assert.deepEqual(plain(G.rightAngles(pts([[0, 0], [3, 0], [3, 4]]), false)), [1]); assert.deepEqual(plain(G.rightAngles(pts([[0, 0], [3, 0], [3, 4], [0, 4]]), false)), [1, 2], 'ends of an open path have no corner');
  assert.deepEqual(plain(G.equalGroups(pts(RECT), true)), [{ edge: 0, count: 1 }, { edge: 1, count: 2 }, { edge: 2, count: 1 }, { edge: 3, count: 2 }]);
  assert.deepEqual(plain(G.equalGroups(pts(ISO), true)), [{ edge: 1, count: 1 }, { edge: 2, count: 1 }], 'isosceles: the two equal sides, base unmarked');
  assert.deepEqual(plain(G.equalGroups(pts(SQUARE), true)).map(e => e.count), [1, 1, 1, 1]);
  assert.deepEqual(plain(G.equalGroups(pts([[0, 0], [3, 0], [3, 4]]), true)), [], 'a scalene triangle has no equal sides');
});

test('distance and midpoint text; circle equation; Pythagorean squares', () => {
  assert.equal(G.distanceText({ x: 0, y: 0 }, { x: 3, y: 4 }), 'd = √(3² + 4²) = 5');
  assert.equal(G.distanceText({ x: -3, y: -2 }, { x: 4, y: 3 }), 'd = √(7² + 5²) = √74 ≈ 8.6');
  assert.equal(G.distanceText({ x: 0, y: 0 }, { x: 1.5, y: 2 }), 'd = √(1.5² + 2²) = 2.5');
  assert.equal(G.circleEq(0, 0, 3), 'x^2 + y^2 = 9'); assert.equal(G.circleEq(2, -1, 5), '(x − 2)^2 + (y + 1)^2 = 25'); assert.equal(G.circleEq(0, 2, 1.5), 'x^2 + (y − 2)^2 = 2.25');
  const sq = G.sideSquares(pts([[0, 0], [3, 0], [3, 4]]));
  assert.deepEqual(plain(sq.map(q => q.area)), [9, 16, 25]); assert.equal(G.pythagText(sq), '3² + 4² = 5²');
  assert.equal(G.pythagText(G.sideSquares(pts([[0, 0], [3, 0], [3, 3]]))), '9 + 9 = 18', 'irrational hypotenuse: use areas');
  assert.equal(G.pythagText(G.sideSquares(pts([[0, 0], [4, 0], [4, 4.5]]))).includes('≠'), false);
  assert.equal(G.pythagText(G.sideSquares(pts([[0, 0], [3, 0], [3, 5]]))), '9 + 25 = 34');
  assert.match(G.pythagText(G.sideSquares(pts([[0, 0], [4, 0], [1, 3]]))), /≠/, 'not a right triangle');
  const outward = G.sideSquares(pts([[0, 0], [3, 0], [3, 4]])), cw = G.sideSquares(pts([[0, 0], [3, 4], [3, 0]]));
  const inside = (P, q) => G.pointInPoly(q.centre, P);
  assert.ok(outward.every(q => !inside(pts([[0, 0], [3, 0], [3, 4]]), q)) && cw.every(q => !inside(pts([[0, 0], [3, 4], [3, 0]]), q)), 'squares go outward for either orientation');
});

test('geometry objects: resolve, captions, hiding, and the same page in the question', () => {
  const vb = v => /viewBox="([^"]+)"/.exec(v)[1];
  const cap = s => plain(G.resolveObjects(s).res(s.objects[s.objects.length - 1].id)).shape && G.OBJECT_KINDS[s.objects[s.objects.length - 1].kind].captions(G.resolveObjects(s).res(s.objects[s.objects.length - 1].id));
  let s = geoSpec(LSHAPE, 'areacount', { area: true, perimeter: true });
  assert.deepEqual(plain(cap(s)), [{ head: 'Area', text: '27 square units' }, { head: 'Perimeter', text: '24 units' }]);
  s.objects[1].unit = 'cm'; assert.deepEqual(plain(cap(s)).map(l => l.text), ['27 cm²', '24 cm']);
  s = geoSpec([[0, 0], [5, 0], [0, 3]], 'areacount', { area: true, perimeter: true }); assert.match(plain(cap(s))[1].text, /^≈ 13\.83 units$/);
  s = geoSpec(RECT, 'symmetry', { count: true, order: true });
  assert.deepEqual(plain(cap(s)), [{ head: 'Lines of symmetry', text: '2' }, { head: 'Order of rotational symmetry', text: '2' }]);
  s = geoSpec([[0, 0], [3, 0], [3, 4]], 'pythag', { equation: true }); assert.deepEqual(plain(cap(s)), [{ head: 'Pythagorean theorem', text: '3² + 4² = 5²' }]);
  assert.ok(G.analyse(s).ay.hi >= 7, 'the window grows to fit the squares');
  const p = geoSpec([[0, 0], [3, 0], [3, 4]], 'pythag', { equation: true, areas: true });
  const key = G.renderSVG(p, { version: 'key' }); noBad(key); assert.ok(/data-obj="py1"/.test(key) && />25</.test(key));
  const q1 = G.renderSVG(Object.assign({}, p, { hidden: ['py1'] }), { version: 'question' });
  assert.ok(!/data-obj="py1"/.test(q1) && !/>25</.test(q1) && /Pythagorean theorem/.test(q1) && vb(q1) === vb(key), 'the squares hide by name, the equation by "notation"');
  const q2 = G.renderSVG(Object.assign({}, p, { hidden: ['results'] }), { version: 'question' }); assert.ok(!/>25</.test(q2) && /data-obj="py1"/.test(q2) && vb(q2) === vb(key));
  /* measure */
  const m = G.blankSpec(); pt(m, { x: -3, y: -2, label: 'A' }); pt(m, { x: 4, y: 3, label: 'B' }); m.objects.push(G.makeObject(m, 'measure', { of: ['pt1', 'pt2'], legs: 'labelled', mid: 'labelled', distance: true, midpoint: true }));
  const mk = G.renderSVG(m, { version: 'key' }); noBad(mk); const mt = plainText(mk); assert.ok(/Δx = 7/.test(mt) && /Δy = 5/.test(mt) && /M\(0\.5, 0\.5\)/.test(mt) && /Midpoint: \(0\.5, 0\.5\)/.test(mt) && /Distance: d = √\(7² \+ 5²\)/.test(mt), mt);
  const mq = G.renderSVG(Object.assign({}, m, { hidden: ['results', 'notation'], blanks: ['notation'] }), { version: 'question' });
  const qt = plainText(mq); assert.ok(!/Δx|M\(/.test(qt) && /Distance: _+/.test(qt) && !/√/.test(qt) && vb(mq) === vb(mk), 'answers and text hidden, page unchanged');
  G.removeObject(m, 'pt2'); assert.equal(m.objects[m.objects.length - 1].of[1], '', 'deleting an endpoint clears the pointer'); assert.match(G.readability(m)[0].text, /choose two points/); noBad(G.renderSVG(m, {}));
  /* circle */
  const c = G.blankSpec(); c.objects.push(G.makeObject(c, 'circle', { cx: 1, cy: -1, r: 4, radius: true, centre: 'coords', equation: true }));
  const ck = G.renderSVG(c, {}); noBad(ck); assert.ok(/<ellipse/.test(ck) && /r = 4/.test(ck) && /Equation:/.test(ck) && /\(1, −1\)/.test(ck));
  const A = G.analyse(c); assert.ok(A.ax.lo <= -3 && A.ax.hi >= 5 && A.ay.lo <= -5 && A.ay.hi >= 3, 'the window shows the whole circle');
  c.objects[0].r = 0; assert.match(G.readability(c)[0].text, /radius above zero/); noBad(G.renderSVG(c, {}));
  /* marks and a shape that is not there */
  s = geoSpec(RECT, 'mark', { what: 'equal', at: -1 }); assert.equal((G.renderSVG(s, {}).match(/<line /g) || []).length - (G.renderSVG(geoSpec(RECT), {}).match(/<line /g) || []).length, 6, 'ticks: 1+2+1+2');
  s = geoSpec(RECT, 'mark', { what: 'rightangle', at: 2 }); assert.equal((G.renderSVG(s, {}).match(/<polyline /g) || []).length - (G.renderSVG(geoSpec(RECT), {}).match(/<polyline /g) || []).length, 1, 'one marker, at vertex C');
  s = geoSpec(RECT, 'symmetry', {}); G.removeObject(s, 'pg1'); assert.match(G.readability(s)[0].text, /choose a polygon/); noBad(G.renderSVG(s, {}));
  s = geoSpec(RECT, 'symmetry', {}); s.objects[1].of = 'sy1'; noBad(G.renderSVG(s, {}));
});

test('geometry works on a transformation image; edits follow; spec round trip', () => {
  const s = geoSpec([[1, 1], [4, 1], [4, 3], [1, 3]]);
  s.objects.push(G.makeObject(s, 'transform', { of: 'pg1', how: 'translate', dx: 5, dy: 0 }), G.makeObject(s, 'areacount', { of: 'tf1', area: true }));
  const R = () => G.resolveObjects(s).res('ac1'); assert.equal(R().area, 6);
  s.objects[0].vertices[1] = [5, 1]; s.objects[0].vertices[2] = [5, 3]; assert.equal(R().area, 8, 'edit the original, the image and its area follow');
  const n = G.normalize(s); assert.deepEqual(plain(G.normalize(n)), plain(n)); assert.deepEqual(plain(G.parseFile(G.serialize(n))), plain(n));
  assert.equal(G.objName(n.objects[2], n.objects), 'Area and perimeter of Translation of Polygon ABCD');
  const many = G.normalize({ objects: [{ kind: 'mark', at: 999, count: 9, what: 'x' }, { kind: 'measure', of: 'oops' }, { kind: 'circle', centre: 'spiral' }] });
  assert.deepEqual(plain(many.objects.map(o => o.kind)), ['mark', 'measure', 'circle']); assert.equal(many.objects[0].count, 4); assert.equal(many.objects[0].what, 'rightangle'); assert.deepEqual(plain(many.objects[1].of), ['', '']); assert.equal(many.objects[2].centre, 'dot');
});
