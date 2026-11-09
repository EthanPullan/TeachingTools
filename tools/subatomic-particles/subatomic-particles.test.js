// Unit tests for the Subatomic Particles core (the <subatomic-core> block in index.html).
// Run:  node --test tools/subatomic-particles/subatomic-particles.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const block = (file, name) => new RegExp('/\\* <' + name + '>[\\s\\S]*?/\\* </' + name + '> \\*/').exec(fs.readFileSync(path.join(__dirname, file), 'utf8'))[0];
const K = vm.runInNewContext(block('index.html', 'subatomic-core') + ';SubatomicCore', {});
const Bingo = vm.runInNewContext(block('../bingo/index.html', 'bingo-core') + ';BingoCore', {});
const plain = v => JSON.parse(JSON.stringify(v));
const P = K.pools();
const bySym = new Map(K.ELEMENTS.map(e => [e.sym, e]));
const byName = new Map(K.ELEMENTS.map(e => [e.name, e]));

/* ---------- data ---------- */
test('elements 1 to 36 match the Periodic Table tool (symbol, name, atomic mass)', () => {
  const html = fs.readFileSync(path.join(__dirname, '../periodic-table/index.html'), 'utf8');
  const raw = /const RAW = `([\s\S]*?)`/.exec(html)[1].trim().split('\n').slice(0, 36).map(l => l.trim().split(' '));
  assert.equal(K.ELEMENTS.length, 36);
  raw.forEach(([z, sym, name, mass], i) => {
    const e = K.ELEMENTS[i];
    assert.deepEqual([e.z, e.sym, e.name, e.mass], [+z, sym, name.toLowerCase(), +mass]);
  });
});
test('isotopes are plausible: the first is within 1 of the rounded atomic mass, none has fewer than 0 neutrons', () => {
  K.ELEMENTS.forEach(e => {
    assert.ok(e.isotopes.length >= 1 && new Set(e.isotopes).size === e.isotopes.length, e.sym);
    assert.ok(Math.abs(e.isotopes[0] - Math.round(e.mass)) <= 1, e.sym + ' first isotope');
    e.isotopes.forEach(A => assert.ok(A >= e.z && Math.abs(A - Math.round(e.mass)) <= 4, e.sym + '-' + A));
  });
  // a few that are easy to get wrong
  const first = s => bySym.get(s).isotopes[0];
  assert.deepEqual(['H', 'Cl', 'Ar', 'K', 'Ni', 'Cu', 'Se', 'Br'].map(first), [1, 35, 40, 39, 58, 63, 80, 79]);
});
test('ions are real elements with a sensible charge, no ion twice', () => {
  const seen = new Set();
  K.IONS.forEach(([sym, q]) => {
    assert.ok(bySym.has(sym) && Number.isInteger(q) && q !== 0 && Math.abs(q) <= 4, sym + q);
    assert.ok(bySym.get(sym).z - q >= 0, sym + ' has electrons left');
    assert.ok(!seen.has(sym + q)); seen.add(sym + q);
  });
  assert.equal(K.ionLabel('O', -2), 'O²⁻'); assert.equal(K.ionLabel('Na', 1), 'Na⁺');
  assert.equal(K.chargeText(2), '2+'); assert.equal(K.chargeText(-1), '1\u2212');
});

/* ---------- the questions: every answer is worked out again from the words on the slide ---------- */
test('every question has the right answer for what it asks', () => {
  const ionOf = s => { const m = /^([A-Z][a-z]?)([²³⁴]?)([⁺⁻])$/.exec(s); return { e:bySym.get(m[1]), q:({ '':1, '²':2, '³':3, '⁴':4 })[m[2]] * (m[3] === '⁻' ? -1 : 1) }; };
  let m;
  K.ALL.forEach(x => {
    let want;
    if((m = /^How many protons are in an atom of (\w+)\?$/.exec(x.q))) want = byName.get(m[1]).z;
    else if((m = /^How many electrons are in a neutral atom of (\w+)\?$/.exec(x.q))) want = byName.get(m[1]).z;
    else if((m = /^How many neutrons are in an atom of (\w+)\u2011(\d+)\?$/.exec(x.q))) want = +m[2] - byName.get(m[1]).z;
    else if((m = /^How many electrons are in the ion (\S+)\?$/.exec(x.q))){ const i = ionOf(m[1]); want = i.e.z - i.q; }
    else if((m = /^An atom has (\d+) protons? and (\d+) neutrons?\. What is its mass number\?$/.exec(x.q))) want = +m[1] + +m[2];
    else if((m = /^An atom with mass number (\d+) has (\d+) neutrons?\. What is its atomic number\?$/.exec(x.q))) want = +m[1] - +m[2];
    else if((m = /^An ion has (\d+) protons? and (\d+) electrons?\. What is its charge\?$/.exec(x.q))){ const q = +m[1] - +m[2]; want = Math.abs(q) + (q < 0 ? '\u2212' : '+'); }
    else assert.fail('unknown wording: ' + x.q);
    assert.equal(x.a, String(want), x.q);
  });
  assert.equal(new Set(K.ALL.map(x => x.id)).size, K.ALL.length, 'ids are unique');
  assert.equal(new Set(K.ALL.map(x => x.q)).size, K.ALL.length, 'no question is worded twice');
});
test('singular and plural read properly', () => {
  const q = id => K.ALL.find(x => x.id === id).q;
  assert.equal(q('m:H-1'), 'An atom has 1 proton and 0 neutrons. What is its mass number?');
  assert.equal(q('m:H-2'), 'An atom has 1 proton and 1 neutron. What is its mass number?');
  assert.equal(q('c:H:1'), 'An ion has 1 proton and 0 electrons. What is its charge?');
  assert.equal(q('n:Cl-35'), 'How many neutrons are in an atom of chlorine\u201135?');
});

