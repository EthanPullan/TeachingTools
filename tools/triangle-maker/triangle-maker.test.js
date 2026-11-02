// Unit tests for the Triangle Maker core (the <script id="core"> block in index.html).
// Run:  node --test tools/triangle-maker/triangle-maker.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const core = /<script id="core">([\s\S]*?)<\/script>/.exec(html)[1];
const G = vm.runInNewContext(core + `;({ fmtNum, textW, defaultSpec, normalize, serialize, parseFile, solveTriangle, anglesFromSides, placeTriangle,
  measure, classify, resolve, fitView, sideLabel, angleLabel, captionLines, drawFigure, renderSVG, mmToPx, PRESETS, crc32, pngWithDpi, footOn, SIZES })`, {});
const plain = v => JSON.parse(JSON.stringify(v));
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, a + ' vs ' + b);
const spec = (patch = {}, build = {}) => { const s = G.normalize({}); Object.assign(s, patch); Object.assign(s.build, build); return s; };
const noBad = svg => assert.ok(!/NaN|undefined|Infinity|>null</.test(svg), 'no NaN/undefined/Infinity in the SVG');

/* ---------- numbers ---------- */
test('fmtNum rounds, strips zeros in auto mode and never prints -0', () => {
  assert.equal(G.fmtNum(5, 'auto', 2), '5'); assert.equal(G.fmtNum(5.1, 'auto', 2), '5.1');
  assert.equal(G.fmtNum(5.456, 'auto', 2), '5.46'); assert.equal(G.fmtNum(5.456, '1', 2), '5.5');
  assert.equal(G.fmtNum(5, '2', 1), '5.00'); assert.equal(G.fmtNum(-0.0001, 'auto', 1), '0');
});

