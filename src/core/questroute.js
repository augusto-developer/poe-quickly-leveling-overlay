'use strict';
// Where each gem of a build comes from in the campaign, for a given class: a quest reward
// (one free gem per quest) or a vendor. Uses data/quests.json. Pure functions, no Electron.
const { norm } = require('./text');

// An empty list means every class; with no class known, any class will do.
const forClass = (classes, cls) => !cls || !classes || classes.length === 0 || classes.includes(cls);
const rewardFor = (offer, gem, cls) => Object.prototype.hasOwnProperty.call(offer.reward, gem) && forClass(offer.reward[gem], cls);
const vendorFor = (offer, gem, cls) => {
  const v = offer.vendor[gem];
  return v && forClass(v.classes, cls) ? v : null;
};

// Which offers give a gem to a class (as reward or sold), by index, in campaign order.
const offersOf = (offers, gem, cls) => offers.map((o, i) => (rewardFor(o, gem, cls) || vendorFor(o, gem, cls) ? i : -1)).filter((i) => i >= 0);

// The offer to get a gem from, when it is needed from `act` on: the first one of that act;
// if that act has none, the last one before it (buy it before you need it); else the
// first one after. Without an act, simply the first one.
function choose(offers, candidates, act) {
  if (!act) return candidates[0];
  const same = candidates.filter((i) => offers[i].act === act);
  if (same.length) return same[0];
  const before = candidates.filter((i) => offers[i].act < act);
  if (before.length) return before[before.length - 1];
  return candidates.find((i) => offers[i].act > act);
}

/**
 * Plans the route of a build: each gem goes to a quest where the class can get it, in the
 * act it is needed (`neededAct[name]`, from the skill sets of the build) or, without one,
 * the first quest that gives it.
 * Only one gem per quest can be the free reward, so it goes to a gem the vendor of that quest
 * does not sell (if there is one); the others are bought, or a second gem that is only a
 * reward there looks for another quest.
 * `owned` are the gems the class already has from the start (see data/quests.json, `start`):
 * they are left out of the route and listed in `start`.
 * Returns { steps: [{ area, act, gems, get, from }], missing: [names], start: [names] } where
 * `get[name]` is 'reward' for the free gem of the step (the others are bought), `from[name]`
 * the id of the quest reward that gives it, and `missing`
 * lists the gems no quest or vendor of the campaign gives that class (drops, for example).
 */
function planRoute(offers, cls, gems, owned = [], neededAct = {}) {
  const all = [...new Set(gems)];
  const start = all.filter((g) => owned.includes(g));
  const left = all.filter((g) => !owned.includes(g));
  const missing = [];
  const target = new Map();   // gem -> offer index
  const skipped = new Map();  // gem -> offers it cannot use
  const assign = (g) => {
    const candidates = offersOf(offers, g, cls).filter((i) => !(skipped.get(g) || new Set()).has(i));
    if (candidates.length === 0) missing.push(g);
    else target.set(g, choose(offers, candidates, neededAct[g]));
  };
  left.forEach(assign);

  const gemsAt = (i) => left.filter((g) => target.get(g) === i);
  const rewardOnlyAt = (i) => gemsAt(i).filter((g) => !vendorFor(offers[i], g, cls));
  // a quest gives one free gem: a second gem that is only a reward there goes elsewhere
  for (let round = 0, moved = true; moved && round < 20; round++) {
    moved = false;
    offers.forEach((_o, i) => {
      for (const g of rewardOnlyAt(i).slice(1)) {
        if (!skipped.has(g)) skipped.set(g, new Set());
        skipped.get(g).add(i);
        target.delete(g);
        assign(g);
        moved = true;
      }
    });
  }

  // A gem bought in an act before the one that needs it waits for the last quest of that act
  // in the same town, so it shows up on the last visit there and not as soon as it is sold.
  const stepOfferFor = (g) => {
    const i = target.get(g);
    if (!neededAct[g] || offers[i].act >= neededAct[g]) return i;
    let last = i;
    offers.forEach((o, j) => { if (j > i && o.act === offers[i].act && o.where === offers[i].where) last = j; });
    return last;
  };

  const placed = []; // [step offer index, gem, free?]
  offers.forEach((offer, i) => {
    const here = gemsAt(i);
    const free = rewardOnlyAt(i)[0] || here.find((g) => rewardFor(offer, g, cls));
    for (const g of here) placed.push([stepOfferFor(g), g, g === free]);
  });
  placed.sort((a, b) => a[0] - b[0]);
  const byStep = new Map(); // "act|area" -> step, in campaign order
  for (const [j, g, free] of placed) {
    const offer = offers[j];
    const id = `${offer.act}|${norm(offer.after)}`;
    if (!byStep.has(id)) byStep.set(id, { area: offer.after, act: offer.act, gems: [], get: {}, from: {} });
    const step = byStep.get(id);
    if (!step.gems.includes(g)) step.gems.push(g);
    if (free) step.get[g] = 'reward';
    step.from[g] = offers[target.get(g)].id;
  }
  return { steps: [...byStep.values()], missing, start };
}

/**
 * How to get one gem of a step, for the help window and the marks of the overlay:
 * { how: 'reward' | 'buy', npc, where, quest, task }, or null when no quest of that area
 * gives it to this class (a step made by hand, for example).
 */
function sourceOf(offers, cls, step, gem) {
  // the quest the planner took it from (it can be an earlier one of the same town)
  const from = step.from && step.from[gem];
  const here = from ? offers.filter((o) => o.id === from) : offers.filter((o) => o.act === step.act && norm(o.after) === norm(step.area));
  const wantsReward = step.get && step.get[gem] === 'reward';
  for (const pass of wantsReward ? ['reward', 'buy'] : ['buy', 'reward']) {
    for (const o of here) {
      if (pass === 'reward' && rewardFor(o, gem, cls)) return { how: 'reward', npc: o.npc, where: o.where, quest: o.quest, task: o.task };
      const v = pass === 'buy' && vendorFor(o, gem, cls);
      if (v) return { how: 'buy', npc: v.npc, where: o.where, quest: o.quest, task: o.task };
    }
  }
  return null;
}

module.exports = { planRoute, sourceOf };
