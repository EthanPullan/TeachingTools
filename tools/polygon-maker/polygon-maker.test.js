// Unit tests for the Polygon Maker core (the <script id="core"> block in index.html).
// Run:  node --test tools/polygon-maker/polygon-maker.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const core = /<script id="core">([\s\S]*?)<\/script>/.exec(html)[1];
const G = vm.runInNewContext(core + `;({ fmtNum, textW, defaultSpec, normalize, serialize, parseFile, solveTriangle, anglesFromSides, placeTriangle,
  measure, classify, resolve, fitView, dragCorner, lockSummary, setSideLength, cutEnds, cutGeometry, cutFromPart, parseRatio, simpleFraction, ratioText, slideCut, cutSummary, pieceLabel, cutExample, CUT_PARTS, setAngle, edgeEnds, sideTag, migrate, methodsFor, defaultMethod, oppSide, groupsOf, regularPts, buildPolygon, presetsFor, METHOD_DEFAULTS, POLY_NAMES, TOOL, LEGACY_TOOL, MAXN, QUAD_METHODS, defaultFreePts, sideLabel, angleLabel, captionLines, drawFigure, renderSVG, mmToPx, PRESETS, crc32, pngWithDpi, footOn, SIZES })`, {});
const plain = v => JSON.parse(JSON.stringify(v));
const near = (a, b, e = 1e-6) => assert.ok(Math.abs(a - b) <= e, a + ' vs ' + b);
const spec = (patch = {}, build = {}) => { const s = G.normalize({}); Object.assign(s, patch); Object.assign(s.build, build); return s; };
/* a triangle's sides, named the old way: a is opposite A (side BC), b is CA, c is AB. Side e of the model joins corner e and e+1. */
const tri3 = m => ({ a: m.sides[1], b: m.sides[2], c: m.sides[0] });
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
    const m = G.measure(G.placeTriangle(sol, { method: 'sss', orient, flip, rotate })), t = tri3(m);
    near(t.a, 5, 1e-6); near(t.b, 6, 1e-6); near(t.c, 7, 1e-6);
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
  assert.deepEqual(plain(c.sideEq), [false, true, true]); assert.deepEqual(plain(c.angEq), [true, true, false]);   // sides AB (4) | BC, CA (6); angles A, B equal
  const s = G.classify(G.resolve(spec({}, { method: 'sss', a: 5, b: 6, c: 7 })).m);
  assert.deepEqual(plain(s.sideEq), [false, false, false]);
});
test('a 3-4-5 dragged onto a 0.5 grid is exactly right', () => {
  const c = G.classify(G.measure([[0, 0], [4, 0], [0, 3]])); assert.equal(c.byAngle, 'right');
});

