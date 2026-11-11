'use strict';
// Build notes window: the Notes tab of the imported PoB build, in a small window that
// stays on top of the game.
const { ipcMain } = require('electron');
const { singleWindow } = require('./common');
const { store } = require('../store');
const { bus } = require('../session');

const win = singleWindow(
  'notes',
  { width: 460, height: 620, minWidth: 280, minHeight: 200, alwaysOnTop: true, title: 'Build notes' },
  (w) => w.setAlwaysOnTop(true, 'screen-saver'),
);

ipcMain.on('open-notes', win.open);
ipcMain.handle('notes:get', () => store.build.notes || '');
bus.on('notes-changed', () => { if (win.get()) win.get().webContents.send('notes', store.build.notes || ''); });
