// محرّك نسخة التجربة من «أجل كم»: لوحة 5 فئات × 3 صعوبات، مزايدة علنية أو سرية،
// جواب بالصوت والهوست يحكم، سرقة، ووسائل مساعدة. بدون شاشة ولا اتصال: كل حركة ترجع حالة جديدة.
(function (root, factory) {
  const E = factory();
  if (typeof module === 'object' && module.exports) module.exports = E;
  else root.Trial = E;
})(typeof self !== 'undefined' ? self : this, function () {
  const DEFAULTS = {
    start: 5000, cats: 5, levels: 3,
    min: [200, 400, 600], time: [20, 25, 30],   // أقل مزايدة ووقت الجواب لكل صعوبة
    stealS: 10, steals: 3, lifeS: 30,           // السرقة، وعدد السرقات، والوقت الإضافي للاتصال والبحث
    openS: 5, openFirstS: 10                    // عداد المزايدة العلنية
  };
  const LIFE = ['call', 'search', 'opts'];

  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clone = s => JSON.parse(JSON.stringify(s));
  function rand(s) { const r = rng(s.seed); for (let i = 0; i < s.rngCalls; i++) r(); s.rngCalls++; return r(); }
  function shuffle(arr, s) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rand(s) * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

  // يقرأ السؤال بالصيغة القديمة [سؤال، خيارات، رقم الصح] أو الجديدة {q, a, opts, ai, lvl}
  function normalize(item, cat, index, count) {
    let c;
    if (Array.isArray(item)) c = { q: item[0], opts: item[1], ai: item[2] };
    else if (item && typeof item === 'object') c = { q: item.q, opts: item.opts, ai: Number.isInteger(item.ai) ? item.ai : item.a, a: typeof item.answer === 'string' ? item.answer : item.a, lvl: item.lvl };
    else return null;
    if (typeof c.q !== 'string' || !Array.isArray(c.opts) || c.opts.length !== 4 || !(c.ai >= 0 && c.ai <= 3)) return null;
    c.a = typeof c.a === 'string' && c.a.trim() ? c.a : c.opts[c.ai];
    // الصيغة القديمة ما فيها صعوبة: نوزّعها على ثلث سهل، وثلث وسط، وثلث صعب
    if (![1, 2, 3].includes(c.lvl)) c.lvl = 1 + Math.min(2, Math.floor(index * 3 / Math.max(1, count)));
    c.cat = cat;
    return c;
  }
  function pool(bank, cat) {
    const list = bank[cat] || [];
    return list.map((x, i) => normalize(x, cat, i, list.length)).filter(Boolean);
  }
  // الفئات اللي فيها سؤال واحد على الأقل لكل صعوبة
  function playableCats(bank) {
    return Object.keys(bank).filter(cat => { const p = pool(bank, cat); return [1, 2, 3].every(l => p.some(c => c.lvl === l)); });
  }

  function create(opts) {
    opts = opts || {};
    const config = Object.assign({}, DEFAULTS, opts.config || {});
    const names = opts.names || ['الصقور', 'النمور'];
    return {
      v: 2, phase: 'setup', config, seed: (opts.seed >>> 0) || 1, rngCalls: 0,
      devices: 1, bidMode: 'open', cats: [],
      teams: names.map(n => ({ name: String(n), coins: config.start, life: { call: true, search: true, opts: true }, steals: config.steals, right: 0 })),
      board: [], turn: 0, asked: 0, cur: null,
      bids: [null, null], top: null, passed: [false, false], deadline: null, tie: false,
      answering: null, stealing: false, stake: 0, optsShown: false, revealed: false, extra: 0,
      last: null, stats: { boldest: null, biggestSteal: null, biggestWin: null }, final: null
    };
  }

  const minBid = s => s.config.min[s.cur.lvl - 1];
  // الفلوس تنتقل بين الفريقين بس (مجموعها ثابت)، فأقصى مزايدة = الأقل بين رصيدك ورصيد خصمك
  const capFor = (s, t) => Math.min(s.teams[t].coins, s.teams[1 - t].coins);
  const floorFor = (s, t) => Math.min(minBid(s), capFor(s, t));
  // ينقل مبلغ من فريق لفريق، وما ينقل أكثر من اللي عنده
  function transfer(s, from, to, amount) { const m = Math.max(0, Math.min(amount, s.teams[from].coins)); s.teams[from].coins -= m; s.teams[to].coins += m; return m; }
  const leftMs = (s, now) => Math.max(0, (s.deadline || 0) - now);

  function finishIfDone(s) {
    const broke = s.teams.findIndex(t => t.coins <= 0);
    const all = s.board.every(col => col.cards.every(c => c.used));
    if (broke >= 0 || all || s.asked >= s.config.cats * s.config.levels) {
      const [a, b] = s.teams.map(t => t.coins);
      s.final = a === b ? null : a > b ? 0 : 1;
      s.phase = 'over'; s.deadline = null; s.cur = null;
      return true;
    }
    return false;
  }

  function toBoard(s) {
    s.cur = null; s.bids = [null, null]; s.top = null; s.passed = [false, false]; s.tie = false;
    s.answering = null; s.stealing = false; s.stake = 0; s.optsShown = false; s.revealed = false; s.extra = 0; s.deadline = null; s.picked = null;
    if (!finishIfDone(s)) s.phase = 'board';
  }

  function startQuestion(s, team, amount, now) {
    s.answering = team; s.stealing = false; s.stake = amount;
    s.optsShown = false; s.revealed = false; s.extra = 0;
    s.deadline = now + s.config.time[s.cur.lvl - 1] * 1000;
    s.phase = 'question';
    const b = s.stats.boldest;
    if (!b || amount > b.amount) s.stats.boldest = { team, amount, cat: s.cur.cat };
  }

  function reduce(prev, action) {
    const s = clone(prev), a = action || {}, now = Number.isFinite(a.now) ? a.now : 0;
    const fail = e => ({ state: prev, ok: false, error: e });
    const done = () => ({ state: s, ok: true });
    const team = k => Number.isInteger(k) && k >= 0 && k < s.teams.length;

    switch (a.type) {
      /* ---------- الإعداد ---------- */
      case 'configure': {
        if (s.phase !== 'setup') return fail('الإعداد قبل البداية بس');
        if (a.devices !== undefined) { if (![1, 3].includes(a.devices)) return fail('جهاز واحد أو 3 أجهزة'); s.devices = a.devices; }
        if (a.bidMode !== undefined) { if (!['open', 'secret'].includes(a.bidMode)) return fail('علنية أو سرية'); s.bidMode = a.bidMode; }
        if (Array.isArray(a.names)) a.names.slice(0, 2).forEach((n, i) => { const v = String(n || '').trim().slice(0, 14); if (v) s.teams[i].name = v; });
        return done();
      }
      case 'start': {
        if (s.phase !== 'setup') return fail('اللعبة بدأت');
        if (!a.bank) return fail('ما فيه أسئلة');
        const cats = Array.isArray(a.cats) ? [...new Set(a.cats)] : [];
        if (cats.length !== s.config.cats) return fail('اختاروا ' + s.config.cats + ' فئات');
        const ok = playableCats(a.bank);
        if (cats.some(c => !ok.includes(c))) return fail('فئة ما فيها أسئلة كافية');
        if (a.seed !== undefined) { s.seed = a.seed >>> 0 || 1; s.rngCalls = 0; }
        s.cats = cats;
        s.board = cats.map(cat => {
          const p = pool(a.bank, cat);
          return { cat, cards: [1, 2, 3].map(l => { const opts = shuffle(p.filter(c => c.lvl === l), s); return Object.assign({ used: false }, opts[0]); }) };
        });
        s.turn = Math.floor(rand(s) * 2);
        s.phase = 'board';
        return done();
      }

      /* ---------- اللوحة ---------- */
      case 'pick': {
        if (s.phase !== 'board') return fail('مو وقت الاختيار');
        if (a.team !== undefined && a.team !== s.turn) return fail('مو دوركم تختارون');
        const col = s.board[a.col], card = col && col.cards[a.lvl - 1];
        if (!card || card.used) return fail('البطاقة مو متاحة');
        card.used = true;
        s.cur = { cat: col.cat, lvl: a.lvl, col: a.col, q: card.q, a: card.a, opts: card.opts, ai: card.ai };
        s.bids = [null, null]; s.top = null; s.passed = [false, false]; s.tie = false;
        s.phase = 'bid';
        s.deadline = s.bidMode === 'open' ? now + s.config.openFirstS * 1000 : null;
        return done();
      }

      /* ---------- المزايدة العلنية ---------- */
      case 'raise': {
        if (s.phase !== 'bid' || s.bidMode !== 'open') return fail('مو وقت المزايدة العلنية');
        if (!team(a.team) || s.passed[a.team]) return fail('ما ينفع');
        if (s.top && s.top.team === a.team) return fail('أنتم المتصدرين');
        const base = s.top ? s.top.amount : 0;
        const amount = Math.max(base + (Number(a.inc) || 0), floorFor(s, a.team));
        if (!(Number(a.inc) > 0) && s.top) return fail('زيادة غير صالحة');
        if (amount > capFor(s, a.team)) return fail('أعلى من رصيدكم أو رصيد الخصم');
        if (s.top && amount <= s.top.amount) return fail('لازم أعلى');
        s.top = { team: a.team, amount }; s.bids[a.team] = amount;
        s.deadline = now + s.config.openS * 1000;
        return done();
      }
      case 'pass': {
        if (s.phase !== 'bid' || s.bidMode !== 'open' || !team(a.team)) return fail('ما ينفع');
        s.passed[a.team] = true;
        if ((s.top && s.top.team !== a.team) || s.passed.every(Boolean)) return sell(s, now, done);
        return done();
      }
      case 'sold': { // الشاشة تناديها لما يخلص العداد
        if (s.phase !== 'bid' || s.bidMode !== 'open') return fail('ما ينفع');
        if (now < s.deadline) return fail('العداد ما خلص');
        return sell(s, now, done);
      }

      /* ---------- المزايدة السرية ---------- */
      case 'secret': {
        if (s.phase !== 'bid' || s.bidMode !== 'secret' || !team(a.team)) return fail('ما ينفع');
        if (s.bids[a.team] !== null) return fail('راهنتوا');
        const amount = Math.round(Number(a.amount) || 0);
        if (amount < floorFor(s, a.team) || amount > capFor(s, a.team)) return fail('المبلغ برا الحدود');
        s.bids[a.team] = amount;
        if (s.bids.every(b => b !== null)) {
          const [x, y] = s.bids;
          s.tie = x === y;
          const w = s.tie ? (rand(s) < .5 ? 0 : 1) : x > y ? 0 : 1;
          s.top = { team: w, amount: s.bids[w] };
          s.phase = 'reveal';
        }
        return done();
      }
      case 'toQuestion': {
        if (s.phase !== 'reveal') return fail('ما ينفع');
        startQuestion(s, s.top.team, s.top.amount, now); return done();
      }

      /* ---------- السؤال ---------- */
      case 'life': {
        if (s.phase !== 'question' || s.stealing) return fail('المساعدات للفريق اللي يجاوب، وبدون سرقة');
        if (!LIFE.includes(a.kind)) return fail('مساعدة غير معروفة');
        const t = s.teams[s.answering];
        if (a.team !== undefined && a.team !== s.answering) return fail('مو دوركم');
        if (!t.life[a.kind]) return fail('استخدمتوها');
        t.life[a.kind] = false;
        if (a.kind === 'opts') s.optsShown = true;
        else { s.deadline = Math.max(s.deadline, now) + s.config.lifeS * 1000; s.extra += s.config.lifeS; }
        return done();
      }
      case 'reveal': { // خلص الوقت: نوقف العداد بس، والجواب يبقى مخفي لين يخلص السؤال
        if (s.phase !== 'question') return fail('ما ينفع');
        s.revealed = true; s.deadline = null; return done();
      }
      case 'choose': { // بعد «خيارات»: الهوست يضغط الخيار اللي قاله الفريق، والحكم تلقائي
        if (s.phase !== 'question' || !s.optsShown || s.stealing) return fail('ما ينفع');
        if (a.team !== undefined && a.team !== s.answering) return fail('مو دوركم');
        if (!(a.k >= 0 && a.k <= 3)) return fail('خيار غير صالح');
        s.picked = a.k; s.revealed = true;
        return reduce(s, { type: 'judge', right: a.k === s.cur.ai, now });
      }
      case 'judge': {
        if (s.phase !== 'question') return fail('ما ينفع'); // الهوست يشوف الجواب لحاله ويحكم، بدون ما ينكشف للغرفة
        const me = s.answering, other = 1 - me, right = !!a.right;
        let moved, from, to;
        if (!s.stealing) {
          // صح: تاخذون المزايدة من الخصم (ونصها لو استخدمتوا الخيارات). غلط: تعطونها الخصم
          if (right) { from = other; to = me; moved = transfer(s, other, me, s.optsShown ? Math.floor(s.stake / 2) : s.stake); s.teams[me].right++; }
          else { from = me; to = other; moved = transfer(s, me, other, s.stake); }
          s.last = { team: me, right, steal: false, delta: right ? moved : -moved, from, to, moved, answer: s.cur.a, opts: s.optsShown };
          if (right) { const w = s.stats.biggestWin; if (!w || moved > w.amount) s.stats.biggestWin = { team: me, amount: moved }; }
          const broke = s.teams.some(t => t.coins <= 0);
          s.phase = !right && !broke && s.teams[other].steals > 0 ? 'stealOffer' : 'result';
        } else {
          // سرقة صح: تاخذون المزايدة من الفريق اللي غلط. سرقة غلط: تعطونه نصها
          if (right) { from = other; to = me; moved = transfer(s, other, me, s.stake); s.teams[me].right++; }
          else { from = me; to = other; moved = transfer(s, me, other, Math.floor(s.stake / 2)); }
          s.last = { team: me, right, steal: true, delta: right ? moved : -moved, from, to, moved, answer: s.cur.a };
          if (right) { const b = s.stats.biggestSteal; if (!b || moved > b.amount) s.stats.biggestSteal = { team: me, amount: moved }; }
          s.phase = 'result';
        }
        s.deadline = null;
        return done();
      }
      case 'steal': {
        if (s.phase !== 'stealOffer') return fail('ما فيه سرقة');
        const other = 1 - s.answering;
        if (a.team !== undefined && a.team !== other) return fail('مو دوركم');
        if (!a.yes) { s.phase = 'result'; return done(); }
        s.teams[other].steals--;
        s.answering = other; s.stealing = true; s.optsShown = false; s.revealed = false; s.picked = null;
        s.deadline = now + s.config.stealS * 1000;
        s.phase = 'question';
        return done();
      }
      case 'next': {
        if (s.phase !== 'result') return fail('ما ينفع');
        const card = s.board[s.cur.col].cards[s.cur.lvl - 1];
        card.res = { team: s.last.team, delta: s.last.delta, steal: s.last.steal, bidder: s.top ? s.top.team : null };
        s.asked++; s.turn = 1 - s.turn;
        toBoard(s); return done();
      }
      case 'reset': {
        const fresh = create({ config: s.config, names: s.teams.map(t => t.name), seed: s.seed + 1 });
        fresh.devices = s.devices; fresh.bidMode = s.bidMode;
        return { state: fresh, ok: true };
      }
      default: return fail('حركة غير معروفة');
    }
  }

  // البيع في المزايدة العلنية: لو ما أحد زايد، الفريق اللي اختار البطاقة ياخذها بأقل مبلغ
  function sell(s, now, done) {
    if (!s.top) { const t = s.turn; s.top = { team: t, amount: floorFor(s, t) }; s.bids[t] = s.top.amount; }
    startQuestion(s, s.top.team, s.top.amount, now);
    return done();
  }

  // اللي ينرسل لأجهزة الفرق: بدون الجواب ولا الخيارات إلا لو انكشفت
  function publicView(s) {
    const v = { phase: s.phase, devices: s.devices, bidMode: s.bidMode, turn: s.turn, asked: s.asked, total: s.config.cats * s.config.levels,
      teams: s.teams.map(t => ({ name: t.name, coins: t.coins, life: t.life, steals: t.steals })),
      deadline: s.deadline, answering: s.answering, stealing: s.stealing, stake: s.stake, final: s.final,
      // نتيجة الجولة بدون الجواب، لين يخلص السؤال (عشان الفريق اللي يسرق ما يشوفه)
      last: s.last ? Object.assign({}, s.last, (s.phase === 'result' || s.phase === 'over') ? {} : { answer: undefined }) : null,
      board: s.board.map(c => ({ cat: c.cat, used: c.cards.map(x => x.used), res: c.cards.map(x => x.res || null) })) };
    if (s.cur) { v.cur = { cat: s.cur.cat, lvl: s.cur.lvl, min: minBid(s), caps: [capFor(s, 0), capFor(s, 1)] }; }
    if (s.phase === 'bid') { v.top = s.top; v.passed = s.passed; v.bidIn = s.bids.map(b => b !== null); }
    if (s.phase === 'reveal' || s.phase === 'question' || s.phase === 'result' || s.phase === 'stealOffer') { v.top = s.top; v.bids = s.bids; v.tie = s.tie; }
    if (s.phase === 'question') { v.q = s.cur.q; v.optsShown = s.optsShown; if (s.optsShown) v.opts = s.cur.opts; v.timeUp = s.revealed; }
    if (s.phase === 'result') v.answer = s.cur.a;
    if (s.phase === 'stealOffer') v.picked = s.picked;
    if (s.phase === 'over') v.stats = s.stats;
    return v;
  }

  return { DEFAULTS, LIFE, capFor, create, reduce, publicView, playableCats, pool, normalize, leftMs };
});
