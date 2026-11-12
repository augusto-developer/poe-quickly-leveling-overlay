'use strict';
// Entry point of the main process: starts each part in order and shuts them down on exit.
const path = require('path');
const { app } = require('electron');

// Saved data stays in %APPDATA%\poe-gem-overlay whatever the display name of the program is.
app.setPath('userData', path.join(app.getPath('appData'), 'poe-gem-overlay'));
// Allows playing an alert sound without a click on the overlay window.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (!app.requestSingleInstanceLock()) {
  app.quit(); // already running: two copies would both react to the same keys
} else {
  const config = require('./config');
  const store = require('./store');
  const { setStatus } = require('./session');
  const ocr = require('./platform/ocr');
  const hooks = require('./features/hooks');
  const hotkeys = require('./features/hotkeys');
  const gameFolder = require('./features/gameFolder');
  const updates = require('./features/updates');
  const overlay = require('./windows/overlay');
  const toast = require('./windows/toast');
  // These register what their windows can ask for.
  require('./windows/settings');
  require('./windows/tree');
  require('./windows/notes');
  require('./windows/options');
  require('./windows/library');

  app.whenReady().then(async () => {
    config.load();
    store.load();
    overlay.create();
    toast.create();
    try {
      await ocr.start();
    } catch (err) {
      setStatus('Text reading could not start: ' + err.message);
    }
    gameFolder.setup();
    hooks.start();
    hotkeys.register();
    updates.start();
  });

  app.on('will-quit', () => {
    hotkeys.release();
    hooks.stop();
    gameFolder.stop();
    ocr.stop();
  });
  app.on('window-all-closed', () => app.quit());
}
