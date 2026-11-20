// اختبارات قوانين نسخة التجربة. التشغيل: npm test
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const T = require('../trial-engine.js');

const ctx = {}; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'questions.js'), 'utf8') + '\nthis.BANK = BANK;', ctx);
const BANK = ctx.BANK;
const CATS = T.playableCats(BANK).slice(0, 5);

const step = (s, a) => { const r = T.reduce(s, a); assert.ok(r.ok, `${a.type} رُفضت: ${r.error}`); return r.state; };
const begin = (mode = 'open', seed = 3) => {
  let s = T.create({ seed });
  s = step(s, { type: 'configure', devices: 3, bidMode: mode });
  return step(s, { type: 'start', bank: BANK, cats: CATS, seed });
};
// يختار بطاقة ويوصل لمرحلة السؤال بمزايدة معيّنة للفريق صاحب الدور
function toQuestion(s, lvl, amount, now = 0) {
  s = step(s, { type: 'pick', team: s.turn, col: s.board.findIndex(c => !c.cards[lvl - 1].used), lvl, now });
  if (s.bidMode === 'open') {
    s = step(s, { type: 'raise', team: s.turn, inc: amount, now });
    s = step(s, { type: 'pass', team: 1 - s.turn, now });
  } else {
    s = step(s, { type: 'secret', team: s.turn, amount, now });
    s = step(s, { type: 'secret', team: 1 - s.turn, amount: T.DEFAULTS.min[lvl - 1], now });
    s = step(s, { type: 'toQuestion', now });
  }
  return s;
}

test('البنك فيه 5 فئات على الأقل تنفع للوحة', () => {
  assert.ok(CATS.length === 5, 'لازم 5 فئات فيها سهل ووسط وصعب');
});

test('الصيغتين القديمة والجديدة تنقرى', () => {
  const old = T.normalize(['سؤال؟', ['أ', 'ب', 'ج', 'د'], 2], 'x', 0, 3);
  assert.equal(old.a, 'ج'); assert.equal(old.lvl, 1);
  const neu = T.normalize({ q: 'سؤال؟', a: 'جواب قصير', opts: ['أ', 'ب', 'ج', 'د'], ai: 1, lvl: 3 }, 'x', 0, 3);
  assert.equal(neu.a, 'جواب قصير'); assert.equal(neu.lvl, 3);
  assert.equal(T.normalize({ q: 'ناقص', opts: ['أ'], ai: 0 }, 'x', 0, 1), null);
});

test('البداية: 5000 لكل فريق، ولوحة 5 × 3، ولازم 5 فئات بالضبط', () => {
  const s = begin();
  assert.deepEqual(s.teams.map(t => t.coins), [5000, 5000]);
  assert.equal(s.board.length, 5); assert.ok(s.board.every(c => c.cards.length === 3 && c.cards.every((k, i) => k.lvl === i + 1)));
  assert.equal(s.phase, 'board');
  const r = T.reduce(T.create(), { type: 'start', bank: BANK, cats: CATS.slice(0, 4) });
  assert.equal(r.ok, false);
});

test('بس الفريق صاحب الدور يختار، والبطاقة ما تنختار مرتين', () => {
  let s = begin();
  assert.equal(T.reduce(s, { type: 'pick', team: 1 - s.turn, col: 0, lvl: 1 }).ok, false);
  s = step(s, { type: 'pick', team: s.turn, col: 0, lvl: 1 });
  assert.equal(s.phase, 'bid'); assert.equal(s.cur.lvl, 1);
});

test('المزايدة العلنية: أقل شي حسب الصعوبة، وكل زيادة لازم أعلى، وترجّع العداد', () => {
  let s = begin('open');
  s = step(s, { type: 'pick', team: s.turn, col: 0, lvl: 2, now: 0 });
  const a = s.turn, b = 1 - a;
  s = step(s, { type: 'raise', team: a, inc: 100, now: 1000 });
  assert.equal(s.top.amount, 400, 'أول مزايدة ما تنزل عن 400 في الوسط');
  assert.equal(s.deadline, 1000 + 5000);
  assert.equal(T.reduce(s, { type: 'raise', team: a, inc: 100 }).ok, false, 'المتصدر ما يزايد على نفسه');
  s = step(s, { type: 'raise', team: b, inc: 200, now: 2000 });
  assert.deepEqual(s.top, { team: b, amount: 600 });
  assert.equal(T.reduce(s, { type: 'sold', now: 3000 }).ok, false, 'العداد ما خلص');
  s = step(s, { type: 'sold', now: 7000 });
  assert.equal(s.phase, 'question'); assert.equal(s.answering, b); assert.equal(s.stake, 600);
  assert.equal(s.deadline, 7000 + 25000, 'وقت الوسط 25 ثانية');
});

