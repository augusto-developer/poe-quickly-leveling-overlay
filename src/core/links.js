/* Links: the gems you socket together, planned act by act. Shared by the main process (Node)
   and the windows (a plain <script>), so it has no requires.

   guide.links = { "1": { extra, links: [{ skill, supports }], hold, drop, swap: [{ from, to }] }, ... }
   - each act has its own final links;
   - an act shows the gems of its own areas of the route, plus `extra`: gems added in the
     links window only (never reminded to buy);
   - a link is one active gem and the gems linked to it (`supports`: usually supports, but an
     active gem can be linked too). A gem may be in several links.
   - `hold` are gems kept in the weapon swap (Set 2), `drop` gems thrown away, and `swap` gems
     replaced by another one (Herald of Ash for Purity of Elements) in that act. A marked gem
     is in no link of that act; the gem it is swapped for takes its place. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GemLinks = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const ACTS = 10;
  const name = (n) => (typeof n === 'string' && n.trim() && n.trim().length <= 80 ? n.trim() : null);
  const uniqueNames = (list) => [...new Set((Array.isArray(list) ? list : []).map(name).filter(Boolean))];

  // Accepts only the shape above and drops everything else, including empty acts.
  function cleanLinks(raw) {
    const out = {};
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    for (let act = 1; act <= ACTS; act++) {
      const a = raw[act] ?? raw[String(act)];
      if (!a || typeof a !== 'object') continue;
      const extra = uniqueNames(a.extra).slice(0, 100);
      const hold = uniqueNames(a.hold).slice(0, 100);
      const drop = uniqueNames(a.drop).filter((n) => !hold.includes(n)).slice(0, 100);
      const swap = [];
      for (const s of Array.isArray(a.swap) ? a.swap.slice(0, 100) : []) {
        const from = name(s?.from), to = name(s?.to);
        if (!from || !to || from === to || hold.includes(from) || drop.includes(from) || swap.some((x) => x.from === from)) continue;
        swap.push({ from, to });
      }
      const marked = new Set([...hold, ...drop, ...swap.map((s) => s.from)]);
      const links = [];
      const skills = new Set();
      for (const l of Array.isArray(a.links) ? a.links.slice(0, 60) : []) {
        const skill = name(l?.skill);
        if (!skill || skills.has(skill) || marked.has(skill)) continue;
        skills.add(skill);
        const supports = uniqueNames(l.supports).filter((s) => s !== skill && !marked.has(s)).slice(0, 10);
        if (supports.length) links.push({ skill, supports });
      }
      if (extra.length || links.length || hold.length || drop.length || swap.length) out[act] = { extra, links, hold, drop, swap };
    }
    return out;
  }

  // The links of one act ({ extra, links }), empty when there are none.
  const actOf = (links, act) => {
    const a = (links && links[act]) || {};
    return { extra: a.extra || [], links: a.links || [], hold: a.hold || [], drop: a.drop || [], swap: a.swap || [] };
  };

  // The gems of one act, in order: its areas of the route, the gems added for links, and any
  // gem a link still uses after it left the route.
  function poolFor(guide, act) {
    const names = [];
    for (const s of guide.steps || []) if (s.act === act) names.push(...s.gems);
    const a = actOf(guide.links, act);
    names.push(...a.extra, ...a.hold, ...a.drop, ...a.swap.flatMap((s) => [s.from, s.to]));
    for (const l of a.links) names.push(l.skill, ...l.supports);
    return [...new Set(names)];
  }

  // The closest act before `act` that has links, or 0.
  function previousWithLinks(links, act) {
    for (let a = act - 1; a >= 1; a--) if (actOf(links, a).links.length) return a;
    return 0;
  }

  // Is this a support gem? Uses the gem list, and the name for gems that are not in it.
  const isSupport = (gemName, gemByName) => {
    const g = gemByName && gemByName.get(gemName);
    return g ? g.type === 'support' : /\bsupport$/i.test(gemName);
  };

  return { ACTS, cleanLinks, actOf, poolFor, previousWithLinks, isSupport };
});