/* ---------- solving ---------- */
test('SSS 3-4-5 is a right triangle', () => {
  const r = G.solveTriangle(spec({}, { method: 'sss', a: 3, b: 4, c: 5 }).build);
  assert.ok(r.ok); const [A, B, C] = G.anglesFromSides(r.a, r.b, r.c);
  near(C, 90, 1e-9); near(A + B + C, 180, 1e-9);
});
test('SSS refuses sides that break the triangle inequality, and says why', () => {
  const r = G.solveTriangle(spec({}, { method: 'sss', a: 3, b: 4, c: 8 }).build);
  assert.equal(r.ok, false); assert.match(r.error, /3 \+ 4 = 7/);
});
test('SSS accepts a degenerate-but-valid sliver and rejects an exactly flat one', () => {
  assert.ok(G.solveTriangle(spec({}, { method: 'sss', a: 3, b: 4, c: 6.99 }).build).ok);
  assert.equal(G.solveTriangle(spec({}, { method: 'sss', a: 3, b: 4, c: 7 }).build).ok, false);
});
test('SAS: law of cosines (5, 4, 110° gives 7.39)', () => {
  const r = G.solveTriangle(spec({}, { method: 'sas', a: 5, b: 4, C: 110 }).build);
  near(r.c, Math.sqrt(41 + 40 * Math.cos(70 * Math.PI / 180)), 1e-9); near(r.c, 7.3946, 1e-4);
});
test('ASA and AAS give the same triangle from matching data', () => {
  const x = G.solveTriangle(spec({}, { method: 'asa', A: 30, B: 60, c: 6 }).build);
  const y = G.solveTriangle(spec({}, { method: 'aas', A: 30, B: 60, a: 3 }).build);
  near(x.a, 3, 1e-9); near(x.b, 5.196152, 1e-5); near(y.c, 6, 1e-9); near(y.b, x.b, 1e-9);
});
test('ASA refuses angles that add up to 180 or more', () => {
  const r = G.solveTriangle(spec({}, { method: 'asa', A: 100, B: 80, c: 5 }).build);
  assert.equal(r.ok, false); assert.match(r.error, /less than 180/);
});
test('SSA: one solution when a >= b, two when a < b, none when a is too short', () => {
  const one = G.solveTriangle(spec({}, { method: 'ssa', a: 7, b: 5, A: 40 }).build); assert.ok(one.ok); assert.equal(one.count, 1);
  const none = G.solveTriangle(spec({}, { method: 'ssa', a: 2, b: 5, A: 40 }).build); assert.equal(none.ok, false);
  const b = { method: 'ssa', a: 4, b: 5, A: 40 };
  const s0 = G.solveTriangle(spec({}, Object.assign({}, b, { ssaCase: 0 })).build), s1 = G.solveTriangle(spec({}, Object.assign({}, b, { ssaCase: 1 })).build);
  assert.equal(s0.count, 2); assert.ok(s0.ok && s1.ok);
  const B0 = G.anglesFromSides(s0.a, s0.b, s0.c)[1], B1 = G.anglesFromSides(s1.a, s1.b, s1.c)[1];
  assert.ok(B0 < 90 && B1 > 90); near(B0 + B1, 180, 1e-9);
  near(G.anglesFromSides(s1.a, s1.b, s1.c)[0], 40, 1e-9);            // both honour the given angle A
});
test('SSA where the second candidate would not fit reports one solution; an obtuse A with a short side fails', () => {
  assert.equal(G.solveTriangle(spec({}, { method: 'ssa', a: 3, b: 5, A: 120 }).build).ok, false);
  assert.equal(G.solveTriangle(spec({}, { method: 'ssa', a: 3, b: 3, A: 120 }).build).ok, false);
});
test('right triangles, isosceles and equilateral', () => {
  const l = G.solveTriangle(spec({}, { method: 'rightlegs', a: 3, b: 4 }).build); near(l.c, 5, 1e-12);
  const h = G.solveTriangle(spec({}, { method: 'righthyp', c: 5, a: 3 }).build); near(h.b, 4, 1e-12);
  assert.equal(G.solveTriangle(spec({}, { method: 'righthyp', c: 3, a: 5 }).build).ok, false);
  const i = G.solveTriangle(spec({}, { method: 'iso', a: 6, c: 4 }).build); assert.equal(i.a, i.b);
  assert.equal(G.solveTriangle(spec({}, { method: 'iso', a: 2, c: 4 }).build).ok, false);
  const e = G.solveTriangle(spec({}, { method: 'equi', a: 6 }).build); assert.deepEqual([e.a, e.b, e.c], [6, 6, 6]);
});
test('missing, zero and negative inputs are reported, never thrown', () => {
  for (const method of ['sss', 'sas', 'asa', 'aas', 'ssa', 'rightlegs', 'righthyp', 'iso', 'equi']) {
    for (const bad of [null, 0, -3, NaN]) {
      const b = spec({}, { method, a: bad, b: bad, c: bad, A: bad, B: bad, C: bad }).build;
      const r = G.solveTriangle(b); assert.equal(r.ok, false, method + ' with ' + bad); assert.ok(r.error);
    }
  }
});

