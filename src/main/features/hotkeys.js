'use strict';
// The global hotkeys (by default F2, F3 and F4) and what each one does.
const { globalShortcut } = require('electron');
const { setting } = require('../store');
const { session, setStatus } = require('../session');
const { HOTKEYS } = require('../../core/prefs');
const regex = require('./regex');
const { analyzeMerc } = require('./mercenary');

const ACTIONS = {
  regexHotkey: () => regex.pasteGemRegex().catch((err) => setStatus('Regex error: ' + err.message)),
  mercHotkey: () => { session.queue = session.queue.then(analyzeMerc).catch((err) => setStatus('Mercenary error: ' + err.message)); },
  globalRegexHotkey: () => regex.pasteOwnRegex().catch((err) => setStatus('My regex error: ' + err.message)),
};

let errors = {}; // option name -> why its hotkey could not be registered

// (Re)registers the hotkeys and notes which ones could not be taken.
function register() {
  globalShortcut.unregisterAll();
  errors = {};
  const count = {};
  for (const name of HOTKEYS) {
    const key = String(setting(name) || '');
    if (key) count[key] = (count[key] || 0) + 1;
  }
  for (const name of HOTKEYS) {
    const key = String(setting(name) || '');
    if (!key) continue; // turned off
    // The same key on two actions: neither is registered, and both rows say so.
    if (count[key] > 1) { errors[name] = 'Same key as another hotkey. Neither works until one is changed.'; continue; }
    let ok = false;
    try { ok = globalShortcut.register(key, ACTIONS[name]); } catch { ok = false; }
    if (!ok) errors[name] = 'Could not take this key. Another program may be using it.';
  }
  if (Object.keys(errors).length) setStatus('Some hotkeys are not working. Open the options to see which.');
}
const release = () => globalShortcut.unregisterAll();

module.exports = { register, release, errors: () => errors };
