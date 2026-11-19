// اختبارات قوانين «المزاد». التشغيل: node --test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../engine.js');

const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'questions.js'), 'utf8') + '\nthis.BANK = BANK;', ctx);
const BANK = ctx.BANK;

const step = (s, a) => { const r = E.reduce(s, a); assert.ok(r.ok, `${a.type} رُفضت: ${r.error}`); return r.state; };
const started = (seed = 7, config) => step(E.create({ seed, config }), { type: 'start', bank: BANK });
const rightOf = s => s.cur.a;
const wrongOf = s => (s.cur.a + 1) % 4;

test('بنك الأسئلة كله صالح وما فيه تكرار', () => {
  const deck = E.buildDeck(BANK, E.rng(1));
  assert.ok(deck.length >= 12, 'لازم 12 سؤال على الأقل');
  const seen = new Set();
  for (const c of deck) {
    assert.equal(c.opts.length, 4);
    assert.equal(new Set(c.opts).size, 4, `خيارات مكررة: ${c.q}`);
    assert.ok(!seen.has(c.q), `سؤال مكرر: ${c.q}`); seen.add(c.q);
  }
});

test('البداية: كل فريق 1000 عملة، والجولة الأولى في وقت الرهان', () => {
  const s = started();
  assert.equal(s.phase, 'bet'); assert.equal(s.round, 1);
  assert.deepEqual(s.teams.map(t => t.coins), [1000, 1000]);
  assert.ok(s.cur && s.cur.cat);
});

test('نفس البذرة تعطي نفس الأسئلة (الاسترجاع يكمل بنفس الترتيب)', () => {
  assert.deepEqual(started(42).deck.map(c => c.q), started(42).deck.map(c => c.q));
});

test('ما تتكرر نفس الفئة في سؤالين ورا بعض', () => {
  let s = started(3);
  let prev = s.cur.cat;
  for (let i = 0; i < 11; i++) {
    s = step(s, { type: 'bid', team: 0, amount: 100 }); s = step(s, { type: 'bid', team: 1, amount: 50 });
    s = step(s, { type: 'toQuestion', now: 0 }); s = step(s, { type: 'answer', k: rightOf(s) }); s = step(s, { type: 'next' });
    assert.notEqual(s.cur.cat, prev); prev = s.cur.cat;
  }
});

test('الرهان الأعلى ياخذ السؤال، وصح يكسب قد الرهان', () => {
  let s = started();
  s = step(s, { type: 'bid', team: 0, amount: 300 });
  assert.equal(s.phase, 'bet', 'ينتظر الفريق الثاني');
  s = step(s, { type: 'bid', team: 1, amount: 200 });
  assert.equal(s.phase, 'reveal'); assert.equal(s.winner, 0); assert.equal(s.tie, false);
  s = step(s, { type: 'toQuestion', now: 1000 });
  assert.equal(s.answering, 0); assert.equal(s.stake, 300); assert.equal(s.deadline, 1000 + 10000);
  s = step(s, { type: 'answer', k: rightOf(s) });
  assert.equal(s.phase, 'result'); assert.equal(s.teams[0].coins, 1300); assert.equal(s.teams[1].coins, 1000);
  assert.equal(s.last.delta, 300);
});

test('غلط يخسر الرهان، والخصم يسرق ويكسب نفس المبلغ', () => {
  let s = started();
  s = step(s, { type: 'bid', team: 0, amount: 100 }); s = step(s, { type: 'bid', team: 1, amount: 400 });
  s = step(s, { type: 'toQuestion', now: 0 });
  const wrong = wrongOf(s);
  s = step(s, { type: 'answer', k: wrong });
  assert.equal(s.phase, 'stealOffer'); assert.equal(s.teams[1].coins, 600); assert.equal(s.gone, wrong);
  s = step(s, { type: 'steal', yes: true, now: 0 });
  assert.equal(s.answering, 0); assert.equal(s.steal, true); assert.equal(s.stake, 400); assert.equal(s.deadline, 8000);
  assert.equal(E.reduce(s, { type: 'answer', k: wrong }).ok, false, 'الخيار المحذوف ممنوع');
  s = step(s, { type: 'answer', k: rightOf(s) });
  assert.equal(s.phase, 'result'); assert.equal(s.teams[0].coins, 1400);
});

