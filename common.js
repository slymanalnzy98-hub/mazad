const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const shuffle = a => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

let sound = true, ac = null;
function beep(f = 600, d = .08, type = 'square', v = .06) {
  if (!sound) return;
  try {
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = f; g.gain.value = v; o.connect(g); g.connect(ac.destination); o.start();
    g.gain.exponentialRampToValueAtTime(.0001, ac.currentTime + d); o.stop(ac.currentTime + d + .02);
  } catch (e) {}
}
const tune = (notes, step = .09) => notes.forEach((f, i) => setTimeout(() => beep(f, step * .9), i * step * 1000));
const SFX = {
  tap: () => beep(520, .05), win: () => tune([523, 659, 784, 1046]), lose: () => tune([392, 330, 262, 196], .12),
  tick: () => beep(880, .03, 'square', .03), reveal: () => tune([300, 400, 500, 700], .07)
};
