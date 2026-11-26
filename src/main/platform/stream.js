'use strict';
// A live view of the screen, kept by a hidden window (src/preload/capture.js). Asking it
// what the screen shows costs a few milliseconds and happens in that window's own process,
// so the main process, and with it the mouse and keyboard hooks, never stalls the way a
// full screen capture does.
//
// Recording the screen has a cost for the game too, so it only records while it is used:
// open() gets the window ready (in a town with gems to buy), wake() starts recording
// (when Ctrl is pressed), and it stops by itself a moment after the last use.
//
// When the live view cannot start (or has not started yet), the answers come from an
// ordinary screen capture instead, as before.
const { BrowserWindow, desktopCapturer, ipcMain, screen } = require('electron');
const paths = require('../paths');
const { config } = require('../config');
const { session, debug } = require('../session');
const { capture } = require('./capture');
const vision = require('../../core/vision');

const FPS = 10;          // enough to see an item enter the inventory
const IDLE_MS = 2500;    // stops recording this long after the last use (while Ctrl is up)
const ANSWER_MS = 1000;  // a question not answered in this time falls back to a capture

let win = null;
let loaded = false;      // the window is ready to record
let recording = false;   // asked to record
let ready = false;       // recording, with a frame to look at
let broken = false;      // the live view failed once: captures are used until the program restarts
let idleTimer = null;
let asked = 0;
let onReady = [];        // resolvers waiting for the first frame
const waiting = new Map(); // question number -> { resolve, reject, timer }

const alive = () => win && !win.isDestroyed();
const fromWindow = (e) => alive() && e && e.sender === win.webContents;
const enabled = () => config.liveView !== false && !broken;

function fail(reason) {
  debug('[stream] live view not available, using screen captures:', reason);
  broken = true;
  close();
}

// Gets the window ready to record. Nothing is recorded yet.
function open() {
  if (alive() || !enabled()) return;
  loaded = false;
  win = new BrowserWindow({
    show: false,
    width: 64,
    height: 64,
    skipTaskbar: true,
    focusable: false,
    webPreferences: {
      preload: paths.preload('capture'),
      sandbox: false, // the preload loads the vision functions from src/core
      contextIsolation: true,
      backgroundThrottling: false, // keeps receiving video frames while hidden
    },
  });
  win.webContents.on('did-finish-load', () => { loaded = true; });
  win.on('closed', () => { win = null; loaded = recording = ready = false; });
  win.loadFile(paths.page('capture'));
}

function rejectWaiting(why) {
  for (const [n, q] of waiting) { clearTimeout(q.timer); q.reject(new Error(why)); waiting.delete(n); }
}

// Stops recording; the window stays ready.
function pause() {
  clearTimeout(idleTimer);
  idleTimer = null;
  if (!recording) return;
  recording = ready = false;
  rejectWaiting('live view paused');
  if (alive()) win.webContents.send('capture:stop');
  debug('[stream] recording stopped');
}

// Closes the window altogether.
function close() {
  pause();
  rejectWaiting('live view closed');
  if (alive()) win.destroy();
  win = null;
  loaded = false;
}

function idleLater() {
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (session.ctrlDown || waiting.size) return idleLater(); // still in use
    pause();
  }, IDLE_MS);
  if (idleTimer.unref) idleTimer.unref();
}

async function record() {
  const display = screen.getPrimaryDisplay();
  const width = Math.round(display.size.width * display.scaleFactor);
  const height = Math.round(display.size.height * display.scaleFactor);
  // A zero-size thumbnail: only the id of the screen is needed, so this is cheap.
  const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 0, height: 0 } });
  const source = sources.find((s) => String(s.display_id) === String(display.id)) || sources[0];
  if (!source) return fail('no screen to show');
  if (alive() && recording) win.webContents.send('capture:start', { id: source.id, width, height, fps: FPS });
}

// Starts recording (or keeps it going a little longer).
function wake() {
  if (!alive() || !loaded) return;
  idleLater();
  if (recording) return;
  recording = true;
  record().catch((err) => fail(err.message));
}

ipcMain.on('capture:ready', (e) => {
  if (!fromWindow(e) || !recording) return;
  ready = true;
  for (const r of onReady) r();
  onReady = [];
  debug('[stream] recording');
});
ipcMain.on('capture:failed', (e, reason) => { if (fromWindow(e)) fail(reason); });
ipcMain.on('capture:result', (e, n, out, error) => {
  if (!fromWindow(e)) return;
  const q = waiting.get(n);
  if (!q) return;
  waiting.delete(n);
  clearTimeout(q.timer);
  if (out) q.resolve(out); else q.reject(new Error(error || 'no answer'));
});

function ask(want) {
  return new Promise((resolve, reject) => {
    const n = ++asked;
    const timer = setTimeout(() => { waiting.delete(n); reject(new Error('the live view did not answer')); }, ANSWER_MS);
    waiting.set(n, { resolve, reject, timer });
    win.webContents.send('capture:look', n, want);
  });
}

// The 60 inventory cells (true = filled). want = { override, liveOnly }; with liveOnly the
// answer is null instead of a full capture when the live view is not recording.
async function look(want) {
  wake();
  // Just woken: the first frame comes in a moment, and waiting for it is better than a capture.
  if (alive() && recording && !ready) {
    await new Promise((resolve) => { onReady.push(resolve); setTimeout(resolve, 300); });
  }
  if (want.liveOnly && !ready) return null;
  if (alive() && ready) {
    try {
      return (await ask(want)).cells;
    } catch (err) {
      debug('[stream] falling back to a capture:', err.message);
    }
  }
  return vision.inventoryCells(await capture(), want.override);
}

// True when answers are cheap (recording now).
const live = () => alive() && ready;

module.exports = { open, close, wake, inventory: look, live, stop: close };
