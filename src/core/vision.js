'use strict';
// Pure vision functions over a BGRA frame (Buffer, 4 bytes per pixel).
// They do not depend on Electron, so they can be tested outside of it.

// Converts a pixel to HSV on the OpenCV scale (H 0-180, S 0-255, V 0-255).
function hsv(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
    if (h < 0) h += 360;
  }
  return [h / 2, max === 0 ? 0 : (d / max) * 255, max];
}

// Colour of the gem tooltip title: teal, close to RGB (13, 161, 154).
function isGemTitleColor(r, g, b) {
  if (r > 90 || g < 85) return false; // fast reject
  const [h, s, v] = hsv(r, g, b);
  return h >= 84 && h <= 94 && s >= 180 && v >= 90 && v <= 200;
}

/**
 * Looks for the title of a gem tooltip: the topmost line of text in the gem colour.
 * Returns null if there is none, or { box, image } where image is a grayscale crop
 * (black text on white, upscaled 3x) ready for OCR.
 */
function findGemTitle(frame) {
  const { buf, w, h } = frame;
  const scale = h / 1080;
  const mask = new Uint8Array(w * h);
  const rowCount = new Uint32Array(h);

  for (let y = 0, i = 0, p = 0; y < h; y++) {
    let c = 0;
    for (let x = 0; x < w; x++, i++, p += 4) {
      if (isGemTitleColor(buf[p + 2], buf[p + 1], buf[p])) {
        mask[i] = 1;
        c++;
      }
    }
    rowCount[y] = c;
  }

  const minRow = Math.max(4, Math.round(8 * scale));
  let y0 = -1;
  for (let y = 0; y < h; y++) {
    if (rowCount[y] >= minRow) { y0 = y; break; }
  }
  if (y0 < 0) return null;

  // Extends to the end of the text line (tolerating 2 empty pixel rows).
  let y1 = y0;
  for (let y = y0 + 1, gap = 0; y < h && gap <= 2; y++) {
    if (rowCount[y] >= minRow) { y1 = y; gap = 0; } else gap++;
  }
  const textH = y1 - y0 + 1;
  if (textH < 8 * scale || textH > 40 * scale) return null; // does not look like a title line

  let x0 = w, x1 = -1;
  for (let y = y0; y <= y1; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      if (mask[row + x]) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
      }
    }
  }

  const pad = 6;
  const cx0 = Math.max(0, x0 - pad), cy0 = Math.max(0, y0 - pad);
  const cx1 = Math.min(w - 1, x1 + pad), cy1 = Math.min(h - 1, y1 + pad);
  const cw = cx1 - cx0 + 1, ch = cy1 - cy0 + 1;

  // Upscales 3x with bilinear interpolation; black text on white.
  const k = 3;
  const gw = cw * k, gh = ch * k;
  const gray = new Uint8Array(gw * gh);
  const at = (x, y) => mask[(cy0 + Math.min(ch - 1, y)) * w + cx0 + Math.min(cw - 1, x)];
  for (let gy = 0; gy < gh; gy++) {
    const sy = gy / k, iy = Math.floor(sy), fy = sy - iy;
    for (let gx = 0; gx < gw; gx++) {
      const sx = gx / k, ix = Math.floor(sx), fx = sx - ix;
      const v =
        at(ix, iy) * (1 - fx) * (1 - fy) + at(ix + 1, iy) * fx * (1 - fy) +
        at(ix, iy + 1) * (1 - fx) * fy + at(ix + 1, iy + 1) * fx * fy;
      gray[gy * gw + gx] = 255 - Math.round(v * 255);
    }
  }

  return { box: { x0, y0, x1, y1 }, image: { gray, width: gw, height: gh } };
}

// Geometry of the 12x5 inventory grid, measured at 1920x1080 and scaled by screen height.
function inventoryGeometry(w, h, override) {
  if (override) return override;
  const cell = h * 0.04877;
  const right = w - h * 0.0152;
  return { left: right - 12 * cell, top: h * 0.5444, cell };
}

/**
 * Classifies the 60 inventory cells as filled (true) or empty (false).
 * In the test screenshots, empty cells have a mean brightness of ~7 and filled ones >= 82.
 */
function inventoryCells(frame, override) {
  const { buf, w, h } = frame;
  const { left, top, cell } = inventoryGeometry(w, h, override);
  const cells = new Array(60).fill(false);
  const m = cell * 0.15;
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 12; c++) {
      const xa = Math.round(left + c * cell + m), xb = Math.round(left + (c + 1) * cell - m);
      const ya = Math.round(top + r * cell + m), yb = Math.round(top + (r + 1) * cell - m);
      if (xa < 0 || ya < 0 || xb > w || yb > h) continue;
      let sum = 0, n = 0;
      for (let y = ya; y < yb; y++) {
        let p = (y * w + xa) * 4;
        for (let x = xa; x < xb; x++, p += 4, n++) {
          sum += Math.max(buf[p], buf[p + 1], buf[p + 2]);
        }
      }
      cells[r * 12 + c] = n > 0 && sum / n > 25;
    }
  }
  return cells;
}

// How many cells that were empty became filled.
function countGained(before, after) {
  let n = 0;
  for (let i = 0; i < 60; i++) if (!before[i] && after[i]) n++;
  return n;
}

// True if any cell that was empty became filled.
function gainedItem(before, after) {
  return countGained(before, after) > 0;
}

// Similarity between 0 and 1 (normalised Levenshtein distance), case-insensitive.
function similarity(a, b) {
  a = a.toLowerCase().replace(/[^a-z ]/g, '').trim();
  b = b.toLowerCase().replace(/[^a-z ]/g, '').trim();
  if (!a.length || !b.length) return 0;
  const prev = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return 1 - prev[b.length] / Math.max(a.length, b.length);
}

// Returns the name in the list closest to the text read, or null if none passes the threshold.
function bestMatch(text, names, threshold = 0.8) {
  let best = null, bestScore = threshold;
  for (const name of names) {
    const s = similarity(text, name);
    if (s >= bestScore) { best = name; bestScore = s; }
  }
  return best;
}

module.exports = { findGemTitle, inventoryCells, inventoryGeometry, countGained, gainedItem, similarity, bestMatch };
