// شاشة التلفزيون: تشغّل المحرّك، وتحفظ اللعبة، وتتحقق من توقيع كل جوال.
const app = document.getElementById('app');
const $ = id => document.getElementById(id);
const COLS = ['var(--yellow)', 'var(--blue)', 'var(--red)', 'var(--green)'], LET = ['A', 'B', 'C', 'D'];
const SAVE_KEY = 'mazad-host', SAVE_MAX_AGE = 6 * 3600 * 1000;

let S = null;          // حالة المحرّك
let P = {};            // اللاعبين: id -> { name, team, pub, seq }
let ROOM = null, net = null;
const KICKED = new Set();  // اللي طلّعهم المضيف ما يرجعون لنفس الغرفة
let T = null, auto = null;
let shownRound = 0;    // آخر جولة انعرضت فيها حركة الفئة
let shownReveal = 0;   // آخر جولة انعرض فيها العد التنازلي
const stopTimers = () => { clearInterval(T); T = null; clearTimeout(auto); auto = null; };

document.getElementById('snd').onclick = e => { sound = !sound; e.target.textContent = 'SOUND: ' + (sound ? 'ON' : 'OFF'); SFX.tap(); };
const quitBtn = document.getElementById('quit');
let quitArmed = null;
quitBtn.onclick = () => {
  if (!S || S.phase === 'lobby') return;
  if (!quitArmed) { quitBtn.textContent = 'متأكد؟ اضغط مرة ثانية'; quitArmed = setTimeout(() => { quitArmed = null; quitBtn.textContent = 'MENU'; }, 3000); return; }
  clearTimeout(quitArmed); quitArmed = null; quitBtn.textContent = 'MENU';
  dispatch({ type: 'reset' });
};

