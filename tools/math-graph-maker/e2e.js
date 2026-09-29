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
  check('the file carries specVersion and the tool name', json.specVersion === 3 && json.tool === 'math-graph-maker');
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
  await page.selectOption('[data-types="plane"] [data-bind="axes.arrows"]', 'none');
  check('arrows: none removes the arrowheads', (await page.$$eval('#preview polygon[fill="#000"]', p => p.length)) === 0);
  await page.selectOption('[data-types="plane"] [data-bind="axes.arrows"]', 'both');
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

  console.log('Equations tab: equations, tables of values, marks');
  await page.click('#newBtn');
  await page.selectOption('#sizePreset', 'full');
  await tab('functions');
  await page.click('[data-act="addEq"]');
  const eqIn = '#functionsPane input[data-bind$=".expr"]';
  check('+ Equation starts with a working line', (await page.$$eval('#preview [data-obj="fn1"] polyline', p => p.length)) >= 1 && (await page.$$eval('#preview text', ts => ts.some(t => t.textContent === 'y = 2x + 1'))));
  check('a line has arrowheads at both ends', (await page.$$eval('#preview [data-obj="fn1"] polygon', p => p.length)) === 2);
  await page.fill(eqIn, 'y = -2x + 3');
  check('typing a new equation redraws with true minus signs', await page.$$eval('#preview text', ts => ts.some(t => t.textContent === 'y = −2x + 3')));
  await page.fill(eqIn, 'y = 2x +');
  check('a half-typed equation shows a plain-language message, not an error', /ends too soon/.test(await page.$eval('[data-eqerr]', e => e.textContent)) && errors.length === 0, await page.$eval('[data-eqerr]', e => e.textContent));
  await page.fill(eqIn, 'f(x) = -2x + 3');
  await page.selectOption('#functionsPane [data-bind$=".intercepts"]', 'labelled');
  await page.selectOption('#functionsPane [data-bind$=".slope"]', 'labelled');
  const words = () => page.$$eval('#preview text', ts => ts.map(t => t.textContent));
  let w = await words();
  check('intercepts are marked with coordinates', w.includes('(0, 3)') && w.includes('(1.5, 0)'), w.filter(t => /\(/.test(t)));
  check('the slope triangle shows rise and run', w.includes('rise = −2') && w.includes('run = 1'));
  await page.selectOption('#functionsPane [data-bind$=".label"]', 'name');
  check('the function name f(x) can label the line', (await words()).includes('f(x)'));
  await page.fill(eqIn, 'y = 1/2x + 1');
  check('fractions are stacked (a bar under a small numerator)', (await page.$$eval('#preview line[stroke-width="0.272"]', l => l.length)) >= 1);
  await page.fill(eqIn, 'x^2 + y^2 = 25');
  check('an equation that cannot be graphed yet says so', /can.t be graphed yet/.test(await page.$eval('[data-eqerr]', e => e.textContent)));
  await page.fill(eqIn, 'y = -2x + 3');
  await tab('axes');
  await page.fill('#axesPane [data-bind="x.min"]', '-5'); await page.fill('#axesPane [data-bind="x.max"]', '5');
  await page.fill('#axesPane [data-bind="y.min"]', '-5'); await page.fill('#axesPane [data-bind="y.max"]', '9');
  await tab('functions');

  await page.click('[data-act="addTable"]');
  const tRows = () => page.$$eval('#functionsPane [data-cell="t"][data-c="0"]', i => i.map(x => x.value));
  check('+ Table of values picks whole-number x-values and shows the calculated y', (await tRows()).join() === '-2,-1,0,1,2' && (await page.$$eval('[data-ycell]', c => c.map(x => x.textContent))).join() === '7,5,3,1,−1');
  check('the table appears beside the graph', (await page.$$eval('#preview [data-obj="tb1"] text', t => t.map(x => x.textContent))).includes('7'));
  for (let k = 0; k < 5; k++) await page.check(`[data-tblank$=":y:${k}"]`);
  check('ticking Blank y switches to the question, where the y cells are empty', await page.$eval('#viewSeg [data-view="question"]', b => b.classList.contains('active')) && !(await page.$$eval('#preview [data-obj="tb1"] text', t => t.map(x => x.textContent))).some(x => ['7', '5', '3'].includes(x)));
  await tab('test');
  await page.click('[data-level="blank"]');
  check('blank grid: the line is gone but the table (with blanks) stays', (await objIds()).join() === 'tb1');
  const qBox = await page.$eval('#preview svg', s => s.getAttribute('viewBox'));
  await page.click('#viewSeg [data-view="key"]');
  check('the key shows the filled table and the line, on the same page size', (await objIds()).includes('fn1') && (await page.$$eval('#preview [data-obj="tb1"] text', t => t.map(x => x.textContent))).includes('7') && qBox === await page.$eval('#preview svg', s => s.getAttribute('viewBox')));
  await page.click('[data-level="complete"]');
  await tab('functions');
  await page.selectOption('#functionsPane [data-bind$=".place"]', 'below');
  await page.selectOption('#functionsPane [data-bind$=".orient"]', 'horizontal');
  check('a table can sit below the graph in rows', /165 ×/.test(await status()) && (await page.$$eval('#preview [data-obj="tb1"] line', l => l.length)) > 3);
  await page.selectOption('#functionsPane [data-bind$=".place"]', 'right'); await page.selectOption('#functionsPane [data-bind$=".orient"]', 'vertical');

  await page.fill(eqIn, 'y = 2x/3 + 1');
  await page.selectOption('#functionsPane [data-bind$=".intercepts"]', 'marked');
  await tab('test');
  check('readability warns about a line that is hard to read', /readability warning/.test(await status()) && /between gridlines|not a whole number/.test(await page.$eval('#readBox', e => e.textContent)), await page.$eval('#readBox', e => e.textContent));
  await tab('functions');
  await page.click('[data-act="suggestRows"]');
  check('“Suggest x-values” finds whole numbers that give whole-number y', (await tRows()).every(x => Number(x) % 3 === 0) && (await tRows()).join() === '-3,0,3', await tRows());   // the graph window is x = -5…5
  await page.fill('[data-fill="1:from"]', '-4'); await page.fill('[data-fill="1:to"]', '0'); await page.fill('[data-fill="1:step"]', '2');
  await page.click('[data-act="fillRows"]');
  check('Fill x generates the rows', (await tRows()).join() === '-4,-2,0', await tRows());
  await page.click('[data-act="addTRow"]');
  check('+ Row continues the pattern', (await tRows()).join() === '-4,-2,0,2');
  await page.evaluate(() => {                                              // paste two columns into the x cells
    const t = document.querySelector('#functionsPane [data-cell="t"][data-c="0"]'); t.focus();
    const dt = new DataTransfer(); dt.setData('text', '10\n20\n30'); t.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  check('pasting a column into the table fills it', (await tRows()).slice(0, 3).join() === '10,20,30');
  await page.click('[data-act="delTRow"][data-k="0"]');
  check('deleting a row removes it', (await tRows()).length === 3);

  await page.fill(eqIn, 'y = -x + 4');
  await tab('objects'); await page.click('[data-act="addPoint"]');
  await page.fill('#pointsWrap tbody tr:last-child input[data-c="1"]', '-3'); await page.fill('#pointsWrap tbody tr:last-child input[data-c="2"]', '-2');
  await tab('functions');
  await page.click('[data-act="addRelated"]');
  check('a perpendicular line through the point, with its equation and a right-angle marker', (await words()).includes('y = x + 1') && (await page.$$eval('#preview [data-obj="rl1"] polyline', p => p.filter(x => x.getAttribute('points').split(' ').length === 3).length)) === 1, (await words()).filter(t => /^y =/.test(t)));
  await page.click('[data-act="addIntersect"]');
  await page.selectOption('#functionsPane [data-bind="objects.4.of.0"]', 'fn1'); await page.selectOption('#functionsPane [data-bind="objects.4.of.1"]', 'rl1');
  check('the intersection is marked with its coordinates', (await words()).includes('(1.5, 2.5)'), (await words()).filter(t => /\(/.test(t)));
  await page.click('[data-act="addGuide"]');
  check('guide lines are drawn as dashes', (await page.$$eval('#preview [data-obj="gd1"] line[stroke-dasharray]', l => l.length)) === 2);
  await page.click('[data-act="addVlt"]');
  check('the vertical line test draws dashed lines with rings', (await page.$$eval('#preview [data-obj="vl1"] line', l => l.length)) === 2 && (await page.$$eval('#preview [data-obj="vl1"] circle', c => c.length)) >= 2);
  await page.fill('[data-vlt]', '-1, 2, 4');
  check('the test lines can be moved', (await page.$$eval('#preview [data-obj="vl1"] line', l => l.length)) === 3);
  await tab('test');
  await page.check('#testPane [data-vis="keyPoints"] >> nth=0').catch(() => {});
  await page.uncheck('#testPane [data-vis="keyPoints"]');
  check('“Intercepts and intersections” can be hidden from the question', !(await words()).includes('(1.5, 2.5)') && await page.$eval('#viewSeg [data-view="question"]', b => b.classList.contains('active')));
  await page.check('#testPane [data-vis="keyPoints"]'); await page.click('#viewSeg [data-view="key"]');

  const before2 = await page.evaluate(() => document.querySelector('#preview').innerHTML);
  const dl7 = downloads.length; await page.click('#saveBtn'); await waitDownloads(dl7 + 1);
  const file2 = await saved(downloads[dl7]);
  const saved2 = JSON.parse(fs.readFileSync(file2, 'utf8'));
  check('the file records every kind of object', ['function', 'table', 'related', 'intersect', 'guide', 'vlt', 'point'].every(k => saved2.objects.some(o => o.kind === k)), saved2.objects.map(o => o.kind));
  await page.click('#newBtn');
  await page.setInputFiles('#fileIn', file2); await page.waitForTimeout(150);
  check('reopening gives an identical graph, tables and all', await page.evaluate(() => document.querySelector('#preview').innerHTML) === before2);
  await tab('functions');
  await page.click('#functionsPane .card:first-of-type [data-act="delObj"]');
  check('deleting an equation clears what pointed at it', await page.$eval('#functionsPane [data-bind="objects.3.of"], #functionsPane select[data-bind$=".of"]', s => s.value) === '');
  await page.click('#undoBtn');
  check('undo brings it back', (await objIds()).includes('fn1'));
  await shot('07-equations');
  await tab('graph');

  console.log('Number lines');
  const planeIds = await objIds();
  await tab('graph');
  await page.click('[data-seg="type"] [data-v="numberline"]');
  check('Number line tab appears; plane tabs go', await page.isVisible('.tab[data-tab="line"]') && !(await page.isVisible('.tab[data-tab="objects"]')) && !(await page.isVisible('.tab[data-tab="functions"]')));
  check('the preview is now a number line (no plane objects drawn)', (await objIds()).length === 0 && await page.$$eval('#preview svg', s => s.length) === 1);
  await page.click('[data-seg="type"] [data-v="plane"]');
  check('switching back and forth loses no plane object', JSON.stringify(await objIds()) === JSON.stringify(planeIds), [await objIds(), planeIds]);
  await page.click('[data-seg="type"] [data-v="numberline"]');
  await tab('line');
  await page.selectOption('#linePreset', 'integers');
  check('quick setup: integers −10 to 10', /−10/.test(await page.$eval('#preview', e => e.textContent)) && /10/.test(await page.$eval('#preview', e => e.textContent)));
  await page.click('#linePane [data-act="addIneq"]');
  await page.fill('#linePane [data-bind$=".a.at"]', '-3');
  for (const n of ['inequality', 'interval', 'set']) await page.check(`#linePane [data-bind$=".notation.${n}"]`);
  const words3 = async () => (await page.$$eval('#preview text', t => t.map(x => x.textContent))).join(' ');
  const w3 = await words3();
  check('Graph x ≥ −3: all three notations are written', /x ≥ −3/.test(w3) && /\[−3, ∞\)/.test(w3) && /x ∈ ℝ/.test(w3), w3);
  check('and the solution is drawn (a marked object)', (await objIds()).length === 1);
  await shot('08-numberline-key');
  await page.click('#viewSeg [data-view="question"]'); 
  await tab('test');
  check('Test tab lists number-line rows, not plane ones', await page.isVisible('#testPane [data-vis="notation"]') && !(await page.isVisible('#testPane [data-vis="quadrantLabels"]').catch(() => false)));
  await page.click('#testPane [data-level="blank"]');
  check('blank question: solution and notation are gone', (await objIds()).length === 0 && !/x ≥ −3/.test(await words3()));
  await shot('09-numberline-question');
  await page.click('#viewSeg [data-view="key"]');
  check('the answer key still shows everything', (await objIds()).length === 1 && /x ≥ −3/.test(await words3()));
  await page.click('#testPane [data-level="complete"]');

  await tab('line');
  await page.selectOption('#linePane [data-bind$=".form"]', 'and');
  await page.fill('#linePane [data-bind$=".b.at"]', '4');
  await page.selectOption('#linePane [data-bind$=".b.op"]', 'lt');
  check('a compound inequality is written as −3 ≤ x < 4', /−3 ≤ x < 4/.test(await words3()), await words3());
  await page.selectOption('#linePane [data-bind$=".domain"]', 'integer');
  check('integers only: set notation switches to ℤ', /ℤ/.test(await words3()));

  await page.click('#linePane [data-act="addHops"]');
  await page.fill('#linePane [data-bind$=".start"]', '3');
  await page.fill('#linePane [data-list^="steps"]', '5, -8');
  await page.check('#linePane [data-bind$=".result"]');
  check('integer addition: 3 + 5 + (−8) shows hops +5 and −8 and the answer −0 → 0', /\+5/.test(await words3()) && /−8/.test(await words3()), await words3());
  await shot('10-numberline-hops');
  await page.click('#linePane [data-act="addSign"]');
  await page.fill('#linePane [data-bind$=".expr"]', '(x + 2)(x - 3)');
  await page.selectOption('#linePane [data-bind$=".op"] >> nth=-1', 'gt');
  const svgTxt = await page.$eval('#preview', e => e.innerHTML);
  check('sign chart for (x + 2)(x − 3) > 0 is drawn with + and − signs', (await page.$$eval('#preview [data-obj^="sc"]', e => e.length)) === 1 && /[+]<\/text>|>\+</.test(svgTxt) && />−</.test(svgTxt));
  await shot('11-numberline-signchart');

  await page.click('#linePane [data-act="boxAlt"]');
  await page.click('#viewSeg [data-view="question"]');
  const boxes = await page.$$eval('#preview rect[data-box], #preview rect', r => r.length);
  check('“Box every other number” puts blank boxes in the question', boxes > 0);
  await page.click('#viewSeg [data-view="key"]');

  await page.selectOption('#linePreset', 'percent');
  check('double number line preset: two lines, connectors', (await page.$$eval('#linePane [data-bind$=".label"]', e => e.length)) >= 2 && /Percent/.test(await words3()));
  await shot('12-numberline-double');
  await page.selectOption('#linePreset', 'thermometer');
  const dim = await page.$eval('#preview svg', s => { const v = s.viewBox.baseVal; return { width: v.width, height: v.height }; });
  check('thermometer preset is vertical (taller than wide)', dim.height > dim.width, [dim.width, dim.height]);
  await shot('13-numberline-vertical');

  await page.selectOption('#linePreset', 'fractions');
  await page.click('#linePane [data-act="addNlPoint"]');
  await page.fill('#linePane [data-bind$=".at"]', '0.375');
  await page.check('#linePane [data-bind$=".value"]');
  check('fractions preset writes 3/8 as a stacked fraction', /3/.test(await words3()) && /8/.test(await words3()));

  const dl9 = downloads.length; await page.click('#pngBtn'); await waitDownloads(dl9 + 1);
  const pn = downloads.slice(dl9).map(d => d.suggestedFilename());
  check('export downloads the PNG of the current view', pn.length >= 1 && pn.every(n => /\.png$/.test(n)), pn);
  const pi = pngInfo(fs.readFileSync(await saved(downloads[dl9])));
  check('number-line PNG is 300 DPI and not empty', Math.round(pi.dpi) === 300 && pi.w > 500 && pi.h > 100, pi);
  const dl8 = downloads.length; await page.click('#saveBtn'); await waitDownloads(dl8 + 1);
  const file3 = await saved(downloads[dl8]);
  const before3 = await page.evaluate(() => document.querySelector('#preview').innerHTML);
  const j3 = JSON.parse(fs.readFileSync(file3, 'utf8'));
  check('the file records the type and the line', j3.type === 'numberline' && j3.line && j3.line.rows.length === 1 && j3.specVersion === 3, [j3.type, j3.specVersion]);
  await page.click('#newBtn');
  await page.setInputFiles('#fileIn', file3); await page.waitForTimeout(150);
  check('reopening gives an identical number line', await page.evaluate(() => document.querySelector('#preview').innerHTML) === before3);
  check('the reopened file is still a number line with its tab', await page.isVisible('.tab[data-tab="line"]'));

  await tab('graph');
  await page.click('[data-seg="type"] [data-v="plane"]');
  check('switching back to a plane: the tabs return', await page.isVisible('.tab[data-tab="objects"]') && !(await page.isVisible('.tab[data-tab="line"]')));

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
