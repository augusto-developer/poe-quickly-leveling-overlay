'use strict';
// The passive plan of a build: the trees imported from Path of Building, how the points
// of each one are ordered, and the notes. Pure functions over data/tree.json.
const treeplan = require('./treeplan');

const emptyBuild = () => ({ specs: [], specIndex: 0, tails: [], order: [], notes: '' });

/**
 * Accepts only the expected shape and drops anything else.
 * `tails[i]` is how the points that are new in tree i are arranged (null = automatically);
 * `order` is only used when no build is imported.
 */
function cleanBuild(tree, raw) {
  const specs = [];
  for (const s of Array.isArray(raw?.specs) ? raw.specs.slice(0, 40) : []) {
    const classId = Number(s?.classId);
    if (!Number.isInteger(classId) || !tree.starts[classId]) continue;
    specs.push({
      title: String(s.title || '').slice(0, 80),
      treeVersion: String(s.treeVersion || '').slice(0, 20),
      classId,
      ascendClassId: Number(s.ascendClassId) || 0,
      nodes: (Array.isArray(s.nodes) ? s.nodes : []).map(String).filter((id) => /^\d{1,6}$/.test(id)).slice(0, 400),
    });
  }
  const specIndex = Math.min(Math.max(Number(raw?.specIndex) || 0, 0), Math.max(0, specs.length - 1));
  const order = [...new Set((Array.isArray(raw?.order) ? raw.order : []).map(String))]
    .filter((id) => treeplan.isMilestone(tree.nodes[id]));
  const notes = typeof raw?.notes === 'string' ? raw.notes.slice(0, 60000) : '';
  const tails = specs.map((_, i) => {
    const t = Array.isArray(raw?.tails) ? raw.tails[i] : null;
    return Array.isArray(t) ? [...new Set(t.map(String))].filter((id) => treeplan.isMilestone(tree.nodes[id])) : null;
  });
  // A plan saved before trees continued each other had a single order. Keep it when it
  // belongs to the first tree; for a later tree it is arranged automatically again.
  if (!Array.isArray(raw?.tails) && specs.length && specIndex === 0 && order.length) tails[0] = order;
  return { specs, specIndex, tails, order: specs.length ? [] : order, notes };
}

// The order of every tree. Each one continues the one before (see treeplan.resolveOrders).
function ordersOf(tree, build) {
  return build.specs.length ? treeplan.resolveOrders(tree, build.specs, build.tails) : { orders: [], inherited: [] };
}

// The nodes the selected tree allocates (plus the class start) and the id of that start.
function allocation(tree, build) {
  const spec = build.specs[build.specIndex];
  if (!spec) return null;
  const start = tree.starts[spec.classId];
  const allocated = treeplan.knownNodes(tree, spec.nodes);
  allocated.add(start);
  return { allocated, start };
}

// The steps of `order` with the points each one costs.
function planFor(tree, build, order) {
  const a = allocation(tree, build);
  if (!a) {
    // No build imported: the order is just a list, with no costs.
    return { steps: order.map((id) => ({ id, name: tree.nodes[id].n, type: tree.nodes[id].t, cost: null, path: [] })), spent: 0, remaining: 0 };
  }
  return treeplan.computePlan(tree, a.allocated, a.start, order);
}

module.exports = { emptyBuild, cleanBuild, ordersOf, allocation, planFor };
