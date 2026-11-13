'use strict';
// The pure logic in src/core, which needs neither Electron nor the game.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const { buildRegex } = require('../src/core/regex');
const { decodePob } = require('../src/core/pob');
const guide = require('../src/core/guide');
const { cleanPrefs } = require('../src/core/prefs');
const { cleanBuild, ordersOf } = require('../src/core/build');
const treeplan = require('../src/core/treeplan');
const mercs = require('../src/core/mercs');
const vision = require('../src/core/vision');
const gamefolder = require('../src/core/gamefolder');
const { parseArea, parseGenerated } = require('../src/core/logwatcher');

const areaActs = guide.indexAreas(require('../data/areas.json'));

test('regex: joins the gem names and shortens them to fit the search field', () => {
  assert.equal(buildRegex(['Freezing Pulse', 'Frostbolt']), '"freezing pulse|frostbolt"');
  assert.equal(buildRegex(['Frostbolt', 'frostbolt ']), '"frostbolt"', 'no duplicates');
  assert.equal(buildRegex([]), '');
  const many = Array.from({ length: 40 }, (_, i) => `Some Long Gem Name ${String.fromCharCode(65 + (i % 26))}${i}`);
  const short = buildRegex(many, 250);
  assert.ok(short.length <= 250, `${short.length} characters`);
  assert.match(short, /^"[^"]+"$/);
});

test('log: reads the id and level of the area being loaded', () => {
  assert.deepEqual(parseGenerated('2026/11/12 18:31:46 28742781 1186a8a3 [DEBUG Client 12424] Generating level 13 area "1_1_town" with seed 1'), { level: 13, id: '1_1_town' });
  assert.equal(parseGenerated('2026/11/12 18:31:46 28743140 f22b6a02 [INFO Client 12424] Tile hash: 1139181677'), null);
});

test('acts: the area id of the log decides between two areas with the same name', () => {
  assert.equal(guide.actOfAreaId('1_1_1'), 1);
  assert.equal(guide.actOfAreaId('2_6_1'), 6);
  assert.equal(guide.actOfAreaId('2_10_town'), 10);
  assert.equal(guide.actOfAreaId('HideoutCoastal'), null);
  assert.equal(guide.actOfAreaId('MapWorldsStrand'), null);
  // a new character starts in Act 1 even if the last one was in Act 7
  assert.equal(guide.actFor('The Twilight Strand', 7, 'The Causeway', areaActs, '1_1_1'), 1);
  assert.equal(guide.actFor('The Twilight Strand', 1, "Lioneye's Watch", areaActs, '2_6_1'), 6);
  // an id that does not belong to that name is ignored, and the old rule applies
  assert.equal(guide.actFor('The Twilight Strand', 7, 'The Causeway', areaActs, 'MapWorldsStrand'), 6);
});

test('log: reads the area from a "You have entered" line', () => {
  assert.equal(parseArea("2026/01/01 12:00:00 1 a [INFO Client 1] : You have entered Lioneye’s Watch."), "Lioneye's Watch");
  assert.equal(parseArea('2026/01/01 12:00:00 1 a [INFO Client 1] @From someone: You have entered nothing'), null);
});

test('route: cleaning keeps valid steps and gives each area its act', () => {
  const cleaned = guide.cleanGuide({ steps: [
    { area: ' The Lower Prison ', gems: ['Freezing Pulse', 'Freezing Pulse', '', 7] },
    { area: "Lioneye's Watch", act: 6, gems: ['Vitality'] },
    { area: "Lioneye's Watch", act: 6, gems: ['duplicate step'] },
    { area: 'My Hideout', act: 3, gems: [] },
    { nope: true },
  ] }, areaActs);
  assert.deepEqual(cleaned.steps, [
    { area: 'The Lower Prison', act: 1, gems: ['Freezing Pulse'] },
    { area: "Lioneye's Watch", act: 6, gems: ['Vitality'] },
    { area: 'My Hideout', act: null, gems: [] },
  ]);
  assert.deepEqual(guide.cleanGuide(null, areaActs), { steps: [], links: {} });
});

