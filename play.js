// جوال اللاعب: يدخل الغرفة، ويختار فريقه، ويراهن ويجاوب.
// كل طلب ينوقّع بمفتاح الجوال، ولو انقطع النت أو قفل الجوال يرجع لفريقه تلقائياً.
const app = document.getElementById('app');
const $ = id => document.getElementById(id);
const COLS = ['var(--yellow)', 'var(--blue)', 'var(--red)', 'var(--green)'], LET = ['أ', 'ب', 'ج', 'د'];
document.getElementById('snd').onclick = e => { sound = !sound; e.target.textContent = 'SOUND: ' + (sound ? 'ON' : 'OFF'); };

const local = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
const tab = { get(k) { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { sessionStorage.setItem(k, v); } catch (e) {} }, del(k) { try { sessionStorage.removeItem(k); } catch (e) {} } };

let ID = null, sign = null;     // هوية الجوال (لكل تبويب)
let ME = { room: null, name: local.get('mazad-name') || '', team: null };
let net = null, S = null, lastKey = '', draft = null, sentFor = '', joined = false, gotState = null;
let seq = Date.now();

async function identity() {
  try { const saved = JSON.parse(tab.get('mazad-identity') || 'null'); if (saved && saved.id && saved.priv) return saved; } catch (e) {}
  const id = await Auth.createIdentity(); tab.set('mazad-identity', JSON.stringify(id)); return id;
}

async function sendJoin() {
  if (!net) return;
  const m = { t: 'join', room: ME.room, id: ID.id, name: ME.name, team: ME.team, pub: ID.pub };
  m.sig = await sign(Auth.joinParts(m));
  net.send(m);
}
async function act(body) {
  if (!net) return;
  seq = Math.max(seq + 1, Date.now());
  const m = { t: 'act', room: ME.room, id: ID.id, seq, body };
  m.sig = await sign(Auth.actParts(m));
  net.send(m);
}

/* ---------- شاشة الدخول ---------- */
function joinScreen(err) {
  const room = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  let team = ME.team;
  app.innerHTML = `<div class="stage" style="gap:16px">
    <h1 class="cat" style="font-size:3.4rem">أجل كم</h1>
    <label class="field"><span>ROOM CODE</span><input id="code" maxlength="5" value="${esc(room)}" autocomplete="off" autocapitalize="characters" placeholder="K7Q2X"></label>
    <label class="field"><span>اسمك</span><input id="nm" maxlength="14" value="${esc(ME.name)}" autocomplete="off" placeholder="مثلاً: فهد"></label>
    <div class="pick" id="pk"><button class="a" data-t="0">الفريق ١</button><button class="b" data-t="1">الفريق ٢</button></div>
    <p class="err" id="er">${esc(err || '')}</p>
    <button class="px g" id="go">دخول</button></div>`;
  const mark = () => document.querySelectorAll('#pk button').forEach(b => b.classList.toggle('sel', +b.dataset.t === team));
  mark();
  $('pk').onclick = e => { const b = e.target.closest('button'); if (b) { team = +b.dataset.t; SFX.tap(); mark(); } };
  $('go').onclick = async () => {
    const code = $('code').value.trim().toUpperCase(), name = $('nm').value.trim();
    if (!/^[A-Z0-9]{4,5}$/.test(code)) return $('er').textContent = 'اكتب رمز الغرفة اللي على الشاشة.';
    if (!name) return $('er').textContent = 'اكتب اسمك.';
    if (team === null) return $('er').textContent = 'اختر فريقك.';
    ME = { room: code, name: name.slice(0, 14), team };
    local.set('mazad-name', ME.name);
    $('go').disabled = true; $('er').textContent = 'جاري الاتصال…';
    if (!await connect()) { $('go').disabled = false; $('er').textContent = 'ما قدرنا نتصل. تأكد من الإنترنت وجرّب مرة ثانية.'; }
  };
}

async function connect() {
  try {
    net = await Net.open(ME.room, onMsg, st => {
      $('mode').textContent = (net && net.mode === 'online' ? 'ONLINE' : 'LOCAL TEST') + (st === 'down' ? ' · RECONNECTING' : '');
      if (st === 'up') { sendJoin(); net && net.send({ t: 'hello', room: ME.room }); }
    });
  } catch (e) { return false; }
  $('mode').textContent = net.mode === 'online' ? 'ONLINE' : 'LOCAL TEST';
  tab.set('mazad-seat', JSON.stringify(ME));
  history.replaceState(null, '', '?room=' + ME.room);
  await sendJoin();
  waiting('ننتظر الشاشة…');
  clearTimeout(gotState);
  gotState = setTimeout(() => { if (!S) waiting('ما وصلنا رد من الشاشة. تأكد إن الرمز صح وإن الشاشة مفتوحة.', true); }, 7000);
  return true;
}

