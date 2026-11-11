'use strict';
// Passive tree window: import a Path of Building code and order the points of each tree.
const { ipcMain } = require('electron');
const { singleWindow } = require('./common');
const { store, setBuild, saveBuild, saveState } = require('../store');
const { bus, changed } = require('../session');
const gamedata = require('../gamedata');
const progress = require('../progress');
const { decodePob } = require('../../core/pob');
const buildCore = require('../../core/build');
const treeplan = require('../../core/treeplan');

const win = singleWindow('tree', { width: 1280, height: 820, minWidth: 900, minHeight: 560, backgroundColor: '#05060c', title: 'Passive tree' });
const clean = (raw) => buildCore.cleanBuild(gamedata.tree(), raw);

ipcMain.on('open-tree', win.open);
bus.on('setup-replaced', () => { if (win.get()) win.get().reload(); });

ipcMain.handle('tree:data', () => ({ tree: gamedata.tree(), build: store.build }));
ipcMain.handle('tree:import', (_e, code) => {
  try {
    const pob = decodePob(code);
    const cleaned = clean({ specs: pob.specs, specIndex: pob.active, order: [], notes: pob.notes });
    if (cleaned.specs.length === 0) return { error: 'The build was read, but its class is not in this tree.' };
    return { specs: cleaned.specs, active: cleaned.specIndex, notes: cleaned.notes };
  } catch (err) {
    return { error: err.message };
  }
});
ipcMain.handle('tree:suggest', (_e, raw) => {
  const a = buildCore.allocation(gamedata.tree(), clean(raw));
  return a ? treeplan.suggestOrder(gamedata.tree(), a.allocated, a.start) : [];
});
ipcMain.handle('tree:save', (_e, raw) => {
  setBuild(clean(raw));
  saveBuild();
  const { build, buildOrders, state } = store;
  // Forget "taken" marks of milestones that are no longer in the order of any tree.
  const inSomeOrder = new Set(build.specs.length ? buildOrders.orders.flat() : build.order);
  state.passiveDone = (state.passiveDone || []).filter((id) => inSomeOrder.has(id));
  saveState();
  changed();
  bus.emit('notes-changed');
  const previous = build.specs[build.specIndex - 1];
  return {
    plan: progress.currentPlan(),
    order: progress.currentOrder(),
    inherited: build.specs.length ? buildOrders.inherited[build.specIndex] || 0 : 0,
    previousTitle: previous ? previous.title || `Tree ${build.specIndex}` : '',
  };
});
