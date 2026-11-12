'use strict';
/* Passive tree window: draws the tree with the game art, imports a PoB build and lets you
   put its notables and keystones in the order you want to take them. */
(async function () {
  const api = window.treeApi;
  const $ = (id) => document.getElementById(id);
  const canvas = $('tree');
  const ctx = canvas.getContext('2d', { alpha: false });

  const { tree, build: savedBuild } = await api.getData();
  const Z = tree.zoom; // sprite pixels per world unit
  const nodeIds = Object.keys(tree.nodes);
  const CLASS_SPRITE = ['centerscion', 'centermarauder', 'centerranger', 'centerwitch', 'centerduelist', 'centertemplar', 'centershadow'];
  const KIND_LABEL = { s: 'Passive', n: 'Notable', k: 'Keystone', m: 'Mastery', j: 'Jewel socket', c: 'Class start' };
  const isMilestone = (n) => n.t === 'n' || n.t === 'k';

  // Bounding box of every connection, so the ones outside the view are never sent to the
  // canvas. Without this, zooming in made the GPU stroke the whole tree on every frame.
  const edgeBox = tree.edges.map((e) => {
    const a = tree.nodes[e[0]], b = tree.nodes[e[1]];
    let bulge = 0;
    if (e.length > 2) {
      const delta = (b.a - a.a + Math.PI * 2) % (Math.PI * 2);
      bulge = e[4] * (1 - Math.cos(Math.min(delta, Math.PI * 2 - delta) / 2)); // how far the arc leaves the chord
    }
    return [Math.min(a.x, b.x) - bulge, Math.min(a.y, b.y) - bulge, Math.max(a.x, b.x) + bulge, Math.max(a.y, b.y) + bulge];
  });
  let size = { w: 1, h: 1 }; // canvas size in CSS pixels, refreshed on resize

  // ---------- state ----------
  let build = savedBuild || { specs: [], specIndex: 0, tails: [], order: [], notes: '' };
  if (!Array.isArray(build.tails)) build.tails = build.specs.map(() => null);
  // The order of the selected tree, as worked out by the main process. Its first
  // `inherited` points come from the tree before; the rest are new in this tree.
  let order = [];
  let inherited = 0;
  let previousTitle = '';
  let showNotes = false; // the sidebar shows the build notes instead of the order
  let allocated = new Set();
  let plan = { steps: [], spent: 0, remaining: 0 };
  let view = { x: 0, y: 0, scale: 0.05 };
  let hover = null;
  let focusId = null;
  let dirty = true;

  const spec = () => build.specs[build.specIndex] || null;
  function refreshAllocated() {
    sceneDirty = true;
    const s = spec();
    allocated = new Set(s ? s.nodes.map(String).filter((id) => tree.nodes[id]) : []);
    if (s && tree.starts[s.classId]) allocated.add(tree.starts[s.classId]);
  }

  // ---------- images ----------
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Could not load ' + file));
      img.src = '../../assets/tree/' + file;
    });
  }
  const files = [...new Set(Object.values(tree.sprites).map((s) => s.file))];
  const images = Object.fromEntries(await Promise.all(files.map(async (f) => [f, await loadImage(f)])));

  // The icon sheets are JPEGs with square icons. Cut every icon into a circle once, so the
  // frame drawn on top does not show black corners.
  function roundSheet(name) {
    const sheet = tree.sprites[name];
    const img = images[sheet.file];
    const off = document.createElement('canvas');
    off.width = img.width; off.height = img.height;
    const c = off.getContext('2d');
    for (const [x, y, w, h] of Object.values(sheet.coords)) {
      c.save();
      c.beginPath();
      c.arc(x + w / 2, y + h / 2, Math.min(w, h) / 2 - 0.5, 0, Math.PI * 2);
      c.clip();
      c.drawImage(img, x, y, w, h, x, y, w, h);
      c.restore();
    }
    return off;
  }
  const rounded = {};
  for (const name of ['normalActive', 'normalInactive', 'notableActive', 'notableInactive', 'keystoneActive', 'keystoneInactive']) {
    rounded[name] = roundSheet(name);
  }
  const pattern = ctx.createPattern(images[tree.sprites.background.file], 'repeat');

  // The tree itself is drawn into an off-screen "scene" canvas that is larger than the
  // window. Dragging then only copies a piece of that canvas to the screen, and the scene
  // is redrawn just when you zoom, when the build changes, or when you drag past its edge.
  const scene = document.createElement('canvas');
  const g = scene.getContext('2d', { alpha: false });
  let sceneView = null; // where the scene was drawn: { x, y, scale, w, h } (w, h in CSS pixels)
  let sceneDirty = true;
  const perf = { sceneMs: 0, nodes: 0, edges: 0, redraws: 0, frameMs: 0 };

  // Draws one sprite centred on a world position. World size = sprite pixels / zoom.
  function sprite(sheetName, key, x, y, source) {
    const sheet = tree.sprites[sheetName];
    const c = sheet.coords[key];
    if (!c) return;
    const w = c[2] / Z, h = c[3] / Z;
    g.drawImage(source || images[sheet.file], c[0], c[1], c[2], c[3], x - w / 2, y - h / 2, w, h);
  }

  // ---------- drawing ----------
  function resize() {
    const dpr = window.devicePixelRatio || 1;
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    size = { w: r.width, h: r.height };
    sceneDirty = true;
    dirty = true;
  }
  const toScreen = (x, y) => [(x - view.x) * view.scale + size.w / 2, (y - view.y) * view.scale + size.h / 2];
  const toWorld = (sx, sy) => [(sx - size.w / 2) / view.scale + view.x, (sy - size.h / 2) / view.scale + view.y];

  // Strokes the connections that touch the area [x0, y0, x1, y1].
  function drawEdges(active, x0, y0, x1, y1) {
    g.beginPath();
    for (let i = 0; i < tree.edges.length; i++) {
      const box = edgeBox[i];
      if (box[2] < x0 || box[0] > x1 || box[3] < y0 || box[1] > y1) continue;
      const e = tree.edges[i];
      const on = allocated.has(e[0]) && allocated.has(e[1]);
      if (on !== active) continue;
      perf.edges++;
      const a = tree.nodes[e[0]], b = tree.nodes[e[1]];
      if (e.length === 2) {
        g.moveTo(a.x, a.y);
        g.lineTo(b.x, b.y);
      } else {
        // same orbit of the same group: an arc, going the short way round
        const delta = (b.a - a.a + Math.PI * 2) % (Math.PI * 2);
        const from = a.a - Math.PI / 2, to = b.a - Math.PI / 2;
        g.moveTo(a.x, a.y);
        g.arc(e[2], e[3], e[4], from, to, delta > Math.PI);
      }
    }
    g.stroke();
  }

  function drawNode(id, n) {
    const on = allocated.has(id);
    if (n.t === 's') {
      sprite(on ? 'normalActive' : 'normalInactive', n.i, n.x, n.y, rounded[on ? 'normalActive' : 'normalInactive']);
      sprite('frame', on ? 'PSSkillFrameActive' : 'PSSkillFrame', n.x, n.y);
    } else if (n.t === 'n') {
      sprite(on ? 'notableActive' : 'notableInactive', n.i, n.x, n.y, rounded[on ? 'notableActive' : 'notableInactive']);
      sprite('frame', on ? 'NotableFrameAllocated' : 'NotableFrameUnallocated', n.x, n.y);
    } else if (n.t === 'k') {
      sprite(on ? 'keystoneActive' : 'keystoneInactive', n.i, n.x, n.y, rounded[on ? 'keystoneActive' : 'keystoneInactive']);
      sprite('frame', on ? 'KeystoneFrameAllocated' : 'KeystoneFrameUnallocated', n.x, n.y);
    } else if (n.t === 'm') {
      sprite(on ? 'masteryConnected' : 'masteryInactive', n.i, n.x, n.y);
    } else if (n.t === 'j') {
      sprite('frame', on ? 'JewelFrameAllocated' : 'JewelFrameUnallocated', n.x, n.y);
    } else if (n.t === 'c') {
      const s = spec();
      const mine = s && s.classId === n.ci;
      sprite('startNode', mine ? CLASS_SPRITE[n.ci] : 'PSStartNodeBackgroundInactive', n.x, n.y);
    }
  }

  // Redraws the scene around the current view, with a margin on every side.
  function renderScene() {
    const started = performance.now();
    const dpr = window.devicePixelRatio || 1;
    // margin as a fraction of the window, smaller on very large windows to keep the canvas a sane size
    const fit = (len) => Math.max(0.1, Math.min(0.4, (4096 / Math.max(1, len * dpr) - 1) / 2));
    const mx = fit(size.w), my = fit(size.h);
    const W = size.w * (1 + 2 * mx), H = size.h * (1 + 2 * my);
    const pw = Math.round(W * dpr), ph = Math.round(H * dpr);
    if (scene.width !== pw || scene.height !== ph) { scene.width = pw; scene.height = ph; }
    perf.nodes = 0; perf.edges = 0;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.fillStyle = '#05060c';
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 0.55;
    g.fillStyle = pattern;
    g.fillRect(0, 0, W, H);
    g.globalAlpha = 1;

    const s = view.scale;
    g.setTransform(dpr * s, 0, 0, dpr * s, dpr * (W / 2 - view.x * s), dpr * (H / 2 - view.y * s));
    const x0 = view.x - W / 2 / s, y0 = view.y - H / 2 / s, x1 = view.x + W / 2 / s, y1 = view.y + H / 2 / s;
    const pad = 500;
    const visible = (x, y) => x > x0 - pad && x < x1 + pad && y > y0 - pad && y < y1 + pad;

    for (const grp of Object.values(tree.groups)) {
      if (!visible(grp.x, grp.y)) continue;
      const c = tree.sprites.groupBackground.coords[grp.img];
      if (!c) continue;
      const w = c[2] / Z, h = c[3] / Z;
      const img = images[tree.sprites.groupBackground.file];
      if (grp.half) {
        // the sprite is the top half; the bottom half is the same image mirrored
        g.drawImage(img, c[0], c[1], c[2], c[3], grp.x - w / 2, grp.y - h, w, h);
        g.save();
        g.translate(grp.x, grp.y);
        g.scale(1, -1);
        g.drawImage(img, c[0], c[1], c[2], c[3], -w / 2, -h, w, h);
        g.restore();
      } else {
        g.drawImage(img, c[0], c[1], c[2], c[3], grp.x - w / 2, grp.y - h / 2, w, h);
      }
    }

    g.lineCap = 'round';
    g.strokeStyle = '#4a3f2c';
    g.lineWidth = Math.max(9, 1 / s);
    drawEdges(false, x0 - 40, y0 - 40, x1 + 40, y1 + 40);
    g.strokeStyle = '#e2c275';
    g.lineWidth = Math.max(13, 1.5 / s);
    drawEdges(true, x0 - 40, y0 - 40, x1 + 40, y1 + 40);

    for (const id of nodeIds) {
      const n = tree.nodes[id];
      if (visible(n.x, n.y)) { drawNode(id, n); perf.nodes++; }
    }

    sceneView = { x: view.x, y: view.y, scale: s, w: W, h: H };
    sceneDirty = false;
    perf.sceneMs = performance.now() - started;
    perf.redraws++;
  }

  function draw() {
    const started = performance.now();
    dirty = false;
    const dpr = window.devicePixelRatio || 1;
    const W = size.w, H = size.h;
    const s = view.scale;

    // Is the window still inside what the scene covers?
    let ox = 0, oy = 0;
    if (sceneView && !sceneDirty && sceneView.scale === s) {
      ox = (sceneView.w - W) / 2 + (view.x - sceneView.x) * s;
      oy = (sceneView.h - H) / 2 + (view.y - sceneView.y) * s;
    }
    if (sceneDirty || !sceneView || sceneView.scale !== s || ox < 0 || oy < 0 || ox + W > sceneView.w || oy + H > sceneView.h) {
      renderScene();
      ox = (sceneView.w - W) / 2;
      oy = (sceneView.h - H) / 2;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(scene, Math.round(ox * dpr), Math.round(oy * dpr), canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);

    // screen-space overlays: order badges, hover ring, focus ring
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const ring = (id, colour, width) => {
      const n = tree.nodes[id];
      if (!n) return;
      const [sx, sy] = toScreen(n.x, n.y);
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(nodeRadius(n) * s + 4, 8), 0, Math.PI * 2);
      ctx.strokeStyle = colour;
      ctx.lineWidth = width;
      ctx.stroke();
    };
    if (focusId) ring(focusId, '#ffffff', 2.5);
    if (hover) ring(hover, '#e2c275', 2);

    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    order.forEach((id, i) => {
      const n = tree.nodes[id];
      if (!n) return;
      const [sx, sy] = toScreen(n.x, n.y);
      if (sx < -30 || sy < -30 || sx > W + 30 || sy > H + 30) return;
      const r = 10;
      const bx = sx + Math.max(nodeRadius(n) * s, 6) * 0.75 + 4, by = sy - Math.max(nodeRadius(n) * s, 6) * 0.75 - 4;
      ctx.beginPath();
      ctx.arc(bx, by, r, 0, Math.PI * 2);
      ctx.fillStyle = n.t === 'k' ? '#b08d4f' : '#10142a';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#e2c275';
      ctx.stroke();
      ctx.fillStyle = n.t === 'k' ? '#0a0d1c' : '#e2c275';
      ctx.fillText(String(i + 1), bx, by + 0.5);
    });

    perf.frameMs = performance.now() - started;
    if (!$('perf').hidden) {
      $('perf').textContent = `frame ${perf.frameMs.toFixed(1)} ms | scene ${perf.sceneMs.toFixed(1)} ms (${perf.nodes} nodes, ${perf.edges} links, ${perf.redraws} redraws) | zoom ${s.toFixed(2)} | ${canvas.width}x${canvas.height}`;
    }
  }
  const nodeRadius = (n) => ({ s: 51, n: 76, k: 108, m: 110, j: 76, c: 260 }[n.t] || 51);

  function loop() {
    if (dirty) draw();
    requestAnimationFrame(loop);
  }

  // ---------- camera ----------
  function fitAll() {
    const r = canvas.getBoundingClientRect();
    view = { x: 0, y: 0, scale: Math.min(r.width, r.height) / 18400 };
  }
  function focusOn(id, scale) {
    const n = tree.nodes[id];
    if (!n) return;
    view.x = n.x; view.y = n.y;
    if (scale) view.scale = scale;
    dirty = true;
  }
  // Frames the allocated part of the tree.
  function fitBuild() {
    if (allocated.size < 2) return fitAll();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const id of allocated) {
      const n = tree.nodes[id];
      x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y);
    }
    const r = canvas.getBoundingClientRect();
    view.x = (x0 + x1) / 2; view.y = (y0 + y1) / 2;
    view.scale = Math.min(0.32, Math.min(r.width / (x1 - x0 + 1400), r.height / (y1 - y0 + 1400)));
  }

  // ---------- pointer ----------
  function nodeAt(sx, sy) {
    const [wx, wy] = toWorld(sx, sy);
    let best = null, bestD = Infinity;
    for (const id of nodeIds) {
      const n = tree.nodes[id];
      const r = Math.max(nodeRadius(n), 7 / view.scale);
      const d = Math.hypot(n.x - wx, n.y - wy);
      if (d <= r && d < bestD) { best = id; bestD = d; }
    }
    return best;
  }
  const canPick = (id) => {
    const n = tree.nodes[id];
    return n && isMilestone(n) && (!spec() || allocated.has(id));
  };

  let drag = null;
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); // no text selection or native drag while moving the tree
    canvas.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: false };
  });
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    if (drag) {
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
      if (drag.moved) {
        view.x = drag.vx - dx / view.scale;
        view.y = drag.vy - dy / view.scale;
        canvas.classList.add('dragging');
        hideTip();
        dirty = true;
      }
      return;
    }
    const id = nodeAt(e.clientX - r.left, e.clientY - r.top);
    if (id !== hover) { hover = id; dirty = true; }
    canvas.classList.toggle('pick', Boolean(id && canPick(id)));
    if (id) showTip(id, e.clientX - r.left, e.clientY - r.top); else hideTip();
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!drag) return;
    const wasDrag = drag.moved;
    drag = null;
    canvas.classList.remove('dragging');
    if (wasDrag) return;
    const r = canvas.getBoundingClientRect();
    const id = nodeAt(e.clientX - r.left, e.clientY - r.top);
    if (!id) return;
    if (!canPick(id)) {
      const n = tree.nodes[id];
      if (isMilestone(n) && spec()) say('That node is not part of the imported build.', true);
      return;
    }
    const i = order.indexOf(id);
    if (i >= 0 && i < inherited) return say(`That point comes from ${previousTitle || 'the tree before'}. Change it there and this tree follows.`, true);
    const list = extras();
    if (i >= 0) list.splice(i - inherited, 1); else list.push(id);
    setExtras(list);
  });
  // If the system takes the pointer away mid-drag, drop the drag instead of staying stuck in it.
  const endDrag = () => { drag = null; canvas.classList.remove('dragging'); };
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('lostpointercapture', endDrag);
  canvas.addEventListener('dragstart', (e) => e.preventDefault());
  canvas.addEventListener('pointerleave', () => { if (hover) { hover = null; dirty = true; } hideTip(); });
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left, sy = e.clientY - r.top;
    const [wx, wy] = toWorld(sx, sy);
    view.scale = Math.min(0.9, Math.max(0.03, view.scale * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
    // keep the point under the cursor where it is
    view.x = wx - (sx - r.width / 2) / view.scale;
    view.y = wy - (sy - r.height / 2) / view.scale;
    hideTip();
    dirty = true;
  }, { passive: false });
  window.addEventListener('resize', resize);
  // D shows drawing times in the corner, to help track down slowness.
  window.addEventListener('keydown', (e) => {
    if (e.key.toLowerCase() !== 'd' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
    $('perf').hidden = !$('perf').hidden;
    dirty = true;
  });

  // ---------- tooltip ----------
  let tipFor = null; // what the tooltip currently shows, so it is rebuilt only when that changes
  function placeTip(sx, sy) {
    const tip = $('tip');
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(6, Math.min(sx + 18, size.w - w - 6)) + 'px';
    tip.style.top = Math.max(6, Math.min(sy + 18, size.h - h - 6)) + 'px';
  }
  function showTip(id, sx, sy) {
    const n = tree.nodes[id];
    const tip = $('tip');
    const key = id + '|' + order.indexOf(id);
    if (tipFor === key && !tip.hidden) return placeTip(sx, sy);
    tipFor = key;
    tip.textContent = '';
    const add = (cls, text) => { const d = document.createElement('div'); d.className = cls; d.textContent = text; tip.appendChild(d); };
    add('t', n.t === 'c' ? tree.classes[n.ci].name : n.n);
    add('k', KIND_LABEL[n.t]);
    for (const line of n.s) for (const part of String(line).split('\n')) add('s', part);
    const i = order.indexOf(id);
    if (i >= 0) {
      const step = plan.steps.find((s) => s.id === id);
      const cost = step && step.cost !== null ? `, ${step.cost} ${step.cost === 1 ? 'point' : 'points'} from the previous step` : '';
      add('p', `Number ${i + 1} in the order${cost}. ${i < inherited ? `Comes from ${previousTitle || 'the tree before'}.` : 'Click to remove.'}`);
    } else if (canPick(id)) {
      add('p', 'Click to add to the order.');
    }
    tip.hidden = false;
    placeTip(sx, sy);
  }
  function hideTip() {
    if (tipFor === null) return;
    tipFor = null;
    $('tip').hidden = true;
  }

  // ---------- sidebar ----------
  function say(text, error) {
    $('msg').textContent = text || '';
    $('msg').classList.toggle('error', Boolean(error));
  }

  function renderSidebar() {
    const s = spec();
    $('summary').textContent = s
      ? `${tree.classes[s.classId] ? tree.classes[s.classId].name : 'Unknown class'}, ${Math.max(0, allocated.size - 1)} points`
      : '';
    const sel = $('spec');
    $('spec-row').hidden = build.specs.length < 2;
    sel.textContent = '';
    build.specs.forEach((sp, i) => {
      const o = document.createElement('option');
      o.value = String(i);
      o.textContent = sp.title || `Tree ${i + 1}`;
      o.selected = i === build.specIndex;
      sel.appendChild(o);
    });

    // Build notes: the same space as the order list, switched by the "Notes" link.
    const hasNotes = Boolean(build.notes);
    if (!hasNotes) showNotes = false;
    $('toggle-notes').hidden = !hasNotes;
    $('toggle-notes').textContent = showNotes ? 'Order' : 'Notes';
    $('order-title').textContent = showNotes ? 'Build notes' : 'Order of the points';
    $('suggest').hidden = showNotes;
    $('clear').hidden = showNotes;
    $('notes').hidden = !showNotes;
    $('order').hidden = showNotes;
    $('notes').textContent = build.notes || '';

    const list = $('order');
    list.textContent = '';
    if (order.length === 0) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.style.display = 'block';
      li.textContent = s ? 'No order yet. Click "Suggest order" or click the nodes on the tree.' : 'Import a build, or click notables and keystones on the tree.';
      list.appendChild(li);
    }
    order.forEach((id, i) => {
      const n = tree.nodes[id];
      if (!n) return;
      // a divider where the points of the previous tree end and the new ones begin
      if (inherited > 0 && (i === 0 || i === inherited)) {
        const head = document.createElement('li');
        head.className = 'group';
        head.textContent = i === 0 ? `From ${previousTitle || 'the tree before'}` : `New in ${spec().title || 'this tree'}`;
        list.appendChild(head);
      }
      const locked = i < inherited;
      const step = plan.steps.find((x) => x.id === id);
      const li = document.createElement('li');
      li.className = (n.t === 'k' ? 'keystone' : '') + (id === focusId ? ' focus' : '') + (locked ? ' locked' : '');
      li.dataset.id = id;
      // the handle to drag the point to another place (only the new points of this tree move)
      const grip = document.createElement('span'); grip.className = 'grip'; grip.setAttribute('aria-hidden', 'true');
      const num = document.createElement('span'); num.className = 'num'; num.textContent = String(i + 1);
      const nm = document.createElement('span'); nm.className = 'nm'; nm.textContent = n.n; nm.title = n.n;
      const cost = document.createElement('span'); cost.className = 'cost';
      if (step && step.cost === null && s) { cost.textContent = 'not reachable'; cost.classList.add('unreachable'); }
      else if (step && s) cost.textContent = step.cost + (step.cost === 1 ? ' pt' : ' pts');
      const tools = document.createElement('span'); tools.className = 'tools';
      const tool = (label, title, fn) => {
        const b = document.createElement('button');
        b.textContent = label; b.title = title; b.setAttribute('aria-label', title + ' ' + n.n);
        b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
        tools.appendChild(b);
      };
      // Points from the tree before keep their place here: they are changed in that tree.
      if (!locked) {
        const k = i - inherited; // position among the new points
        tool('✕', 'Remove', () => { const l = extras(); l.splice(k, 1); setExtras(l); });
        li.classList.add('movable');
        li.tabIndex = 0;
        li.title = 'Drag to change the order (or Alt + arrow keys)';
        li.addEventListener('pointerdown', (e) => startDrag(e, li, k));
        li.addEventListener('keydown', (e) => {
          if (!e.altKey || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
          e.preventDefault();
          const to = k + (e.key === 'ArrowUp' ? -1 : 1);
          if (to < 0 || to >= order.length - inherited) return;
          focusId = id;
          refocus = id;
          moveExtra(k, to);
        });
      }
      li.append(grip, num, nm, cost, tools);
      li.addEventListener('click', () => {
        if (justDragged) return; // the click that ends a drag does not select the point
        focusId = id; focusOn(id, Math.max(view.scale, 0.22)); renderSidebar();
      });
      list.appendChild(li);
    });

    const foot = [];
    if (s) {
      const left = allocated.size - 1 - plan.spent;
      foot.push(`${plan.spent} of ${Math.max(0, allocated.size - 1)} points are covered by the order.`);
      if (left > 0) foot.push(`${left} more are side nodes, masteries or jewel sockets.`);
      const missing = milestoneIds().filter((id) => !order.includes(id)).length;
      if (missing > 0) foot.push(`${missing} notables or keystones of the build are not in the order yet.`);
    }
    $('foot').textContent = foot.join(' ');
    // after a move with the keyboard, the moved row keeps the keyboard focus
    if (refocus) {
      const row = list.querySelector(`li[data-id="${refocus}"]`);
      refocus = null;
      if (row) row.focus();
    }
  }
  const milestoneIds = () => [...allocated].filter((id) => isMilestone(tree.nodes[id]));

  // The points that are new in this tree, in their current order.
  const extras = () => order.slice(inherited);
  // Moves the new point at position `from` to position `to` (both among the new points).
  function moveExtra(from, to) {
    if (from === to) return;
    const l = extras();
    l.splice(to, 0, l.splice(from, 1)[0]);
    setExtras(l);
  }

  // ---------- drag and drop in the order ----------
  // Hold a row and move it: the row follows the pointer, a line shows where it will land,
  // and letting go puts it there. Rows from the tree before stay where they are.
  let refocus = null;     // id of the row that gets the keyboard focus after the next render
  let justDragged = false;
  const DRAG_FROM = 4;    // pixels the pointer must travel before a press becomes a drag
  function startDrag(e, li, from) {
    if (e.button !== 0 || e.target.closest('button')) return;
    const list = $('order');
    const startY = e.clientY;
    let dragging = false;
    let target = from;
    let scrollTimer = null;
    const marker = document.createElement('li');
    marker.className = 'drop-line';
    marker.setAttribute('aria-hidden', 'true');

    // where the row would land, among the new points, for the pointer at height y
    function slotAt(y) {
      const rows = [...list.querySelectorAll('li.movable')].filter((r) => r !== li);
      let slot = rows.length;
      for (let i = 0; i < rows.length; i++) {
        const box = rows[i].getBoundingClientRect();
        if (y < box.top + box.height / 2) { slot = i; break; }
      }
      return { slot, rows };
    }
    function place(y) {
      const { slot, rows } = slotAt(y);
      target = slot;
      if (slot < rows.length) list.insertBefore(marker, rows[slot]);
      else if (rows.length) rows[rows.length - 1].after(marker);
      else li.after(marker);
      li.style.transform = `translateY(${y - startY}px)`;
    }
    // scrolls the list while the pointer is held near its top or bottom edge
    function edgeScroll(y) {
      clearInterval(scrollTimer);
      const box = list.getBoundingClientRect();
      const speed = y < box.top + 30 ? -8 : y > box.bottom - 30 ? 8 : 0;
      if (speed) scrollTimer = setInterval(() => { list.scrollTop += speed; place(lastY); }, 16);
    }
    let lastY = startY;
    function onMove(ev) {
      lastY = ev.clientY;
      if (!dragging) {
        if (Math.abs(ev.clientY - startY) < DRAG_FROM) return;
        dragging = true;
        li.classList.add('dragging');
        list.classList.add('sorting');
      }
      place(ev.clientY);
      edgeScroll(ev.clientY);
    }
    function onEnd(ev) {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onEnd);
      window.removeEventListener('pointercancel', onEnd);
      clearInterval(scrollTimer);
      if (!dragging) return;
      marker.remove();
      li.classList.remove('dragging');
      list.classList.remove('sorting');
      li.style.transform = '';
      justDragged = true;
      setTimeout(() => { justDragged = false; }, 0);
      if (ev.type === 'pointerup') moveExtra(from, target);
    }
    // followed on the whole window, so a fast move off the row does not lose the drag
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onEnd);
    window.addEventListener('pointercancel', onEnd);
  }
  // Sets how the new points of this tree are arranged (null = automatically) and saves.
  function setExtras(list) {
    if (spec()) build.tails[build.specIndex] = list; else build.order = list || [];
    return commit();
  }

  // Saves the build and gets the order and the costs back from the main process.
  async function commit() {
    const result = await api.save(build);
    plan = result.plan;
    order = result.order;
    inherited = result.inherited;
    previousTitle = result.previousTitle;
    dirty = true;
    renderSidebar();
  }

  $('import').addEventListener('click', async () => {
    say('Reading the code...');
    const result = await api.importPob($('pob').value);
    if (result.error) return say(result.error, true);
    // every tree starts arranged automatically, each one continuing the one before
    build = { specs: result.specs, specIndex: result.active, tails: result.specs.map(() => null), order: [], notes: result.notes || '' };
    refreshAllocated();
    focusId = null;
    await commit();
    fitBuild();
    const unknown = spec().nodes.length - spec().nodes.filter((id) => tree.nodes[id]).length;
    say(`Imported${build.notes ? ', with the build notes' : ''}. Order suggested from the class start outwards${build.specs.length > 1 ? ', each tree continuing the one before' : ''}.${unknown > 0 ? ` ${unknown} nodes are outside this tree (ascendancy, cluster jewels) and were left out.` : ''}`);
    $('pob').value = '';
  });
  $('spec').addEventListener('change', async (e) => {
    build.specIndex = Number(e.target.value);
    refreshAllocated();
    focusId = null;
    await commit();
    fitBuild();
    say(inherited > 0 ? `Switched tree. It continues the order of ${previousTitle}.` : 'Switched tree.');
  });
  $('suggest').addEventListener('click', async () => {
    if (!spec()) return say('Import a build first: the suggestion needs to know which nodes you take.', true);
    await setExtras(null); // null = arrange the new points of this tree automatically
    say(inherited > 0 ? `New points of this tree arranged again, after the ones from ${previousTitle}.` : 'Order suggested from the class start outwards.');
  });
  $('clear').addEventListener('click', () => { focusId = null; setExtras([]); say(inherited > 0 ? `Cleared the new points of this tree. The ones from ${previousTitle} stay.` : ''); });
  $('toggle-notes').addEventListener('click', () => { showNotes = !showNotes; renderSidebar(); });

  // ---------- start ----------
  refreshAllocated();
  resize();
  if (spec()) fitBuild(); else fitAll();
  await commit();
  $('loading').hidden = true;
  loop();
})().catch((err) => {
  const box = document.getElementById('loading');
  box.hidden = false;
  box.textContent = 'Could not open the tree: ' + err.message;
});