test('المزايدة العلنية: لو ما أحد زايد، صاحب الدور ياخذها بأقل مبلغ', () => {
  let s = begin('open');
  s = step(s, { type: 'pick', team: s.turn, col: 0, lvl: 3, now: 0 });
  s = step(s, { type: 'sold', now: 11000 });
  assert.equal(s.answering, s.turn); assert.equal(s.stake, 600);
});

test('المزايدة السرية: الأعلى ياخذ، والأقل من الحد مرفوض', () => {
  let s = begin('secret');
  s = step(s, { type: 'pick', team: s.turn, col: 0, lvl: 1 });
  assert.equal(T.reduce(s, { type: 'secret', team: 0, amount: 100 }).ok, false);
  s = step(s, { type: 'secret', team: 0, amount: 300 });
  assert.equal(s.phase, 'bid');
  s = step(s, { type: 'secret', team: 1, amount: 700 });
  assert.equal(s.phase, 'reveal'); assert.deepEqual(s.top, { team: 1, amount: 700 });
  s = step(s, { type: 'toQuestion', now: 0 });
  assert.equal(s.deadline, 20000, 'وقت السهل 20 ثانية');
});

test('صح = ضعف الرهان، والدور ينتقل للفريق الثاني', () => {
  let s = begin();
  const turn = s.turn;
  s = toQuestion(s, 1, 500);
  const t = s.answering;
  assert.equal(T.reduce(s, { type: 'judge', right: true }).ok, false, 'لازم يكشف الجواب أول');
  s = step(s, { type: 'reveal' }); s = step(s, { type: 'judge', right: true });
  assert.equal(s.teams[t].coins, 6000); assert.equal(s.phase, 'result');
  s = step(s, { type: 'next' });
  assert.equal(s.phase, 'board'); assert.equal(s.turn, 1 - turn); assert.equal(s.asked, 1);
});

test('غلط = يخسر الرهان، والخصم يسرق: صح ياخذ نفس المبلغ', () => {
  let s = begin();
  s = toQuestion(s, 2, 600, 0);
  const t = s.answering, o = 1 - t;
  s = step(s, { type: 'reveal' }); s = step(s, { type: 'judge', right: false });
  assert.equal(s.teams[t].coins, 4400); assert.equal(s.phase, 'stealOffer');
  s = step(s, { type: 'steal', team: o, yes: true, now: 1000 });
  assert.equal(s.answering, o); assert.equal(s.stealing, true); assert.equal(s.deadline, 11000);
  assert.equal(s.teams[o].steals, 2);
  assert.equal(T.reduce(s, { type: 'life', kind: 'call' }).ok, false, 'بدون مساعدات في السرقة');
  s = step(s, { type: 'reveal' }); s = step(s, { type: 'judge', right: true });
  assert.equal(s.teams[o].coins, 5600);
  assert.equal(s.stats.biggestSteal.amount, 600);
});

test('سرقة غلط = يخسرون نص المبلغ', () => {
  let s = begin();
  s = toQuestion(s, 3, 800);
  const o = 1 - s.answering;
  s = step(s, { type: 'reveal' }); s = step(s, { type: 'judge', right: false });
  s = step(s, { type: 'steal', yes: true });
  s = step(s, { type: 'reveal' }); s = step(s, { type: 'judge', right: false });
  assert.equal(s.teams[o].coins, 4600);
});

test('3 سرقات بس لكل فريق', () => {
  let s = begin();
  for (let i = 0; i < 3; i++) s.teams[0].steals = s.teams[1].steals = 0;
  s = toQuestion(s, 1, 200);
  s = step(s, { type: 'reveal' }); s = step(s, { type: 'judge', right: false });
  assert.equal(s.phase, 'result', 'ما فيه عرض سرقة لما تخلص السرقات');
});

test('مساعدة الخيارات: تطلع الخيارات والربح نصه، ومرة وحدة بس', () => {
  let s = begin();
  s = toQuestion(s, 1, 400);
  const t = s.answering;
  s = step(s, { type: 'life', kind: 'opts' });
  assert.equal(T.publicView(s).opts.length, 4);
  assert.equal(T.reduce(s, { type: 'life', kind: 'opts' }).ok, false);
  s = step(s, { type: 'reveal' }); s = step(s, { type: 'judge', right: true });
  assert.equal(s.teams[t].coins, 5400, 'نص الربح: الرهان مرة وحدة بدل مرتين');
});

