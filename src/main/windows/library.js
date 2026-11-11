'use strict';
// Builds window: saved setups (gem route + passive trees with their notes), one file each
// in the "builds" folder of the user data folder. Loading one replaces the current setup;
// progress (gems bought, points taken) is left alone and has its own reset in the overlay.
const fs = require('fs');
const { ipcMain, shell } = require('electron');
const { singleWindow } = require('./common');
const paths = require('../paths');
const { store, setBuild, saveBuild, saveGuide, saveState } = require('../store');
const { bus, changed, setStatus } = require('../session');
const gamedata = require('../gamedata');
const { cleanGuide } = require('../../core/guide');
const { cleanBuild } = require('../../core/build');
const treeplan = require('../../core/treeplan');

const win = singleWindow('library', { width: 640, height: 700, minWidth: 480, minHeight: 420, title: 'Builds' });

const dir = () => paths.user('builds');
const fileOf = (id) => (/^[a-z0-9-]{1,60}$/.test(String(id)) ? paths.user('builds', `${id}.json`) : null);
const cleanName = (name) => String(name || '').replace(/\s+/g, ' ').trim().slice(0, 60);
// What makes two setups "the same": the tree picked in the tree window does not count.
const setupKey = (g, b) => JSON.stringify([g.steps, b.specs, b.tails, b.order, b.notes]);

// The numbers and names shown on the card of a setup.
function describe(g, b) {
  const tree = gamedata.tree();
  const names = g.steps.flatMap((s) => s.gems);
  const colors = { str: 0, dex: 0, int: 0 };
  for (const name of names) if (colors[gamedata.gemColors.get(name)] !== undefined) colors[gamedata.gemColors.get(name)]++;
  // The last tree is the finished character: its class, ascendancy and size describe the build.
  const last = b.specs[b.specs.length - 1];
  const cls = last ? tree.classes[last.classId] : null;
  return {
    areas: g.steps.filter((s) => s.gems.length).length,
    gems: names.length,
    colors,
    firstGems: [...new Set(names)].slice(0, 3),
    trees: b.specs.length,
    treeTitles: b.specs.map((s) => s.title).filter(Boolean).slice(0, 12),
    className: cls ? cls.name : '',
    ascendancy: cls && last.ascendClassId ? cls.ascendancies[last.ascendClassId - 1] || '' : '',
    treePoints: last ? treeplan.knownNodes(tree, last.nodes).size : 0,
    points: b.specs.length ? 0 : b.order.length,
    notes: Boolean(b.notes),
  };
}
function readAll() {
  const items = [];
  let files = [];
  try { files = fs.readdirSync(dir()); } catch { /* nothing saved yet */ }
  for (const file of files) {
    const id = file.replace(/\.json$/, '');
    if (!file.endsWith('.json') || !fileOf(id)) continue;
    try {
      const raw = JSON.parse(fs.readFileSync(fileOf(id), 'utf8'));
      items.push({
        id,
        name: cleanName(raw.name) || id,
        savedAt: Number(raw.savedAt) || 0,
        guide: cleanGuide(raw.guide, gamedata.areaActs),
        tree: cleanBuild(gamedata.tree(), raw.tree),
      });
    } catch { /* not a build file: skipped */ }
  }
  return items.sort((a, b) => a.name.localeCompare(b.name));
}
// What the window shows. `extra` carries an error message, when there is one.
function libraryState(extra = {}) {
  const now = setupKey(store.guide, store.build);
  const current = describe(store.guide, store.build);
  const items = readAll().map((it) => ({
    id: it.id, name: it.name, savedAt: it.savedAt, ...describe(it.guide, it.tree),
    same: setupKey(it.guide, it.tree) === now,
    active: it.id === store.state.library,
  }));
  return {
    items,
    current: { ...current, empty: current.gems === 0 && current.trees === 0 && current.points === 0 && !current.notes, saved: items.some((it) => it.same) },
    ...extra,
  };
}
// Saves the current setup as build `id`.
function write(id, name) {
  fs.mkdirSync(dir(), { recursive: true });
  fs.writeFileSync(fileOf(id), JSON.stringify({ name, savedAt: Date.now(), guide: store.guide, tree: store.build }));
  store.state.library = id;
  saveState();
}

ipcMain.on('open-library', win.open);
ipcMain.handle('library:get', () => libraryState());
ipcMain.handle('library:save', (_e, rawName) => {
  const name = cleanName(rawName);
  if (!name) return libraryState({ error: 'Give the build a name first.' });
  const items = readAll();
  if (items.some((it) => it.name.toLowerCase() === name.toLowerCase())) {
    return libraryState({ error: `There is already a build called "${name}". Use "Save over" on it, or pick another name.` });
  }
  const base = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'build';
  let id = base;
  for (let n = 2; items.some((it) => it.id === id); n++) id = `${base}-${n}`;
  write(id, name);
  return libraryState();
});
ipcMain.handle('library:update', (_e, id) => {
  const item = readAll().find((it) => it.id === id);
  if (!item) return libraryState({ error: 'That build is no longer in the folder.' });
  write(item.id, item.name);
  return libraryState();
});
ipcMain.handle('library:rename', (_e, id, rawName) => {
  const name = cleanName(rawName);
  const items = readAll();
  const item = items.find((it) => it.id === id);
  if (!item) return libraryState({ error: 'That build is no longer in the folder.' });
  if (!name) return libraryState({ error: 'The name cannot be empty.' });
  if (items.some((it) => it.id !== id && it.name.toLowerCase() === name.toLowerCase())) return libraryState({ error: `There is already a build called "${name}".` });
  fs.writeFileSync(fileOf(id), JSON.stringify({ name, savedAt: item.savedAt, guide: item.guide, tree: item.tree }));
  return libraryState();
});
ipcMain.handle('library:delete', (_e, id) => {
  const file = fileOf(id);
  try { if (file) fs.unlinkSync(file); } catch { /* already gone */ }
  if (store.state.library === id) { delete store.state.library; saveState(); }
  return libraryState();
});
ipcMain.handle('library:load', (_e, id) => {
  const item = readAll().find((it) => it.id === id);
  if (!item) return libraryState({ error: 'That build is no longer in the folder.' });
  store.guide = item.guide;
  setBuild(item.tree);
  saveGuide();
  saveBuild();
  store.state.library = id;
  saveState();
  changed();
  bus.emit('setup-replaced'); // windows that were showing the previous setup start again
  bus.emit('notes-changed');
  setStatus(`Build loaded: ${item.name}`);
  return libraryState();
});
ipcMain.on('library:folder', () => { fs.mkdirSync(dir(), { recursive: true }); shell.openPath(dir()); });
