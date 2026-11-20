// شاشة الهوست في نسخة التجربة: الإعداد، واللوحة، والمزايدة، والسؤال، والسرقة، والفايز.
// المحرّك في trial-engine.js هو اللي يحكم القوانين، وهالملف يعرض ويرسل.
const tv = document.getElementById('tv'), app = document.getElementById('app');
const $ = id => document.getElementById(id);
const SAVE = 'ajalkam-trial', LVL = ['سهل', 'وسط', 'صعب'], COL = ['var(--red)', 'var(--blue)', 'var(--green)', 'var(--yellow)'], L = 'أبجد';
const INCS = [100, 200, 500];
// أيقونات المساعدات: SVG بسيط بخط واحد، يطلع نفس الشي على كل الأجهزة
const ICON = {
  call: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 3h4l2 5-2.5 1.5a11 11 0 0 0 6 6L16 13l5 2v4a2 2 0 0 1-2 2A17 17 0 0 1 3 5a2 2 0 0 1 2-2z"/></svg>',
  search: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/></svg>',
  opts: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><rect x="3" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5"/></svg>'
};
const LIFE_NAME = { call: 'اتصال', search: 'بحث', opts: 'خيارات' };
const fmt = n => Number(n).toLocaleString('en');

let S = null, P = {}, ROOM = null, net = null, setup = { step: 'home', cats: [] };
let T = null, A = null, lastPhase = null, lastKey = '';
const stop = () => { clearInterval(T); T = null; clearTimeout(A); A = null; };

