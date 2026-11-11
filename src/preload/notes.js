'use strict';
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('notesApi', {
  get: () => ipcRenderer.invoke('notes:get'),
  onChange: (cb) => ipcRenderer.on('notes', (_e, text) => cb(text)),
});
