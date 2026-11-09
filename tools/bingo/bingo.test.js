// Unit tests for the Bingo core (the <bingo-core> block in index.html). So far: the shareable page.
// Run:  node --test tools/bingo/bingo.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
const C = vm.runInNewContext(/\/\* <bingo-core>[\s\S]*?\/\* <\/bingo-core> \*\//.exec(html)[0] + ';BingoCore', {});

const src = { style:'body{margin:0;}', body:'<div id="app"></div>', script:'/* the tool */' };
const jsonOf = page => /<script type="application\/json" id="sharedGame">([\s\S]*?)<\/script>/.exec(page)[1];

test('a shareable page holds the tool and the game, in the order the tool needs', () => {
  const data = { type:'teachingtools-bingo', share:'gabc', game:{ name:'Times tables', itemsText:'6 × 7 | 42' } };
  const page = C.sharePage(src, 'Times tables · Bingo', data);
  assert.ok(page.startsWith('<!DOCTYPE html>'));
  assert.match(page, /<meta charset="UTF-8">/);
  assert.match(page, /<title>Times tables · Bingo<\/title>/);
  assert.match(page, /<style id="appStyle">body\{margin:0;\}<\/style>/);
  assert.match(page, /<style id="pageStyle">/);
  const at = s => page.indexOf(s);
  assert.ok(at('<div id="app">') < at('id="sharedGame"') && at('id="sharedGame"') < at('<script>/* the tool */</script>'));
  assert.deepEqual(JSON.parse(jsonOf(page)), data);
});
test('nothing typed in a game can end the JSON block or the page title early', () => {
  const nasty = 'Is 3 < 4? </script><script>alert(1)</script> <!-- <b> &amp; “quotes”  ';
  const data = { game:{ name:nasty, itemsText:nasty + ' | 1' } };
  const page = C.sharePage(src, nasty, data);
  assert.equal(page.split('</script>').length - 1, 2, 'only the two real script ends');
  assert.ok(!jsonOf(page).includes('<'));
  assert.deepEqual(JSON.parse(jsonOf(page)), data);
  assert.ok(!/<title>[^<]*<\/script>/.test(page) && page.includes('<title>Is 3 &lt; 4?'));
});
test('the tool itself is safe to copy into a page: no “<!--” and no script end inside its script', () => {
  const script = /<script>([\s\S]*)<\/script>\s*<\/body>/.exec(html)[1];
  assert.ok(!script.includes('<!--') && !/<\/script/i.test(script));
  assert.match(html, /<style id="appStyle">/);
});

/* ---------- winning patterns ---------- */
test('patternShape: what is drawn for each pattern, and for a custom one', () => {
  const sh = (k, n, c) => Array.from(C.patternShape(k, n, c));
  assert.deepEqual(sh('row', 5), [0, 1, 2, 3, 4]);
  assert.deepEqual(sh('col', 5), [0, 5, 10, 15, 20]);
  assert.deepEqual(sh('line', 3), [0, 1, 2, 4, 8]);            // one row and the diagonal: "any line"
  assert.deepEqual(sh('corners', 4), [0, 3, 12, 15]);
  assert.deepEqual(sh('x', 5), [0, 4, 6, 8, 12, 16, 18, 20, 24]);
  assert.equal(sh('frame', 5).length, 16); assert.equal(sh('full', 4).length, 16);
  assert.deepEqual(sh('custom', 3, [8, 0, 0, 4, -1, 9, 1.5, 'x']), [0, 4, 8]);   // sorted, unique, only squares on the card
  assert.deepEqual(sh('custom', 3, null), []);
  C.PATTERN_ORDER.forEach(k => assert.ok(sh(k, 5).length > 0));
});
test('a custom pattern wins when exactly its squares are called, and the FREE centre counts as called', () => {
  const g = C.geometry(3, true), pool = [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({ a:String(i), k:'k' + i, t:'int', decoy:i === 7 }));
  const card = [0, 1, 2, 3, -1, 4, 5, 6, 7];                  // 3×3 with a FREE centre and one decoy in the last square
  const L = { name:'L', hint:'', targets:() => [[0, 3, 4]] };  // top-left, middle-left and the FREE centre
  const called = new Set(['k0']);
  let r = C.checkCard(card, pool, g, called, L);
  assert.equal(r.win, false); assert.deepEqual(Array.from(r.best.missing), [3]); assert.equal(r.live, 1);
  called.add('k3'); assert.equal(C.checkCard(card, pool, g, called, L).win, true);
  // a custom shape through a decoy can never be won
  const D = { name:'D', hint:'', targets:() => [[0, 8]] };
  r = C.checkCard(card, pool, g, new Set(['k0']), D); assert.equal(r.live, 0); assert.equal(r.win, false);
  // a built-in one still works by name
  assert.equal(C.checkCard(card, pool, g, new Set(['k0', 'k1', 'k2']), 'row').win, true);
  assert.equal(C.targetName('custom', g, 0), 'your pattern');
});
test('simulate takes a custom pattern, and a smaller one is won sooner than the full card', () => {
  const size = 3, pool = Array.from({ length: 12 }, (_, i) => ({ a:String(i), k:'k' + i, t:'int', decoy:false }));
  const rng = C.makeRng(3), cards = Array.from({ length: 12 }, () => C.shuffle(pool.map((_, i) => i), rng).slice(0, 9));
  const one = C.simulate(pool, cards, size, false, { name:'one', hint:'', targets:() => [[0]] }, 100);
  const full = C.simulate(pool, cards, size, false, 'full', 100);
  assert.ok(one.first < full.first && one.winnable === 12, JSON.stringify([one, full]));
});