/* ---------- الحفظ ---------- */
function save() { try { localStorage.setItem(SAVE, JSON.stringify({ S, P, ROOM, setup, at: Date.now() })); } catch (e) {} }
function load() { try { const d = JSON.parse(localStorage.getItem(SAVE) || 'null'); if (d && d.S && Date.now() - d.at < 6 * 3600e3) return d; } catch (e) {} return null; }
function code() { const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', r = new Uint32Array(5); crypto.getRandomValues(r); return Array.from(r, n => a[n % a.length]).join(''); }

/* ---------- المحرّك ---------- */
function dispatch(action) {
  const r = Trial.reduce(S, Object.assign({ now: Date.now() }, action));
  if (!r.ok) return r.error || false;
  S = r.state; save(); send(); render();
  return true;
}
const seatOf = t => Object.entries(P).find(([, p]) => p.team === t);
const hostPlays = t => S.devices === 1 || !seatOf(t);   // الهوست يلعب عن الفريق بس لو ما عنده جهاز

/* ---------- الاتصال بأجهزة الفرق ---------- */
function send() {
  if (!net || !S) return;
  const v = Trial.publicView(S); v.t = 'state'; v.room = ROOM;
  v.seats = [0, 1].map(t => !!seatOf(t));
  net.send(v);
}
async function onMsg(m) {
  if (!S || !m || m.room !== ROOM) return;
  try {
    if (m.t === 'hello') return send();
    if (m.t === 'join') {
      if (!(m.team === 0 || m.team === 1) || typeof m.id !== 'string') return;
      if (await Auth.idFromPub(m.pub) !== m.id || !await Auth.verify(m.pub, Auth.joinParts(m), m.sig)) return;
      const seat = seatOf(m.team);
      if (seat && seat[0] !== m.id) return net.send({ t: 'denied', room: ROOM, id: m.id, why: 'فريق ' + S.teams[m.team].name + ' عنده جهاز. جهاز واحد لكل فريق.' });
      const mine = P[m.id];
      if (mine && mine.team !== m.team) return net.send({ t: 'denied', room: ROOM, id: m.id, why: 'هالجهاز مسجّل لفريق ثاني.' });
      if (!mine && S.phase !== 'setup' && S.phase !== 'lobby' && seat) return;
      P[m.id] = { team: m.team, pub: m.pub, seq: mine ? mine.seq : 0 };
      save(); send(); if (setup.step === 'join') render();
      return;
    }
    if (m.t === 'act') {
      const p = P[m.id];
      if (!p || !(m.seq > p.seq) || !m.body || !await Auth.verify(p.pub, Auth.actParts(m), m.sig)) return;
      p.seq = m.seq; save();
      const b = m.body, t = p.team;
      const map = {
        pick: () => ({ type: 'pick', team: t, col: b.col, lvl: b.lvl }),
        raise: () => ({ type: 'raise', team: t, inc: b.inc }),
        pass: () => ({ type: 'pass', team: t }),
        secret: () => ({ type: 'secret', team: t, amount: b.amount }),
        life: () => ({ type: 'life', team: t, kind: b.kind }),
        steal: () => ({ type: 'steal', team: t, yes: !!b.yes }),
        choose: () => ({ type: 'choose', team: t, k: b.k })
      };
      if (b.type === 'choose' && S.phase === 'question' && S.optsShown && t === S.answering && b.k >= 0 && b.k <= 3) return pickOpt(+b.k);
      if (map[b.type]) { const res = dispatch(map[b.type]()); if (res === true && b.type === 'raise') bump(t); }
    }
  } catch (e) { console.warn('رسالة مرفوضة', e); }
}

/* ---------- قطع مشتركة ---------- */
const logo = `<span class="logo">أجل <span>كم؟</span></span>`;
function teamCard(i, dim) {
  const t = S.teams[i];
  return `<div class="team t${i} ${dim ? 'dim' : ''}">${S.phase === 'board' && S.turn === i ? '<span class="turnmark">دوركم تختارون</span>' : ''}<span class="nm">${esc(t.name)}${S.devices === 3 && seatOf(i) ? ' 📱' : ''}</span><span class="money" id="m${i}">${fmt(t.coins)}</span>
    <span class="kit">${['call', 'search', 'opts'].map(k => `<span class="life ${t.life[k] ? '' : 'used'}" title="${LIFE_NAME[k]}">${ICON[k]}</span>`).join('')}<span class="steals">${'<i></i>'.repeat(t.steals)}</span></span></div>`;
}
function topBar(mid, active) {
  return `<div class="top">${teamCard(0, active === 1)}<div class="mid">${logo}${mid ? `<span class="pill">${mid}</span>` : ''}</div>${teamCard(1, active === 0)}</div>`;
}
function ring(id, secs, total) { return `<span class="ring" id="${id}r" style="--p:${Math.round(100 * secs / Math.max(1, total))}%"><b id="${id}">${secs}</b></span>`; }
function setRing(id, secs, total) { const b = $(id), r = $(id + 'r'); if (!b) return; b.textContent = secs; r.style.setProperty('--p', Math.round(100 * secs / Math.max(1, total)) + '%'); r.classList.toggle('low', secs <= 3 && secs > 0); }
const secsLeft = () => Math.ceil(Trial.leftMs(S, Date.now()) / 1000);

/* ---------- العرض حسب المرحلة ---------- */
function render() {
  const key = S.phase + '|' + (S.cur ? S.cur.col + ':' + S.cur.lvl : '') + '|' + S.answering + '|' + S.stealing + '|' + S.asked;
  const fresh = key !== lastKey; lastKey = key;
  if (S.phase !== lastPhase) { tv.classList.remove('still'); tv.classList.toggle('calm', !!lastPhase && lastPhase !== 'setup'); lastPhase = S.phase; } else tv.classList.add('still');
  if (fresh) stop();
  if (S.phase === 'setup') return setupScreen();
  ({ board, bid: S.bidMode === 'open' ? openBid : secretBid, reveal: revealBids, question, stealOffer, result, over })[S.phase](fresh);
}

/* ---------- الإعداد ---------- */
function setupScreen() {
  stop();
  const cats = Trial.playableCats(BANK);
  if (setup.step === 'home') {
    app.innerHTML = `<div class="stage">
      <span class="logo" style="font-size:9cqw">أجل <span>كم؟</span></span>
      <p class="say">لعبة جمعات: راهنوا على أسئلة، ومن يكسب أكثر يفوز</p>
      <div class="panel" style="max-width:70cqw">
        <p class="mute">١. فريقين، وكل فريق يبدأ بـ 5,000 &nbsp;·&nbsp; ٢. صاحب الدور يختار فئة وصعوبة &nbsp;·&nbsp; ٣. تزايدون، والأعلى يجاوب بصوت عالي</p>
        <p class="mute">صح = ضعف رهانكم &nbsp;·&nbsp; غلط = تخسرونه، والفريق الثاني يقدر يسرق</p>
      </div>
      <button class="hb go" id="go">ابدأ لعبة</button>
      <p class="mute">نسخة تجربة للأهل والأصدقاء</p></div>`;
    $('go').onclick = () => { setup.step = 'cats'; save(); setupScreen(); };
    return;
  }
  if (setup.step === 'cats') {
    const on = new Set(setup.cats);
    app.innerHTML = `<div class="top"><div></div><div class="mid">${logo}<span class="pill">اختاروا 5 فئات</span></div><div></div></div>
      <div class="stage">
        <div class="catgrid" id="cg">${cats.map(c => `<button class="catb ${on.has(c) ? 'on' : on.size >= 5 ? 'full' : ''}" data-c="${esc(c)}" aria-pressed="${on.has(c)}">${esc(c)}</button>`).join('')}</div>
        <p class="mute" id="cn">${on.size} من 5</p>
        <div class="host"><button class="hb w" id="rnd">عشوائي</button><button class="hb go" id="nx" ${on.size === 5 ? '' : 'disabled'}>التالي</button></div></div>`;
    $('cg').onclick = e => { const b = e.target.closest('.catb'); if (!b) return; const c = b.dataset.c;
      if (!on.has(c) && on.size >= 5) { $('cn').textContent = 'اخترتوا 5. شيلوا وحدة عشان تختارون غيرها'; return; }
      on.has(c) ? on.delete(c) : on.add(c); setup.cats = [...on]; beep(500, .04); save(); setupScreen(); };
    $('rnd').onclick = () => { setup.cats = shuffle(cats).slice(0, 5); save(); setupScreen(); };
    $('nx').onclick = () => { setup.step = 'mode'; save(); setupScreen(); };
    return;
  }
  if (setup.step === 'mode') {
    app.innerHTML = `<div class="top"><div></div><div class="mid">${logo}<span class="pill">طريقة اللعب</span></div><div></div></div>
      <div class="stage">
        <div class="names"><input class="t0" id="n0" maxlength="14" value="${esc(S.teams[0].name)}" aria-label="اسم الفريق الأول"><input class="t1" id="n1" maxlength="14" value="${esc(S.teams[1].name)}" aria-label="اسم الفريق الثاني"></div>
        <div class="choices" id="dv">
          <button class="choice ${S.devices === 1 ? 'on' : ''}" data-d="1"><b>📺 جهاز واحد</b>كل شي من هالشاشة</button>
          <button class="choice ${S.devices === 3 ? 'on' : ''}" data-d="3"><b>📺 + 📱📱</b>الشاشة، وجهاز لكل فريق يزايد منه</button></div>
        <div class="choices" id="bm">
          <button class="choice ${S.bidMode === 'open' ? 'on' : ''}" data-m="open"><b>🔊 مزايدة علنية</b>تزايدون قدام بعض</button>
          <button class="choice ${S.bidMode === 'secret' ? 'on' : ''}" data-m="secret"><b>🤫 مزايدة سرية</b>كل فريق يكتب رقمه بالسر</button></div>
        <p class="err" id="er"></p>
        <div class="host"><button class="hb w" id="bk">رجوع</button><button class="hb go" id="go">${S.devices === 3 ? 'التالي: دخول الفرق' : 'ابدأ اللعب'}</button></div></div>`;
    const names = () => dispatch0({ type: 'configure', names: [$('n0').value, $('n1').value] });
    $('n0').onchange = $('n1').onchange = names;
    $('dv').onclick = e => { const b = e.target.closest('[data-d]'); if (b) { names(); dispatch0({ type: 'configure', devices: +b.dataset.d }); setupScreen(); } };
    $('bm').onclick = e => { const b = e.target.closest('[data-m]'); if (b) { names(); dispatch0({ type: 'configure', bidMode: b.dataset.m }); setupScreen(); } };
    $('bk').onclick = () => { setup.step = 'cats'; save(); setupScreen(); };
    $('go').onclick = () => { names(); if (S.devices === 3) { setup.step = 'join'; save(); setupScreen(); } else startGame(); };
    return;
  }
  if (setup.step === 'join') {
    const url = new URL('trial-team.html?room=' + ROOM, location.href).href;
    const both = [0, 1].every(t => seatOf(t));
    app.innerHTML = `<div class="top"><div></div><div class="mid">${logo}<span class="pill">دخول الفرق</span></div><div></div></div>
      <div class="stage">
        <div class="join"><div class="qr" id="qr"></div><div style="display:flex;flex-direction:column;gap:1cqw;text-align:start">
          <p class="say">كل فريق يصوّر الكود بجهاز واحد</p><span class="code">${ROOM}</span><span class="url">${esc(url)}</span></div></div>
        <div class="seats">${[0, 1].map(t => `<div class="seat t${t} ${seatOf(t) ? 'ready' : ''}"><b>${esc(S.teams[t].name)}</b>${seatOf(t) ? '✓ الجهاز جاهز' : 'ننتظر الجهاز…'}</div>`).join('')}</div>
        <p class="err" id="er"></p>
        <div class="host"><button class="hb w" id="bk">رجوع</button><button class="hb go" id="go" ${both ? '' : 'disabled'}>ابدأ اللعب</button></div></div>`;
    try { new QRCode($('qr'), { text: url, width: 220, height: 220, correctLevel: QRCode.CorrectLevel.M }); } catch (e) { $('qr').textContent = ROOM; }
    $('bk').onclick = () => { setup.step = 'mode'; save(); setupScreen(); };
    $('go').onclick = startGame;
  }
}
// تغييرات الإعداد بدون إعادة رسم كاملة
function dispatch0(a) { const r = Trial.reduce(S, a); if (r.ok) { S = r.state; save(); send(); } return r.ok; }
function startGame() {
  const res = dispatch({ type: 'start', bank: BANK, cats: setup.cats, seed: crypto.getRandomValues(new Uint32Array(1))[0] });
  if (res !== true) { const e = $('er'); if (e) e.textContent = res || 'ما قدرنا نبدأ'; }
  else SFX.win();
}

/* ---------- اللوحة ---------- */
function board() {
  const can = hostPlays(S.turn);
  const tile = (c, i, l) => {
    const card = c.cards[l - 1];
    if (card.used) {
      const r = card.res, d = r ? r.delta : 0;
      return `<button class="tile done ${!r || d === 0 ? 'none' : ''}" style="--tc:${r && r.team ? 'var(--red)' : 'var(--blue)'}" disabled aria-label="ملعوبة">${r ? esc(S.teams[r.team].name) + (r.steal ? ' · سرقة' : '') : 'انلعبت'}<small>${r ? (d > 0 ? '+' : d < 0 ? '−' : '') + fmt(Math.abs(d)) : ''}</small></button>`;
    }
    return `<button class="tile l${l}" style="--i:${i + (l - 1) * 5}" data-c="${i}" data-l="${l}" ${can ? '' : 'disabled'}>${LVL[l - 1]}<small>من ${fmt(S.config.min[l - 1])} · ${S.config.time[l - 1]} ثانية</small></button>`;
  };
  app.innerHTML = `${topBar(`سؤال ${S.asked + 1} من 15`, S.turn)}<div class="stage boardst">
    <p class="say">${esc(S.teams[S.turn].name)}، اختاروا فئة وصعوبة ${can ? '' : 'من جهازكم 📱'}</p>
    <div class="board" id="bd">
      ${S.board.map(c => `<div class="colh">${esc(c.cat)}</div>`).join('')}
      ${[1, 2, 3].map(l => S.board.map((c, i) => tile(c, i, l)).join('')).join('')}
    </div></div>`;
  $('bd').onclick = e => { const b = e.target.closest('.tile'); if (b && !b.disabled) { SFX.tap(); dispatch({ type: 'pick', col: +b.dataset.c, lvl: +b.dataset.l }); } };
}
const chip = () => `<span class="chip">${esc(S.cur.cat)} <small>· ${LVL[S.cur.lvl - 1]} · أقل شي ${fmt(Math.min(S.config.min[S.cur.lvl - 1], Trial.capFor(S, S.turn)))}</small></span>`;

/* ---------- المزايدة العلنية ---------- */
function openBid(fresh) {
  if (!fresh) return updateOpen();
  app.innerHTML = `${topBar('مزايدة علنية')}<div class="stage">
    ${chip()}
    <div class="bids">${[0, 1].map(t => `<div class="bidcol"><div class="bid" id="b${t}" style="--k:${t ? 'var(--red)' : 'var(--blue)'}"><b>—</b><span>${esc(S.teams[t].name)}</span></div>
      ${hostPlays(t) ? `<div class="steps" data-t="${t}">${INCS.map(i => `<button class="hb sm y" data-i="${i}">+${i}</button>`).join('')}<button class="hb sm w" data-pass="1">أكتفي</button></div>` : '<span class="hostlbl">📱 من جهازهم</span>'}</div>`).join('')}</div>
    <div class="timer">${ring('cd', secsLeft(), S.top ? S.config.openS : S.config.openFirstS)}<span class="call" id="call">على كم؟</span><span class="gavel" id="gv">🔨</span></div>
    <p class="mute" id="hint">${S.top ? '' : 'لو ما أحد زايد، ' + esc(S.teams[S.turn].name) + ' ياخذونه بأقل مبلغ'}</p></div>`;
  app.querySelectorAll('.steps').forEach(el => el.onclick = e => {
    const b = e.target.closest('button'); if (!b) return; const t = +el.dataset.t;
    const r = b.dataset.pass ? dispatch({ type: 'pass', team: t }) : dispatch({ type: 'raise', team: t, inc: +b.dataset.i });
    if (r === true && !b.dataset.pass) bump(t);
  });
  updateOpen();
  let lastCall = '';
  T = setInterval(() => {
    if (S.phase !== 'bid') return;
    const s = secsLeft(); setRing('cd', s, S.top ? S.config.openS : S.config.openFirstS);
    const c = !S.top ? 'على كم؟' : s === 3 ? 'بيع… <em>مرة!</em>' : s === 2 ? 'بيع… <em>مرتين!</em>' : s === 1 ? 'بيع… <em>مرتين ونص!</em>' : 'زيادة!';
    if (c !== lastCall && $('call')) { lastCall = c; $('call').innerHTML = c; if (s <= 3 && S.top) beep(330, .12); }
    if (Trial.leftMs(S, Date.now()) <= 0) { sold(); }
  }, 200);
}
function updateOpen() {
  [0, 1].forEach(t => {
    const el = $('b' + t); if (!el) return;
    el.querySelector('b').textContent = S.bids[t] ? fmt(S.bids[t]) : '—';
    el.classList.toggle('lead', !!S.top && S.top.team === t);
    el.classList.toggle('out', S.passed[t]);
    el.querySelector('span').textContent = S.teams[t].name + (S.passed[t] ? ' · اكتفوا' : '');
    const steps = app.querySelector(`.steps[data-t="${t}"]`);
    const cap = Trial.capFor(S, t), cur = S.top ? S.top.amount : 0;
    if (steps) steps.querySelectorAll('button').forEach(b => b.disabled = S.passed[t] || (!b.dataset.pass && ((S.top && S.top.team === t) || Math.max(cur + +b.dataset.i, S.config.min[S.cur.lvl - 1]) > cap)));
  });
  if ($('hint') && S.top) $('hint').textContent = 'كل زيادة ترجّع العداد ' + S.config.openS + ' ثواني';
}
function bump(t) { const b = $('b' + t) && $('b' + t).querySelector('b'); if (b) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); } beep(520 + t * 80, .06); }
function sold() {
  clearInterval(T); T = null;
  const top = S.top || { team: S.turn, amount: Math.min(S.config.min[S.cur.lvl - 1], S.teams[S.turn].coins) };
  if ($('call')) $('call').innerHTML = `<em>بيع!</em> لـ${esc(S.teams[top.team].name)} بـ ${fmt(top.amount)}`;
  if ($('gv')) $('gv').classList.add('hit');
  tv.classList.add('shake'); setTimeout(() => tv.classList.remove('shake'), 400);
  SFX.win();
  A = setTimeout(() => { if (S.phase === 'bid') dispatch({ type: 'sold' }); }, 1300);
}

