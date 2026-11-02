// Browser checks for the Triangle Maker: drives the real page over file:// in Chromium.
// Run:  node tools/triangle-maker/e2e.js [screenshot-folder]
// Needs Playwright + Chromium (this environment has them: /opt/node22/lib/node_modules/playwright, /opt/pw-browsers).
// Exits non-zero if any check fails. Not part of the shipped tool; the unit tests cover the pure logic.
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
let pw; try { pw = require('playwright'); } catch (e) { pw = require('/opt/node22/lib/node_modules/playwright'); }

const URL = 'file://' + path.join(__dirname, 'index.html');
const shots = process.argv[2] ? path.resolve(process.argv[2]) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const fails = []; let passed = 0;
const check = (name, ok, detail) => { if (ok) passed++; else { fails.push(name); console.log('  FAIL', name, detail !== undefined ? JSON.stringify(detail) : ''); } };

function pngInfo(buf) {
  let p = 8, w = 0, h = 0, dpi = null;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8);
    if (type === 'IHDR') { w = buf.readUInt32BE(p + 8); h = buf.readUInt32BE(p + 12); }
    if (type === 'pHYs' && buf[p + 16] === 1) dpi = Math.round(buf.readUInt32BE(p + 8) * 0.0254);
    p += 12 + len;
  }
  return { w, h, dpi };
}

