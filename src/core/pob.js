'use strict';
// Decodes a Path of Building export code and extracts its passive trees.
const zlib = require('zlib');

function attributes(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

// Turns XML entities back into characters (&lt; &amp; &#10; and so on).
function decodeEntities(s) {
  const named = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] !== '#') return named[code.toLowerCase()] ?? whole;
    const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
  });
}

// The text of the Notes tab of the build, without PoB's colour codes (^1 to ^9 and ^xRRGGBB).
function readNotes(xml) {
  const m = /<Notes>([\s\S]*?)<\/Notes>/.exec(xml);
  if (!m) return '';
  return decodeEntities(m[1])
    .replace(/\^x[0-9a-f]{6}/gi, '')
    .replace(/\^\d/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

// The gems of the link groups inside a part of the XML: [{ label, gems: [{ name, id, support }] }].
// `ids` (gem id -> name, from data/quests.json) gives the full name; without it a support
// gets " Support" added, as PoB leaves it out. Groups granted by an item are not gems.
function readGroups(xml, ids = {}) {
  const groups = [];
  for (const m of xml.matchAll(/<Skill\b([^>]*?)(?:\/>|>([\s\S]*?)<\/Skill>)/g)) {
    const skill = attributes(`<x ${m[1]}>`);
    if (skill.enabled === 'false' || skill.source) continue;
    const gems = [];
    for (const g of (m[2] || '').matchAll(/<Gem\b[^>]*>/g)) {
      const a = attributes(g[0]);
      if (a.enabled === 'false') continue;
      const id = a.gemId || '';
      const support = /SupportGem/.test(id) || /^Support/.test(a.skillId || '');
      let name = ids[id] || decodeEntities(a.nameSpec || '').trim();
      if (!name) continue;
      if (!ids[id] && support && !/ Support$/.test(name)) name += ' Support';
      if (!gems.some((x) => x.name === name)) gems.push({ name, id, support });
    }
    if (gems.length) groups.push({ label: decodeEntities(skill.label || '').trim() || gems.find((x) => !x.support)?.name || gems[0].name, gems });
  }
  return groups;
}

// The act a skill set is for, from its title ("Act 2", "act2", "Act 3-4"), or null.
function actOfTitle(title) {
  const m = /\bact\s*(\d{1,2})/i.exec(title || '');
  const act = m ? Number(m[1]) : 0;
  return act >= 1 && act <= 10 ? act : null;
}

/**
 * The skill sets of the build, in PoB's order: [{ title, act, groups }] (groups: see readGroups).
 * A build from before skill sets existed, or with a single set without an act in its title,
 * has one set for Act 1 on: the whole campaign.
 */
function readSkillSets(xml, ids = {}) {
  const sets = [];
  for (const m of xml.matchAll(/<SkillSet\b([^>]*?)(?:\/>|>([\s\S]*?)<\/SkillSet>)/g)) {
    const title = decodeEntities(attributes(`<x ${m[1]}>`).title || '').trim();
    sets.push({ title, act: actOfTitle(title), groups: readGroups(m[2] || '', ids) });
  }
  if (sets.length === 0) {
    const skills = /<Skills\b[^>]*>([\s\S]*?)<\/Skills>/.exec(xml);
    sets.push({ title: '', act: 1, groups: readGroups(skills ? skills[1] : '', ids) });
  }
  if (sets.length === 1 && !sets[0].act) sets[0].act = 1;
  return sets.filter((set) => set.groups.length > 0);
}

/**
 * A PoB code is the build XML, zlib-compressed and base64url-encoded.
 * Returns { specs: [{ title, treeVersion, classId, ascendClassId, nodes: [ids] }], active, notes,
 * skillSets } (skillSets: see readSkillSets; `ids` is passed on to it).
 * Throws an Error with a readable message when the text is not a PoB code.
 */
function decodePob(code, ids) {
  const text = String(code || '').trim();
  if (!text) throw new Error('Paste a Path of Building code first.');
  if (/^https?:\/\//i.test(text)) throw new Error('That is a link. Paste the build code itself (in PoB: Import/Export, Generate).');

  let xml;
  try {
    const base64 = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    xml = zlib.inflateSync(Buffer.from(base64, 'base64')).toString('utf8');
  } catch {
    throw new Error('This does not look like a Path of Building code.');
  }

  const tree = /<Tree\b[^>]*>/.exec(xml);
  const active = tree ? Number(attributes(tree[0]).activeSpec || 1) - 1 : 0;
  const specs = [];
  for (const m of xml.matchAll(/<Spec\b[^>]*>/g)) {
    const a = attributes(m[0]);
    specs.push({
      title: a.title || '',
      treeVersion: a.treeVersion || '',
      classId: Number(a.classId || 0),
      ascendClassId: Number(a.ascendClassId || 0),
      nodes: (a.nodes || '').split(',').map((s) => s.trim()).filter(Boolean),
    });
  }
  if (specs.length === 0) throw new Error('The code was read, but it has no passive tree in it.');
  return { specs, active: Math.min(Math.max(active, 0), specs.length - 1), notes: readNotes(xml), skillSets: readSkillSets(xml, ids) };
}

module.exports = { decodePob, readNotes, readSkillSets, actOfTitle };