/* ---------- المزايدة السرية ---------- */
let secretFor = null, secretAmt = 0;
function secretBid(fresh) {
  if (fresh) secretFor = null;
  const box = t => {
    const done = S.bids[t] !== null;
    return `<div class="bidcol"><div class="bid back" style="--k:${t ? 'var(--red)' : 'var(--blue)'}"><b>${done ? '✓ جاهزين' : '…'}</b><span>${esc(S.teams[t].name)}${done ? '' : ' يفكرون'}</span></div>
      ${done ? '' : hostPlays(t) ? `<button class="hb sm y" data-t="${t}">اكتبوا رقمكم</button>` : '<span class="hostlbl">📱 من جهازهم</span>'}</div>`;
  };
  if (secretFor !== null && S.bids[secretFor] === null) {
    const t = secretFor, o = 1 - t, max = Trial.capFor(S, t), min = Math.min(S.config.min[S.cur.lvl - 1], max);
    secretAmt = Math.max(min, Math.min(max, secretAmt || min));
    app.innerHTML = `${topBar('مزايدة سرية', t)}<div class="stage">${chip()}
      <p class="say">${esc(S.teams[t].name)} يكتبون رقمهم · ${esc(S.teams[o].name)} لا يطالعون 🙈</p>
      <div class="panel"><div class="secretin"><span class="amt" id="amt">${fmt(secretAmt)}</span>
        <div class="steps" id="st">${[-500, -100, 100, 500].map(d => `<button class="hb sm ${d < 0 ? 'w' : 'y'}" data-d="${d}">${d > 0 ? '+' : '−'}${Math.abs(d)}</button>`).join('')}<button class="hb sm w" data-all="1">الحد الأعلى</button></div>
        <span class="mute">من ${fmt(min)} إلى ${fmt(max)}</span></div></div>
      <div class="host"><button class="hb w" id="bk">رجوع</button><button class="hb go" id="ok">ثبّتوا الرقم</button></div></div>`;
    $('st').onclick = e => { const b = e.target.closest('button'); if (!b) return; secretAmt = b.dataset.all ? max : Math.max(min, Math.min(max, secretAmt + +b.dataset.d)); $('amt').textContent = fmt(secretAmt); beep(500, .03); };
    $('bk').onclick = () => { secretFor = null; secretBid(false); };
    $('ok').onclick = () => { const v = secretAmt; secretFor = null; secretAmt = 0; dispatch({ type: 'secret', team: t, amount: v }); };
    return;
  }
  app.innerHTML = `${topBar('مزايدة سرية')}<div class="stage">${chip()}
    <div class="bids" id="sb">${box(0)}${box(1)}</div>
    <p class="mute">أول ما يجهز الفريقين، البطاقات تنقلب</p></div>`;
  $('sb').onclick = e => { const b = e.target.closest('[data-t]'); if (b) { secretFor = +b.dataset.t; secretAmt = 0; secretBid(false); } };
}
function revealBids(fresh) {
  app.innerHTML = `${topBar('مزايدة سرية')}<div class="stage">${chip()}
    <div class="bids">${[0, 1].map(t => `<div class="bidcol"><div class="bid flipin ${S.top.team === t ? 'lead' : ''}" style="--k:${t ? 'var(--red)' : 'var(--blue)'}"><b>${fmt(S.bids[t])}</b><span>${esc(S.teams[t].name)}</span></div></div>`).join('')}</div>
    <p class="call">${S.tie ? 'تعادل! والقرعة اختارت ' : ''}<em>${esc(S.teams[S.top.team].name)}</em> ياخذون السؤال</p></div>`;
  if (fresh) { SFX.reveal(); A = setTimeout(() => { if (S.phase === 'reveal') dispatch({ type: 'toQuestion' }); }, 2600); }
}

