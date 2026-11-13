'use strict';
// Links window: the gems you socket together, planned act by act. Each act shows the gems
// of its areas of the route; gems can also be added here just for the links.
const { ipcMain } = require('electron');
const { singleWindow } = require('./common');
const { store, saveGuide } = require('../store');
const { bus, changed } = require('../session');
const gamedata = require('../gamedata');
const GemLinks = require('../../core/links');

let openAt = null; // act to show when the window opens
const win = singleWindow('links', { width: 980, height: 700, minWidth: 760, minHeight: 480, title: 'Links' });

function open(act) {
  openAt = Number.isInteger(act) && act >= 1 && act <= GemLinks.ACTS ? act : null;
  if (win.get()) win.get().webContents.send('links:show-act', openAt);
  win.open();
}
// The window asks again for the data when the route or the links changed elsewhere.
const refresh = () => { if (win.get()) win.get().webContents.send('links:refresh'); };

ipcMain.on('open-links', (_e, act) => open(act));
bus.on('route-changed', refresh);
bus.on('links-changed', refresh);
bus.on('setup-replaced', () => { if (win.get()) win.get().reload(); });

ipcMain.handle('links:data', () => ({
  gems: gamedata.gems,
  steps: store.guide.steps,
  links: store.guide.links || {},
  act: openAt || store.state.act || null,
}));
// Saves the links of one act ({ extra, links }); an empty act is removed.
ipcMain.handle('links:save', (_e, act, set) => {
  if (!Number.isInteger(act) || act < 1 || act > GemLinks.ACTS) return store.guide.links;
  const next = { ...(store.guide.links || {}), [act]: set };
  store.guide = { ...store.guide, links: GemLinks.cleanLinks(next) };
  saveGuide();
  changed(); // the drawer of the overlay follows
  return store.guide.links;
});

module.exports = { open };
