'use strict';
// Hotkeys that paste a search into the open game window. One key pressed by you = one
// paste. The program never does this on its own.
const { setting } = require('../store');
const { session, setStatus } = require('../session');
const { config } = require('../config');
const progress = require('../progress');
const { pasteIntoSearch } = require('../platform/keys');
const { buildRegex } = require('../../core/regex');

// The regex of the pending gems, into the vendor search.
async function pasteGemRegex() {
  if (!progress.inTown()) return setStatus('Regex: only works inside a town');
  const names = progress.pendingGems().map((g) => g.name);
  if (names.length === 0) return setStatus('Regex: no pending gems');
  if (session.sendingKeys) return;

  const text = buildRegex(names, config.regexLimit ?? 250);
  await pasteIntoSearch(text);
  setStatus(`Regex pasted (${text.length} characters): ${text}`);
}

// Your own saved regex. Works wherever Ctrl+F focuses a search field: vendors, the stash and so on.
async function pasteOwnRegex() {
  const text = String(setting('globalRegex') || '').trim();
  if (!text) return setStatus('My regex: nothing saved yet. Open the options to write one.');
  if (session.sendingKeys) return;
  await pasteIntoSearch(text);
  setStatus(`My regex pasted (${text.length} characters)`);
}

module.exports = { pasteGemRegex, pasteOwnRegex };
