'use strict';
// Passive tree key: searches for the next point of the order when the tree opens.
// After the key is pressed, one screen capture checks that the tree is really open (the
// "Skills" banner at the top) before anything is typed. This keeps a P typed in chat, or
// the P that closes the tree, from pasting text anywhere.
const { session, debug } = require('../session');
const { config } = require('../config');
const progress = require('../progress');
const { capture } = require('../platform/capture');
const ocr = require('../platform/ocr');
const { sleep, pasteIntoSearch } = require('../platform/keys');
const mercs = require('../../core/mercs');

let busy = false;
let lastSearch = null; // the name this program last put in the search field

const letters = (s) => s.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
// Is `shown` (what fits in the narrow search field) a piece of `name`? Tolerates OCR errors.
function isPieceOf(shown, name) {
  const a = letters(shown), b = letters(name);
  if (a.length < 3 || !b) return false;
  if (b.includes(a)) return true;
  for (let i = 0; i + a.length <= b.length; i++) {
    if (mercs.similarity(a, b.slice(i, i + a.length)) >= 0.75) return true;
  }
  return false;
}

async function passiveSearch() {
  const next = progress.nextPassive();
  if (!next || next.finished || busy || session.sendingKeys) return;
  busy = true;
  try {
    await sleep(Number(config.passiveSearchDelay ?? 350)); // let the tree finish opening
    const frame = await capture();
    const s = frame.h / 1080, cx = frame.w / 2;
    const box = (x0, y0, x1, y1) => [Math.round(cx + x0 * s), Math.round(y0 * s), Math.round(cx + x1 * s), Math.round(y1 * s)];

    const banner = await ocr.readBox(frame, box(-75, 52, 85, 86), 90, true); // dark "Skills" on the gold banner
    if (!/skills/i.test(banner)) return; // the tree is not open

    const shown = await ocr.readBox(frame, box(156, 54, 262, 81), 110);
    // An empty field shows the hint "Search here", which counts as empty.
    const empty = letters(shown).length < 2 || mercs.similarity(shown, 'search here') >= 0.7;
    const log = (what) => debug(`[passive] search field shows ${JSON.stringify(shown)}: ${what}`);
    if (!empty && isPieceOf(shown, next.name)) return log('already searching for ' + next.name);
    // Text that is neither empty nor something this program typed is your own search: leave it.
    if (!empty && !(lastSearch && isPieceOf(shown, lastSearch))) return log('left as it is');

    await pasteIntoSearch(next.name);
    lastSearch = next.name;
    log('searched for ' + next.name);
  } finally {
    busy = false;
  }
}

module.exports = { passiveSearch, isPieceOf };
