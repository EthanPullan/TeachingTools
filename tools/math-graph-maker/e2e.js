// Browser checks for the Math Graph Maker: drives the real page over file:// in Chromium.
// Run:  node tools/math-graph-maker/e2e.js [screenshot-folder]
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
const check = (name, ok, detail) => { if (ok) passed++; else { fails.push(name + (detail !== undefined ? '  → ' + JSON.stringify(detail) : '')); console.log('  FAIL', name, detail !== undefined ? JSON.stringify(detail) : ''); } };

/* PNG chunk reader: returns { w, h, dpi } from IHDR and pHYs (dpi null when there is no pHYs). */
function pngInfo(buf) {
  let p = 8, w = 0, h = 0, dpi = null;
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('latin1', p + 4, p + 8);
    if (type === 'IHDR') { w = buf.readUInt32BE(p + 8); h = buf.readUInt32BE(p + 12); }
    if (type === 'pHYs' && buf[p + 16] === 1) dpi = buf.readUInt32BE(p + 8) * 0.0254;
    p += 12 + len;
  }
  return { w, h, dpi };
}

(async () => {
  const browser = await pw.chromium.launch();
  const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1400, height: 1000 } });
  const page = await ctx.newPage();
  const errors = [], external = [], downloads = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push('PAGEERROR ' + e.message));
  page.on('request', r => { if (!/^(file|data|blob):/.test(r.url())) external.push(r.url()); });
  page.on('download', d => downloads.push(d));
  await page.goto(URL);
  await page.waitForSelector('#preview svg');

  const shot = async name => { if (shots) await page.screenshot({ path: path.join(shots, name + '.png') }); };
  const tab = async name => { await page.click(`.tab[data-tab="${name}"]`); };
  const objIds = () => page.$$eval('#preview [data-obj]', els => els.map(e => e.dataset.obj));
  const status = () => page.$eval('#status', e => e.textContent);
  const waitDownloads = async n => { for (let i = 0; i < 100 && downloads.length < n; i++) await page.waitForTimeout(100); };
  const saved = async d => { const f = path.join(os.tmpdir(), 'mgm-' + Date.now() + '-' + d.suggestedFilename()); await d.saveAs(f); return f; };
  /* user-space -> client pixels for a graph coordinate on the default ±10 grid (uses the clip rectangle, which is the plot ±2 mm) */
  const toClient = (dx, dy) => page.evaluate(([dx, dy]) => {
    const svg = document.querySelector('#preview svg'), r = svg.querySelector('clipPath rect');
    const x = +r.getAttribute('x') + 2, y = +r.getAttribute('y') + 2, w = +r.getAttribute('width') - 4, h = +r.getAttribute('height') - 4;
    const p = svg.createSVGPoint(); p.x = x + (dx + 10) / 20 * w; p.y = y + h - (dy + 10) / 20 * h;
    const q = p.matrixTransform(svg.getScreenCTM()); return { x: q.x, y: q.y };
  }, [dx, dy]);
  const pointRows = () => page.$$eval('#pointsWrap tbody tr', rows => rows.map(r => [...r.querySelectorAll('input[type=text]')].map(i => i.value)));

  console.log('Loading and offline');
  check('no console errors on load', errors.length === 0, errors);
  check('no network requests (works offline)', external.length === 0, external);
  check('starts with the sample graph', (await objIds()).length === 4, await objIds());
  await shot('01-load');

  console.log('Points table: add, type, validate');
  await tab('objects');
  const before = (await pointRows()).length;
  await page.click('[data-act="addPoint"]');
  let rows = await pointRows();
  check('+ Point adds a row with the next free letter', rows.length === before + 1 && rows[rows.length - 1][0] === 'D', rows[rows.length - 1]);
  check('a blank point draws nothing yet', (await objIds()).length === 4);
  await page.fill('#pointsWrap tbody tr:last-child input[data-c="1"]', '-6');
  await page.fill('#pointsWrap tbody tr:last-child input[data-c="2"]', '7');
  check('typing coordinates plots the point', (await objIds()).length === 5);
  await page.check('#pointsWrap tbody tr:last-child input[data-bind$=".coords"]');
  check('coordinates label uses a true minus sign', (await page.$$eval('#preview text', ts => ts.map(t => t.textContent))).some(t => t === 'D(−6, 7)'));
  await page.fill('#pointsWrap tbody tr:last-child input[data-c="1"]', 'abc');
  check('a non-number turns the cell red and is reported', (await page.$eval('#pointsWrap tbody tr:last-child input[data-c="1"]', e => e.classList.contains('bad'))) && /aren.t numbers|isn.t a number/.test(await status()), await status());
  await page.fill('#pointsWrap tbody tr:last-child input[data-c="1"]', '-6');
  await shot('02-points');

  console.log('Spreadsheet paste');
  await page.click('#pasteBtn');
  await page.fill('#pasteText', 'Name\tx\ty\nM\t1\t-1\nN\t2\t-2\nO\t3\t-3');
  await page.check('#pasteReplace');
  await page.click('#pasteOk');
  rows = await pointRows();
  check('the dialog replaced the points with the pasted block', rows.length === 3 && rows[0][0] === 'M' && rows[2][2] === '-3', rows);
  check('the triangle survived a points-only replace', (await objIds()).filter(i => i.startsWith('pg')).length === 1);
  await page.evaluate(() => {                                              // paste into a table cell, as from Excel
    const t = document.querySelector('#pointsWrap tbody tr:first-child input[data-c="1"]'); t.focus();
    const dt = new DataTransfer(); dt.setData('text', '5\t5\n6\t6\n7\t7\n8\t8');
    t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  rows = await pointRows();
  check('pasting a block into a cell overwrites down and grows the table', rows.length === 4 && rows[0][1] === '5' && rows[3][2] === '8' && rows[0][0] === 'M', rows);

  console.log('Shapes');
  await page.click('[data-act="addShape"][data-kind="polygon"]');
  check('+ Polygon adds a card with fresh letters', (await page.$$eval('#shapesWrap .card', c => c.length)) === 2 && (await page.$$eval('#shapesWrap .card:last-child input[data-c="0"]', i => i.map(x => x.value))).join('') === 'DEF', await page.$$eval('#shapesWrap .card:last-child input[data-c="0"]', i => i.map(x => x.value)));
  await page.click('#shapesWrap .card:last-child [data-act="addVert"]');
  check('+ Vertex extends the polygon', (await page.$$eval('#shapesWrap .card:last-child tbody tr', r => r.length)) === 4);
  await page.click('#shapesWrap .card:last-child [data-act="delVert"][data-k="3"]');
  await page.selectOption('#shapesWrap .card:last-child select[data-bind$=".fill"]', 'hatch');
  check('hatched fill is drawn', (await page.$$eval('#preview pattern', p => p.length)) === 1);
  await page.click('#shapesWrap .card:last-child [data-act="delObj"]');
  check('deleting a shape removes it', (await page.$$eval('#shapesWrap .card', c => c.length)) === 1);
  await shot('03-shapes');

  console.log('Click to place, drag to move');
  await page.click('button[data-act="delObj"] >> nth=0');                  // clear the point table so the counts below are simple
  while ((await pointRows()).length) await page.click('#pointsWrap button[data-act="delObj"] >> nth=0');
  await page.check('#editTool');
  const at = await toClient(3, -4);
  await page.mouse.click(at.x, at.y);
  rows = await pointRows();
  check('a click on the graph adds a point snapped to the gridlines', rows.length === 1 && rows[0][1] === '3' && rows[0][2] === '-4', rows);
  const off = await toClient(6.4, 2.6);
  await page.mouse.click(off.x, off.y);
  rows = await pointRows();
  check('clicks snap to whole gridlines', rows[1][1] === '6' && rows[1][2] === '3', rows);
  const from = await toClient(3, -4), to = await toClient(-7.2, 5.4);
  await page.mouse.move(from.x, from.y); await page.mouse.down(); await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, { steps: 4 }); await page.mouse.move(to.x, to.y, { steps: 4 }); await page.mouse.up();
  rows = await pointRows();
  check('dragging a point moves it (snapped)', rows[0][1] === '-7' && rows[0][2] === '5', rows);
  check('the grid stayed put while dragging', /−10|−10/.test(await page.$eval('#preview svg', s => s.textContent)));
  await page.uncheck('#editTool');
  await page.click('#undoBtn');
  rows = await pointRows();
  check('undo puts the dragged point back', rows[0][1] === '3' && rows[0][2] === '-4', rows);
  await page.click('#redoBtn');
  check('redo moves it again', (await pointRows())[0][1] === '-7');

  console.log('Test tab: scaffold levels, individual objects, pick tool');
  await tab('test');
  await page.click('[data-level="blank"]');
  check('choosing a level switches to the question view', await page.$eval('#viewSeg [data-view="question"]', b => b.classList.contains('active')));
  check('blank grid: no objects in the question', (await objIds()).length === 0);
  check('blank grid: no tick numbers in the question', (await page.$$eval('#preview text', ts => ts.filter(t => /^[−]?\d+$/.test(t.textContent)).length)) === 0);
  await page.click('[data-level="labels"]');
  check('axes and labels only: numbers stay, objects go', (await objIds()).length === 0 && (await page.$$eval('#preview text', ts => ts.filter(t => /^[−]?\d+$/.test(t.textContent)).length)) > 10);
  await page.click('[data-level="complete"]');
  await page.click('#viewSeg [data-view="key"]');
  const n0 = (await objIds()).length;
  await page.uncheck('#testPane .objlist input[type=checkbox] >> nth=0');
  check('unticking an object switches to the question, where it is gone', await page.$eval('#viewSeg [data-view="question"]', b => b.classList.contains('active')) && (await objIds()).length === n0 - 1, await objIds());
  await page.click('#viewSeg [data-view="key"]');
  check('the answer key still shows it, faded', (await objIds()).length === n0 && (await page.$$eval('#preview g[data-obj][opacity=".3"]', g => g.length)) === 1);
  await page.check('#pick');
  const target = await page.$('#preview [data-obj]:not([opacity]) >> nth=0');
  const box = await target.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  check('the pick tool hides what you click', /2 hidden/.test(await page.$eval('#markPill', e => e.textContent)), await page.$eval('#markPill', e => e.textContent));
  await page.uncheck('#pick');
  await shot('04-test');

  console.log('Scale lock: 1 grid square = 10 mm, measured by the browser');
  await tab('axes');
  for (const k of ['x', 'y']) { await page.fill(`#axesPane [data-bind="${k}.min"]`, '-5'); await page.fill(`#axesPane [data-bind="${k}.max"]`, '5'); }
  await tab('graph');
  await page.check('[data-bind="scale.lock"]');
  await page.fill('[data-bind="scale.mm"]', '10');
  const dl0 = downloads.length;
  await page.click('#svgBtn'); await waitDownloads(dl0 + 1);
  const svgText = fs.readFileSync(await saved(downloads[dl0]), 'utf8');
  const p2 = await ctx.newPage();
  await p2.setContent('<body style="margin:0">' + svgText.replace(/^<\?xml[^>]*>\s*/, '') + '</body>');
  const m = await p2.$eval('path[stroke="#8c8c8c"]', el => { const r = el.getBoundingClientRect(); const s = document.querySelector('svg').getBoundingClientRect(); return { w: r.width, h: r.height, pageW: s.width, pageH: s.height }; });
  const mm = px => px / 96 * 25.4;
  check('ten 10 mm squares measure 100 mm across (browser-measured, ±0.5 mm)', Math.abs(mm(m.w) - 100.22) < 0.5 && Math.abs(mm(m.h) - 100.22) < 0.5, { w: mm(m.w), h: mm(m.h) });
  const wMm = +/width="([\d.]+)mm"/.exec(svgText)[1];
  check('the page is as wide as it says', Math.abs(mm(m.pageW) - wMm) < 0.2, [mm(m.pageW), wMm]);
  await p2.close();
  const dl1 = downloads.length;
  await page.click('#pngBtn'); await waitDownloads(dl1 + 1);
  const info = pngInfo(fs.readFileSync(await saved(downloads[dl1])));
  const hMm = +/height="([\d.]+)mm"/.exec(svgText)[1];
  check('PNG is stamped 300 DPI', info.dpi !== null && Math.abs(info.dpi - 300) < 0.1, info);
  check('PNG pixel size matches the millimetres at 300 DPI', Math.abs(info.w / info.dpi * 25.4 - wMm) < 0.1 && Math.abs(info.h / info.dpi * 25.4 - hMm) < 0.1, [info.w / info.dpi * 25.4, wMm, info.h / info.dpi * 25.4, hMm]);
  check('the status bar shows the locked scale', /1 grid square = 10/.test(await status()), await status());
  await shot('05-locked');
  await page.uncheck('[data-bind="scale.lock"]');

  console.log('Export pair with matching names');
  await page.fill('#fname', 'q4');
  const dl2 = downloads.length;
  await page.click('#pairBtn'); await waitDownloads(dl2 + 2);
  const names = downloads.slice(dl2).map(d => d.suggestedFilename());
  check('question + key download as q4-q.png and q4-key.png', names.join() === 'q4-q.png,q4-key.png', names);
  const qi = pngInfo(fs.readFileSync(await saved(downloads[dl2]))), ki = pngInfo(fs.readFileSync(await saved(downloads[dl2 + 1])));
  check('question and key PNGs are the same size, both 300 DPI', qi.w === ki.w && qi.h === ki.h && Math.abs(qi.dpi - 300) < 0.1 && Math.abs(ki.dpi - 300) < 0.1, [qi, ki]);
  await page.selectOption('#pairFmt', 'svg');
  const dl3 = downloads.length;
  await page.click('#pairBtn'); await waitDownloads(dl3 + 2);
  check('SVG pair names', downloads.slice(dl3).map(d => d.suggestedFilename()).join() === 'q4-q.svg,q4-key.svg');
  await page.check('#transparent');
  const dl4 = downloads.length; await page.click('#svgBtn'); await waitDownloads(dl4 + 1);
  check('transparent SVG has no white page rectangle', !/<rect width="[\d.]+" height="[\d.]+" fill="#fff"\/>/.test(fs.readFileSync(await saved(downloads[dl4]), 'utf8')));
  await page.uncheck('#transparent');

  console.log('Save and reopen');
  const beforeSave = await page.evaluate(() => document.querySelector('#preview').innerHTML);
  const dl5 = downloads.length; await page.click('#saveBtn'); await waitDownloads(dl5 + 1);
  check('the saved file is named after the export name', downloads[dl5].suggestedFilename() === 'q4.mathgraph.json', downloads[dl5].suggestedFilename());
  const file = await saved(downloads[dl5]);
  const json = JSON.parse(fs.readFileSync(file, 'utf8'));
  check('the file carries specVersion and the tool name', json.specVersion === 1 && json.tool === 'math-graph-maker');
  await page.click('#newBtn');
  check('New gives a blank graph', (await objIds()).length === 0);
  await page.setInputFiles('#fileIn', file);
  await page.waitForTimeout(100);
  check('reopening gives an identical graph', await page.evaluate(() => document.querySelector('#preview').innerHTML) === beforeSave);
  const sci = path.join(os.tmpdir(), 'sci.graph.json'); fs.writeFileSync(sci, JSON.stringify({ specVersion: 4, type: 'line', series: [], rows: [] }));
  await page.setInputFiles('#fileIn', sci);
  await page.waitForTimeout(150);
  check('a Science Graph Maker file is refused with a clear message', /Science Graph Maker/.test(await page.$eval('#toasts', e => e.textContent)));
  await page.evaluate(() => document.querySelector('#toasts').innerHTML = '');

  console.log('Axes, style and layout controls');
  await tab('axes');
  await page.selectOption('[data-bind="axes.arrows"]', 'none');
  check('arrows: none removes the arrowheads', (await page.$$eval('#preview polygon[fill="#000"]', p => p.length)) === 0);
  await page.selectOption('[data-bind="axes.arrows"]', 'both');
  await page.check('[data-bind="grid.highlight5"]');
  check('darker every-5th gridlines appear', (await page.$$eval('#preview path[stroke="#555"]', p => p.length)) === 1);
  await page.click('[data-seg="axes.position"] [data-v="edges"]');
  check('axes along the edges draws a frame and no arrows', (await page.$$eval('#preview polygon[fill="#000"]', p => p.length)) === 0);
  await page.click('[data-seg="axes.position"] [data-v="origin"]');
  for (const k of ['x', 'y']) { await page.fill(`#axesPane [data-bind="${k}.min"]`, ''); await page.fill(`#axesPane [data-bind="${k}.max"]`, ''); }   // back to automatic ranges
  await tab('graph');
  await page.click('[data-seg="quadrants"] [data-v="1"]');
  check('one-quadrant layout has no negative numbers', !(await page.$$eval('#preview text', ts => ts.some(t => t.textContent.startsWith('−')))));
  await page.check('[data-bind="quadrantLabels"]');
  await page.selectOption('#sizePreset', 'half');
  check('half width is 82 mm', /82 ×/.test(await status()), await status());
  await page.click('[data-seg="quadrants"] [data-v="4"]');
  await tab('style');
  await page.check('[data-bind="style.colour"]');
  await shot('06-colour');
  await page.uncheck('[data-bind="style.colour"]');
  await page.check('[data-bind="style.largePrint"]');
  check('large print keeps the page width', /82 ×/.test(await status()));
  await page.uncheck('[data-bind="style.largePrint"]');

  console.log('Keyboard');
  await tab('graph');
  await page.click('#title');
  await page.keyboard.type('hello');
  const titleUndos = await page.evaluate(() => document.querySelector('#undoBtn').disabled);
  await page.keyboard.press('Control+z');
  check('typing in a box does not trigger the app undo shortcut (the box keeps its own undo)', titleUndos === false && /hello|hell|hel|he|h|^$/.test(await page.inputValue('#title')) && (await objIds()).length > 0, await page.inputValue('#title'));
  await page.click('.canvas-scroll');
  const dl6 = downloads.length; await page.keyboard.press('Control+s'); await waitDownloads(dl6 + 1);
  check('Ctrl+S saves the graph', downloads.length === dl6 + 1);

  console.log('Print layout (Ctrl+P)');
  await page.evaluate(() => window.dispatchEvent(new Event('beforeprint')));
  await page.emulateMedia({ media: 'print' });
  const wantMm = +/^\s*([\d.]+)\s*×/.exec(await status())[1];
  const pr = await page.evaluate(() => ({ app: getComputedStyle(document.querySelector('.app')).display, w: document.querySelector('#printSheet svg').getBoundingClientRect().width }));
  check('printing hides the app and shows only the graph', pr.app === 'none' && pr.w > 0, pr);
  check('the printed graph is at its real width', Math.abs(pr.w / 96 * 25.4 - wantMm) < 0.5, [pr.w / 96 * 25.4, wantMm]);
  await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
  await page.emulateMedia({ media: 'screen' });
  check('the print sheet is emptied afterwards', (await page.$eval('#printSheet', e => e.innerHTML)) === '');

  check('no console errors during the whole session', errors.length === 0, errors);
  check('still no network requests', external.length === 0, external);
  await browser.close();
  console.log(`\n${passed} checks passed, ${fails.length} failed`);
  if (fails.length) { console.log(fails.map(f => ' - ' + f).join('\n')); process.exit(1); }
})().catch(e => { console.error(e); process.exit(2); });
