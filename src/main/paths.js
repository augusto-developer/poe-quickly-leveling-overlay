'use strict';
// Where things live. Files that ship with the program are read from the program folder;
// everything the user changes is written to the user data folder (%APPDATA%\poe-gem-overlay),
// because the program folder may be read-only once installed.
const { app } = require('electron');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

module.exports = {
  ROOT,
  data: (...parts) => path.join(ROOT, 'data', ...parts),
  asset: (...parts) => path.join(ROOT, 'assets', ...parts),
  bundledSounds: () => path.join(ROOT, 'sounds'),
  page: (name) => path.join(ROOT, 'src', 'renderer', `${name}.html`),
  preload: (name) => path.join(ROOT, 'src', 'preload', `${name}.js`),
  user: (...parts) => path.join(app.getPath('userData'), ...parts),
};
