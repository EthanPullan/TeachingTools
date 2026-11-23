// Unit tests for the Bingo core (the <bingo-core> block in index.html): the shareable page, patterns, categories.
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

/* ---------- categories: a third column, and picking a set spread across them ---------- */
const plain = v => JSON.parse(JSON.stringify(v));
const row = it => [it.q, it.a, it.cat];
test('a third column is the category; a question’s own |x| bars don’t get mistaken for one', () => {
  const p = C.parseItems([
    '6 × 7 | 42 | Times tables',
    '12 ÷ 4 | 3',
    'Evaluate |−5| | 5',
    'Evaluate |−6| | 6 | Absolute value',
    '| 99 | Answers only',
    '  2 + 2   |  4  |   Adding   things  '
  ].join('\n'));
  assert.deepEqual(plain(p.items.map(row)), [
    ['6 × 7', '42', 'Times tables'], ['12 ÷ 4', '3', ''], ['Evaluate |−5|', '5', ''],
    ['Evaluate |−6|', '6', 'Absolute value'], ['', '99', 'Answers only'], ['2 + 2', '4', 'Adding things']]);
  assert.deepEqual(plain(p.problems), []);
  // and back to a line that reads the same
  p.items.forEach(it => assert.deepEqual(plain(row(C.parseItems(C.itemLine(it)).items[0])), plain(row(it)), C.itemLine(it)));
  assert.equal(C.itemLine({ q:'6 × 7', a:'42' }), '6 × 7 | 42');
  assert.equal(C.itemLine({ q:'', a:'42' }), '42');
  assert.equal(C.itemLine({ q:'Q', a:'1', cat:'A | B' }), 'Q | 1 | A B');
});
test('categories come in from a draft (JSON) and a spreadsheet', () => {
  const d = C.readDraft({ items:[{ question:'6 × 7', answer:'42', category:'Times' }, { question:'Q', answer:'1' }] });
  assert.ok(d.ok);
  assert.deepEqual(plain(d.items), [{ q:'6 × 7', a:'42', cat:'Times' }, { q:'Q', a:'1' }]);
  const t = C.readTable([['question', 'answer', 'category'], ['6 × 7', '42', 'Times'], ['Q', '1', '']]);
  assert.deepEqual(plain(t.items), [{ q:'6 × 7', a:'42', cat:'Times' }, { q:'Q', a:'1' }]);
});

// A bank: category A has 20 questions, B 20, C 5 (answers 1..45, all different).
const bank = C.parseItems(Array.from({ length:45 }, (_, i) => 'Q' + i + ' | ' + (i + 1) + ' | ' + (i < 20 ? 'A' : i < 40 ? 'B' : 'C')).join('\n')).items;
const count = (r, items) => { const n = {}; r.picked.forEach(i => { n[items[i].cat] = (n[items[i].cat] || 0) + 1; }); return n; };
test('categoriesOf lists each category once, in order, with how many different answers it has', () => {
  assert.deepEqual(plain(C.categoriesOf(bank)), [{ name:'A', n:20 }, { name:'B', n:20 }, { name:'C', n:5 }]);
  const dup = C.parseItems('a | 1 | X\nb | 1 | X\nc | 2').items;
  assert.deepEqual(plain(C.categoriesOf(dup)), [{ name:'X', n:1 }, { name:'', n:1 }]);
});
test('picking evenly: the same share each, and a small category gives what it has', () => {
  for(let seed = 1; seed <= 30; seed++){
    const r = C.pickByCategory(bank, { count:12 }, C.makeRng(seed));
    assert.deepEqual(count(r, bank), { A:4, B:4, C:4 });
    assert.equal(r.short, 0);
    assert.deepEqual(plain(r.picked), plain(r.picked.slice().sort((a, b) => a - b)), 'in the order of the box');
    const big = C.pickByCategory(bank, { count:30 }, C.makeRng(seed));
    const n = count(big, bank);
    assert.equal(n.C, 5); assert.equal(n.A + n.B, 25); assert.ok(Math.abs(n.A - n.B) <= 1);
  }
});
test('picking with weights: 2 gets twice the share of 1, and 0 leaves a category out', () => {
  for(let seed = 1; seed <= 30; seed++){
    assert.deepEqual(count(C.pickByCategory(bank, { count:15, weights:{ A:2, B:1, C:0 } }, C.makeRng(seed)), bank), { A:10, B:5 });
    // 12 split 3 : 1 : 1 is 7.2, 2.4, 2.4: each within 1 of its exact share
    const n = count(C.pickByCategory(bank, { count:12, weights:{ A:3, B:1 } }, C.makeRng(seed)), bank);
    assert.equal(n.A + n.B + n.C, 12);
    [['A', 7.2], ['B', 2.4], ['C', 2.4]].forEach(([c, x]) => assert.ok(Math.abs(n[c] - x) < 1, c + ' ' + n[c]));
  }
  const r = C.pickByCategory(bank, { count:50, weights:{ C:0 } }, C.makeRng(1));
  assert.equal(r.picked.length, 40); assert.equal(r.short, 10);
  assert.equal(C.pickByCategory(bank, { count:10, weights:{ A:0, B:0, C:0 } }, C.makeRng(1)).picked.length, 0);
});
test('picking never takes two questions with the same answer, and differs from seed to seed', () => {
  const items = C.parseItems(Array.from({ length:40 }, (_, i) => 'Q' + i + ' | ' + (i % 10) + ' | ' + (i % 2 ? 'Odd' : 'Even')).join('\n')).items;
  for(let seed = 1; seed <= 20; seed++){
    const r = C.pickByCategory(items, { count:40 }, C.makeRng(seed));
    assert.equal(new Set(r.picked.map(i => items[i].v.key)).size, r.picked.length);
    assert.equal(r.picked.length, 10);
  }
  const a = C.pickByCategory(bank, { count:12 }, C.makeRng(1)).picked, b = C.pickByCategory(bank, { count:12 }, C.makeRng(2)).picked;
  assert.notDeepEqual(plain(a), plain(b));
  assert.deepEqual(plain(a), plain(C.pickByCategory(bank, { count:12 }, C.makeRng(1)).picked), 'the same seed gives the same pick');
});
