// Unit tests for the Document Camera core (the <script id="core"> block in index.html).
// Run:  node --test tools/doc-camera/doc-camera.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { execFileSync } = require('node:child_process');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const core = /<script id="core">([\s\S]*?)<\/script>/.exec(html)[1];
const G = vm.runInNewContext(core + `;({ normRot, oriented, normView, visibleRect, fitRect, drawView, zoomAt, panBy, pinchStep, snapshotSize,
  looksBuiltIn, pickPreferred, stamp, fileName, uniqueNames, crc32, makeZip, ZMIN, ZMAX,
  newInk, inkEmpty, inkMapper, rectBox, rectFrom, clampRect, transformInk, drawInk, adjustFilter, AIDS, INK_COLORS, MASK_FILL,
  gridLayout, GRID_LABELS, shuffleOrder, fmtClock, nextCamera, PAPER, defaultPaper, pdfPageLayout, makePdf, isJpeg })`, { TextEncoder });
const near = (a, b, e = 1e-9) => assert.ok(Math.abs(a - b) <= e, a + ' vs ' + b);

test('rotation is kept to 0/90/180/270', () => {
  assert.equal(G.normRot(450), 90); assert.equal(G.normRot(-90), 270); assert.equal(G.normRot(360), 0); assert.equal(G.normRot(undefined), 0);
});

test('a quarter turn swaps width and height', () => {
  assert.deepEqual({ ...G.oriented(1920, 1080, 90) }, { w: 1080, h: 1920 });
  assert.deepEqual({ ...G.oriented(1920, 1080, 180) }, { w: 1920, h: 1080 });
});

test('zoom is clamped and the view stays inside the picture', () => {
  const v = G.normView({ zoom: 50, cx: 2, cy: -1 });
  assert.equal(v.zoom, G.ZMAX); near(v.cx, 1 - 0.5 / G.ZMAX); near(v.cy, 0.5 / G.ZMAX);
  const w = G.normView({ zoom: 0.2, cx: 0.9 });
  assert.equal(w.zoom, 1); assert.equal(w.cx, 0.5);
});

test('visible rect at 2× is the centre quarter of the picture', () => {
  const r = G.visibleRect(1920, 1080, { zoom: 2 });
  assert.deepEqual({ ...r }, { ow: 1920, oh: 1080, x: 480, y: 270, w: 960, h: 540 });
});

test('zooming at a point keeps that point still', () => {
  const v0 = G.normView({ zoom: 1 });
  const v1 = G.zoomAt(v0, 2, 0.25, 0.75);
  // the picture point under (0.25, 0.75) before: (0.25, 0.75). After: cx - .5/z + nx/z
  near(v1.cx - 0.5 / v1.zoom + 0.25 / v1.zoom, 0.25); near(v1.cy - 0.5 / v1.zoom + 0.75 / v1.zoom, 0.75);
  const back = G.zoomAt(v1, 0.5, 0.3, 0.3);
  assert.equal(back.zoom, 1); assert.equal(back.cx, 0.5); assert.equal(back.cy, 0.5);
});

test('dragging pans the opposite way and stops at the edge', () => {
  const v = G.panBy(G.normView({ zoom: 2 }), 0.1, 0);
  near(v.cx, 0.45);
  const edge = G.panBy(G.normView({ zoom: 2 }), 5, 5);
  near(edge.cx, 0.25); near(edge.cy, 0.25);
});

test('pinch: spreading fingers zooms around their midpoint, sliding them moves the picture', () => {
  const v0 = G.normView({});
  // fingers spread from 100 apart to 200 apart around the point (250, 150) of a 1000×500 box
  const v1 = G.pinchStep(v0, { x: 200, y: 150 }, { x: 300, y: 150 }, { x: 150, y: 150 }, { x: 350, y: 150 }, 1000, 500);
  near(v1.zoom, 2);
  // the picture point under the midpoint (0.25, 0.3) stays under it
  near(v1.cx - 0.5 / v1.zoom + 0.25 / v1.zoom, 0.25); near(v1.cy - 0.5 / v1.zoom + 0.3 / v1.zoom, 0.3);
  // two fingers sliding 100px right together (no spread change) at 2×: pans left by 0.1 / 2 of the picture
  const v2 = G.pinchStep(v1, { x: 150, y: 150 }, { x: 350, y: 150 }, { x: 250, y: 150 }, { x: 450, y: 150 }, 1000, 500);
  near(v2.zoom, 2); near(v2.cx, v1.cx - 0.05);
  // pinching in past 100% stops at the whole picture
  const v3 = G.pinchStep(v2, { x: 0, y: 0 }, { x: 900, y: 0 }, { x: 400, y: 0 }, { x: 500, y: 0 }, 1000, 500);
  assert.equal(v3.zoom, 1); assert.equal(v3.cx, 0.5);
  // fingers on the same spot do not break anything
  const v4 = G.pinchStep(v0, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }, { x: 5, y: 5 }, 1000, 500);
  assert.deepEqual({ ...v4 }, { ...v0 });
});