/* ---------- السؤال ---------- */
function question(fresh) {
  const t = S.answering, tm = S.teams[t], other = esc(S.teams[1 - t].name), win = S.stealing ? S.stake : S.optsShown ? Math.floor(S.stake / 2) : S.stake, lose = S.stealing ? Math.floor(S.stake / 2) : S.stake;
  const total = S.stealing ? S.config.stealS : S.config.time[S.cur.lvl - 1] + S.extra;
  const can = hostPlays(t), opts = S.optsShown;
  // مع «خيارات»: الخيارات أزرار، والهوست يضغط اللي قاله الفريق والحكم تلقائي
  const answerArea = opts
    ? `<div class="opts" id="ops">${S.cur.opts.map((o, k) => `<button class="opt" data-k="${k}"><i style="--k:${COL[k]}">${L[k]}</i>${esc(o)}</button>`).join('')}</div>
       <span class="hostlbl">للهوست: اضغطوا الخيار اللي قالوه</span>`
    : `<p class="say">${S.revealed ? 'خلص الوقت! وش قالوا؟' : 'قولوا جوابكم بصوت عالي 🗣️'}</p>`;
  const helps = S.stealing || S.revealed ? '' : `<div class="helps" id="hp">${['call', 'search', 'opts'].map(k => `<button class="help" data-k="${k}" ${tm.life[k] && can ? '' : 'disabled'}>${ICON[k]} ${LIFE_NAME[k]}</button>`).join('')}</div>`;
  // الهوست يشوف الجواب لحاله: يضغط مطولاً، والجواب يطلع صغير بس وهو ضاغط. الغرفة ما تشوفه لين يخلص السؤال
  const hostRow = opts ? '' : `<div class="host"><button class="hb peek" id="pk" aria-label="اضغط مطولاً عشان تشوف الجواب">👁️ الجواب للهوست <span class="peekans" id="pa" hidden>${esc(S.cur.a)}</span></button>
      <button class="hb ok" id="ok">✔ صح</button><button class="hb no" id="no">✘ غلط</button></div>`;
  app.innerHTML = `${topBar(S.stealing ? `${esc(tm.name)} يسرقون` : `${esc(tm.name)} يجاوبون`, t)}<div class="stage ${opts ? 'withopts' : ''}">
    ${S.stealing ? '<p class="stealbar">سرقة! 🏃‍♂️</p>' : chip()}
    <p class="q">${esc(S.cur.q)}</p>
    ${answerArea}
    ${helps}
    ${hostRow}
    <div class="timer">${S.revealed ? '' : ring('qt', secsLeft(), total)}<span class="stake">صح: تاخذون <b>${fmt(win)}</b> من ${other}${opts && !S.stealing ? ' (نص المزايدة)' : ''} · غلط: تعطونهم <s>${fmt(lose)}</s></span></div></div>`;
  if ($('hp')) $('hp').onclick = e => { const b = e.target.closest('.help'); if (b && !b.disabled) { SFX.tap(); dispatch({ type: 'life', kind: b.dataset.k }); } };
  if (opts) $('ops').onclick = e => { const b = e.target.closest('.opt'); if (b && !b.disabled) pickOpt(+b.dataset.k); };
  if (!opts) {
    $('ok').onclick = () => dispatch({ type: 'judge', right: true });
    $('no').onclick = () => dispatch({ type: 'judge', right: false });
    const show = on => e => { e.preventDefault(); $('pa').hidden = !on; };
    ['pointerdown'].forEach(ev => $('pk').addEventListener(ev, show(true)));
    ['pointerup', 'pointerleave', 'pointercancel', 'blur'].forEach(ev => $('pk').addEventListener(ev, show(false)));
    $('pk').addEventListener('keydown', e => { if (e.key === ' ' || e.key === 'Enter') show(true)(e); });
    $('pk').addEventListener('keyup', show(false));
  }
  if (!S.revealed) {
    clearInterval(T);
    T = setInterval(() => {
      if (S.phase !== 'question' || S.revealed) return;
      const s = secsLeft(); setRing('qt', s, total);
      if (s <= 5 && s > 0) SFX.tick();
      if (Trial.leftMs(S, Date.now()) <= 0) { clearInterval(T); T = null; if (opts) dispatch({ type: 'judge', right: false }); else dispatch({ type: 'reveal' }); }
    }, 250);
  }
  if (fresh && S.stealing) beep(260, .3);
}

