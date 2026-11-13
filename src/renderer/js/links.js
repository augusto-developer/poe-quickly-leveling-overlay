'use strict';
/* Links window: for each act, the active gems on the left with the gems linked to each, and
   the supports on the right. Click an active gem, then click supports to link them; the box on
   the other active gems links them too (two skills in one item). */
(async function () {
  const api = window.linksApi;
  const $ = (id) => document.getElementById(id);
  let data = await api.getData();
  let gemByName = new Map(data.gems.map((g) => [g.name, g]));

  // The act shown: the one asked for, else the first act of the route, else Act 1.
  const firstRouteAct = () => (data.steps.find((s) => s.act) || {}).act || 1;
  let act = data.act || firstRouteAct();
  let selected = null; // name of the active gem whose link is being edited
  let asking = false;  // waiting for "replace the links of this act?"

  function el(tag, props = {}, children = []) {
    const node = Object.assign(document.createElement(tag), props);
    for (const c of [].concat(children)) node.append(c);
    return node;
  }
  const socket = (name) => el('span', { className: 'socket ' + (gemByName.get(name)?.color || 'unknown') });
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  // Supports are listed by colour, red, green, blue, then white, and by name within a colour.
  const COLOR_ORDER = { str: 0, dex: 1, int: 2, white: 3 };
  const colorRank = (name) => COLOR_ORDER[gemByName.get(name)?.color] ?? 4;
  const byColor = (a, b) => colorRank(a) - colorRank(b) || a.localeCompare(b);

  // ---------- the links of the act being edited ----------
  const current = () => {
    const a = GemLinks.actOf(data.links, act);
    return { extra: [...a.extra], links: a.links.map((l) => ({ skill: l.skill, supports: [...l.supports] })), hold: [...a.hold], drop: [...a.drop], swap: a.swap.map((x) => ({ ...x })) };
  };
  let set = current();
  let savedTimer = null;
  async function save(message = 'Saved') {
    data.links = await api.save(act, set);
    set = current();
    $('saved').textContent = message;
    clearTimeout(savedTimer);
    savedTimer = setTimeout(() => { $('saved').textContent = ''; }, 1500);
    render();
  }
  const pool = () => GemLinks.poolFor({ steps: data.steps, links: { ...data.links, [act]: set } }, act);
  const linkOf = (skill) => set.links.find((l) => l.skill === skill);
  const fromRoute = (name) => data.steps.some((s) => s.act === act && s.gems.includes(name));

  // ---------- Hold (kept in Set 2), Swap (for another gem) and Drop ----------
  const swapOf = (name) => set.swap.find((x) => x.from === name);
  const markOf = (name) => (set.hold.includes(name) ? 'hold' : set.drop.includes(name) ? 'drop' : swapOf(name) ? 'swap' : null);
  // Takes a gem out of every link of this act.
  function leaveLinks(name) {
    set.links = set.links.filter((l) => l.skill !== name);
    for (const l of set.links) l.supports = l.supports.filter((n) => n !== name);
    set.links = set.links.filter((l) => l.supports.length);
    if (selected === name) selected = null;
  }
  // Puts `to` wherever `from` is in the links: the gem swapped in takes the place of the old one.
  function replaceInLinks(from, to) {
    for (const l of set.links) {
      if (l.skill === from) l.skill = to;
      l.supports = [...new Set(l.supports.map((n) => (n === from ? to : n)))].filter((n) => n !== l.skill);
    }
    // two links for the same gem: keep the first
    set.links = set.links.filter((l, i) => set.links.findIndex((o) => o.skill === l.skill) === i && l.supports.length);
  }
  function clearMark(name) {
    const sw = swapOf(name);
    if (sw) replaceInLinks(sw.to, sw.from); // undoing a swap puts the old gem back in its links
    set.hold = set.hold.filter((n) => n !== name);
    set.drop = set.drop.filter((n) => n !== name);
    set.swap = set.swap.filter((x) => x.from !== name);
  }
  // Hold or Drop on or off. A marked gem leaves the links of this act.
  function setMark(name, mark) {
    const was = markOf(name);
    clearMark(name);
    if (was !== mark) {
      set[mark].push(name);
      leaveLinks(name);
    }
    save(was === mark ? 'Mark removed' : mark === 'hold' ? `${name}: kept in Set 2` : `${name}: drop it`);
  }
  function setSwap(from, to) {
    clearMark(from);
    if (!pool().includes(to)) set.extra.push(to); // a gem from the full list joins the act
    replaceInLinks(from, to);
    set.swap.push({ from, to });
    if (selected === from) selected = null;
    closeSwap();
    save(`${from}: swap for ${to}`);
  }
  function markButtons(name) {
    const mark = markOf(name);
    const make = (kind, title, onClick) => {
      const b = el('button', { className: 'mark-btn ' + kind, title: mark === kind ? 'Remove the mark' : title });
      b.setAttribute('aria-pressed', String(mark === kind));
      b.setAttribute('aria-label', `${title}: ${name}`);
      b.append($(kind + '-icon').content.cloneNode(true));
      b.addEventListener('click', (e) => { e.stopPropagation(); onClick(b); });
      return b;
    };
    return el('span', { className: 'marks' }, [
      make('hold', 'Hold: keep it in the weapon swap (Set 2)', () => setMark(name, 'hold')),
      make('swap', 'Swap: replace it with another gem', (b) => {
        if (mark === 'swap') { clearMark(name); return save('Swap removed'); }
        openSwap(name, b);
      }),
      make('drop', 'Drop: throw it away in this act', () => setMark(name, 'drop')),
    ]);
  }
  const markTag = (name) => {
    const mark = markOf(name);
    if (!mark) return '';
    const text = mark === 'hold' ? 'Set 2' : mark === 'drop' ? 'Drop' : `→ ${swapOf(name).to}`;
    return el('span', { className: 'tag ' + mark, textContent: text, title: mark === 'swap' ? `Swap for ${swapOf(name).to}` : '' });
  };

  // ---------- "swap for..." picker ----------
  let swapping = null; // the gem being swapped
  let swapShown = [];
  let swapCursor = 0;
  function openSwap(name, button) {
    closeAdd();
    swapping = name;
    swapCursor = 0;
    const panel = $('swap-panel');
    panel.hidden = false;
    $('swap-title').textContent = '';
    $('swap-title').append('Swap ', el('b', { textContent: name }), ' for:');
    $('swap-input').value = '';
    // next to the button, kept inside the window
    const r = button.getBoundingClientRect();
    panel.style.left = Math.max(8, Math.min(window.innerWidth - 348, r.right - 340)) + 'px';
    const below = r.bottom + 6;
    panel.style.top = (below + 340 > window.innerHeight ? Math.max(8, r.top - 346) : below) + 'px';
    renderSwap();
    $('swap-input').focus();
  }
  function closeSwap() { swapping = null; $('swap-panel').hidden = true; }
  function renderSwap() {
    if (!swapping) return;
    const q = $('swap-input').value.trim();
    const support = GemLinks.isSupport(swapping, gemByName);
    // first the gems of this act of the same kind, then any gem of the list
    const own = pool().filter((n) => n !== swapping && GemLinks.isSupport(n, gemByName) === support && !markOf(n));
    const ownRanked = q ? GemSearch.rank(q, own.map((n) => ({ name: n })), (g) => g.name).map((g) => g.name) : own;
    const others = q ? GemSearch.rank(q, data.gems.filter((g) => g.name !== swapping && !own.includes(g.name)), (g) => g.name).slice(0, 30).map((g) => g.name) : [];
    swapShown = [...ownRanked, ...others];
    swapCursor = Math.min(swapCursor, Math.max(0, swapShown.length - 1));
    const list = $('swap-list');
    list.textContent = '';
    const row = (n, i) => {
      const li = el('li', {}, [socket(n), el('span', { textContent: n }), el('small', { textContent: GemLinks.isSupport(n, gemByName) ? 'Support' : 'Active' })]);
      li.setAttribute('aria-selected', String(i === swapCursor));
      li.addEventListener('mousedown', (e) => { e.preventDefault(); setSwap(swapping, n); });
      return li;
    };
    if (ownRanked.length) list.append(el('li', { className: 'sep', textContent: `In Act ${act}` }));
    ownRanked.forEach((n, i) => list.append(row(n, i)));
    if (others.length) list.append(el('li', { className: 'sep', textContent: 'All gems' }));
    others.forEach((n, i) => list.append(row(n, ownRanked.length + i)));
    if (!swapShown.length) list.append(el('li', { className: 'sep', textContent: q ? 'No gem matches.' : 'Type to search all gems.' }));
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  $('swap-input').addEventListener('input', () => { swapCursor = 0; renderSwap(); });
  $('swap-input').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); swapCursor = Math.min(swapCursor + 1, swapShown.length - 1); renderSwap(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); swapCursor = Math.max(swapCursor - 1, 0); renderSwap(); }
    else if (e.key === 'Enter' && swapShown[swapCursor]) setSwap(swapping, swapShown[swapCursor]);
    else if (e.key === 'Escape') closeSwap();
  });
  document.addEventListener('mousedown', (e) => {
    if (swapping && !e.target.closest('#swap-panel, .mark-btn.swap')) closeSwap();
  });
  // Marked gems go to the end of their list.
  const marksLast = (a, b) => Number(Boolean(markOf(a))) - Number(Boolean(markOf(b)));

  function toggleSupport(name) {
    if (!selected || markOf(name)) return;
    let link = linkOf(selected);
    if (!link) { link = { skill: selected, supports: [] }; set.links.push(link); }
    const i = link.supports.indexOf(name);
    if (i >= 0) link.supports.splice(i, 1); else link.supports.push(name);
    if (link.supports.length === 0) set.links = set.links.filter((l) => l !== link); // no supports: no link
    save();
  }
  // A gem added in this window leaves the act, and every link it was in.
  function removeExtra(name) {
    set.extra = set.extra.filter((n) => n !== name);
    clearMark(name);
    set.swap = set.swap.filter((x) => x.to !== name);
    set.links = set.links.filter((l) => l.skill !== name);
    for (const l of set.links) l.supports = l.supports.filter((n) => n !== name);
    set.links = set.links.filter((l) => l.supports.length);
    if (selected === name) selected = null;
    save('Removed');
  }

  // ---------- header and toolbar ----------
  function renderActs() {
    const box = $('acts');
    box.textContent = '';
    for (let a = 1; a <= GemLinks.ACTS; a++) {
      const b = el('button', { textContent: String(a), title: 'Act ' + a, className: GemLinks.actOf(data.links, a).links.length ? 'has' : '' });
      b.setAttribute('aria-pressed', String(a === act));
      b.addEventListener('click', () => showAct(a));
      box.append(b);
    }
  }
  function showAct(a) {
    act = a;
    set = current();
    selected = null;
    closeSwap();
    asking = false;
    closeAdd();
    render();
  }
  function renderToolbar() {
    $('act-title').textContent = 'Act ' + act;
    // copy: the closest earlier act with links, so a new act starts from the setup you had
    const from = GemLinks.previousWithLinks(data.links, act);
    $('copy').hidden = !from || asking;
    $('copy-text').textContent = `Copy links from Act ${from}`;
    $('copy').title = `Start from the links of Act ${from}, then adjust them`;
    $('copy-ask').hidden = !asking;
    $('copy-ask-text').textContent = `Replace the links of Act ${act} with those of Act ${from}?`;
  }
  function copyFrom() {
    const from = GemLinks.previousWithLinks(data.links, act);
    const source = GemLinks.actOf(data.links, from);
    // The copied gems stay in this act even after you take them out of a link, and every
    // support of that act comes along too, linked or not: you still carry them.
    // Gems dropped in that act stay behind; gems held in Set 2 are still held.
    const dropped = new Set([...source.drop, ...source.swap.map((x) => x.from)]);
    const fromLinks = source.links.flatMap((l) => [l.skill, ...l.supports]);
    const supports = GemLinks.poolFor(data, from).filter((n) => GemLinks.isSupport(n, gemByName));
    const own = new Set(data.steps.filter((st) => st.act === act).flatMap((st) => st.gems));
    const extra = [...set.extra, ...source.extra, ...fromLinks, ...supports].filter((n) => !own.has(n) && !dropped.has(n) && !source.hold.includes(n));
    set = {
      extra: [...new Set(extra)],
      links: source.links.map((l) => ({ skill: l.skill, supports: [...l.supports] })),
      hold: [...new Set([...set.hold, ...source.hold])],
      drop: set.drop.filter((n) => !source.hold.includes(n)),
      swap: [],
    };
    asking = false;
    selected = null;
    save(`Copied from Act ${from}`);
  }
  $('copy').addEventListener('click', () => {
    if (set.links.length) { asking = true; return render(); }
    copyFrom();
  });
  $('copy-yes').addEventListener('click', copyFrom);
  $('copy-no').addEventListener('click', () => { asking = false; render(); });

  // ---------- add gem ----------
  let addShown = [];
  let addCursor = 0;
  function openAdd() {
    $('add-panel').hidden = false;
    $('add').setAttribute('aria-expanded', 'true');
    $('add-input').value = '';
    addCursor = 0;
    renderAdd();
    $('add-input').focus();
  }
  function closeAdd() {
    $('add-panel').hidden = true;
    $('add').setAttribute('aria-expanded', 'false');
  }
  function renderAdd() {
    const have = new Set(pool());
    const ranked = GemSearch.rank($('add-input').value, data.gems.filter((g) => !have.has(g.name)), (g) => g.name);
    addShown = ranked.slice(0, 60);
    addCursor = Math.min(addCursor, Math.max(0, addShown.length - 1));
    const list = $('add-list');
    list.textContent = '';
    addShown.forEach((g, i) => {
      const li = el('li', {}, [socket(g.name), el('span', { textContent: g.name }), el('small', { textContent: g.type === 'support' ? 'Support' : 'Active' })]);
      li.setAttribute('aria-selected', String(i === addCursor));
      li.addEventListener('mousedown', (e) => { e.preventDefault(); addGem(g.name); });
      list.append(li);
    });
    list.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }
  function addGem(name) {
    if (!set.extra.includes(name)) set.extra.push(name);
    // an active gem just added is ready to get its supports
    if (!GemLinks.isSupport(name, gemByName)) selected = name;
    save(`${name} added`);
    renderAdd();
  }
  $('add').addEventListener('click', () => ($('add-panel').hidden ? openAdd() : closeAdd()));
  $('add-input').addEventListener('input', () => { addCursor = 0; renderAdd(); });
  $('add-input').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); addCursor = Math.min(addCursor + 1, addShown.length - 1); renderAdd(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); addCursor = Math.max(addCursor - 1, 0); renderAdd(); }
    else if (e.key === 'Enter' && addShown[addCursor]) { addGem(addShown[addCursor].name); $('add-input').select(); }
    else if (e.key === 'Escape') { closeAdd(); $('add').focus(); }
  });
  document.addEventListener('mousedown', (e) => {
    if (!$('add-panel').hidden && !e.target.closest('#add-panel, #add')) closeAdd();
  });

  // ---------- the two columns ----------
  function renderSkills(skills) {
    const list = $('skills');
    list.textContent = '';
    if (skills.length === 0) {
      list.append(el('li', { className: 'empty', textContent: `No active gems in Act ${act}. Add areas of Act ${act} with gems to the gem route, or use Add gem.` }));
      return;
    }
    $('skill-hint').textContent = selected
      ? `Click another to edit its link, or tick its box to link it with ${selected}.`
      : 'Click one to choose its supports on the right.';
    for (const name of skills) {
      const link = linkOf(name);
      const supports = link ? link.supports : [];
      const mark = markOf(name);
      const head = el('div', { className: 'card-head' }, [socket(name), el('span', { className: 'name', textContent: name }), markTag(name)]);
      if (!fromRoute(name)) head.append(el('span', { className: 'tag', textContent: 'not in route' }));
      head.append(el('span', { className: 'count', textContent: supports.length ? plural(supports.length + 1, 'socket') : '' }));
      // an active gem can also go into the link of another active gem (two skills in one item)
      const uses = set.links.filter((l) => l.supports.includes(name)).length;
      if (uses && !supports.length) head.append(el('span', { className: 'used', textContent: uses === 1 ? 'in 1 link' : `in ${uses} links` }));
      if (selected && selected !== name && !mark) {
        const inIt = (linkOf(selected)?.supports || []).includes(name);
        const box = el('button', { className: 'link-box', title: inIt ? `Take it out of the link of ${selected}` : `Link it with ${selected}` });
        box.setAttribute('role', 'checkbox');
        box.setAttribute('aria-checked', String(inIt));
        box.setAttribute('aria-label', `${name} in the link of ${selected}`);
        box.addEventListener('click', (e) => { e.stopPropagation(); toggleSupport(name); });
        head.append(box);
      }
      head.append(markButtons(name));
      if (set.extra.includes(name)) {
        const x = el('button', { className: 'x', textContent: '×', title: `Remove ${name} from Act ${act}` });
        x.setAttribute('aria-label', `Remove ${name}`);
        x.addEventListener('click', (e) => { e.stopPropagation(); removeExtra(name); });
        head.append(x);
      }
      const card = el('li', { className: 'card' + (mark ? ' marked' : '') + (mark === 'drop' ? ' dropped' : '') + (mark === 'swap' ? ' swapped' : ''), tabIndex: mark ? -1 : 0 }, [head]);
      if (supports.length) {
        card.append(el('ul', { className: 'chain' }, supports.map((s) => {
          const out = el('button', { className: 'x', textContent: '×', title: `Take ${s} out of this link` });
          out.setAttribute('aria-label', `Take ${s} out of the link of ${name}`);
          out.addEventListener('click', (e) => { e.stopPropagation(); selected = name; toggleSupport(s); });
          return el('li', {}, [socket(s), el('span', { className: 'nm', textContent: s }), out]);
        })));
      } else if (name === selected) {
        card.append(el('div', { className: 'no-supports', textContent: 'Click supports on the right to link them.' }));
      }
      card.setAttribute('aria-selected', String(name === selected));
      const pick = () => { if (mark) return; selected = selected === name ? null : name; render(); };
      card.addEventListener('click', pick);
      card.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(); } });
      list.append(card);
    }
  }
  function renderSupports(supports) {
    const list = $('supports');
    list.textContent = '';
    list.classList.toggle('idle', !selected);
    $('sup-hint').textContent = selected ? `Click to link with ${selected}, or to take out.` : 'Pick an active gem on the left first.';
    if (supports.length === 0) {
      list.append(el('li', { className: 'empty', textContent: `No supports in Act ${act}. Use Add gem to bring one in.` }));
      return;
    }
    const inSelected = new Set(selected ? (linkOf(selected)?.supports || []) : []);
    for (const name of supports) {
      const uses = set.links.filter((l) => l.supports.includes(name)).length;
      const mark = markOf(name);
      const tag = markTag(name);
      if (tag) tag.style.marginLeft = '8px';
      const row = el('li', { className: 'sup' + (mark ? ' marked' : '') + (mark === 'drop' ? ' dropped' : ''), tabIndex: selected && !mark ? 0 : -1 }, [
        socket(name),
        el('span', { className: 'nm' }, [name, tag, fromRoute(name) ? '' : el('span', { className: 'tag', textContent: 'not in route', style: 'margin-left:8px' })]),
        el('span', { className: 'used', textContent: uses ? (uses === 1 ? 'in 1 link' : `in ${uses} links`) : '' }),
        markButtons(name),
        el('span', { className: 'mark' }),
      ]);
      row.setAttribute('role', 'checkbox');
      row.setAttribute('aria-checked', String(inSelected.has(name)));
      if (set.extra.includes(name)) {
        const x = el('button', { className: 'x', textContent: '×', title: `Remove ${name} from Act ${act}` });
        x.setAttribute('aria-label', `Remove ${name}`);
        x.addEventListener('click', (e) => { e.stopPropagation(); removeExtra(name); });
        row.querySelector('.marks').after(x);
      }
      const toggle = () => { if (selected) toggleSupport(name); };
      row.addEventListener('click', toggle);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
      list.append(row);
    }
  }

  function render() {
    renderActs();
    renderToolbar();
    const gems = pool();
    renderSkills(gems.filter((n) => !GemLinks.isSupport(n, gemByName)).sort(marksLast));
    renderSupports(gems.filter((n) => GemLinks.isSupport(n, gemByName)).sort((a, b) => marksLast(a, b) || byColor(a, b)));
  }

  // The route or the links changed in another window: read them again.
  api.onRefresh(async () => {
    data = await api.getData();
    gemByName = new Map(data.gems.map((g) => [g.name, g]));
    set = current();
    render();
  });
  // The overlay asked for a given act.
  api.onShowAct((a) => { if (a) showAct(a); });

  render();
})();
