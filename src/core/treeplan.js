'use strict';
// Route planning over the passive tree: which milestones (notables and keystones) a build
// takes, a suggested order for them, and how many points each one costs to reach.
// Pure functions over data/tree.json, so they can be tested without Electron.

const isMilestone = (node) => node && (node.t === 'n' || node.t === 'k');

/**
 * Shortest path from any node already taken to `target`, walking only through nodes the
 * build allocates. Masteries are never walked through: they hang off a cluster and would
 * act as a shortcut between its notables.
 * Returns the new nodes on the way, ending with the target, or null if it cannot be reached.
 */
function pathTo(tree, allocated, taken, target) {
  if (taken.has(target)) return [];
  if (!allocated.has(target)) return null;
  const prev = new Map();
  const queue = [];
  for (const id of taken) { prev.set(id, null); queue.push(id); }
  for (let head = 0; head < queue.length; head++) {
    const id = queue[head];
    for (const next of tree.nodes[id].l) {
      if (prev.has(next) || !allocated.has(next)) continue;
      const node = tree.nodes[next];
      if (node.t === 'm' && next !== target) continue;
      prev.set(next, id);
      if (next === target) {
        const path = [];
        for (let at = target; at !== null && !taken.has(at); at = prev.get(at)) path.push(at);
        return path.reverse();
      }
      queue.push(next);
    }
  }
  return null;
}

// Keeps only the ids that exist in the drawn tree (drops ascendancy and cluster jewel nodes).
function knownNodes(tree, ids) {
  return new Set(ids.map(String).filter((id) => tree.nodes[id]));
}

function milestonesOf(tree, allocated) {
  return [...allocated].filter((id) => isMilestone(tree.nodes[id]));
}

/**
 * Orders `candidates` after what has already been `taken`: always the one that costs the
 * fewest new points next. This follows how a character actually grows out from where it is.
 * `taken` is changed in place. Candidates that cannot be reached go last.
 */
function suggestFrom(tree, allocated, taken, candidates) {
  const left = new Set(candidates);
  const order = [];
  while (left.size > 0) {
    let best = null, bestPath = null;
    for (const id of left) {
      const path = pathTo(tree, allocated, taken, id);
      if (!path) continue;
      if (!bestPath || path.length < bestPath.length || (path.length === bestPath.length && Number(id) < Number(best))) {
        best = id; bestPath = path;
      }
    }
    if (!best) break; // the rest is not connected to what was taken
    for (const id of bestPath) taken.add(id);
    left.delete(best);
    order.push(best);
  }
  return order.concat([...left].sort((a, b) => Number(a) - Number(b)));
}

// Suggests an order for every milestone of one tree, from the class start outwards.
function suggestOrder(tree, allocated, startId) {
  return suggestFrom(tree, allocated, new Set([startId]), milestonesOf(tree, allocated));
}

/**
 * Works out the order of every tree of a build, where each tree continues the one before.
 *
 * A build often has one tree per act. The order of a tree is:
 *   1. the order of the previous tree, keeping only the points this tree still takes;
 *   2. then the points that are new in this tree.
 * `tails[i]` is how the new points of tree i are arranged: a list chosen by the user, or
 * null to arrange them automatically, continuing from the points of step 1.
 *
 * A point the user left out of an earlier tree stays out of the automatic arrangement of
 * the later ones, until it is added back somewhere.
 *
 * Returns { orders: [ids per tree], inherited: [how many leading ids came from before] }.
 */
function resolveOrders(tree, specs, tails) {
  const orders = [], inherited = [];
  const dropped = new Set();
  let previous = [];
  specs.forEach((spec, i) => {
    const start = tree.starts[spec.classId];
    const allocated = knownNodes(tree, spec.nodes);
    allocated.add(start);
    const milestones = new Set(milestonesOf(tree, allocated));
    const prefix = previous.filter((id) => milestones.has(id));
    const inPrefix = new Set(prefix);

    let tail;
    const chosen = tails ? tails[i] : null;
    if (Array.isArray(chosen)) {
      tail = [...new Set(chosen.map(String))].filter((id) => milestones.has(id) && !inPrefix.has(id));
    } else {
      const taken = new Set([start]);
      for (const id of prefix) {
        const path = pathTo(tree, allocated, taken, id);
        if (path) for (const p of path) taken.add(p);
      }
      tail = suggestFrom(tree, allocated, taken, [...milestones].filter((id) => !inPrefix.has(id) && !dropped.has(id)));
    }

    const full = prefix.concat(tail);
    const inFull = new Set(full);
    for (const id of milestones) { if (inFull.has(id)) dropped.delete(id); else dropped.add(id); }
    orders.push(full);
    inherited.push(prefix.length);
    previous = full;
  });
  return { orders, inherited };
}

/**
 * Walks the milestones in the given order and works out the cost of each step.
 * Returns { steps: [{ id, name, type, cost, path }], spent, remaining } where `cost` is the
 * number of points needed for that step (null when it cannot be reached) and `remaining`
 * counts allocated points that no step uses (side nodes, masteries, jewel sockets).
 */
function computePlan(tree, allocated, startId, order) {
  const taken = new Set([startId]);
  const steps = [];
  for (const id of order) {
    const node = tree.nodes[id];
    if (!node) continue;
    const path = pathTo(tree, allocated, taken, id);
    if (path) for (const p of path) taken.add(p);
    steps.push({ id, name: node.n, type: node.t, cost: path ? path.length : null, path: path || [] });
  }
  let total = 0;
  for (const id of allocated) if (id !== startId && tree.nodes[id].t !== 'c') total++;
  const spent = taken.size - 1;
  return { steps, spent, remaining: Math.max(0, total - spent) };
}

module.exports = { isMilestone, pathTo, knownNodes, milestonesOf, suggestFrom, suggestOrder, resolveOrders, computePlan };
