// شاشة التلفزيون: هي اللي تدير اللعبة، والجوالات ترسل الرهان والجواب.
const app = document.getElementById('app');
const ROUNDS = 12, START = 1000, MINBET = 50, ANSWER_S = 20, STEAL_S = 10;
const COLS = ['var(--yellow)', 'var(--blue)', 'var(--red)', 'var(--green)'], LET = ['A', 'B', 'C', 'D'];
let G = null, T = null, net = null, ROOM = null;
const stopTimer = () => { clearInterval(T); T = null; };
const $ = id => document.getElementById(id);

document.getElementById('snd').onclick = e => { sound = !sound; e.target.textContent = 'SOUND: ' + (sound ? 'ON' : 'OFF'); SFX.tap(); };
document.getElementById('quit').onclick = () => { stopTimer(); lobby(); };

/* ---------- الاتصال ---------- */
function newCode() { const a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; return Array.from({ length: 4 }, () => a[Math.floor(Math.random() * a.length)]).join(''); }
function pub() {
  const p = { t: 'state', phase: G.phase, round: G.round, rounds: ROUNDS,
    teams: G.teams.map(t => ({ name: t.name, coins: t.coins, allinUsed: t.allinUsed, players: Object.values(t.players) })),
    bidIn: G.bids.map(b => b !== null), answering: G.answering, steal: G.steal, left: G.left, last: G.last || null };
  if (['bet', 'reveal', 'question', 'result', 'stealOffer'].includes(G.phase)) p.cat = G.cur[0];
  if (G.phase === 'question') { p.opts = G.cur[2]; p.gone = G.gone; p.stake = G.stake; }
  if (G.phase === 'reveal') { p.bids = G.bids; p.allin = G.allin; p.winner = G.winner; }
  if (G.phase === 'over') p.winner = G.final;
  return p;
}
const send = () => net && net.send(pub());
function onMsg(m) {
  if (!G || !m || typeof m !== 'object') return;
  const team = m.team === 0 || m.team === 1 ? m.team : null;
  if (m.t === 'join' && team !== null && typeof m.id === 'string') {
    G.teams.forEach(t => delete t.players[m.id]);
    G.teams[team].players[m.id] = String(m.name || 'لاعب').slice(0, 14);
    if (G.phase === 'lobby') lobbyRoster();
    send();
  } else if (m.t === 'hello') send();
  else if (m.t === 'bid' && team !== null && G.phase === 'bet' && G.bids[team] === null) {
    placeBid(team, Number(m.amount) || 0, !!m.allin);
  } else if (m.t === 'answer' && team === G.answering && G.phase === 'question' && !G.locked) {
    const k = Number(m.k); if (k >= 0 && k <= 3 && k !== G.gone) pick(k);
  } else if (m.t === 'steal' && G.phase === 'stealOffer' && team === 1 - G.answering) {
    m.yes ? startSteal() : nextRound();
  }
}

/* ---------- الشاشة الأولى: الغرفة ---------- */
async function lobby() {
  stopTimer();
  if (!net) {
    ROOM = newCode();
    try { net = await Net.open(ROOM, onMsg); }
    catch (e) { app.innerHTML = `<div class="stage"><p class="k">ما قدرنا نتصل بالسيرفر.</p><p class="mute">تأكد من الإنترنت ومن بيانات config.js، وبعدين حدّث الصفحة.</p></div>`; return; }
    $('mode').textContent = net.mode === 'online' ? 'ONLINE' : 'LOCAL TEST';
  }
  const keep = G ? G.teams.map(t => t.players) : [{}, {}];
  const names = G ? G.teams.map(t => t.name) : ['الصقور', 'النمور'];
  G = { phase: 'lobby', round: 0, teams: names.map((n, i) => ({ name: n, coins: START, allinUsed: false, players: keep[i] })), bids: [null, null], allin: [false, false] };
  const url = new URL('play.html?room=' + ROOM, location.href).href;
  app.innerHTML = `<div class="stage">
    <h1 class="cat logo">المزاد</h1>
    <div class="lobby">
      <div class="qr" id="qr"></div>
      <div style="display:flex;flex-direction:column;gap:10px;text-align:start">
        <p class="k">صوّروا الكود بالجوال، أو افتحوا الرابط واكتبوا الرمز</p>
        <p class="code">${ROOM}</p>
        <p class="url">${esc(url)}</p>
      </div>
    </div>
    <div class="roster" id="roster"></div>
    <p class="mute">الفريق اللي ما عنده جوال يقدر يراهن ويجاوب من هالشاشة.</p>
    <button class="px g" id="go">ابدأ اللعبة</button></div>`;
  try { new QRCode($('qr'), { text: url, width: 160, height: 160, correctLevel: QRCode.CorrectLevel.M }); } catch (e) { $('qr').textContent = ROOM; }
  lobbyRoster();
  $('go').onclick = start;
  send();
}
function lobbyRoster() {
  const r = $('roster'); if (!r) return;
  r.innerHTML = G.teams.map((t, i) => `<div class="box ${i ? 'b' : 'a'}"><h2>${esc(t.name)}</h2><p>${Object.values(t.players).map(esc).join('، ') || 'ما أحد دخل للحين'}</p></div>`).join('');
}