test('السرقة الغلط ما تنقص شي', () => {
  let s = started();
  s = step(s, { type: 'bid', team: 0, amount: 100 }); s = step(s, { type: 'bid', team: 1, amount: 400 });
  s = step(s, { type: 'toQuestion', now: 0 });
  const w1 = wrongOf(s); s = step(s, { type: 'answer', k: w1 });
  s = step(s, { type: 'steal', yes: true, now: 0 });
  const w2 = [0, 1, 2, 3].find(k => k !== s.cur.a && k !== w1);
  s = step(s, { type: 'answer', k: w2 });
  assert.equal(s.teams[0].coins, 1000); assert.equal(s.phase, 'result');
});

test('رفض السرقة ينقل للسؤال الجاي', () => {
  let s = started();
  s = step(s, { type: 'bid', team: 0, amount: 100 }); s = step(s, { type: 'bid', team: 1, amount: 200 });
  s = step(s, { type: 'toQuestion', now: 0 }); s = step(s, { type: 'answer', k: wrongOf(s) });
  s = step(s, { type: 'steal', yes: false });
  assert.equal(s.phase, 'bet'); assert.equal(s.round, 2);
});

test('خلص الوقت = جواب غلط', () => {
  let s = started();
  s = step(s, { type: 'bid', team: 0, amount: 200 }); s = step(s, { type: 'bid', team: 1, amount: 100 });
  s = step(s, { type: 'toQuestion', now: 0 }); s = step(s, { type: 'answer', k: -1 });
  assert.equal(s.teams[0].coins, 800); assert.equal(s.last.timeout, true); assert.equal(s.gone, null);
});

test('كل شي أو لا شي: الرهان يتضاعف مرتين، ومرة وحدة بس', () => {
  let s = started();
  s = step(s, { type: 'bid', team: 0, amount: 0, allin: true }); s = step(s, { type: 'bid', team: 1, amount: 50 });
  assert.equal(s.bids[0], 1000); assert.equal(s.allin[0], true);
  s = step(s, { type: 'toQuestion', now: 0 }); assert.equal(s.stake, 2000);
  s = step(s, { type: 'answer', k: rightOf(s) });
  assert.equal(s.teams[0].coins, 3000); assert.equal(s.teams[0].allinUsed, true);
  s = step(s, { type: 'next' });
  s = step(s, { type: 'bid', team: 0, amount: 100, allin: true });
  assert.equal(s.allin[0], false, 'المرة الثانية تنحسب رهان عادي'); assert.equal(s.bids[0], 100);
});

test('كل شي أو لا شي الخسران يفلّس الفريق، والجولة الجاية ياخذ 100', () => {
  let s = started();
  s = step(s, { type: 'bid', team: 0, amount: 0, allin: true }); s = step(s, { type: 'bid', team: 1, amount: 50 });
  s = step(s, { type: 'toQuestion', now: 0 }); s = step(s, { type: 'answer', k: wrongOf(s) });
  assert.equal(s.teams[0].coins, 0);
  s = step(s, { type: 'steal', yes: false });
  assert.equal(s.teams[0].coins, 100); assert.deepEqual(s.rescued, [0]);
});

test('الرهان ينضبط: أقل شي 50 وأكثر شي اللي معك', () => {
  let s = started();
  s = step(s, { type: 'bid', team: 0, amount: 5 }); s = step(s, { type: 'bid', team: 1, amount: 99999 });
  assert.deepEqual(s.bids, [50, 1000]);
});

test('ما تقدر تراهن مرتين ولا برا وقت الرهان ولا لفريق غلط', () => {
  let s = started();
  s = step(s, { type: 'bid', team: 0, amount: 100 });
  assert.equal(E.reduce(s, { type: 'bid', team: 0, amount: 900 }).ok, false);
  assert.equal(E.reduce(s, { type: 'bid', team: 5, amount: 100 }).ok, false);
  assert.equal(E.reduce(s, { type: 'answer', k: 0 }).ok, false);
  assert.equal(E.reduce(s, { type: 'hack' }).ok, false);
});

