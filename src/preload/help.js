'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('helpApi', {
  get: () => ipcRenderer.invoke('help:data'),
  onChange: (cb) => ipcRenderer.on('help:changed', () => cb()),
  openWiki: (name) => ipcRenderer.send('open-wiki', name),
});
