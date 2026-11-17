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

  console.log(`\n${passed} passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(1); });
