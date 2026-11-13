'use strict';
// Everything that is saved between runs, as JSON files in the user data folder:
//   state.json     progress (areas visited, gems bought, points taken, current act)
//   guide.json     the gem route
//   treeplan.json  the passive trees of the build, their order and the notes
//   prefs.json     what the options window changes
//   overlay.json   where the overlay sits and how big it is
const fs = require('fs');
const paths = require('./paths');
const { config } = require('./config');
const gamedata = require('./gamedata');
const { norm } = require('../core/text');
const { cleanGuide, visitKey } = require('../core/guide');
const buildCore = require('../core/build');
const { DEFAULTS, cleanPrefs } = require('../core/prefs');

const clampScale = (s) => Math.min(1.8, Math.max(0.7, Math.round((Number(s) || 1) * 10) / 10));

const store = {
  state: { visited: [], visitedActs: [], acquired: [] },
  guide: { steps: [] },
  build: buildCore.emptyBuild(),
  buildOrders: { orders: [], inherited: [] }, // the order of every tree, worked out from build.tails
  prefs: {},
  overlayPrefs: { x: null, y: null, scale: 1, linksAct: null },
};

const readJson = (name) => JSON.parse(fs.readFileSync(paths.user(name), 'utf8'));
const writeJson = (name, value, pretty) => fs.writeFileSync(paths.user(name), JSON.stringify(value, null, pretty ? 2 : 0));

function load() {
  fs.mkdirSync(paths.user(), { recursive: true });
  try { store.prefs = cleanPrefs(readJson('prefs.json')); } catch { /* options never changed */ }
  try {
    const saved = readJson('overlay.json');
    store.overlayPrefs = {
      x: Number.isFinite(saved.x) ? saved.x : null,
      y: Number.isFinite(saved.y) ? saved.y : null,
      scale: clampScale(saved.scale),
      linksAct: Number.isInteger(saved.linksAct) && saved.linksAct >= 0 && saved.linksAct <= 10 ? saved.linksAct : null,
      minimized: saved.minimized === true,
    };
  } catch { /* never moved or resized */ }
  try { setBuild(buildCore.cleanBuild(gamedata.tree(), readJson('treeplan.json'))); } catch { /* no passive plan yet */ }
  try { store.state = readJson('state.json'); } catch { /* first run */ }
  const state = store.state;
  if (!Array.isArray(state.visited)) state.visited = [];
  if (!Array.isArray(state.acquired)) state.acquired = [];
  if (!Array.isArray(state.visitedActs)) {
    // Progress saved before acts existed: count each visited area as its first act.
    state.visitedActs = state.visited.filter((a) => gamedata.areaActs.has(norm(a))).map((a) => visitKey(gamedata.areaActs.get(norm(a))[0], a));
  }
  try {
    store.guide = cleanGuide(readJson('guide.json'), gamedata.areaActs);
  } catch {
    // First run: reuse the gems listed in an old config.json, if any.
    const byArea = new Map();
    for (const g of config.gems || []) {
      if (!byArea.has(g.afterArea)) byArea.set(g.afterArea, []);
      byArea.get(g.afterArea).push(g.name);
    }
    store.guide = cleanGuide({ steps: [...byArea].map(([area, gems]) => ({ area, gems })) }, gamedata.areaActs);
  }
}

// Replaces the passive plan and works out the order of every tree again.
function setBuild(build) {
  store.build = build;
  store.buildOrders = buildCore.ordersOf(gamedata.tree(), build);
}

// An option: what the options window saved, else an old config.json, else the default.
const setting = (name) => store.prefs[name] ?? config[name] ?? DEFAULTS[name];
function setPrefs(change) {
  store.prefs = cleanPrefs({ ...store.prefs, ...change });
  writeJson('prefs.json', store.prefs, true);
}

module.exports = {
  store,
  load,
  setBuild,
  setting,
  setPrefs,
  clampScale,
  saveState: () => writeJson('state.json', store.state, true),
  saveGuide: () => writeJson('guide.json', store.guide, true),
  saveBuild: () => writeJson('treeplan.json', store.build),
  saveOverlayPrefs: () => writeJson('overlay.json', store.overlayPrefs),
};
