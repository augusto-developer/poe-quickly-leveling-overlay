'use strict';
// The update notice of the overlay, with a stand-in for GitHub releases.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { install } = require('./helpers/fake-electron');

test('updates: notice, download and restart', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'poe-update-'));
  const fake = install(tmp, { packaged: true });
  t.after(() => { fake.uninstall(); fs.rmSync(tmp, { recursive: true, force: true }); });
  t.mock.timers.enable({ apis: ['setTimeout', 'setInterval'] });

  const updates = require('../src/main/features/updates');
  const shown = () => updates.forOverlay();

  fake.release = null;
  updates.start();
  await Promise.resolve();
  assert.equal(shown(), null, 'nothing to show when the version is current');

  // a few hours later a new release exists
  fake.release = '1.1.0';
  t.mock.timers.tick(6 * 60 * 60 * 1000);
  await Promise.resolve();
  assert.deepEqual(shown(), { state: 'available', version: '1.1.0', percent: 0, portable: false });

  // closing the notice hides it; the same version found again stays hidden, a newer one shows
  updates.dismiss();
  assert.equal(shown(), null);
  t.mock.timers.tick(6 * 60 * 60 * 1000);
  await Promise.resolve();
  assert.equal(shown(), null);
  fake.release = '1.2.0';
  t.mock.timers.tick(6 * 60 * 60 * 1000);
  await Promise.resolve();
  assert.equal(shown().version, '1.2.0');

  // a failed download says so and offers to try again
  fake.downloadFails = true;
  updates.act();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(shown().state, 'error');

  // the click downloads, then the program restarts into the installer, silently
  fake.downloadFails = false;
  updates.act();
  assert.equal(shown().state, 'ready');
  assert.equal(fake.autoUpdater.installed, null, 'waits a moment so the overlay can say it is restarting');
  t.mock.timers.tick(1500);
  assert.deepEqual(fake.autoUpdater.installed, { silent: true, runAfter: true });
});

test('updates: the portable version opens the download page instead', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'poe-update-'));
  const fake = install(tmp, { packaged: true });
  process.env.PORTABLE_EXECUTABLE_DIR = tmp;
  t.after(() => { delete process.env.PORTABLE_EXECUTABLE_DIR; fake.uninstall(); fs.rmSync(tmp, { recursive: true, force: true }); });
  // a fresh copy of the module, not the one of the test above
  for (const key of Object.keys(require.cache)) if (key.includes(`${path.sep}src${path.sep}`)) delete require.cache[key];

  const updates = require('../src/main/features/updates');
  fake.release = '1.1.0';
  updates.start();
  await Promise.resolve();
  assert.equal(updates.forOverlay().portable, true);
  updates.act();
  assert.equal(updates.forOverlay().state, 'available', 'nothing is downloaded');
  assert.equal(fake.opened, updates.releasesPage());
  assert.match(fake.opened, /^https:\/\/github\.com\/[^/]+\/[^/]+\/releases\/latest$/);
});

test('updates: running from source never checks', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'poe-update-'));
  const fake = install(tmp, { packaged: false });
  t.after(() => { fake.uninstall(); fs.rmSync(tmp, { recursive: true, force: true }); });
  for (const key of Object.keys(require.cache)) if (key.includes(`${path.sep}src${path.sep}`)) delete require.cache[key];
  const updates = require('../src/main/features/updates');
  fake.release = '9.9.9';
  updates.start();
  assert.equal(fake.autoUpdater.checks, 0);
  assert.equal(updates.forOverlay(), null);
});
