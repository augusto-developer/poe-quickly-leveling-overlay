'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('linksApi', {
  getData: () => ipcRenderer.invoke('links:data'),
  save: (act, set) => ipcRenderer.invoke('links:save', act, set),
  openWiki: (name) => ipcRenderer.send('open-wiki', name),
  onRefresh: (cb) => ipcRenderer.on('links:refresh', () => cb()),
  onShowAct: (cb) => ipcRenderer.on('links:show-act', (_e, act) => cb(act)),
});
