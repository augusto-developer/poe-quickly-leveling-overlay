'use strict';
const panel = document.getElementById('panel');
// The window lets the mouse through, except over the panel, the tab, the drawer and the
// minimized icon.
const HIT = '#panel, #tab, #drawer, #mini';
let overControls = false;
function setHover(over) {
  if (over === overControls) return;
  overControls = over;
  window.overlay.hover(over);
}
document.addEventListener('mouseover', (e) => { if (!dragging) setHover(Boolean(e.target.closest(HIT))); });
document.documentElement.addEventListener('mouseleave', () => { if (!dragging) setHover(false); });

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
  setHover(Boolean(document.querySelector(`${HIT.split(', ').map((s) => s + ':hover').join(', ')}`)));
};
bar.addEventListener('pointerup', endDrag);
bar.addEventListener('pointercancel', endDrag);
bar.addEventListener('lostpointercapture', endDrag);
// ---------- minimized ----------
// The minimize button turns the overlay into a small icon where it was. A click on the icon
// opens it again; dragging the icon moves it.
const mini = document.getElementById('mini');
let miniPress = null;
document.getElementById('minimize').addEventListener('click', () => window.overlay.minimize(true));
mini.addEventListener('pointerdown', (e) => {
  if (e.button !== 0) return;
  e.preventDefault();
  mini.setPointerCapture(e.pointerId);
  miniPress = { x: e.screenX, y: e.screenY, moved: false };
});
mini.addEventListener('pointermove', (e) => {
  if (!miniPress) return;
  const dx = e.screenX - miniPress.x, dy = e.screenY - miniPress.y;
  if (!miniPress.moved && Math.hypot(dx, dy) < 4) return; // a click, so far
  if (!miniPress.moved) { miniPress.moved = true; dragging = true; mini.classList.add('dragging'); window.overlay.dragStart(); }
  window.overlay.drag(dx, dy);
});
const endMini = (e) => {
  if (!miniPress) return;
  const { moved } = miniPress;
  miniPress = null;
  if (moved) {
    dragging = null;
    mini.classList.remove('dragging');
    window.overlay.dragEnd();
  } else if (e.type === 'pointerup') {
    window.overlay.minimize(false);
  }
};
mini.addEventListener('pointerup', endMini);
mini.addEventListener('pointercancel', endMini);
mini.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); window.overlay.minimize(false); } });
function showMinimized(s) {
  const on = Boolean(s.minimized);
  document.getElementById('shell').hidden = on;
  mini.hidden = !on;
  // gems waiting in town show on the icon, so they are not missed
  const count = s.inTown ? (s.pending || []).length : 0;
  const badge = document.getElementById('mini-badge');
  badge.hidden = !on || count === 0;
  badge.textContent = String(count);
  mini.title = count ? `${count} ${count === 1 ? 'gem' : 'gems'} to buy. Click to open the overlay, drag to move it.` : 'Click to open the overlay, drag to move it.';
}

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

// A new version on GitHub: the notice under the bar.
function showUpdate(u) {
  const box = document.getElementById('update');
  box.hidden = !u;
  if (!u) return;
  const text = document.getElementById('update-text');
  const go = document.getElementById('update-go');
  const later = document.getElementById('update-later');
  box.className = 'update' + (u.state === 'downloading' || u.state === 'ready' ? ' busy' : u.state === 'error' ? ' failed' : '');
  go.hidden = later.hidden = !(u.state === 'available' || u.state === 'error');
  if (u.state === 'available') {
    text.textContent = `Version ${u.version} is out`;
    go.textContent = u.portable ? 'Download' : 'Update';
    go.title = u.portable ? 'Opens the download page' : 'Downloads it and restarts the overlay';
  } else if (u.state === 'downloading') {
    text.textContent = `Downloading ${u.version}... ${u.percent}%`;
  } else if (u.state === 'ready') {
    text.textContent = 'Restarting to update...';
  } else if (u.state === 'error') {
    text.textContent = 'The update failed.';
    go.textContent = 'Try again';
    go.title = '';
  }
}
document.getElementById('update-go').addEventListener('click', () => window.overlay.updateNow());
document.getElementById('update-later').addEventListener('click', () => window.overlay.updateLater());