function start() {
  SFX.win();
  const deck = []; Object.entries(BANK).forEach(([c, qs]) => shuffle(qs).forEach(q => deck.push([c, ...q])));
  G.deck = shuffle(deck); G.round = 0;
  G.teams.forEach(t => { t.coins = START; t.allinUsed = false; });
  nextRound();
}

/* ---------- الشريط العلوي ---------- */
function header(active) {
  const t = i => { const tm = G.teams[i]; const n = Object.keys(tm.players).length;
    return `<div class="team ${i ? 'b' : 'a'} ${active !== undefined && active !== i ? 'dim' : ''}"><small>${esc(tm.name)}</small><b>${tm.coins}</b><span class="tag">${tm.allinUsed ? '' : 'ALL-IN ×1'} ${n ? '📱' + n : ''}</span></div>`; };
  return `<div class="bar">${t(0)}<div class="rd">ROUND ${G.round}/${ROUNDS}</div>${t(1)}</div>`;
}

/* ---------- الجولة ---------- */
function nextRound() {
  stopTimer();
  if (G.round >= ROUNDS) return gameOver();
  G.round++;
  let i = G.deck.findIndex(q => q[0] !== G.lastCat); if (i < 0) i = 0;
  G.cur = G.deck.splice(i, 1)[0]; G.lastCat = G.cur[0];
  const rescued = G.teams.filter(t => t.coins <= 0); rescued.forEach(t => t.coins = 100);
  G.bids = [null, null]; G.allin = [false, false]; G.answering = null; G.steal = false; G.gone = undefined; G.last = null; G.locked = false;
  G.phase = 'roll'; send();
  app.innerHTML = `${header()}<div class="stage"><p class="k">الفئة الجاية</p><p class="cat roll" id="cat">؟</p>
    ${rescued.length ? `<p class="mute">${rescued.map(t => esc(t.name)).join(' و ')} أفلسوا، وعطيناهم 100 عملة يكملون فيها.</p>` : ''}</div>`;
  const el = $('cat'), cats = Object.keys(BANK); let n = 0;
  T = setInterval(() => {
    el.textContent = cats[n++ % cats.length]; beep(300 + (n % 5) * 80, .04, 'square', .03);
    if (n >= 14) { stopTimer(); el.textContent = G.cur[0]; el.classList.remove('roll'); el.classList.add('land'); SFX.reveal(); setTimeout(betPhase, 900); }
  }, 90);
}

function betPhase() {
  G.phase = 'bet'; send();
  const box = i => { const t = G.teams[i], done = G.bids[i] !== null, phones = Object.keys(t.players).length;
    return `<div class="box ${i ? 'b' : 'a'}"><b>${esc(t.name)}</b><span class="st ${done ? '' : 'blink'}">${done ? 'BET ✓' : 'WAITING…'}</span>
      ${done ? '' : `<button class="px d mini" data-t="${i}">${phones ? 'راهن من الشاشة' : 'راهن هنا'}</button>`}</div>`; };
  app.innerHTML = `${header()}<div class="stage"><p class="k">الفئة</p><p class="cat">${esc(G.cur[0])}</p>
    <p class="k">راهنوا من جوالاتكم بالسر</p><div class="wait2" id="w2">${box(0)}${box(1)}</div></div>`;
  $('w2').onclick = e => { const b = e.target.closest('button[data-t]'); if (b) screenBet(+b.dataset.t); };
}

