'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('settingsApi', {
  getData: () => ipcRenderer.invoke('settings:data'),
  getGuide: () => ipcRenderer.invoke('settings:guide'),
  saveGuide: (guide) => ipcRenderer.send('settings:save', guide),
  exportGuide: (guide) => ipcRenderer.invoke('settings:export', guide),
  importGuide: () => ipcRenderer.invoke('settings:import'),
  openWiki: (name) => ipcRenderer.send('open-wiki', name),
});
