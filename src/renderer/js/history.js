'use strict';
/* Undo and redo for the editing windows (route, links, passive tree).
   Each window says how to take a snapshot of what it edits (a string) and how to put one back.
   After every change it calls record(); undo() and redo() move between the snapshots.
   Loaded as a plain script in the windows and with require() in the tests. */
(function (root) {
  function createHistory({ snapshot, restore, onChange = () => {}, limit = 100 }) {
    let past = [];
    let future = [];
    let last = snapshot();
    let busy = false;

    const api = {
      // Call after each change: keeps the state before it, and forgets what was undone.
      record() {
        if (busy) return;
        const now = snapshot();
        if (now === last) return;
        past.push(last);
        if (past.length > limit) past.shift();
        future = [];
        last = now;
        onChange();
      },
      async undo() { return move(past, future); },
      async redo() { return move(future, past); },
      // Starts again from what is shown now (after loading something new, for example).
      reset() { past = []; future = []; last = snapshot(); onChange(); },
      canUndo: () => past.length > 0,
      canRedo: () => future.length > 0,
    };

    async function move(from, to) {
      if (busy || from.length === 0) return false;
      busy = true;
      try {
        to.push(last);
        last = from.pop();
        await restore(last);
      } finally {
        busy = false;
      }
      onChange();
      return true;
    }
    return api;
  }

  // Ctrl+Z undoes, Ctrl+Y or Ctrl+Shift+Z redoes, and the two buttons follow what is possible.
  // Inside a text field with text in it the keys keep undoing the typing, as usual.
  function bindHistory(history, undoButton, redoButton) {
    const refresh = () => {
      if (undoButton) undoButton.disabled = !history.canUndo();
      if (redoButton) redoButton.disabled = !history.canRedo();
    };
    if (undoButton) undoButton.addEventListener('click', () => history.undo());
    if (redoButton) redoButton.addEventListener('click', () => history.redo());
    window.addEventListener('keydown', (e) => {
      if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
      const t = e.target;
      // a field with text in it keeps its own undo; an empty one (search boxes) does not need it
      if (t && (t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      if (t && t.tagName === 'INPUT' && /^(text|search|)$/.test(t.type) && t.value !== '') return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) { e.preventDefault(); history.undo(); }
      else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); history.redo(); }
    });
    refresh();
    return refresh;
  }

  const exported = { createHistory, bindHistory };
  if (typeof module === 'object' && module.exports) module.exports = exported;
  else root.EditHistory = exported;
})(typeof window !== 'undefined' ? window : globalThis);