// رهان من الشاشة للفريق اللي ما عنده جوال
function screenBet(i) {
  const t = G.teams[i], other = G.teams[1 - i];
  let v = Math.min(Math.max(MINBET, Math.round(t.coins * .2 / 50) * 50), t.coins), all = false;
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
  app.querySelector('.chips').onclick = e => { const d = +e.target.dataset.d; if (!d || all) return; v = Math.min(t.coins, Math.max(Math.min(MINBET, t.coins), v + d)); SFX.tap(); draw(); };
  $('all').onclick = () => { all = !all; SFX.tap(); draw(); };
  $('back').onclick = betPhase;
  $('ok').onclick = () => placeBid(i, all ? t.coins : v, all);
}

function placeBid(i, amount, allin) {
  const t = G.teams[i];
  if (allin && t.allinUsed) allin = false;
  amount = allin ? t.coins : Math.max(Math.min(MINBET, t.coins), Math.min(t.coins, Math.round(amount)));
  G.bids[i] = amount; G.allin[i] = allin; SFX.tap();
  if (G.bids.every(b => b !== null)) reveal(); else betPhase();
}

function reveal() {
  G.phase = 'countdown'; send();
  let c = 3;
  const show = () => { app.innerHTML = `${header()}<div class="stage"><p class="k">الرهانات تنكشف بعد</p><p class="count">${c}</p></div>`; beep(440, .12); };
  show(); stopTimer();
  T = setInterval(() => { c--; if (c > 0) show(); else { stopTimer(); revealNow(); } }, 800);
}
function revealNow() {
  const [a, b] = G.bids; const w = a === b ? (Math.random() < .5 ? 0 : 1) : (a > b ? 0 : 1);
  G.winner = w; G.phase = 'reveal'; send();
  const pad = i => `<div class="paddle ${i === w ? 'win' : 'lose'}"><div class="p ${i ? 'b' : 'a'}">${G.allin[i] ? 'ALL' : G.bids[i]}</div><div class="s"></div><em>${esc(G.teams[i].name)}</em></div>`;
  app.innerHTML = `${header()}<div class="stage"><div class="paddles">${pad(0)}${pad(1)}</div>
    <p class="k">${a === b ? 'تعادل! القرعة اختارت ' : ''}🔨 بيع على ${esc(G.teams[w].name)}!</p>
    <button class="px g" id="q">اعرض السؤال</button></div>`;
  SFX.win();
  let auto = setTimeout(() => question(w, false), 3500);
  $('q').onclick = () => { clearTimeout(auto); question(w, false); };
}

function question(team, steal) {
  stopTimer();
  const [cat, q, opts] = G.cur;
  G.answering = team; G.steal = steal; G.locked = false;
  G.stake = steal ? G.stake : (G.allin[G.winner] ? G.bids[G.winner] * 2 : G.bids[G.winner]);
  G.left = steal ? STEAL_S : ANSWER_S; const total = G.left;
  G.phase = 'question'; send();
  const t = G.teams[team];
  app.innerHTML = `${header(team)}<div class="stage">
    ${steal ? `<p class="steal">فرصة سرقة! ${esc(t.name)}</p>` : `<p class="k">${esc(t.name)} يجاوبون</p>`}
    <p class="q">${esc(q)}</p>
    <div class="opts" id="ops">${opts.map((o, k) => `<button class="opt ${k === G.gone ? 'gone' : ''}" data-k="${k}" ${k === G.gone ? 'disabled' : ''} style="background:${COLS[k]};${k === 1 || k === 2 ? 'color:var(--ink)' : ''}"><i>${LET[k]}</i>${esc(o)}</button>`).join('')}</div>
    <div class="row" style="align-items:center"><div class="tm"><b id="sec"></b><div class="bars" id="bars"></div></div>
    <p class="stake">${steal ? `STEAL: +${G.stake}` : `WIN: +${G.stake} · LOSE: −${G.stake}`}</p></div></div>`;
  const bars = () => { const on = Math.ceil(G.left / total * 10);
    $('bars').innerHTML = Array.from({ length: 10 }, (_, k) => `<i class="${k < on ? '' : 'off'}"></i>`).join('');
    const s = $('sec'); s.textContent = G.left; s.classList.toggle('alarm', G.left <= 5); };
  bars();
  T = setInterval(() => { G.left--; if (G.left <= 5 && G.left > 0) SFX.tick(); if (G.left <= 0) { stopTimer(); pick(-1); } else { bars(); send(); } }, 1000);
  $('ops').onclick = e => { const b = e.target.closest('.opt'); if (b && !b.disabled) pick(+b.dataset.k); };
}

