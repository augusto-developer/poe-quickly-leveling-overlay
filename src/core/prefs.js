'use strict';
// What the user can change from the windows: hotkeys, the game folder, your own regex
// (options window) and the sound volume (overlay menu).

const DEFAULTS = { regexHotkey: 'F2', mercHotkey: 'F3', globalRegexHotkey: 'F4', passiveKey: 'P', passiveSearch: true, globalRegex: '' };
// The options that are global hotkeys (an Electron accelerator each).
const HOTKEYS = ['regexHotkey', 'mercHotkey', 'globalRegexHotkey'];
// An Electron accelerator such as "F2" or "Ctrl+Shift+G", or '' for "no hotkey".
const ACCELERATOR = /^((Ctrl|Alt|Shift)\+){0,3}([A-Z0-9]|F([1-9]|1\d|2[0-4])|Space|Tab|Insert|Delete|Home|End|PageUp|PageDown|Up|Down|Left|Right|num[0-9])$/;
const SINGLE_KEY = /^([A-Z0-9]|F([1-9]|1\d|2[0-4]))$/; // the passive tree key is one plain key, as in the game

// Accepts only known options with valid values and drops anything else.
function cleanPrefs(raw) {
  const out = {};
  for (const name of HOTKEYS) {
    if (typeof raw?.[name] === 'string' && (raw[name] === '' || ACCELERATOR.test(raw[name]))) out[name] = raw[name];
  }
  if (typeof raw?.passiveKey === 'string' && (raw.passiveKey === '' || SINGLE_KEY.test(raw.passiveKey))) out.passiveKey = raw.passiveKey;
  if (typeof raw?.passiveSearch === 'boolean') out.passiveSearch = raw.passiveSearch;
  if (Number.isFinite(raw?.soundVolume)) out.soundVolume = Math.min(1, Math.max(0, Math.round(raw.soundVolume * 100) / 100));
  if (typeof raw?.gameFolder === 'string' && raw.gameFolder.length < 400) out.gameFolder = raw.gameFolder;
  if (typeof raw?.globalRegex === 'string') out.globalRegex = raw.globalRegex.replace(/[\r\n]+/g, ' ').slice(0, 1000);
  return out;
}

module.exports = { DEFAULTS, HOTKEYS, ACCELERATOR, SINGLE_KEY, cleanPrefs };
