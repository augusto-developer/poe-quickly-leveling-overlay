'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('treeApi', {
  getData: () => ipcRenderer.invoke('tree:data'),
  importPob: (code) => ipcRenderer.invoke('tree:import', code),
  suggest: (build) => ipcRenderer.invoke('tree:suggest', build),
  save: (build) => ipcRenderer.invoke('tree:save', build),
  sendToRoute: (code) => ipcRenderer.send('pob:to-route', code),
  takePob: () => ipcRenderer.invoke('tree:take-pob'),
  onPobOffer: (cb) => ipcRenderer.on('tree:pob-offer', () => cb()),
});