test('snapshot keeps the camera pixels of what you see', () => {
  assert.deepEqual({ ...G.snapshotSize(1920, 1080, {}) }, { w: 1920, h: 1080 });
  assert.deepEqual({ ...G.snapshotSize(1920, 1080, { rot: 90 }) }, { w: 1080, h: 1920 });
  assert.deepEqual({ ...G.snapshotSize(1920, 1080, { zoom: 4 }) }, { w: 480, h: 270 });
});

test('fitRect letterboxes and centres', () => {
  const f = G.fitRect(1920, 1080, 1000, 1000);
  near(f.w, 1000); near(f.h, 562.5); near(f.y, 218.75); near(f.x, 0);
  assert.equal(G.fitRect(0, 10, 10, 10).w, 0);
});

/* A fake 2D context that tracks the transform, to check where the picture's corners land. */
function fakeCtx() {
  let m = [1, 0, 0, 1, 0, 0]; const stack = []; const out = {};
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const apply = (x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
  return {
    out, save() { stack.push(m); }, restore() { m = stack.pop(); }, beginPath() {}, rect() {}, clip() {},
    translate(x, y) { m = mul(m, [1, 0, 0, 1, x, y]); }, scale(x, y) { m = mul(m, [x, 0, 0, y, 0, 0]); },
    rotate(a) { const c = Math.cos(a), s = Math.sin(a); m = mul(m, [c, s, -s, c, 0, 0]); },
    drawImage(src, x, y, w, h) { out.tl = apply(x, y).map(v => Math.round(v * 1e6) / 1e6); out.br = apply(x + w, y + h).map(v => Math.round(v * 1e6) / 1e6); out.tr = apply(x + w, y).map(v => Math.round(v * 1e6) / 1e6); }
  };
}

test('drawView: plain, rotated, mirrored and zoomed', () => {
  let c = fakeCtx(); G.drawView(c, {}, 200, 100, {}, { x: 0, y: 0, w: 200, h: 100 });
  assert.deepEqual(c.out.tl, [0, 0]); assert.deepEqual(c.out.br, [200, 100]);
  // 90° clockwise: the picture's top-left corner goes to the top-right of a 100×200 box
  c = fakeCtx(); G.drawView(c, {}, 200, 100, { rot: 90 }, { x: 0, y: 0, w: 100, h: 200 });
  assert.deepEqual(c.out.tl, [100, 0]); assert.deepEqual(c.out.br, [0, 200]);
  // mirror: top-left goes to top-right
  c = fakeCtx(); G.drawView(c, {}, 200, 100, { flip: true }, { x: 0, y: 0, w: 200, h: 100 });
  assert.deepEqual(c.out.tl, [200, 0]);
  // 90° + mirror: top-left stays top-left (a transpose)
  c = fakeCtx(); G.drawView(c, {}, 200, 100, { rot: 90, flip: true }, { x: 0, y: 0, w: 100, h: 200 });
  assert.deepEqual(c.out.tl, [0, 0]); assert.deepEqual(c.out.br, [100, 200]);
  // 2× zoom at the centre into a 200×100 box: the picture is drawn 400×200, offset by -100,-50
  c = fakeCtx(); G.drawView(c, {}, 200, 100, { zoom: 2 }, { x: 0, y: 0, w: 200, h: 100 });
  assert.deepEqual(c.out.tl, [-100, -50]); assert.deepEqual(c.out.br, [300, 150]);
  // dest offset is honoured
  c = fakeCtx(); G.drawView(c, {}, 200, 100, {}, { x: 10, y: 20, w: 100, h: 50 });
  assert.deepEqual(c.out.tl, [10, 20]); assert.deepEqual(c.out.br, [110, 70]);
});

test('prefers a plugged-in camera over a built-in one, only when the current one looks built-in', () => {
  const devs = [{ deviceId: 'a', label: 'Integrated Camera' }, { deviceId: 'b', label: 'IPEVO V4K' }];
  assert.equal(G.pickPreferred(devs, 'Integrated Camera'), 'b');
  assert.equal(G.pickPreferred(devs, 'IPEVO V4K'), null);
  assert.equal(G.pickPreferred([{ deviceId: 'a', label: 'FaceTime HD Camera' }], 'FaceTime HD Camera'), null);
  assert.equal(G.looksBuiltIn('USB Document Camera'), false);
});

test('file names', () => {
  const d = new Date(2026, 10, 7, 9, 5, 3);
  assert.equal(G.stamp(d), '2026-11-07_09-05-03');
  assert.equal(G.fileName(d), 'doc-camera_2026-11-07_09-05-03.jpg');
  assert.deepEqual([...G.uniqueNames(['a.jpg', 'b.jpg', 'a.jpg', 'A.jpg'])], ['a.jpg', 'b.jpg', 'a-2.jpg', 'A-3.jpg']);
});

test('crc32 matches the standard check value', () => {
  assert.equal(G.crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});

test('makeZip writes a zip that unzip accepts, with the right contents', () => {
  const enc = new TextEncoder();
  const files = [
    { name: 'one.txt', data: enc.encode('hello'), date: new Date(2026, 10, 17, 14, 32, 6) },
    { name: 'two.bin', data: Uint8Array.from({ length: 3000 }, (_, i) => i * 7 & 255), date: new Date(2026, 10, 17, 14, 33, 0) }
  ];
  const parts = G.makeZip(files);
  const buf = Buffer.concat(parts.map(p => Buffer.from(p.buffer, p.byteOffset, p.byteLength)));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doccam-')); const zp = path.join(dir, 't.zip');
  fs.writeFileSync(zp, buf);
  let tool = null; for (const t of ['unzip', 'python3']) { try { execFileSync('which', [t]); tool = t; break; } catch (e) {} }
  if (!tool) return; // nothing to verify with on this machine
  if (tool === 'unzip') {
    const out = execFileSync('unzip', ['-t', zp]).toString(); assert.match(out, /No errors detected/);
    assert.equal(execFileSync('unzip', ['-p', zp, 'one.txt']).toString(), 'hello');
    assert.deepEqual([...execFileSync('unzip', ['-p', zp, 'two.bin'])], [...files[1].data]);
    assert.match(execFileSync('unzip', ['-l', zp]).toString(), /2026-11-17 14:32/);
  } else {
    execFileSync('python3', ['-I', '-c', 'import zipfile,sys; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; assert z.read("one.txt")==b"hello"', zp]);
  }
});

/* ---------- drawing and covers ---------- */
const plain = v => JSON.parse(JSON.stringify(v));

test('inkMapper turns page fractions into pixels and back, following zoom', () => {
  const r = G.visibleRect(2000, 1000, { zoom: 2, cx: 0.25, cy: 0.5 }); // shows x 0..1000, y 250..750
  const m = G.inkMapper(r, { x: 10, y: 20, w: 500, h: 250 });
  near(m.x(0), 10); near(m.x(0.5), 510); near(m.y(0.25), 20); near(m.y(0.75), 270);
  near(m.u(m.x(0.37)), 0.37); near(m.v(m.y(0.61)), 0.61);
});

test('rectFrom and clampRect keep covers inside the page', () => {
  assert.deepEqual(plain(G.rectFrom(0.6, 0.5, 0.2, 0.1)), { x: 0.2, y: 0.1, w: 0.39999999999999997, h: 0.4 });
  assert.deepEqual(plain(G.rectFrom(-1, -1, 2, 0.5)), { x: 0, y: 0, w: 1, h: 0.5 });
  assert.deepEqual(plain(G.clampRect({ x: 0.9, y: -0.2, w: 0.3, h: 0.2 })), { x: 0.7, y: 0, w: 0.3, h: 0.2 });
});

test('transformInk turns and mirrors drawings and covers with the picture', () => {
  const k = { strokes: [{ t: 'pen', c: '#000', w: 0.003, p: [[0.1, 0.2], [0.3, 0.4]] }], masks: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.1 }], spot: { x: 0, y: 0, w: 0.5, h: 0.5 }, curtain: 0.4 };
  const r = G.transformInk(k, 'rot');
  // clockwise quarter turn: (u, v) -> (1 - v, u)
  assert.deepEqual(plain(r.strokes[0].p), [[0.8, 0.1], [0.6, 0.3]]);
  near(r.masks[0].x, 0.7); near(r.masks[0].y, 0.1); near(r.masks[0].w, 0.1); near(r.masks[0].h, 0.3);
  assert.equal(r.curtain, null, 'the curtain starts again after a turn');
  // four turns is the identity
  let q = k; for (let i = 0; i < 4; i++) q = G.transformInk(q, 'rot');
  q.strokes[0].p.flat().forEach((v, i) => near(v, k.strokes[0].p.flat()[i]));
  near(q.masks[0].x, 0.1); near(q.masks[0].w, 0.3);
  const f = G.transformInk(k, 'flip');
  assert.deepEqual(plain(f.strokes[0].p), [[0.9, 0.2], [0.7, 0.4]]);
  near(f.masks[0].x, 0.6); assert.equal(f.curtain, 0.4);
  assert.equal(k.strokes[0].p[0][0], 0.1, 'the original is not changed');
});

