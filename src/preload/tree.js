'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('treeApi', {
  getData: () => ipcRenderer.invoke('tree:data'),
  importPob: (code) => ipcRenderer.invoke('tree:import', code),
  suggest: (build) => ipcRenderer.invoke('tree:suggest', build),
  save: (build) => ipcRenderer.invoke('tree:save', build),
});
