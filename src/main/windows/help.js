'use strict';
// "Can't find these gems?": a small window that says, for each gem of the list, which quest
// gives it and who to talk to. It stays on top of the game and follows the list.
const { ipcMain } = require('electron');
const { singleWindow } = require('./common');
const { bus } = require('../session');
const progress = require('../progress');

const win = singleWindow(
  'help',
  { width: 440, height: 560, minWidth: 300, minHeight: 240, alwaysOnTop: true, title: 'Where to get these gems' },
  (w) => w.setAlwaysOnTop(true, 'screen-saver'),
);

ipcMain.on('open-help', win.open);
ipcMain.handle('help:data', () => ({ className: progress.routeClass(), gems: progress.pendingHelp() }));
// the list changes when a gem is bought or an area is entered
bus.on('changed', () => { if (win.get()) win.get().webContents.send('help:changed'); });
