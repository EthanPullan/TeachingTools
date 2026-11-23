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
test('elements match the Periodic Table tool (symbol, name, atomic mass): all of 1 to 36, then the heavier ones', () => {
  const html = fs.readFileSync(path.join(__dirname, '../periodic-table/index.html'), 'utf8');
  const raw = new Map(/const RAW = `([\s\S]*?)`/.exec(html)[1].trim().split('\n').map(l => l.trim().split(' ')).map(r => [+r[0], r]));
  K.ELEMENTS.slice(0, 36).forEach((e, i) => assert.equal(e.z, i + 1));
  assert.equal(K.LIGHT_MAX, 36);
  assert.equal(new Set(K.ELEMENTS.map(e => e.z)).size, K.ELEMENTS.length);
  K.ELEMENTS.forEach(e => {
    const [z, sym, name, mass] = raw.get(e.z);
    assert.deepEqual([e.z, e.sym, e.name, e.mass], [+z, sym, name.toLowerCase(), +mass]);
  });
  assert.deepEqual(plain(K.ELEMENTS.filter(e => e.z > 36).map(e => e.sym)), ['Rb', 'Sr', 'Ag', 'Sn', 'I', 'Xe', 'Cs', 'Ba', 'Au', 'Pb', 'U']);
});
test('the heavier ions are the ones on the Compound Naming chart', () => {
  const html = fs.readFileSync(path.join(__dirname, '../compound-naming/index.html'), 'utf8');
  K.IONS.filter(([sym]) => bySym.get(sym).z > 36).forEach(([sym, q]) => {
    if(q > 0) assert.match(html, new RegExp("\\['" + sym + "', \\[[^\\]]*\\b" + q + "\\b"), sym + q);
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
/* Bohr–Rutherford arrangements for 1 to 20, written out by hand (not worked out by the code under test). */
const BOHR = ['1', '2', '2,1', '2,2', '2,3', '2,4', '2,5', '2,6', '2,7', '2,8', '2,8,1', '2,8,2', '2,8,3', '2,8,4', '2,8,5', '2,8,6', '2,8,7', '2,8,8',
  '2,8,8,1', '2,8,8,2'].map(s => s.split(',').map(Number));
const bohr = n => BOHR[n - 1];
const SUPS = '⁰¹²³⁴⁵⁶⁷⁸⁹', SUBS = '₀₁₂₃₄₅₆₇₈₉';
const fromSup = s => +[...s].map(c => SUPS.indexOf(c)).join(''), fromSub = s => +[...s].map(c => SUBS.indexOf(c)).join('');
const toSup = n => [...String(n)].map(d => SUPS[d]).join('');
const ionOf = s => { const m = /^([⁰¹²³⁴-⁹]*)([A-Z][a-z]?)([²³⁴]?)([⁺⁻])$/.exec(s); assert.ok(m, 'ion ' + s);
  return { pre:m[1] ? fromSup(m[1]) : null, e:bySym.get(m[2]), q:({ '':1, '²':2, '³':3, '⁴':4 })[m[3]] * (m[4] === '⁻' ? -1 : 1) }; };
const chg = q => Math.abs(q) + (q < 0 ? '−' : '+');
const chgOf = s => { const m = /^(\d+)([+−])$/.exec(s); return +m[1] * (m[2] === '+' ? 1 : -1); };
const isoOf = s => { const m = /^(\w+)‑(\d+)$/.exec(s); const e = byName.get(m[1]); assert.ok(e, s); return { e, A:+m[2] }; };
const atomOf = (art, name) => { const e = byName.get(name); assert.ok(e, name); assert.equal(art, /^[aeio]/.test(name) ? 'an' : 'a', 'article for ' + name); return e; };
const zSym = n => { const e = K.ELEMENTS.find(x => x.z === n); assert.ok(e, 'element ' + n); return e.sym; };
const ionText = (sym, q) => sym + ({ 1:'', 2:'²', 3:'³', 4:'⁴' })[Math.abs(q)] + (q < 0 ? '⁻' : '⁺');
// [pattern, (match) => the right answer]. Each wording must match exactly one pattern.
const W = [
  [/^How many protons are in an atom of (\w+)\?$/, m => byName.get(m[1]).z],
  [/^How many electrons are in a neutral atom of (\w+)\?$/, m => byName.get(m[1]).z],
  [/^How many neutrons are in an atom of (\S+)\?$/, m => { const i = isoOf(m[1]); return i.A - i.e.z; }],
  [/^How many electrons are in the ion (\S+)\?$/, m => { const i = ionOf(m[1]); return i.e.z - i.q; }],
  [/^An atom has (\d+) protons? and (\d+) neutrons?\. What is its mass number\?$/, m => +m[1] + +m[2]],
  [/^An atom with mass number (\d+) has (\d+) neutrons?\. What is its atomic number\?$/, m => +m[1] - +m[2]],
  [/^An atom has (\d+) protons? and a mass number of (\d+)\. How many neutrons does it have\?$/, m => +m[2] - +m[1]],
  [/^An ion has (\d+) protons? and (\d+) electrons?\. What is its charge\?$/, m => chg(+m[1] - +m[2])],
  // extra information
  [/^(\w+)’s atomic mass is ([\d.]+)\. How many (protons|electrons) does (an?)( neutral)? (\w+) atom have\?$/, m => {
    const e = m[5] ? byName.get(m[6]) : atomOf(m[4], m[6]); if(m[5]) assert.equal(m[4], 'a'); assert.equal(m[1].toLowerCase(), m[6]); assert.equal(+m[2], e.mass);
    assert.equal(!!m[5], m[3] === 'electrons'); return e.z; }],
  [/^How many protons are in an atom of (\w+\u2011\d+)\?$/, m => isoOf(m[1]).e.z],
  [/^A neutral atom has (\d+) protons? and (\d+) neutrons?\. How many electrons does it have\?$/, m => +m[1]],
  [/^A neutral atom has a mass number of (\d+) and (\d+) neutrons?\. How many electrons does it have\?$/, m => +m[1] - +m[2]],
  [/^How many protons are in the ion (\S+)\?$/, m => ionOf(m[1]).e.z],
  [/^How many (neutrons|electrons) are in (an?) (\w+\u2011\d+) ion, (\S+)\?$/, m => { const i = isoOf(m[3]), j = ionOf(m[4]);
    assert.equal(j.e, i.e); atomOf(m[2], i.e.name); return m[1] === 'neutrons' ? i.A - i.e.z : i.e.z - j.q; }],
  [/^An ion has (\d+) protons?, (\d+) neutrons? and (\d+) electrons?\. What is its mass number\?$/, m => +m[1] + +m[2]],
  [/^A particle has (\d+) protons?, (\d+) neutrons? and (\d+) electrons?\. What is its charge\?$/, m => chg(+m[1] - +m[3])],
  // nucleus and totals
  [/^How many particles are in the nucleus of an atom of (\S+)\?$/, m => isoOf(m[1]).A],
  [/^How many protons, neutrons and electrons does an atom of (\S+) have altogether\?$/, m => { const i = isoOf(m[1]); return i.A + i.e.z; }],
  [/^How many more neutrons than protons are in an atom of (\S+)\?$/, m => { const i = isoOf(m[1]); return i.A - 2 * i.e.z; }],
  [/^How many more neutrons does (\S+) have than (\S+)\?$/, m => { const a = isoOf(m[1]), b = isoOf(m[2]); assert.equal(a.e, b.e); return a.A - b.A; }],
  [/^What is the charge of the nucleus of (an?) (\w+) atom\?$/, m => chg(atomOf(m[1], m[2]).z)],
  // symbols
  [/^An atom has (\d+) protons?\. What is its element symbol\?$/, m => zSym(+m[1])],
  [/^An atom has a mass number of (\d+) and (\d+) neutrons?\. What is its element symbol\?$/, m => zSym(+m[1] - +m[2])],
  [/^A particle has (\d+) protons? and (\d+) electrons?\. What is its symbol, with the charge\?$/, m => ionText(zSym(+m[1]), +m[1] - +m[2])],
  [/^An ion with a (\S+) charge has (\d+) electrons?\. What is its symbol, with the charge\?$/, m => { const q = chgOf(m[1]); return ionText(zSym(+m[2] + q), q); }],
  [/^Which neutral atom has the same number of electrons as (\S+)\? Give its symbol\.$/, m => { const i = ionOf(m[1]); return zSym(i.e.z - i.q); }],
  // backwards
  [/^An ion with a (\S+) charge has (\d+) electrons?\. How many protons does it have\?$/, m => +m[2] + chgOf(m[1])],
  [/^An ion with a (\S+) charge has (\d+) protons?\. How many electrons does it have\?$/, m => +m[2] - chgOf(m[1])],
  [/^How many electrons does (an?) (\w+) atom (lose|gain) to become (\S+)\?$/, m => { const e = atomOf(m[1], m[2]), i = ionOf(m[4]);
    assert.equal(i.e, e); assert.equal(m[3], i.q > 0 ? 'lose' : 'gain'); return Math.abs(i.q); }],
  [/^An ion with a (\S+) charge has (\d+) electrons? and (\d+) neutrons?\. What is its mass number\?$/, m => +m[2] + chgOf(m[1]) + +m[3]],
  // Bohr–Rutherford
  [/^How many valence electrons does (an?) (\w+) atom have\?$/, m => bohr(atomOf(m[1], m[2]).z).slice(-1)[0]],
  [/^How many shells hold electrons in (an?) (\w+) atom\?$/, m => bohr(atomOf(m[1], m[2]).z).length],
  [/^How many electrons are in the (second|third|fourth) shell of (an?) (\w+) atom\?$/, m => {
    const v = bohr(atomOf(m[2], m[3]).z)[['first', 'second', 'third', 'fourth'].indexOf(m[1])]; assert.ok(v > 0); return v; }],
  [/^What is the electron arrangement of (an?) (\w+) atom\? Give the electrons in each shell, from the inside out\.$/, m => bohr(atomOf(m[1], m[2]).z).join(', ')],
  [/^What is the electron arrangement of the ion (\S+)\? Give the electrons in each shell, from the inside out\.$/, m => { const i = ionOf(m[1]); return bohr(i.e.z - i.q).join(', '); }],
  [/^How many electrons are in the outer shell of the ion (\S+)\?$/, m => { const i = ionOf(m[1]); return bohr(i.e.z - i.q).slice(-1)[0]; }]
];
test('every question has the right answer for what it asks', () => {
  K.ALL.forEach(x => {
    const hits = W.map(([re, f]) => [re.exec(x.q), f]).filter(h => h[0]);
    if(!hits.length) assert.fail('unknown wording: ' + x.q);
    assert.equal(hits.length, 1, 'more than one pattern fits: ' + x.q);
    assert.equal(x.a, String(hits[0][1](hits[0][0])), x.q);
  });
  assert.equal(new Set(K.ALL.map(x => x.id)).size, K.ALL.length, 'ids are unique');
  assert.equal(new Set(K.ALL.map(x => x.q)).size, K.ALL.length, 'no question is worded twice');
  K.ALL.forEach(x => assert.ok(x.a.length <= 24, 'fits a bingo square: ' + x.a));
});
test('the simple category: protons and electrons in atoms, neutrons and protons in isotopes', () => {
  assert.deepEqual(plain([...new Set(P.atoms.map(x => x.kind))].sort()), ['e', 'n', 'p', 'xIsoP']);
  assert.equal(K.TYPE_SHORT.atoms, 'Simple');
  assert.ok(!P.extra.some(x => x.kind === 'xIsoP'));
});
test('every type has questions, and Bohr–Rutherford stays within 1 to 20', () => {
  K.TYPES.forEach(t => assert.ok(P[t].length >= 30, t));
  assert.deepEqual(plain(K.GROUPS.map(g => g.name)), ['Numbers', 'Symbols']);
  assert.deepEqual(plain(K.GROUPS.flatMap(g => g.types)), plain(K.TYPES));
  // the Symbols group is the one whose answers are symbols
  K.ALL.forEach(x => assert.equal(K.GROUPS[1].types.includes(x.type), /^[A-Z]/.test(x.a), x.id + ' → ' + x.a));
  // no isotope notation (a mass number written as a superscript) anywhere
  K.ALL.forEach(x => { assert.doesNotMatch(x.q, /[⁰¹⁵⁶⁷⁸⁹]|[¹²³⁴]+[A-Z]|[₀-₉]/, x.q); assert.doesNotMatch(x.a, /^[⁰¹²³⁴-⁹]/, x.a); });
  K.ALL.forEach(x => K.mistakesFor(x).forEach(d => assert.doesNotMatch(d.answer, /^[⁰¹²³⁴-⁹]/, d.answer)));
  K.ALL.filter(x => x.type === 'bohr').forEach(x => assert.ok(x.z <= 20, x.id));
  const H = K.pools({ heavy:true });
  K.TYPES.forEach(t => {
    assert.ok(P[t].every(x => x.z <= 36), t + ': no heavier elements unless asked');
    assert.ok(H[t].length >= P[t].length);
    if(t !== 'bohr') assert.ok(H[t].some(x => x.z > 36), t + ': heavier elements when asked');
  });
  assert.equal(new Set(P.bohr.filter(x => x.kind === 'rArr').map(x => x.a)).size, 20, 'every element 1 to 20 has its own arrangement');
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
    const r = K.pickSet(P, { types:K.DEFAULT_TYPES, count:30 }, K.makeRng(seed));
    assert.equal(r.list.length, 30); assert.equal(r.short, 0);
    assert.equal(new Set(r.list.map(x => K.keyOf(x.a))).size, 30, 'answers differ (seed ' + seed + ')');
    const n = t => r.list.filter(x => x.type === t).length;
    assert.deepEqual(plain(K.DEFAULT_TYPES.map(n)).sort(), [7, 7, 8, 8]);
    const all = K.pickSet(P, { types:K.TYPES, count:30 }, K.makeRng(seed)).list;
    assert.equal(all.length, 30); assert.equal(new Set(all.map(x => K.keyOf(x.a))).size, 30);
    const per = K.TYPES.map(t => all.filter(x => x.type === t).length);
    assert.ok(Math.max(...per) - Math.min(...per) <= 1, 'spread evenly: ' + per);
    // the simple questions are spread across their kinds: protons, electrons, neutrons, protons in an isotope
    assert.ok(new Set(r.list.filter(x => x.type === 'atoms').map(x => x.kind)).size >= 3);
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
  assert.deepEqual(m('np:Cl-35'), [['massNumber', '35'], ['protons', '17'], ['added', '52']]);
  assert.equal(K.ALL.find(x => x.id === 'np:Cl-35').q, 'An atom has 17 protons and a mass number of 35. How many neutrons does it have?');
  assert.equal(K.ALL.find(x => x.id === 'np:H-1').q, 'An atom has 1 proton and a mass number of 1. How many neutrons does it have?');
  assert.deepEqual(plain([...new Set(P.mass.map(x => x.kind))].sort()), ['atomic', 'mass', 'neutronsPA']);
  assert.deepEqual(m('c:Mg:2'), [['wrongSign', '2\u2212']]);
  // the newer kinds
  assert.deepEqual(m('xp:Na:1'), [['electrons', '10'], ['chargeOnP', '12']]);
  assert.deepEqual(m('xpn:Cr-52'), [['neutrons', '28'], ['pPlusN', '52']]);
  assert.deepEqual(m('xan:Cr-52'), [['neutrons', '28'], ['massNumber', '52'], ['added', '80']]);
  assert.deepEqual(m('xmp:Cl'), [['roundedMass', '35'], ['massMinusZ', '18']]);
  assert.deepEqual(m('xn:Cl-37:-1'), [['chargeOnN', '21'], ['protons', '17'], ['electrons', '18']]);
  assert.deepEqual(m('uc:O'), [['neutral', '0'], ['wrongSign', '8\u2212']]);
  assert.deepEqual(m('si:Ca:2'), [['wrongSign', 'Ca²⁻'], ['fromElectrons', 'Ar']]);
  assert.deepEqual(m('se:Al:3'), [['wrongWay', 'N³⁺'], ['fromElectrons', 'Ne']]);
  assert.deepEqual(m('ss:Mg:2'), [['parent', 'Mg'], ['wrongWay', 'Si']]);
  assert.deepEqual(m('bp:S:-2'), [['electrons', '18'], ['wrongWay', '20']]);
  assert.deepEqual(m('rv:P'), [['group', '15'], ['shells', '3'], ['all', '15']]);
  assert.deepEqual(m('ra:K'), [['firstShell8', '8, 8, 3'], ['bigThird', '2, 8, 9'], ['reversed', '1, 8, 8, 2']]);
  assert.deepEqual(m('ri:Mg:2'), [['atom', '2, 8, 2'], ['wrongWay', '2, 8, 4']]);
  // a wrong-answer element past krypton only for a question that is itself past krypton
  K.ALL.filter(x => x.z <= 36).forEach(x => K.mistakesFor(x).forEach(d => {
    const sym = /^[⁰¹²³⁴-⁹]*([A-Z][a-z]?)[²³⁴]?[⁺⁻]?$/.exec(d.answer);
    if(sym && bySym.has(sym[1])) assert.ok(bySym.get(sym[1]).z <= 36, x.id + ' → ' + d.answer);
  }));
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
  assert.equal(K.typesTitle(['charge', 'atoms', 'ions']), 'Subatomic particles: simple, ions and charge');
  assert.equal(K.typesTitle(K.DEFAULT_TYPES), 'Subatomic particles');
  assert.equal(K.typesTitle(['ionsym', 'bohr']), 'Subatomic particles: Bohr and ion symbol');
});
test('Bingo reads the game with no errors and no warnings; charges are not mistaken for numbers', () => {
  for(let seed = 1; seed <= 20; seed++){
    const set = K.pickSet(P, { types:K.TYPES, count:40 }, K.makeRng(seed)).list;
    const p = plain(K.payload(set, K.makeDecoys(set, 10, K.makeRng(seed)), 'Subatomic particles'));
    const d = Bingo.readDraft(p);
    assert.ok(d.ok, d.errors.join(' ')); assert.equal(d.items.length, 40); assert.equal(d.decoys.length, 10);
    // each question's type goes to Bingo as its category, and survives the trip into Bingo's text box
    d.items.forEach((it, i) => assert.equal(it.cat, K.TYPE_SHORT[set[i].type]));
    const back = Bingo.parseItems(d.items.map(Bingo.itemLine).join('\n')).items;
    assert.deepEqual(plain(back.map(it => [it.q, it.a, it.cat])), plain(set.map(x => [x.q, x.a, K.TYPE_SHORT[x.type]])));
    assert.deepEqual(plain(Bingo.categoriesOf(back).map(c => c.name)).sort(), plain([...new Set(set.map(x => K.TYPE_SHORT[x.type]))]).sort());
    assert.equal(d.formulas, false);
    const parsed = Bingo.parseItems(d.items.map(Bingo.itemLine).join('\n'));
    assert.deepEqual(plain(parsed.problems), []);
    assert.equal(parsed.answers.length, 40);
    const keys = new Set(parsed.answers.map(a => a.k));
    d.decoys.forEach(x => assert.ok(!keys.has(Bingo.valueInfo(x.a).key), 'decoy ' + x.a + ' is not an answer in Bingo either'));
  }
  // every type, heavier elements too: symbols, ions and shell arrangements are text answers Bingo keeps apart
  const H = K.pools({ heavy:true });
  for(let seed = 1; seed <= 20; seed++){
    const set = K.pickSet(H, { types:K.TYPES, count:50 }, K.makeRng(seed)).list;
    assert.equal(set.length, 50);
    const p = plain(K.payload(set, K.makeDecoys(set, 15, K.makeRng(seed)), 'Subatomic particles'));
    const d = Bingo.readDraft(p);
    assert.ok(d.ok, d.errors.join(' '));
    const parsed = Bingo.parseItems(d.items.map(Bingo.itemLine).join('\n'));
    assert.deepEqual(plain(parsed.problems), []);
    assert.equal(parsed.answers.length, 50);
    const keys = new Set(parsed.answers.map(a => a.k));
    d.decoys.forEach(x => assert.ok(!keys.has(Bingo.valueInfo(x.a).key), 'decoy ' + x.a));
  }
  assert.notEqual(Bingo.valueInfo('2, 8').key, Bingo.valueInfo('2, 8, 8').key);
  assert.equal(Bingo.valueInfo('2, 8, 6').type, 'text');
  assert.equal(Bingo.valueInfo('2+').type, 'text');
  assert.notEqual(Bingo.valueInfo('2+').key, Bingo.valueInfo('2').key);
  assert.notEqual(Bingo.valueInfo('2+').key, Bingo.valueInfo('2\u2212').key);
  // the isotope's hyphen is not drawn as a minus sign, and the ion keeps its superscripts
  assert.equal(Bingo.renderMath('How many neutrons are in an atom of chlorine\u201135?'), 'How many neutrons are in an atom of chlorine\u201135?');
  assert.equal(Bingo.renderMath('How many electrons are in the ion O²⁻?'), 'How many electrons are in the ion O²⁻?');
  assert.equal(Bingo.renderAnswer('2\u2212', 'text'), '2\u2212');
});