test('route: a town that exists in two acts is tracked once per act', () => {
  const route = guide.cleanGuide({ steps: [
    { area: "Lioneye's Watch", act: 1, gems: ['Frostbolt'] },
    { area: "Lioneye's Watch", act: 6, gems: ['Vitality'] },
  ] }, areaActs);
  const inAct1 = { visited: ["Lioneye's Watch"], visitedActs: [guide.visitKey(1, "Lioneye's Watch")], acquired: [] };
  assert.deepEqual(guide.pendingGems(route, inAct1, areaActs).map((g) => g.name), ['Frostbolt']);
  const inAct6 = { ...inAct1, visitedActs: [...inAct1.visitedActs, guide.visitKey(6, "Lioneye's Watch")], acquired: ["1|Lioneye's Watch|Frostbolt"] };
  assert.deepEqual(guide.pendingGems(route, inAct6, areaActs).map((g) => g.name), ['Vitality']);
});

test('links: one set per act, one card per active gem, supports may repeat', () => {
  const L = require('../src/core/links');
  const cleaned = guide.cleanGuide({
    steps: [{ area: 'The Coast', act: 1, gems: ['Spectral Throw', 'Volley Support'] }],
    links: {
      1: { extra: ['Frostblink', 'Frostblink', 5], links: [
        { skill: 'Spectral Throw', supports: ['Volley Support', 'Faster Attacks Support', 'Spectral Throw'] },
        { skill: 'Spectral Throw', supports: ['Onslaught Support'] }, // a second card for the same gem
        { skill: 'Frostblink', supports: ['Faster Attacks Support'] },
      ] },
      2: { extra: [], links: [] }, // empty: dropped
      11: { extra: ['x'] },        // not an act
    },
  }, areaActs);
  assert.deepEqual(cleaned.links, { 1: { extra: ['Frostblink'], links: [
    { skill: 'Spectral Throw', supports: ['Volley Support', 'Faster Attacks Support'] },
    { skill: 'Frostblink', supports: ['Faster Attacks Support'] },
  ], hold: [], drop: [], swap: [] } });
  assert.deepEqual(guide.cleanGuide({ steps: [], links: [{ gems: [] }] }, areaActs).links, {}, 'links of the old shape are dropped');

  // the gems of an act: its areas, then the added ones, then any gem a link still uses
  const g = { steps: [...cleaned.steps, { area: 'The Southern Forest', act: 2, gems: ['Herald of Ash'] }], links: cleaned.links };
  assert.deepEqual(L.poolFor(g, 1), ['Spectral Throw', 'Volley Support', 'Frostblink', 'Faster Attacks Support']);
  assert.deepEqual(L.poolFor(g, 2), ['Herald of Ash']);
  assert.equal(L.previousWithLinks(g.links, 3), 1);
  assert.equal(L.previousWithLinks(g.links, 1), 0);
  assert.equal(L.isSupport('Volley Support', new Map()), true);
  assert.equal(L.isSupport('Frostblink', new Map([['Frostblink', { type: 'skill' }]])), false);
});

test('links: a gem kept in Set 2 or dropped leaves the links of that act', () => {
  const L = require('../src/core/links');
  const cleaned = L.cleanLinks({ 3: {
    links: [
      { skill: 'Spectral Throw', supports: ['Volley Support', 'Faster Attacks Support'] },
      { skill: 'Leap Slam', supports: ['Volley Support'] }, // left with no supports: no link
    ],
    hold: ['Volley Support'],
    drop: ['Leap Slam', 'Volley Support'], // already held: hold wins
  } });
  assert.deepEqual(cleaned, { 3: { extra: [], links: [{ skill: 'Spectral Throw', supports: ['Faster Attacks Support'] }], hold: ['Volley Support'], drop: ['Leap Slam'], swap: [] } });
  assert.deepEqual(L.cleanLinks({ 4: { hold: ['Frostblink'] } }), { 4: { extra: [], links: [], hold: ['Frostblink'], drop: [], swap: [] } }, 'an act with only marks is kept');
  // a swap: the old gem leaves the links, one swap per gem, never for itself
  const swapped = L.cleanLinks({ 5: {
    links: [{ skill: 'Herald of Ash', supports: ['Inspiration Support'] }, { skill: 'Purity of Elements', supports: ['Inspiration Support'] }],
    swap: [{ from: 'Herald of Ash', to: 'Purity of Elements' }, { from: 'Herald of Ash', to: 'Anger' }, { from: 'Clarity', to: 'Clarity' }, { from: 'Leap Slam' }],
  } });
  assert.deepEqual(swapped[5].swap, [{ from: 'Herald of Ash', to: 'Purity of Elements' }]);
  assert.deepEqual(swapped[5].links, [{ skill: 'Purity of Elements', supports: ['Inspiration Support'] }]);
  assert.deepEqual(L.poolFor({ steps: [], links: swapped }, 5).sort(), ['Herald of Ash', 'Inspiration Support', 'Purity of Elements'], 'both gems of a swap stay in the act');
});

