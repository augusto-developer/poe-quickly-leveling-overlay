'use strict';
const panel = document.getElementById('panel');
panel.addEventListener('mouseenter', () => window.overlay.hover(true));
panel.addEventListener('mouseleave', () => { if (!dragging) window.overlay.hover(false); });

// Drag the top bar (anywhere that is not a button) to move the overlay.
const bar = document.getElementById('bar');
let dragging = null;
bar.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.target.closest('button')) return;
  e.preventDefault();
  bar.setPointerCapture(e.pointerId);
  dragging = { x: e.screenX, y: e.screenY };
  bar.classList.add('dragging');
  window.overlay.dragStart();
});
bar.addEventListener('pointermove', (e) => {
  if (dragging) window.overlay.drag(e.screenX - dragging.x, e.screenY - dragging.y);
});
const endDrag = () => {
  if (!dragging) return;
  dragging = null;
  bar.classList.remove('dragging');
  window.overlay.dragEnd();
  if (!panel.matches(':hover')) window.overlay.hover(false);
};
bar.addEventListener('pointerup', endDrag);
bar.addEventListener('pointercancel', endDrag);
bar.addEventListener('lostpointercapture', endDrag);
document.getElementById('smaller').addEventListener('click', () => window.overlay.resize(-1));
document.getElementById('bigger').addEventListener('click', () => window.overlay.resize(1));
// Reset asks first: the button only opens the confirmation, "Reset" inside it does the work.
const confirmBox = document.getElementById('confirm-reset');
// The three dots open and close the menu with the less used actions.
const menu = document.getElementById('menu');
const more = document.getElementById('more');
function showMenu(on) { menu.hidden = !on; more.setAttribute('aria-expanded', String(on)); if (on) confirmBox.hidden = true; }
more.addEventListener('click', () => showMenu(menu.hidden));
document.getElementById('reset').addEventListener('click', () => { showMenu(false); confirmBox.hidden = false; });
document.getElementById('reset-no').addEventListener('click', () => { confirmBox.hidden = true; });
document.getElementById('reset-yes').addEventListener('click', () => { confirmBox.hidden = true; window.overlay.reset(); });
document.getElementById('quit').addEventListener('click', () => window.overlay.quit());
document.getElementById('config').addEventListener('click', () => window.overlay.openSettings());
document.getElementById('tree').addEventListener('click', () => window.overlay.openTree());
document.getElementById('notes').addEventListener('click', () => window.overlay.openNotes());
document.getElementById('library').addEventListener('click', () => window.overlay.openLibrary());
document.getElementById('options').addEventListener('click', () => { showMenu(false); window.overlay.openOptions(); });

// Volume of the overlay sounds. Dragging shows the number; letting go saves it and plays
// the gem chime once, so you hear how loud it is.
const volume = document.getElementById('volume');
function showVolume(percent) {
  volume.style.setProperty('--fill', percent + '%');
  document.getElementById('volume-value').textContent = percent;
  volume.closest('.volume').classList.toggle('off', percent === 0);
}
volume.addEventListener('input', () => showVolume(Number(volume.value)));
volume.addEventListener('change', () => window.overlay.setVolume(Number(volume.value) / 100));

// Plays the alert sound (the main process sends the address of the file).
// Sounds. A file when there is one; otherwise a short chime made right here.
const CHIMES = {
  gems: { notes: [880, 1318.5], gap: 0.09, length: 0.5 },                      // two soft notes going up
  great: { notes: [659.3, 830.6, 987.8, 1318.5, 1661.2], gap: 0.075, length: 1.1 }, // a bright rising run
};
function playChime(name, volume) {
  const chime = CHIMES[name];
  if (!chime || volume <= 0) return;
  const ctx = new AudioContext();
  const start = ctx.currentTime + 0.02;
  chime.notes.forEach((freq, i) => {
    const at = start + i * chime.gap;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(volume * 0.3, at + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + chime.length);
    gain.connect(ctx.destination);
    // a sine with a quiet octave above it sounds like a small bell
    for (const [mult, level] of [[1, 1], [2, 0.25]]) {
      const osc = ctx.createOscillator();
      const part = ctx.createGain();
      part.gain.value = level;
      osc.frequency.value = freq * mult;
      osc.connect(part).connect(gain);
      osc.start(at);
      osc.stop(at + chime.length);
    }
  });
  setTimeout(() => ctx.close(), (chime.notes.length * chime.gap + chime.length + 0.3) * 1000);
}
window.overlay.onSound((sound) => {
  if (!sound.url) return playChime(sound.chime, sound.volume);
  const audio = new Audio(sound.url);
  audio.volume = sound.volume;
  audio.play().catch(() => playChime(sound.chime, sound.volume));
});

