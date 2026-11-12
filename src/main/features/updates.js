'use strict';
// New versions. On start (and every few hours) the program asks GitHub whether a newer
// release exists. The overlay then offers it: one click downloads it and restarts into the
// new version. The portable .exe cannot replace itself, so there the click opens the
// download page instead.
const path = require('path');
const { app, shell } = require('electron');
const { changed, debug } = require('../session');

const CHECK_EVERY = 6 * 60 * 60 * 1000; // ms
const portable = () => Boolean(process.env.PORTABLE_EXECUTABLE_DIR);

// What the overlay shows. state: none | available | downloading | ready | error
const update = { state: 'none', version: '', percent: 0, portable: false, dismissed: false };
let updater = null;

// The releases page of the repository named in package.json ("repository").
function releasesPage() {
  try {
    const pkg = require(path.join(__dirname, '..', '..', '..', 'package.json'));
    const url = String(pkg.repository?.url || pkg.repository || '').replace(/^git\+/, '').replace(/\.git$/, '');
    if (/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/.test(url)) return url + '/releases/latest';
  } catch { /* no package.json */ }
  return null;
}

function set(change) {
  Object.assign(update, change);
  changed();
}

function check() {
  if (!updater || update.state === 'downloading' || update.state === 'ready') return;
  updater.checkForUpdates().catch((err) => debug('[update] check failed:', err.message));
}

function start() {
  // Only the built program updates itself; running from source never does.
  if (!app.isPackaged) return;
  try {
    ({ autoUpdater: updater } = require('electron-updater'));
  } catch {
    return debug('[update] electron-updater is not installed');
  }
  updater.autoDownload = false;          // the download starts only when you click
  updater.autoInstallOnAppQuit = false;

  updater.on('update-available', (info) => {
    // A version you closed the notice for stays hidden until the next start or a newer one.
    const isNew = info.version !== update.version;
    set({ state: 'available', version: info.version, percent: 0, portable: portable(), dismissed: isNew ? false : update.dismissed });
  });
  updater.on('update-not-available', () => { if (update.state === 'available') set({ state: 'none' }); });
  updater.on('download-progress', (p) => set({ state: 'downloading', percent: Math.round(p.percent || 0) }));
  updater.on('update-downloaded', () => {
    set({ state: 'ready' });
    // a moment for the overlay to say it is restarting, then the installer runs on its own
    setTimeout(() => updater.quitAndInstall(true, true), 1500);
  });
  updater.on('error', (err) => {
    debug('[update] error:', err && err.message);
    // A failed background check is not worth a message; a failed download is.
    if (update.state === 'downloading') set({ state: 'error' });
  });

  check();
  const timer = setInterval(check, CHECK_EVERY);
  if (timer.unref) timer.unref(); // never what keeps the program running
}

// The button of the notice.
function act() {
  if (update.state !== 'available' && update.state !== 'error') return;
  if (update.portable) {
    const page = releasesPage();
    if (page) shell.openExternal(page);
    return;
  }
  set({ state: 'downloading', percent: 0 });
  updater.downloadUpdate().catch(() => set({ state: 'error' }));
}
function dismiss() {
  if (update.state === 'available' || update.state === 'error') set({ dismissed: true });
}

// What the overlay needs, or null when there is nothing to show.
function forOverlay() {
  if (update.state === 'none' || update.dismissed) return null;
  return { state: update.state, version: update.version, percent: update.percent, portable: update.portable };
}

module.exports = { start, act, dismiss, forOverlay, releasesPage };
