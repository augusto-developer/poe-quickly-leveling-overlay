'use strict';
/* Route settings window: areas on the left, gems of the selected area on the right. */
(async function () {
  const api = window.settingsApi;
  const { gems, areas, visited } = await api.getData();
  let guide = (await api.getGuide()) || { steps: [] };

  const $ = (id) => document.getElementById(id);
  const gemByName = new Map(gems.map((g) => [g.name, g]));
  const KIND = { skill: 'Skill', support: 'Support' };

  // Area list: the campaign in order, act by act. A name that exists in two acts (Lioneye's
  // Watch is in Acts 1 and 6) is listed once in each, as two separate areas.
  const stepId = (s) => `${s.act || 0}|${s.area}`;
  const areaList = [];
  for (const group of areas) {
    for (const name of group.areas) areaList.push({ name, act: group.act, hint: 'Act ' + group.act });
  }
  const known = new Set(areaList.map((a) => a.name));
  // Areas that only showed up in your Client.txt (hideouts and the like) have no act.
  for (const name of visited) if (!known.has(name)) { areaList.push({ name, act: null, hint: 'visited' }); known.add(name); }
  for (const a of areaList) a.id = stepId({ area: a.name, act: a.act });
  const areaOrder = new Map(areaList.map((a, i) => [a.id, i]));
  let actFilter = 0; // 0 = every act
  let confirmRemove = null; // id of the area whose X was clicked once and is waiting for the second click

  let selected = guide.steps.length ? stepId(guide.steps[0]) : null;
  let kind = 'all';
  const colors = new Set(['str', 'dex', 'int', 'white']);
  let cursor = 0; // highlighted row in the results
  let shown = [];

  // ---------- persistence ----------
  let savedTimer = null;
  function save() {
    guide.steps.sort((x, y) => (areaOrder.get(stepId(x)) ?? 1e9) - (areaOrder.get(stepId(y)) ?? 1e9));
    api.saveGuide(guide);
    edits.record();
    $('saved').textContent = 'Saved';
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { $('saved').textContent = ''; }, 1500);
  }
  const step = () => guide.steps.find((s) => stepId(s) === selected) || null;

  function el(tag, props = {}, children = []) {
    const node = Object.assign(document.createElement(tag), props);
    for (const c of [].concat(children)) node.append(c);
    return node;
  }
  const socket = (name) => el('span', { className: 'socket ' + (gemByName.get(name)?.color || 'unknown') });

  // ---------- route column ----------
  function renderSteps() {
    const list = $('steps');
    list.textContent = '';
    if (guide.steps.length === 0) {
      list.append(el('li', { className: 'route-empty', textContent: 'The route is empty.' }));
    }
    for (const s of guide.steps) {
      const id = stepId(s);
      const meta = el('div', { className: 'step-meta' }, [
        el('span', { textContent: s.act ? 'Act ' + s.act : 'custom area' }),
        el('span', { className: 'sockets' }, s.gems.map(socket)),
        el('span', { textContent: s.gems.length === 0 ? 'no gems' : '' }),
      ]);
      // X on the right removes the area. With gems in it, the first click only asks.
      const asking = confirmRemove === id;
      const remove = el('button', { className: 'step-remove' + (asking ? ' asking' : ''), textContent: asking ? 'Remove?' : '✕', title: asking ? 'Click again to remove this area and its gems' : 'Remove ' + s.area + ' from the route' });
      remove.setAttribute('aria-label', 'Remove ' + s.area + ' from the route');
      remove.addEventListener('click', (e) => {
        e.stopPropagation();
        if (s.gems.length > 0 && !asking) { confirmRemove = id; return renderSteps(); }
        removeStep(id);
      });
      remove.addEventListener('keydown', (e) => e.stopPropagation());
      const li = el('li', { className: 'step', tabIndex: 0 }, [el('div', { className: 'step-name', textContent: s.area }), meta, remove]);
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', String(id === selected));
      const pick = () => { confirmRemove = null; selected = id; renderAll(); $('gem-input').focus(); };
      li.addEventListener('click', pick);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      list.append(li);
    }
  }

  function removeStep(id) {
    guide.steps = guide.steps.filter((s) => stepId(s) !== id);
    confirmRemove = null;
    if (selected === id) selected = guide.steps.length ? stepId(guide.steps[0]) : null;
    save();
    renderAll();
  }

  // ---------- "add area" field ----------
  // Act filter: with an act chosen, the list shows only that act's areas.
  const actAreas = () => (actFilter ? areaList.filter((a) => a.act === actFilter) : areaList);
  function renderActs() {
    const box = $('acts');
    box.textContent = '';
    for (const act of [0, ...areas.map((g) => g.act)]) {
      const b = el('button', { textContent: act ? String(act) : 'All', title: act ? 'Only areas of Act ' + act : 'Areas of every act' });
      b.setAttribute('aria-pressed', String(act === actFilter));
      // mousedown, so the area field keeps the focus and the list stays open
      b.addEventListener('mousedown', (e) => {
        e.preventDefault();
        actFilter = act;
        areaCursor = 0;
        renderActs();
        $('area-input').focus();
        renderAreaDrop();
      });
      box.append(b);
    }
  }
  let areaCursor = 0;
  let areaShown = [];
  function renderAreaDrop() {
    const q = $('area-input').value.trim();
    const drop = $('area-drop');
    const used = new Set(guide.steps.map(stepId));
    const pool = actAreas();
    // stable sort: two acts with the same name keep their act order
    areaShown = (q ? GemSearch.rank(q, pool, (a) => a.name) : pool).filter((a) => !used.has(a.id));
    // offer the typed text as a custom area only when no listed area has that name
    const typedIsListed = areaList.some((a) => a.name.toLowerCase() === q.toLowerCase());
    if (q && !typedIsListed && !used.has(stepId({ area: q, act: null }))) areaShown.push({ name: q, act: null, hint: 'use this name', id: stepId({ area: q, act: null }) });
    areaCursor = Math.min(areaCursor, Math.max(0, areaShown.length - 1));
    drop.textContent = '';
    areaShown.forEach((a, i) => {
      const li = el('li', {}, [el('span', { textContent: a.name }), el('small', { textContent: a.hint })]);
      li.setAttribute('aria-selected', String(i === areaCursor));
      li.addEventListener('mousedown', (e) => { e.preventDefault(); addArea(a); });
      drop.append(li);
    });
    drop.hidden = areaShown.length === 0 || document.activeElement !== $('area-input');
    drop.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  function addArea(entry) {
    if (!guide.steps.some((s) => stepId(s) === entry.id)) guide.steps.push({ area: entry.name, act: entry.act, gems: [] });
    selected = entry.id;
    $('area-input').value = '';
    save();
    renderAll();
    $('gem-input').focus();
  }
  $('area-input').addEventListener('input', () => { areaCursor = 0; renderAreaDrop(); });
  $('area-input').addEventListener('focus', renderAreaDrop);
  $('area-input').addEventListener('blur', () => { $('area-drop').hidden = true; });
  $('area-input').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); areaCursor = Math.min(areaCursor + 1, areaShown.length - 1); renderAreaDrop(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); areaCursor = Math.max(areaCursor - 1, 0); renderAreaDrop(); }
    else if (e.key === 'Enter' && areaShown[areaCursor]) addArea(areaShown[areaCursor]);
    else if (e.key === 'Escape') e.target.blur();
  });

  // ---------- gem column ----------
  function toggleGem(name) {
    const s = step();
    if (!s) return;
    const i = s.gems.indexOf(name);
    if (i >= 0) s.gems.splice(i, 1); else s.gems.push(name);
    save();
    renderAll();
  }

  function renderChosen() {
    const box = $('chosen');
    box.textContent = '';
    const s = step();
    if (!s || s.gems.length === 0) {
      box.append(el('span', { className: 'chosen-empty', textContent: 'No gems chosen for this area.' }));
      return;
    }
    for (const name of s.gems) {
      const remove = el('button', { textContent: '×', title: 'Remove ' + name });
      remove.setAttribute('aria-label', 'Remove ' + name);
      remove.addEventListener('click', () => toggleGem(name));
      // free quest reward or bought from the vendor: shown next to the gem in the overlay
      const reward = s.get && s.get[name] === 'reward';
      const get = el('button', { className: 'get' + (reward ? ' reward' : ''), textContent: reward ? 'free' : 'buy', title: reward ? 'Taken as the free quest reward. Click to buy it instead.' : 'Bought from the vendor. Click to take it as the free quest reward.' });
      get.addEventListener('click', () => {
        s.get = s.get || {};
        if (reward) delete s.get[name]; else s.get[name] = 'reward';
        save();
        renderChosen();
      });
      box.append(el('span', { className: 'chip' }, [socket(name), name, get, remove]));
    }
  }

  function renderResults() {
    const s = step();
    const picked = new Set(s ? s.gems : []);
    const q = $('gem-input').value;
    const pool = gems.filter((g) => (kind === 'all' || g.type === kind) && colors.has(g.color));
    const ranked = GemSearch.rank(q, pool, (g) => g.name);
    shown = ranked.slice(0, 80);
    cursor = Math.min(cursor, Math.max(0, shown.length - 1));

    $('count').textContent = ranked.length === 0 ? '' :
      ranked.length > shown.length ? `Showing ${shown.length} of ${ranked.length} gems. Type to filter.` :
      `${ranked.length} ${ranked.length === 1 ? 'gem' : 'gems'}`;

    const list = $('results');
    list.textContent = '';
    if (shown.length === 0) {
      list.append(el('li', { className: 'no-results', textContent: 'No gem matches the search. Check the type and colour filters.' }));
      return;
    }
    shown.forEach((g, i) => {
      const wiki = el('button', { className: 'wiki', textContent: 'wiki', title: 'Where to get ' + g.name + ' (opens poewiki in the browser)' });
      wiki.addEventListener('click', (e) => { e.stopPropagation(); api.openWiki(g.name); });
      const li = el('li', { className: 'gem' + (picked.has(g.name) ? ' picked' : '') }, [
        el('span', { className: 'socket ' + g.color }),
        el('span', { className: 'name', textContent: g.name }),
        wiki,
        el('span', { className: 'kind', textContent: KIND[g.type] }),
        el('span', { className: 'level', textContent: 'level ' + g.level }),
      ]);
      li.setAttribute('aria-selected', String(i === cursor));
      li.addEventListener('click', () => { cursor = i; toggleGem(g.name); });
      list.append(li);
    });
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }

  $('gem-input').addEventListener('input', () => { cursor = 0; renderResults(); });
  $('gem-input').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); cursor = Math.min(cursor + 1, shown.length - 1); renderResults(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); cursor = Math.max(cursor - 1, 0); renderResults(); }
    else if (e.key === 'Enter' && shown[cursor]) { toggleGem(shown[cursor].name); e.target.select(); }
  });
  $('kind').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    kind = b.dataset.kind;
    for (const x of $('kind').children) x.setAttribute('aria-pressed', String(x === b));
    cursor = 0;
    renderResults();
  });
  $('colors').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const c = b.dataset.color;
    if (colors.has(c)) colors.delete(c); else colors.add(c);
    b.setAttribute('aria-pressed', String(colors.has(c)));
    cursor = 0;
    renderResults();
  });
  $('remove-step').addEventListener('click', () => removeStep(selected));

  $('open-links').addEventListener('click', () => api.openLinks());

  // ---------- import / export ----------
  $('export').addEventListener('click', async () => {
    const ok = await api.exportGuide(guide);
    if (ok) $('saved').textContent = 'Exported';
  });
  $('import').addEventListener('click', async () => {
    const result = await api.importGuide();
    if (!result) return;
    if (result.error) { $('saved').textContent = result.error; return; }
    guide = result.guide;
    selected = guide.steps.length ? stepId(guide.steps[0]) : null;
    save();
    renderAll();
    $('saved').textContent = 'Imported';
  });

  // ---------- "From PoB" ----------
  // Reads a build and lists its gems skill set by skill set: each set is for an act (taken
  // from its title, and changeable), and a gem goes to the route in the act of the first set
  // that has it. The route only changes with "Add to the route" or "Replace the route".
  const dialog = $('pob-dialog');
  let pob = null;        // { className, classes, skillSets } of the build read
  let setActs = [];      // act of each skill set, or null to leave the set out
  let off = new Set();   // gems unticked
  let plan = null;       // the route for the ticked gems

  // Where each gem is listed: the first set, by act, that has it -> { [name]: set index }.
  function firstSets() {
    const order = pob.skillSets.map((_x, i) => i).filter((i) => setActs[i]).sort((a, b) => setActs[a] - setActs[b] || a - b);
    const first = {};
    for (const i of order) for (const g of pob.skillSets[i].groups) for (const x of g.gems) if (!(x.name in first)) first[x.name] = i;
    return first;
  }
  const wanted = () => Object.entries(firstSets()).filter(([name]) => !off.has(name)).map(([name, i]) => ({ name, act: setActs[i] }));

  function placeText(name) {
    if (off.has(name)) return { text: 'not in the route', cls: '' };
    const p = plan && plan.places[name];
    if (p && p.start) return { text: 'your class gets it on The Twilight Strand', cls: '' };
    if (!p) return { text: 'no quest or vendor of the campaign gives it', cls: 'none' };
    const where = `Act ${p.act}, after ${p.area}`;
    if (p.how === 'reward') return { text: `${where}: free from ${p.npc}`, cls: 'reward' };
    return { text: `${where}: buy from ${p.npc || 'the vendor'}`, cls: '' };
  }
  function actSelect(i) {
    const select = el('select', { className: 'set-act', title: 'The act this skill set is for' });
    select.append(el('option', { value: '', textContent: 'Leave out' }));
    for (let a = 1; a <= 10; a++) select.append(el('option', { value: String(a), textContent: 'Act ' + a }));
    select.value = setActs[i] ? String(setActs[i]) : '';
    select.addEventListener('change', () => { setActs[i] = Number(select.value) || null; replan(); });
    return select;
  }
  function renderPob() {
    const box = $('pob-groups');
    box.textContent = '';
    const first = firstSets();
    pob.skillSets.forEach((set, i) => {
      const head = el('div', { className: 'set-head' }, [el('h3', { textContent: set.title || `Skill set ${i + 1}` }), actSelect(i)]);
      const section = el('div', { className: 'pob-group' }, [head]);
      if (!setActs[i]) section.append(el('p', { className: 'set-note', textContent: 'Left out of the route.' }));
      let shown = 0;
      for (const group of set.groups) {
        const gems = group.gems.filter((g) => first[g.name] === i);
        if (gems.length === 0) continue;
        section.append(el('div', { className: 'link-label', textContent: group.label }));
        for (const g of gems) {
          shown++;
          const tick = el('input', { type: 'checkbox', checked: !off.has(g.name) });
          tick.setAttribute('aria-label', g.name);
          const place = placeText(g.name);
          const row = el('label', { className: 'pob-gem' + (off.has(g.name) ? ' off' : '') }, [
            tick, socket(g.name), el('span', { className: 'name', textContent: g.name }),
            el('span', { className: 'place ' + place.cls, textContent: place.text }),
          ]);
          tick.addEventListener('change', () => { if (tick.checked) off.delete(g.name); else off.add(g.name); replan(); });
          section.append(row);
        }
      }
      if (setActs[i] && shown === 0) section.append(el('p', { className: 'set-note', textContent: 'No new gems: they are all in an earlier set.' }));
      box.append(section);
    });
    const count = plan ? plan.steps.reduce((n, st) => n + st.gems.length, 0) : 0;
    $('pob-missing').textContent = count ? `${count} gems in ${plan.steps.length} areas.` : '';
    $('pob-add').disabled = $('pob-replace').disabled = count === 0;
  }
  async function replan() {
    plan = await api.plan($('pob-class').value, wanted());
    renderPob();
  }
  $('from-pob').addEventListener('click', () => {
    $('pob-error').textContent = '';
    dialog.showModal();
    $('pob-code').focus();
  });
  $('pob-cancel').addEventListener('click', () => { fromTree = false; dialog.close(); });
  let readCode = '';      // the code of the build read, to hand to the tree window
  let fromTree = false;  // the code came from the tree window: no need to offer it back
  $('pob-read').addEventListener('click', async () => {
    readCode = $('pob-code').value;
    const result = await api.readPob(readCode);
    if (result.error) { $('pob-error').textContent = result.error; return; }
    if (result.skillSets.length === 0) { $('pob-error').textContent = 'The build was read, but it has no gems in it.'; return; }
    $('pob-error').textContent = '';
    pob = result;
    setActs = pob.skillSets.map((x) => x.act);
    off = new Set();
    const select = $('pob-class');
    select.textContent = '';
    for (const c of pob.classes) select.append(el('option', { value: c, textContent: c, selected: c === pob.className }));
    $('pob-pick').hidden = false;
    await replan();
  });
  $('pob-class').addEventListener('change', replan);

  function applyPlan(replace) {
    if (!plan) return;
    if (replace) guide.steps = [];
    for (const ps of plan.steps) {
      let st = guide.steps.find((x) => stepId(x) === stepId(ps));
      if (!st) { st = { area: ps.area, act: ps.act, gems: [], get: {}, from: {} }; guide.steps.push(st); }
      st.get = st.get || {};
      st.from = st.from || {};
      for (const g of ps.gems) {
        if (!st.gems.includes(g)) st.gems.push(g);
        if (ps.get[g] === 'reward') st.get[g] = 'reward';
        if (ps.from && ps.from[g]) st.from[g] = ps.from[g];
      }
    }
    guide.class = $('pob-class').value;
    selected = guide.steps.length ? stepId(guide.steps[0]) : null;
    save();
    renderAll();
    dialog.close();
    $('saved').textContent = replace ? 'Route replaced' : 'Gems added';
    $('ask-tree').hidden = fromTree;
    fromTree = false;
  }
  $('ask-tree-yes').addEventListener('click', () => { $('ask-tree').hidden = true; api.sendToTree(readCode); });
  $('ask-tree-no').addEventListener('click', () => { $('ask-tree').hidden = true; });
  // A code from the tree window: the dialog opens with the build already read.
  async function takeHandedCode() {
    const code = await api.takePob();
    if (!code) return;
    fromTree = true;
    $('ask-tree').hidden = true;
    $('pob-error').textContent = '';
    if (!dialog.open) dialog.showModal();
    $('pob-code').value = code;
    $('pob-read').click();
  }
  api.onPobOffer(takeHandedCode);
  $('pob-add').addEventListener('click', () => applyPlan(false));
  $('pob-replace').addEventListener('click', () => applyPlan(true));

  function renderAll() {
    $('class-label').textContent = guide.class ? 'Planned for ' + guide.class : '';
    const s = step();
    $('picker').hidden = !s;
    $('blank').hidden = !!s;
    renderSteps();
    if (s) {
      $('area-title').textContent = s.area + (s.act ? ` (Act ${s.act})` : '');
      renderChosen();
      renderResults();
    }
  }
  // ---------- undo / redo ----------
  let refreshEdits = () => {};
  const edits = EditHistory.createHistory({
    snapshot: () => JSON.stringify({ class: guide.class || '', steps: guide.steps }),
    restore: (snap) => {
      const back = JSON.parse(snap);
      guide.class = back.class;
      guide.steps = back.steps;
      api.saveGuide(guide);
      confirmRemove = null;
      if (!step()) selected = guide.steps.length ? stepId(guide.steps[0]) : null;
      renderAll();
    },
    onChange: () => refreshEdits(),
  });
  refreshEdits = EditHistory.bindHistory(edits, $('undo'), $('redo'));

  renderActs();
  renderAll();
  if (step()) $('gem-input').focus(); else $('area-input').focus();
  takeHandedCode();
})();
