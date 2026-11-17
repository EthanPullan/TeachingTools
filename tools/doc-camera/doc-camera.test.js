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
const G = vm.runInNewContext(core + `;({ normRot, oriented, normView, visibleRect, fitRect, drawView, zoomAt, panBy, snapshotSize,
  looksBuiltIn, pickPreferred, stamp, fileName, uniqueNames, crc32, makeZip, ZMIN, ZMAX })`, { TextEncoder });
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
