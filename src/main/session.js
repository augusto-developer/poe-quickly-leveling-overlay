'use strict';
// What is only true while the program runs (nothing here is saved), and the bus the parts
// use to tell each other that something changed.
//
// Events on the bus:
//   changed          progress, route, plan or status changed: the overlay shows it again
//   sound            (url, volume) play an alert sound
//   setup-replaced   another build was loaded: windows showing the old one start again
//   notes-changed    the build notes changed
const { EventEmitter } = require('events');
const { config } = require('./config');

const bus = new EventEmitter();

const session = {
  currentArea: null,
  previousArea: null,     // last campaign area entered
  status: 'Starting...',
  lastInventory: null,    // last known inventory state
  sendingKeys: false,     // true while the program itself is sending keys (the hooks ignore them)
  ctrlDown: false,
  recordingHotkey: false, // true while the options window is waiting for a key press
  queue: Promise.resolve(), // screen analyses run one at a time, in order
};

const changed = () => bus.emit('changed');
function setStatus(text) {
  session.status = text;
  if (config.debug) console.log('[status]', text);
  changed();
}
function debug(...args) {
  if (config.debug) console.log(...args);
}

module.exports = { bus, session, changed, setStatus, debug };
