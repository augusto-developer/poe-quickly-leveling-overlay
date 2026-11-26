'use strict';
// Pure vision functions over a BGRA frame (Buffer, 4 bytes per pixel): the inventory grid.
// They do not depend on Electron, so they can be tested outside of it.

// Geometry of the 12x5 inventory grid, measured at 1920x1080 and scaled by screen height.
function inventoryGeometry(w, h, override) {
  if (override) return override;
  const cell = h * 0.04877;
  const right = w - h * 0.0152;
  return { left: right - 12 * cell, top: h * 0.5444, cell };
}

// The part of the screen that holds the inventory grid, with the grid geometry inside it:
// { x, y, w, h, geometry }. Reading only this part is much cheaper than the whole screen.
function inventoryCrop(w, h, override) {
  const g = inventoryGeometry(w, h, override);
  const x = Math.max(0, Math.floor(g.left) - 1);
  const y = Math.max(0, Math.floor(g.top) - 1);
  const x1 = Math.min(w, Math.ceil(g.left + 12 * g.cell) + 1);
  const y1 = Math.min(h, Math.ceil(g.top + 5 * g.cell) + 1);
  return { x, y, w: x1 - x, h: y1 - y, geometry: { left: g.left - x, top: g.top - y, cell: g.cell } };
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

module.exports = { inventoryCells, inventoryGeometry, inventoryCrop, countGained };