function pick(k) {
  if (G.locked) return; G.locked = true; stopTimer();
  const right = G.cur[3];
  document.querySelectorAll('.opt').forEach((b, j) => { b.disabled = true; if (j === right) b.classList.add('right'); else if (j === k) b.classList.add('wrong'); });
  setTimeout(() => result(G.answering, G.steal, k === right, k), 1100);
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

function result(team, steal, ok, picked) {
  const t = G.teams[team], o = G.teams[1 - team], before = t.coins, stake = G.stake;
  if (G.allin[team] && !steal) t.allinUsed = true;
  let line, color, amount;
  if (ok) { t.coins += stake; amount = '+' + stake; color = 'var(--green)'; line = steal ? `${esc(t.name)} سرقوها!` : `صح! ${esc(t.name)} كسبوا`; SFX.win(); }
  else if (!steal) { t.coins = Math.max(0, t.coins - stake); amount = '−' + stake; color = 'var(--red)'; line = picked < 0 ? `خلص الوقت! ${esc(t.name)} خسروا` : `غلط! ${esc(t.name)} خسروا`; SFX.lose(); }
  else { amount = '0'; color = 'var(--mute)'; line = `ولا ${esc(t.name)} عرفوها`; SFX.lose(); }
  const canSteal = !ok && !steal;
  G.gone = picked >= 0 ? picked : undefined;
  G.last = { team, ok, amount, steal, answer: canSteal ? null : G.cur[2][G.cur[3]] };
  G.phase = canSteal ? 'stealOffer' : 'result'; send();
  app.innerHTML = `${header()}<div class="stage">
    <p class="big" style="color:${color}">${amount}</p><p class="k">${line}</p>
    ${!canSteal ? `<p class="mute">الجواب: <b style="color:var(--ink)">${esc(G.cur[2][G.cur[3]])}</b></p>` : `<p class="k">${esc(o.name)}، تبون تسرقون السؤال؟ قرروا من جوالكم أو من هنا</p>`}
    <div class="row">${canSteal ? `<button class="px r" id="st">${esc(o.name)} يسرقون</button><button class="px d" id="skip">لا، التالي</button>` : `<button class="px g" id="nx">${G.round >= ROUNDS ? 'النتيجة النهائية' : 'السؤال الجاي'}</button>`}</div></div>`;
  countUp(team, before, t.coins);
  if (ok) { fx('flash'); if (stake >= 400) burst(); } else fx('shake');
  if (canSteal) { $('st').onclick = startSteal; $('skip').onclick = nextRound; }
  else $('nx').onclick = nextRound;
}
function startSteal() { if (G.phase === 'stealOffer') question(1 - G.answering, true); }

function gameOver() {
  stopTimer();
  const [a, b] = G.teams; const w = a.coins === b.coins ? null : (a.coins > b.coins ? 0 : 1);
  G.final = w; G.phase = 'over'; send();
  app.innerHTML = `<div class="stage"><p class="k blink">GAME OVER</p>
    <p class="cat">${w === null ? 'تعادل!' : `${esc(G.teams[w].name)} فازوا!`}</p>
    <div class="final">${G.teams.map((t, i) => `<div class="team ${i ? 'b' : 'a'}"><small>${esc(t.name)}</small><b>${t.coins}</b></div>`).join('')}</div>
    <div class="row"><button class="px g" id="again">لعبة جديدة</button></div></div>`;
  tune([523, 523, 659, 784, 659, 784, 1046], .12); burst(); setTimeout(burst, 900);
  $('again').onclick = lobby;
}

// لو جوال دخل متأخر، يوصله الوضع الحالي كل 3 ثواني
setInterval(() => { if (G && G.phase !== 'question') send(); }, 3000);
lobby();