test('acts: the second half of the campaign starts after Kitava', () => {
  const act = (area, current, previous) => guide.actFor(area, current, previous, areaActs);
  assert.equal(act("Lioneye's Watch", null, null), 1);
  assert.equal(act('The Sarn Encampment', 2, 'The Western Forest'), 3, 'a name used once decides by itself');
  assert.equal(act("Lioneye's Watch", 5, 'The Cathedral Rooftop'), 6);
  assert.equal(act("Lioneye's Watch", 5, 'The Chamber of Innocence'), 1, 'not straight from Kitava');
  assert.equal(act("Lioneye's Watch", 7, 'The Causeway'), 6);
  assert.equal(act('Some Hideout', 4, null), 4, 'outside the campaign the act stays');
});

test('options: only known options with valid values are kept', () => {
  assert.deepEqual(
    cleanPrefs({ regexHotkey: 'Ctrl+Shift+G', mercHotkey: 'banana', globalRegexHotkey: '', passiveKey: 'P', passiveSearch: 'yes', globalRegex: 'a\nb', gameFolder: 'D:\\Games\\Path of Exile', extra: 1 }),
    { regexHotkey: 'Ctrl+Shift+G', globalRegexHotkey: '', passiveKey: 'P', gameFolder: 'D:\\Games\\Path of Exile', globalRegex: 'a b' },
  );
  assert.deepEqual(cleanPrefs({ passiveKey: 'Ctrl+P' }), {}, 'the passive key is a single key');
});