// اختيار من الخيارات (من الشاشة أو من جهاز الفريق). لو غلط، ما نلوّن الصح عشان السرقة
function pickOpt(k) {
  if (S.phase !== 'question' || !S.optsShown || A) return;
  const right = k === S.cur.ai;
  clearInterval(T); T = null;
  document.querySelectorAll('#ops .opt').forEach(x => { x.disabled = true; if (+x.dataset.k === k) x.classList.add(right ? 'right' : 'wrong'); });
  right ? SFX.win() : SFX.lose();
  A = setTimeout(() => { A = null; dispatch({ type: 'choose', k }); }, 900);
}

/* ---------- السرقة ---------- */
function stealOffer(fresh) {
  const o = 1 - S.answering, can = hostPlays(o);
  app.innerHTML = `${topBar('غلط!', o)}<div class="stage">
    <p class="res bad">غلط! ${fmt(S.last ? S.last.moved : S.stake)} راحت لـ${esc(S.teams[o].name)}</p>
    ${S.picked !== null && S.picked !== undefined ? `<p class="mute">قالوا: ${esc(S.cur.opts[S.picked])}</p>` : ''}
    <p class="stealbar">${esc(S.teams[o].name)}، تبون تسرقون؟</p>
    <p class="say">سرقة صح: تاخذون ${fmt(S.stake)} من ${esc(S.teams[S.answering].name)} · غلط: تعطونهم ${fmt(Math.floor(S.stake / 2))} · باقي لكم ${S.teams[o].steals} سرقات</p>
    ${can ? '<div class="host"><button class="hb no" id="y">نسرق!</button><button class="hb w" id="n">لا</button></div>' : '<span class="hostlbl">📱 يقررون من جهازهم</span>'}
    <div class="timer">${ring('dc', 10, 10)}</div></div>`;
  if (can) { $('y').onclick = () => dispatch({ type: 'steal', yes: true }); $('n').onclick = () => dispatch({ type: 'steal', yes: false }); }
  if (fresh) { tv.classList.add('shake'); setTimeout(() => tv.classList.remove('shake'), 400); SFX.lose(); }
  const ends = Date.now() + 10000;
  clearInterval(T);
  T = setInterval(() => { const s = Math.max(0, Math.ceil((ends - Date.now()) / 1000)); setRing('dc', s, 10); if (s <= 0) { clearInterval(T); T = null; if (S.phase === 'stealOffer') dispatch({ type: 'steal', yes: false }); } }, 250);
}
// الجواب الغلط بدون سرقة ما يمر على السرقة، فنكشف الجواب في النتيجة