test('a turned and mirrored drawing lands where drawView puts the same page point', () => {
  // A point on the page under rotation 90 + flip, then the same page point after one more turn of the picture.
  // The app turns the drawing three quarter-turns when the mirror is on (see moveLiveInk): check that matches drawView.
  const sw = 200, sh = 100;
  const where = (view, sx, sy) => { // where source pixel (sx, sy) ends up, as a page fraction of the turned picture
    let out; const c = fakeCtx2(); c.onDraw = m => { out = m; };
    const o = G.oriented(sw, sh, view.rot), d = G.fitRect(o.w, o.h, 1000, 1000);
    G.drawView(c, {}, sw, sh, view, d);
    const [x, y] = out(sx - sw / 2, sy - sh / 2);
    return [(x - d.x) / d.w, (y - d.y) / d.h];
  };
  const v1 = { rot: 90, flip: true }, v2 = { rot: 180, flip: true };
  const a = where(v1, 30, 20), b = where(v2, 30, 20);
  let k = { strokes: [{ t: 'pen', c: '#000', w: 0.003, p: [a] }], masks: [], spot: null, curtain: null };
  for (let i = 0; i < 3; i++) k = G.transformInk(k, 'rot');
  near(k.strokes[0].p[0][0], b[0], 1e-9); near(k.strokes[0].p[0][1], b[1], 1e-9);
  // and without the mirror, one turn
  const c1 = where({ rot: 0 }, 30, 20), c2 = where({ rot: 90 }, 30, 20);
  const k2 = G.transformInk({ strokes: [{ p: [c1] }], masks: [], spot: null, curtain: null }, 'rot');
  near(k2.strokes[0].p[0][0], c2[0]); near(k2.strokes[0].p[0][1], c2[1]);
});

