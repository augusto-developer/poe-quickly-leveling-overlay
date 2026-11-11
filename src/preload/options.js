'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('optionsApi', {
  get: () => ipcRenderer.invoke('options:get'),
  set: (change) => ipcRenderer.invoke('options:set', change),
  recording: (on) => ipcRenderer.invoke('options:recording', on),
  chooseGameFolder: () => ipcRenderer.invoke('options:game-folder'),
  reset: () => ipcRenderer.invoke('options:reset'),
});
