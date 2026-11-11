'use strict';
// Finds the game folder and the log inside it. Client.txt is the only file of the game
// this program reads: the game writes "You have entered X." to it on every area change.
const fs = require('fs');
const path = require('path');

const isFile = (p) => { try { return fs.statSync(p).isFile(); } catch { return false; } };

/**
 * Path of Client.txt for what the user picked, or null when it is not there.
 * Accepts the game folder, its "logs" folder, or the file itself.
 */
function clientLogIn(picked) {
  if (!picked) return null;
  const tries = [path.join(picked, 'logs', 'Client.txt'), path.join(picked, 'Client.txt'), picked];
  return tries.find((p) => path.basename(p).toLowerCase() === 'client.txt' && isFile(p)) || null;
}

// The game folder that owns a Client.txt path (two levels up: <game>\logs\Client.txt).
const folderOfLog = (logPath) => path.dirname(path.dirname(logPath));

// Places where the game is usually installed: the standalone client and Steam libraries.
function usualFolders(env = process.env) {
  const out = [];
  const programs = [env['ProgramFiles(x86)'], env.ProgramFiles, 'C:\\Program Files (x86)', 'C:\\Program Files'].filter(Boolean);
  for (const base of programs) {
    out.push(path.win32.join(base, 'Grinding Gear Games', 'Path of Exile'));
    out.push(path.win32.join(base, 'Steam', 'steamapps', 'common', 'Path of Exile'));
  }
  for (const drive of 'CDEFGH') {
    out.push(`${drive}:\\SteamLibrary\\steamapps\\common\\Path of Exile`);
    out.push(`${drive}:\\Steam\\steamapps\\common\\Path of Exile`);
    out.push(`${drive}:\\Grinding Gear Games\\Path of Exile`);
    out.push(`${drive}:\\Games\\Path of Exile`);
    out.push(`${drive}:\\Path of Exile`);
  }
  return [...new Set(out)];
}

// First usual folder that has the log, or null.
function findGameFolder(env) {
  return usualFolders(env).find((folder) => clientLogIn(folder)) || null;
}

module.exports = { clientLogIn, folderOfLog, usualFolders, findGameFolder };
