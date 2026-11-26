'use strict';
// Builds data/quests.json: which gems each class can take as a quest reward, or buy from a
// vendor, after each quest of the campaign. Run it after a patch that changes the rewards:
//
//   git clone --depth 1 https://github.com/HeartofPhos/exile-leveling
//   node scripts/import-quests.js path/to/exile-leveling
//
// The rewards come from exile-leveling (MIT), which reads them from the game files and the
// wiki. What it does not have is how the overlay can tell a quest is done, since the game
// log does not say: that is the TRIGGERS table below, written by hand. A quest counts as
// done once its area was entered and the character reaches a town, like any step of the route.
const fs = require('fs');
const path = require('path');

// Reward offers that give gems, in campaign order. `after` is the area that counts as
// "the quest was done" (with its act), `where` where its NPCs are, `task` what to do.
const TRIGGERS = [
  { offer: 'a1q1', act: 1, after: 'The Twilight Strand', where: "Lioneye's Watch", task: 'Kill Hillock on The Twilight Strand.' },
  { offer: 'a1q4', act: 1, after: 'The Submerged Passage', where: "Lioneye's Watch", task: 'Find the three glyphs in The Mud Flats and open The Submerged Passage.' },
  { offer: 'a1q4b', act: 1, after: 'The Submerged Passage', where: "Lioneye's Watch", task: 'Find the three glyphs in The Mud Flats and open The Submerged Passage.' },
  { offer: 'a1q5', act: 1, after: 'The Tidal Island', where: "Lioneye's Watch", task: 'Kill Hailrake on The Tidal Island and bring the medicine chest back.' },
  { offer: 'a1q5b', act: 1, after: 'The Tidal Island', where: "Lioneye's Watch", task: 'Kill Hailrake on The Tidal Island and bring the medicine chest back.' },
  { offer: 'a1q2b', act: 1, after: 'The Lower Prison', where: "Lioneye's Watch", task: 'Enter The Lower Prison.' },
  { offer: 'a1q2', act: 1, after: "Prisoner's Gate", where: "Lioneye's Watch", task: 'Kill Brutus in The Upper Prison.' },
  { offer: 'a1q3', act: 1, after: 'The Cavern of Anger', where: "Lioneye's Watch", task: 'Kill Merveil in The Cavern of Anger.' },
  { offer: 'a2q6', act: 2, after: 'The Chamber of Sins Level 2', where: 'The Forest Encampment', task: 'Kill Fidelitas in The Chamber of Sins Level 2.' },
  { offer: 'a2q4', act: 2, after: "The Weaver's Chambers", where: 'The Forest Encampment', task: "Kill the Weaver in The Weaver's Chambers." },
  { offer: 'a3q1', act: 3, after: 'The City of Sarn', where: 'The Sarn Encampment', task: 'Free Clarissa in The City of Sarn.' },
  { offer: 'a3q8', act: 3, after: 'The Ebony Barracks', where: 'The Sarn Encampment', task: 'Kill General Gravicius in The Ebony Barracks.' },
  { offer: 'a3q12', act: 3, after: 'The Archives', where: 'The Library', task: 'Find the Golden Pages in The Archives and bring them to Siosa in The Library.' },
  { offer: 'a4q2', act: 4, after: 'The Crystal Veins', where: 'Highgate', task: 'Break the seal in The Mines Level 2, which opens The Crystal Veins.' },
  { offer: 'a4q1', act: 4, after: 'The Harvest', where: 'Highgate', task: 'Kill Malachai at the end of The Harvest.' },
  { offer: 'a6q4', act: 6, after: 'The Twilight Strand', where: "Lioneye's Watch", task: 'Clear The Twilight Strand of Act 6.' },
];

function main(dir) {
  if (!dir) throw new Error('Usage: node scripts/import-quests.js path/to/exile-leveling');
  const json = (name) => JSON.parse(fs.readFileSync(path.join(dir, 'common', 'data', 'json', name), 'utf8'));
  const quests = json('quests.json');
  const gemList = json('gems.json');
  const name = (id) => (gemList[id] ? gemList[id].name : null);

  const offers = TRIGGERS.map((t) => {
    const quest = Object.values(quests).find((q) => q.reward_offers && q.reward_offers[t.offer]);
    if (!quest) throw new Error(`Reward offer ${t.offer} is not in the data any more: update TRIGGERS.`);
    const o = quest.reward_offers[t.offer];
    const reward = {};
    for (const [id, r] of Object.entries(o.quest || {})) if (name(id)) reward[name(id)] = r.classes || [];
    const vendor = {};
    for (const [id, v] of Object.entries(o.vendor || {})) if (name(id)) vendor[name(id)] = { npc: v.npc, classes: v.classes || [] };
    return { id: t.offer, quest: quest.name, act: t.act, after: t.after, where: t.where, task: t.task, npc: o.quest_npc, reward, vendor };
  });

  // The two gems each class gets on The Twilight Strand without a quest: the skill it starts
  // with and the support in the chest near the start. They never go to the route.
  const start = {};
  for (const [cls, c] of Object.entries(json('characters.json'))) start[cls] = [name(c.start_gem_id), name(c.chest_gem_id)].filter(Boolean);

  // PoB names a gem by its id too: the map lets an import find the gem whatever PoB calls it.
  const ids = {};
  for (const [id, g] of Object.entries(gemList)) ids[id] = g.name;

  const out = {
    source: 'exile-leveling by HeartofPhos (MIT), https://github.com/HeartofPhos/exile-leveling',
    note: 'Classes: an empty list means every class.',
    start,
    offers,
    ids,
  };
  const file = path.join(__dirname, '..', 'data', 'quests.json');
  fs.writeFileSync(file, JSON.stringify(out) + '\n');
  const count = (k) => offers.reduce((n, o) => n + Object.keys(o[k]).length, 0);
  console.log(`Wrote ${file}: ${offers.length} offers, ${count('reward')} rewards, ${count('vendor')} vendor gems, ${Object.keys(ids).length} gem ids.`);
}

main(process.argv[2]);
