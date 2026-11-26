'use strict';
// The only inputs this program sends to the game, always in answer to a key you pressed.
const { clipboard } = require('electron');
const { uIOhook, UiohookKey } = require('uiohook-napi');
const { session } = require('../session');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Types a text into the search field of the open game window: Ctrl+F, Ctrl+A, Ctrl+V.
// The clipboard is used for the paste and its previous text is put back afterwards.
async function pasteIntoSearch(text) {
  const previous = clipboard.readText();
  session.sendingKeys = true;
  try {
    clipboard.writeText(text);
    await sleep(60);
    uIOhook.keyTap(UiohookKey.F, [UiohookKey.Ctrl]); // focuses the search field
    await sleep(80);
    uIOhook.keyTap(UiohookKey.A, [UiohookKey.Ctrl]); // selects whatever is already typed
    await sleep(40);
    uIOhook.keyTap(UiohookKey.V, [UiohookKey.Ctrl]); // pastes
    await sleep(250);
  } finally {
    try {
      if (typeof previous === 'string' && previous.length > 0) clipboard.writeText(previous);
    } catch { /* if the clipboard cannot be restored, carry on */ }
    await sleep(100);
    session.sendingKeys = false;
    session.ctrlDown = false;
  }
}

// The text of the item under the mouse, copied by the game itself. It is only used while
// you hold Ctrl for your own Ctrl + click: the program presses C, so the game sees Ctrl+C
// (which copies the item, and does nothing in the game world). One copy at a time; the
// clipboard you had is put back by restoreClipboard() when the clicks are over.
let savedClipboard = null;
let copying = Promise.resolve();
function copyHoveredItem(timeout = 250) {
  const run = copying.then(async () => {
    if (!session.ctrlDown) return null; // without Ctrl held, C alone would open the character panel
    if (savedClipboard === null) savedClipboard = clipboard.readText();
    clipboard.writeText('');
    session.sendingKeys = true;
    uIOhook.keyTap(UiohookKey.C);
    setTimeout(() => { session.sendingKeys = false; }, 30).unref?.();
    const until = Date.now() + timeout;
    while (Date.now() < until) {
      await sleep(8);
      const text = clipboard.readText();
      if (text) return text;
    }
    return null;
  });
  copying = run.catch(() => null);
  return run;
}
function restoreClipboard() {
  if (savedClipboard === null) return;
  try { clipboard.writeText(savedClipboard); } catch { /* carry on */ }
  savedClipboard = null;
}

module.exports = { sleep, pasteIntoSearch, copyHoveredItem, restoreClipboard };
