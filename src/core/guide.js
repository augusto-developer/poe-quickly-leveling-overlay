'use strict';
// The gem route: which gems to buy after each area. Pure functions, no Electron.
const { norm } = require('./text');
const { cleanLinks } = require('./links');

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
 * Accepts only the shape { steps: [{ area, act, gems: [names] }], links: {...} } and drops
 * everything else (see links.js for the links, planned act by act).
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
  return { steps, links: cleanLinks(raw?.links) };
}

// Has the character been through this area of the route? A step with an act needs that
// act's visit; a custom area goes by name alone.
function stepVisited(step, state) {
  if (step.act) return (state.visitedActs || []).includes(visitKey(step.act, step.area));
  return (state.visited || []).some((v) => norm(v) === norm(step.area));
}

/**
 * Gems from areas already visited and not bought yet. The key joins act, area and name,
 * so the same gem can appear under more than one area of the route.
 * `state` is the saved progress: { visited, visitedActs, acquired }.
 */
function pendingGems(guide, state, areaActs) {
  const acquired = state.acquired || [];
  const out = [];
  for (const step of guide.steps) {
    if (!stepVisited(step, state)) continue;
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

// The act in the game's own id of a campaign area: "1_1_town" is Act 1, "2_6_1" is Act 6.
// Null for anything else (hideouts, maps and so on).
function actOfAreaId(id) {
  const m = /^\d+_(\d+)_/.exec(String(id || ''));
  const act = m ? Number(m[1]) : 0;
  return act >= 1 && act <= 10 ? act : null;
}

/**
 * Works out which act an area belongs to.
 * The game log names the area being loaded just before "You have entered" ("1_1_1" is the
 * Twilight Strand of Act 1, "2_6_1" the one of Act 6), so `areaId` settles it whenever it is
 * there. Without it, the half of the campaign you are in decides: names used twice are one in
 * each half, and the second half starts after Kitava (arriving at Lioneye's Watch straight
 * from The Cathedral Rooftop while in Act 5).
 * `currentAct` is the act before entering; `previousArea` the last campaign area entered.
 */
function actFor(area, currentAct, previousArea, areaActs, areaId) {
  const acts = areaActs.get(norm(area));
  const fromId = actOfAreaId(areaId);
  if (acts && fromId && acts.includes(fromId)) return fromId;
  if (!acts) return currentAct || null; // a hideout or similar: stay in the same act
  if (acts.length === 1) return acts[0];
  const [first, second] = acts;
  if ((currentAct || 1) >= 6) return second;
  const afterKitava = currentAct === 5 && previousArea && norm(previousArea) === norm('The Cathedral Rooftop') && second === 6;
  return afterKitava ? second : first;
}

module.exports = { visitKey, indexAreas, cleanGuide, stepVisited, pendingGems, actFor, actOfAreaId };
