'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('libraryApi', {
  get: () => ipcRenderer.invoke('library:get'),
  save: (name) => ipcRenderer.invoke('library:save', name),
  update: (id) => ipcRenderer.invoke('library:update', id),
  rename: (id, name) => ipcRenderer.invoke('library:rename', id, name),
  remove: (id) => ipcRenderer.invoke('library:delete', id),
  load: (id) => ipcRenderer.invoke('library:load', id),
  openFolder: () => ipcRenderer.send('library:folder'),
});
