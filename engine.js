// محرّك «المزاد»: كل قوانين اللعبة هنا، بدون أي شاشة أو اتصال.
// الحالة كائن عادي (يتحفظ JSON)، وكل حركة ترجع حالة جديدة بدون ما تغيّر القديمة.
(function (root, factory) {
  const E = factory();
  if (typeof module === 'object' && module.exports) module.exports = E;
  else root.Engine = E;
})(typeof self !== 'undefined' ? self : this, function () {
  const MIN_CATS = 3;
  const DEFAULTS = { rounds: 12, start: 1000, minBet: 50, answerS: 10, stealS: 8, rescue: 100, teams: 2 };

  // مولّد أرقام عشوائية ثابت من بذرة، عشان الاختبارات تتكرر بنفس النتيجة
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(arr, r) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  const clone = s => JSON.parse(JSON.stringify(s));

  // البنك: { "فئة": [{ q, a: نص الجواب, opts: [4 خيارات], ai: رقم الصح, lvl: 1-3 }, ...] }
  // البطاقة تحفظ a كرقم الصح (زي قبل)، وans نص الجواب، وlvl الصعوبة.
  function buildDeck(bank, r) {
    const cards = [];
    Object.keys(bank).forEach(cat => bank[cat].forEach(q => {
      if (!q || typeof q.q !== 'string' || typeof q.a !== 'string' || !Array.isArray(q.opts) || q.opts.length !== 4 || !(q.ai >= 0 && q.ai <= 3) || ![1, 2, 3].includes(q.lvl)) throw new Error('سؤال غير صالح في فئة ' + cat);
      cards.push({ cat, q: q.q, opts: q.opts, a: q.ai, ans: q.a, lvl: q.lvl });
    }));
    return shuffle(cards, r);
  }

  function create(opts) {
    opts = opts || {};
    const config = Object.assign({}, DEFAULTS, opts.config || {});
    const names = (opts.names || ['الصقور', 'النمور']).slice(0, config.teams);
    return {
      v: 1, phase: 'lobby', config, round: 0, seed: (opts.seed >>> 0) || 1, rngCalls: 0,
      teams: names.map(n => ({ name: String(n), coins: config.start, allinUsed: false })),
      deck: [], cur: null, lastCat: null, bids: names.map(() => null), allin: names.map(() => false),
      winner: null, tie: false, answering: null, steal: false, stake: 0, gone: null, deadline: null,
      last: null, final: null, rescued: [], attempts: [], openedAt: null, cats: null
    };
  }

  // كل استدعاء للعشوائية يمر من هنا، والحالة تحفظ عدد الاستدعاءات عشان الاسترجاع يكمل نفس التسلسل
  function rand(s) { const r = rng(s.seed); for (let i = 0; i < s.rngCalls; i++) r(); s.rngCalls++; return r(); }
  function randFn(s) { return () => rand(s); }

  function nextRound(s) {
    if (s.round >= s.config.rounds || s.deck.length === 0) return finish(s);
    s.round++;
    let i = s.deck.findIndex(c => c.cat !== s.lastCat); if (i < 0) i = 0;
    s.cur = s.deck.splice(i, 1)[0]; s.lastCat = s.cur.cat;
    s.rescued = [];
    s.teams.forEach((t, k) => { if (t.coins <= 0) { t.coins = s.config.rescue; s.rescued.push(k); } });
    s.bids = s.teams.map(() => null); s.allin = s.teams.map(() => false);
    s.winner = null; s.tie = false; s.answering = null; s.steal = false; s.stake = 0; s.gone = null; s.deadline = null; s.last = null;
    s.attempts = []; s.openedAt = null;
    s.phase = 'bet';
    return s;
  }

  function finish(s) {
    const max = Math.max.apply(null, s.teams.map(t => t.coins));
    const top = s.teams.map((t, k) => t.coins === max ? k : -1).filter(k => k >= 0);
    s.final = top.length === 1 ? top[0] : null;
    s.phase = 'over'; s.deadline = null;
    return s;
  }

  function clampBid(s, team, amount, allin) {
    const t = s.teams[team];
    if (allin && !t.allinUsed) return { amount: t.coins, allin: true };
    const min = Math.min(s.config.minBet, t.coins);
    let v = Math.round(Number(amount) || 0);
    v = Math.max(min, Math.min(t.coins, v));
    return { amount: v, allin: false };
  }

  function toQuestion(s, team, steal, now) {
    s.answering = team; s.steal = steal;
    if (!steal) s.stake = s.allin[team] ? s.bids[team] * 2 : s.bids[team];
    s.openedAt = now || 0;
    s.deadline = (now || 0) + (steal ? s.config.stealS : s.config.answerS) * 1000;
    s.phase = 'question';
    return s;
  }

  // ترجع { state, ok, error } — الحركة الغلط ترجع نفس الحالة مع سبب الرفض
  function reduce(prev, action) {
    const s = clone(prev), a = action || {};
    const fail = e => ({ state: prev, ok: false, error: e });
    const done = () => ({ state: s, ok: true });
    const validTeam = k => Number.isInteger(k) && k >= 0 && k < s.teams.length;

    switch (a.type) {
      case 'start': {
        if (s.phase !== 'lobby' && s.phase !== 'over') return fail('ما تقدر تبدأ الحين');
        if (!a.bank) return fail('ما فيه أسئلة');
        if (a.seed !== undefined) { s.seed = a.seed >>> 0 || 1; s.rngCalls = 0; }
        let bank = a.bank;
        if (Array.isArray(s.cats) && s.cats.length) {
          bank = {}; s.cats.forEach(c => { if (a.bank[c]) bank[c] = a.bank[c]; });
          if (Object.keys(bank).length < MIN_CATS) return fail('اختاروا ' + MIN_CATS + ' فئات على الأقل');
        }
        s.deck = buildDeck(bank, randFn(s));
        s.teams.forEach(t => { t.coins = s.config.start; t.allinUsed = false; });
        s.round = 0; s.lastCat = null; s.final = null;
        nextRound(s); return done();
      }
      case 'setCats': {
        if (s.phase !== 'lobby' && s.phase !== 'over') return fail('ما ينفع الحين');
        if (a.cats === null) { s.cats = null; return done(); }
        if (!Array.isArray(a.cats)) return fail('فئات غير صالحة');
        const uniq = [...new Set(a.cats.map(String))];
        if (uniq.length < MIN_CATS) return fail('اختاروا ' + MIN_CATS + ' فئات على الأقل');
        s.cats = uniq; return done();
      }
      case 'rename': {
        if (s.phase !== 'lobby' || !validTeam(a.team)) return fail('ما ينفع');
        s.teams[a.team].name = String(a.name || '').trim().slice(0, 14) || s.teams[a.team].name;
        return done();
      }
      case 'bid': {
        if (s.phase !== 'bet') return fail('مو وقت الرهان');
        if (!validTeam(a.team)) return fail('فريق غير معروف');
        if (s.bids[a.team] !== null) return fail('راهنتوا من قبل');
        const b = clampBid(s, a.team, a.amount, !!a.allin);
        s.bids[a.team] = b.amount; s.allin[a.team] = b.allin;
        if (s.bids.every(x => x !== null)) {
          const max = Math.max.apply(null, s.bids);
          const top = s.bids.map((x, k) => x === max ? k : -1).filter(k => k >= 0);
          s.tie = top.length > 1;
          s.winner = s.tie ? top[Math.floor(rand(s) * top.length)] : top[0];
          s.phase = 'reveal';
        }
        return done();
      }
      case 'toQuestion': {
        if (s.phase !== 'reveal') return fail('مو وقت السؤال');
        toQuestion(s, s.winner, false, a.now); return done();
      }
      case 'answer': {
        if (s.phase !== 'question') return fail('مو وقت الجواب');
        const k = Number.isInteger(a.k) ? a.k : -1;
        if (k > 3 || k < -1 || (k >= 0 && k === s.gone)) return fail('خيار غير صالح');
        const team = s.answering, t = s.teams[team], ok = k === s.cur.a, before = t.coins;
        if (!s.steal && s.allin[team]) t.allinUsed = true;
        if (ok) t.coins += s.stake;
        else if (!s.steal) t.coins = Math.max(0, t.coins - s.stake);
        const canSteal = !ok && !s.steal && s.teams.length === 2;
        const ms = Number.isFinite(a.at) && s.openedAt !== null ? Math.max(0, a.at - s.openedAt) : null;
        const by = typeof a.by === 'string' ? a.by.slice(0, 14) : null;
        s.last = { team, ok, steal: s.steal, picked: k, delta: t.coins - before, timeout: k === -1, by, ms };
        s.attempts.push({ team, by, picked: k, ok, ms, delta: t.coins - before, steal: s.steal });
        s.deadline = null;
        if (canSteal) { s.gone = k >= 0 ? k : null; s.phase = 'stealOffer'; }
        else { s.last.answer = s.cur.opts[s.cur.a]; s.phase = 'result'; }
        return done();
      }
      case 'steal': {
        if (s.phase !== 'stealOffer') return fail('ما فيه سرقة الحين');
        if (a.yes) { toQuestion(s, 1 - s.answering, true, a.now); return done(); }
        s.last.answer = s.cur.opts[s.cur.a];
        nextRound(s); return done();
      }
      case 'next': {
        if (s.phase !== 'result') return fail('مو وقت السؤال الجاي');
        nextRound(s); return done();
      }
      case 'reset': {
        const fresh = create({ config: s.config, names: s.teams.map(t => t.name), seed: s.seed }); fresh.cats = s.cats;
        return { state: fresh, ok: true };
      }
      default: return fail('حركة غير معروفة');
    }
  }

  // اللي ينرسل للجوالات: بدون الجواب الصح ولا بقية الأسئلة
  function publicView(s) {
    const v = { phase: s.phase, round: s.round, rounds: s.config.rounds,
      teams: s.teams.map(t => ({ name: t.name, coins: t.coins, allinUsed: t.allinUsed })),
      bidIn: s.bids.map(b => b !== null), answering: s.answering, steal: s.steal, deadline: s.deadline,
      last: s.last, rescued: s.rescued, minBet: s.config.minBet, attempts: s.attempts };
    if (s.cur && s.phase !== 'lobby' && s.phase !== 'over') v.cat = s.cur.cat;
    if (s.phase === 'reveal') { v.bids = s.bids; v.allin = s.allin; v.winner = s.winner; v.tie = s.tie; }
    if (s.phase === 'question') { v.q = s.cur.q; v.opts = s.cur.opts; v.gone = s.gone; v.stake = s.stake; }
    if (s.phase === 'over') v.final = s.final;
    return v;
  }

  return { DEFAULTS, MIN_CATS, create, reduce, publicView, buildDeck, rng };
});
