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

module.exports = { sleep, pasteIntoSearch };