/* ---------- placing and measuring ---------- */
test('placing keeps every side length, for every base, flip and turn', () => {
  const sol = G.solveTriangle(spec({}, { method: 'sss', a: 5, b: 6, c: 7 }).build);
  for (const orient of ['auto', 'a', 'b', 'c']) for (const flip of [false, true]) for (const rotate of [0, 33, -90]) {
    const m = G.measure(G.placeTriangle(sol, { method: 'sss', orient, flip, rotate }));
    near(m.sides[0], 5, 1e-6); near(m.sides[1], 6, 1e-6); near(m.sides[2], 7, 1e-6);
  }
});
test('right triangles sit with the right angle at the bottom left; others on side c', () => {
  const r = G.resolve(spec({}, { method: 'rightlegs', a: 3, b: 4 }));
  assert.deepEqual(plain(r.pts[2]), [0, 0]); assert.deepEqual(plain(r.pts[0]), [4, 0]); assert.deepEqual(plain(r.pts[1]), [0, 3]);
  const q = G.resolve(spec({}, { method: 'sss', a: 5, b: 6, c: 7 })); near(q.pts[0][1], 0); near(q.pts[1][1], 0);
});
test('measure: area, perimeter, centres of a 3-4-5', () => {
  const m = G.measure([[4, 0], [0, 3], [0, 0]]);
  near(m.area, 6); near(m.perimeter, 12); near(m.inradius, 1); near(m.circumradius, 2.5);
  near(m.circumcenter[0], 2); near(m.circumcenter[1], 1.5);                // hypotenuse midpoint
  near(m.orthocenter[0], 0); near(m.orthocenter[1], 0);                    // the right-angle corner
  near(m.centroid[0], 4 / 3); near(m.incenter[0], 1); near(m.incenter[1], 1);
});
test('Euler: centroid divides orthocentre to circumcentre 2:1 on a scalene triangle', () => {
  const m = G.measure([[0, 0], [7, 1], [2, 5]]), g = m.centroid, h = m.orthocenter, o = m.circumcenter;
  near(g[0], o[0] + (h[0] - o[0]) / 3, 1e-9); near(g[1], o[1] + (h[1] - o[1]) / 3, 1e-9);
});
test('collinear and coincident corners are degenerate, not NaN', () => {
  for (const pts of [[[0, 0], [1, 1], [2, 2]], [[1, 1], [1, 1], [1, 1]], [[0, 0], [4, 0], [2, 0]]]) {
    const m = G.measure(pts); assert.equal(m.degenerate, true);
    const c = G.classify(m); assert.match(c.text, /Not a triangle/);
  }
});
test('classify: by sides and by angles', () => {
  const t = (s, b) => G.classify(G.resolve(spec({}, Object.assign({ method: s }, b))).m);
  assert.equal(t('equi', { a: 6 }).bySide, 'equilateral'); assert.equal(t('equi', { a: 6 }).byAngle, 'acute');
  assert.equal(t('iso', { a: 6, c: 4 }).bySide, 'isosceles');
  assert.equal(t('sss', { a: 5, b: 6, c: 7 }).bySide, 'scalene');
  assert.equal(t('rightlegs', { a: 3, b: 4 }).byAngle, 'right'); assert.equal(t('rightlegs', { a: 4, b: 4 }).text, 'Isosceles, right triangle');
  assert.equal(t('sas', { a: 5, b: 4, C: 110 }).byAngle, 'obtuse');
  assert.equal(t('asa', { A: 30, B: 60, c: 6 }).byAngle, 'right');
});
test('classify marks exactly the equal sides and equal angles', () => {
  const c = G.classify(G.resolve(spec({}, { method: 'iso', a: 6, c: 4 })).m);
  assert.deepEqual(plain(c.sideEq), [true, true, false]); assert.deepEqual(plain(c.angEq), [true, true, false]);
  const s = G.classify(G.resolve(spec({}, { method: 'sss', a: 5, b: 6, c: 7 })).m);
  assert.deepEqual(plain(s.sideEq), [false, false, false]);
});
test('a 3-4-5 dragged onto a 0.5 grid is exactly right', () => {
  const c = G.classify(G.measure([[0, 0], [4, 0], [0, 3]])); assert.equal(c.byAngle, 'right');
});

/* ---------- labels: the question hides, the key shows ---------- */
test('unknown labels show ? on the question and the value on the key', () => {
  const s = spec({ unknown: 'x' }); s.sides[0].mode = 'unknown'; s.angles[2].mode = 'unknown';
  const R = G.resolve(s);
  assert.equal(G.sideLabel(s, R, 0, false).t, 'x'); assert.equal(G.sideLabel(s, R, 0, true).t, '3 cm'); assert.equal(G.sideLabel(s, R, 0, true).ans, true);
  assert.equal(G.angleLabel(s, R, 2, false).t, 'x'); assert.equal(G.angleLabel(s, R, 2, true).t, '90°');
});
test('side letters follow the corner names; hidden and empty custom labels draw nothing', () => {
  const s = spec({ names: ['P', 'Q', 'R'] }); s.sides[0].mode = 'letter'; s.sides[1].mode = 'ends'; s.sides[2].mode = 'custom'; s.angles[0].mode = 'hidden';
  const R = G.resolve(s);
  assert.equal(G.sideLabel(s, R, 0, false).t, 'p'); assert.equal(G.sideLabel(s, R, 1, false).t, 'RP'); assert.equal(G.sideLabel(s, R, 2, false), null);
  assert.equal(G.angleLabel(s, R, 0, false), null);
});
test('unit and decimals: no unit when switched off or "none"; fixed places when asked', () => {
  let s = spec({ showUnit: false }); assert.equal(G.sideLabel(s, G.resolve(s), 0, false).t, '3');
  s = spec({ unit: 'none' }); assert.equal(G.sideLabel(s, G.resolve(s), 0, false).t, '3');
  s = spec({ decimals: '2' }); assert.equal(G.sideLabel(s, G.resolve(s), 0, false).t, '3.00 cm');
});
test('the type caption: always, key only, blank on the question', () => {
  const R = G.resolve(spec({}));
  assert.equal(G.captionLines(spec({ typeCaption: 'always' }), R, false).length, 1);
  assert.equal(G.captionLines(spec({ typeCaption: 'key' }), R, false).length, 0);
  assert.equal(G.captionLines(spec({ typeCaption: 'key' }), R, true)[0].t, 'Scalene, right triangle');
  assert.match(G.captionLines(spec({ typeCaption: 'blank' }), R, false)[0].t, /_____/);
  assert.match(G.captionLines(spec({ typeCaption: 'blank' }), R, true)[0].t, /Scalene, right/);
});

