'use strict';
// The program follows <game folder>\logs\Client.txt, the only file of the game it reads.
// The folder is found on its own when the game is in a usual place; otherwise the user is
// asked for it on the first run. It is kept in prefs.json and can be changed in the options.
const { dialog } = require('electron');
const { store, setPrefs } = require('../store');
const { setStatus } = require('../session');
const { config } = require('../config');
const { onArea } = require('./areas');
const { watchClientLog } = require('../../core/logwatcher');
const finder = require('../../core/gamefolder');

let stopWatching = null;

function clientLogPath() {
  return finder.clientLogIn(store.prefs.gameFolder)
    // a path written by hand in an old config.json, from before the folder could be chosen
    || finder.clientLogIn(config.clientTxtPath);
}
function watch() {
  stop();
  const file = clientLogPath();
  if (!file) return setStatus('Game folder not set. Choose it in the options (three dots, Options).');
  stopWatching = watchClientLog(file, onArea, (err) => setStatus('Client.txt: ' + err.message));
}

// Opens the folder picker until a folder with the log is chosen or the user gives up.
// Returns true when a folder was saved.
async function choose(parent) {
  const withParent = (options) => (parent ? [parent, options] : [options]);
  for (;;) {
    const picked = await dialog.showOpenDialog(...withParent({
      title: 'Choose the Path of Exile folder',
      message: 'Choose the folder where Path of Exile is installed',
      defaultPath: store.prefs.gameFolder || undefined,
      properties: ['openDirectory'],
    }));
    if (picked.canceled || !picked.filePaths[0]) return false;
    const log = finder.clientLogIn(picked.filePaths[0]);
    if (log) {
      setPrefs({ gameFolder: finder.folderOfLog(log) });
      watch();
      return true;
    }
    const again = await dialog.showMessageBox(...withParent({
      type: 'warning',
      title: 'Path of Exile folder',
      message: 'That folder has no logs\\Client.txt',
      detail: `${picked.filePaths[0]}\n\nChoose the folder that has the game itself (it contains a "logs" folder). The game creates Client.txt the first time it runs.`,
      buttons: ['Choose another folder', 'Cancel'],
      defaultId: 0,
      cancelId: 1,
    }));
    if (again.response !== 0) return false;
  }
}

// On start: use the saved folder, else look in the usual places, else ask.
async function setup() {
  const known = clientLogPath();
  if (known && !finder.clientLogIn(store.prefs.gameFolder)) {
    setPrefs({ gameFolder: finder.folderOfLog(known) }); // the path came from config.json: keep it as the chosen folder
  } else if (!known) {
    const found = finder.findGameFolder();
    if (found) {
      setPrefs({ gameFolder: found });
    } else {
      const ask = await dialog.showMessageBox({
        type: 'question',
        title: 'PoE Gem Overlay',
        message: 'Where is Path of Exile installed?',
        detail: 'The overlay follows the game log (logs\\Client.txt inside the game folder) to know which area you are in. It only reads that file.\n\nThe game was not found in the usual places, so please choose its folder.',
        buttons: ['Choose folder', 'Later'],
        defaultId: 0,
        cancelId: 1,
      });
      if (ask.response === 0) await choose();
    }
  }
  if (!stopWatching) watch();
}

function stop() {
  if (stopWatching) stopWatching();
  stopWatching = null;
}

module.exports = { setup, choose, stop, clientLogPath };
