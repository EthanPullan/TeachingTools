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