/* fake context that exposes the transform drawImage used, and records fills */
function fakeCtx2() {
  let m = [1, 0, 0, 1, 0, 0]; const stack = [];
  const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
  const c = {
    fills: [], strokes: 0, save() { stack.push(m); }, restore() { m = stack.pop(); }, beginPath() {}, rect() {}, clip() {},
    translate(x, y) { m = mul(m, [1, 0, 0, 1, x, y]); }, scale(x, y) { m = mul(m, [x, 0, 0, y, 0, 0]); },
    rotate(a) { const cs = Math.cos(a), sn = Math.sin(a); m = mul(m, [cs, sn, -sn, cs, 0, 0]); },
    drawImage() { const mm = m.slice(); c.onDraw && c.onDraw((x, y) => [mm[0] * x + mm[2] * y + mm[4], mm[1] * x + mm[3] * y + mm[5]]); },
    fillRect(x, y, w, h) { c.fills.push({ style: c.fillStyle, x, y, w, h }); }, fill() { c.fills.push({ style: c.fillStyle, path: true }); },
    stroke() { c.strokes++; }, strokeRect() { c.strokes++; }, moveTo() {}, lineTo() {}, quadraticCurveTo() {}, arc() {}, setLineDash() {}
  };
  return c;
}

test('drawInk paints covers at the right place, and screen-only marks stay off snapshots', () => {
  const r = G.visibleRect(1000, 500, {}), m = G.inkMapper(r, { x: 0, y: 0, w: 1000, h: 500 });
  const ink = { strokes: [{ t: 'pen', c: '#0072B2', w: 0.003, p: [[0.1, 0.1], [0.2, 0.2], [0.3, 0.1]] }], masks: [{ x: 0.1, y: 0.2, w: 0.3, h: 0.1 }], spot: null, curtain: 0.75 };
  let c = fakeCtx2(); G.drawInk(c, ink, m);
  const mask = c.fills.find(f => f.style === G.MASK_FILL);
  assert.deepEqual([mask.x, mask.y, Math.round(mask.w), Math.round(mask.h)], [100, 100, 300, 50]);
  const cur = c.fills.find(f => f.style !== G.MASK_FILL && !f.path);
  near(cur.y, 375); near(cur.h, 125);
  assert.equal(c.fills.length, 2, 'no curtain grip or selection on a snapshot');
  c = fakeCtx2(); G.drawInk(c, ink, m, { screen: true, sel: 0 });
  assert.ok(c.fills.length > 2, 'the screen shows a selection handle and the curtain grip');
  // curtain below what is visible draws nothing
  const zoomed = G.inkMapper(G.visibleRect(1000, 500, { zoom: 4, cx: 0.5, cy: 0.2 }), { x: 0, y: 0, w: 1000, h: 500 });
  c = fakeCtx2(); G.drawInk(c, { ...G.newInk(), curtain: 0.9 }, zoomed); assert.equal(c.fills.length, 0);
});

