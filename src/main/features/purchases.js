'use strict';
// Notices a gem being bought: Ctrl + left click on a vendor gem that is pending, followed
// by a new item in the inventory.
//
// Which item was clicked comes from the game itself: at the moment of the click the program
// presses C, and as you are holding Ctrl the game copies the text of the item under the
// mouse. That is exact (no reading of the screen) and is taken at the click, so a gem the
// mouse passes over on its way to the next one is never mistaken for the one bought.
//
// The inventory is watched through the live view of the screen (platform/stream), which
// only records while Ctrl is in use in a town with gems to buy.
const { store, saveState } = require('../store');
const { bus, session, setStatus } = require('../session');
const { config } = require('../config');
const progress = require('../progress');
const stream = require('../platform/stream');
const keys = require('../platform/keys');
const { norm } = require('../../core/text');
const vision = require('../../core/vision');
const itemText = require('../../core/itemtext');

const { sleep } = keys;

const WAIT_GEM = 1000;  // how long a gem click waits for the item to show up in the inventory
const WAIT_OTHER = 300; // the same, for a click on anything else (keeps the inventory up to date)

let baseline = null; // Promise with the inventory taken when Ctrl is pressed
let inFlight = 0;    // clicks still being processed
let credits = 0;     // items that entered the inventory and are not yet assigned to a click

const inventory = () => stream.inventory({ override: config.inventory });

// The live view runs only while purchases are watched: in a town, with a gem left to buy.
function sync() {
  if (progress.watchingPurchases()) stream.open();
  else if (inFlight === 0) stream.close();
}
bus.on('changed', sync);

// Ctrl starts the recording, and the "before" inventory is taken from it when it is ready
// in time (never with a full capture: Ctrl alone is also used to move items to the stash).
function onCtrlDown() {
  if (!progress.watchingPurchases()) return;
  stream.wake();
  if (inFlight === 0) {
    baseline = stream.inventory({ override: config.inventory, liveOnly: true }).catch(() => null);
  }
}

// Looks at the inventory until an item came in or the time is up. With the live view this
// answers as soon as the item shows; with plain captures it looks less often.
async function waitForItem(clickedAt, limit) {
  const every = stream.live() ? 60 : 250;
  for (;;) {
    const after = await inventory();
    credits += vision.countGained(session.lastInventory, after);
    session.lastInventory = after;
    if (credits > 0 || Date.now() - clickedAt >= limit) return;
    await sleep(every);
  }
}
// `copied` is the text of the clicked item; `atClick` the inventory at the click.
async function processClick(clickedAt, copied, atClick) {
  if (baseline) {
    const b = await baseline;
    baseline = null;
    if (b) session.lastInventory = b;
  }
  const cells = await atClick;
  if (!session.lastInventory) session.lastInventory = cells;
  const gem = itemText.gemName(await copied);

  // With fast clicks, one click may already see the item of the next one. So we count how
  // many items came in and keep the balance in credits.
  await waitForItem(clickedAt, gem ? WAIT_GEM : WAIT_OTHER);
  const ms = Date.now() - clickedAt;

  if (!gem) {
    credits = Math.max(0, credits - 1); // if an item came in, it belongs to this click
    return setStatus(`Ctrl+click on something that is not a gem (${ms} ms)`);
  }
  if (credits === 0) return setStatus(`${gem}: clicked, but nothing entered the inventory: not bought`);
  credits--;

  const entry = progress.pendingGems().find((g) => norm(g.name) === norm(gem));
  if (!entry) return setStatus(`${gem}: bought, not one of the gems to buy here (${ms} ms)`);
  store.state.acquired.push(entry.key);
  saveState();
  setStatus(`${gem}: bought (${ms} ms)`);
}

// Ctrl + left click while there is something to buy.
function onCtrlClick() {
  if (!progress.watchingPurchases()) return;
  const clickedAt = Date.now();
  // Both start now, without waiting for the queue: a moment later the mouse is elsewhere.
  const copied = keys.copyHoveredItem().catch(() => null);
  const atClick = inventory();
  atClick.catch(() => {});
  inFlight++;
  session.queue = session.queue
    .then(() => processClick(clickedAt, copied, atClick))
    .catch((err) => setStatus('Error: ' + err.message))
    .finally(() => {
      inFlight--;
      if (inFlight === 0) { // end of the click burst
        credits = 0;
        keys.restoreClipboard();
        sync();
      }
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
