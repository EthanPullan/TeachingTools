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