test('inkEmpty', () => {
  assert.equal(G.inkEmpty(G.newInk()), true);
  assert.equal(G.inkEmpty({ ...G.newInk(), curtain: 0 }), false);
  assert.equal(G.inkEmpty({ ...G.newInk(), masks: [{}] }), false);
});

test('adjustFilter: only what differs from normal', () => {
  assert.equal(G.adjustFilter({ brightness: 100, contrast: 100, color: 'color' }), 'none');
  assert.equal(G.adjustFilter({ brightness: 120, contrast: 100, color: 'color' }), 'brightness(1.2)');
  assert.equal(G.adjustFilter({ brightness: 100, contrast: 150, color: 'gray' }), 'grayscale(1) contrast(1.5)');
  assert.match(G.adjustFilter({ color: 'bw' }), /^grayscale\(1\) contrast\(1\.9\)/);
  assert.equal(G.AIDS.normal, '');
});

test('ink colours are the four Okabe–Ito picks, all distinct', () => {
  assert.deepEqual(plain(G.INK_COLORS.map(c => c.hex)), ['#1b1b1b', '#0072B2', '#D55E00', '#F0E442']);
});

/* ---------- comparing, timer, camera switch ---------- */
test('gridLayout: a row on wide screens, a column on tall ones, 2×2 for four', () => {
  assert.deepEqual(plain(G.gridLayout(2, 1600, 900)), { cols: 2, rows: 1 });
  assert.deepEqual(plain(G.gridLayout(3, 900, 1600)), { cols: 1, rows: 3 });
  assert.deepEqual(plain(G.gridLayout(4, 1600, 900)), { cols: 2, rows: 2 });
  assert.equal(G.GRID_LABELS.join(''), 'ABCD');
});

test('shuffleOrder always changes the order and keeps every picture', () => {
  let seed = 1; const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  for (let i = 0; i < 200; i++) {
    const a = ['a', 'b', 'c', 'd'].slice(0, 2 + (i % 3)), b = G.shuffleOrder(a, rnd);
    assert.deepEqual([...b].sort(), [...a].sort()); assert.notDeepEqual(plain(b), a);
  }
  // even a "random" source that never moves anything
  assert.notDeepEqual(plain(G.shuffleOrder(['a', 'b', 'c'], () => 0.999999)), ['a', 'b', 'c']);
  assert.deepEqual(plain(G.shuffleOrder(['a'], Math.random)), ['a']);
});

