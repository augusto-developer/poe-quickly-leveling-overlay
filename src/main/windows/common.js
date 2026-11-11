'use strict';
// The ordinary windows (gem route, passive tree, options, builds, notes) all open the same
// way: one of each, focused again if it is already open.
const { BrowserWindow } = require('electron');
const paths = require('../paths');

/**
 * Returns { open, get } for a window that shows src/renderer/<page>.html with
 * src/preload/<page>.js. `get()` is the open window, or null.
 */
function singleWindow(page, options, afterCreate) {
  let win = null;
  const get = () => (win && !win.isDestroyed() ? win : null);
  function open() {
    if (get()) return win.focus();
    win = new BrowserWindow({
      backgroundColor: '#0a0d1c',
      autoHideMenuBar: true,
      icon: paths.asset('icon.png'),
      ...options,
      webPreferences: { preload: paths.preload(page) },
    });
    win.loadFile(paths.page(page));
    if (afterCreate) afterCreate(win);
  }
  return { open, get };
}

module.exports = { singleWindow };
