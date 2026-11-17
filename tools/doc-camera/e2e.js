// Browser checks for the Document Camera: drives the real page over file:// in Chromium with its fake camera.
// Run:  node tools/doc-camera/e2e.js [screenshot-folder]
// Needs Playwright + Chromium. Exits non-zero if any check fails. Not part of the shipped tool.
const path = require('node:path');
const fs = require('node:fs');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }

const URL = 'file://' + path.join(__dirname, 'index.html');
const shots = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const fails = []; let passed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else { fails.push(name + (detail !== undefined ? '  → ' + JSON.stringify(detail) : '')); console.log('  FAIL', name, detail !== undefined ? JSON.stringify(detail) : ''); } };
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const browser = await pw.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const errors = [], external = [], downloads = [];
  page.on('console', m => { if (m.type() === 'error') { errors.push(m.text()); } });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) external.push(r.url()); });
  page.on('download', d => downloads.push(d));
  const shot = async name => { if (shots) await page.screenshot({ path: path.join(shots, name + '.png') }); };
  const S = fn => page.evaluate(fn);

  await page.goto(URL);
  await page.waitForFunction(() => window.__docCam.state.stream && document.querySelector('#video').videoWidth > 0, null, { timeout: 10000 });
  await wait(400);
  check('live pill says Live', (await page.textContent('#livePill')).trim() === 'Live');
  check('message hidden once camera runs', await page.isHidden('#msg'));
  const res = await page.textContent('#stRes');
  check('resolution shown', /^\d+×\d+$/.test(res), res);
  check('camera list filled', (await page.$$eval('#camSel option', o => o.length)) >= 1);

  // The live canvas is being drawn and changes over time (the fake camera animates).
  const sample = () => page.evaluate(() => { const c = document.querySelector('#cvLive'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0; for (let i = 0; i < d.length; i += 4001) s += d[i] + d[i + 1] * 3 + d[i + 2] * 7; return s; });
  const a = await sample(); await wait(600); const b = await sample();
  check('live canvas has a picture', a > 0, a);
  check('live canvas moves', a !== b, [a, b]);
  await shot('01-live');

  // Freeze: picture stops changing.
  await page.keyboard.press('p'); await wait(300);
  check('pill says Frozen', (await page.textContent('#livePill')).trim() === 'Frozen');
  const f1 = await sample(); await wait(600); const f2 = await sample();
  check('frozen canvas is still', f1 === f2, [f1, f2]);
  await page.keyboard.press('p'); await wait(500);
  check('unfreeze resumes', (await sample()) !== f2);

  // Rotate + mirror are remembered.
  await page.click('#rotBtn'); await page.click('#mirBtn');
  check('rotation applied', await S(() => window.__docCam.state.live.rot === 90 && window.__docCam.state.live.flip === true));
  const saved = await S(() => JSON.parse(localStorage.getItem('teachingtools:doc-camera')));
  check('rotation saved per camera', Object.values(saved.views || {}).some(v => v.rot === 90 && v.flip), saved);

  // Snapshot of a rotated picture is portrait-shaped.
  const [vw, vh] = await S(() => [document.querySelector('#video').videoWidth, document.querySelector('#video').videoHeight]);
  await page.keyboard.press(' '); await page.waitForFunction(() => window.__docCam.state.snaps.length === 1);
  let snap = await S(() => { const s = window.__docCam.state.snaps[0]; return { w: s.w, h: s.h, type: s.blob.type, size: s.blob.size }; });
  check('rotated snapshot is turned', snap.w === vh && snap.h === vw, { snap, vw, vh });
  check('snapshot is a JPEG', snap.type === 'image/jpeg' && snap.size > 1000, snap);
  check('thumbnail appears', (await page.$$('#thumbs .thumb')).length === 1);
  check('Space after clicking a button still snapshots', true); // the rotate/mirror buttons had focus

  // Undo rotation, zoom 2×, snapshot is half size.
  await page.click('#rotBtn'); await page.click('#rotBtn'); await page.click('#rotBtn'); await page.click('#mirBtn');
  check('back to 0°', await S(() => window.__docCam.state.live.rot === 0 && !window.__docCam.state.live.flip));
  await page.click('#zoomIn'); await page.click('#zoomIn'); await page.click('#zoomIn');
  const z = await page.textContent('#zoomVal');
  check('zoom readout', z === '195%', z);
  await page.click('#zoomVal'); check('zoom reset', (await page.textContent('#zoomVal')) === '100%');
  // scroll zoom on canvas
  const box = await page.locator('#cvLive').boundingBox();
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height * 0.3);
  await page.mouse.wheel(0, -400); await wait(100);
  const zw = await S(() => window.__docCam.state.live);
  check('wheel zooms toward the cursor', zw.zoom > 1.5 && zw.cx < 0.5 && zw.cy < 0.5, zw);
  // drag pans
  await page.mouse.down(); await page.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.3, { steps: 5 }); await page.mouse.up();
  const zd = await S(() => window.__docCam.state.live);
  check('drag pans', zd.cx < zw.cx, { before: zw.cx, after: zd.cx });
  await page.keyboard.press('0');
  await page.keyboard.press('='); // 125%
  await page.click('#snapBtn'); await page.waitForFunction(() => window.__docCam.state.snaps.length === 2);
  snap = await S(() => { const s = window.__docCam.state.snaps[0]; return { w: s.w, h: s.h }; });
  check('zoomed snapshot is the visible part', snap.w === Math.round(vw / 1.25) && snap.h === Math.round(vh / 1.25), { snap, vw, vh });
  await page.keyboard.press('0');
  await shot('02-two-snaps');

  // Viewer
  await page.click('#thumbs .thumb:nth-child(2) button.open');
  await page.waitForFunction(() => window.__docCam.state.mode === 'view' && window.__docCam.state.snapImgId);
  check('viewer bar visible', await page.isVisible('#viewBar'));
  check('live pane hidden in view mode', await page.isHidden('#paneLive'));
  check('viewer count', (await page.textContent('#vbCount')) === '2 / 2');
  await wait(150);
  const snapPix = await page.evaluate(() => { const c = document.querySelector('#cvSnap'); const d = c.getContext('2d').getImageData(c.width / 2 | 0, c.height / 2 | 0, 1, 1).data; return d[3]; });
  check('snapshot drawn in viewer', snapPix === 255, snapPix);
  await shot('03-viewer');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('#vbCount').textContent === '1 / 2');
  check('arrow moves to newer snapshot', true);

  // Compare
  await page.keyboard.press('c'); await wait(200);
  check('compare mode', await S(() => window.__docCam.state.mode === 'compare'));
  check('both panes visible', (await page.isVisible('#paneLive')) && (await page.isVisible('#paneSnap')));
  const wl = await page.locator('#paneLive').boundingBox(), ws = await page.locator('#paneSnap').boundingBox();
  check('side by side', ws.x < wl.x && Math.abs(ws.width - wl.width) < 2, { ws, wl });
  await page.click('#vbSwap'); await wait(100);
  const wl2 = await page.locator('#paneLive').boundingBox();
  check('swap sides', wl2.x < ws.x + 1, wl2);
  await shot('04-compare');
  await page.keyboard.press('Escape');
  check('Esc back to live', await S(() => window.__docCam.state.mode === 'live'));

  // Download one, download all (zip)
  await page.hover('#thumbs .thumb:nth-child(1)');
  const [d1] = await Promise.all([page.waitForEvent('download'), page.click('#thumbs .thumb:nth-child(1) .acts button[title="Download"]')]);
  check('download name', /^doc-camera_\d{4}-\d\d-\d\d_\d\d-\d\d-\d\d\.jpg$/.test(d1.suggestedFilename()), d1.suggestedFilename());
  const [dz] = await Promise.all([page.waitForEvent('download'), page.click('#dlAll')]);
  const zp = await dz.path();
  check('zip name', /^doc-camera-snapshots_\d{4}-\d\d-\d\d\.zip$/.test(dz.suggestedFilename()), dz.suggestedFilename());
  try {
    const out = require('node:child_process').execFileSync('unzip', ['-l', zp]).toString();
    check('zip holds both snapshots', (out.match(/doc-camera_.*\.jpg/g) || []).length === 2, out);
    require('node:child_process').execFileSync('unzip', ['-tq', zp]);
  } catch (e) { check('zip valid', false, e.message); }

  // Persistence across reload
  await page.reload();
  await page.waitForFunction(() => window.__docCam.state.snaps.length === 2, null, { timeout: 5000 }).catch(() => {});
  check('snapshots kept after reload', await S(() => window.__docCam.state.snaps.length === 2));
  await page.waitForFunction(() => window.__docCam.state.stream, null, { timeout: 10000 });
  check('rotation restored after reload (0° saved last)', await S(() => window.__docCam.state.live.rot === 0));
  await wait(300);
  check('thumbnails load after reload', await page.$$eval('#thumbs img', a => a.length === 2 && a.every(i => i.complete && i.naturalWidth > 0)));
  await page.click('#thumbs .thumb:nth-child(1) button.open');
  await page.waitForFunction(() => window.__docCam.state.snapImgId);
  await wait(150);
  check('viewer works after reload', (await page.evaluate(() => { const c = document.querySelector('#cvSnap'); return c.getContext('2d').getImageData(c.width / 2 | 0, c.height / 2 | 0, 1, 1).data[3]; })) === 255);
  const [d2] = await Promise.all([page.waitForEvent('download'), page.click('#vbDownload')]);
  const d2p = await d2.path(); const head = fs.readFileSync(d2p).subarray(0, 3);
  check('download after reload is a JPEG', head[0] === 0xFF && head[1] === 0xD8 && head[2] === 0xFF, [...head]);
  await page.keyboard.press('Escape');

  // Delete + undo
  await page.hover('#thumbs .thumb:nth-child(1)');
  await page.click('#thumbs .thumb:nth-child(1) .acts button.x');
  check('deleted', await S(() => window.__docCam.state.snaps.length === 1));
  await page.click('.toast button');
  await page.waitForFunction(() => window.__docCam.state.snaps.length === 2);
  check('undo restores', true);

  // Two-finger pinch on a touch screen (smart board)
  {
    const tctx = await browser.newContext({ viewport: { width: 1400, height: 900 }, hasTouch: true });
    const tp = await tctx.newPage();
    tp.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
    await tp.goto(URL);
    await tp.waitForFunction(() => window.__docCam.state.stream && window.__docCam.panes.live.dest, null, { timeout: 10000 });
    const cdp = await tctx.newCDPSession(tp);
    const tb = await tp.locator('#cvLive').boundingBox();
    const cx = tb.x + tb.width * 0.3, cy = tb.y + tb.height * 0.4;
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i })) });
    await touch('touchStart', [[cx - 50, cy], [cx + 50, cy]]);
    for (let s = 1; s <= 10; s++) await touch('touchMove', [[cx - 50 - s * 10, cy], [cx + 50 + s * 10, cy]]);
    await touch('touchEnd', []);
    await wait(100);
    const pv = await tp.evaluate(() => window.__docCam.state.live);
    check('pinch out zooms in about 3×', Math.abs(pv.zoom - 3) < 0.05, pv);
    check('pinch zooms toward the fingers', pv.cx < 0.5 && pv.cy < 0.5, pv);
    check('zoom readout follows pinch', (await tp.textContent('#zoomVal')) === Math.round(pv.zoom * 100) + '%');
    // one finger drag pans
    await touch('touchStart', [[cx, cy]]);
    for (let s = 1; s <= 5; s++) await touch('touchMove', [[cx + s * 20, cy]]);
    await touch('touchEnd', []);
    await wait(100);
    const dv = await tp.evaluate(() => window.__docCam.state.live);
    check('one-finger drag pans when zoomed', dv.cx < pv.cx && Math.abs(dv.zoom - pv.zoom) < 1e-9, { before: pv, after: dv });
    // pinch back in to the whole picture
    await touch('touchStart', [[cx - 300, cy], [cx + 300, cy]]);
    for (let s = 1; s <= 10; s++) await touch('touchMove', [[cx - 300 + s * 28, cy], [cx + 300 - s * 28, cy]]);
    await touch('touchEnd', []);
    await wait(100);
    check('pinch in returns to 100%', await tp.evaluate(() => window.__docCam.state.live.zoom === 1));
    // the page itself did not zoom or scroll
    check('page did not zoom', await tp.evaluate(() => (window.visualViewport ? window.visualViewport.scale : 1) === 1 && window.scrollX === 0 && window.scrollY === 0));
    await tctx.close();
  }

  // Clean mode
  await page.keyboard.press('h');
  check('clean mode hides toolbar', await page.isHidden('.toolbar'));
  check('mini bar shown', await page.isVisible('#mini'));
  await shot('05-clean');
  await page.keyboard.press('Escape');
  check('Esc leaves clean mode', await page.isVisible('.toolbar'));

  // Clear all (accept confirm)
  page.once('dialog', d => d.accept());
  await page.click('#clearAll'); await wait(200);
  check('clear all', await S(() => window.__docCam.state.snaps.length === 0));
  await page.reload(); await wait(800);
  check('clear all persisted', await S(() => window.__docCam.state.snaps.length === 0));

  // Narrow screen still lays out
  await page.setViewportSize({ width: 600, height: 800 }); await wait(300);
  const sw = await S(() => document.documentElement.scrollWidth);
  check('no horizontal scroll at 600px', sw <= 600, sw);
  await shot('06-narrow');

  check('no console errors', errors.length === 0, errors);
  check('no network requests', external.length === 0, external);
  await browser.close();

  // Camera denied
  const b2 = await pw.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--deny-permission-prompts'] });
  const p2 = await (await b2.newContext()).newPage();
  await p2.goto(URL);
  await p2.waitForSelector('#msg:not([hidden])');
  await p2.waitForFunction(() => document.querySelector('#msgTitle').textContent !== 'Starting camera…', null, { timeout: 8000 }).catch(() => {});
  const t = await p2.textContent('#msgTitle');
  check('denied camera shows a message', /blocked|didn’t start/.test(t), t);
  if (shots) await p2.screenshot({ path: path.join(shots, '07-denied.png') });
  await b2.close();

  /* ================= Drawing, covers, adjustments, camera controls ================= */
  {
    const b3 = await pw.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    const ctx3 = await b3.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } });
    // A camera that reports focus / exposure / white balance controls, and a wake lock that counts requests.
    await ctx3.addInitScript(() => {
      window.__applied = []; window.__wake = 0;
      const extra = { focusMode: ['continuous', 'manual', 'single-shot'], focusDistance: { min: 0, max: 1, step: 0.01 },
        exposureMode: ['continuous', 'manual'], exposureTime: { min: 1, max: 1000, step: 1 }, exposureCompensation: { min: -2, max: 2, step: 0.5 },
        whiteBalanceMode: ['continuous', 'manual'], colorTemperature: { min: 2800, max: 6500, step: 100 } };
      const vals = { focusMode: 'continuous', focusDistance: 0.42, exposureMode: 'continuous', exposureTime: 120, exposureCompensation: 0, whiteBalanceMode: 'continuous', colorTemperature: 4500 };
      const P = MediaStreamTrack.prototype, gc = P.getCapabilities, gs = P.getSettings;
      P.getCapabilities = function () { const c = gc.call(this); return this.kind === 'video' ? { ...c, ...extra } : c; };
      P.getSettings = function () { const c = gs.call(this); return this.kind === 'video' ? { ...c, ...vals } : c; };
      P.applyConstraints = function (c) { const a = (c && c.advanced && c.advanced[0]) || c; window.__applied.push(a); Object.assign(vals, a); return Promise.resolve(); };
      Object.defineProperty(navigator, 'wakeLock', { value: { request: async () => { window.__wake++; return { release: async () => {}, addEventListener() {} }; } } });
    });
    const pg = await ctx3.newPage();
    const errs3 = [];
    pg.on('console', m => { if (m.type() === 'error') errs3.push(m.text()); });
    pg.on('pageerror', e => errs3.push('PAGEERROR ' + e.message));
    const E = fn => pg.evaluate(fn);
    const shot3 = async name => { if (shots) await pg.screenshot({ path: path.join(shots, name + '.png') }); };
    await pg.goto(URL);
    await pg.waitForFunction(() => window.__docCam.state.stream && window.__docCam.panes.live.mapper, null, { timeout: 10000 });
    check('wake lock requested while the camera runs', await E(() => window.__wake >= 1));

    // pixel of the newest snapshot at a fraction of its size
    const snapPx = (fx, fy) => pg.evaluate(async ([fx, fy]) => {
      const s = window.__docCam.state.snaps[0]; const bmp = await createImageBitmap(s.blob);
      const c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; const x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
      return [...x.getImageData(Math.round(fx * (bmp.width - 1)), Math.round(fy * (bmp.height - 1)), 1, 1).data].slice(0, 3);
    }, [fx, fy]);
    const snapCount = () => E(() => window.__docCam.state.snaps.length);
    const snapNow = async () => { const n = await snapCount(); await pg.keyboard.press(' '); await pg.waitForFunction(n => window.__docCam.state.snaps.length === n + 1, n); };
    const box = async () => { const d = await E(() => window.__docCam.panes.live.dest); const r = await pg.locator('#inkLive').boundingBox(); return { x: r.x + d.x, y: r.y + d.y, w: d.w, h: d.h }; };
    const at = (b, fx, fy) => [b.x + b.w * fx, b.y + b.h * fy];
    const drag = async (b0, f0, f1) => { const b = b0.fresh === false ? b0 : await box(); await pg.mouse.move(...at(b, ...f0)); await pg.mouse.down(); await pg.mouse.move(...at(b, ...f1), { steps: 8 }); await pg.mouse.up(); await wait(60); };
    const near = (px, hex, tol = 30) => { const t = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); return px.every((v, i) => Math.abs(v - t[i]) <= tol); };

    // --- drawing ---
    await pg.keyboard.press('d');
    check('D opens the drawing tools', await pg.isVisible('#drawBar') && await E(() => document.body.classList.contains('drawing')));
    await wait(150); /* the stage shrinks under the drawing bar; let the picture settle */
    let b = await box();
    await drag(b, [0.3, 0.5], [0.7, 0.5]);
    check('drawing on live freezes the picture first', await E(() => !!window.__docCam.state.frozen));
    check('a pen stroke is recorded', await E(() => window.__docCam.panes.live.ink.strokes.length === 1 && window.__docCam.panes.live.ink.strokes[0].t === 'pen'));
    check('the stroke is drawn on screen', await E(() => { const c = document.querySelector('#inkLive'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; for (let i = 3; i < d.length; i += 4) if (d[i]) return true; return false; }));
    await pg.click('#sizeSeg button[data-size="l"]');
    await drag(b, [0.3, 0.6], [0.7, 0.6]);
    await snapNow();
    const strokePx = await snapPx(0.5, 0.6);
    check('the snapshot includes the drawing (blue line)', near(strokePx, '#0072B2', 45), strokePx);
    await wait(80);
    check('aria-live says Snapshot saved', (await pg.textContent('#sr')) === 'Snapshot saved');
    await shot3('08-drawing');

    await pg.keyboard.press('Control+z');
    check('Ctrl+Z undoes the last stroke', await E(() => window.__docCam.panes.live.ink.strokes.length === 1));
    await pg.click('#toolSeg button[data-tool="arrow"]'); await drag(b, [0.2, 0.2], [0.4, 0.3]);
    await pg.click('#toolSeg button[data-tool="box"]'); await drag(b, [0.5, 0.2], [0.6, 0.3]);
    await pg.click('#toolSeg button[data-tool="hl"]'); await drag(b, [0.2, 0.8], [0.5, 0.8]);
    check('arrow, box and highlighter recorded', await E(() => window.__docCam.panes.live.ink.strokes.map(s => s.t).join() === 'pen,arrow,box,hl'));
    check('highlighter uses yellow by default', await E(() => window.__docCam.panes.live.ink.strokes[3].c === '#F0E442'));
    await pg.click('#toolSeg button[data-tool="arrow"]'); await pg.mouse.click(...at(b, 0.9, 0.9)); await wait(50);
    check('a tap with the arrow tool adds nothing', await E(() => window.__docCam.panes.live.ink.strokes.length === 4));

    // unfreeze clears the drawing on the frozen page, with undo
    await pg.keyboard.press('p'); await wait(100);
    check('going live clears the frozen-page drawing', await E(() => !window.__docCam.state.frozen && window.__docCam.panes.live.ink.strokes.length === 0));
    await pg.click('.toast button');
    check('toast Undo brings the drawing back', await E(() => window.__docCam.panes.live.ink.strokes.length === 4));
    await pg.click('#clearInk');
    check('Clear drawing', await E(() => window.__docCam.panes.live.ink.strokes.length === 0));

    // freeze-to-draw off: drawing on the live picture stays live
    await pg.click('#freezeToDraw'); await pg.click('#toolSeg button[data-tool="pen"]');
    await drag(b, [0.3, 0.3], [0.4, 0.4]);
    check('with Freeze to draw off, drawing does not freeze', await E(() => !window.__docCam.state.frozen && window.__docCam.panes.live.ink.strokes.length === 1));
    await pg.click('#freezeToDraw'); await pg.click('#clearInk');

    // --- covers ---
    await pg.click('#coverSeg button[data-tool="mask"]');
    await drag(b, [0.6, 0.1], [0.9, 0.25]);
    let masks = await E(() => window.__docCam.panes.live.ink.masks);
    check('drag draws a cover', masks.length === 1 && Math.abs(masks[0].x - 0.6) < 0.01 && Math.abs(masks[0].w - 0.3) < 0.01, masks);
    check('covering does not freeze the picture', await E(() => !window.__docCam.state.frozen));
    await drag(b, [0.75, 0.17], [0.65, 0.37]);
    masks = await E(() => window.__docCam.panes.live.ink.masks);
    check('drag a cover to move it', masks.length === 1 && Math.abs(masks[0].x - 0.5) < 0.01 && Math.abs(masks[0].y - 0.3) < 0.01, masks);
    await pg.keyboard.press('ArrowRight'); await pg.keyboard.press('Shift+ArrowDown');
    masks = await E(() => window.__docCam.panes.live.ink.masks);
    check('arrow keys move and Shift+arrows resize the selected cover', Math.abs(masks[0].x - 0.52) < 0.005 && Math.abs(masks[0].h - 0.17) < 0.005, masks);
    await pg.click('#addMask');
    check('Name cover adds a cover top-left', await E(() => { const m = window.__docCam.panes.live.ink.masks; return m.length === 2 && m[1].x < 0.1 && m[1].y < 0.1; }));
    await snapNow();
    let px = await snapPx(0.15, 0.08);
    check('the cover is baked into the snapshot', near(px, '#5d6964', 20), px);
    await pg.keyboard.press('Delete');
    check('Delete removes the selected cover', await E(() => window.__docCam.panes.live.ink.masks.length === 1));
    await pg.click('#clearCovers');

    // spotlight
    await pg.click('#coverSeg button[data-tool="spot"]');
    check('choosing Spotlight places one in the middle', await E(() => !!window.__docCam.panes.live.ink.spot));
    await snapNow();
    const dim = await snapPx(0.2, 0.75), lit = await snapPx(0.45, 0.4);
    check('spotlight dims outside and keeps inside', Math.max(...dim) < 60 && Math.max(...lit) > 90, { dim, lit });
    await shot3('09-spotlight');
    await pg.click('#clearCovers');

    // curtain
    await pg.click('#coverSeg button[data-tool="curtain"]');
    check('choosing Curtain covers the lower part', await E(() => window.__docCam.panes.live.ink.curtain === 0.25));
    await pg.keyboard.press('ArrowDown');
    check('↓ reveals more', await E(() => Math.abs(window.__docCam.panes.live.ink.curtain - 0.3) < 1e-9));
    await pg.click('#curMore');
    check('▼ More reveals more', await E(() => Math.abs(window.__docCam.panes.live.ink.curtain - 0.4) < 1e-9));
    await drag(b, [0.5, 0.4], [0.5, 0.6]);
    check('dragging moves the curtain edge', await E(() => Math.abs(window.__docCam.panes.live.ink.curtain - 0.6) < 0.02));
    await snapNow();
    px = await snapPx(0.5, 0.9);
    check('the curtain is baked into the snapshot', near(px, '#1d2a26', 20), px);
    await shot3('10-curtain');
    await pg.click('#clearCovers');

    // covers turn with the picture
    await pg.click('#coverSeg button[data-tool="mask"]'); await pg.click('#addMask');
    await pg.keyboard.press('Escape');
    check('Esc closes the drawing tools, the cover stays', await pg.isHidden('#drawBar') && await E(() => window.__docCam.panes.live.ink.masks.length === 1));
    await pg.keyboard.press('r'); await wait(100);
    masks = await E(() => window.__docCam.panes.live.ink.masks);
    check('a cover turns with the picture', Math.abs(masks[0].x - (1 - 0.13)) < 1e-6 && Math.abs(masks[0].w - 0.1) < 1e-6, masks);
    await pg.keyboard.press('r'); await pg.keyboard.press('r'); await pg.keyboard.press('r');
    masks = await E(() => window.__docCam.panes.live.ink.masks);
    check('four turns bring it back', Math.abs(masks[0].x - 0.03) < 1e-6 && Math.abs(masks[0].w - 0.34) < 1e-6, masks);
    await E(() => { const p = window.__docCam.panes.live; p.ink.masks = []; p.inkDirty = true; });

    // drawing on a saved snapshot saves a marked-up copy
    await pg.click('#thumbs .thumb:nth-child(2) button.open');
    await pg.waitForFunction(() => window.__docCam.state.mode === 'view' && window.__docCam.panes.snap.mapper);
    let n0 = await snapCount();
    await pg.keyboard.press(' '); await wait(200);
    check('Snapshot on an unmarked saved snapshot does not duplicate it', (await snapCount()) === n0);
    await pg.keyboard.press('d'); await pg.click('#toolSeg button[data-tool="box"]');
    const r2 = await pg.locator('#inkSnap').boundingBox(), d2 = await E(() => window.__docCam.panes.snap.dest);
    const bs = { x: r2.x + d2.x, y: r2.y + d2.y, w: d2.w, h: d2.h, fresh: false };
    await drag(bs, [0.3, 0.3], [0.6, 0.6]);
    await pg.keyboard.press(' ');
    await pg.waitForFunction(n => window.__docCam.state.snaps.length === n + 1, n0);
    check('a marked-up copy is saved and opened', await E(() => window.__docCam.state.snapId === window.__docCam.state.snaps[0].id && window.__docCam.panes.snap.ink.strokes.length === 0));
    await pg.keyboard.press('Escape'); await pg.keyboard.press('Escape');
    check('back to live', await E(() => window.__docCam.state.mode === 'live' && !window.__docCam.state.drawMode));

    // --- adjust ---
    await pg.keyboard.press('a');
    check('A opens Adjust', await pg.isVisible('#adjustPanel'));
    await pg.click('#colorSeg button[data-v="gray"]');
    check('grey shows on the live picture', (await E(() => document.querySelector('#cvLive').style.filter)).includes('grayscale(1)'));
    await snapNow();
    px = await snapPx(0.2, 0.75);
    check('grey is saved in the snapshot', Math.max(...px) - Math.min(...px) < 12, px);
    await pg.click('#colorSeg button[data-v="color"]');
    await pg.locator('#adjBri').fill('140');
    check('brightness slider applies', (await E(() => document.querySelector('#cvLive').style.filter)).includes('brightness(1.4)') && (await pg.textContent('#adjBriVal')) === '140%');
    await pg.click('#adjReset');
    check('Reset picture', (await E(() => document.querySelector('#cvLive').style.filter)) === 'none');
    await pg.click('#aidSeg button[data-v="yellow"]');
    check('yellow-on-black aid shows on screen', (await E(() => document.querySelector('#cvLive').style.filter)).includes('url'));
    await shot3('11-yellow-aid');
    await snapNow();
    px = await snapPx(0.2, 0.75);
    check('viewing aid is not saved in snapshots (picture stays green)', px[1] > px[0] + 50 && px[1] > px[2] + 50, px);
    await pg.click('#aidSeg button[data-v="normal"]');
    await pg.click('#rotSeg button[data-rot="180"]');
    check('Turn 180° in one tap', await E(() => window.__docCam.state.live.rot === 180));
    await pg.click('#rotSeg button[data-rot="0"]');

    // camera controls (simulated camera that reports them)
    check('camera controls shown when the camera reports them', (await pg.textContent('#camCtl')).includes('Focus'));
    await pg.click('#camCtl .seg button:text("Locked")');
    await wait(100);
    let applied = await E(() => window.__applied);
    check('Lock focus sends manual focus at the current distance', applied.some(a => a.focusMode === 'manual' && a.focusDistance === 0.42), applied);
    check('focus distance slider appears', await pg.isVisible('#camCtl input[aria-label="Focus distance"]'));
    const savedCam = await E(() => JSON.parse(localStorage.getItem('teachingtools:doc-camera')).camCtl);
    check('focus lock remembered for this camera', Object.values(savedCam).some(c => c.focus === 'locked' && c.focusDistance === 0.42), savedCam);
    await shot3('12-adjust');
    await pg.reload();
    await pg.waitForFunction(() => window.__docCam.state.stream && video.videoWidth, null, { timeout: 10000 }).catch(() => {});
    await pg.waitForFunction(() => window.__applied.some(a => a.focusMode === 'manual'), null, { timeout: 5000 }).catch(() => {});
    check('focus lock re-applied after reload', await E(() => window.__applied.some(a => a.focusMode === 'manual' && a.focusDistance === 0.42)));
    // rotation is remembered per camera across reloads (by camera name, since file:// IDs change each load)
    await pg.keyboard.press('r'); await wait(50);
    await pg.reload();
    await pg.waitForFunction(() => window.__docCam.state.stream && window.__docCam.panes.live.mapper, null, { timeout: 10000 }); await wait(200);
    check('rotation remembered after reload', await E(() => window.__docCam.state.live.rot === 90));
    check('no errors in drawing/adjust checks', errs3.length === 0, errs3);
    await b3.close();

    // fake camera without controls: plain message
    const b4 = await pw.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    const c4 = await b4.newContext({ viewport: { width: 1400, height: 900 } });
    await c4.addInitScript(() => { const P = MediaStreamTrack.prototype, gc = P.getCapabilities; P.getCapabilities = function () { const c = { ...gc.call(this) }; for (const k of ['focusMode', 'focusDistance', 'exposureMode', 'exposureTime', 'exposureCompensation', 'whiteBalanceMode', 'colorTemperature']) delete c[k]; return c; }; });
    const p4 = await c4.newPage();
    await p4.goto(URL); await p4.waitForFunction(() => window.__docCam.state.stream, null, { timeout: 10000 });
    await p4.keyboard.press('a'); await wait(100);
    check('camera without controls gets a plain explanation', (await p4.textContent('#camCtl')).includes('doesn’t let the browser'));
    await b4.close();
  }

  /* ================= Touch board: big targets, finger drawing, pinch while drawing ================= */
  {
    const b5 = await pw.chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
    const tctx = await b5.newContext({ viewport: { width: 1920, height: 1080 }, hasTouch: true, isMobile: false });
    const tp = await tctx.newPage();
    await tp.goto(URL);
    await tp.waitForFunction(() => window.__docCam.state.stream && window.__docCam.panes.live.mapper, null, { timeout: 10000 });
    const hgt = await tp.evaluate(() => document.querySelector('#snapBtn').getBoundingClientRect().height);
    check('touch screens get 44px buttons', hgt >= 44, hgt);
    const cdp = await tctx.newCDPSession(tp);
    const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p, i) => ({ x: p[0], y: p[1], id: i, radiusX: 4, radiusY: 4 })) });
    await tp.click('#drawBtn');
    const tb = await tp.locator('#inkLive').boundingBox();
    const cx = tb.x + tb.width * 0.4, cy = tb.y + tb.height * 0.5;
    await touch('touchStart', [[cx, cy]]);
    for (let s = 1; s <= 6; s++) await touch('touchMove', [[cx + s * 15, cy + s * 5]]);
    await touch('touchEnd', []); await wait(80);
    check('a finger draws with the pen', await tp.evaluate(() => window.__docCam.panes.live.ink.strokes.length === 1));
    // start a stroke, then a second finger lands: the stroke is dropped and the fingers pinch
    await touch('touchStart', [[cx, cy + 100]]);
    await touch('touchMove', [[cx + 20, cy + 100]]);
    await touch('touchStart', [[cx + 20, cy + 100], [cx + 120, cy + 100]]);
    for (let s = 1; s <= 8; s++) await touch('touchMove', [[cx + 20 - s * 10, cy + 100], [cx + 120 + s * 10, cy + 100]]);
    await touch('touchEnd', []); await wait(80);
    const st = await tp.evaluate(() => ({ n: window.__docCam.panes.live.ink.strokes.length, z: window.__docCam.state.live.zoom }));
    check('second finger cancels the stroke and pinches', st.n === 1 && st.z > 1.5, st);
    await b5.close();
  }

  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