test('fmtClock', () => {
  assert.equal(G.fmtClock(300000, true), '5:00');
  assert.equal(G.fmtClock(299001, true), '5:00', 'a countdown rounds up');
  assert.equal(G.fmtClock(1, true), '0:01');
  assert.equal(G.fmtClock(0, true), '0:00');
  assert.equal(G.fmtClock(61999, false), '1:01', 'a stopwatch rounds down');
  assert.equal(G.fmtClock(3723000, false), '1:02:03');
});

test('nextCamera goes back to the previous camera, else the next one', () => {
  const d = [{ deviceId: 'a' }, { deviceId: 'b' }, { deviceId: 'c' }];
  assert.equal(G.nextCamera(d, 'c', 'a'), 'a');
  assert.equal(G.nextCamera(d, 'c', null), 'a');
  assert.equal(G.nextCamera(d, 'a', 'gone'), 'b');
  assert.equal(G.nextCamera([{ deviceId: 'a' }], 'a', null), null);
});

test('paper size follows the language region', () => {
  assert.equal(G.defaultPaper('en-US'), 'letter'); assert.equal(G.defaultPaper('fr-CA'), 'letter');
  assert.equal(G.defaultPaper('en-GB'), 'a4'); assert.equal(G.defaultPaper('de'), 'a4'); assert.equal(G.defaultPaper(undefined), 'a4');
});

test('pdfPageLayout turns the page for wide pictures and centres inside the margins', () => {
  const l = G.pdfPageLayout(1920, 1080, G.PAPER.letter);
  assert.equal(l.pw, 792); assert.equal(l.ph, 612);
  near(l.w, 792 - 56); near(l.x, 28); near(l.y + l.h / 2, 306);
  const p = G.pdfPageLayout(1080, 1920, G.PAPER.a4);
  assert.equal(p.pw, 595.28); near(p.x + p.w / 2, 595.28 / 2); assert.ok(p.h <= 841.89 - 56 + 1e-9);
});

test('makePdf builds a valid PDF that pdf readers accept', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doccam-pdf-'));
  // two real JPEGs (made with Pillow when available), one landscape and one portrait
  const jp = (w, h, name, color) => {
    const f = path.join(dir, name);
    execFileSync('python3', ['-I', '-c', 'import sys; from PIL import Image; Image.new("RGB",(int(sys.argv[1]),int(sys.argv[2])),sys.argv[4]).save(sys.argv[3],"JPEG")', String(w), String(h), f, color]);
    return new Uint8Array(fs.readFileSync(f));
  };
  let a, b;
  try { a = jp(320, 180, 'a.jpg', 'red'); b = jp(120, 200, 'b.jpg', 'blue'); } catch (e) { return; } // no Pillow here
  assert.ok(G.isJpeg(a));
  const pages = [{ jpeg: a, iw: 320, ih: 180, ...G.pdfPageLayout(320, 180, G.PAPER.letter) }, { jpeg: b, iw: 120, ih: 200, ...G.pdfPageLayout(120, 200, G.PAPER.letter) }];
  const parts = G.makePdf(pages);
  const buf = Buffer.concat(parts.map(p => Buffer.from(p.buffer, p.byteOffset, p.byteLength)));
  const fp = path.join(dir, 't.pdf'); fs.writeFileSync(fp, buf);
  // xref offsets point at the objects
  const text = buf.toString('latin1'), xs = text.slice(text.lastIndexOf('xref\n')).split('\n').slice(3).filter(l => / n $/.test(l)).map(l => +l.slice(0, 10));
  xs.forEach((off, i) => assert.equal(text.slice(off, off + String(i + 1).length + 6), (i + 1) + ' 0 obj'));
  try {
    const info = execFileSync('pdfinfo', [fp]).toString();
    assert.match(info, /Pages:\s+2/); assert.match(info, /Page size:\s+792 x 612 pts/);
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  try {
    const out = execFileSync('python3', ['-I', '-c', 'import sys,pypdf; r=pypdf.PdfReader(sys.argv[1], strict=True); print(len(r.pages), [ (round(float(p.mediabox.width)), round(float(p.mediabox.height))) for p in r.pages], [len(p.images) for p in r.pages])', fp]).toString().trim();
    assert.equal(out, '2 [(792, 612), (612, 792)] [1, 1]');
  } catch (e) { if (!/No module named/.test(String(e.stderr || ''))) throw e; }
});
