// جوال اللاعب: يدخل الغرفة، ويختار فريقه، ويراهن ويجاوب.
const app = document.getElementById('app');
const $ = id => document.getElementById(id);
const COLS = ['var(--yellow)', 'var(--blue)', 'var(--red)', 'var(--green)'], LET = ['أ', 'ب', 'ج', 'د'];
const MINBET = 50;
document.getElementById('snd').onclick = e => { sound = !sound; e.target.textContent = 'SOUND: ' + (sound ? 'ON' : 'OFF'); };

const store = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} } };
let ME = { id: store.get('mazad-id') || Math.random().toString(36).slice(2, 10), name: store.get('mazad-name') || '', team: null };
store.set('mazad-id', ME.id);
let net = null, S = null, lastKey = '', draft = null, myAnswer = null;

function joinScreen(err) {
  const room = (new URLSearchParams(location.search).get('room') || '').toUpperCase();
  let team = ME.team;
  app.innerHTML = `<div class="stage" style="gap:16px">
    <h1 class="cat" style="font-size:3.4rem">المزاد</h1>
    <label class="field"><span>ROOM CODE</span><input id="code" maxlength="4" value="${esc(room)}" autocomplete="off" inputmode="latin" placeholder="K7Q2"></label>
    <label class="field"><span>اسمك</span><input id="nm" maxlength="14" value="${esc(ME.name)}" autocomplete="off" placeholder="مثلاً: فهد"></label>
    <div class="pick" id="pk"><button class="a" data-t="0">الفريق ١</button><button class="b" data-t="1">الفريق ٢</button></div>
    <p class="err" id="er">${esc(err || '')}</p>
    <button class="px g" id="go">دخول</button></div>`;
  const mark = () => document.querySelectorAll('#pk button').forEach(b => b.classList.toggle('sel', +b.dataset.t === team));
  mark();
  $('pk').onclick = e => { const b = e.target.closest('button'); if (b) { team = +b.dataset.t; SFX.tap(); mark(); } };
  $('go').onclick = async () => {
    const code = $('code').value.trim().toUpperCase(), name = $('nm').value.trim();
    if (code.length !== 4) return $('er').textContent = 'اكتب رمز الغرفة اللي على الشاشة (4 خانات).';
    if (!name) return $('er').textContent = 'اكتب اسمك.';
    if (team === null) return $('er').textContent = 'اختر فريقك.';
    ME.name = name; ME.team = team; store.set('mazad-name', name);
    $('go').disabled = true; $('er').textContent = 'جاري الاتصال…';
    try { net = await Net.open(code, onState); }
    catch (e) { $('go').disabled = false; return $('er').textContent = 'ما قدرنا نتصل. تأكد من الإنترنت وجرّب مرة ثانية.'; }
    $('mode').textContent = net.mode === 'online' ? 'ONLINE' : 'LOCAL TEST';
    history.replaceState(null, '', '?room=' + code);
    net.send({ t: 'join', id: ME.id, team: ME.team, name: ME.name });
    waiting('ننتظر الشاشة…');
    setTimeout(() => { if (!S) waiting('ما وصلنا رد من الشاشة. تأكد إن الرمز صح وإن الشاشة مفتوحة.'); }, 6000);
  };
}

function waiting(msg) { app.innerHTML = `${bar()}<div class="stage"><p class="k blink">${esc(msg)}</p></div>`; }
function bar() {
  if (!S) return '';
  const t = S.teams[ME.team];
  return `<div class="me"><div class="team ${ME.team ? 'b' : 'a'}"><small>${esc(t.name)} · ${esc(ME.name)}</small><b>${t.coins}</b></div><div class="rd">${S.round ? `ROUND ${S.round}/${S.rounds}` : ''}</div></div>`;
}

function onState(m) {
  if (!m || m.t !== 'state') return;
  const prev = S; S = m;
  // ارجع سجّل لو الشاشة بدأت من جديد وما تعرفني
  const known = S.teams.some(t => (t.players || []).includes(ME.name));
  if (!known && S.phase === 'lobby') net.send({ t: 'join', id: ME.id, team: ME.team, name: ME.name });
  const key = [S.phase, S.round, S.answering, S.steal, S.bidIn && S.bidIn[ME.team], S.teams[ME.team].coins].join('|');
  if (S.phase === 'question' && key === lastKey) { const s = $('left'); if (s) s.textContent = S.left; return; }
  if (key === lastKey) return;
  lastKey = key;
  if (!prev || prev.phase !== S.phase) { draft = null; if (S.phase !== 'question') myAnswer = null; }
  render();
}

