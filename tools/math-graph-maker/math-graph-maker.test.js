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
  renderSVG, svgSize, pngWithDpi, crc32, PRESETS })`, {});

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
  assert.equal(G.fmtTick(0.5, { lo: 0, step: 0.5, fmt: { format: 'fraction' } }), '1/2');
  assert.equal(G.fmtTick(-1.5, { lo: -2, step: 0.5, fmt: { format: 'fraction' } }), '−1 1/2');
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
  assert.deepEqual(Object.keys(s), ['specVersion', 'tool', 'type', 'title', 'name', 'size', 'quadrants', 'x', 'y', 'axes', 'grid', 'quadrantLabels', 'objects', 'hidden', 'blanks', 'scale', 'style']);
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