/* ---------- picking a set ---------- */
test('a set has the number asked for, only ticked types, spread evenly, every answer different', () => {
  for(let seed = 1; seed <= 40; seed++){
    const r = K.pickSet(P, { types:K.TYPES, count:30 }, K.makeRng(seed));
    assert.equal(r.list.length, 30); assert.equal(r.short, 0);
    assert.equal(new Set(r.list.map(x => K.keyOf(x.a))).size, 30, 'answers differ (seed ' + seed + ')');
    const n = t => r.list.filter(x => x.type === t).length;
    assert.deepEqual(plain(K.TYPES.map(n)).sort(), [7, 7, 8, 8]);
    // protons, neutrons and electrons all come up
    assert.deepEqual([...new Set(r.list.filter(x => x.type === 'atoms').map(x => x.kind))].sort(), ['e', 'n', 'p']);
    const two = K.pickSet(P, { types:['ions', 'mass'], count:20 }, K.makeRng(seed));
    assert.ok(two.list.every(x => x.type === 'ions' || x.type === 'mass')); assert.equal(two.list.length, 20);
  }
});
test('elements are spread out: no element is used much more than the rest', () => {
  const r = K.pickSet(P, { types:K.TYPES, count:30 }, K.makeRng(5));
  const use = {}; r.list.forEach(x => { use[x.sym] = (use[x.sym] || 0) + 1; });
  assert.ok(Math.max(...Object.values(use)) <= 3, JSON.stringify(use));
});
test('when the choices run out it says how many short, and other types fill the gap', () => {
  const only = K.pickSet(P, { types:['charge'], count:30 }, K.makeRng(3));
  assert.equal(only.list.length, 7);            // 1+ 2+ 3+ 4+ 1− 2− 3−
  assert.equal(only.short, 23);
  const mixed = K.pickSet(P, { types:['charge', 'atoms'], count:30 }, K.makeRng(3));
  assert.equal(mixed.list.length, 30); assert.equal(mixed.list.filter(x => x.type === 'charge').length, 7);
  const big = K.pickSet(P, { types:K.TYPES, count:100 }, K.makeRng(3));
  assert.ok(big.list.length >= 60 && big.list.length + big.short === 100, 'made ' + big.list.length);
  assert.equal(new Set(big.list.map(x => K.keyOf(x.a))).size, big.list.length);
  assert.equal(K.pickSet(P, { types:[], count:30 }, K.makeRng(3)).list.length, 0);
});
test('locked questions stay, and swapping gives the same type with a new answer', () => {
  const first = K.pickSet(P, { types:K.TYPES, count:30 }, K.makeRng(11)).list;
  const locked = [first[0], first[12], first[29]];
  const next = K.pickSet(P, { types:K.TYPES, count:30 }, K.makeRng(12), ).list;
  assert.notDeepEqual(next.map(x => x.id), first.map(x => x.id));
  const kept = K.pickSet(P, { types:K.TYPES, count:30, locked }, K.makeRng(12)).list;
  locked.forEach(x => assert.ok(kept.includes(x)));
  assert.equal(new Set(kept.map(x => K.keyOf(x.a))).size, 30);
  for(let i = 0; i < first.length; i++){
    const x = K.replaceOne(P, first, i, K.makeRng(i));
    assert.ok(x && x.type === first[i].type && x.id !== first[i].id);
    assert.ok(!first.some((y, j) => j !== i && K.keyOf(y.a) === K.keyOf(x.a)), 'new answer is not already in the set');
  }
});

