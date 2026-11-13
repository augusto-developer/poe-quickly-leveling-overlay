'use strict';
// Gem route window: which gems to buy after each area.
const fs = require('fs');
const { dialog, ipcMain } = require('electron');
const { singleWindow } = require('./common');
const { store, saveGuide } = require('../store');
const { bus, changed } = require('../session');
const gamedata = require('../gamedata');
const { cleanGuide } = require('../../core/guide');

const win = singleWindow('settings', { width: 1040, height: 720, minWidth: 820, minHeight: 520, title: 'Gem route' });
const clean = (raw) => cleanGuide(raw, gamedata.areaActs);

ipcMain.on('open-settings', win.open);
bus.on('setup-replaced', () => { if (win.get()) win.get().reload(); });

ipcMain.handle('settings:data', () => ({ gems: gamedata.gems, areas: gamedata.areas, visited: store.state.visited }));
ipcMain.handle('settings:guide', () => store.guide);
// The route window saves the areas and their gems; the links belong to the links window,
// so they are kept as they are.
ipcMain.on('settings:save', (_e, raw) => {
  store.guide = clean({ ...raw, links: store.guide.links });
  saveGuide();
  changed(); // the overlay list follows the edit right away
  bus.emit('route-changed');
});
ipcMain.handle('settings:export', async (_e, raw) => {
  const { canceled, filePath } = await dialog.showSaveDialog(win.get(), {
    title: 'Export route',
    defaultPath: 'gem-route.json',
    filters: [{ name: 'Gem route', extensions: ['json'] }],
  });
  if (canceled || !filePath) return false;
  fs.writeFileSync(filePath, JSON.stringify(clean({ ...raw, links: store.guide.links }), null, 2));
  return true;
});
ipcMain.handle('settings:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(win.get(), {
    title: 'Import route',
    filters: [{ name: 'Gem route', extensions: ['json'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return null;
  try {
    const imported = clean(JSON.parse(fs.readFileSync(filePaths[0], 'utf8')));
    if (imported.steps.length === 0) return { error: 'File has no areas' };
    // the links of the file come in now; the route window then saves the areas
    store.guide = { ...store.guide, links: imported.links };
    saveGuide();
    bus.emit('links-changed');
    return { guide: imported };
  } catch {
    return { error: 'Invalid file' };
  }
});
