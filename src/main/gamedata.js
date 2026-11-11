'use strict';
// Game data that ships with the program (the data/ folder): gems, campaign areas, towns
// and the passive tree.
const fs = require('fs');
const { shell } = require('electron');
const paths = require('./paths');
const { config } = require('./config');
const { norm } = require('../core/text');
const { indexAreas } = require('../core/guide');

const readData = (file) => JSON.parse(fs.readFileSync(paths.data(file), 'utf8'));

const gems = readData('gems.json');
const areas = readData('areas.json');
// Wiki page of each gem ("Item acquisition" section), used by the "wiki" link.
const gemUrls = new Map(gems.map((g) => [g.name, g.url]));
// Colour of each gem (str, dex, int or white), used for the dot in the overlay.
const gemColors = new Map(gems.map((g) => [g.name, g.color]));
// Which acts each campaign area belongs to.
const areaActs = indexAreas(areas);

let townSet = null;
function isTown(area) {
  if (!townSet) townSet = new Set((Array.isArray(config.towns) ? config.towns : readData('towns.json')).map(norm));
  return townSet.has(norm(area));
}

let treeData = null; // data/tree.json is big: loaded the first time it is needed
function tree() {
  if (!treeData) treeData = readData('tree.json');
  return treeData;
}

// Mercenary rules. A mercs.json in the user data folder replaces the one that ships.
function mercRules() {
  const own = paths.user('mercs.json');
  return JSON.parse(fs.readFileSync(fs.existsSync(own) ? own : paths.data('mercs.json'), 'utf8'));
}

// Only opens URLs that are in the gem list, never a URL coming from a window.
function openWiki(name) {
  const url = gemUrls.get(name);
  if (typeof url === 'string' && url.startsWith('https://www.poewiki.net/wiki/')) shell.openExternal(url);
}

module.exports = { gems, areas, gemUrls, gemColors, areaActs, isTown, tree, mercRules, openWiki };