// ---------- links drawer ----------
const tab = document.getElementById('tab');
const drawer = document.getElementById('drawer');
const linksBtn = document.getElementById('links');
const actBtn = document.getElementById('act-btn');
const actMenu = document.getElementById('act-menu');
let links = null;
const actName = (act) => 'Act ' + act;
const make = (tag, props = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  for (const c of [].concat(children)) node.append(c);
  return node;
};

function showLinks(l, side) {
  links = l;
  linksBtn.hidden = false;
  tab.hidden = !(l && l.any); // the tab only once there is something to show
  const open = Boolean(l && l.open);
  drawer.hidden = !open;
  document.getElementById('shell').classList.toggle('left', open && side === 'left');
  for (const b of [linksBtn, tab]) b.setAttribute('aria-expanded', String(open));
  tab.setAttribute('aria-label', open ? 'Hide the links' : 'Show the links');
  if (!open) { actMenu.hidden = true; actBtn.setAttribute('aria-expanded', 'false'); return; }

  actBtn.textContent = actName(l.act);
  // every act, the ones with links marked
  actMenu.textContent = '';
  for (let act = 1; act <= 10; act++) {
    const b = make('button', { textContent: actName(act) }, make('span', { className: 'count', textContent: l.acts.includes(act) ? '•' : '' }));
    b.setAttribute('aria-current', String(act === l.act));
    b.addEventListener('click', () => { actMenu.hidden = true; actBtn.setAttribute('aria-expanded', 'false'); window.overlay.linksAct(act); });
    actMenu.append(b);
  }

  const body = document.getElementById('links-body');
  body.textContent = '';
  if (l.links.length === 0 && l.hold.length === 0 && l.drop.length === 0 && l.swap.length === 0) {
    body.append(make('div', { className: 'drawer-empty', textContent: `No links planned for ${actName(l.act)}. Use Edit to set them up.` }));
    return;
  }
  // each link like an item: the active gem on top, its supports joined below it
  for (const link of l.links) {
    const card = make('div', { className: 'lk' });
    card.append(make('div', { className: 'lk-gem skill' }, [make('span', { className: 'sock ' + link.skill.color }), make('span', { className: 'nm', textContent: link.skill.name })]));
    for (const gem of link.supports) {
      card.append(make('div', { className: 'lk-gem' }, [make('span', { className: 'sock ' + gem.color }), make('span', { className: 'nm', textContent: gem.name })]));
    }
    body.append(card);
  }
  // gems to swap for another one, kept in the weapon swap, and thrown away, in this act
  if (l.swap.length) {
    const box = make('div', { className: 'lk-marks swap' }, make('div', { className: 'lk-marks-title', textContent: 'Swap' }));
    for (const s of l.swap) {
      // the old gem, and under it, the one that takes its place
      box.append(make('div', { className: 'lk-mark' }, [make('span', { className: 'sock ' + s.from.color }), make('span', { className: 'nm old', textContent: s.from.name })]));
      box.append(make('div', { className: 'lk-mark to' }, [make('span', { className: 'arrow', textContent: '→' }), make('span', { className: 'sock ' + s.to.color }), make('span', { className: 'nm', textContent: s.to.name })]));
    }
    body.append(box);
  }
  for (const [kind, title, gems] of [['hold', 'Hold in Set 2', l.hold], ['drop', 'Drop', l.drop]]) {
    if (!gems.length) continue;
    const box = make('div', { className: 'lk-marks ' + kind }, make('div', { className: 'lk-marks-title', textContent: title }));
    for (const gem of gems) box.append(make('div', { className: 'lk-mark' }, [make('span', { className: 'sock ' + gem.color }), make('span', { className: 'nm', textContent: gem.name })]));
    body.append(box);
  }
}
const toggleDrawer = () => window.overlay.linksDrawer(!(links && links.open));
tab.addEventListener('click', toggleDrawer);
linksBtn.addEventListener('click', toggleDrawer);
document.getElementById('drawer-close').addEventListener('click', () => window.overlay.linksDrawer(false));
document.getElementById('drawer-edit').addEventListener('click', () => window.overlay.openLinks(links ? links.act : null));
actBtn.addEventListener('click', () => {
  actMenu.hidden = !actMenu.hidden;
  actBtn.setAttribute('aria-expanded', String(!actMenu.hidden));
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
  showUpdate(s.update);
  document.getElementById('notes').hidden = !s.hasNotes;
  showLinks(s.links, s.drawerSide);
  showMinimized(s);

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