/* ---------- decoys ---------- */
test('mistakes are the ones named', () => {
  const m = id => plain(K.mistakesFor(K.ALL.find(x => x.id === id)).map(d => [d.kind, d.answer]));
  assert.deepEqual(m('n:Cl-35'), [['protons', '17'], ['massNumber', '35'], ['added', '52']]);
  assert.deepEqual(m('p:Ni'), [['atomicMass', '59']]);        // 58.693 on the periodic table
  assert.deepEqual(m('p:H'), []);                            // hydrogen's mass rounds to its atomic number
  assert.deepEqual(m('i:O:-2'), [['wrongWay', '6'], ['ignoredCharge', '8']]);
  assert.deepEqual(m('i:Mg:2'), [['wrongWay', '14'], ['ignoredCharge', '12']]);
  assert.deepEqual(m('m:Cl-35'), [['subtracted', '1'], ['withElectrons', '52']]);
  assert.deepEqual(m('z:Cl-35'), [['added', '53'], ['neutrons', '18']]);
  assert.deepEqual(m('c:Mg:2'), [['wrongSign', '2\u2212']]);
  K.ALL.forEach(x => K.mistakesFor(x).forEach(d => {
    assert.notEqual(K.keyOf(d.answer), K.keyOf(x.a), x.id + ': a mistake is never the right answer');
    assert.ok(d.why.startsWith(x.short + ': ') && d.why.length <= 160);
  }));
});
test('decoys never equal an answer, never repeat, and at most 2 come from one question', () => {
  for(let seed = 1; seed <= 40; seed++){
    const set = K.pickSet(P, { types:K.TYPES, count:30 }, K.makeRng(seed)).list;
    const ds = K.makeDecoys(set, 10, K.makeRng(seed + 100));
    assert.equal(ds.length, 10);
    const answers = new Set(set.map(x => K.keyOf(x.a)));
    ds.forEach(d => assert.ok(!answers.has(K.keyOf(d.answer)) && set.some(x => x.id === d.source)));
    assert.equal(new Set(ds.map(d => K.keyOf(d.answer))).size, 10);
    const per = {}; ds.forEach(d => { per[d.source] = (per[d.source] || 0) + 1; });
    assert.ok(Math.max(...Object.values(per)) <= 2);
    assert.ok(new Set(ds.map(d => d.kind)).size >= 4, 'several kinds of mistake');
    // topping up keeps what is there
    const more = K.makeDecoys(set, 5, K.makeRng(seed), { keep:ds });
    assert.equal(new Set(ds.concat(more).map(d => K.keyOf(d.answer))).size, 10 + more.length);
  }
  assert.deepEqual(plain(K.makeDecoys([], 10, K.makeRng(1))), []);
});

/* ---------- what Bingo receives ---------- */
test('titles', () => {
  assert.equal(K.typesTitle(K.TYPES), 'Subatomic particles');
  assert.equal(K.typesTitle(['ions']), 'Subatomic particles: ions');
  assert.equal(K.typesTitle(['charge', 'atoms', 'ions']), 'Subatomic particles: atoms, ions and charge');
});
test('Bingo reads the game with no errors and no warnings; charges are not mistaken for numbers', () => {
  for(let seed = 1; seed <= 20; seed++){
    const set = K.pickSet(P, { types:K.TYPES, count:40 }, K.makeRng(seed)).list;
    const p = plain(K.payload(set, K.makeDecoys(set, 10, K.makeRng(seed)), 'Subatomic particles'));
    const d = Bingo.readDraft(p);
    assert.ok(d.ok, d.errors.join(' ')); assert.equal(d.items.length, 40); assert.equal(d.decoys.length, 10);
    assert.equal(d.formulas, false);
    const parsed = Bingo.parseItems(d.items.map(Bingo.itemLine).join('\n'));
    assert.deepEqual(plain(parsed.problems), []);
    assert.equal(parsed.answers.length, 40);
    const keys = new Set(parsed.answers.map(a => a.k));
    d.decoys.forEach(x => assert.ok(!keys.has(Bingo.valueInfo(x.a).key), 'decoy ' + x.a + ' is not an answer in Bingo either'));
  }
  assert.equal(Bingo.valueInfo('2+').type, 'text');
  assert.notEqual(Bingo.valueInfo('2+').key, Bingo.valueInfo('2').key);
  assert.notEqual(Bingo.valueInfo('2+').key, Bingo.valueInfo('2\u2212').key);
  // the isotope's hyphen is not drawn as a minus sign, and the ion keeps its superscripts
  assert.equal(Bingo.renderMath('How many neutrons are in an atom of chlorine\u201135?'), 'How many neutrons are in an atom of chlorine\u201135?');
  assert.equal(Bingo.renderMath('How many electrons are in the ion O²⁻?'), 'How many electrons are in the ion O²⁻?');
  assert.equal(Bingo.renderAnswer('2\u2212', 'text'), '2\u2212');
});
