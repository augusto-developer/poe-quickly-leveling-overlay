'use strict';
// Advanced settings, for things the options window does not cover. Optional: the program
// runs without any config file. It reads config.json from the user data folder and, when
// running from source, also from the project folder (see config.example.json).
const fs = require('fs');
const path = require('path');
const paths = require('./paths');

const DEFAULTS = {
  debug: false,            // print what the program is doing to the console
  regexLimit: 250,         // characters the game accepts in a search field
  soundVolume: 0.8,        // 0 to 1
  soundVolumes: {},        // volume of one sound, by file name without extension
  toastTop: 0.2,           // height of the centre message, as a fraction of the screen
  toastSeconds: 3,
  passiveSearchDelay: 350, // ms to wait for the passive tree to open
  inventory: null,         // inventory grid, when the automatic geometry does not fit
  mercLayout: null,        // mercenary window positions, when they do not fit
};

const config = { ...DEFAULTS };

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}
function load() {
  Object.assign(config, DEFAULTS, readJson(path.join(paths.ROOT, 'config.json')), readJson(paths.user('config.json')));
  return config;
}

module.exports = { config, load };
