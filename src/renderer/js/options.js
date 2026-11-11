'use strict';
/* Options window: choose the hotkeys and keep one regex of your own. */
(async function () {
  const api = window.optionsApi;
  const $ = (id) => document.getElementById(id);
  let state = await api.get();
  let recording = null; // name of the hotkey waiting for a key press

  const ROWS = [
    { name: 'regexHotkey', what: 'Search for the gems to buy', desc: 'With a vendor open, pastes a search for the gems that are pending in the overlay.' },
    { name: 'mercHotkey', what: 'Check a mercenary', desc: 'With a mercenary window open, tells you whether it is worth recruiting.' },
    { name: 'globalRegexHotkey', what: 'Paste my regex', desc: 'Pastes the regex saved below into the search field of the open window.' },
    { name: 'passiveKey', what: 'Passive tree key', desc: 'The same key that opens the passive tree in the game. It is not taken from the game: the overlay only notices it.', single: true },
  ];

  function el(tag, props = {}, children = []) {
    const node = Object.assign(document.createElement(tag), props);
    for (const c of [].concat(children)) node.append(c);
    return node;
  }
  function flash(text) {
    $('saved').textContent = text;
    clearTimeout(flash.timer);
    flash.timer = setTimeout(() => { $('saved').textContent = ''; }, 1500);
  }

  // Turns a key press into the name Electron uses, such as "F2" or "Ctrl+Shift+G".
  // Returns null for a key that cannot be a hotkey, and undefined for a lone modifier.
  function keyName(e, single) {
    if (['Control', 'Shift', 'Alt', 'Meta'].includes(e.key)) return undefined;
    const c = e.code;
    let key = null;
    if (/^Key[A-Z]$/.test(c)) key = c.slice(3);
    else if (/^Digit\d$/.test(c)) key = c.slice(5);
    else if (/^F([1-9]|1\d|2[0-4])$/.test(c)) key = c;
    else if (!single && /^Numpad\d$/.test(c)) key = 'num' + c.slice(6);
    else if (!single) {
      key = { Space: 'Space', Tab: 'Tab', Insert: 'Insert', Delete: 'Delete', Home: 'Home', End: 'End', PageUp: 'PageUp', PageDown: 'PageDown', ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right' }[c] || null;
    }
    if (!key) return null;
    if (single) return key;
    const mods = [];
    if (e.ctrlKey) mods.push('Ctrl');
    if (e.altKey) mods.push('Alt');
    if (e.shiftKey) mods.push('Shift');
    return [...mods, key].join('+');
  }
  // A plain letter or number as a global hotkey stops that key from reaching the game and the chat.
  const takesTyping = (key) => /^([A-Z0-9]|Space|Tab)$/.test(key || '');

  function render() {
    const box = $('keys');
    box.textContent = '';
    for (const row of ROWS) {
      const value = state[row.name] || '';
      const isRec = recording === row.name;
      const key = el('button', { className: 'key' + (isRec ? ' recording' : value ? '' : ' unset'), textContent: isRec ? 'Press a key...' : value || 'Not set' });
      key.setAttribute('aria-label', `${row.what}: ${value || 'not set'}. Click to change.`);
      key.addEventListener('click', () => (isRec ? stop() : start(row.name)));
      const off = el('button', { className: 'off', textContent: 'turn off', hidden: !value || isRec });
      off.addEventListener('click', () => apply({ [row.name]: '' }));

      let note = '', noteClass = 'note';
      if (state.errors && state.errors[row.name]) { note = state.errors[row.name]; noteClass += ' error'; }
      else if (!row.single && takesTyping(value)) { note = `While the overlay is open, ${value} will not reach the game or the chat. An F key, or a key with Ctrl or Alt, avoids that.`; noteClass += ' warn'; }

      const cells = [
        el('div', { className: 'what', textContent: row.what }),
        el('div', { className: 'set' }, [key, off]),
        el('div', { className: 'desc', textContent: row.desc }),
        el('div', { className: noteClass, textContent: note }),
      ];
      if (row.name === 'passiveKey') {
        const box2 = el('input', { type: 'checkbox', checked: state.passiveSearch !== false });
        box2.addEventListener('change', () => apply({ passiveSearch: box2.checked }));
        cells.push(el('label', { className: 'check' }, [box2, 'Search for the next point of my order when the tree opens']));
      }
      box.append(el('div', { className: 'key-row' }, cells));
    }
  }

  async function apply(change) {
    state = await api.set(change);
    render();
    flash('Saved');
  }
  // While a key is being chosen the global hotkeys are released, so pressing F2 reaches this window.
  async function start(name) {
    recording = name;
    await api.recording(true);
    render();
  }
  async function stop() {
    if (!recording) return;
    recording = null;
    state = await api.recording(false);
    render();
  }
  window.addEventListener('keydown', async (e) => {
    if (!recording) return;
    e.preventDefault();
    e.stopPropagation();
    if (e.key === 'Escape') return stop();
    const row = ROWS.find((r) => r.name === recording);
    const key = keyName(e, row.single);
    if (key === undefined) return; // only Ctrl, Alt or Shift so far: keep waiting
    if (key === null) return flash(row.single ? 'Use a letter, a number or an F key' : 'That key cannot be a hotkey');
    const name = recording;
    recording = null;
    await api.set({ [name]: key });
    state = await api.recording(false);
    render();
    flash('Saved');
  }, true);
  window.addEventListener('blur', stop);

  // ---------- game folder ----------
  function renderFolder() {
    const path = $('folder-path');
    path.textContent = state.gameFolder || 'Not chosen yet';
    path.className = 'path' + (state.gameFolder ? '' : ' unset');
    $('folder-change').textContent = state.gameFolder ? 'Change folder' : 'Choose folder';
    const note = $('folder-note');
    if (state.gameFolderOk) { note.textContent = ''; note.className = 'note'; }
    else if (state.gameFolder) { note.textContent = 'There is no logs\\Client.txt in this folder any more. Choose the folder again.'; note.className = 'note error'; }
    else { note.textContent = 'Without it the overlay cannot tell which area you are in.'; note.className = 'note warn'; }
  }
  $('folder-change').addEventListener('click', async () => {
    const before = state.gameFolder;
    state = await api.chooseGameFolder();
    renderFolder();
    if (state.gameFolder !== before) flash('Saved');
  });

  // ---------- reset hotkeys to default ----------
  // The first button only asks; "Reset" next to the question does it.
  function askReset(on) {
    $('reset-keys').hidden = on;
    $('reset-ask').hidden = !on;
    $('reset-yes').hidden = !on;
    $('reset-no').hidden = !on;
  }
  $('reset-keys').addEventListener('click', () => askReset(true));
  $('reset-no').addEventListener('click', () => askReset(false));
  $('reset-yes').addEventListener('click', async () => {
    recording = null;
    state = await api.reset();
    askReset(false);
    render();
    flash('Hotkeys reset');
  });

  // ---------- my regex ----------
  const area = $('regex');
  area.value = state.globalRegex || '';
  function count() {
    const n = area.value.trim().length;
    const over = n > state.regexLimit;
    $('regex-count').textContent = `${n} / ${state.regexLimit} characters`;
    $('regex-count').className = over ? 'over' : '';
    $('regex-note').textContent = over ? 'Longer than the game search field accepts: the end will be cut off.' : '';
    $('regex-note').className = over ? 'over' : '';
  }
  let timer = null;
  const saveRegex = async () => {
    clearTimeout(timer);
    state = await api.set({ globalRegex: area.value });
    flash('Saved');
  };
  area.addEventListener('input', () => { count(); clearTimeout(timer); timer = setTimeout(saveRegex, 500); });
  area.addEventListener('blur', () => { if (area.value !== (state.globalRegex || '')) saveRegex(); });
  // the game field is a single line: Enter does not add a line break
  area.addEventListener('keydown', (e) => { if (e.key === 'Enter') e.preventDefault(); });

  count();
  renderFolder();
  render();
})();
