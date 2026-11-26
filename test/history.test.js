'use strict';
// Undo and redo of the editing windows (src/renderer/js/history.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHistory } = require('../src/renderer/js/history');

function editor() {
  const state = { value: 'a' };
  let changes = 0;
  const history = createHistory({
    snapshot: () => state.value,
    restore: async (snap) => { state.value = snap; },
    onChange: () => { changes++; },
    limit: 3,
  });
  const edit = (v) => { state.value = v; history.record(); };
  return { state, history, edit, changes: () => changes };
}

test('history: undo and redo walk back and forth through the changes', async () => {
  const { state, history, edit } = editor();
  assert.equal(history.canUndo(), false);
  edit('b');
  edit('c');
  assert.equal(await history.undo(), true);
  assert.equal(state.value, 'b');
  await history.undo();
  assert.equal(state.value, 'a');
  assert.equal(await history.undo(), false, 'nothing left to undo');
  await history.redo();
  assert.equal(state.value, 'b');
  await history.redo();
  assert.equal(state.value, 'c');
  assert.equal(history.canRedo(), false);
});

test('history: a new change forgets what was undone; no change, no step; a limit on steps', async () => {
  const { state, history, edit, changes } = editor();
  edit('b');
  await history.undo();
  edit('x');
  assert.equal(history.canRedo(), false);
  const before = changes();
  edit('x');
  assert.equal(changes(), before, 'saving the same thing is not a step');
  edit('1'); edit('2'); edit('3'); edit('4');
  let steps = 0;
  while (await history.undo()) steps++;
  assert.equal(steps, 3, 'only the last 3 steps are kept');
  assert.equal(state.value, '1');
  history.reset();
  assert.equal(history.canUndo(), false);
  assert.equal(history.canRedo(), false);
});
