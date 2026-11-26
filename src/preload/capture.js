'use strict';
// The hidden screen view. While Ctrl is in use in a town with gems to buy, this window
// keeps a live video of the screen, and answers "what is in the inventory now?" in a few
// milliseconds. All the pixel work happens
// here, in its own process, so the main process (and with it the mouse and keyboard hooks)
// never waits for a screen capture.
const { ipcRenderer } = require('electron');
const vision = require('../core/vision');

let reader = null;
let track = null;
let latest = null; // the newest video frame; older ones are released at once
let canvas = null;
let ctx = null;

async function pump(onFirst) {
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    if (latest) latest.close();
    latest = value;
    if (onFirst) { onFirst(); onFirst = null; }
  }
}

ipcRenderer.on('capture:start', async (_e, { id, width, height, fps }) => {
  pause();
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        mandatory: {
          chromeMediaSource: 'desktop',
          chromeMediaSourceId: id,
          minWidth: width, maxWidth: width,
          minHeight: height, maxHeight: height,
          maxFrameRate: fps,
        },
      },
    });
    track = stream.getVideoTracks()[0];
    reader = new MediaStreamTrackProcessor({ track }).readable.getReader();
    await new Promise((resolve, reject) => {
      pump(resolve).catch(reject);
      setTimeout(() => reject(new Error('no video frame from the screen')), 3000);
    });
    ipcRenderer.send('capture:ready');
  } catch (err) {
    ipcRenderer.send('capture:failed', String((err && err.message) || err));
  }
});

// Pixels of a part of the newest frame, in the BGRA order the vision functions expect.
function grab(x, y, w, h) {
  if (!canvas || canvas.width !== w || canvas.height !== h) {
    canvas = new OffscreenCanvas(w, h);
    ctx = canvas.getContext('2d', { willReadFrequently: true });
  }
  ctx.drawImage(latest, x, y, w, h, 0, 0, w, h);
  const buf = ctx.getImageData(0, 0, w, h).data; // RGBA
  for (let p = 0; p < buf.length; p += 4) {
    const r = buf[p];
    buf[p] = buf[p + 2];
    buf[p + 2] = r;
  }
  return { buf, w, h };
}

// want = { override }: answers { cells }, the 60 inventory cells.
ipcRenderer.on('capture:look', (_e, n, want) => {
  try {
    if (!latest) throw new Error('no video frame yet');
    const c = vision.inventoryCrop(latest.displayWidth, latest.displayHeight, want.override);
    const cells = vision.inventoryCells(grab(c.x, c.y, c.w, c.h), c.geometry);
    ipcRenderer.send('capture:result', n, { cells });
  } catch (err) {
    ipcRenderer.send('capture:result', n, null, String((err && err.message) || err));
  }
});

// Stops recording the screen; the window stays open, ready to start again.
function pause() {
  if (reader) reader.cancel().catch(() => {});
  if (track) track.stop();
  if (latest) latest.close();
  reader = null;
  track = null;
  latest = null;
}
ipcRenderer.on('capture:stop', pause);
window.addEventListener('beforeunload', pause);
