'use strict';
// The gem route: which gems to buy after each area. Pure functions, no Electron.
const { norm } = require('./text');

// Key of a visit to an area in a given act ("6|lioneye's watch").
const visitKey = (act, area) => `${act}|${norm(area)}`;

/**
 * Builds the map "area name -> acts it belongs to" from data/areas.json.
 * Some names exist in two acts, one in each half of the campaign.
 */
function indexAreas(groups) {
  const areaActs = new Map();
  for (const group of groups) {
    for (const name of group.areas) {
      const key = norm(name);
      if (!areaActs.has(key)) areaActs.set(key, []);
      areaActs.get(key).push(group.act);
    }
  }
  return areaActs;
}

/**
 * Accepts only the shape { steps: [{ area, act, gems: [names] }] } and drops everything else.
 * `act` is 1 to 10, or null for an area outside the campaign list. A step saved before acts
 * existed gets the first act its area appears in.
 */
function cleanGuide(raw, areaActs) {
  const steps = [];
  const seen = new Set();
  for (const s of Array.isArray(raw?.steps) ? raw.steps : []) {
    if (typeof s?.area !== 'string' || !s.area.trim()) continue;
    const acts = areaActs.get(norm(s.area)) || [];
    let act = Number(s.act);
    if (!acts.includes(act)) act = acts.length ? acts[0] : null;
    const id = `${act || 0}|${norm(s.area)}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const gems = [...new Set((Array.isArray(s.gems) ? s.gems : []).filter((g) => typeof g === 'string' && g.trim()).map((g) => g.trim()))];
    steps.push({ area: s.area.trim(), act, gems });
  }
  return { steps };
}

/**
 * Gems from areas already visited and not bought yet. The key joins act, area and name,
 * so the same gem can appear under more than one area of the route.
 * `state` is the saved progress: { visited, visitedActs, acquired }.
 */
function pendingGems(guide, state, areaActs) {
  const visited = new Set((state.visited || []).map(norm));
  const visitedActs = new Set(state.visitedActs || []);
  const acquired = state.acquired || [];
  const out = [];
  for (const step of guide.steps) {
    // A step with an act needs that act's visit; a custom area goes by name alone.
    const seen = step.act ? visitedActs.has(visitKey(step.act, step.area)) : visited.has(norm(step.area));
    if (!seen) continue;
    const firstAct = (areaActs.get(norm(step.area)) || [])[0];
    for (const name of step.gems) {
      const oldKey = `${step.area}|${name}`; // how purchases were recorded before acts existed
      const key = step.act ? `${step.act}|${oldKey}` : oldKey;
      const bought = acquired.includes(key) || (step.act === firstAct && acquired.includes(oldKey));
      if (!bought) out.push({ key, name, area: step.area });
    }
  }
  return out;
}

/**
 * Works out which act an area belongs to. Names used twice are one in each half of the
 * campaign, so the half you are in decides. The second half starts after Kitava: arriving
 * at Lioneye's Watch straight from The Cathedral Rooftop while in Act 5.
 * `currentAct` is the act before entering; `previousArea` the last campaign area entered.
 */
function actFor(area, currentAct, previousArea, areaActs) {
  const acts = areaActs.get(norm(area));
  if (!acts) return currentAct || null; // a hideout or similar: stay in the same act
  if (acts.length === 1) return acts[0];
  const [first, second] = acts;
  if ((currentAct || 1) >= 6) return second;
  const afterKitava = currentAct === 5 && previousArea && norm(previousArea) === norm('The Cathedral Rooftop') && second === 6;
  return afterKitava ? second : first;
}

module.exports = { visitKey, indexAreas, cleanGuide, pendingGems, actFor };