/* ---------- the drawing ---------- */
test('every preset draws valid SVG in both versions, with every option on', () => {
  G.PRESETS.forEach(p => {
    const s = spec({ typeCaption: 'blank', caption: 'Q1', altLabel: 'unknown', fill: 'grey', colour: true }, p.b);
    s.lines.alt = [true, true, true]; s.lines.med = [true, true, true]; s.lines.bis = [true, true, true]; s.lines.perp = [true, true, true]; s.lines.midseg = true;
    Object.keys(s.points).forEach(k => { s.points[k] = true; }); s.circles.inc = s.circles.circ = true;
    s.sides.forEach(x => { x.mode = 'unknown'; }); s.angles.forEach(x => { x.mode = 'unknown'; });
    for (const version of ['question', 'key']) {
      const svg = G.renderSVG(s, { version, background: 'white' }); assert.ok(svg.startsWith('<svg'), p.name); noBad(svg);
    }
  });
});
test('question and key are the same size, so the key can be laid over the question', () => {
  const s = spec({ altLabel: 'unknown', extrasKeyOnly: true }); s.lines.alt[2] = true; s.sides[0].mode = 'unknown';
  const q = G.drawFigure(s, { version: 'question' }), k = G.drawFigure(s, { version: 'key' });
  assert.equal(q.W, k.W); assert.equal(q.H, k.H);
});
test('extras on the key only: the question has no dashed height, the key has', () => {
  const s = spec({ extrasKeyOnly: true }); s.lines.alt[2] = true;
  assert.ok(!/stroke-dasharray="3 1.6"/.test(G.renderSVG(s, { version: 'question' })));
  assert.ok(/stroke-dasharray="3 1.6"/.test(G.renderSVG(s, { version: 'key' })));
});
test('the SVG is sized in millimetres, and px overrides for PNG', () => {
  const s = spec({}), f = G.drawFigure(s, {}); assert.deepEqual([f.W, f.H], plain(G.SIZES.medium));
  assert.match(f.svg, /width="120mm" height="90mm"/);
  assert.match(G.renderSVG(s, { px: { w: 1417, h: 1063 } }), /width="1417" height="1063"/);
  assert.equal(G.mmToPx(120, 300), 1417);
});
test('transparent background draws no white rectangle', () => {
  assert.ok(/<rect width/.test(G.renderSVG(spec({}), { background: 'white' })));
  assert.ok(!/<rect width/.test(G.renderSVG(spec({}), { background: 'none' })));
});
test('real size: 1 cm on the page is 1 cm (10 mm per unit), and the box grows to fit', () => {
  const s = spec({ trueSize: true }, { method: 'sss', a: 10, b: 10, c: 10 }), f = G.drawFigure(s, {});
  near(f.L.s, 10, 1e-9); assert.ok(f.W > 100 && f.H > 87);                 // 10 cm side plus margins
  const m = spec({ trueSize: true, unit: 'mm' }); near(G.drawFigure(m, {}).L.s, 1, 1e-9);
  const inch = spec({ trueSize: true, unit: 'in' }); assert.ok(G.drawFigure(inch, {}).L.s !== 10, 'real size is ignored for units other than cm and mm');
});
test('labels never run off the figure, even a wide label on a vertical side', () => {
  const s = spec({ unit: 'in' }, { method: 'rightlegs', a: 12.345, b: 4 });   // long "12.35 in" beside a vertical side
  s.names = ['PQR', 'STU', 'VWX']; s.sides.forEach(x => { x.mode = 'ends'; });
  const f = G.drawFigure(s, {}); noBad(f.svg);
  for (const m of f.svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"/g)) { assert.ok(+m[1] > 0 && +m[1] < f.W && +m[2] > 0 && +m[2] < f.H, 'text inside the box: ' + m[0]); }
});
test('a degenerate triangle still draws, without marks or labels that would be NaN', () => {
  const s = spec({ mode: 'free' }); s.free.pts = [[0, 0], [2, 2], [4, 4]]; s.free.view = [-1, -1, 5, 5];
  const f = G.drawFigure(s, {}); assert.ok(f); noBad(f.svg);
});
test('the UI layer adds a ring for each corner only when asked', () => {
  assert.equal((G.renderSVG(spec({}), {}).match(/class="vh"/g) || []).length, 0);
  assert.equal((G.drawFigure(spec({}), { ui: true }).svg.match(/class="vh"/g) || []).length, 3);
});
test('free mode: model points map into the figure and back', () => {
  const s = spec({ mode: 'free' }); s.free.pts = [[0, 0], [6, 0], [0, 4]]; s.free.view = G.fitView(s.free.pts, 1.5);
  const f = G.drawFigure(s, {}), [mx, my] = f.L.toMM(3, 2), [x, y] = f.L.toModel(mx, my);
  near(x, 3, 1e-9); near(y, 2, 1e-9);
  const a = f.L.toMM(0, 0), b = f.L.toMM(0, 4); assert.ok(b[1] < a[1], 'model y points up the page');
});

/* ---------- files and normalising ---------- */
test('normalize fills a missing spec, fixes junk and keeps good values', () => {
  const d = G.normalize(null); assert.equal(d.mode, 'build'); assert.equal(d.sides.length, 3);
  const j = G.normalize({ mode: 'sideways', unit: 'parsec', build: { method: 'nope', rotate: 9999, ssaCase: 7 }, sides: [{ mode: 'x' }], names: ['P'] });
  assert.equal(j.mode, 'build'); assert.equal(j.unit, 'cm'); assert.equal(j.build.method, 'rightlegs'); assert.equal(j.build.rotate, 360); assert.equal(j.build.ssaCase, 0);
  assert.equal(j.sides[0].mode, 'value'); assert.equal(j.names[0], 'P'); assert.equal(j.names[2], 'C');
  assert.equal(G.normalize({ unit: 'mm', colour: true }).colour, true);
});
test('a free spec with no usable view gets one; a bad view is replaced', () => {
  const s = G.normalize({ mode: 'free', free: { pts: [[0, 0], [8, 0], [0, 6]], view: [3, 3, 1, 1] } });
  assert.ok(s.free.view && s.free.view[2] > s.free.view[0]);
});
test('save and open round-trip, and a foreign file is refused', () => {
  const s = spec({ caption: 'Hello', unit: 'mm' }, { method: 'sas', a: 5, b: 4, C: 110 }); s.sides[1].mode = 'unknown';
  assert.deepEqual(plain(G.parseFile(G.serialize(s))), plain(s));
  assert.throws(() => G.parseFile('{"tool":"something-else"}'), /not a Triangle Maker file/);
  assert.throws(() => G.parseFile('not json'), e => e.name === 'SyntaxError');   // the page tells these apart from our own errors
});
test('empty number boxes (null) survive normalising so typing is not undone', () => {
  const s = G.normalize({ build: { a: null } }); assert.equal(s.build.a, null);
  assert.equal(G.resolve(s).ok, false);                                      // right triangle needs leg a
});
test('PNG gets a 300 DPI pHYs chunk right after IHDR', () => {
  const png = new Uint8Array(33 + 25); png.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const out = G.pngWithDpi(png, 300), dv = new DataView(out.buffer);
  assert.equal(out.length, png.length + 21); assert.equal(String.fromCharCode(...out.slice(37, 41)), 'pHYs'); assert.equal(dv.getUint32(41), 11811);
});