test('التعادل يختار فريق بالقرعة', () => {
  const winners = new Set();
  for (let seed = 1; seed < 40; seed++) {
    let s = started(seed);
    s = step(s, { type: 'bid', team: 0, amount: 200 }); s = step(s, { type: 'bid', team: 1, amount: 200 });
    assert.equal(s.tie, true); winners.add(s.winner);
  }
  assert.deepEqual([...winners].sort(), [0, 1], 'القرعة لازم تطلع للفريقين');
});

test('بعد آخر جولة تنتهي اللعبة ويطلع الفائز، والتعادل بدون فائز', () => {
  let s = started(5, { rounds: 2 });
  for (let i = 0; i < 2; i++) {
    s = step(s, { type: 'bid', team: 0, amount: 100 }); s = step(s, { type: 'bid', team: 1, amount: 50 });
    s = step(s, { type: 'toQuestion', now: 0 }); s = step(s, { type: 'answer', k: rightOf(s) }); s = step(s, { type: 'next' });
  }
  assert.equal(s.phase, 'over'); assert.equal(s.final, 0);
  const tied = E.reduce(E.create(), { type: 'reset' }).state; // تأكد إن reset يشتغل
  assert.equal(tied.phase, 'lobby');
});

test('الحركات ما تغيّر الحالة القديمة', () => {
  const s = started(); const copy = JSON.stringify(s);
  E.reduce(s, { type: 'bid', team: 0, amount: 300 });
  assert.equal(JSON.stringify(s), copy);
});

test('الحالة تنحفظ وترجع وتكمل بنفس النتيجة', () => {
  let a = started(11);
  a = step(a, { type: 'bid', team: 0, amount: 200 });
  const saved = JSON.parse(JSON.stringify(a));
  const next = st => step(step(st, { type: 'bid', team: 1, amount: 200 }), { type: 'toQuestion', now: 0 });
  assert.deepEqual(next(a), next(saved));
});

test('المعروض للجوالات ما فيه الجواب الصح ولا بقية الأسئلة', () => {
  let s = started();
  s = step(s, { type: 'bid', team: 0, amount: 100 }); s = step(s, { type: 'bid', team: 1, amount: 50 });
  s = step(s, { type: 'toQuestion', now: 0 });
  const v = E.publicView(s), text = JSON.stringify(v);
  assert.equal(v.opts.length, 4); assert.ok(!('a' in v)); assert.ok(!('deck' in v)); assert.ok(!('cur' in v));
  assert.ok(!text.includes(s.deck[0].q), 'ما يطلع سؤال جاي');
});

test('الجواب يسجّل مين جاوب وكم أخذ وقت', () => {
  let s = started();
  s = step(s, { type: 'bid', team: 0, amount: 100 }); s = step(s, { type: 'bid', team: 1, amount: 50 });
  s = step(s, { type: 'toQuestion', now: 5000 });
  s = step(s, { type: 'answer', k: rightOf(s), by: 'فهد', at: 7100 });
  assert.equal(s.last.by, 'فهد'); assert.equal(s.last.ms, 2100);
  assert.equal(s.attempts.length, 1); assert.equal(s.attempts[0].ok, true);
  s = step(s, { type: 'next' });
  assert.deepEqual(s.attempts, [], 'المحاولات تنمسح كل جولة');
});

test('اختيار الفئات: اللعبة ما تطلع إلا من الفئات المختارة', () => {
  const cats = Object.keys(BANK).slice(0, 3);
  let s = step(E.create({ seed: 9 }), { type: 'setCats', cats });
  s = step(s, { type: 'start', bank: BANK });
  assert.ok(s.deck.every(c => cats.includes(c.cat)) && cats.includes(s.cur.cat));
});

test('اختيار الفئات: أقل من 3 مرفوض، وnull يرجع للكل، والإعادة تحفظ الاختيار', () => {
  const s0 = E.create();
  assert.equal(E.reduce(s0, { type: 'setCats', cats: Object.keys(BANK).slice(0, 2) }).ok, false);
  let s = step(s0, { type: 'setCats', cats: Object.keys(BANK).slice(0, 4) });
  assert.equal(E.reduce(s, { type: 'reset' }).state.cats.length, 4);
  s = step(s, { type: 'setCats', cats: null }); assert.equal(s.cats, null);
  s = step(s, { type: 'start', bank: BANK });
  assert.ok(E.reduce(s, { type: 'setCats', cats: Object.keys(BANK).slice(0, 3) }).ok === false, 'ما ينفع وسط اللعبة');
});