function leave() { tab.del('mazad-seat'); location.href = 'play.html'; }
function waiting(msg, withLeave) {
  app.innerHTML = `${bar()}<div class="stage"><p class="k blink">${esc(msg)}</p>${withLeave ? '<button class="px d mini" id="lv">ارجع</button>' : ''}</div>`;
  if (withLeave) $('lv').onclick = leave;
}
function bar() {
  if (!S) return '';
  const t = S.teams[ME.team];
  return `<div class="me"><div class="team ${ME.team ? 'b' : 'a'}"><small>${esc(t.name)} · ${esc(ME.name)}</small><b>${t.coins}</b></div><div class="rd">${S.round ? `ROUND ${S.round}/${S.rounds}` : ''}</div></div>`;
}

/* ---------- رسائل الشاشة ---------- */
function onMsg(m) {
  if (!m || m.room !== ME.room) return;
  if (m.t === 'denied' && m.id === ID.id) { tab.del('mazad-seat'); return joinScreen(m.why || 'ما قدرت تدخل.'); }
  if (m.t !== 'state') return;
  const prev = S; S = m;
  joined = (S.players[ME.team] || []).includes(ME.name);
  if (!joined && S.phase === 'lobby') sendJoin();
  const key = [S.phase, S.round, S.answering, S.steal, S.bidIn[ME.team], S.teams[ME.team].coins, S.teams[ME.team].name, joined].join('|');
  if (key === lastKey) { const s = $('left'); if (s && S.left !== undefined) s.textContent = S.left; return; }
  lastKey = key;
  if (!prev || prev.phase !== S.phase || prev.round !== S.round) { draft = null; if (S.phase !== 'question') sentFor = ''; }
  render(prev);
}

function render(prev) {
  const mine = ME.team, other = 1 - mine;
  switch (S.phase) {
    case 'lobby': return waiting(joined ? 'دخلت! انتظروا الشاشة تبدأ اللعبة.' : 'ندخلك الغرفة…');
    case 'bet': return S.bidIn[mine] ? waiting('راهنتوا ✓ ننتظر الفريق الثاني…') : betUI();
    case 'reveal': {
      const won = S.winner === mine;
      app.innerHTML = `${bar()}<div class="stage"><p class="big" style="color:${won ? 'var(--green)' : 'var(--red)'}">${won ? 'لكم!' : 'لهم'}</p>
        <p class="k">${S.tie ? 'تعادل، والقرعة اختارت ' + (won ? 'لكم' : 'لهم') : won ? 'رهانكم الأعلى، أنتم بتجاوبون' : `${esc(S.teams[other].name)} راهنوا أعلى`}</p>
        <p class="mute">طالعوا الشاشة</p></div>`;
      if (!prev || prev.phase !== 'reveal') won ? SFX.win() : SFX.lose();
      return;
    }
    case 'question': return S.answering === mine ? answerUI() : waiting(`${esc(S.teams[other].name)} يجاوبون… ادعوا يغلطون 😈`);
    case 'stealOffer': {
      if (S.answering === mine) return waiting('غلطتوا… الفريق الثاني يقرر يسرق ولا لا');
      app.innerHTML = `${bar()}<div class="stage"><p class="steal">فرصة سرقة!</p><p class="k">${esc(S.teams[other].name)} غلطوا. تبون تجاوبون وتكسبون نفس الرهان؟</p>
        <div class="row"><button class="px r" id="y">نسرق!</button><button class="px d" id="n">لا</button></div></div>`;
      $('y').onclick = () => { SFX.tap(); act({ type: 'steal', yes: true }); waiting('…'); };
      $('n').onclick = () => { SFX.tap(); act({ type: 'steal', yes: false }); waiting('…'); };
      return;
    }
    case 'result': {
      const L = S.last || {}, us = L.team === mine;
      const amount = L.delta > 0 ? '+' + L.delta : L.delta < 0 ? '−' + (-L.delta) : '0';
      app.innerHTML = `${bar()}<div class="stage"><p class="big" style="color:${us ? (L.ok ? 'var(--green)' : 'var(--red)') : 'var(--mute)'}">${us ? amount : (L.ok ? '😤' : '😏')}</p>
        <p class="k">${us ? (L.ok ? 'صح!' : 'غلط') : (L.ok ? 'الفريق الثاني جاوب صح' : 'الفريق الثاني ما عرفها')}</p>
        ${L.answer ? `<p class="mute">الجواب: <b style="color:var(--ink)">${esc(L.answer)}</b></p>` : ''}</div>`;
      return;
    }
    case 'over': {
      const w = S.final;
      app.innerHTML = `${bar()}<div class="stage"><p class="k blink">GAME OVER</p><p class="cat" style="font-size:3rem">${w === null ? 'تعادل!' : w === mine ? 'فزتوا! 🏆' : 'خسرتوا'}</p>
        <div class="final">${S.teams.map((tm, i) => `<div class="team ${i ? 'b' : 'a'}"><small>${esc(tm.name)}</small><b>${tm.coins}</b></div>`).join('')}</div></div>`;
      if (!prev || prev.phase !== 'over') w === mine ? tune([523, 659, 784, 1046], .12) : SFX.lose();
      return;
    }
  }
}

