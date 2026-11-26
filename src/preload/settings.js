'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  getData: () => ipcRenderer.invoke('settings:data'),
  getGuide: () => ipcRenderer.invoke('settings:guide'),
  saveGuide: (guide) => ipcRenderer.send('settings:save', guide),
  exportGuide: (guide) => ipcRenderer.invoke('settings:export', guide),
  importGuide: () => ipcRenderer.invoke('settings:import'),
  openWiki: (name) => ipcRenderer.send('open-wiki', name),
  openLinks: () => ipcRenderer.send('open-links'),
  readPob: (code) => ipcRenderer.invoke('settings:pob', code),
  plan: (cls, gems) => ipcRenderer.invoke('settings:plan', cls, gems),
  sendToTree: (code) => ipcRenderer.send('pob:to-tree', code),
  takePob: () => ipcRenderer.invoke('settings:take-pob'),
  onPobOffer: (cb) => ipcRenderer.on('settings:pob-offer', () => cb()),
});