/* ---------- الحفظ والاسترجاع ---------- */
function save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify({ room: ROOM, S, P, at: Date.now() })); } catch (e) {} }
function load() {
  try { const d = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (d && d.room && d.S && Date.now() - d.at < SAVE_MAX_AGE) return d; } catch (e) {}
  return null;
}
function newCode() { const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', r = new Uint32Array(5); crypto.getRandomValues(r); return Array.from(r, n => a[n % a.length]).join(''); }

/* ---------- الإرسال ---------- */
function teamsPlayers() { return S.teams.map((_, i) => Object.values(P).filter(p => p.team === i).map(p => p.name)); }
function send() {
  if (!net || !S) return;
  const v = Engine.publicView(S);
  v.t = 'state'; v.room = ROOM; v.players = teamsPlayers();
  if (S.phase === 'question' && S.deadline) v.left = Math.max(0, Math.ceil((S.deadline - Date.now()) / 1000));
  net.send(v);
}

/* ---------- المحرّك ---------- */
function dispatch(action, opts) {
  const prev = S;
  const r = Engine.reduce(S, action);
  if (!r.ok) return false;
  S = r.state; save(); send();
  render(prev, opts || {});
  return true;
}

/* ---------- رسائل الجوالات ---------- */
async function onMsg(m) {
  if (!S || !m || typeof m !== 'object' || m.room !== ROOM) { if (m && m.t === 'hello') send(); return; }
  try {
    if (m.t === 'hello') return send();
    if (m.t === 'join') return await onJoin(m);
    if (m.t === 'act') return await onAct(m);
  } catch (e) { console.warn('رسالة مرفوضة', e); }
}
async function onJoin(m) {
  if (typeof m.id !== 'string' || !m.pub || typeof m.sig !== 'string') return;
  if (await Auth.idFromPub(m.pub) !== m.id) return;
  if (!await Auth.verify(m.pub, Auth.joinParts(m), m.sig)) return;
  const known = P[m.id];
  if (KICKED.has(m.id)) { net.send({ t: 'denied', room: ROOM, id: m.id, why: 'المضيف طلّعك من الغرفة.' }); return; }
  if (S.phase === 'lobby') {
    if (!(m.team >= 0 && m.team < S.teams.length)) return;
    // لو المضيف نقله، فريقه يبقى اللي اختاره المضيف
    P[m.id] = { name: String(m.name || 'لاعب').trim().slice(0, 14) || 'لاعب', team: known && known.movedBy ? known.team : m.team, pub: m.pub, seq: known ? known.seq : 0, movedBy: known ? known.movedBy : false };
    save(); lobbyRoster();
  } else if (!known) {
    net.send({ t: 'denied', room: ROOM, id: m.id, why: 'اللعبة بدأت. انتظروا اللعبة الجاية.' });
    return;
  }
  send();
}
async function onAct(m) {
  const p = P[m.id];
  if (!p || !Number.isFinite(m.seq) || m.seq <= p.seq || !m.body || typeof m.sig !== 'string') return;
  if (!await Auth.verify(p.pub, Auth.actParts(m), m.sig)) return;
  p.seq = m.seq; save();
  const b = m.body;
  if (b.type === 'bid' && S.phase === 'bet') {
    if (S.bids[p.team] === null) dispatch({ type: 'bid', team: p.team, amount: b.amount, allin: !!b.allin });
  } else if (b.type === 'answer' && S.phase === 'question' && p.team === S.answering) {
    answer(Number.isInteger(b.k) ? b.k : -1, p.name);
  } else if (b.type === 'steal' && S.phase === 'stealOffer' && p.team === 1 - S.answering) {
    dispatch({ type: 'steal', yes: !!b.yes, now: Date.now() });
  } else send();
}

/* ---------- الشريط العلوي ---------- */
function header(active, coins) {
  const c = coins || S.teams.map(t => t.coins);
  const t = i => { const tm = S.teams[i], n = Object.values(P).filter(p => p.team === i).length;
    return `<div class="team ${i ? 'b' : 'a'} ${active !== undefined && active !== null && active !== i ? 'dim' : ''}"><small>${esc(tm.name)}</small><b>${c[i]}</b><span class="tag">${tm.allinUsed ? '' : 'ALL-IN ×1'} ${n ? '📱' + n : ''}</span></div>`; };
  return `<div class="bar">${t(0)}<div class="rd">ROUND ${S.round}/${S.config.rounds}</div>${t(1)}</div>`;
}

/* ---------- العرض حسب المرحلة ---------- */
function render(prev, opts) {
  stopTimers();
  switch (S.phase) {
    case 'lobby': return lobby();
    case 'bet': return S.round !== shownRound && !opts.restore ? roll() : betPhase();
    case 'reveal': return shownReveal !== S.round && !opts.restore ? countdown() : reveal();
    case 'question': return question();
    case 'stealOffer': case 'result': return result(prev, opts);
    case 'over': return over(opts);
  }
}

function lobby() {
  const url = new URL('play.html?room=' + ROOM, location.href).href;
  app.innerHTML = `<div class="stage">
    <h1 class="cat logo">أجل كم</h1>
    <div class="lobby">
      <div class="qr" id="qr"></div>
      <div style="display:flex;flex-direction:column;gap:10px;text-align:start">
        <p class="k">صوّروا الكود بالجوال، أو افتحوا الرابط واكتبوا الرمز</p>
        <p class="code">${ROOM}</p>
        <p class="url">${esc(url)}</p>
      </div>
    </div>
    <div class="roster" id="roster"></div>
    <p class="mute">الفريق اللي ما عنده جوال يقدر يراهن ويجاوب من هالشاشة. اضغط ⇄ تنقل لاعب، أو ✕ تطلّعه.</p>
    <div class="catpick" id="cats"></div>
    <div class="row"><button class="px g" id="go">ابدأ اللعبة</button><button class="px d mini" id="newroom">غرفة جديدة</button></div></div>`;
  try { new QRCode($('qr'), { text: url, width: 160, height: 160, correctLevel: QRCode.CorrectLevel.M }); } catch (e) { $('qr').textContent = ROOM; }
  lobbyRoster(); catPicker();
  $('go').onclick = () => { SFX.win(); if (!dispatch({ type: 'start', bank: BANK, seed: crypto.getRandomValues(new Uint32Array(1))[0] })) { const n = $('catnote'); if (n) n.textContent = 'اختاروا ' + Engine.MIN_CATS + ' فئات على الأقل'; } };
  $('newroom').onclick = () => { P = {}; switchRoom(newCode()); };
}
function lobbyRoster() {
  const r = $('roster'); if (!r) return;
  r.innerHTML = S.teams.map((t, i) => `<div class="box ${i ? 'b' : 'a'}">
    <input class="tname" data-t="${i}" value="${esc(t.name)}" maxlength="14" aria-label="اسم الفريق ${i + 1}">
    <div class="pchips">${Object.entries(P).filter(([, p]) => p.team === i).map(([id, p]) => `<span class="pchip">${esc(p.name)}<button data-mv="${id}" aria-label="انقل ${esc(p.name)} للفريق الثاني">⇄</button><button data-rm="${id}" aria-label="طلّع ${esc(p.name)}">✕</button></span>`).join('') || '<p>ما أحد دخل للحين</p>'}</div></div>`).join('');
  r.onclick = e => {
    const mv = e.target.dataset.mv, rm = e.target.dataset.rm;
    if (mv && P[mv]) { P[mv].team = 1 - P[mv].team; P[mv].movedBy = true; net.send({ t: 'moved', room: ROOM, id: mv, team: P[mv].team }); }
    else if (rm && P[rm]) { delete P[rm]; KICKED.add(rm); net.send({ t: 'denied', room: ROOM, id: rm, why: 'المضيف طلّعك من الغرفة.' }); }
    else return;
    SFX.tap(); save(); lobbyRoster(); send();
  };
  r.querySelectorAll('.tname').forEach(inp => inp.onchange = () => { const r2 = Engine.reduce(S, { type: 'rename', team: +inp.dataset.t, name: inp.value }); if (r2.ok) { S = r2.state; save(); send(); } });
}

// اختيار الفئات: الافتراضي كلها، وأقل شي 3
function catPicker() {
  const box = $('cats'); if (!box) return;
  const all = Object.keys(BANK), on = new Set(S.cats || all);
  box.innerHTML = `<p class="k">الفئات <span class="hostnote" id="catnote">${on.size} من ${all.length}</span></p>
    <div class="catgrid">${all.map(c => `<button class="catbtn ${on.has(c) ? 'on' : ''}" data-c="${esc(c)}" aria-pressed="${on.has(c)}">${esc(c)} <small>${BANK[c].length}</small></button>`).join('')}</div>
    <div class="row"><button class="px d mini" id="callall">الكل</button></div>`;
  box.onclick = e => {
    const b = e.target.closest('.catbtn'); let next;
    if (b) { const c = b.dataset.c; next = new Set(on); next.has(c) ? next.delete(c) : next.add(c); }
    else if (e.target.id === 'callall') next = new Set(all);
    else return;
    if (next.size < Engine.MIN_CATS) { $('catnote').textContent = 'أقل شي ' + Engine.MIN_CATS + ' فئات'; return; }
    const r = Engine.reduce(S, { type: 'setCats', cats: next.size === all.length ? null : [...next] });
    if (r.ok) { S = r.state; save(); SFX.tap(); catPicker(); }
  };
}

function roll() {
  shownRound = S.round;
  const rescued = S.rescued.map(i => esc(S.teams[i].name));
  app.innerHTML = `${header()}<div class="stage"><p class="k">الفئة الجاية</p><p class="cat roll" id="cat">؟</p>
    ${rescued.length ? `<p class="mute">${rescued.join(' و ')} أفلسوا، وعطيناهم ${S.config.rescue} عملة يكملون فيها.</p>` : ''}</div>`;
  const el = $('cat'), cats = Object.keys(BANK); let n = 0;
  T = setInterval(() => {
    el.textContent = cats[n++ % cats.length]; beep(300 + (n % 5) * 80, .04, 'square', .03);
    if (n >= 14) { clearInterval(T); T = null; el.textContent = S.cur.cat; el.classList.remove('roll'); el.classList.add('land'); SFX.reveal(); auto = setTimeout(S.round === 1 ? howto : betPhase, 900); }
  }, 90);
}

// شرح سريع قبل أول جولة: يمشي لحاله بعد 6 ثواني، أو اضغط مطولاً للتخطي
function howto() {
  const AUTO = 6, HOLD_MS = 900;
  app.innerHTML = `${header()}<div class="stage"><div class="howto">
    <h2>كيف تلعبون؟</h2>
    <div class="steps">
      <div class="step" style="--c:var(--blue)"><b>1</b>تطلع الفئة بس، بدون السؤال</div>
      <div class="step" style="--c:var(--yellow)"><b>2</b>كل فريق يراهن بالسر من جواله</div>
      <div class="step" style="--c:var(--pink)"><b>3</b>الأعلى يجاوب: صح يكسب، وغلط يخسر والخصم يسرق</div>
    </div>
    <div class="skip" id="skip" role="button" tabindex="0" aria-label="اضغط مطولاً للتخطي">HOLD TO SKIP<span class="hold" id="hold" style="--p:0%"><i></i></span><span class="auto" id="auto">AUTO ${AUTO}</span></div>
  </div></div>`;
  let left = AUTO, held = null, raf = null;
  const go = () => { stopTimers(); cancelAnimationFrame(raf); if (S.phase === 'bet') betPhase(); };
  T = setInterval(() => { left--; const a = $('auto'); if (a) a.textContent = 'AUTO ' + left; if (left <= 0) go(); }, 1000);
  const fill = () => { const p = Math.min(1, (performance.now() - held) / HOLD_MS); $('hold').style.setProperty('--p', p * 100 + '%'); if (p >= 1) return go(); raf = requestAnimationFrame(fill); };
  const down = e => { e.preventDefault(); held = performance.now(); fill(); };
  const up = () => { cancelAnimationFrame(raf); held = null; const h = $('hold'); if (h) h.style.setProperty('--p', '0%'); };
  const sk = $('skip');
  sk.addEventListener('pointerdown', down); sk.addEventListener('pointerup', up); sk.addEventListener('pointerleave', up);
  sk.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') go(); });
}

// الشاشة ما تتحكم إلا بالفريق اللي ما عنده جوال
const phonesOf = i => Object.values(P).filter(p => p.team === i).length;
const BET_S = 30, DECIDE_S = 10;
let betEnds = 0, betRound = 0;

function betPhase() {
  shownRound = S.round;
  // مؤقت جديد لكل جولة، ونفس المؤقت لو انرسمت الشاشة من جديد في نفس الجولة
  if (betRound !== S.round || !betEnds) { betRound = S.round; betEnds = Date.now() + BET_S * 1000; }
  const box = i => { const t = S.teams[i], done = S.bids[i] !== null, phones = phonesOf(i);
    return `<div class="box ${i ? 'b' : 'a'}"><b>${esc(t.name)}</b><span class="st ${done ? '' : 'blink'}">${done ? 'BET ✓' : 'WAITING…'}</span>
      ${done ? '' : phones ? `<span class="hostnote">📱 من الجوال</span>` : `<button class="px d mini" data-t="${i}">راهن هنا</button>`}</div>`; };
  app.innerHTML = `${header()}<div class="stage"><p class="k">الفئة</p><p class="cat">${esc(S.cur.cat)}</p>
    <p class="k">راهنوا من جوالاتكم بالسر</p><div class="wait2" id="w2">${box(0)}${box(1)}</div>
    <div class="tm" id="btm"><b id="bsec"></b></div><p class="hostnote">اللي ما يراهن قبل نهاية الوقت يراهن بأقل مبلغ</p></div>`;
  $('w2').onclick = e => { const b = e.target.closest('button[data-t]'); if (b) screenBet(+b.dataset.t); };
  const tick = () => {
    const left = Math.max(0, Math.ceil((betEnds - Date.now()) / 1000));
    const s = $('bsec'); if (s) { s.textContent = left; $('btm').classList.toggle('low', left <= 5); }
    if (left <= 0) {
      clearInterval(T); T = null; betEnds = 0;
      for (let i = 0; i < S.teams.length && S.phase === 'bet'; i++) if (S.bids[i] === null) dispatch({ type: 'bid', team: i, amount: S.config.minBet });
    }
  };
  tick(); T = setInterval(tick, 250);
}

function screenBet(i) {
  const t = S.teams[i], other = S.teams[1 - i], min = Math.min(S.config.minBet, t.coins);
  let v = Math.min(Math.max(S.config.minBet, Math.round(t.coins * .2 / 50) * 50), t.coins), all = false;
  app.innerHTML = `${header(i)}<div class="stage">
    <p class="k">${esc(t.name)} يراهنون · ${esc(other.name)} لا يطالعون 🙈</p>
    <div class="betbox"><p class="amount" id="amt"></p><div class="meter" id="mt"></div>
      <div class="chips"><button data-d="-100">−100</button><button data-d="-50">−50</button><button data-d="50">+50</button><button data-d="100">+100</button></div>
      <div class="row"><button class="px r" id="all" ${t.allinUsed ? 'disabled' : ''}>كل شي أو لا شي</button><button class="px g" id="ok">راهن</button></div></div>
    <button class="px d mini" id="back">رجوع</button></div>`;
  const draw = () => { $('amt').textContent = all ? `ALL ${t.coins}` : v;
    const f = Math.round((all ? 1 : v / Math.max(t.coins, 1)) * 10);
    $('mt').innerHTML = Array.from({ length: 10 }, (_, k) => `<i class="${k < f ? '' : 'off'}"></i>`).join('');
    $('all').textContent = all ? 'إلغاء كل شي' : 'كل شي أو لا شي'; };
  draw();
  app.querySelector('.chips').onclick = e => { const d = +e.target.dataset.d; if (!d || all) return; v = Math.min(t.coins, Math.max(min, v + d)); SFX.tap(); draw(); };
  $('all').onclick = () => { all = !all; SFX.tap(); draw(); };
  $('back').onclick = betPhase;
  $('ok').onclick = () => { SFX.tap(); if (S.phase === 'bet' && S.bids[i] === null) dispatch({ type: 'bid', team: i, amount: v, allin: all }); else betPhase(); };
}

function countdown() {
  shownReveal = S.round;
  let c = 3;
  const show = () => { app.innerHTML = `${header()}<div class="stage"><p class="k">الرهانات تنكشف بعد</p><p class="count">${c}</p></div>`; beep(440, .12); };
  show();
  T = setInterval(() => { c--; if (c > 0) show(); else { clearInterval(T); T = null; reveal(); } }, 800);
}
function reveal() {
  shownReveal = S.round;
  const w = S.winner;
  const pad = i => `<div class="paddle ${i === w ? 'win' : 'lose'}"><div class="p ${i ? 'b' : 'a'}">${S.allin[i] ? 'ALL' : S.bids[i]}</div><div class="s"></div><em>${esc(S.teams[i].name)}</em></div>`;
  app.innerHTML = `${header()}<div class="stage"><div class="paddles">${pad(0)}${pad(1)}</div>
    <p class="k">${S.tie ? 'تعادل! القرعة اختارت ' : ''}🔨 بيع على ${esc(S.teams[w].name)}!</p>
    <button class="px g" id="q">اعرض السؤال</button></div>`;
  SFX.win();
  const go = () => { if (S.phase === 'reveal') dispatch({ type: 'toQuestion', now: Date.now() }); };
  auto = setTimeout(go, 3500);
  $('q').onclick = go;
}

function question() {
  const t = S.teams[S.answering], total = S.steal ? S.config.stealS : S.config.answerS;
  app.innerHTML = `${header(S.answering)}<div class="stage">
    ${S.steal ? `<p class="steal">فرصة سرقة! ${esc(t.name)}</p>` : `<p class="k">${esc(t.name)} يجاوبون</p>`}
    <p class="q">${esc(S.cur.q)}</p>
    <div class="opts" id="ops">${S.cur.opts.map((o, k) => `<button class="opt ${k === S.gone ? 'gone' : ''}" data-k="${k}" ${k === S.gone ? 'disabled' : ''} style="background:${COLS[k]};${k === 1 || k === 2 ? 'color:var(--ink)' : ''}"><i>${LET[k]}</i>${esc(o)}</button>`).join('')}</div>
    <div class="row" style="align-items:center"><div class="tm"><b id="sec"></b><div class="bars" id="bars"></div></div>
    <p class="stake">${S.steal ? `STEAL: +${S.stake}` : `WIN: +${S.stake} · LOSE: −${S.stake}`}</p></div>
    ${phonesOf(S.answering) ? '<p class="hostnote">📱 جاوبوا من جوالكم</p>' : ''}</div>`;
  let lastLeft = null;
  const tick = () => {
    const left = Math.max(0, Math.ceil((S.deadline - Date.now()) / 1000));
    if (left !== lastLeft) {
      lastLeft = left;
      const on = Math.ceil(left / total * 10);
      $('bars').innerHTML = Array.from({ length: 10 }, (_, k) => `<i class="${k < on ? '' : 'off'}"></i>`).join('');
      const s = $('sec'); s.textContent = left; s.parentElement.classList.toggle('low', left <= 3);
      if (left <= 3 && left > 0) SFX.tick();
      send();
    }
    if (left <= 0) { clearInterval(T); T = null; answer(-1); }
  };
  tick(); T = setInterval(tick, 250);
  // الشاشة تجاوب بس عن الفريق اللي ما عنده جوال
  $('ops').onclick = e => { if (phonesOf(S.answering)) return; const b = e.target.closest('.opt'); if (b && !b.disabled) answer(+b.dataset.k, 'الشاشة'); };
  if (phonesOf(S.answering)) $('ops').style.cursor = 'default';
}
let answering = false;
function answer(k, by) {
  if (S.phase !== 'question' || answering) return;
  answering = true; stopTimers();
  const at = Date.now(), right = S.cur.a;
  const willSteal = k !== right && !S.steal;
  document.querySelectorAll('.opt').forEach((b, j) => {
    b.disabled = true;
    if (j === right && !willSteal) b.classList.add('right'); else if (j === k) b.classList.add('wrong');
    if (j === k && by) b.insertAdjacentHTML('beforeend', `<span class="picks"><span>${esc(by)}</span></span>`);
  });
  setTimeout(() => { answering = false; dispatch({ type: 'answer', k, by: by || null, at }); }, 1100);
}

function countUp(i, from, to) {
  const el = app.querySelectorAll('.bar .team b')[i]; if (!el || from === to) return;
  const steps = 18; let k = 0; el.textContent = from; el.classList.add('pop');
  const id = setInterval(() => { k++; el.textContent = Math.round(from + (to - from) * k / steps); if (k % 3 === 0) beep(700 + k * 20, .03, 'square', .025); if (k >= steps) clearInterval(id); }, 45);
}
function burst() {
  const cols = ['var(--yellow)', 'var(--green)', 'var(--blue)', 'var(--red)', 'var(--purple)'];
  for (let i = 0; i < 40; i++) { const p = document.createElement('i'); p.className = 'pix'; p.style.left = Math.random() * 100 + '%'; p.style.top = (-10 - Math.random() * 30) + '%';
    p.style.background = cols[i % cols.length]; p.style.animationDuration = (1.4 + Math.random() * 1.6) + 's'; p.style.boxShadow = '3px 3px 0 #000'; app.appendChild(p); setTimeout(() => p.remove(), 3200); }
}
function fx(cls) { app.classList.remove('shake', 'flash'); void app.offsetWidth; app.classList.add(cls); }

function result(prev, opts) {
  const L = S.last, t = S.teams[L.team], o = S.teams[1 - L.team];
  const canSteal = S.phase === 'stealOffer', stealPhones = canSteal && phonesOf(1 - L.team) > 0;
  const amount = L.delta > 0 ? '+' + L.delta : L.delta < 0 ? '−' + (-L.delta) : '0';
  const color = L.delta > 0 ? 'var(--green)' : L.delta < 0 ? 'var(--red)' : 'var(--mute)';
  const line = L.ok ? (L.steal ? `${esc(t.name)} سرقوها!` : `صح! ${esc(t.name)} كسبوا`)
    : L.steal ? `ولا ${esc(t.name)} عرفوها` : L.timeout ? `خلص الوقت! ${esc(t.name)} خسروا` : `غلط! ${esc(t.name)} خسروا`;
  const startCoins = S.teams.map(x => x.coins); startCoins[L.team] -= L.delta;
  // بطاقة لكل محاولة في الجولة، والأسرع اللي جاوب صح هو MVP
  const tries = S.attempts || [];
  const fastest = tries.filter(x => x.ok && x.ms !== null).sort((a, b) => a.ms - b.ms)[0];
  const cards = tries.map((x, i) => `<div class="pl ${x.ok ? '' : 'bad'}" style="animation-delay:${.3 + i * .35}s">
      <small>${esc(x.by || S.teams[x.team].name)} ${x === fastest ? '<span class="mvp">MVP</span>' : ''}</small>
      <b>${x.ok ? '✔' : '✘'} ${x.picked >= 0 ? LET[x.picked] : 'TIME'} · ${x.delta > 0 ? '+' + x.delta : x.delta}</b>
      <em>${x.ms !== null ? '⏱ ' + (x.ms / 1000).toFixed(1) + 's' : ''}${x.steal ? ' · STEAL' : ''}</em></div>`).join('');
  const pad = n => String(n).padStart(4, '0');
  app.innerHTML = `${header(null, opts.restore ? null : startCoins)}<div class="stage">
    <p class="big" style="color:${color}">${amount}</p><p class="k">${line}</p>
    ${cards ? `<div class="res">${cards}</div>` : ''}
    ${L.delta ? `<div class="tally"><span class="from">${pad(startCoins[L.team])}</span><span class="arrow">▶</span><span class="to" id="tallyTo">${pad(opts.restore ? t.coins : startCoins[L.team])}</span></div>` : ''}
    ${!canSteal ? `<p class="mute">الجواب: <b style="color:var(--ink)">${esc(L.answer)}</b></p>` : `<p class="k">${esc(o.name)}، تبون تسرقون السؤال؟ ${stealPhones ? 'قرروا من جوالكم' : ''}</p>`}
    <div class="row">${canSteal ? (stealPhones ? '' : `<button class="px r" id="st">${esc(o.name)} يسرقون</button><button class="px d" id="skip">لا، التالي</button>`) : `<button class="px g" id="nx">${S.round >= S.config.rounds ? 'النتيجة النهائية' : 'السؤال الجاي'}</button>`}</div>
    ${canSteal ? `<div class="tm" id="dtm"><b id="dsec">${DECIDE_S}</b></div><p class="hostnote">لو ما قرروا، نكمّل بدون سرقة</p>` : ''}</div>`;
  if (!opts.restore) {
    countUp(L.team, startCoins[L.team], t.coins);
    const to = $('tallyTo');
    if (to) { const from = startCoins[L.team], steps = 20; let k = 0; const id = setInterval(() => { k++; to.textContent = pad(Math.round(from + (t.coins - from) * k / steps)); if (k >= steps) clearInterval(id); }, 50); }
    if (L.ok) { fx('flash'); SFX.win(); if (L.delta >= 400) burst(); } else { fx('shake'); SFX.lose(); }
  }
  if (canSteal) {
    if (!stealPhones) { $('st').onclick = () => dispatch({ type: 'steal', yes: true, now: Date.now() }); $('skip').onclick = () => dispatch({ type: 'steal', yes: false }); }
    // مهلة القرار: بعدها نكمّل بدون سرقة
    const ends = Date.now() + DECIDE_S * 1000;
    T = setInterval(() => {
      const left = Math.max(0, Math.ceil((ends - Date.now()) / 1000)), s = $('dsec');
      if (s) { s.textContent = left; $('dtm').classList.toggle('low', left <= 3); }
      if (left <= 0) { clearInterval(T); T = null; if (S.phase === 'stealOffer') dispatch({ type: 'steal', yes: false }); }
    }, 250);
  }
  else $('nx').onclick = () => dispatch({ type: 'next' });
}

function over(opts) {
  const w = S.final;
  app.innerHTML = `<div class="stage"><p class="k blink">GAME OVER</p>
    <p class="cat">${w === null ? 'تعادل!' : `${esc(S.teams[w].name)} فازوا!`}</p>
    <div class="final">${S.teams.map((t, i) => `<div class="team ${i ? 'b' : 'a'}"><small>${esc(t.name)}</small><b>${t.coins}</b></div>`).join('')}</div>
    <div class="row"><button class="px g" id="again">لعبة جديدة بنفس اللاعبين</button></div></div>`;
  if (!opts.restore) { tune([523, 523, 659, 784, 659, 784, 1046], .12); burst(); setTimeout(burst, 900); }
  $('again').onclick = () => dispatch({ type: 'reset' });
}

/* ---------- التشغيل ---------- */
async function switchRoom(room) {
  ROOM = room;
  try { net = await Net.open(ROOM, onMsg, st => { $('mode').textContent = (net && net.mode === 'online' ? 'ONLINE' : 'LOCAL TEST') + (st === 'down' ? ' · RECONNECTING' : ''); if (st === 'up') send(); }); }
  catch (e) { app.innerHTML = `<div class="stage"><p class="k">ما قدرنا نتصل بالسيرفر.</p><p class="mute">تأكد من الإنترنت وحدّث الصفحة.</p></div>`; return false; }
  $('mode').textContent = net.mode === 'online' ? 'ONLINE' : 'LOCAL TEST';
  save(); render(null, {}); send();
  return true;
}

async function boot() {
  if (!Auth.available()) { app.innerHTML = `<div class="stage"><p class="k">المتصفح هذا قديم.</p><p class="mute">افتح اللعبة من كروم أو سفاري حديث.</p></div>`; return; }
  const saved = load();
  if (saved) {
    S = saved.S; P = saved.P || {}; ROOM = saved.room;
    shownRound = S.round; shownReveal = S.round;
    try { net = await Net.open(ROOM, onMsg, st => { $('mode').textContent = (net && net.mode === 'online' ? 'ONLINE' : 'LOCAL TEST') + (st === 'down' ? ' · RECONNECTING' : ''); if (st === 'up') send(); }); }
    catch (e) { app.innerHTML = `<div class="stage"><p class="k">ما قدرنا نتصل بالسيرفر.</p><p class="mute">تأكد من الإنترنت وحدّث الصفحة.</p></div>`; return; }
    $('mode').textContent = net.mode === 'online' ? 'ONLINE' : 'LOCAL TEST';
    // لو الوقت خلص والشاشة مطفية، ينحسب غلط
    if (S.phase === 'question' && S.deadline && Date.now() > S.deadline) { const r = Engine.reduce(S, { type: 'answer', k: -1 }); if (r.ok) S = r.state; save(); }
    render(null, { restore: true }); send();
    return;
  }
  S = Engine.create();
  await switchRoom(newCode());
}

// كل 3 ثواني ترسل الوضع للجوالات اللي دخلت متأخر أو انقطع نتها
setInterval(() => { if (S && S.phase !== 'question') send(); }, 3000);
boot();