/* ---------- labels: the question hides, the key shows ---------- */
test('unknown labels show ? on the question and the value on the key', () => {
  const s = spec({ unknown: 'x' }); s.sides[1].mode = 'unknown'; s.angles[2].mode = 'unknown';      // side 1 is BC = 3
  const R = G.resolve(s);
  assert.equal(G.sideLabel(s, R, 1, false).t, 'x'); assert.equal(G.sideLabel(s, R, 1, true).t, '3 cm'); assert.equal(G.sideLabel(s, R, 1, true).ans, true);
  assert.equal(G.angleLabel(s, R, 2, false).t, 'x'); assert.equal(G.angleLabel(s, R, 2, true).t, '90°');
});
test('side letters follow the corner names; hidden and empty custom labels draw nothing', () => {
  const s = spec({ names: ['P', 'Q', 'R'] }); s.sides[1].mode = 'letter'; s.sides[2].mode = 'ends'; s.sides[0].mode = 'custom'; s.angles[0].mode = 'hidden';
  const R = G.resolve(s);
  assert.equal(G.sideLabel(s, R, 1, false).t, 'p');                       // a triangle's side QR is called p, after the corner opposite it
  assert.equal(G.sideLabel(s, R, 2, false).t, 'RP'); assert.equal(G.sideLabel(s, R, 0, false), null);
  assert.equal(G.angleLabel(s, R, 0, false), null);
});
test('unit and decimals: no unit when switched off or "none"; fixed places when asked', () => {
  let s = spec({ showUnit: false }); assert.equal(G.sideLabel(s, G.resolve(s), 1, false).t, '3');
  s = spec({ unit: 'none' }); assert.equal(G.sideLabel(s, G.resolve(s), 1, false).t, '3');
  s = spec({ decimals: '2' }); assert.equal(G.sideLabel(s, G.resolve(s), 1, false).t, '3.00 cm');
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
  G.presetsFor(3).forEach(p => {
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
  const s = spec({ altLabel: 'unknown', extrasKeyOnly: true }); s.lines.alt[2] = true; s.sides[1].mode = 'unknown';
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
  const d = G.normalize(null); assert.equal(d.mode, 'build'); assert.equal(d.sides.length, G.MAXN); assert.equal(d.n, 3);
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
  assert.throws(() => G.parseFile('{"tool":"something-else"}'), /not a Polygon Maker file/);
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

/* ---------- dragging with locked sides ----------
   T0 is the triangle A(0,0) B(6,0) C(2,4). Side 0 is AB, side 1 is BC, side 2 is CA; locks are listed in that order. */
const T0 = () => [[0, 0], [6, 0], [2, 4]];
const sidesOf = pts => G.measure(pts).sides, angs = pts => G.measure(pts).angles;
const sweep = (fn) => { for (let r = 0.5; r <= 12; r += 1.7) for (let a = 0; a < 360; a += 17) fn([2 + r * Math.cos(a * Math.PI / 180), 1 + r * Math.sin(a * Math.PI / 180)]); };
const WIN = [-20, -20, 20, 20];
const dist2 = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const ALL = (n, ...on) => Array.from({ length: 12 }, (_, e) => on.indexOf(e) >= 0);     // a lock list with just those sides locked
const en = e => 'side ' + 'ABC'[e] + 'ABC'[(e + 1) % 3];                                  // how the messages name a triangle's sides

test('no locks: the corner goes to the snapped target and the others do not move', () => {
  const r = G.dragCorner(T0(), 2, [2.3, 3.8], ALL(3), { step: 0.5, win: WIN });
  assert.deepEqual(plain(r.pts), [[0, 0], [6, 0], [2.5, 4]]); assert.equal(r.note, null);
});
test('no locks: the edge of the view stops the corner and says so', () => {
  const r = G.dragCorner(T0(), 2, [99, 3], ALL(3), { win: [-5, -5, 8, 8] });
  assert.equal(r.pts[2][0], 8); assert.equal(r.note, 'edge');
});
test('locking one side: the corner swings on a circle and that length never changes', () => {
  const L = sidesOf(T0());
  for (const e of [0, 1, 2]) for (let i = 0; i < 3; i++) {
    sweep(t => {
      const r = G.dragCorner(T0(), i, t, ALL(3, e), { win: WIN }); assert.ok(r.pts);
      near(sidesOf(r.pts)[e], L[e], 1e-9);
      assert.ok(!G.measure(r.pts).degenerate, 'still a real triangle');
      for (let q = 0; q < 3; q++) if (q !== i) assert.deepEqual(plain(r.pts[q]), plain(T0()[q]), 'other corners stay');
    });
  }
});
test('a locked side that does not touch the dragged corner does not hold it', () => {
  const r = G.dragCorner(T0(), 2, [3, 7], ALL(3, 0), { win: WIN });            // side AB is opposite C
  assert.deepEqual(plain(r.pts[2]), [3, 7]);
  const q = G.dragCorner(T0(), 1, [0, 9], ALL(3, 2), { win: WIN });            // side CA is opposite B
  assert.deepEqual(plain(q.pts[1]), [0, 9]);
});
test('the corner follows the pointer round its circle (nearest allowed spot)', () => {
  const q = G.dragCorner(T0(), 2, [10, 0], ALL(3, 1), { win: WIN });           // BC locked: C swings round B
  near(dist2(q.pts[2], [6, 0]), dist2(T0()[2], [6, 0]), 1e-9);
  assert.ok(q.pts[2][0] > 6, 'it went to the pointer side');
});
test('angle snapping: swinging around a locked side gives whole-degree angles at the pivot', () => {
  sweep(t => {
    const r = G.dragCorner(T0(), 2, t, ALL(3, 1), { win: WIN, snapAngle: true });          // BC locked, drag C: pivot B
    const ang = angs(r.pts)[1];
    near(ang, Math.round(ang), 1e-7); assert.ok(ang >= 1 - 1e-7 && ang <= 179 + 1e-7);
  });
  const ex = G.dragCorner([[0, 0], [6, 0], [0, 4]], 2, [0.2, 5], ALL(3, 1), { win: WIN, snapAngle: true });
  assert.ok(Math.abs(angs(ex.pts)[1] - Math.round(angs(ex.pts)[1])) < 1e-7);
});
test('a hinge (two locked sides): dragging an end opens and closes it; the third side changes', () => {
  const lock = ALL(3, 1, 2);                                                    // BC and CA meet at C
  const L = sidesOf(T0()); let sawBigger = false, sawSmaller = false;
  sweep(t => {
    for (const i of [0, 1]) {
      const m = sidesOf(G.dragCorner(T0(), i, t, lock, { win: WIN }).pts);
      near(m[1], L[1], 1e-9); near(m[2], L[2], 1e-9);
      if (m[0] > L[0] + 0.1) sawBigger = true; if (m[0] < L[0] - 0.1) sawSmaller = true;
    }
  });
  assert.ok(sawBigger && sawSmaller, 'side AB both grows and shrinks');
});
test('the hinge corner itself cannot slide, only flip across the opposite side', () => {
  const lock = ALL(3, 1, 2);
  const stay = G.dragCorner(T0(), 2, [3, 9], lock, { win: WIN }); assert.deepEqual(plain(stay.pts[2]), [2, 4]);
  const flip = G.dragCorner(T0(), 2, [3, -9], lock, { win: WIN }); assert.deepEqual(plain(flip.pts[2]), [2, -4]);
  sweep(t => { const m = sidesOf(G.dragCorner(T0(), 2, t, lock, { win: WIN }).pts), L = sidesOf(T0()); m.forEach((v, e) => near(v, L[e], 1e-9)); });
});
test('all three locked: the triangle turns and every length is kept', () => {
  const L = sidesOf(T0()), c0 = G.measure(T0()).centroid;
  sweep(t => {
    for (let i = 0; i < 3; i++) {
      const r = G.dragCorner(T0(), i, t, ALL(3, 0, 1, 2), { win: WIN }); assert.ok(r.pts);
      const m = G.measure(r.pts); m.sides.forEach((v, s) => near(v, L[s], 1e-8)); near(m.centroid[0], c0[0], 1e-8); near(m.centroid[1], c0[1], 1e-8);
    }
  });
  const q = G.dragCorner(T0(), 1, [c0[0], c0[1] + 5], ALL(3, 0, 1, 2), { win: WIN });   // pointer straight above the centre: B turns to point up
  const g = G.measure(q.pts).centroid, b = q.pts[1]; near(b[0], g[0], 1e-6); assert.ok(b[1] > g[1]);
});
test('rigid turn that would leave the view stops at the nearest turn that fits', () => {
  const win = [-1.5, -1.5, 7.5, 5.5], L = sidesOf(T0());
  const q = G.dragCorner(T0(), 1, [8 / 3, -30], ALL(3, 0, 1, 2), { win });         // B aimed straight down would drop 3.6 below the centre: out of view
  assert.ok(q.pts, 'it still turns'); assert.equal(q.note, 'edge');
  q.pts.forEach(p => assert.ok(p[0] >= win[0] - 1e-9 && p[0] <= win[2] + 1e-9 && p[1] >= win[1] - 1e-9 && p[1] <= win[3] + 1e-9));
  sidesOf(q.pts).forEach((v, i) => near(v, L[i], 1e-8));
  const tight = [-0.01, -0.01, 6.01, 4.01];                                      // a box this tight leaves no room to turn
  const none = G.dragCorner(T0(), 1, [-30, 1], ALL(3, 0, 1, 2), { win: tight });
  assert.ok(none.pts, 'the nearest allowed spot is staying (almost) put'); assert.equal(none.note, 'edge');
  none.pts.forEach((p, i) => { assert.ok(dist2(p, T0()[i]) < 0.1); assert.ok(p[0] >= tight[0] - 1e-9 && p[0] <= tight[2] + 1e-9 && p[1] >= tight[1] - 1e-9 && p[1] <= tight[3] + 1e-9); });
});
test('rigid turning with angle snap goes in whole degrees', () => {
  const r = G.dragCorner([[0, 0], [6, 0], [0, 4]], 1, [5, 4], ALL(3, 0, 1, 2), { win: WIN, snapAngle: true });
  assert.ok(r.pts);
  const rot = Math.atan2(r.pts[1][1] - r.pts[0][1], r.pts[1][0] - r.pts[0][0]) * 180 / Math.PI;
  near(rot, Math.round(rot), 1e-6);                                   // the base was level, so its new direction is a whole number of degrees
});
test('a swing that would leave the view stays on its circle, at the nearest spot in view', () => {
  const win = [-3, -3, 9, 4.5], L = sidesOf(T0());
  const r = G.dragCorner(T0(), 2, [2, 30], ALL(3, 1), { win });                  // BC locked; C pulled far above the view
  near(sidesOf(r.pts)[1], L[1], 1e-9); assert.ok(r.pts[2][1] <= 4.5 + 1e-9); assert.equal(r.note, 'edge');
});
test('a target on the pivot itself does not produce NaN', () => {
  for (const lock of [ALL(3, 1), ALL(3, 1, 2), ALL(3, 0, 1, 2)]) {
    const r = G.dragCorner(T0(), 2, [6, 0], lock, { win: WIN }); noBad(JSON.stringify(r.pts));
  }
});
test('lockSummary names the hinge corner and the unlocked side', () => {
  const s = spec({}), p = spec({ names: ['P', 'Q', 'R'].concat('DEFGHIJKL'.split('')) });
  assert.match(G.lockSummary(ALL(3), s), /freely/);
  assert.match(G.lockSummary(ALL(3, 1, 2), s), /Hinge at corner C.*sides BC and CA.*Drag A or B.*side AB/);
  assert.match(G.lockSummary(ALL(3, 0, 2), p), /Hinge at corner P.*sides PQ and RP/);
  assert.match(G.lockSummary(ALL(3, 1), s), /Side BC keeps its length/);
  assert.match(G.lockSummary(ALL(3, 0, 1, 2), s), /Rigid/);
});
test('locks default off, survive save and open, and junk is repaired', () => {
  assert.deepEqual(plain(G.normalize({}).lock), Array(12).fill(false));
  const s = G.normalize({ lock: [true, false, true] }); assert.deepEqual(plain(G.parseFile(G.serialize(s)).lock.slice(0, 3)), [true, false, true]);
  assert.deepEqual(plain(G.normalize({ lock: 'yes' }).lock), Array(12).fill(false));
});
test('locked sides get an amber highlight on screen only', () => {
  const s = spec({}); s.lock = ALL(3, 0);
  assert.match(G.drawFigure(s, { ui: true }).svg, /stroke="#e0982e" stroke-opacity="\.5"/);
  assert.ok(!/e0982e/.test(G.renderSVG(s, {})), 'never in exports');
});

/* ---------- typing a side length ---------- */
test('typing a length: only the chosen end moves, along the line it was on', () => {
  for (const [e, end] of [[0, 1], [0, 0], [1, 1], [1, 0], [2, 1], [2, 0]]) {
    const q = end ? (e + 1) % 3 : e, p = end ? e : (e + 1) % 3;
    const r = G.setSideLength(T0(), e, 9, end, ALL(3)); assert.ok(r.pts);
    near(sidesOf(r.pts)[e], 9, 1e-9);
    for (let c = 0; c < 3; c++) if (c !== q) assert.deepEqual(plain(r.pts[c]), plain(T0()[c]), 'only corner ' + q + ' moves');
    const a = T0()[p], b = T0()[q], n = r.pts[q];                           // same direction from the staying end
    near((b[0] - a[0]) * (n[1] - a[1]) - (b[1] - a[1]) * (n[0] - a[0]), 0, 1e-8);
    assert.equal(r.moved, q);
  }
});
test('typing a length shorter than the side also works', () => {
  const r = G.setSideLength(T0(), 0, 3, 1, ALL(3)); near(sidesOf(r.pts)[0], 3, 1e-9);
});
test('a locked side typed into changes and stays valid for the next lock check', () => {
  const r = G.setSideLength(T0(), 1, 5, 1, ALL(3, 1)); assert.ok(r.pts); near(sidesOf(r.pts)[1], 5, 1e-9);
});
test('when the other side at the moving corner is locked, that side keeps its length too', () => {
  const L = sidesOf(T0());
  for (const e of [0, 1, 2]) for (const end of [0, 1]) {
    const other = end ? (e + 1) % 3 : (e + 2) % 3, lock = ALL(3, other);        // the side that also touches the moving corner
    for (const v of [1, 2, 3, 4, 5, 6, 7, 8, 9]) {
      const r = G.setSideLength(T0(), e, v, end, lock, { edgeName: en });
      if (r.pts) { const m = sidesOf(r.pts); near(m[e], v, 1e-8); near(m[other], L[other], 1e-8); assert.ok(!G.measure(r.pts).degenerate); }
      else { assert.match(r.error, /has to be more than/); assert.ok(v <= r.lo + 1e-6 || v >= r.hi - 1e-6, 'refused only outside (' + r.lo + ', ' + r.hi + ') but got ' + v); }
    }
  }
});
test('the range in the message is exact: just inside works, just outside and on the edge do not', () => {
  const lock = ALL(3, 0);                                                      // AB locked; type BC and let B move (end 0)
  const r0 = G.setSideLength(T0(), 1, 100, 0, lock, { edgeName: en }); assert.ok(r0.error && r0.hi);
  assert.ok(G.setSideLength(T0(), 1, r0.hi - 1e-3, 0, lock).pts);
  assert.ok(G.setSideLength(T0(), 1, r0.lo + 1e-3, 0, lock).pts);
  assert.ok(G.setSideLength(T0(), 1, r0.hi, 0, lock).error, 'exactly flat is refused');
  assert.ok(G.setSideLength(T0(), 1, r0.lo, 0, lock).error);
  assert.match(r0.error, /With side AB locked, side BC has to be more than/);
});
test('with a lock, the nearer of the two possible places is chosen (no jump across the base)', () => {
  const lock = ALL(3, 0);                                                      // B moves; it must stay |AB| from A and be L from C
  for (const start of [T0(), [[0, 0], [6, 0], [2, -4]], [[0, 0], [6, 1], [-3, 2]]]) for (const v of [3, 5, 6.5]) {
    const r = G.setSideLength(start, 1, v, 0, lock); if (!r.pts) continue;
    const A = start[0], C = start[2], B = r.pts[1], ux = (C[0] - A[0]) / dist2(A, C), uy = (C[1] - A[1]) / dist2(A, C);
    const t = (B[0] - A[0]) * ux + (B[1] - A[1]) * uy, foot = [A[0] + t * ux, A[1] + t * uy], mirror = [2 * foot[0] - B[0], 2 * foot[1] - B[1]];
    near(dist2(mirror, C), v, 1e-8);                                           // the other solution is the mirror image across AC
    assert.ok(dist2(start[1], B) <= dist2(start[1], mirror) + 1e-9, 'chose the nearer of the two');
  }
});
test('bad input is reported, never thrown or NaN', () => {
  for (const v of [0, -2, NaN, Infinity, null, undefined]) assert.ok(G.setSideLength(T0(), 0, v, 1, ALL(3)).error);
  assert.ok(G.setSideLength([[1, 1], [1, 1], [3, 4]], 0, 5, 1, ALL(3)).error, 'two corners on top of each other');
  sweep(t => { const r = G.setSideLength(T0(), 2, Math.hypot(t[0], t[1]) + 0.01, 0, ALL(3, 1)); noBad(JSON.stringify(r)); });
});
test('moveEnd and angEnd default to the later side and are repaired', () => {
  assert.deepEqual(plain(G.normalize({}).moveEnd), Array(12).fill(1)); assert.deepEqual(plain(G.normalize({}).angEnd), Array(12).fill(1));
  assert.deepEqual(plain(G.normalize({ moveEnd: [0, 5, 'x'] }).moveEnd.slice(0, 4)), [0, 1, 1, 1]);
  assert.deepEqual(plain(G.parseFile(G.serialize(G.normalize({ moveEnd: [0, 1, 0], angEnd: [0, 0, 1] }))).angEnd.slice(0, 3)), [0, 0, 1]);
});

/* ---------- the parallel cut ---------- */
const withCut = (patch = {}, build = {}, cut = {}) => { const s = spec(patch, build); Object.assign(s.cut, { on: true }, cut); return s; };
const cross = (a, b, c, d) => (b[0] - a[0]) * (d[1] - c[1]) - (b[1] - a[1]) * (d[0] - c[0]);

test('the textbook example: DH 4, HG 6, DE 6, EF 9, HE 7 on a 17.5 base', () => {
  const s = G.cutExample(), R = G.resolve(s), cg = G.cutGeometry(s, R);
  assert.deepEqual(plain(s.names.slice(0, 3)), ['D', 'G', 'F']); near(R.m.sides[0], 10); near(R.m.sides[1], 17.5); near(R.m.sides[2], 15);   // DG, GF, FD
  near(cg.lens.dh, 4); near(cg.lens.hg, 6); near(cg.lens.de, 6); near(cg.lens.ef, 9); near(cg.lens.he, 7);
  assert.deepEqual(plain(cg.names.ends), { dh: 'DH', hg: 'HG', de: 'DE', ef: 'EF', he: 'HE' });
  assert.deepEqual(plain(cg.names.whole), ['DG', 'DF', 'GF']);
  assert.equal(s.unit, 'none'); assert.equal(s.cut.parts[0].mode, 'value'); assert.equal(s.cut.parts[1].mode, 'hidden');
});
test('HE is parallel to the chosen side for every side, every position and every triangle', () => {
  for (const b of [{ method: 'sss', a: 5, b: 6, c: 7 }, { method: 'sas', a: 5, b: 4, C: 110 }, { method: 'rightlegs', a: 3, b: 4 }, { method: 'equi', a: 6 }])
    for (const par of [0, 1, 2]) for (const t of [0.05, 0.4, 0.5, 0.93]) {
      const s = withCut({}, b, { parallel: par, pos: t }), R = G.resolve(s), cg = G.cutGeometry(s, R), n = G.cutEnds(s);
      const side = [R.pts[n.j], R.pts[n.k]];
      near(cross(cg.H, cg.E, side[0], side[1]), 0, 1e-9);                       // parallel
      near(Math.hypot(cg.E[0] - cg.H[0], cg.E[1] - cg.H[1]), t * R.m.sides[(par + 1) % 3], 1e-9);   // HE = t x the side opposite the apex
      near(Math.hypot(cg.H[0] - R.pts[par][0], cg.H[1] - R.pts[par][1]) / cg.lj, t, 1e-9);   // DH : DG = t
      near(Math.hypot(cg.E[0] - R.pts[par][0], cg.E[1] - R.pts[par][1]) / cg.lk, t, 1e-9);   // DE : DF = t
      near(cg.lens.dh + cg.lens.hg, cg.lj); near(cg.lens.de + cg.lens.ef, cg.lk);
    }
});
test('H is on the side to the next corner round and E on the side to the one after; names follow the corners', () => {
  const s = withCut({ names: ['P', 'Q', 'R'] }, {}, { parallel: 1, names: ['M', 'N'] }), n = G.cutEnds(s);
  assert.deepEqual([n.i, n.j, n.k], [1, 2, 0]); assert.deepEqual(plain(n.whole), ['QR', 'QP', 'RP']);
  assert.deepEqual(plain(n.ends), { dh: 'QM', hg: 'MR', de: 'QN', ef: 'NP', he: 'MN' });
  assert.equal(G.cutEnds(withCut({}, {}, { names: ['', '  '] })).h, 'H');         // blank names fall back
});
test('no cut when it is off or the triangle is flat', () => {
  assert.equal(G.cutGeometry(spec({}), G.resolve(spec({}))), null);
  const s = spec({ mode: 'free' }); s.cut.on = true; s.free.pts = [[0, 0], [2, 2], [4, 4]]; s.free.view = [-1, -1, 5, 5];
  assert.equal(G.cutGeometry(s, G.resolve(s)), null);
});
test('typing any part of the cut gives the position, and they agree with each other', () => {
  const s = G.cutExample(), R = G.resolve(s);
  const want = { dh: 4, hg: 6, de: 6, ef: 9, he: 7 };
  for (const part of G.CUT_PARTS) near(G.cutFromPart(s, R, part, want[part]).t, 0.4, 1e-8);   // corners are placed to 1e-9
  const t = G.cutFromPart(s, R, 'ef', 3).t; near(t, 1 - 3 / 15, 1e-8);
  s.cut.pos = t; const cg = G.cutGeometry(s, R); near(cg.lens.ef, 3, 1e-9);        // typing EF = 3 really makes EF 3
  for (const part of G.CUT_PARTS) for (const v of [0.5, 2, 3.3]) { s.cut.pos = G.cutFromPart(s, R, part, v).t; near(G.cutGeometry(s, R).lens[part], v, 1e-9); }
});
test('typing a part that is too long, zero or not a number is refused, naming the whole side', () => {
  const s = G.cutExample(), R = G.resolve(s);
  const long = G.cutFromPart(s, R, 'dh', 10); assert.match(long.error, /DH has to be less than DG, which is 10/);
  assert.match(G.cutFromPart(s, R, 'he', 17.5).error, /HE has to be less than GF, which is 17.5/);
  assert.match(G.cutFromPart(s, R, 'ef', 99).error, /EF has to be less than DF/);
  for (const v of [0, -1, NaN, Infinity, null]) assert.match(G.cutFromPart(s, R, 'dh', v).error, /above 0/);
  assert.match(G.cutFromPart(spec({}), G.resolve(spec({})), 'dh', 1).error, /Turn the parallel cut on/);
});
test('parseRatio reads decimals, fractions, ratios and percentages, and refuses the rest', () => {
  near(G.parseRatio('0.4'), 0.4); near(G.parseRatio('.4'), 0.4); near(G.parseRatio('2/5'), 0.4); near(G.parseRatio('2:5'), 0.4);
  near(G.parseRatio(' 2 / 5 '), 0.4); near(G.parseRatio('40%'), 0.4); near(G.parseRatio('12.5%'), 0.125); near(G.parseRatio('2 ÷ 5'), 0.4);
  for (const bad of ['', 'abc', '2/0', '1/', '%', '1.2.3', '-1', '2//5', '4/5/6']) assert.equal(G.parseRatio(bad), null, bad);
});
test('simpleFraction and ratioText give plain fractions, or a decimal when there is none', () => {
  assert.deepEqual(plain(G.simpleFraction(0.4)), [2, 5]); assert.deepEqual(plain(G.simpleFraction(0.5)), [1, 2]); assert.deepEqual(plain(G.simpleFraction(1 / 3)), [1, 3]);
  assert.equal(G.simpleFraction(0.3719), null); assert.equal(G.ratioText(0.4), '2/5'); assert.equal(G.ratioText(0.3719), '0.3719');
});
test('cutSummary states the ratios in the names on the figure', () => {
  assert.equal(G.cutSummary(G.cutExample(), G.resolve(G.cutExample())), 'DH : DG = 2 : 5, so DH : HG = 2 : 3. HE = 0.4 × GF.');
  const s = G.cutExample(); s.cut.pos = 0.3719; assert.match(G.cutSummary(s, G.resolve(s)), /DH ÷ DG = 0\.3719\. HE = 0\.3719 × GF\./);
  assert.equal(G.cutSummary(spec({}), G.resolve(spec({}))), '');
});
test('slideCut: projects the pointer onto the side, snaps in units along it, and stays off the ends', () => {
  const A = [0, 0], B = [10, 0];
  near(G.slideCut(A, B, [4, 7], 0), 0.4); near(G.slideCut(A, B, [4.2, -5], 0.5), 0.4); near(G.slideCut(A, B, [4.3, 0], 0.5), 0.45); near(G.slideCut(A, B, [4.3, 0], 1), 0.4);
  near(G.slideCut(A, B, [-5, 0], 0), 0.02); near(G.slideCut(A, B, [50, 0], 0), 0.98);
  near(G.slideCut([1, 1], [4, 5], [1 + 1.5, 1 + 2], 0), 0.5);                 // a slanted side
});
test('piece labels: values, ends, unknown (question vs key), custom and hidden', () => {
  const s = G.cutExample(); s.unit = 'cm'; s.showUnit = true;
  const R = G.resolve(s), cg = G.cutGeometry(s, R), set = (q, mode, text) => { s.cut.parts[q].mode = mode; s.cut.parts[q].text = text || ''; return G.pieceLabel(s, R, cg, q, false); };
  assert.equal(set(0, 'value').t, '4 cm'); assert.equal(set(1, 'ends').t, 'HG'); assert.equal(set(2, 'custom', ' x + 1 ').t, 'x + 1'); assert.equal(set(2, 'custom', ''), null); assert.equal(set(3, 'hidden'), null);
  s.cut.parts[4].mode = 'unknown'; s.unknown = 'x';
  assert.equal(G.pieceLabel(s, R, cg, 4, false).t, 'x'); assert.equal(G.pieceLabel(s, R, cg, 4, true).t, '7 cm'); assert.equal(G.pieceLabel(s, R, cg, 4, true).ans, true);
});
test('the cut draws: one more line, the names, the labels; arrowheads add two chevrons; key-only extras do not hide it', () => {
  const lines = svg => (svg.match(/<line /g) || []).length, polys = svg => (svg.match(/<polyline /g) || []).length;
  const off = spec({}, { method: 'sss', a: 5, b: 6, c: 7 }), on = withCut({}, { method: 'sss', a: 5, b: 6, c: 7 });
  assert.equal(lines(G.renderSVG(on, {})) - lines(G.renderSVG(off, {})), 1);
  const arr = withCut({}, { method: 'sss', a: 5, b: 6, c: 7 }, { arrows: true });
  assert.equal(polys(G.renderSVG(arr, {})) - polys(G.renderSVG(on, {})), 2);
  const t = svg => [...svg.matchAll(/>([^<>]+)<\/text>/g)].map(m => m[1]);
  const named = withCut({ names: ['D', 'G', 'F'] }, {}, {}); named.cut.parts.forEach(x => { x.mode = 'ends'; });
  assert.ok(['H', 'E', 'DH', 'HG', 'DE', 'EF', 'HE'].every(x => t(G.renderSVG(named, {})).includes(x)), t(G.renderSVG(named, {})).join(','));
  const keyOnly = withCut({ extrasKeyOnly: true }); assert.equal(lines(G.renderSVG(keyOnly, { version: 'question' })), lines(G.renderSVG(keyOnly, { version: 'key' })));
});
test('unknown parts hide on the question and show, bold, on the key', () => {
  const s = G.cutExample(); s.cut.parts.forEach(x => { x.mode = 'unknown'; });
  const q = G.renderSVG(s, { version: 'question' }), k = G.renderSVG(s, { version: 'key' });
  assert.equal((q.match(/>\?<\/text>/g) || []).length, 5); assert.ok(!/>\?</.test(k));
  for (const v of ['4', '6', '9', '7']) assert.ok(new RegExp('font-weight="700"[^>]*>' + v + '</text>').test(k), v + ' is bold on the key');
  const a = G.drawFigure(s, { version: 'question' }), b = G.drawFigure(s, { version: 'key' }); assert.equal(a.W, b.W); assert.equal(a.H, b.H);
});
test('every triangle, every parallel side, every position: valid SVG with all labels on, and labels stay inside the figure', () => {
  for (const p of G.presetsFor(3)) for (const par of [0, 1, 2]) for (const t of [0.05, 0.5, 0.95]) {
    const s = withCut({ caption: 'Q', typeCaption: 'blank' }, p.b, { parallel: par, pos: t, arrows: true }); s.cut.parts.forEach(x => { x.mode = 'ends'; });
    for (const version of ['question', 'key']) {
      const f = G.drawFigure(s, { version }); noBad(f.svg);
      for (const m of f.svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"/g)) assert.ok(+m[1] > 0 && +m[1] < f.W && +m[2] > 0 && +m[2] < f.H, p.name + ' ' + par + ' ' + t + ': ' + m[0]);
    }
  }
});
test('screen only: two blue rings on the cut, never in an export', () => {
  const s = G.cutExample();
  const ui = G.drawFigure(s, { ui: true }).svg, plainSvg = G.renderSVG(s, {});
  assert.equal((ui.match(/class="ch"/g) || []).length, 2); assert.match(ui, /aria-label="Slide point H along DG"/); assert.match(ui, /aria-label="Slide point E along DF"/);
  assert.ok(!/class="ch"|2f6f9f/.test(plainSvg));
  assert.equal((G.drawFigure(spec({}), { ui: true }).svg.match(/class="ch"/g) || []).length, 0);
});
test('the cut survives save and open, and junk in the file is repaired', () => {
  const s = G.cutExample(); s.cut.names = ['M', 'N']; s.cut.arrows = true; s.cut.parts[1].mode = 'custom'; s.cut.parts[1].text = 'x';
  assert.deepEqual(plain(G.parseFile(G.serialize(s))), plain(s));
  const d = G.normalize({}); assert.equal(d.cut.on, false); assert.equal(d.cut.pos, 0.4); assert.ok(d.cut.parts.every(x => x.mode === 'hidden') && d.cut.parts.length === 5);
  const j = G.normalize({ cut: { on: 'yes', parallel: 9, pos: 5, parts: [{ mode: 'zzz' }, { mode: 'value' }], names: 'HE' } });
  assert.equal(j.cut.on, false); assert.equal(j.cut.parallel, 0); assert.equal(j.cut.pos, 0.99); assert.equal(j.cut.parts[0].mode, 'hidden'); assert.equal(j.cut.parts[1].mode, 'value'); assert.deepEqual(plain(j.cut.names), ['H', 'E']);
  assert.equal(G.normalize({ cut: { pos: -1 } }).cut.pos, 0.01); assert.equal(G.normalize({ cut: { pos: 'a' } }).cut.pos, 0.4);
});

/* =====================================================================================================
   Polygons: n sides, regular shapes, the special quadrilaterals, concave and crossed shapes, locks and typing
   ===================================================================================================== */
const SCALENE5 = [[0, 0], [5, 0], [6, 3], [3, 6], [-1, 2]];                         // a pentagon with five different sides and no parallel ones
const poly = (n, patch = {}, build = {}) => { const s = G.normalize({ n }); Object.assign(s, patch); Object.assign(s.build, build); return s; };
const R4 = (method, build, patch) => G.resolve(poly(4, patch || {}, Object.assign({ method }, build)));
const sumOf = a => a.reduce((x, y) => x + y, 0);
const countOf = (svg, re) => (svg.match(re) || []).length;
const rev = pts => pts.slice().reverse();                                  // the same corners, going the other way round

test('regular polygons: equal sides, equal angles of (n-2)*180/n, a level base, counter-clockwise', () => {
  for (let n = 3; n <= 12; n++) {
    const pts = G.regularPts(n, 4), m = G.measure(pts);
    m.sides.forEach(v => near(v, 4, 1e-6)); m.angles.forEach(v => near(v, (n - 2) * 180 / n, 1e-6));
    near(pts[0][1], pts[1][1], 1e-9); assert.ok(pts[1][0] > pts[0][0], 'side 0 runs left to right along the bottom');
    assert.equal(m.sgn, 1, 'counter-clockwise'); assert.ok(m.convex && m.simple);
    near(m.area, n * 16 / (4 * Math.tan(Math.PI / n)), 1e-6);              // n s^2 / (4 tan(pi/n))
    near(sumOf(m.angles), (n - 2) * 180, 1e-6);
  }
});
test('the number of sides: 3..12 only, and each has a name and a way to be made', () => {
  assert.equal(G.MAXN, 12); for (let n = 3; n <= 12; n++) assert.ok(G.POLY_NAMES[n] && G.methodsFor(n).length && G.methodsFor(n).includes(G.defaultMethod(n)));
  assert.deepEqual(plain(G.methodsFor(5)), ['regular']); assert.equal(G.methodsFor(4).length, 7); assert.equal(G.methodsFor(3).length, 9);
  for (const bad of [2, 13, 3.5, '5', null, NaN, 100]) assert.equal(G.normalize({ n: bad }).n, 3, String(bad));
  for (let n = 3; n <= 12; n++) assert.equal(G.normalize({ n }).n, n);
});
test('every way of making a shape is a valid method for its number of sides, and has starting numbers', () => {
  for (const m of G.QUAD_METHODS.concat('regular')) assert.ok(G.METHOD_DEFAULTS[m], m);
  for (let n = 3; n <= 12; n++) for (const p of G.presetsFor(n)) assert.ok(G.methodsFor(n).includes(p.b.method), n + ' ' + p.name);
  assert.equal(G.normalize({ n: 6, build: { method: 'kite' } }).build.method, 'regular');             // a kite is not a way to make a hexagon
  assert.equal(G.normalize({ n: 4, build: { method: 'sss' } }).build.method, 'rectangle');
  assert.equal(G.normalize({ n: 3, build: { method: 'square' } }).build.method, 'rightlegs');
});

test('the special quadrilaterals are built to size and recognised for what they are', () => {
  const cases = [
    ['square', { s: 5 }, 'square', 25, 20], ['rectangle', { w: 6, h: 4 }, 'rectangle', 24, 20],
    ['parallelogram', { a: 6, b: 4, A: 60 }, 'parallelogram', 6 * 4 * Math.sin(Math.PI / 3), 20], ['rhombus', { s: 5, A: 60 }, 'rhombus', 25 * Math.sin(Math.PI / 3), 20],
    ['trapezoid', { a: 8, c: 4, h: 3, o: 1 }, 'trapezoid', (8 + 4) / 2 * 3, null], ['isotrap', { a: 8, c: 4, h: 3 }, 'isotrap', 18, null], ['kite', { w: 6, h: 4, h2: 2.5 }, 'kite', 6 * 6.5 / 2, null]
  ];
  for (const [method, b, kind, area, perim] of cases) {
    const R = R4(method, b); assert.ok(R.ok, method); assert.equal(R.cls.kind, kind, method); near(R.m.area, area, 1e-9);
    if (perim) near(R.m.perimeter, perim, 1e-9);
    near(sumOf(R.m.angles), 360, 1e-6); assert.ok(R.m.convex && R.m.simple && !R.m.degenerate);
  }
  assert.equal(R4('square', { s: 5 }).cls.text, 'Square'); assert.equal(R4('isotrap', { a: 8, c: 4, h: 3 }).cls.text, 'Isosceles trapezoid');
  assert.equal(R4('trapezoid', { a: 8, c: 4, h: 3, o: 1 }).cls.text, 'Trapezoid');
});
test('classification does not depend on how the shape is turned, flipped or which way round it is numbered', () => {
  const k = { square: { s: 5 }, rectangle: { w: 6, h: 4 }, parallelogram: { a: 6, b: 4, A: 60 }, rhombus: { s: 5, A: 60 }, trapezoid: { a: 8, c: 4, h: 3, o: 1 }, isotrap: { a: 8, c: 4, h: 3 }, kite: { w: 6, h: 4, h2: 2.5 } };
  for (const m in k) for (const [rotate, flip] of [[0, false], [37, false], [-90, true], [123, true]]) {
    const R = R4(m, Object.assign({ rotate, flip }, k[m])); assert.equal(R.cls.kind, m, m + ' rotate ' + rotate + ' flip ' + flip);
    const back = G.classify(G.measure(rev(R.pts))); assert.equal(back.kind, m, m + ' numbered backwards');       // clockwise corners
    near(G.measure(rev(R.pts)).area, R.m.area, 1e-9); near(sumOf(G.measure(rev(R.pts)).angles), 360, 1e-6);
  }
});
test('each quick start for four sides classifies as its own name', () => {
  const want = { 'Square': 'square', 'Rectangle': 'rectangle', 'Parallelogram': 'parallelogram', 'Rhombus': 'rhombus', 'Trapezoid': 'trapezoid', 'Isosceles trapezoid': 'isotrap', 'Kite': 'kite' };
  for (const p of G.presetsFor(4)) { const s = poly(4, {}, p.b); assert.equal(G.resolve(s).cls.kind, want[p.name], p.name); }
  for (let n = 5; n <= 12; n++) { const p = G.presetsFor(n)[0], R = G.resolve(poly(n, {}, p.b)); assert.equal(R.cls.kind, 'regular'); assert.equal(R.cls.text, 'Regular ' + G.POLY_NAMES[n]); }
  assert.equal(G.presetsFor(3).length, 8);
  assert.deepEqual(plain(G.presetsFor(4).map(p => !!(p.x && p.x.parArrows))), [false, false, true, true, true, true, false]);   // arrowheads where textbooks draw them
});
test('quadrilaterals that are nearly special, or not special, are not mistaken', () => {
  const cls = pts => G.classify(G.measure(pts));
  assert.equal(cls([[0, 0], [6, 0], [6, 4], [0.4, 4]]).kind, 'trapezoid');                   // one pair parallel, legs unequal
  assert.equal(cls([[0, 0], [6, 0], [7, 3], [1, 4]]).kind, 'quadrilateral');                   // nothing special
  assert.equal(cls([[0, 0], [6, 0], [6, 4], [0, 5]]).kind, 'trapezoid');                       // off a rectangle: only the two upright sides are parallel, and the others differ
  assert.equal(cls([[0, 0], [6, 0], [6, 4.1], [0, 4]]).kind, 'isotrap');                       // its bases (the upright sides) are parallel, and the other two differ by only 0.01%: equal to the tolerance
  assert.equal(cls([[0, 0], [4, 0], [4, 4], [0, 4]]).kind, 'square');
  assert.equal(cls([[0, 0], [5, 0], [5, 3], [0, 3]]).kind, 'rectangle');
  assert.equal(cls([[0, 0], [2, 0], [2, 2], [0, 4]]).kind, 'trapezoid');                       // a right trapezoid
  assert.equal(cls([[0, 0], [4, 0], [5, 3], [1, 3]]).kind, 'parallelogram');
  assert.equal(cls([[0, 0], [4, 0], [4 + 3, 4], [3, 4]]).kind, 'parallelogram');
});

test('inside angles add up to (n-2)*180 for every simple polygon, including ones with a dent, whichever way round', () => {
  const shapes = [
    [[0, 0], [4, 0], [4, 4], [2, 1], [0, 4]],                                                  // a concave pentagon: the dent is at (2,1)
    [[0, 0], [6, 0], [6, 2], [2, 2], [2, 6], [0, 6]],                                          // an L (concave hexagon)
    [[0, 0], [5, 0], [5, 1], [3, 1], [3, 3], [5, 3], [5, 4], [0, 4]]                           // a C (concave octagon)
  ];
  for (const pts of shapes) for (const p of [pts, rev(pts)]) {
    const m = G.measure(p); assert.ok(m.simple && !m.convex && !m.degenerate); near(sumOf(m.angles), (p.length - 2) * 180, 1e-6);
    assert.ok(m.angles.some(a => a > 180), 'one corner is a dent (more than 180)');
    assert.equal(G.classify(m).text, 'Concave ' + G.POLY_NAMES[p.length]);
  }
  near(G.measure(shapes[1]).area, 6 * 2 + 2 * 4, 1e-9);                                       // the L: 12 + 8
  for (const p of [shapes[0], rev(shapes[0])]) {                                              // the notch in the first shape: a wedge of 2*atan(2/3) at D, so the inside angle is the rest
    const m = G.measure(p), D = p === shapes[0] ? 3 : 1;
    near(m.angles[D], 360 - 2 * Math.atan2(2, 3) * 180 / Math.PI, 1e-6);
    near(m.area, 16 - 0.5 * 4 * 3, 1e-9);                                                      // the 4 x 4 square less the notch (base 4, height 3)
  }
});
test('a dart (concave quadrilateral) is called concave, and a bow-tie is not a simple polygon', () => {
  const dart = G.measure([[0, 0], [4, 1], [1, 1], [1, 4]]);
  assert.equal(G.classify(dart).kind, 'concave'); assert.equal(G.classify(dart).text, 'Concave quadrilateral');
  const bow = G.measure([[0, 0], [4, 4], [4, 0], [0, 4]]);
  assert.equal(bow.simple, false); assert.equal(G.classify(bow).kind, 'crossed'); assert.match(G.classify(bow).text, /Not a simple polygon/);
  const star = G.measure([0, 1, 2, 3, 4].map(k => { const a = Math.PI / 2 + k * 4 * Math.PI / 5; return [Math.cos(a), Math.sin(a)]; }));      // a pentagram
  assert.equal(star.simple, false);
});
test('a corner lying on another side counts as touching, so that shape is not simple', () => {
  assert.equal(G.measure([[0, 0], [4, 0], [4, 4], [2, 0], [0, 4]]).simple, false);              // (2,0) sits on the bottom side
  assert.equal(G.measure([[0, 0], [4, 0], [4, 4], [0, 4]]).simple, true);
});
test('flat or collapsed polygons are "not a polygon", and drawn without NaN', () => {
  for (const pts of [[[0, 0], [1, 0], [2, 0], [3, 0]], [[1, 1], [1, 1], [1, 1], [1, 1]], [[0, 0], [4, 0], [4, 0], [0, 4]]]) {
    const m = G.measure(pts); assert.equal(m.degenerate, true); assert.equal(G.classify(m).text, 'Not a polygon (the corners are in a line)');
  }
  const s = poly(4, { mode: 'free' }); s.free.pts = [[0, 0], [1, 0], [2, 0], [3, 0]]; s.free.view = [-1, -2, 4, 2];
  const f = G.drawFigure(s, {}); assert.ok(f); noBad(f.svg);
});
test('irregular and regular convex polygons are named', () => {
  assert.equal(G.classify(G.measure(SCALENE5)).text, 'Irregular pentagon');
  assert.equal(G.classify(G.measure(G.regularPts(7, 3))).text, 'Regular heptagon');
  assert.equal(G.classify(G.measure(G.regularPts(12, 3))).text, 'Regular dodecagon');
  assert.equal(G.classify(G.measure([[0, 0], [6, 0], [6, 2], [0, 2], [-1, 1]])).text, 'Irregular pentagon');
  const rectHex = [[0, 0], [4, 0], [6, 2], [4, 4], [0, 4], [-2, 2]];                           // equal angles are not enough
  assert.equal(G.classify(G.measure(rectHex)).kind, 'irregular');
});

test('matching sets: ticks are numbered by set, parallel sides by direction, and arcs by set', () => {
  const rect = G.classify(G.resolve(poly(4, {}, { method: 'rectangle', w: 6, h: 4 })).m);
  assert.deepEqual(plain(rect.sideGroup), [1, 2, 1, 2]); assert.deepEqual(plain(rect.parClass), [1, 2, 1, 2]); assert.deepEqual(plain(rect.angGroup), [1, 1, 1, 1]);
  const kite = G.classify(G.resolve(poly(4, {}, { method: 'kite', w: 6, h: 4, h2: 2.5 })).m);
  assert.deepEqual(plain(kite.sideGroup), [1, 2, 2, 1]);   // the kite starts at its bottom corner: short, long, long, short assert.deepEqual(plain(kite.parClass), [0, 0, 0, 0]);
  const para = G.classify(G.resolve(poly(4, {}, { method: 'parallelogram', a: 6, b: 4, A: 60 })).m);
  assert.deepEqual(plain(para.angGroup), [1, 2, 1, 2]);                                         // two pairs of equal angles
  const hex = G.classify(G.measure(G.regularPts(6, 3)));
  assert.deepEqual(plain(hex.parClass), [1, 2, 3, 1, 2, 3]); assert.deepEqual(plain(hex.sideGroup), [1, 1, 1, 1, 1, 1]);
  const tri = G.classify(G.measure([[0, 0], [4, 0], [2, 3]])); assert.deepEqual(plain(tri.parClass), [0, 0, 0]);           // a triangle has no parallel sides
  assert.deepEqual(plain(G.classify(G.measure(SCALENE5)).sideGroup), [0, 0, 0, 0, 0]); assert.deepEqual(plain(G.classify(G.measure(SCALENE5)).parClass), [0, 0, 0, 0, 0]);
});

test('migration: a Triangle Maker file opens with its sides, locks and end choices turned to the new numbering', () => {
  const old = JSON.parse(JSON.stringify(G.defaultSpec()));                                      // a v1 file: three of everything, side i opposite corner i
  old.tool = 'triangle-maker'; delete old.n; old.v = 1;
  old.names = ['A', 'B', 'C']; old.sides = [{ mode: 'unknown', text: '' }, { mode: 'ends', text: '' }, { mode: 'custom', text: 'x' }];
  old.lock = [true, false, false]; old.moveEnd = [0, 1, 1]; old.angles = old.angles.slice(0, 3); old.lock = old.lock.slice(0, 3);
  old.build = Object.assign({}, old.build, { method: 'rightlegs', a: 3, b: 4 });
  const s = G.parseFile(JSON.stringify(old));
  assert.equal(s.tool, 'polygon-maker'); assert.equal(s.v, 2); assert.equal(s.n, 3);
  // old side a (opposite A) is BC, which is side 1 now; old b (CA) is side 2; old c (AB) is side 0
  assert.equal(s.sides[1].mode, 'unknown'); assert.equal(s.sides[2].mode, 'ends'); assert.equal(s.sides[0].mode, 'custom'); assert.equal(s.sides[0].text, 'x');
  assert.deepEqual(plain(s.lock.slice(0, 3)), [false, true, false]); assert.deepEqual(plain(s.moveEnd.slice(0, 3)), [1, 0, 1]);
  const R = G.resolve(s);
  assert.equal(G.sideLabel(s, R, 1, false).t, '?', 'BC is the unknown side, as it was side a before'); assert.equal(G.sideLabel(s, R, 1, true).t, '3 cm');
  assert.equal(s.sides.length, 12); assert.equal(s.names.length, 12);
});
test('migration also turns the cut and the hinge correctly: the same figure draws the same', () => {
  const was = { tool: 'triangle-maker', v: 1, mode: 'build', build: { method: 'sss', a: 17.5, b: 15, c: 10, orient: 'a' }, names: ['D', 'G', 'F'], unit: 'none', showUnit: false, arcs: 'off', ticks: false,
    sides: [{ mode: 'value', text: '' }, { mode: 'hidden', text: '' }, { mode: 'hidden', text: '' }], angles: [{ mode: 'hidden' }, { mode: 'hidden' }, { mode: 'hidden' }],
    cut: { on: true, parallel: 0, pos: 0.4, names: ['H', 'E'], arrows: false, parts: [{ mode: 'value', text: '' }, { mode: 'hidden' }, { mode: 'hidden' }, { mode: 'hidden' }, { mode: 'value', text: '' }] } };
  const s = G.parseFile(JSON.stringify(was)), ex = G.cutExample();
  assert.equal(G.renderSVG(s, {}), G.renderSVG(ex, {}), 'an old file and the current example draw the same picture');
  near(G.cutGeometry(s, G.resolve(s)).lens.he, 7, 1e-9);
});
test('files: the new and the old tool name are both accepted, others are not', () => {
  assert.ok(G.parseFile(G.serialize(G.normalize({ n: 5 }))).n === 5);
  assert.ok(G.parseFile(JSON.stringify({ tool: 'triangle-maker', v: 1 })).n === 3);
  assert.throws(() => G.parseFile(JSON.stringify({ tool: 'graph-maker' })), /not a Polygon Maker file/);
  for (let n = 3; n <= 12; n++) { const s = G.normalize({ n }); assert.deepEqual(plain(G.parseFile(G.serialize(s))), plain(s), 'round trip n=' + n); }
});
test('dragged corners: exactly n pairs of numbers, or the shape starts again', () => {
  const ok = G.normalize({ n: 4, mode: 'free', free: { pts: [[0, 0], [4, 0], [4, 3], [0, 3]], view: [-1, -1, 5, 4] } });
  assert.deepEqual(plain(ok.free.pts), [[0, 0], [4, 0], [4, 3], [0, 3]]);
  assert.deepEqual(plain(G.normalize({ n: 5, free: { pts: [[0, 0], [4, 0], [0, 3]] } }).free.pts), plain(G.defaultFreePts(5)));      // wrong count
  assert.deepEqual(plain(G.normalize({ n: 3, free: { pts: [[0, 0], [4, 0], ['a', 3]] } }).free.pts), [[0, 0], [4, 0], [0, 3]]);
  assert.deepEqual(plain(G.defaultFreePts(3)), [[0, 0], [4, 0], [0, 3]]); assert.equal(G.defaultFreePts(8).length, 8);
});

test('every side and every corner has a name that fits its shape', () => {
  const s3 = poly(3), s4 = poly(4);
  assert.equal(G.edgeEnds(s3, 2), 'CA'); assert.equal(G.edgeEnds(s4, 3), 'DA'); assert.equal(G.sideTag(s3, 1), 'a · BC'); assert.equal(G.sideTag(s4, 1), 'BC');
  const R = G.resolve(poly(4, {}, { method: 'rectangle', w: 6, h: 4 })), s = poly(4, {}, { method: 'rectangle', w: 6, h: 4 });
  s.sides[0].mode = 'letter'; s.sides[3].mode = 'ends'; s.sides[1].mode = 'unknown'; s.sides[2].mode = 'value';
  assert.equal(G.sideLabel(s, R, 0, false).t, 'a'); assert.equal(G.sideLabel(s, R, 3, false).t, 'DA');
  assert.equal(G.sideLabel(s, R, 1, false).t, '?'); assert.equal(G.sideLabel(s, R, 1, true).t, '4 cm'); assert.equal(G.sideLabel(s, R, 2, false).t, '6 cm');
  const named = poly(5, { names: ['P', 'Q', 'R', 'S', 'T'].concat('FGHIJKL'.split('')) }); assert.equal(G.edgeEnds(named, 4), 'TP');
});
test('the name-this-shape caption works for every kind of shape', () => {
  const R = G.resolve(poly(4, { typeCaption: 'blank' }, { method: 'rhombus', s: 5, A: 60 }));
  assert.match(G.captionLines(poly(4, { typeCaption: 'blank' }), R, false)[0].t, /^Name of this shape: _+$/);
  assert.equal(G.captionLines(poly(4, { typeCaption: 'blank' }), R, true)[0].t, 'Name of this shape: Rhombus');
  assert.match(G.captionLines(poly(3, { typeCaption: 'blank' }), G.resolve(poly(3)), false)[0].t, /^Type of triangle: _+$/);
  assert.equal(G.captionLines(poly(6, { typeCaption: 'always' }, { method: 'regular', s: 3 }), G.resolve(poly(6, {}, { method: 'regular', s: 3 })), false)[0].t, 'Regular hexagon');
});

test('bad measurements for any shape are reported, never thrown', () => {
  const methods = { regular: 6, square: 4, rectangle: 4, parallelogram: 4, rhombus: 4, trapezoid: 4, isotrap: 4, kite: 4 };
  for (const m in methods) for (const bad of [null, 0, -3, NaN]) {
    const s = poly(methods[m], {}, { method: m, s: bad, w: bad, h: bad, h2: bad, a: bad, b: bad, c: bad, A: bad, o: bad });
    const R = G.resolve(s); assert.equal(R.ok, false, m + ' with ' + bad); assert.ok(R.error);
  }
  for (const A of [0, 180, 200, -5]) assert.equal(G.resolve(poly(4, {}, { method: 'parallelogram', a: 6, b: 4, A })).ok, false, 'angle ' + A);
  assert.equal(G.resolve(poly(4, {}, { method: 'trapezoid', a: 8, c: 4, h: 3, o: -5 })).ok, true, 'a top shifted well to the left is still a trapezoid');
  assert.equal(G.resolve(poly(4, {}, { method: 'trapezoid', a: 8, c: 4, h: 3, o: null })).ok, false);
});
test('a typed angle on a parallelogram or rhombus gives that angle, and rotation turns the whole shape', () => {
  const R = G.resolve(poly(4, {}, { method: 'parallelogram', a: 6, b: 4, A: 75 })); near(R.m.angles[0], 75, 1e-6); near(R.m.angles[1], 105, 1e-6);
  const T = G.resolve(poly(4, {}, { method: 'rhombus', s: 5, A: 75, rotate: 30 })); near(T.m.angles[0], 75, 1e-6); T.m.sides.forEach(v => near(v, 5, 1e-6));
  assert.ok(Math.abs(T.pts[1][1] - T.pts[0][1]) > 1, 'it is turned');
});

/* ---------- dragging corners of polygons, with locks ---------- */
const SQ = () => [[0, 0], [4, 0], [4, 4], [0, 4]];                                           // corners A B C D; sides AB BC CD DA = 0 1 2 3
const PENT = () => G.regularPts(5, 4);
test('a polygon corner is held by the two sides that touch it: side i-1 and side i', () => {
  for (const [n, pts] of [[4, SQ()], [5, PENT()]]) for (let i = 0; i < n; i++) {
    const pv = (i + n - 1) % n, nx = (i + 1) % n, L = G.measure(pts).sides;
    sweep(t => {
      const a = G.dragCorner(pts, i, t, ALL(n, i), { win: WIN });                            // the side going on from the corner
      near(G.measure(a.pts).sides[i], L[i], 1e-8);
      const b = G.dragCorner(pts, i, t, ALL(n, pv), { win: WIN });                           // the side coming in to the corner
      near(G.measure(b.pts).sides[pv], L[pv], 1e-8);
      const c = G.dragCorner(pts, i, t, ALL(n, pv, i), { win: WIN }); const mc = G.measure(c.pts).sides; near(mc[pv], L[pv], 1e-8); near(mc[i], L[i], 1e-8);
      for (let q = 0; q < n; q++) if (q !== i) { assert.deepEqual(plain(a.pts[q]), plain(pts[q])); assert.deepEqual(plain(c.pts[q]), plain(pts[q])); }
    });
    const away = [(i + 2) % n]; const far = G.dragCorner(pts, i, [1.7, 9], ALL(n, away[0]), { win: WIN }); assert.deepEqual(plain(far.pts[i]), [1.7, 9], 'a side that does not touch the corner does not hold it');
  }
});
test('a side from the last corner back to the first (the closing side) is locked like any other', () => {
  const r = G.dragCorner(SQ(), 3, [-3, 9], ALL(4, 3), { win: WIN });                          // side DA locked: D swings round A
  near(dist2(r.pts[3], r.pts[0]), 4, 1e-9);
  const q = G.dragCorner(SQ(), 0, [-9, -3], ALL(4, 3), { win: WIN });                         // ...and A swings round D
  near(dist2(q.pts[0], q.pts[3]), 4, 1e-9);
});
test('a corner between two locked sides of a quadrilateral can only flip, and every other corner is untouched', () => {
  const lock = ALL(4, 0, 1);                                                                  // AB and BC meet at B
  const stay = G.dragCorner(SQ(), 1, [5, 1], lock, { win: WIN }); assert.deepEqual(plain(stay.pts[1]), [4, 0]);
  const flip = G.dragCorner(SQ(), 1, [-1, 3], lock, { win: WIN }); assert.deepEqual(plain(flip.pts[1]), [0, 4]);   // the only other place that is 4 from A and 4 from C
  for (const i of [0, 2, 3]) assert.deepEqual(plain(G.dragCorner(SQ(), 1, [-1, 3], lock, { win: WIN }).pts[i]), plain(SQ()[i]));
});
test('every side of a pentagon locked: it keeps its size and shape, and turns', () => {
  const L = G.measure(PENT()).sides, A = G.measure(PENT()).angles;
  sweep(t => { for (let i = 0; i < 5; i++) { const r = G.dragCorner(PENT(), i, t, ALL(5, 0, 1, 2, 3, 4), { win: WIN }); const m = G.measure(r.pts); m.sides.forEach((v, e) => near(v, L[e], 1e-8)); m.angles.forEach((v, e) => near(v, A[e], 1e-6)); } });
});
test('with n-1 of the sides locked a corner is still free: the rigid turn is only for all of them', () => {
  const r = G.dragCorner(PENT(), 2, [9, 9], ALL(5, 0, 1, 2, 3), { win: WIN });                 // side 4 (EA) is the free one; corner C touches sides 1 and 2, both locked
  const L = G.measure(PENT()).sides, m = G.measure(r.pts).sides; near(m[1], L[1], 1e-8); near(m[2], L[2], 1e-8);
});

/* ---------- typing sides and angles of polygons ---------- */
test('typing a side length on a quadrilateral moves one end, including across the closing side', () => {
  for (let e = 0; e < 4; e++) for (const end of [0, 1]) {
    const q = end ? (e + 1) % 4 : e, r = G.setSideLength(SQ(), e, 7, end, ALL(4), { edgeName: en }); assert.ok(r.pts);
    near(G.measure(r.pts).sides[e], 7, 1e-9); assert.equal(r.moved, q);
    for (let c = 0; c < 4; c++) if (c !== q) assert.deepEqual(plain(r.pts[c]), plain(SQ()[c]));
  }
});
test('typing a side length keeps the neighbouring locked side, in a quadrilateral too', () => {
  const L = G.measure(SQ()).sides;
  for (let e = 0; e < 4; e++) for (const end of [0, 1]) {
    const other = end ? (e + 1) % 4 : (e + 3) % 4, lock = ALL(4, other);
    for (const v of [1, 2, 3.5, 5, 6, 7]) {
      const r = G.setSideLength(SQ(), e, v, end, lock, { edgeName: x => 'side ' + 'ABCD'[x] + 'ABCD'[(x + 1) % 4] });
      if (r.pts) { const m = G.measure(r.pts).sides; near(m[e], v, 1e-8); near(m[other], L[other], 1e-8); }
      else { assert.match(r.error, /^With side [A-D][A-D] locked, side [A-D][A-D] has to be more than/); assert.ok(v <= r.lo + 1e-6 || v >= r.hi - 1e-6); }
    }
  }
});
test('typing an angle: the chosen side swings about the corner and the angle comes out exactly', () => {
  let exact = 0, crossed = 0;
  for (const pts of [SQ(), rev(SQ()), PENT(), rev(PENT()), G.regularPts(8, 3)]) {
    const n = pts.length;
    for (let i = 0; i < n; i++) for (const which of [0, 1]) for (const A of [40, 90, 135, 200, 300]) {
      const r = G.setAngle(pts, i, A, which, ALL(n)); assert.ok(r.pts, n + ' ' + i + ' ' + which + ' ' + A);
      const m = G.measure(r.pts), q = which ? (i + 1) % n : (i + n - 1) % n;
      near(dist2(r.pts[i], r.pts[q]), dist2(pts[i], pts[q]), 1e-8);                              // the swinging side keeps its length
      for (let c = 0; c < n; c++) if (c !== q) assert.deepEqual(plain(r.pts[c]), plain(pts[c]), 'only corner ' + q + ' moves');
      assert.equal(r.moved, q);
      if (m.simple) { near(m.angles[i], A, 1e-6); exact++; }                                     // whenever the result is a proper polygon, the angle is what was typed
      else { crossed++; assert.equal(G.classify(m).kind, 'crossed'); assert.ok(A > 180, 'only a reflex angle can cross a convex shape over'); }
    }
  }
  assert.equal(exact + crossed, 26 * 2 * 5);                                                       // 26 corners, 2 sides each, 5 angles assert.ok(exact >= 200 && crossed > 0, 'many reflex requests cross a convex shape over, but every proper result is exact (' + exact + ' exact, ' + crossed + ' crossed)');
  for (const A of [40, 90, 135]) for (const pts of [SQ(), PENT()]) for (let i = 0; i < pts.length; i++) { const m = G.measure(G.setAngle(pts, i, A, 1, ALL(pts.length)).pts); assert.ok(m.simple); near(m.angles[i], A, 1e-6); }
  const dart = [[0, 0], [4, 1], [1, 1], [1, 4]];                                                 // a dent can be opened and closed too: corner 2 is the dent
  for (const A of [200, 250, 270, 300]) for (const which of [0, 1]) { const m = G.measure(G.setAngle(dart, 2, A, which, ALL(4)).pts); assert.ok(m.simple && !m.convex); near(m.angles[2], A, 1e-6); }
});
test('typing an angle on a triangle: under 180 only, and the other angles follow', () => {
  const r = G.setAngle(T0(), 0, 50, 1, ALL(3)); near(G.measure(r.pts).angles[0], 50, 1e-6); near(sumOf(G.measure(r.pts).angles), 180, 1e-6);
  assert.match(G.setAngle(T0(), 0, 180, 1, ALL(3)).error, /less than 180° in a triangle/); assert.match(G.setAngle(T0(), 0, 200, 1, ALL(3)).error, /less than 180°/);
  assert.match(G.setAngle(SQ(), 0, 360, 1, ALL(4)).error, /less than 360°/);
});
test('typing an angle is refused when the swinging corner is held by a locked side, and says which side to free', () => {
  const r = G.setAngle(SQ(), 0, 60, 1, ALL(4, 1), { edgeName: x => 'side ' + 'ABCD'[x] + 'ABCD'[(x + 1) % 4] });   // B swings; BC is locked
  assert.match(r.error, /^Side BC is locked, so swinging side AB would stretch it\. Unlock side BC, or swing the other side\.$/);
  const ok = G.setAngle(SQ(), 0, 60, 0, ALL(4, 1)); assert.ok(ok.pts, 'swinging the other side is fine');
  assert.ok(G.setAngle(SQ(), 0, 60, 1, ALL(4, 0, 3)).pts, 'locks on the sides at the corner itself do not matter: their lengths are kept');
  near(dist2(G.setAngle(SQ(), 0, 60, 1, ALL(4, 0)).pts[0], G.setAngle(SQ(), 0, 60, 1, ALL(4, 0)).pts[1]), 4, 1e-9);
});
test('typing an angle: bad input and flat shapes are reported', () => {
  for (const v of [0, -10, NaN, Infinity, null, undefined]) assert.match(G.setAngle(SQ(), 0, v, 1, ALL(4)).error, /above 0°/);
  assert.match(G.setAngle([[0, 0], [1, 0], [2, 0], [3, 0]], 1, 90, 1, ALL(4)).error, /flat/);
});
test('typing an angle of 90 on a skewed quadrilateral squares the corner, and the shape is then recognised', () => {
  const r = G.setAngle([[0, 0], [4, 0], [5, 3], [1, 3]], 0, 90, 1, ALL(4));                   // B swings: AB keeps length 4, now straight up from A... a different shape
  near(G.measure(r.pts).angles[0], 90, 1e-7); assert.equal(G.classify(G.measure(r.pts)).rightAt[0], true);
});

test('lock summaries talk about the sides by name for any shape', () => {
  const s4 = poly(4);
  assert.match(G.lockSummary(ALL(4), s4), /freely/); assert.match(G.lockSummary(ALL(4, 0, 1, 2, 3), s4), /Rigid: the quadrilateral keeps its size and shape/);
  assert.match(G.lockSummary(ALL(4, 2), s4), /Side CD keeps its length/); assert.match(G.lockSummary(ALL(4, 0, 2), s4), /Sides AB, CD keep their lengths/);
  assert.match(G.lockSummary(ALL(5, 4), poly(5)), /Side EA keeps its length/); assert.match(G.lockSummary(ALL(6, 0, 1, 2, 3, 4, 5), poly(6)), /Rigid: the hexagon/);
});

/* ---------- drawing polygons ---------- */
test('every number of sides, every quick start, both versions, with every option on: valid SVG, labels inside the figure', () => {
  for (let n = 3; n <= 12; n++) for (const p of G.presetsFor(n)) {
    const s = poly(n, { typeCaption: 'blank', caption: 'Q1', fill: 'grey', colour: true, diag: 'all', parArrows: true }, p.b);
    s.sides.forEach(x => { x.mode = 'unknown'; }); s.angles.forEach(x => { x.mode = 'unknown'; });
    for (const version of ['question', 'key']) {
      const f = G.drawFigure(s, { version }); assert.ok(f.svg.startsWith('<svg'), n + ' ' + p.name); noBad(f.svg);
      for (const m of f.svg.matchAll(/<text x="([\d.-]+)" y="([\d.-]+)"/g)) assert.ok(+m[1] > 0 && +m[1] < f.W && +m[2] > 0 && +m[2] < f.H, n + ' ' + p.name + ': ' + m[0]);
    }
  }
});
test('concave and crossed shapes draw too, with the arc on a dent going the long way round', () => {
  const s = poly(5, { mode: 'free' }); s.free.pts = [[0, 0], [4, 0], [4, 4], [2, 1], [0, 4]]; s.free.view = [-1, -1, 5, 5];
  const f = G.drawFigure(s, {}); noBad(f.svg);
  // A and B are right angles (squares). C and E match at 33.7: the second set of equal angles, so three arcs each. D is the dent: 292.6 degrees, alone, so one arc, and a large one
  assert.equal(countOf(f.svg, / A[\d.]+ [\d.]+ 0 1 [01] /g), 1, 'exactly one large arc: the dent');
  assert.equal(countOf(f.svg, /<path /g), 3 + 3 + 1, 'three arcs each at C and E, one at the dent');
  const bow = poly(4, { mode: 'free' }); bow.free.pts = [[0, 0], [4, 4], [4, 0], [0, 4]]; bow.free.view = [-1, -1, 5, 5]; noBad(G.drawFigure(bow, {}).svg);
  const flipped = poly(5, { mode: 'free' }); flipped.free.pts = rev(s.free.pts); flipped.free.view = [-1, -1, 5, 5];
  assert.equal(countOf(G.renderSVG(flipped, {}), / A[\d.]+ [\d.]+ 0 1 [01] /g), 1, 'the same shape numbered the other way round still has exactly one large arc, the dent');
  assert.equal(countOf(G.renderSVG(flipped, {}), /<path /g), 2 + 2 + 1, 'numbered the other way round, the 33.7 pair is the first set (two arcs each); the dent is still alone');
});
test('ticks: one mark on each side of a matching pair, two on the next pair; none when switched off', () => {
  const lines = svg => countOf(svg, /<line /g);
  const rect = poly(4, { arcs: 'off', rightMark: false }, { method: 'rectangle', w: 6, h: 4 });
  assert.equal(lines(G.renderSVG(rect, {})), 2 * 1 + 2 * 2);
  rect.ticks = false; assert.equal(lines(G.renderSVG(rect, {})), 0);
  const sq = poly(4, { arcs: 'off', rightMark: false }, { method: 'square', s: 4 }); assert.equal(lines(G.renderSVG(sq, {})), 4);
  const hex = poly(6, { arcs: 'off' }, { method: 'regular', s: 3 }); assert.equal(lines(G.renderSVG(hex, {})), 6);
  const scalene = poly(5, { arcs: 'off' }); scalene.mode = 'free'; scalene.free.pts = SCALENE5; scalene.free.view = [-3, -2, 8, 8]; assert.equal(lines(G.renderSVG(scalene, {})), 0);
});
test('arrowheads: a different number for each set of parallel sides, off by default', () => {
  const chev = svg => countOf(svg, /<polyline /g);
  const para = poly(4, { arcs: 'off', rightMark: false, ticks: false }, { method: 'parallelogram', a: 6, b: 4, A: 60 });
  assert.equal(chev(G.renderSVG(para, {})), 0); para.parArrows = true; assert.equal(chev(G.renderSVG(para, {})), 2 * 1 + 2 * 2);
  const trap = poly(4, { arcs: 'off', rightMark: false, ticks: false, parArrows: true }, { method: 'trapezoid', a: 8, c: 4, h: 3, o: 1 }); assert.equal(chev(G.renderSVG(trap, {})), 2);
  const kite = poly(4, { arcs: 'off', rightMark: false, ticks: false, parArrows: true }, { method: 'kite', w: 6, h: 4, h2: 2.5 }); assert.equal(chev(G.renderSVG(kite, {})), 0);
  const hex = poly(6, { arcs: 'off', ticks: false, parArrows: true }, { method: 'regular', s: 3 }); assert.equal(chev(G.renderSVG(hex, {})), 2 * (1 + 2 + 3));
  const tri = poly(3, { arcs: 'off', rightMark: false, ticks: false, parArrows: true }); assert.equal(chev(G.renderSVG(tri, {})), 0);
});
test('arrowheads on opposite sides point the same way', () => {
  const para = poly(4, { arcs: 'off', rightMark: false, ticks: false, parArrows: true }, { method: 'parallelogram', a: 6, b: 4, A: 60 });
  const svg = G.renderSVG(para, {}), chevs = [...svg.matchAll(/<polyline points="([^"]+)"/g)].map(m => m[1].split(' ').map(p => p.split(',').map(Number)));
  assert.equal(chevs.length, 6);
  const dir = c => { const tip = c[1], mid = [(c[0][0] + c[2][0]) / 2, (c[0][1] + c[2][1]) / 2]; return [tip[0] - mid[0], tip[1] - mid[1]]; };
  const bottom = dir(chevs[0]), top = dir(chevs[1]);                                              // edges 0 and 2 first (one arrowhead each)
  assert.ok(bottom[0] * top[0] + bottom[1] * top[1] > 0, 'bottom and top arrowheads point the same way');
});
test('diagonals: none, all of them, or all from one corner; key-only works', () => {
  const lines = svg => countOf(svg, /<line /g), base = { ticks: false, arcs: 'off', rightMark: false };
  const pent = poly(5, Object.assign({ diag: 'all' }, base), { method: 'regular', s: 3 });
  assert.equal(lines(G.renderSVG(pent, {})), 5); pent.diag = 'from'; pent.diagFrom = 0; assert.equal(lines(G.renderSVG(pent, {})), 2); pent.diag = 'off'; assert.equal(lines(G.renderSVG(pent, {})), 0);
  const hex = poly(6, Object.assign({ diag: 'all' }, base), { method: 'regular', s: 3 }); assert.equal(lines(G.renderSVG(hex, {})), 9);
  const sq = poly(4, Object.assign({ diag: 'all' }, base), { method: 'square', s: 4 }); assert.equal(lines(G.renderSVG(sq, {})), 2);
  sq.diag = 'from'; sq.diagFrom = 3; assert.equal(lines(G.renderSVG(sq, {})), 1);
  sq.diag = 'all'; sq.extrasKeyOnly = true; assert.equal(lines(G.renderSVG(sq, { version: 'question' })), 0); assert.equal(lines(G.renderSVG(sq, { version: 'key' })), 2);
  assert.equal(G.normalize({ n: 5, diag: 'from', diagFrom: 9 }).diagFrom, 0, 'a corner that does not exist falls back to the first');
  assert.equal(lines(G.renderSVG(poly(3, { diag: 'all', ticks: false, arcs: 'off', rightMark: false }), {})), 0, 'a triangle has no diagonals');
});
test('right-angle squares and arcs on polygons', () => {
  const sq = poly(4, { arcs: 'off', ticks: false }, { method: 'square', s: 4 });
  assert.equal(countOf(G.renderSVG(sq, {}), /<polyline /g), 4); sq.rightMark = false; assert.equal(countOf(G.renderSVG(sq, {}), /<polyline /g), 0);
  const all = poly(4, { arcs: 'all', ticks: false, rightMark: false }, { method: 'square', s: 4 }); assert.equal(countOf(G.renderSVG(all, {}), /<path /g), 8, 'four equal angles get two arcs each');
  const para = poly(4, { arcs: 'all', ticks: false }, { method: 'parallelogram', a: 6, b: 4, A: 60 }); assert.equal(countOf(G.renderSVG(para, {}), /<path /g), 2 * 2 + 2 * 3, 'two sets of equal angles: 2 and 3 arcs');
  para.arcs = 'equal'; assert.equal(countOf(G.renderSVG(para, {}), /<path /g), 2 * 1 + 2 * 2);
  para.arcs = 'off'; assert.equal(countOf(G.renderSVG(para, {}), /<path /g), 0);
});
test('corner names go outside every corner, including a dent, where outside is the notch', () => {
  const s = poly(5, { mode: 'free', arcs: 'off', ticks: false }); s.free.pts = [[0, 0], [4, 0], [4, 4], [2, 1], [0, 4]]; s.free.view = [-2, -2, 6, 6];
  s.sides.forEach(x => { x.mode = 'hidden'; }); s.angles.forEach(x => { x.mode = 'hidden'; });
  const f = G.drawFigure(s, {}), sc = f.L;
  const name = n => { const m = new RegExp('<text x="([\\d.-]+)" y="([\\d.-]+)"[^>]*>' + n + '</text>').exec(f.svg); return [+m[1], +m[2]]; };
  // the shape is a square with a V-shaped notch cut into its top, down to D at (2,1). On the page, up is smaller y.
  const A = name('A'), pa = sc.toMM(0, 0); assert.ok(A[0] < pa[0] && A[1] > pa[1], 'A is named below and to the left of its corner');
  const B = name('B'), pb = sc.toMM(4, 0); assert.ok(B[0] > pb[0] && B[1] > pb[1], 'B is named below and to the right');
  const C = name('C'), pc = sc.toMM(4, 4); assert.ok(C[0] > pc[0] && C[1] < pc[1], 'C is named above and to the right');
  const E = name('E'), pe = sc.toMM(0, 4); assert.ok(E[0] < pe[0] && E[1] < pe[1], 'E is named above and to the left');
  const D = name('D'), pd = sc.toMM(2, 1); assert.ok(D[1] < pd[1], 'the dent D is named above it, in the notch, which is outside the shape');
  assert.ok(Math.abs(D[0] - pd[0]) < 1, 'and straight above it, in the middle of the notch');
});
test('the cut, circles and triangle lines are triangle-only: a four-sided shape ignores them', () => {
  const s = poly(4, {}, { method: 'square', s: 4 }); s.cut.on = true; s.lines.alt = [true, true, true]; s.points.G = true; s.circles.circ = true;
  assert.equal(G.cutGeometry(s, G.resolve(s)), null); const plainSq = poly(4, {}, { method: 'square', s: 4 });
  assert.equal(G.renderSVG(s, {}), G.renderSVG(plainSq, {}), 'the triangle options leave a square exactly as it was');
  assert.equal(countOf(G.drawFigure(s, { ui: true }).svg, /class="ch"/g), 0);
});
test('rings and the lock highlight cover every corner and side of a polygon, the closing side too', () => {
  const s = poly(5, {}, { method: 'regular', s: 4 }); s.lock = ALL(5, 4);
  const ui = G.drawFigure(s, { ui: true }).svg; assert.equal(countOf(ui, /class="vh"/g), 5); assert.equal(countOf(ui, /stroke="#e0982e" stroke-opacity="\.5"/g), 1);
  assert.ok(!/e0982e/.test(G.renderSVG(s, {})));
  const many = poly(12, {}, { method: 'regular', s: 2 }); assert.equal(countOf(G.drawFigure(many, { ui: true }).svg, /class="vh"/g), 12);
});
test('free mode on a polygon: snapping, locks and the view all work for any n', () => {
  const s = poly(6, { mode: 'free' }); s.free.view = G.fitView(s.free.pts, 1.5);
  const f = G.drawFigure(s, { ui: true }); assert.equal(countOf(f.svg, /class="vh"/g), 6);
  const [mx, my] = f.L.toMM(1, 1), [x, y] = f.L.toModel(mx, my); near(x, 1, 1e-9); near(y, 1, 1e-9);
});
test('the title says what the shape is', () => {
  assert.match(G.renderSVG(poly(3), {}), /<title>Triangle ABC<\/title>/); assert.match(G.renderSVG(poly(4, {}, { method: 'square', s: 3 }), {}), /<title>Quadrilateral ABCD<\/title>/);
  assert.match(G.renderSVG(poly(8, {}, { method: 'regular', s: 3 }), {}), /<title>Octagon ABCDEFGH<\/title>/);
});
