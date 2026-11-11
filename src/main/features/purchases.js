'use strict';
// Notices a gem being bought: Ctrl + left click on a vendor item whose tooltip title is a
// pending gem, followed by a new item in the inventory.
const { store, saveState } = require('../store');
const { session, setStatus } = require('../session');
const { config } = require('../config');
const progress = require('../progress');
const { capture } = require('../platform/capture');
const ocr = require('../platform/ocr');
const { sleep } = require('../platform/keys');
const vision = require('../../core/vision');

let baseline = null; // Promise with the inventory snapshot taken when Ctrl is pressed
let inFlight = 0;    // clicks still being processed
let credits = 0;     // items that entered the inventory and are not yet assigned to a click

const inventory = (frame) => vision.inventoryCells(frame, config.inventory);

// "Before" inventory snapshot, taken the moment Ctrl is pressed.
function onCtrlDown() {
  if (progress.watchingPurchases() && inFlight === 0) {
    baseline = capture().then(inventory).catch(() => null);
  }
}

// The captures (frameA at the moment of the click, frameB 300 ms later) are started on
// mousedown. Here they are only analysed, in order, regardless of where the mouse is now.
async function processClick(clickedAt, frameA, frameB) {
  if (baseline) {
    const b = await baseline;
    baseline = null;
    if (b) session.lastInventory = b;
  }

  const a = await frameA;
  const title = vision.findGemTitle(a);
  let matched = null;
  let read = null;
  if (title) {
    read = await ocr.readLine(title.image);
    matched = vision.bestMatch(read, progress.pendingGems().map((g) => g.name));
  }

  if (!session.lastInventory) session.lastInventory = inventory(a);

  // With fast clicks, the "after" snapshot of one click may already contain the item of the
  // next click. So we count how many items came in and keep the balance in credits.
  let after = inventory(await frameB);
  credits += vision.countGained(session.lastInventory, after);
  session.lastInventory = after;

  if (matched && credits === 0) {
    await sleep(Math.max(0, 750 - (Date.now() - clickedAt)));
    after = inventory(await capture());
    credits += vision.countGained(session.lastInventory, after);
    session.lastInventory = after;
  }

  const ms = Date.now() - clickedAt;
  if (!matched) {
    credits = Math.max(0, credits - 1); // if an item came in, it belongs to this click
    if (!title) return setStatus(`Ctrl+click with no gem title (${ms} ms)`);
    return setStatus(`Read "${read}", not in the list (${ms} ms)`);
  }
  if (credits === 0) return setStatus(`${matched}: nothing entered the inventory, purchase not confirmed (${ms} ms)`);

  credits--;
  const entry = progress.pendingGems().find((g) => g.name === matched);
  if (entry) store.state.acquired.push(entry.key);
  saveState();
  setStatus(`${matched}: bought (${ms} ms)`);
}

// Ctrl + left click while there is something to buy.
function onCtrlClick() {
  if (!progress.watchingPurchases()) return;
  const clickedAt = Date.now();
  // Both captures start now, without waiting for the queue: analysis may lag, the snapshot may not.
  const frameA = capture();
  const frameB = sleep(300).then(capture);
  frameA.catch(() => {});
  frameB.catch(() => {});
  inFlight++;
  session.queue = session.queue
    .then(() => processClick(clickedAt, frameA, frameB))
    .catch((err) => setStatus('Error: ' + err.message))
    .finally(() => {
      inFlight--;
      if (inFlight === 0) credits = 0; // end of the click burst
    });
}

// A gem ticked by hand in the overlay.
function markBought(key) {
  if (typeof key !== 'string') return;
  if (!store.state.acquired.includes(key)) store.state.acquired.push(key);
  saveState();
  setStatus(`${key.split('|').pop()}: marked manually`);
}

module.exports = { onCtrlDown, onCtrlClick, markBought };
