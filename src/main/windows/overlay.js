'use strict';
// The overlay itself: a small transparent panel that stays on top of the game, lets
// clicks through outside its own controls and never takes the keyboard focus.
const { app, BrowserWindow, ipcMain, screen } = require('electron');
const paths = require('../paths');
const { config } = require('../config');
const { store, saveState, saveOverlayPrefs, setPrefs, clampScale } = require('../store');
const { bus, changed } = require('../session');
const gamedata = require('../gamedata');
const progress = require('../progress');
const areas = require('../features/areas');
const purchases = require('../features/purchases');
const sounds = require('../platform/sounds');

const SIZE = { width: 300, height: 520 }; // at scale 1
let win = null;

const alive = () => win && !win.isDestroyed();
const size = () => ({
  width: Math.round(SIZE.width * store.overlayPrefs.scale),
  height: Math.round(SIZE.height * store.overlayPrefs.scale),
});
// Keeps the overlay reachable: its top bar always stays on a screen.
function clampToScreen(x, y) {
  const { width } = size();
  const area = screen.getDisplayNearestPoint({ x: Math.round(x + width / 2), y: Math.round(y) }).workArea;
  return {
    x: Math.round(Math.min(area.x + area.width - 80, Math.max(area.x - width + 80, x))),
    y: Math.round(Math.min(area.y + area.height - 40, Math.max(area.y, y))),
  };
}
function push() {
  if (alive()) win.webContents.send('state', progress.overlayState());
}

function create() {
  const prefs = store.overlayPrefs;
  const start = clampToScreen(prefs.x ?? config.overlay?.x ?? 20, prefs.y ?? config.overlay?.y ?? 260);
  win = new BrowserWindow({
    ...size(),
    x: start.x,
    y: start.y,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    webPreferences: { preload: paths.preload('overlay') },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(paths.page('overlay'));
  win.webContents.on('did-finish-load', () => {
    win.webContents.setZoomFactor(store.overlayPrefs.scale);
    push();
  });
  // Closing the overlay quits the program, even with other windows open.
  win.on('closed', () => app.quit());
}

bus.on('changed', push);
bus.on('sound', (sound) => { if (alive()) win.webContents.send('play-sound', sound); });

// The window ignores the mouse except while the pointer is over its controls.
ipcMain.on('hover', (_e, over) => { if (alive()) win.setIgnoreMouseEvents(!over, { forward: true }); });

// ---------- moving and resizing ----------
let dragOrigin = null;
ipcMain.on('overlay-drag-start', () => {
  const [x, y] = win.getPosition();
  dragOrigin = { x, y };
});
ipcMain.on('overlay-drag', (_e, dx, dy) => {
  if (!dragOrigin || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
  const p = clampToScreen(dragOrigin.x + dx, dragOrigin.y + dy);
  win.setPosition(p.x, p.y);
});
ipcMain.on('overlay-drag-end', () => {
  if (!dragOrigin) return;
  dragOrigin = null;
  const [x, y] = win.getPosition();
  Object.assign(store.overlayPrefs, { x, y });
  saveOverlayPrefs();
});
// step is -1 or +1: one notch smaller or bigger, between 70% and 180%.
ipcMain.on('overlay-resize', (_e, step) => {
  const scale = clampScale(store.overlayPrefs.scale + (step > 0 ? 0.1 : -0.1));
  if (scale === store.overlayPrefs.scale) return;
  store.overlayPrefs.scale = scale;
  const [x, y] = win.getPosition();
  win.setResizable(true); // a fixed-size window ignores setBounds on some systems
  win.setBounds({ x, y, ...size() });
  win.setResizable(false);
  win.webContents.setZoomFactor(scale);
  Object.assign(store.overlayPrefs, { x, y });
  saveOverlayPrefs();
});

// The volume slider of the menu: save it and play the gem chime once as a sample.
ipcMain.on('set-volume', (_e, value) => {
  if (!Number.isFinite(value)) return;
  setPrefs({ soundVolume: value });
  changed();
  sounds.play('gems');
});

// ---------- what the panel can do ----------
ipcMain.on('mark', (_e, key) => purchases.markBought(key));
ipcMain.on('reset', () => areas.resetProgress());
ipcMain.on('switch-act', () => areas.switchAct());
ipcMain.on('quit', () => app.quit());
ipcMain.on('open-wiki', (_e, name) => gamedata.openWiki(name));

// The overlay marks the current milestone as taken (click) or goes back one (undo).
ipcMain.on('passive-done', (_e, id) => {
  store.state.passiveDone = [...new Set([...(store.state.passiveDone || []), String(id)])];
  saveState();
  changed();
});
ipcMain.on('passive-undo', () => {
  const done = new Set(store.state.passiveDone || []);
  const last = [...progress.currentOrder()].reverse().find((id) => done.has(id));
  if (last) done.delete(last);
  store.state.passiveDone = [...done];
  saveState();
  changed();
});

module.exports = { create };