window.overlay.onState((s) => {
  // the saved volume, unless the handle is being dragged right now
  if (!volume.matches(':active')) { volume.value = Math.round(s.volume * 100); showVolume(Number(volume.value)); }
  document.getElementById('area').textContent = s.area || 'Waiting for Client.txt';
  // The act of the current area. When the name exists in two acts, clicking switches.
  const actLabel = document.getElementById('act');
  actLabel.hidden = !s.act;
  actLabel.textContent = s.act ? 'Act ' + s.act : '';
  actLabel.classList.toggle('switch', Boolean(s.canSwitchAct));
  actLabel.title = s.canSwitchAct ? 'This area exists in two acts. Click if the act is wrong.' : '';
  actLabel.onclick = s.canSwitchAct ? () => window.overlay.switchAct() : null;
  document.getElementById('status').textContent = s.status || '';
  document.getElementById('notes').hidden = !s.hasNotes;

  // Next passive point of the order set in the tree window.
  const passiveBox = document.getElementById('passive');
  passiveBox.textContent = '';
  if (s.passive) {
    const head = document.createElement('h1');
    head.textContent = 'Next passive point';
    passiveBox.appendChild(head);
    if (s.passive.finished) {
      const all = document.createElement('div');
      all.className = 'none';
      all.textContent = `All ${s.passive.total} points of the order taken`;
      passiveBox.appendChild(all);
    } else {
      const ul = document.createElement('ul');
      const li = document.createElement('li');
      li.title = 'Click when you have taken this point';
      const name = document.createElement('span');
      name.className = 'gem-name';
      name.textContent = 'Go to ' + s.passive.name + (s.passive.keystone ? ' (keystone)' : '');
      const step = document.createElement('span');
      step.className = 'passive-step';
      const cost = s.passive.cost === null ? '' : `${s.passive.cost} ${s.passive.cost === 1 ? 'pt' : 'pts'}, `;
      step.textContent = `${cost}${s.passive.index}/${s.passive.total}`;
      li.append(name, step);
      li.addEventListener('click', () => window.overlay.passiveDone(s.passive.id));
      ul.appendChild(li);
      passiveBox.appendChild(ul);
    }
    if (s.passive.finished || s.passive.index > 1) {
      const undo = document.createElement('span');
      undo.className = 'passive-undo';
      undo.textContent = 'undo last';
      undo.addEventListener('click', () => window.overlay.passiveUndo());
      passiveBox.appendChild(undo);
    }
  }

  const mercBox = document.getElementById('merc');
  mercBox.textContent = '';
  if (s.merc) {
    const labels = { great: 'GREAT', good: 'GOOD', check: 'GOOD, BUT CHECK THE SUPPORTS', ok: 'OK', partial: 'GOOD TYPE, WRONG SKILLS', unlisted: 'NOT IN THE LIST', none: 'NO WINDOW' };
    const card = document.createElement('div');
    card.className = 'merc ' + s.merc.verdict;
    const verdict = document.createElement('div');
    verdict.className = 'merc-verdict';
    verdict.textContent = labels[s.merc.verdict] || '';
    const title = document.createElement('div');
    title.className = 'merc-title';
    title.textContent = s.merc.title;
    card.append(verdict, title);
    for (const text of s.merc.lines) {
      const line = document.createElement('div');
      line.className = 'merc-line';
      line.textContent = text;
      card.appendChild(line);
    }
    mercBox.appendChild(card);
  }
  const list = document.getElementById('list');
  list.textContent = '';
  if (!s.inTown) return; // outside a town only the area is shown
  const h = document.createElement('h1');
  h.textContent = 'Buy now';
  list.appendChild(h);
  if (s.pending.length === 0) {
    const d = document.createElement('div');
    d.className = 'none';
    d.textContent = 'Nothing pending';
    list.appendChild(d);
    return;
  }
  const ul = document.createElement('ul');
  for (const gem of s.pending) {
    const li = document.createElement('li');
    const label = document.createElement('span');
    label.className = 'gem-name';
    label.textContent = gem.name;
    li.title = 'Click to mark as bought';
    li.addEventListener('click', () => window.overlay.mark(gem.key));
    const dot = document.createElement('span');
    dot.className = 'dot ' + gem.color;
    li.appendChild(dot);
    li.appendChild(label);
    if (gem.wiki) {
      const link = document.createElement('span');
      link.className = 'wiki';
      link.textContent = 'wiki';
      link.title = 'Where to get this gem (opens poewiki in the browser)';
      link.addEventListener('click', (e) => { e.stopPropagation(); window.overlay.openWiki(gem.name); });
      li.appendChild(link);
    }
    ul.appendChild(li);
  }
  list.appendChild(ul);
});
