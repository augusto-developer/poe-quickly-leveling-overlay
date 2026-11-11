'use strict';
// Centre-screen message: a click-through window near the top centre of the screen, shown
// for a moment. Used for the mercenary verdict: a cross, a tick, or gold raining down.
const { BrowserWindow, screen } = require('electron');
const paths = require('../paths');
const { config } = require('../config');

const TITLES = {
  great: 'This mercenary is GREAT!',
  good: 'This mercenary is GOOD!',
  check: 'This mercenary is GOOD, but check the supports',
  ok: 'This mercenary is OK',
  partial: 'Good type, wrong skills',
  unlisted: 'Not in your list',
  none: 'Mercenary window not found',
};

let win = null;
let timer = null;

function create() {
  const { bounds } = screen.getPrimaryDisplay();
  const width = Math.min(900, bounds.width);
  win = new BrowserWindow({
    width,
    height: 470,
    x: Math.round(bounds.x + (bounds.width - width) / 2),
    y: Math.round(bounds.y + bounds.height * (config.toastTop ?? 0.2)),
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    focusable: false,
    hasShadow: false,
    show: false,
    webPreferences: { preload: paths.preload('overlay') },
  });
  win.setAlwaysOnTop(true, 'screen-saver');
  win.setIgnoreMouseEvents(true);
  win.loadFile(paths.page('toast'));
}

function show(verdict, detail) {
  if (!win || win.isDestroyed()) return;
  clearTimeout(timer);
  win.showInactive(); // never takes focus away from the game
  win.webContents.send('toast', { verdict, title: TITLES[verdict] || verdict, detail });
  const seconds = Math.max(1, Number(config.toastSeconds ?? 3));
  // "Not in your list" needs no reading: the cross flashes and goes. The rain gets time to fall.
  const ms = verdict === 'unlisted' ? 1100 : Math.max(seconds, verdict === 'great' ? 3.2 : 0) * 1000;
  timer = setTimeout(() => {
    win.webContents.send('toast-hide');
    timer = setTimeout(() => { if (!win.isDestroyed()) win.hide(); }, 250);
  }, ms);
}

module.exports = { create, show };
