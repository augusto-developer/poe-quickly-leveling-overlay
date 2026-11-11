'use strict';
// Text reading (Tesseract), one line at a time.
const fs = require('fs');
const { nativeImage } = require('electron');
const { createWorker } = require('tesseract.js');
const paths = require('../paths');
const mercs = require('../../core/mercs');

let worker = null;

async function start() {
  // The English model is kept in the user data folder. The library downloads it there on the
  // first run, unless a copy ships in assets/ocr: then that copy is put in place and nothing
  // is downloaded. (Inside Electron the library only accepts web addresses as a source, so
  // the local copy goes in through its cache.)
  const cached = paths.user('eng.traineddata');
  const shipped = paths.asset('ocr', 'eng.traineddata');
  if (!fs.existsSync(cached) && fs.existsSync(shipped)) fs.copyFileSync(shipped, cached);
  worker = await createWorker('eng', 1, { cachePath: paths.user() });
  await worker.setParameters({ tessedit_pageseg_mode: '7' }); // a single line of text
}
function stop() {
  if (worker) worker.terminate();
  worker = null;
}

// Reads a grayscale image ({ gray, width, height }).
async function readLine(image) {
  // grayscale -> BGRA -> PNG for tesseract
  const bgra = Buffer.alloc(image.width * image.height * 4);
  for (let i = 0, p = 0; i < image.gray.length; i++, p += 4) {
    bgra[p] = bgra[p + 1] = bgra[p + 2] = image.gray[i];
    bgra[p + 3] = 255;
  }
  const png = nativeImage.createFromBitmap(bgra, { width: image.width, height: image.height }).toPNG();
  const { data } = await worker.recognize(png);
  return data.text.trim();
}

// Reads the text inside a box of a screen capture. Returns '' when the box has no text.
async function readBox(frame, box, threshold, invert) {
  const img = mercs.cropForOcr(frame, box, threshold, invert);
  if (!img || img.ink < 0.01) return '';
  return (await readLine(img)).replace(/\s+/g, ' ').trim();
}

module.exports = { start, stop, readLine, readBox };