/* ---------- النتيجة ---------- */
function result(fresh) {
  // الفلوس تنتقل من فريق لفريق: نعرض السهم بين البطاقتين، والرقمين يعدّون مع بعض
  const L_ = S.last, ok = L_.right, from = L_.from, to = L_.to, m = L_.moved || 0;
  const after = S.teams.map(x => x.coins), before = after.slice(); before[from] += m; before[to] -= m;
  const nm = i => esc(S.teams[i].name), col = i => i ? 'var(--red)' : 'var(--blue)';
  app.innerHTML = `${topBar(L_.steal ? 'سرقة' : 'النتيجة')}<div class="stage">
    <p class="res ${ok ? '' : 'bad'}">${ok ? (L_.steal ? 'سرقوها!' : 'صح!') : (L_.steal ? 'السرقة طاحت!' : 'غلط!')}</p>
    <div class="flow"><span style="color:${col(from)}">${nm(from)}</span><span class="arrow">◀ ${fmt(m)} ◀</span><span style="color:${col(to)}">${nm(to)}</span></div>
    <div class="flip" id="fl"><div class="in"><div class="f">الجواب…</div><div class="b">${esc(S.cur ? S.cur.a : L_.answer)}</div></div></div>
    <div class="host"><button class="hb go" id="nx">${S.asked + 1 >= 15 || S.teams.some(x => x.coins <= 0) ? 'النتيجة النهائية' : 'السؤال الجاي'}</button></div></div>`;
  $('nx').onclick = () => dispatch({ type: 'next' });
  if (!fresh) { $('fl').classList.add('open'); return; }
  [0, 1].forEach(i => { const el = $('m' + i); if (el) el.textContent = fmt(before[i]); });
  setTimeout(() => { const f = $('fl'); if (f) f.classList.add('open'); }, 500);
  ok ? SFX.win() : SFX.lose();
  // عملات تطيح فوق الفريق اللي كسب
  const side = to === 0 ? [62, 96] : [0, 34];
  for (let i = 0; i < 22; i++) { const c = document.createElement('i'); c.className = 'coin'; c.style.left = (side[0] + Math.random() * (side[1] - side[0])) + '%'; c.style.animationDuration = (1.2 + Math.random() * 1.4) + 's'; c.style.animationDelay = Math.random() * .8 + 's'; tv.appendChild(c); setTimeout(() => c.remove(), 3500); }
  let k = 0; T = setInterval(() => { k++; [0, 1].forEach(i => { const el = $('m' + i); if (el) el.textContent = fmt(Math.round(before[i] + (after[i] - before[i]) * k / 30)); }); if (k >= 30) { clearInterval(T); T = null; } }, 35);
  const card = document.querySelector('.team.t' + to); if (card) { card.classList.remove('gain'); void card.offsetWidth; card.classList.add('gain'); }
}