(async () => {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 900 } });
  const page = await ctx.newPage();
  const errors = []; page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); }); page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  const status = () => page.locator('#status').innerText();
  const spec = () => page.evaluate(() => JSON.parse(JSON.stringify(window.TriangleMaker.spec)));
  const shot = async n => { if (shots) await page.screenshot({ path: path.join(shots, n + '.png') }); };
  const download = async (click) => { const [d] = await Promise.all([page.waitForEvent('download'), click()]); const f = path.join(os.tmpdir(), 'tm-' + Date.now() + '-' + d.suggestedFilename()); await d.saveAs(f); return { name: d.suggestedFilename(), file: f }; };
  const ringBox = async i => page.locator('.vh[data-i="' + i + '"] circle').boundingBox();

  await page.goto(URL);
  await page.waitForSelector('#paper svg');
  check('opens on a 3-4-5 right triangle', /Scalene, right triangle/.test(await status()), await status());
  check('no corner rings in the exports, three on screen', (await page.locator('.vh').count()) === 3);
  check('a fresh page has nothing to undo', await page.locator('#undoBtn').isDisabled());

  /* what you know: changing it keeps the same triangle */
  await page.selectOption('#method', 'sss');
  check('switching to SSS keeps 3-4-5', (await page.inputValue('#f_a')) === '3' && (await page.inputValue('#f_b')) === '4' && (await page.inputValue('#f_c')) === '5');
  await page.selectOption('#method', 'asa');
  check('switching to ASA fills the angles', (await page.inputValue('#f_A')) === '36.87' && (await page.inputValue('#f_c')) === '5');

  /* typing, errors and the empty state */
  await page.selectOption('#method', 'sss');
  await page.fill('#f_c', '9');
  check('impossible sides show a reason and no figure', /can’t make a triangle/.test(await page.locator('#buildMsg').innerText()) && (await page.locator('#paper svg').count()) === 0);
  check('exports are off while it is impossible', await page.locator('#pngBtn').isDisabled() && await page.locator('#svgBtn').isDisabled() && await page.locator('#pairBtn').isDisabled());
  await page.fill('#f_c', '');
  check('an empty box is accepted while typing, not refilled', (await page.inputValue('#f_c')) === '');
  await page.fill('#f_c', '6');
  check('fixing it brings the figure back', (await page.locator('#paper svg').count()) === 1);

  /* SSA: two triangles */
  await page.selectOption('#method', 'ssa');
  await page.fill('#f_a', '4'); await page.fill('#f_b', '5'); await page.fill('#f_A', '40');
  check('the ambiguous SSA case offers a choice', await page.locator('#ssaRow').isVisible());
  await page.selectOption('#ssaCase', '1');
  check('choosing the obtuse one gives an obtuse B', /angles 40° · 1\d\d/.test(await status()) || (await status()).includes('obtuse'), await status());
  await page.fill('#f_a', '2');
  check('SSA with a side that is too short says so', /too short/.test(await page.locator('#buildMsg').innerText()));

  /* quick start, then dragging */
  await page.click('[data-preset="2"]');                       // scalene acute 5, 6, 7
  check('quick start loads the triangle', /Scalene, acute triangle/.test(await status()));
  const before = await spec();
  const b0 = await ringBox(0), b2 = await ringBox(2);
  await page.mouse.move(b2.x + b2.width / 2, b2.y + b2.height / 2); await page.mouse.down();
  await page.mouse.move(b2.x + b2.width / 2 + 40, b2.y + b2.height / 2 + 30, { steps: 6 }); await page.mouse.up();
  let s = await spec();
  check('dragging a corner switches to free mode', s.mode === 'free');
  const moved = s.free.pts[2];
  check('the corner moved and snapped to the 0.5 grid', moved.every(v => Math.abs(v * 2 - Math.round(v * 2)) < 1e-9) && (moved[0] !== before.free.pts[2][0] || moved[1] !== before.free.pts[2][1]), moved);
  check('the other corners stayed put', JSON.stringify(s.free.pts[0]) === JSON.stringify(before.free.pts[0]) || s.mode === 'free');
  await page.keyboard.press('Control+z');
  s = await spec();
  check('undo after a drag goes back to the measurements', s.mode === 'build', s.mode);
  await page.keyboard.press('Control+y');
  check('redo goes forward again', (await spec()).mode === 'free');

  /* exact placement in free mode, snapped: make a right triangle by keyboard */
  await page.click('[data-preset="3"]');
  await page.click('[data-bind="mode"] button[data-v="free"]');
  s = await spec();
  check('Dragging corners keeps the current triangle', s.mode === 'free' && /right triangle/.test(await status()));
  await page.click('[data-act="zoomOut"]');
  await page.focus('.vh[data-i="0"]');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowUp');
  s = await spec();
  check('arrow keys nudge the focused corner by the snap step', Math.abs(s.free.pts[0][1] - 1) < 1e-9, s.free.pts[0]);
  check('the ring keeps keyboard focus after redrawing', await page.evaluate(() => document.activeElement && document.activeElement.classList.contains('vh')));
  check('the type updates as it moves (no longer right)', !/right/.test(await status()), await status());
  await page.keyboard.press('ArrowDown'); await page.keyboard.press('ArrowDown');
  check('back to exactly right-angled', /right triangle/.test(await status()));
  await page.click('[data-act="toBuild"]');
  s = await spec();
  check('Use these sides turns it into SSS 3-4-5', s.mode === 'build' && s.build.method === 'sss' && s.build.a === 3 && s.build.b === 4 && s.build.c === 5, s.build);
  await page.click('[data-bind="mode"] button[data-v="free"]');
  await page.click('[data-act="zoomOut"]'); await page.click('[data-act="zoomFit"]');
  check('zoom buttons keep a triangle on screen', (await page.locator('#paper svg').count()) === 1);
  await page.click('[data-bind="mode"] button[data-v="build"]');

  /* locking side lengths while dragging */
  const sides = async () => page.evaluate(() => { const m = window.TriangleMaker.core.resolve(window.TriangleMaker.spec).m; return m.sides; });
  const dragRing = async (i, dx, dy) => { const b = await ringBox(i), x = b.x + b.width / 2, y = b.y + b.height / 2; await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 4 }); await page.mouse.move(x + dx, y + dy, { steps: 4 }); await page.mouse.up(); };
  await page.click('[data-preset="3"]');                         // right 3-4-5; corners A(4,0) B(0,3) C(0,0)
  check('the lock card is there with three checkboxes named for the sides', (await page.locator('#lockRow input').count()) === 3 && /a · BC/.test(await page.locator('#lockRow').innerText()));
  check('with nothing locked the hint says corners move freely', /move freely/.test(await page.locator('#lockHint').innerText()));
  await page.check('[data-bind="lock.0"]');                      // side a = BC = 3
  check('locking a side explains itself', /Side a keeps its length/.test(await page.locator('#lockHint').innerText()));
  check('the locked side is highlighted on screen', (await page.locator('#paper svg line[stroke="#e0982e"]').count()) === 1);
  const L0 = await sides();
  await dragRing(0, 60, -90);                                    // drag A: side a does not touch A, so A is free
  check('dragging from build mode keeps the locks', (await spec()).mode === 'free' && JSON.stringify((await spec()).lock) === '[true,false,false]');
  await dragRing(2, 40, -70); await dragRing(2, -90, 30);        // C is an end of side a: it swings round B
  let L1 = await sides();
  check('the locked side keeps its length through two drags', Math.abs(L1[0] - L0[0]) < 1e-6, [L0[0], L1[0]]);
  check('...while another side changes', Math.abs(L1[1] - L0[1]) > 0.05 || Math.abs(L1[2] - L0[2]) > 0.05, [L0, L1]);
  await shot('locked-one-side');
  await page.keyboard.press('Control+z');
  check('one undo takes the last drag back, locks still on', JSON.stringify((await spec()).lock) === '[true,false,false]');

  /* a hinge: lock a and b, then open and close it */
  await page.check('[data-bind="lock.1"]');
  check('two locks describe the hinge', /Hinge at corner C/.test(await page.locator('#lockHint').innerText()));
  const H0 = await sides();
  const bA = await ringBox(0), bC = await ringBox(2), ux = bA.x - bC.x, uy = bA.y - bC.y, ul = Math.hypot(ux, uy);
  await dragRing(0, -uy / ul * 90, ux / ul * 90);                // along the tangent: that is the direction a hinge opens
  const H1 = await sides();
  check('hinge: both locked sides keep their lengths and the third changes', Math.abs(H1[0] - H0[0]) < 1e-6 && Math.abs(H1[1] - H0[1]) < 1e-6 && Math.abs(H1[2] - H0[2]) > 0.05, [H0, H1]);
  await page.focus('.vh[data-i="0"]');
  await page.keyboard.press('ArrowUp'); await page.keyboard.press('ArrowDown');
  const H2 = await sides();
  check('arrow keys also move a hinged corner and keep the locks', Math.abs(H2[0] - H0[0]) < 1e-6 && Math.abs(H2[1] - H0[1]) < 1e-6);

  /* rigid: all three locked */
  await page.check('[data-bind="lock.2"]');
  check('three locks say rigid', /Rigid/.test(await page.locator('#lockHint').innerText()));
  const R0 = await sides(), g0 = await page.evaluate(() => window.TriangleMaker.core.resolve(window.TriangleMaker.spec).m.centroid);
  await page.click('[data-act="zoomOut"]'); await page.click('[data-act="zoomOut"]');
  const ptsBefore = JSON.stringify((await spec()).free.pts);
  await dragRing(1, 70, 10);
  const R1 = await sides(), g1 = await page.evaluate(() => window.TriangleMaker.core.resolve(window.TriangleMaker.spec).m.centroid);
  check('rigid: dragging turns the triangle, keeping every length', R1.every((v, i) => Math.abs(v - R0[i]) < 1e-6) && Math.hypot(g1[0] - g0[0], g1[1] - g0[1]) < 1e-6);
  check('rigid: it did turn', JSON.stringify((await spec()).free.pts) !== ptsBefore);
  for (const i of [0, 1, 2]) await page.uncheck('[data-bind="lock.' + i + '"]');
  check('unlocking everything frees the corners again', /move freely/.test(await page.locator('#lockHint').innerText()) && (await page.locator('#paper svg line[stroke="#e0982e"]').count()) === 0);
  check('lock highlights never reach an SVG export', !/e0982e/.test(await page.evaluate(() => window.TriangleMaker.core.drawFigure(window.TriangleMaker.spec, {}).svg)));
  await page.check('[data-bind="lock.1"]'); await page.reload(); await page.waitForSelector('#paper svg');
  check('locks are remembered after a reload', JSON.stringify((await spec()).lock) === '[false,true,false]' && await page.locator('[data-bind="lock.1"]').isChecked());
  await page.uncheck('[data-bind="lock.1"]');
  await page.click('[data-bind="mode"] button[data-v="build"]');

  /* typing side lengths */
  await page.click('[data-preset="3"]');                         // right 3-4-5: A(4,0) B(0,3) C(0,0)
  await page.click('[data-bind="mode"] button[data-v="free"]');
  const lenBox = i => page.locator('[data-len="' + i + '"]');
  check('the length boxes show the live lengths', (await lenBox(0).inputValue()) === '3' && (await lenBox(1).inputValue()) === '4' && (await lenBox(2).inputValue()) === '5');
  check('each box says which corner is the one that moves', /moves C/.test(await page.locator('[data-end="0"] option:checked').innerText()) && /moves A/.test(await page.locator('[data-end="1"] option:checked').innerText()));
  const pts0 = (await spec()).free.pts;
  await lenBox(0).fill('6');                                     // side a = BC; default end moves C
  let sd = await sides(), sp = (await spec()).free.pts;
  check('typing 6 into a makes side a 6', Math.abs(sd[0] - 6) < 1e-9, sd);
  check('only the chosen end moved (A and B stayed)', JSON.stringify(sp[0]) === JSON.stringify(pts0[0]) && JSON.stringify(sp[1]) === JSON.stringify(pts0[1]) && JSON.stringify(sp[2]) !== JSON.stringify(pts0[2]), sp);
  check('the type and status followed', !/right/.test(await status()), await status());
  await page.selectOption('[data-end="0"]', '0');                // now B moves instead
  await lenBox(0).fill('2'); sd = await sides(); sp = (await spec()).free.pts;
  check('choosing the other end moves the other corner', Math.abs(sd[0] - 2) < 1e-9 && JSON.stringify(sp[2]) === JSON.stringify((await spec()).free.pts[2]) && JSON.stringify(sp[1]) !== JSON.stringify(pts0[1]));
  check('the end choice is saved in the file', JSON.stringify((await spec()).moveEnd) === '[0,1,1]');
  await lenBox(1).fill('');                                      // clearing a box while typing is allowed and changes nothing
  check('an empty box changes nothing', Math.abs((await sides())[1] - sd[1]) < 1e-12);
  await lenBox(1).fill('0');
  check('0 is refused with a reason and the triangle is untouched', /above 0/.test(await page.locator('#lenMsg').innerText()) && Math.abs((await sides())[1] - sd[1]) < 1e-12);
  await lenBox(1).fill('2.5'); await page.keyboard.press('Tab');
  check('a length typed with a decimal works and the box tidies on leaving', Math.abs((await sides())[1] - 2.5) < 1e-9 && (await lenBox(1).inputValue()) === '2.5');
  check('the message clears once something works', await page.locator('#lenMsg').isHidden());
  const afterTyping = JSON.stringify((await spec()).free.pts);
  await page.locator('#paper').click({ position: { x: 5, y: 5 } }); await page.keyboard.press('Control+z');
  check('typing is undoable (and one burst of typing is one step)', JSON.stringify((await spec()).free.pts) !== afterTyping);

  /* typing with locks */
  await page.click('[data-preset="3"]'); await page.click('[data-bind="mode"] button[data-v="free"]');
  await page.check('[data-bind="lock.2"]');                      // side c = AB = 5 locked
  await page.selectOption('[data-end="0"]', '0');                // typing a moves B, whose other side is c
  await lenBox(0).fill('4'); sd = await sides();
  check('typing keeps the other locked side at its length', Math.abs(sd[0] - 4) < 1e-9 && Math.abs(sd[2] - 5) < 1e-9, sd);
  await lenBox(0).fill('50');
  const msg = await page.locator('#lenMsg').innerText();
  check('an impossible length names the lock and the range', /With side c locked, side a has to be more than/.test(msg), msg);
  check('...and leaves the triangle as it was', Math.abs((await sides())[0] - 4) < 1e-9);
  await lenBox(2).fill('7');                                     // typing into the locked side itself
  check('typing into a locked side changes it and it stays locked', Math.abs((await sides())[2] - 7) < 1e-9 && JSON.stringify((await spec()).lock) === '[false,false,true]');
  await dragRing(0, 30, -30);
  check('the new length is the one that is now kept during dragging', Math.abs((await sides())[2] - 7) < 1e-6);
  check('the boxes follow a drag', (await lenBox(0).inputValue()) === String(+(await sides())[0].toFixed(2)));
  await page.uncheck('[data-bind="lock.2"]');

  /* a long length pulls the view with it */
  await page.click('[data-preset="3"]'); await page.click('[data-bind="mode"] button[data-v="free"]');
  await lenBox(1).fill('40');
  check('a length far beyond the view still shows, with the corner on screen', (await page.locator('#paper svg').count()) === 1 && (await page.locator('.vh').count()) === 3);
  const box = await page.locator('#paper svg').boundingBox();
  const inside = await Promise.all([0, 1, 2].map(async i => { const b = await ringBox(i); return b.x >= box.x - 1 && b.x + b.width <= box.x + box.width + 1 && b.y >= box.y - 1 && b.y + b.height <= box.y + box.height + 1; }));
  check('every corner is inside the figure', inside.every(Boolean), inside);
  await page.click('[data-bind="mode"] button[data-v="build"]');

  /* worksheet: unknowns hide on the question, show on the key */
  await page.click('[data-preset="6"]');
  await page.click('.tab[data-tab="labels"]');
  await page.click('[data-act="setSides:unknown"]'); await page.click('[data-act="setAngles:unknown"]');
  await page.selectOption('#typeCaption', 'blank');
  let qtext = await page.locator('#paper svg text').evaluateAll(els => els.map(e => e.textContent));
  check('question hides every number', qtext.filter(t => t === '?').length === 6 && !qtext.some(t => /cm|°/.test(t)), qtext);
  check('question has a blank for the type', qtext.some(t => /Type of triangle: _+/.test(t)));
  await page.click('[data-view="key"]');
  let ktext = await page.locator('#paper svg text').evaluateAll(els => els.map(e => e.textContent));
  check('key shows every answer', ktext.some(t => t === '110°') && ktext.some(t => t === '7.39 cm') && ktext.some(t => /Scalene, obtuse/.test(t)), ktext);
  check('the custom-text box is only on for "My text"', await page.locator('[data-bind="sides.0.text"]').isDisabled());
  await page.selectOption('[data-bind="sides.0.mode"]', 'custom');
  check('...and wakes up when chosen', await page.locator('[data-bind="sides.0.text"]').isEnabled());
  await page.fill('[data-bind="sides.0.text"]', 'x + 2');
  ktext = await page.locator('#paper svg text').evaluateAll(els => els.map(e => e.textContent));
  check('custom text shows on the figure', ktext.includes('x + 2'));
  await page.click('[data-view="question"]');

  /* marks and lines */
  await page.click('.tab[data-tab="marks"]');
  await page.check('[data-bind="lines.alt.2"]'); await page.check('[data-bind="circles.circ"]'); await page.check('[data-bind="points.O"]');
  await page.check('[data-bind="extrasKeyOnly"]');
  check('key-only extras are missing from the question', (await page.locator('#paper svg [stroke-dasharray="3 1.6"]').count()) === 0);
  await page.click('[data-view="key"]');
  check('...and present on the key', (await page.locator('#paper svg [stroke-dasharray="3 1.6"]').count()) === 1);
  await shot('key-with-extras');
  await page.uncheck('[data-bind="extrasKeyOnly"]');

  /* exports */
  await page.click('.tab[data-tab="page"]'); await page.fill('#fname', 'My Triangle!');
  await page.click('[data-view="question"]');
  const svg = await download(() => page.click('#svgBtn'));
  const svgText = fs.readFileSync(svg.file, 'utf8');
  check('SVG file is named after the file name and the version', svg.name === 'my-triangle-q.svg', svg.name);
  check('SVG is well formed, in millimetres, with no corner rings', svgText.startsWith('<?xml') && /width="\d+(\.\d+)?mm"/.test(svgText) && !svgText.includes('class="vh"'));
  const png = await download(() => page.click('#pngBtn'));
  const info = pngInfo(fs.readFileSync(png.file));
  check('PNG is stamped 300 DPI and the right size', info.dpi === 300 && info.w > 1000 && info.h > 700, info);
  await page.selectOption('#pairFmt', 'svg');
  const names = []; const onDl = d => names.push(d.suggestedFilename()); page.on('download', onDl);
  await page.click('#pairBtn'); await page.waitForTimeout(1500); page.off('download', onDl);
  check('question + key downloads a matching pair', names.length === 2 && names[0] === 'my-triangle-q.svg' && names[1] === 'my-triangle-key.svg', names);

  /* real size */
  await page.check('#trueSize');
  const f = await spec();
  const w = await page.evaluate(() => document.querySelector('#paper svg').getAttribute('width'));
  check('real size sets the figure size from the triangle', f.trueSize === true && /mm$/.test(w) && parseFloat(w) !== 120, w);
  await page.click('.tab[data-tab="labels"]'); await page.selectOption('#unit', 'in');
  await page.click('.tab[data-tab="page"]');
  check('real size is unavailable for inches', await page.locator('#trueSize').isDisabled());
  await page.click('.tab[data-tab="labels"]');
  await page.selectOption('#unit', 'cm'); await page.click('.tab[data-tab="page"]'); await page.uncheck('#trueSize');

  /* save and open */
  const saved = await download(() => page.click('#saveBtn'));
  check('Save writes a .triangle.json', saved.name === 'my-triangle.triangle.json', saved.name);
  const savedSpec = JSON.parse(fs.readFileSync(saved.file, 'utf8'));
  await page.click('#newBtn');
  check('New starts over', (await spec()).caption === '' && /Scalene, right/.test(await status()));
  await page.setInputFiles('#fileIn', saved.file);
  await page.waitForTimeout(150);
  check('Open brings the saved triangle back', JSON.stringify((await spec()).sides) === JSON.stringify(savedSpec.sides) && (await spec()).name === 'My Triangle!');
  await page.setInputFiles('#fileIn', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"tool":"other"}') });
  await page.waitForTimeout(150);
  check('a file from another tool is refused with a message', /not a Triangle Maker file/.test(await page.locator('.toast').last().innerText()));

  /* it remembers between visits */
  await page.reload(); await page.waitForSelector('#paper svg');
  check('the last triangle is still there after reload', (await spec()).name === 'My Triangle!');

  /* print */
  await page.evaluate(() => { window.print = () => { window.__printed = true; }; });
  await page.click('#moreMenu summary'); await page.click('[data-act="print"]');
  check('Print puts the figure on the print sheet', await page.evaluate(() => window.__printed === true && document.querySelector('#printSheet svg') !== null));

  /* phone width, and the keyboard help */
  await page.setViewportSize({ width: 390, height: 800 }); await page.waitForTimeout(100);
  const hscroll = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
  await shot('phone');
  check('no sideways scroll on a phone', !hscroll);
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.click('#moreMenu summary'); await page.click('[data-act="help"]');
  check('the tips dialog opens', await page.locator('#helpDlg').evaluate(d => d.open));
  await page.click('#helpDlg [data-close]');

  check('no console errors the whole way through', errors.length === 0, errors);
  await browser.close();
  console.log(passed + ' passed, ' + fails.length + ' failed');
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
