'use strict';
const fs = require('fs');

const ENTERED = /\] : You have entered (.+)\.\s*$/;

function parseArea(line) {
  const m = ENTERED.exec(line);
  return m ? m[1].replace(/’/g, "'").trim() : null;
}

/**
 * Follows Client.txt and calls onArea(name) on every "You have entered X.".
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
    for (const line of buf.toString('utf8').split(/\r?\n/)) {
      const a = parseArea(line);
      if (a) last = a;
    }
    pos = size;
    if (last) onArea(last, true);
  } catch (err) {
    onError(err);
  }

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
        for (const line of lines) {
          const a = parseArea(line);
          if (a) onArea(a, false);
        }
      });
      stream.on('error', onError);
    });
  }, 300);

  return () => clearInterval(timer);
}

module.exports = { watchClientLog, parseArea };
