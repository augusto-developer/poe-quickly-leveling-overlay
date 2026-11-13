'use strict';
// Where the character is in the route and in the passive plan, from what is saved.
const { store } = require('./store');
const { session } = require('./session');
const gamedata = require('./gamedata');
const sounds = require('./platform/sounds');
const updates = require('./features/updates');
const { norm } = require('../core/text');
const guideCore = require('../core/guide');
const GemLinks = require('../core/links');
const buildCore = require('../core/build');

const pendingGems = () => guideCore.pendingGems(store.guide, store.state, gamedata.areaActs);
const inTown = () => session.currentArea !== null && gamedata.isTown(session.currentArea);
// Purchases are only watched inside a town with something left to buy.
const watchingPurchases = () => inTown() && pendingGems().length > 0;

// ---------- links ----------
// The act shown in the drawer: the one you picked last, which follows you into each new act.
const drawerAct = () => store.overlayPrefs.linksAct || store.state.act || 1;

// What the drawer of the overlay shows: the final links of one act.
function linksForOverlay() {
  const links = store.guide.links || {};
  const acts = Object.keys(links).map(Number).filter((a) => { const x = GemLinks.actOf(links, a); return x.links.length || x.hold.length || x.drop.length || x.swap.length; }).sort((a, b) => a - b);
  const act = drawerAct();
  const color = (name) => gamedata.gemColors.get(name) || 'unknown';
  return {
    any: acts.length > 0,
    acts,
    act,
    open: session.drawerOpen,
    links: GemLinks.actOf(links, act).links.map((l) => ({
      skill: { name: l.skill, color: color(l.skill) },
      supports: l.supports.map((name) => ({ name, color: color(name) })),
    })),
    hold: GemLinks.actOf(links, act).hold.map((name) => ({ name, color: color(name) })),
    drop: GemLinks.actOf(links, act).drop.map((name) => ({ name, color: color(name) })),
    swap: GemLinks.actOf(links, act).swap.map((s) => ({ from: { name: s.from, color: color(s.from) }, to: { name: s.to, color: color(s.to) } })),
  };
}

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
    links: linksForOverlay(),
  };
}

module.exports = { linksForOverlay, pendingGems, inTown, watchingPurchases, currentOrder, currentPlan, nextPassive, overlayState };