function betUI() {
  const t = S.teams[ME.team], min = Math.min(S.minBet, t.coins);
  if (!draft) draft = { v: Math.min(Math.max(S.minBet, Math.round(t.coins * .2 / 50) * 50), t.coins), all: false };
  app.innerHTML = `${bar()}<div class="stage" style="gap:14px">
    <p class="k">الفئة: <b style="color:var(--green)">${esc(S.cat)}</b></p>
    <div class="betbox"><p class="amount" id="amt"></p><div class="meter" id="mt"></div>
      <div class="chips"><button data-d="-100">−100</button><button data-d="-50">−50</button><button data-d="50">+50</button><button data-d="100">+100</button></div>
      <button class="px r" id="all" ${t.allinUsed ? 'disabled' : ''} style="width:100%">كل شي أو لا شي</button>
      <button class="px g" id="ok" style="width:100%">راهن</button></div>
    <p class="mute">الفريق الثاني ما يشوف رهانكم</p></div>`;
  const draw = () => { $('amt').textContent = draft.all ? `ALL ${t.coins}` : draft.v;
    const f = Math.round((draft.all ? 1 : draft.v / Math.max(t.coins, 1)) * 10);
    $('mt').innerHTML = Array.from({ length: 10 }, (_, k) => `<i class="${k < f ? '' : 'off'}"></i>`).join('');
    $('all').textContent = draft.all ? 'إلغاء كل شي' : 'كل شي أو لا شي'; };
  draw();
  app.querySelector('.chips').onclick = e => { const d = +e.target.dataset.d; if (!d || draft.all) return; draft.v = Math.min(t.coins, Math.max(min, draft.v + d)); SFX.tap(); draw(); };
  $('all').onclick = () => { draft.all = !draft.all; SFX.tap(); draw(); };
  $('ok').onclick = () => { SFX.tap(); act({ type: 'bid', amount: draft.all ? t.coins : draft.v, allin: draft.all }); waiting('راهنتوا ✓ ننتظر الفريق الثاني…'); };
}

function answerUI() {
  const key = S.round + ':' + S.steal;
  const done = sentFor.startsWith(key + ':');
  const picked = done ? +sentFor.split(':')[2] : null;
  app.innerHTML = `${bar()}<div class="stage" style="gap:12px">
    ${S.steal ? '<p class="steal">سرقة!</p>' : ''}
    <p class="k">طالعوا السؤال على الشاشة · <b id="left">${S.left !== undefined ? S.left : ''}</b> ثانية</p>
    <div class="abcd" id="ab">${S.opts.map((o, k) => `<button data-k="${k}" ${k === S.gone || done ? 'disabled' : ''} class="${picked === k ? 'chosen' : ''}" style="background:${COLS[k]};${k === 1 || k === 2 ? 'color:var(--ink)' : ''}">${LET[k]}<small>${esc(o)}</small></button>`).join('')}</div></div>`;
  $('ab').onclick = e => { const b = e.target.closest('button'); if (!b || b.disabled) return; const k = +b.dataset.k; sentFor = key + ':' + k; SFX.tap();
    act({ type: 'answer', k }); document.querySelectorAll('#ab button').forEach(x => { x.disabled = true; x.classList.toggle('chosen', +x.dataset.k === k); }); };
}

// لما يرجع الجوال من القفل، يطلب الوضع الحالي
document.addEventListener('visibilitychange', () => { if (!document.hidden && net) { net.send({ t: 'hello', room: ME.room }); sendJoin(); } });

async function boot() {
  if (!Auth.available()) { app.innerHTML = `<div class="stage"><p class="k">المتصفح هذا قديم.</p><p class="mute">افتح اللعبة من كروم أو سفاري حديث.</p></div>`; return; }
  ID = await identity(); sign = await Auth.signer(ID);
  // لو الجوال كان داخل غرفة قبل التحديث، يرجع لها مباشرة
  let seat = null; try { seat = JSON.parse(tab.get('mazad-seat') || 'null'); } catch (e) {}
  const urlRoom = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  if (seat && seat.room && (!urlRoom || urlRoom === seat.room)) { ME = seat; if (await connect()) return; }
  joinScreen();
}
boot();
