'use strict';
/* Builds window: save the current setup under a name, and load, rename or delete saved ones. */
(async function () {
  const api = window.libraryApi;
  const $ = (id) => document.getElementById(id);
  let state = await api.get();
  let asking = null;   // { id, what: 'load' | 'delete' } while a row waits for a confirmation
  let renaming = null; // id of the row whose name is being edited

  function el(tag, props = {}, children = []) {
    const node = Object.assign(document.createElement(tag), props);
    for (const c of [].concat(children)) node.append(c);
    return node;
  }
  function flash(text) {
    $('flash').textContent = text;
    clearTimeout(flash.timer);
    flash.timer = setTimeout(() => { $('flash').textContent = ''; }, 1800);
  }
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  function summary(s) {
    const parts = [];
    if (s.gems) parts.push(`${plural(s.gems, 'gem')} in ${plural(s.areas, 'area')}`);
    if (s.trees) parts.push(s.trees === 1 ? 'passive tree' : `${s.trees} passive trees`);
    else if (s.points) parts.push(`${plural(s.points, 'passive point')} in order`);
    if (s.notes) parts.push('notes');
    return parts.length ? parts.join(', ') : 'Nothing set up';
  }
  const when = (ms) => (ms ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '');

  // Runs an action, takes the new state it returns and shows its error, if any.
  async function run(action, done) {
    state = await action;
    asking = null;
    if (!state.error) renaming = null;
    $('error').textContent = state.error || '';
    $('error').hidden = !state.error;
    if (!state.error && done) flash(done);
    render();
    return !state.error;
  }

  function render() {
    const cur = state.current;
    const match = state.items.find((it) => it.same);
    const active = state.items.find((it) => it.active);
    $('now-sum').textContent = summary(cur);
    const st = $('now-state');
    if (cur.empty) { st.textContent = 'Set up a gem route or import a tree, then save it here.'; st.className = 'state'; }
    else if (match) { st.textContent = `Saved as "${match.name}".`; st.className = 'state ok'; }
    else if (active) { st.textContent = `Changed since it was loaded from "${active.name}". Save it over that build, or as a new one.`; st.className = 'state warn'; }
    else { st.textContent = 'Not saved in the library yet.'; st.className = 'state warn'; }
    $('save-new').disabled = cur.empty;
    $('save-name').disabled = cur.empty;

    const list = $('list');
    list.textContent = '';
    if (state.items.length === 0) {
      list.append(el('li', { className: 'empty', textContent: 'No builds saved yet. Name the current setup above to keep it.' }));
      return;
    }
    for (const it of state.items) {
      const row = el('li', { className: 'card' + (it.same ? ' same' : it.active ? ' changed' : '') });
      row.append(crest(it));
      if (renaming === it.id) {
        const input = el('input', { className: 'name-edit', value: it.name, maxLength: 60 });
        input.setAttribute('aria-label', `New name for ${it.name}`);
        const ok = () => run(api.rename(it.id, input.value), 'Renamed');
        input.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); if (e.key === 'Escape') { renaming = null; render(); } });
        row.append(input, el('div', { className: 'acts' }, [
          el('button', { className: 'btn primary', textContent: 'Save name', onclick: ok }),
          el('button', { className: 'btn', textContent: 'Cancel', onclick: () => { renaming = null; render(); } }),
        ]));
        list.append(row);
        setTimeout(() => { input.focus(); input.select(); });
        continue;
      }

      const name = el('div', { className: 'name', textContent: it.name });
      if (it.same) name.append(el('span', { className: 'tag ok', textContent: 'in the overlay now' }));
      else if (it.active) name.append(el('span', { className: 'tag warn', textContent: 'loaded, then changed' }));
      const acts = el('div', { className: 'acts' });
      if (!it.same) {
        if (!cur.empty) {
          const over = el('button', { className: 'btn' + (it.active ? ' primary' : ''), textContent: it.active ? 'Save changes' : 'Save over' });
          over.title = 'Replace this saved build with what is in the overlay now';
          over.addEventListener('click', () => (it.active ? run(api.update(it.id), 'Saved') : ask(it.id, 'over')));
          acts.append(over);
        }
        const load = el('button', { className: 'btn' + (it.active ? '' : ' primary'), textContent: 'Load' });
        // Loading replaces the current setup, so ask first when that one is not saved anywhere.
        load.addEventListener('click', () => (cur.empty || cur.saved ? run(api.load(it.id), `Loaded ${it.name}`) : ask(it.id, 'load')));
        acts.append(load);
      }
      row.append(name, acts, classLine(it));
      if (it.gems) row.append(gemLine(it));

      if (asking && asking.id === it.id) {
        const text = {
          load: 'The setup in the overlay is not saved and will be replaced. Load anyway?',
          over: `Replace "${it.name}" with the setup in the overlay now?`,
          delete: `Delete "${it.name}" from the library? This cannot be undone.`,
        }[asking.what];
        const go = {
          load: () => run(api.load(it.id), `Loaded ${it.name}`),
          over: () => run(api.update(it.id), 'Saved'),
          delete: () => run(api.remove(it.id), 'Deleted'),
        }[asking.what];
        const yes = el('button', { className: 'btn yes', textContent: { load: 'Load', over: 'Replace', delete: 'Delete' }[asking.what], onclick: go });
        row.append(el('div', { className: 'ask' }, [el('span', { className: 'q', textContent: text }), yes, el('button', { className: 'btn', textContent: 'Cancel', onclick: () => { asking = null; render(); } })]));
        setTimeout(() => yes.focus());
      } else {
        row.append(el('div', { className: 'minor' }, [
          el('span', { className: 'date', textContent: `Saved ${when(it.savedAt)}${it.notes ? ', with notes' : ''}` }),
          el('button', { className: 'link', textContent: 'Rename', onclick: () => { renaming = it.id; asking = null; render(); } }),
          el('button', { className: 'link', textContent: 'Delete', onclick: () => ask(it.id, 'delete') }),
        ]));
      }
      list.append(row);
    }
  }

  // ---------- the parts of a card ----------
  // Ring colours follow the attributes of the class, the same red, green and blue as the gems.
  const ATTR = { Marauder: ['str'], Ranger: ['dex'], Witch: ['int'], Duelist: ['str', 'dex'], Templar: ['str', 'int'], Shadow: ['dex', 'int'], Scion: ['str', 'dex', 'int'] };
  const HEX = { str: '#d4553f', dex: '#74b84f', int: '#5f92e6' };
  function crest(it) {
    const attrs = ATTR[it.className];
    if (!attrs) return el('div', { className: 'crest none' }, el('span'));
    const box = el('div', { className: 'crest', title: it.className }, el('span', { textContent: (it.ascendancy || it.className).slice(0, 2) }));
    const step = 360 / attrs.length;
    box.style.background = `conic-gradient(${attrs.map((a, i) => `${HEX[a]} ${i * step}deg ${(i + 1) * step}deg`).join(', ')})`;
    return box;
  }
  function classLine(it) {
    const line = el('div', { className: 'class' });
    if (!it.trees) {
      line.append(el('span', { className: 'rest', textContent: it.points ? `${plural(it.points, 'passive point')} in order, no PoB tree` : 'Gem route only, no passive tree' }));
      return line;
    }
    line.append(it.ascendancy ? `${it.ascendancy} (${it.className})` : it.className);
    const titles = it.treeTitles;
    const span = it.trees > 1 ? (titles.length > 1 ? `${it.trees} trees, ${titles[0]} to ${titles[titles.length - 1]}` : `${it.trees} trees`) : '1 tree';
    line.append(el('span', { className: 'rest', textContent: `, ${it.treePoints} points, ${span}` }));
    return line;
  }
  function gemLine(it) {
    const mix = el('div', { className: 'mix' });
    const parts = [];
    for (const [key, word] of [['str', 'red'], ['dex', 'green'], ['int', 'blue']]) {
      const n = it.colors[key];
      if (!n) continue;
      const seg = el('i', { className: key });
      seg.style.flex = String(n);
      mix.append(seg);
      parts.push(`${n} ${word}`);
    }
    mix.title = parts.join(', ');
    const more = it.gems - it.firstGems.length;
    return el('div', { className: 'gems' }, [
      mix,
      el('span', { className: 'count', textContent: plural(it.gems, 'gem') }),
      el('span', { className: 'names', textContent: it.firstGems.join(', ') + (more > 0 ? ` and ${more} more` : '') }),
    ]);
  }
  function ask(id, what) { asking = { id, what }; renaming = null; render(); }

  $('save-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (await run(api.save($('save-name').value), 'Saved')) $('save-name').value = '';
  });
  $('folder').addEventListener('click', () => api.openFolder());
  // The route or the tree may have been edited in another window meanwhile.
  window.addEventListener('focus', async () => { if (!asking && !renaming) { state = await api.get(); render(); } });

  render();
})();