function render() {
  const mine = ME.team, other = 1 - mine, t = S.teams[mine];
  switch (S.phase) {
    case 'lobby': return waiting('دخلت! انتظروا الشاشة تبدأ اللعبة.');
    case 'roll': return waiting('الفئة تدور على الشاشة…');
    case 'bet': return S.bidIn[mine] ? waiting('راهنتوا ✓ ننتظر الفريق الثاني…') : betUI();
    case 'countdown': return waiting('طالعوا الشاشة! الرهانات تنكشف…');
    case 'reveal': {
      const won = S.winner === mine;
      app.innerHTML = `${bar()}<div class="stage"><p class="big" style="color:${won ? 'var(--green)' : 'var(--red)'}">${won ? 'لكم!' : 'لهم'}</p>
        <p class="k">${won ? 'رهانكم الأعلى، أنتم بتجاوبون' : `${esc(S.teams[other].name)} راهنوا أعلى`}</p></div>`;
      won ? SFX.win() : SFX.lose(); return;
    }
    case 'question': return S.answering === mine ? answerUI() : waiting(`${esc(S.teams[other].name)} يجاوبون… ادعوا يغلطون 😈`);
    case 'stealOffer': {
      if (S.answering === mine) return waiting('غلطتوا… الفريق الثاني يقرر يسرق ولا لا');
      app.innerHTML = `${bar()}<div class="stage"><p class="steal">فرصة سرقة!</p><p class="k">${esc(S.teams[other].name)} غلطوا. تبون تجاوبون وتكسبون نفس الرهان؟</p>
        <div class="row"><button class="px r" id="y">نسرق!</button><button class="px d" id="n">لا</button></div></div>`;
      $('y').onclick = () => { SFX.tap(); net.send({ t: 'steal', team: mine, yes: true }); waiting('…'); };
      $('n').onclick = () => { SFX.tap(); net.send({ t: 'steal', team: mine, yes: false }); waiting('…'); };
      return;
    }
    case 'result': {
      const L = S.last || {}; const us = L.team === mine;
      app.innerHTML = `${bar()}<div class="stage"><p class="big" style="color:${L.ok ? (us ? 'var(--green)' : 'var(--red)') : 'var(--mute)'}">${us ? esc(L.amount) : (L.ok ? '😤' : '😏')}</p>
        <p class="k">${us ? (L.ok ? 'صح!' : 'غلط') : (L.ok ? 'الفريق الثاني جاوب صح' : 'الفريق الثاني ما عرفها')}</p>
        ${L.answer ? `<p class="mute">الجواب: <b style="color:var(--ink)">${esc(L.answer)}</b></p>` : ''}</div>`;
      return;
    }
    case 'over': {
      const w = S.winner;
      app.innerHTML = `${bar()}<div class="stage"><p class="k blink">GAME OVER</p><p class="cat" style="font-size:3rem">${w === null ? 'تعادل!' : w === mine ? 'فزتوا! 🏆' : 'خسرتوا'}</p>
        <div class="final">${S.teams.map((tm, i) => `<div class="team ${i ? 'b' : 'a'}"><small>${esc(tm.name)}</small><b>${tm.coins}</b></div>`).join('')}</div></div>`;
      w === mine ? tune([523, 659, 784, 1046], .12) : SFX.lose(); return;
    }
  }
}

function betUI() {
  const t = S.teams[ME.team];
  if (!draft) draft = { v: Math.min(Math.max(MINBET, Math.round(t.coins * .2 / 50) * 50), t.coins), all: false };
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
  app.querySelector('.chips').onclick = e => { const d = +e.target.dataset.d; if (!d || draft.all) return; draft.v = Math.min(t.coins, Math.max(Math.min(MINBET, t.coins), draft.v + d)); SFX.tap(); draw(); };
  $('all').onclick = () => { draft.all = !draft.all; SFX.tap(); draw(); };
  $('ok').onclick = () => { SFX.tap(); net.send({ t: 'bid', team: ME.team, amount: draft.all ? t.coins : draft.v, allin: draft.all }); waiting('راهنتوا ✓ ننتظر الفريق الثاني…'); };
}

function answerUI() {
  app.innerHTML = `${bar()}<div class="stage" style="gap:12px">
    ${S.steal ? '<p class="steal">سرقة!</p>' : ''}
    <p class="k">طالعوا السؤال على الشاشة · <b id="left">${S.left}</b> ثانية</p>
    <div class="abcd" id="ab">${S.opts.map((o, k) => `<button data-k="${k}" ${k === S.gone || myAnswer !== null ? 'disabled' : ''} class="${myAnswer === k ? 'chosen' : ''}" style="background:${COLS[k]};${k === 1 || k === 2 ? 'color:var(--ink)' : ''}">${LET[k]}<small>${esc(o)}</small></button>`).join('')}</div></div>`;
  $('ab').onclick = e => { const b = e.target.closest('button'); if (!b || b.disabled) return; myAnswer = +b.dataset.k; SFX.tap();
    net.send({ t: 'answer', team: ME.team, k: myAnswer }); document.querySelectorAll('#ab button').forEach(x => { x.disabled = true; x.classList.toggle('chosen', +x.dataset.k === myAnswer); }); };
}

joinScreen();