/* ---------- الفايز ---------- */
function over(fresh) {
  const w = S.final, st = S.stats, n = t => esc(S.teams[t].name);
  app.innerHTML = `${topBar('خلصت اللعبة')}<div class="stage">
    <p class="winner">${w === null ? 'تعادل! 🤝' : `🏆 ${n(w)} فازوا!`}</p>
    <p class="say">${fmt(S.teams[0].coins)} مقابل ${fmt(S.teams[1].coins)}</p>
    <div class="stats">
      <div class="stat">أجرأ مزايدة<b>${st.boldest ? fmt(st.boldest.amount) : '—'}</b>${st.boldest ? n(st.boldest.team) + ' على ' + esc(st.boldest.cat) : ''}</div>
      <div class="stat">أكبر سرقة<b>${st.biggestSteal ? fmt(st.biggestSteal.amount) : '—'}</b>${st.biggestSteal ? n(st.biggestSteal.team) : 'ما أحد سرق'}</div>
      <div class="stat">أكبر ربح<b>${st.biggestWin ? fmt(st.biggestWin.amount) : '—'}</b>${st.biggestWin ? n(st.biggestWin.team) : ''}</div>
    </div>
    <div class="host"><button class="hb go" id="again">لعبة جديدة</button></div></div>`;
  $('again').onclick = () => { setup = { step: 'cats', cats: setup.cats }; dispatch({ type: 'reset' }); render(); };
  if (fresh) { tune([523, 523, 659, 784, 659, 784, 1046], .12); for (let i = 0; i < 40; i++) { const c = document.createElement('i'); c.className = 'coin'; c.style.left = Math.random() * 96 + '%'; c.style.animationDuration = (1.4 + Math.random() * 1.6) + 's'; c.style.animationDelay = Math.random() * 1.2 + 's'; tv.appendChild(c); setTimeout(() => c.remove(), 4500); } }
}

