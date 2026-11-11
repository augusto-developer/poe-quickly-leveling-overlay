'use strict';
// The mercenary verdict in the middle of the screen: a cross, a tick, or a golden tick
// under a rain of gold, with what was read on a small plate below.
const box = document.getElementById('toast');
const canvas = document.getElementById('rain');
const ctx = canvas.getContext('2d');
const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let rainFrame = 0;

function stopRain() {
  cancelAnimationFrame(rainFrame);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

// Gold coins falling over the whole window for about two and a half seconds.
function goldRain() {
  stopRain();
  if (calm) return;
  const w = canvas.width = canvas.clientWidth;
  const h = canvas.height = canvas.clientHeight;
  const started = performance.now();
  const LASTS = 2600, SPAWN_FOR = 1500;
  const coins = Array.from({ length: 190 }, () => ({
    x: Math.random() * w,
    born: Math.random() * SPAWN_FOR,          // when this coin starts falling
    speed: 0.32 + Math.random() * 0.38,        // px per ms at the start
    size: 3.5 + Math.random() * 5.5,
    sway: Math.random() * Math.PI * 2,
    spin: 0.006 + Math.random() * 0.012,       // how fast it turns on its edge
    tone: Math.random(),
  }));

  function frame(now) {
    const t = now - started;
    ctx.clearRect(0, 0, w, h);
    const fade = Math.min(1, (LASTS - t) / 450); // everything fades out at the end
    for (const c of coins) {
      const age = t - c.born;
      if (age < 0) continue;
      const y = -12 + age * c.speed + age * age * 0.00028; // a little gravity
      if (y > h + 12) continue;
      const x = c.x + Math.sin(c.sway + age * 0.004) * 9;
      const turn = Math.abs(Math.cos(c.sway + age * c.spin)); // 1 = facing us, 0 = on its edge
      ctx.globalAlpha = Math.max(0, fade) * Math.min(1, age / 120);
      // a short trail above the coin
      ctx.strokeStyle = 'rgba(255, 214, 110, .28)';
      ctx.lineWidth = Math.max(1, c.size * 0.35);
      ctx.beginPath(); ctx.moveTo(x, y - c.size * 3.2); ctx.lineTo(x, y - c.size); ctx.stroke();
      // the coin: darker rim, bright face, a highlight
      ctx.fillStyle = c.tone > 0.5 ? '#c8922e' : '#b07a22';
      ctx.beginPath(); ctx.ellipse(x, y, c.size * (0.25 + 0.75 * turn), c.size, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = c.tone > 0.5 ? '#ffd76a' : '#f4bf4a';
      ctx.beginPath(); ctx.ellipse(x, y, c.size * 0.72 * (0.25 + 0.75 * turn), c.size * 0.76, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = 'rgba(255, 250, 220, .85)';
      ctx.beginPath(); ctx.ellipse(x - c.size * 0.22 * turn, y - c.size * 0.3, c.size * 0.16 * turn + 0.4, c.size * 0.22, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (t < LASTS) rainFrame = requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, w, h);
  }
  rainFrame = requestAnimationFrame(frame);
}

window.overlay.onToast((t) => {
  box.className = 'toast ' + t.verdict; // also restarts the mark animation
  document.getElementById('title').textContent = t.title;
  document.getElementById('detail').textContent = t.detail || '';
  document.getElementById('detail').style.display = t.detail ? '' : 'none';
  void box.offsetWidth;
  box.classList.add('show');
  if (t.verdict === 'great') goldRain(); else stopRain();
});
window.overlay.onToastHide(() => box.classList.remove('show'));
