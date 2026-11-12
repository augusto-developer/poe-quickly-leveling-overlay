'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('overlay', {
  onState: (cb) => ipcRenderer.on('state', (_e, s) => cb(s)),
  hover: (over) => ipcRenderer.send('hover', over),
  mark: (name) => ipcRenderer.send('mark', name),
  reset: () => ipcRenderer.send('reset'),
  quit: () => ipcRenderer.send('quit'),
  openSettings: () => ipcRenderer.send('open-settings'),
  openTree: () => ipcRenderer.send('open-tree'),
  openNotes: () => ipcRenderer.send('open-notes'),
  openLibrary: () => ipcRenderer.send('open-library'),
  openOptions: () => ipcRenderer.send('open-options'),
  switchAct: () => ipcRenderer.send('switch-act'),
  dragStart: () => ipcRenderer.send('overlay-drag-start'),
  drag: (dx, dy) => ipcRenderer.send('overlay-drag', dx, dy),
  dragEnd: () => ipcRenderer.send('overlay-drag-end'),
  resize: (step) => ipcRenderer.send('overlay-resize', step),
  setVolume: (value) => ipcRenderer.send('set-volume', value),
  passiveDone: (id) => ipcRenderer.send('passive-done', id),
  passiveUndo: () => ipcRenderer.send('passive-undo'),
  openWiki: (name) => ipcRenderer.send('open-wiki', name),
  updateNow: () => ipcRenderer.send('update-act'),
  updateLater: () => ipcRenderer.send('update-dismiss'),
  onSound: (cb) => ipcRenderer.on('play-sound', (_e, sound) => cb(sound)),
  onToast: (cb) => ipcRenderer.on('toast', (_e, t) => cb(t)),
  onToastHide: (cb) => ipcRenderer.on('toast-hide', () => cb()),
});
