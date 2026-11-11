'use strict';
// Global keyboard and mouse listening. It only listens: Ctrl + click (a possible gem
// purchase) and the passive tree key. Nothing is blocked or changed on its way to the game.
const { uIOhook, UiohookKey } = require('uiohook-napi');
const { setting } = require('../store');
const { session, setStatus } = require('../session');
const purchases = require('./purchases');
const { passiveSearch } = require('./passiveSearch');

const isCtrl = (e) => e.keycode === UiohookKey.Ctrl || e.keycode === UiohookKey.CtrlRight;

function start() {
  uIOhook.on('keydown', (e) => {
    // The passive tree key, pressed on its own. Read on every press, so a change in the options applies at once.
    const passiveKey = UiohookKey[String(setting('passiveKey') || '').toUpperCase()];
    if (!session.sendingKeys && !session.recordingHotkey && setting('passiveSearch') !== false && passiveKey !== undefined &&
        e.keycode === passiveKey && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey) {
      passiveSearch().catch((err) => setStatus('Passive search error: ' + err.message));
      return;
    }
    if (session.sendingKeys || !isCtrl(e) || session.ctrlDown) return;
    session.ctrlDown = true;
    purchases.onCtrlDown();
  });
  uIOhook.on('keyup', (e) => { if (isCtrl(e)) session.ctrlDown = false; });
  uIOhook.on('mousedown', (e) => {
    if (session.sendingKeys || e.button !== 1 || !e.ctrlKey) return;
    purchases.onCtrlClick();
  });
  uIOhook.start();
}
const stop = () => uIOhook.stop();

module.exports = { start, stop };
