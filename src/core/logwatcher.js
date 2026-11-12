'use strict';
const fs = require('fs');

const ENTERED = /\] : You have entered (.+)\.\s*$/;
// Written just before "You have entered", for example: Generating level 13 area "1_1_town" with seed 1
const GENERATING = /Generating level (\d+) area "([^"]+)"/;

function parseArea(line) {
  const m = ENTERED.exec(line);
  return m ? m[1].replace(/’/g, "'").trim() : null;
}

// The internal id and level of the area being loaded, or null.
function parseGenerated(line) {
  const m = GENERATING.exec(line);
  return m ? { level: Number(m[1]), id: m[2] } : null;
}

// Reads lines in order and calls onArea(name, details) for each area entered. `details`
// is the { level, id } line that came right before it, when there was one.
function lineReader(onArea) {
  let generated = null;
  return (line) => {
    const g = parseGenerated(line);
    if (g) { generated = g; return; }
    const area = parseArea(line);
    if (!area) return;
    onArea(area, generated);
    generated = null;
  };
}

/**
 * Follows Client.txt and calls onArea(name, initial, details) on every "You have entered X.".
 * `details` is { level, id } of the area (see parseGenerated), or null.
 * On start, reads the end of the file just to find out the current area.
 */
function watchClientLog(filePath, onArea, onError) {
  let pos = 0;
  let carry = '';

  try {
    const size = fs.statSync(filePath).size;
    const tail = Math.min(size, 256 * 1024);
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(tail);
    fs.readSync(fd, buf, 0, tail, size - tail);
    fs.closeSync(fd);
    let last = null;
    const read = lineReader((area, details) => { last = { area, details }; });
    for (const line of buf.toString('utf8').split(/\r?\n/)) read(line);
    pos = size;
    if (last) onArea(last.area, true, last.details);
  } catch (err) {
    onError(err);
  }

  const read = lineReader((area, details) => onArea(area, false, details));
  const timer = setInterval(() => {
    fs.stat(filePath, (err, st) => {
      if (err) return onError(err);
      if (st.size < pos) pos = 0; // file was recreated
      if (st.size === pos) return;
      const stream = fs.createReadStream(filePath, { start: pos, end: st.size - 1, encoding: 'utf8' });
      pos = st.size;
      stream.on('data', (chunk) => {
        const lines = (carry + chunk).split(/\r?\n/);
        carry = lines.pop();
        for (const line of lines) read(line);
      });
      stream.on('error', onError);
    });
  }, 300);

  return () => clearInterval(timer);
}

module.exports = { watchClientLog, parseArea, parseGenerated };