test('Path of Building: decodes the trees and the notes of a code', () => {
  const xml = '<PathOfBuilding><Tree activeSpec="2">' +
    '<Spec title="Act 1" treeVersion="3_25" classId="3" ascendClassId="0" nodes="10,20"></Spec>' +
    '<Spec title="Maps" treeVersion="3_25" classId="3" ascendClassId="2" nodes="10,20,30"></Spec>' +
    '</Tree><Notes>^7Level with &lt;Freezing Pulse&gt;\r\n^xFF0000Then swap</Notes></PathOfBuilding>';
  const code = zlib.deflateSync(Buffer.from(xml)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_');
  const pob = decodePob(code);
  assert.equal(pob.active, 1);
  assert.deepEqual(pob.specs.map((s) => [s.title, s.classId, s.ascendClassId, s.nodes.length]), [['Act 1', 3, 0, 2], ['Maps', 3, 2, 3]]);
  assert.equal(pob.notes, 'Level with <Freezing Pulse>\nThen swap');
  assert.throws(() => decodePob('https://pobb.in/abc'), /link/);
  assert.throws(() => decodePob('hello'), /does not look like/);
  assert.throws(() => decodePob(''), /Paste/);
});

// A small tree: the class start S, then a line of small nodes with notables hanging off it.
//   S - a - N1 - b - N2      a - c - N3
function smallTree() {
  const node = (t, n, l) => ({ t, n, l });
  return {
    starts: { 0: 'S' },
    classes: [{ name: 'Tester', ascendancies: [] }],
    nodes: {
      S: node('c', 'Start', ['1']),
      1: node('s', 'a', ['S', '2', '5']),
      2: node('n', 'N1', ['1', '3']),
      3: node('s', 'b', ['2', '4']),
      4: node('n', 'N2', ['3']),
      5: node('s', 'c', ['1', '6']),
      6: node('n', 'N3', ['5']),
    },
  };
}

test('passive plan: the suggested order grows outwards and counts the points', () => {
  const tree = smallTree();
  const allocated = new Set(['S', '1', '2', '3', '4', '5', '6']);
  const order = treeplan.suggestOrder(tree, allocated, 'S');
  assert.deepEqual(order, ['2', '4', '6']);
  const plan = treeplan.computePlan(tree, allocated, 'S', order);
  assert.deepEqual(plan.steps.map((s) => [s.name, s.cost]), [['N1', 2], ['N2', 2], ['N3', 2]]);
  assert.equal(plan.spent, 6);
  assert.equal(plan.remaining, 0);
  assert.equal(treeplan.computePlan(tree, new Set(['S', '1', '2']), 'S', ['4']).steps[0].cost, null, 'a point the tree does not take cannot be reached');
});

test('passive plan: each tree of a build continues the order of the one before', () => {
  const tree = smallTree();
  const spec = (title, nodes) => ({ title, classId: 0, nodes });
  const build = cleanBuild(tree, { specs: [spec('Act1', ['1', '2']), spec('Act2', ['1', '2', '5', '6']), spec('Act3', ['1', '2', '3', '4', '5', '6'])] });
  assert.deepEqual(build.tails, [null, null, null]);
  assert.deepEqual(ordersOf(tree, build), { orders: [['2'], ['2', '6'], ['2', '6', '4']], inherited: [0, 1, 2] });

  // The user puts N2 first among the new points of Act3 and drops N3 in Act2.
  const edited = cleanBuild(tree, { ...build, tails: [null, [], ['4']] });
  assert.deepEqual(ordersOf(tree, edited).orders, [['2'], ['2'], ['2', '4']], 'a point left out earlier is not added back by itself');

  // A tree that stops taking a point drops it from the inherited part.
  const respec = cleanBuild(tree, { specs: [spec('A', ['1', '2', '5', '6']), spec('B', ['1', '5', '6'])] });
  assert.deepEqual(ordersOf(tree, respec).orders, [['2', '6'], ['6']]);
});

test('passive plan: cleaning drops trees of unknown classes and ids that are not milestones', () => {
  const tree = smallTree();
  const cleaned = cleanBuild(tree, { specs: [{ classId: 9, nodes: ['1'] }], order: ['2', '2', '1', 'zzz'], notes: 5 });
  assert.deepEqual(cleaned, { specs: [], specIndex: 0, tails: [], order: ['2'], notes: '' });
});

test('mercenaries: the rules decide the verdict', () => {
  const rules = [
    { type: 'Fallen Reverend', tier: 'good' },
    { type: 'Combatant', tier: 'great', all: ['Frost Blades', 'Static Strike'] },
    { type: 'Combatant', tier: 'ok', all: ['Spectral Helix', 'Static Strike'] },
  ];
  assert.equal(mercs.evaluate('Fallen Reverend', [], rules).verdict, 'good');
  assert.equal(mercs.evaluate('Falien Reverend', [], rules).verdict, 'good', 'tolerates a misread letter');
  assert.equal(mercs.evaluate('Combatant', ['Static Strike', 'Frost Blades', 'Precision'], rules).verdict, 'great');
  assert.equal(mercs.evaluate('Combatant', ['Static Strike', 'Spectral Helix'], rules).verdict, 'ok');
  const partial = mercs.evaluate('Combatant', ['Static Strike', 'Cleave'], rules);
  assert.equal(partial.verdict, 'partial');
  assert.equal(partial.missing.length, 1);
  assert.equal(mercs.evaluate('Sharpshooter', [], rules).verdict, 'unlisted');
});

test('vision: matches a misread title and counts new inventory items', () => {
  assert.equal(vision.bestMatch('Freezinq Pulse', ['Frostbolt', 'Freezing Pulse']), 'Freezing Pulse');
  assert.equal(vision.bestMatch('Portal Scroll', ['Frostbolt', 'Freezing Pulse']), null);
  const before = new Array(60).fill(false), after = new Array(60).fill(false);
  before[0] = after[0] = true;
  after[5] = after[6] = true;
  assert.equal(vision.countGained(before, after), 2);
});

test('game folder: finds Client.txt from the game folder, the logs folder or the file', (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'poe-game-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const game = path.join(tmp, 'Path of Exile');
  const log = path.join(game, 'logs', 'Client.txt');
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.writeFileSync(log, '');
  for (const picked of [game, path.join(game, 'logs'), log]) assert.equal(gamefolder.clientLogIn(picked), log);
  assert.equal(gamefolder.folderOfLog(log), game);
  for (const picked of [tmp, path.join(tmp, 'missing'), '', undefined, __filename]) assert.equal(gamefolder.clientLogIn(picked), null);
  assert.ok(gamefolder.usualFolders({}).includes('C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile'));
});
