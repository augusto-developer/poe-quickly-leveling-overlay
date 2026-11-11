'use strict';
// Stand-ins for Electron and the two native libraries, so the main process can be loaded
// and driven by plain Node in the tests. Nothing here opens a window or touches the screen.
const Module = require('module');

function install(userData) {
  const fake = {
    ipc: { on: new Map(), handle: new Map() }, // what the windows can ask for
    sent: [],                                  // [channel, ...args] sent to any window
    windows: [],
    appEvents: new Map(),
    shortcuts: new Map(),
    hookHandlers: new Map(),
    ready: null,
    // Calls what a window would call through its preload.
    send(channel, ...args) { return fake.ipc.on.get(channel)({}, ...args); },
    invoke(channel, ...args) { return fake.ipc.handle.get(channel)({}, ...args); },
    lastState() { return [...fake.sent].reverse().find((m) => m[0] === 'state')[1]; },
  };

  class BrowserWindow {
    constructor(options) {
      this.options = options;
      this.destroyed = false;
      this.position = [options.x || 0, options.y || 0];
      this.handlers = new Map();
      this.reloads = 0;
      this.webContents = {
        send: (...args) => fake.sent.push(args),
        on: (event, cb) => { if (event === 'did-finish-load') this.loaded = cb; },
        setZoomFactor() {},
      };
      fake.windows.push(this);
    }
    loadFile(file) { this.file = file; if (this.loaded) this.loaded(); }
    on(event, cb) { this.handlers.set(event, cb); }
    isDestroyed() { return this.destroyed; }
    getPosition() { return this.position; }
    setPosition(x, y) { this.position = [x, y]; }
    setBounds(b) { this.position = [b.x, b.y]; }
    reload() { this.reloads++; }
    focus() {} setAlwaysOnTop() {} setIgnoreMouseEvents() {} setResizable() {} showInactive() {} hide() {}
  }

  const display = { id: 1, scaleFactor: 1, size: { width: 1920, height: 1080 }, bounds: { x: 0, y: 0, width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1040 } };
  const electron = {
    app: {
      getPath: (name) => (name === 'appData' ? require('path').dirname(userData) : userData),
      setPath() {},
      commandLine: { appendSwitch() {} },
      requestSingleInstanceLock: () => true,
      whenReady: () => ({ then: (cb) => { fake.ready = Promise.resolve().then(cb); return fake.ready; } }),
      on: (event, cb) => fake.appEvents.set(event, cb),
      quit() { fake.quit = true; },
    },
    BrowserWindow,
    ipcMain: {
      on: (channel, cb) => fake.ipc.on.set(channel, cb),
      handle: (channel, cb) => fake.ipc.handle.set(channel, cb),
    },
    screen: { getPrimaryDisplay: () => display, getDisplayNearestPoint: () => display },
    desktopCapturer: { getSources: async () => [] },
    dialog: {
      showOpenDialog: async () => ({ canceled: true, filePaths: [] }),
      showSaveDialog: async () => ({ canceled: true }),
      showMessageBox: async () => ({ response: 1 }),
    },
    globalShortcut: {
      register: (key, cb) => { fake.shortcuts.set(key, cb); return true; },
      unregisterAll: () => fake.shortcuts.clear(),
    },
    clipboard: { readText: () => '', writeText() {} },
    nativeImage: { createFromBitmap: () => ({ toPNG: () => Buffer.alloc(0) }) },
    shell: { beep() {}, openExternal(url) { fake.opened = url; }, openPath() {} },
  };
  const uiohook = {
    uIOhook: { on: (event, cb) => fake.hookHandlers.set(event, cb), start() {}, stop() {}, keyTap() {} },
    UiohookKey: { Ctrl: 29, CtrlRight: 3613, A: 30, F: 33, V: 47, P: 25 },
  };
  const tesseract = {
    createWorker: async () => ({ setParameters: async () => {}, recognize: async () => ({ data: { text: '' } }), terminate() {} }),
  };

  const stubs = { electron, 'uiohook-napi': uiohook, 'tesseract.js': tesseract };
  const realLoad = Module._load;
  Module._load = function (request, ...rest) {
    return Object.prototype.hasOwnProperty.call(stubs, request) ? stubs[request] : realLoad.call(this, request, ...rest);
  };
  fake.uninstall = () => { Module._load = realLoad; };
  return fake;
}

module.exports = { install };