/* ---------- التشغيل ---------- */
$('snd').onclick = e => { sound = !sound; e.target.textContent = sound ? '🔊' : '🔇'; };
let menuArmed = null;
$('menu').onclick = e => {
  if (!menuArmed) { e.target.textContent = 'متأكد؟ اضغط مرة ثانية'; menuArmed = setTimeout(() => { menuArmed = null; e.target.textContent = 'القائمة'; }, 3000); return; }
  clearTimeout(menuArmed); menuArmed = null; e.target.textContent = 'القائمة';
  stop(); setup = { step: 'home', cats: [] }; S = Trial.create(); P = {}; save(); send(); lastKey = ''; render();
};

(async () => {
  if (!Auth.available()) { app.innerHTML = '<div class="stage"><p class="big">المتصفح قديم</p><p class="say">افتح اللعبة من كروم أو سفاري حديث</p></div>'; return; }
  const d = load();
  if (d) { S = d.S; P = d.P || {}; ROOM = d.ROOM; setup = d.setup || setup; } else { S = Trial.create(); ROOM = code(); }
  try { net = await Net.open(ROOM, onMsg, st => { if (st === 'up') send(); }); } catch (e) { net = null; }
  // لو الشاشة انطفت وقت السؤال وخلص الوقت، نكشف الجواب
  if (S.phase === 'question' && !S.revealed && S.deadline && Date.now() > S.deadline) { const r = Trial.reduce(S, { type: 'reveal' }); if (r.ok) S = r.state; }
  save(); render(); send();
  setInterval(send, 3000);
})();