test('الاتصال والبحث يزيدون الوقت 30 ثانية', () => {
  let s = begin();
  s = toQuestion(s, 1, 200, 0);
  s = step(s, { type: 'life', kind: 'call', now: 5000 });
  assert.equal(s.deadline, 20000 + 30000);
  s = step(s, { type: 'life', kind: 'search', now: 6000 });
  assert.equal(s.deadline, 80000);
});

test('اللعبة تخلص بعد 15 سؤال', () => {
  let s = begin();
  for (let i = 0; i < 15; i++) {
    const lvl = [1, 2, 3].find(l => s.board.some(c => !c.cards[l - 1].used));
    s = toQuestion(s, lvl, T.DEFAULTS.min[lvl - 1]);
    s = step(s, { type: 'reveal' }); s = step(s, { type: 'judge', right: i % 2 === 0 });
    if (s.phase === 'stealOffer') s = step(s, { type: 'steal', yes: false });
    s = step(s, { type: 'next' });
  }
  assert.equal(s.phase, 'over'); assert.ok(s.stats.boldest);
});

test('اللعبة تخلص لو فريق أفلس', () => {
  let s = begin();
  s.teams[s.turn].coins = 300;
  const t = s.turn;
  s = toQuestion(s, 1, 300);
  s = step(s, { type: 'reveal' }); s = step(s, { type: 'judge', right: false });
  assert.equal(s.teams[t].coins, 0);
  if (s.phase === 'stealOffer') s = step(s, { type: 'steal', yes: false });
  s = step(s, { type: 'next' });
  assert.equal(s.phase, 'over'); assert.equal(s.final, 1 - t);
});

test('المعروض لأجهزة الفرق ما فيه الجواب ولا الخيارات قبل وقتها', () => {
  let s = begin();
  s = toQuestion(s, 2, 400);
  const v = JSON.stringify(T.publicView(s));
  assert.ok(!v.includes(s.cur.a) || s.cur.q.includes(s.cur.a), 'الجواب مخفي');
  assert.equal(T.publicView(s).opts, undefined);
});

test('الحركات ما تغيّر الحالة القديمة', () => {
  const s = begin(); const copy = JSON.stringify(s);
  T.reduce(s, { type: 'pick', team: s.turn, col: 0, lvl: 1 });
  assert.equal(JSON.stringify(s), copy);
});

test('يقبل الجواب القصير باسم answer، ورقم الصح باسم a أو ai', () => {
  const c = T.normalize({ q: 'س؟', opts: ['أ', 'ب', 'ج', 'د'], a: 2, answer: 'جيم', lvl: 2 }, 'x', 0, 1);
  assert.equal(c.ai, 2); assert.equal(c.a, 'جيم'); assert.equal(c.lvl, 2);
});

test('بعد «خيارات» الهوست يضغط اختيار الفريق، والحكم تلقائي', () => {
  let s = begin();
  s = toQuestion(s, 1, 400);
  const t = s.answering;
  assert.equal(T.reduce(s, { type: 'choose', k: 0 }).ok, false, 'لازم الخيارات تطلع أول');
  s = step(s, { type: 'life', kind: 'opts' });
  const right = step(s, { type: 'choose', k: s.cur.ai });
  assert.equal(right.phase, 'result'); assert.equal(right.teams[t].coins, 5400);
  const wrong = step(s, { type: 'choose', k: (s.cur.ai + 1) % 4 });
  assert.ok(['stealOffer', 'result'].includes(wrong.phase)); assert.equal(wrong.teams[t].coins, 4600);
  assert.equal(wrong.picked, (s.cur.ai + 1) % 4);
});

test('البطاقة الملعوبة تحفظ مين لعبها ونتيجتها', () => {
  let s = begin();
  s = toQuestion(s, 2, 400);
  const t = s.answering, col = s.cur.col;
  s = step(s, { type: 'reveal' }); s = step(s, { type: 'judge', right: true }); s = step(s, { type: 'next' });
  const v = T.publicView(s).board[col];
  assert.equal(v.used[1], true); assert.deepEqual(v.res[1], { team: t, delta: 800, steal: false, bidder: t });
});
