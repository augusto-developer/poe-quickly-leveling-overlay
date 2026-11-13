'use strict';
// Loads the whole main process with stand-ins for Electron and walks through a play
// session: entering areas, a gem to buy, the builds library, the options.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { install } = require('./helpers/fake-electron');

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const logLine = (area, id) => (id ? `2026/01/01 12:00:00 1234 abc [DEBUG Client 1] Generating level 1 area "${id}" with seed 1\r\n` : '') +
  `2026/01/01 12:00:00 1234 abc [INFO Client 1] : You have entered ${area}.\r\n`;

test('main process: a session from start to quit', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'poe-gem-overlay-'));
  const userData = path.join(tmp, 'poe-gem-overlay');
  const game = path.join(tmp, 'Path of Exile');
  const log = path.join(game, 'logs', 'Client.txt');
  fs.mkdirSync(path.dirname(log), { recursive: true });
  fs.mkdirSync(userData, { recursive: true });
  fs.writeFileSync(log, logLine('The Lower Prison'));
  fs.writeFileSync(path.join(userData, 'prefs.json'), JSON.stringify({ gameFolder: game }));

  const fake = install(userData);
  t.after(() => {
    fake.appEvents.get('will-quit')(); // stops following the log, so the test can end
    fake.uninstall();
    fs.rmSync(tmp, { recursive: true, force: true });
  });

  require('../src/main/index.js');
  await fake.ready;
  await wait(50);

  await t.test('starts in the area the log ends with', () => {
    const state = fake.lastState();
    assert.equal(state.area, 'The Lower Prison');
    assert.equal(state.act, 1);
    assert.equal(state.inTown, false);
    assert.equal(fake.windows.length, 2, 'overlay and toast windows');
    assert.deepEqual([...fake.shortcuts.keys()].sort(), ['F2', 'F3', 'F4']);
  });

  await t.test('a gem of the route is pending once its area was visited and you reach town', async () => {
    fake.send('settings:save', { steps: [{ area: 'The Lower Prison', act: 1, gems: ['Freezing Pulse'] }, { area: 'The Coast', act: 1, gems: ['Frostbolt'] }] });
    fs.appendFileSync(log, logLine("Lioneye's Watch"));
    await wait(800);
    const state = fake.lastState();
    assert.equal(state.area, "Lioneye's Watch");
    assert.equal(state.inTown, true);
    assert.equal(state.canSwitchAct, true, "Lioneye's Watch exists in acts 1 and 6");
    assert.deepEqual(state.pending.map((g) => [g.name, g.color]), [['Freezing Pulse', 'int']]);
    const sounds = fake.sent.filter((m) => m[0] === 'play-sound').map((m) => m[1]);
    assert.deepEqual(sounds, [{ url: null, chime: 'gems', volume: 0.8 }], 'one chime for arriving with something to buy');
  });

  await t.test('marking it by hand clears it, and reset brings it back only after the area is visited again', () => {
    fake.send('mark', fake.lastState().pending[0].key);
    assert.deepEqual(fake.lastState().pending, []);
    fake.send('reset');
    assert.deepEqual(fake.lastState().pending, [], 'The Lower Prison is no longer marked as visited');
    assert.equal(fake.lastState().status, 'Progress reset');
  });

  await t.test('the builds library saves, tells what is in use, loads and deletes', async () => {
    let lib = await fake.invoke('library:get');
    assert.equal(lib.current.gems, 2);
    assert.equal(lib.current.saved, false);

    lib = await fake.invoke('library:save', '  Frost  Witch ');
    assert.deepEqual(lib.items.map((i) => [i.id, i.name, i.same, i.active]), [['frost-witch', 'Frost Witch', true, true]]);
    assert.deepEqual(lib.items[0].colors, { str: 0, dex: 0, int: 2 });
    assert.match((await fake.invoke('library:save', 'frost witch')).error, /already a build/);

    fake.send('settings:save', { steps: [] });
    lib = await fake.invoke('library:get');
    assert.equal(lib.items[0].same, false);
    assert.equal(lib.current.empty, true);

    lib = await fake.invoke('library:load', 'frost-witch');
    assert.equal(lib.current.gems, 2);
    assert.equal(lib.items[0].same, true);
    assert.equal((await fake.invoke('settings:guide')).steps.length, 2);

    assert.match((await fake.invoke('library:load', '../../state')).error, /no longer/);
    lib = await fake.invoke('library:rename', 'frost-witch', 'Renamed');
    assert.equal(lib.items[0].name, 'Renamed');
    lib = await fake.invoke('library:delete', 'frost-witch');
    assert.deepEqual(lib.items, []);
  });

  await t.test('the passive order of the tree window drives "next point" in the overlay', async () => {
    const { tree } = await fake.invoke('tree:data');
    const milestones = Object.keys(tree.nodes).filter((id) => tree.nodes[id].t === 'n').slice(0, 2);
    const saved = await fake.invoke('tree:save', { specs: [], order: milestones });
    assert.deepEqual(saved.order, milestones);
    assert.equal(fake.lastState().passive.id, milestones[0]);
    fake.send('passive-done', milestones[0]);
    assert.equal(fake.lastState().passive.id, milestones[1]);
    fake.send('passive-undo');
    assert.equal(fake.lastState().passive.id, milestones[0]);
  });

  await t.test('options: a hotkey can be changed, clashes are reported, and reset restores the defaults', async () => {
    let options = await fake.invoke('options:get');
    assert.equal(options.gameFolder, game);
    assert.equal(options.gameFolderOk, true);

    options = await fake.invoke('options:set', { regexHotkey: 'Ctrl+G', globalRegex: 'abc\ndef' });
    assert.equal(options.regexHotkey, 'Ctrl+G');
    assert.equal(options.globalRegex, 'abc def');
    assert.ok(fake.shortcuts.has('Ctrl+G'));

    options = await fake.invoke('options:set', { mercHotkey: 'Ctrl+G' });
    assert.deepEqual(Object.keys(options.errors).sort(), ['mercHotkey', 'regexHotkey']);

    options = await fake.invoke('options:set', { regexHotkey: 'not a key' });
    assert.equal(options.regexHotkey, 'Ctrl+G', 'an invalid key is ignored');

    options = await fake.invoke('options:reset');
    assert.deepEqual([options.regexHotkey, options.mercHotkey, options.globalRegexHotkey, options.passiveKey], ['F2', 'F3', 'F4', 'P']);
    assert.equal(options.globalRegex, 'abc def', 'the saved regex is kept');
    assert.deepEqual(options.errors, {});
  });

  await t.test('the volume slider of the overlay is saved and sampled with a chime', async () => {
    assert.equal(fake.lastState().volume, 0.8);
    const before = fake.sent.filter((m) => m[0] === 'play-sound').length;
    fake.send('set-volume', 0.35);
    assert.equal(fake.lastState().volume, 0.35);
    const played = fake.sent.filter((m) => m[0] === 'play-sound');
    assert.equal(played.length, before + 1);
    assert.equal(played.at(-1)[1].volume, 0.35);
    fake.send('set-volume', 7);
    assert.equal(fake.lastState().volume, 1, 'never above 100%');
    await fake.invoke('options:reset');
    assert.equal(fake.lastState().volume, 1, 'resetting the hotkeys leaves the volume alone');
  });

  await t.test('a new character starts in Act 1 even after a character in the second half', async () => {
    fake.send('settings:save', { steps: [{ area: 'The Twilight Strand', act: 6, gems: ['Vitality'] }] });
    // the last character was in Act 7, and Act 6's Twilight Strand was visited
    fs.appendFileSync(log, logLine('The Twilight Strand', '2_6_1') + logLine('The Bridge Encampment', '2_7_town'));
    await wait(800);
    assert.equal(fake.lastState().act, 7);
    fake.send('reset');
    // a new character is born on the Act 1 beach and walks to town
    fs.appendFileSync(log, logLine('The Twilight Strand', '1_1_1') + logLine("Lioneye's Watch", '1_1_town'));
    await wait(800);
    const state = fake.lastState();
    assert.equal(state.act, 1);
    assert.deepEqual(state.pending, [], 'the gems of the Act 6 beach are not offered');
  });

  await t.test('links: planned per act, kept when the route is saved, the drawer follows the act', async () => {
    fake.send('settings:save', { steps: [
      { area: 'The Coast', act: 1, gems: ['Spectral Throw', 'Volley Support'] },
      { area: 'The Southern Forest', act: 2, gems: ['Herald of Ash'] },
    ] });
    let data = await fake.invoke('links:data');
    assert.deepEqual(data.links, {});

    const saved = await fake.invoke('links:save', 1, { extra: ['Faster Attacks Support'], links: [{ skill: 'Spectral Throw', supports: ['Volley Support', 'Faster Attacks Support'] }] });
    assert.deepEqual(Object.keys(saved), ['1']);
    let links = fake.lastState().links;
    assert.equal(links.any, true);
    assert.deepEqual(links.acts, [1]);

    // the route window saves without links: they are kept
    fake.send('settings:save', { steps: [{ area: 'The Coast', act: 1, gems: ['Spectral Throw'] }] });
    data = await fake.invoke('links:data');
    assert.deepEqual(data.links[1].links[0].supports, ['Volley Support', 'Faster Attacks Support']);

    // an empty act is removed
    await fake.invoke('links:save', 2, { extra: [], links: [] });
    assert.deepEqual(Object.keys((await fake.invoke('links:data')).links), ['1']);

    fake.send('reset');
    fs.appendFileSync(log, logLine('The Coast', '1_1_2') + logLine("Lioneye's Watch", '1_1_town'));
    await wait(800);
    fake.send('links-act', 1);
    fake.send('links-drawer', true);
    links = fake.lastState().links;
    assert.equal(links.open, true);
    assert.equal(links.act, 1);
    assert.deepEqual(links.links, [{ skill: { name: 'Spectral Throw', color: 'dex' }, supports: [{ name: 'Volley Support', color: 'dex' }, { name: 'Faster Attacks Support', color: 'dex' }] }]);
    assert.equal('glow' in links, false, 'no more glowing');

    fake.send('links-act', 2);
    assert.deepEqual(fake.lastState().links.links, [], 'Act 2 has none');

    fs.appendFileSync(log, logLine('The Coast', '1_1_2'));
    await wait(800);
    assert.equal(fake.lastState().links.open, false, 'entering another area closes it');

    fs.appendFileSync(log, logLine('The Southern Forest', '1_2_1'));
    await wait(800);
    assert.equal(fake.lastState().links.act, 2, 'a new act moves the drawer to it');

    // links come and go with the builds library
    const lib = await fake.invoke('library:save', 'With links');
    assert.equal(lib.items.find((i) => i.name === 'With links').same, true);
    await fake.invoke('links:save', 1, { extra: [], links: [] });
    assert.equal((await fake.invoke('library:get')).items.find((i) => i.name === 'With links').same, false, 'changing a link changes the setup');
    await fake.invoke('library:load', 'with-links');
    assert.equal((await fake.invoke('links:data')).links[1].links.length, 1);
  });

  await t.test('exporting the route takes the links along, and importing it brings them back', async () => {
    const { dialog } = require('electron');
    const file = path.join(tmp, 'gem-route.json');
    dialog.showSaveDialog = async () => ({ canceled: false, filePath: file });
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] });
    const route = { steps: [{ area: 'The Coast', act: 1, gems: ['Spectral Throw', 'Volley Support'] }] };
    fake.send('settings:save', route);
    await fake.invoke('links:save', 1, { extra: [], links: [{ skill: 'Spectral Throw', supports: ['Volley Support'] }], hold: [], drop: [], swap: [] });
    assert.equal(await fake.invoke('settings:export', route), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).links[1].links, [{ skill: 'Spectral Throw', supports: ['Volley Support'] }]);

    // another setup in the meantime, then the file comes back
    fake.send('settings:save', { steps: [] });
    await fake.invoke('links:save', 1, { extra: [], links: [] });
    const result = await fake.invoke('settings:import');
    assert.equal(result.guide.steps.length, 1);
    fake.send('settings:save', result.guide); // what the route window does with it
    const data = await fake.invoke('links:data');
    assert.deepEqual(data.links[1].links, [{ skill: 'Spectral Throw', supports: ['Volley Support'] }]);
    assert.equal(data.steps.length, 1);
  });

  await t.test('minimize: the overlay becomes an icon, closes the drawer and is remembered', async () => {
    fake.send('links-drawer', true);
    fake.send('overlay-minimize', true);
    let state = fake.lastState();
    assert.equal(state.minimized, true);
    assert.equal(state.links.open, false, 'the drawer closes with it');
    assert.equal(JSON.parse(fs.readFileSync(path.join(userData, 'overlay.json'), 'utf8')).minimized, true);
    fake.send('overlay-minimize', false);
    state = fake.lastState();
    assert.equal(state.minimized, false);
  });

  await t.test('only wiki links from the gem list are opened', () => {
    fake.send('open-wiki', 'https://example.com');
    assert.equal(fake.opened, undefined);
    fake.send('open-wiki', 'Freezing Pulse');
    assert.match(fake.opened, /^https:\/\/www\.poewiki\.net\/wiki\//);
  });

  await t.test('everything was saved in the user data folder', () => {
    const files = fs.readdirSync(userData).sort();
    for (const name of ['guide.json', 'prefs.json', 'state.json', 'treeplan.json']) assert.ok(files.includes(name), name);
  });
});
