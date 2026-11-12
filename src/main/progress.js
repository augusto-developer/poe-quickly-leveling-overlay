'use strict';
// Where the character is in the route and in the passive plan, from what is saved.
const { store } = require('./store');
const { session } = require('./session');
const gamedata = require('./gamedata');
const sounds = require('./platform/sounds');
const updates = require('./features/updates');
const { norm } = require('../core/text');
const guideCore = require('../core/guide');
const buildCore = require('../core/build');

const pendingGems = () => guideCore.pendingGems(store.guide, store.state, gamedata.areaActs);
const inTown = () => session.currentArea !== null && gamedata.isTown(session.currentArea);
// Purchases are only watched inside a town with something left to buy.
const watchingPurchases = () => inTown() && pendingGems().length > 0;

// The order of the tree that is selected now.
function currentOrder() {
  const { build, buildOrders } = store;
  return build.specs.length ? buildOrders.orders[build.specIndex] || [] : build.order;
}
const currentPlan = () => buildCore.planFor(gamedata.tree(), store.build, currentOrder());

// The next milestone that has not been marked as taken, for the overlay.
function nextPassive() {
  if (currentOrder().length === 0) return null;
  const done = new Set(store.state.passiveDone || []);
  const plan = currentPlan();
  const index = plan.steps.findIndex((s) => !done.has(s.id));
  if (index < 0) return { finished: true, total: plan.steps.length };
  const step = plan.steps[index];
  return { id: step.id, name: step.name, keystone: step.type === 'k', cost: step.cost, index: index + 1, total: plan.steps.length };
}

// Everything the overlay shows.
function overlayState() {
  const area = session.currentArea;
  const acts = area ? gamedata.areaActs.get(norm(area)) || [] : [];
  return {
    area,
    act: acts.length ? store.state.act || null : null,
    canSwitchAct: acts.length > 1,
    inTown: inTown(),
    pending: pendingGems().map((g) => ({ key: g.key, name: g.name, wiki: gamedata.gemUrls.has(g.name), color: gamedata.gemColors.get(g.name) || 'unknown' })),
    status: session.status,
    passive: nextPassive(),
    hasNotes: Boolean(store.build.notes),
    volume: sounds.masterVolume(),
    update: updates.forOverlay(),
  };
}

module.exports = { pendingGems, inTown, watchingPurchases, currentOrder, currentPlan, nextPassive, overlayState };
