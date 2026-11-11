'use strict';
// The two sounds of the overlay: "gems" when you arrive in a town with gems to buy, and
// "great" for a great mercenary. Each one is a short chime made by the program itself,
// unless you put a file with that name (gems.mp3, great.wav...) in the "sounds" folder of
// the user data folder, or one ships in the sounds/ folder of the program.
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const paths = require('../paths');
const { config } = require('../config');
const { store } = require('../store');
const { bus } = require('../session');

const SOUND_EXT = ['.mp3', '.wav', '.ogg'];
const folders = () => [paths.user('sounds'), paths.bundledSounds()];

// Full path of a sound by name ("great" -> great.mp3, great.wav or great.ogg) or by exact
// file name, looking in your folder first. Null when there is no such file.
function find(name) {
  const base = path.basename(String(name)); // only files inside the sounds folders
  const names = SOUND_EXT.includes(path.extname(base).toLowerCase()) ? [base] : SOUND_EXT.map((ext) => base + ext);
  for (const dir of folders()) {
    for (const fileName of names) {
      const full = path.join(dir, fileName);
      if (fs.existsSync(full)) return full;
    }
  }
  return null;
}

// The volume slider of the overlay menu; before it is ever moved, config.json or 80%.
const masterVolume = () => Number(store.prefs.soundVolume ?? config.soundVolume ?? 0.8);

/**
 * Plays the sound called `name` ("gems" or "great"). `ownFile` is a file name that replaces
 * it for this one time (a mercenary rule can have its own sound).
 */
function play(name, ownFile) {
  const file = (ownFile && find(ownFile)) || find(name);
  // The volume set in the overlay times the volume of this sound (config.soundVolumes, keyed by name).
  const key = file ? path.parse(file).name : name;
  const perSound = Number(config.soundVolumes?.[key] ?? 1);
  const volume = Math.min(1, Math.max(0, masterVolume() * perSound));
  bus.emit('sound', { url: file ? pathToFileURL(file).href : null, chime: name, volume });
}

module.exports = { play, masterVolume };
