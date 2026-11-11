'use strict';
// Options window: the game folder, the hotkeys and your own regex.
const { ipcMain } = require('electron');
const { singleWindow } = require('./common');
const { store, setting, setPrefs } = require('../store');
const { session } = require('../session');
const { config } = require('../config');
const hotkeys = require('../features/hotkeys');
const gameFolder = require('../features/gameFolder');
const { DEFAULTS, cleanPrefs } = require('../../core/prefs');

const win = singleWindow('options', { width: 620, height: 700, minWidth: 480, minHeight: 420, title: 'Options' }, (w) => {
  // If the window closes in the middle of choosing a key, put the hotkeys back.
  w.on('closed', () => { if (session.recordingHotkey) { session.recordingHotkey = false; hotkeys.register(); } });
});

function optionsState() {
  const out = { errors: hotkeys.errors(), regexLimit: Number(config.regexLimit ?? 250) };
  for (const name of Object.keys(DEFAULTS)) out[name] = setting(name);
  out.gameFolder = store.prefs.gameFolder || '';
  out.gameFolderOk = Boolean(gameFolder.clientLogPath());
  return out;
}

ipcMain.on('open-options', win.open);
ipcMain.handle('options:get', () => optionsState());
ipcMain.handle('options:set', (_e, change) => {
  setPrefs(cleanPrefs(change));
  if (!session.recordingHotkey) hotkeys.register();
  return optionsState();
});
// Puts the hotkeys and the tree search back to how the program ships. The saved regex is kept.
ipcMain.handle('options:reset', () => {
  const { globalRegex, ...keys } = DEFAULTS;
  setPrefs(keys);
  session.recordingHotkey = false;
  hotkeys.register();
  return optionsState();
});
// While a key is being chosen, the hotkeys are released so the key press reaches the window.
ipcMain.handle('options:recording', (_e, on) => {
  session.recordingHotkey = Boolean(on);
  if (session.recordingHotkey) hotkeys.release(); else hotkeys.register();
  return optionsState();
});
ipcMain.handle('options:game-folder', async () => {
  await gameFolder.choose(win.get());
  return optionsState();
});
