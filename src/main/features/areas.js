'use strict';
// Follows the character through the campaign: the current area, its act, and which
// areas were already visited.
const { store, saveState } = require('../store');
const { session, setStatus } = require('../session');
const gamedata = require('../gamedata');
const progress = require('../progress');
const sounds = require('../platform/sounds');
const { norm } = require('../../core/text');
const { visitKey, actFor } = require('../../core/guide');

const isCampaign = (area) => gamedata.areaActs.has(norm(area));

function recordVisit(area) {
  const state = store.state;
  if (!state.visited.some((v) => norm(v) === norm(area))) state.visited.push(area);
  if (state.act && isCampaign(area)) {
    const key = visitKey(state.act, area);
    if (!state.visitedActs.includes(key)) state.visitedActs.push(key);
  }
  saveState();
}

// Called for every "You have entered X." of the game log. `initial` is true for the area
// the character was already in when the program started; `details` is { level, id } of the
// area from the log line before it, when there was one.
function onArea(area, initial, details) {
  const state = store.state;
  state.act = actFor(area, state.act, session.previousArea, gamedata.areaActs, details && details.id);
  if (isCampaign(area)) session.previousArea = area; // boss arenas and hideouts in between do not count
  session.currentArea = area;
  session.lastInventory = null;
  recordVisit(area);
  const act = isCampaign(area) && state.act ? ` (Act ${state.act})` : '';
  setStatus(initial ? `Current area: ${area}${act}` : `Entered ${area}${act}`);
  // Arriving in a town with something to buy: a short chime, so the list is not missed.
  if (!initial && progress.watchingPurchases()) sounds.play('gems');
}

// The act shown in the overlay can be wrong for a name used in two acts (for example when
// the program starts with the character already in the second half). This switches it.
function switchAct() {
  const area = session.currentArea;
  const acts = area ? gamedata.areaActs.get(norm(area)) || [] : [];
  if (acts.length < 2) return;
  store.state.act = acts[(acts.indexOf(store.state.act) + 1) % acts.length];
  recordVisit(area);
  setStatus(`Act set to ${store.state.act} for ${area}`);
}

// Forgets the progress. The route, the passive plan and the notes are kept.
function resetProgress() {
  const { act, library } = store.state;
  store.state = { visited: [], visitedActs: [], acquired: [], passiveDone: [], act, library };
  if (session.currentArea) recordVisit(session.currentArea); else saveState();
  setStatus('Progress reset');
}

module.exports = { onArea, recordVisit, switchAct, resetProgress };
