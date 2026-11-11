'use strict';
// Reading and evaluating a mercenary window (the one that opens when you interact with the NPC).
// Pure functions: they take a BGRA frame and the rules, with no dependency on Electron.

const fold = (s) => s.toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();

function similarity(a, b) {
  a = fold(a); b = fold(b);
  if (!a.length || !b.length) return 0;
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
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

// Does the text read match this name? Tolerates OCR errors and noise around it.
function sameText(read, name) {
  const r = fold(read), n = fold(name);
  if (!r || !n) return false;
  if (r.includes(n)) return true;
  return similarity(r, n) >= 0.75;
}

/**
 * Positions of the window fields, measured on a 1920x1080 screenshot and scaled by height.
 * Horizontal positions are relative to the centre of the screen.
 */
function layout(w, h, override) {
  if (override) return override;
  const s = h / 1080, cx = w / 2;
  const box = (x0, y0, x1, y1) => [Math.round(cx + x0 * s), Math.round(y0 * s), Math.round(cx + x1 * s), Math.round(y1 * s)];
  const rows = [];
  for (let i = 0; i < 6; i++) rows.push(box(-225, 596 + i * 43.5, -8, 596 + i * 43.5 + 40));
  return { name: box(-125, 68, 105, 102), type: box(-165, 110, -20, 138), level: box(-10, 110, 85, 138), skills: rows };
}

/**
 * Finds horizontal bands of light text inside a vertical strip of the screen.
 * Used to locate the "Lvl NN" row when the window is not at the expected height.
 * Returns [{ y0, y1 }] from top to bottom, keeping only bands about one text line tall.
 */
function textBands(frame, x0, x1, y0, y1, threshold = 110) {
  const { buf, w, h } = frame;
  const s = h / 1080;
  x0 = Math.max(0, Math.round(x0)); x1 = Math.min(w, Math.round(x1));
  y0 = Math.max(0, Math.round(y0)); y1 = Math.min(h, Math.round(y1));
  const bands = [];
  let start = -1, last = -1;
  const close = () => {
    if (start < 0) return;
    const height = last - start + 1;
    if (height >= 7 * s && height <= 26 * s) bands.push({ y0: start, y1: last });
    start = -1;
  };
  for (let y = y0; y < y1; y++) {
    let bright = 0;
    let p = (y * w + x0) * 4;
    for (let x = x0; x < x1; x++, p += 4) {
      if (0.114 * buf[p] + 0.587 * buf[p + 1] + 0.299 * buf[p + 2] > threshold) bright++;
    }
    if (bright >= 3) { if (start < 0) start = y; last = y; }
    else if (start >= 0 && y - last > 1) close();
  }
  close();
  return bands;
}

// Moves every box of a layout up or down by dy pixels.
function shiftLayout(L, dy) {
  const move = ([x0, y0, x1, y1]) => [x0, y0 + dy, x1, y1 + dy];
  return { name: move(L.name), type: move(L.type), level: move(L.level), skills: L.skills.map(move) };
}

/**
 * Crops a region and prepares it for OCR: light text on a dark background becomes
 * black on white, upscaled 3x. `ink` is the fraction of text pixels in the crop.
 * With `invert`, the text is the dark part instead (dark text on a light background).
 */
function cropForOcr(frame, [x0, y0, x1, y1], threshold = 75, invert = false) {
  const { buf, w, h } = frame;
  x0 = Math.max(0, x0); y0 = Math.max(0, y0); x1 = Math.min(w, x1); y1 = Math.min(h, y1);
  const cw = x1 - x0, ch = y1 - y0;
  if (cw <= 0 || ch <= 0) return null;
  const src = new Float32Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    let p = ((y0 + y) * w + x0) * 4;
    for (let x = 0; x < cw; x++, p += 4) {
      src[y * cw + x] = 0.114 * buf[p] + 0.587 * buf[p + 1] + 0.299 * buf[p + 2];
    }
  }
  const k = 3, gw = cw * k, gh = ch * k;
  const gray = new Uint8Array(gw * gh);
  let ink = 0;
  const at = (x, y) => src[Math.min(ch - 1, y) * cw + Math.min(cw - 1, x)];
  for (let gy = 0; gy < gh; gy++) {
    const sy = gy / k, iy = Math.floor(sy), fy = sy - iy;
    for (let gx = 0; gx < gw; gx++) {
      const sx = gx / k, ix = Math.floor(sx), fx = sx - ix;
      const v = at(ix, iy) * (1 - fx) * (1 - fy) + at(ix + 1, iy) * fx * (1 - fy) +
                at(ix, iy + 1) * (1 - fx) * fy + at(ix + 1, iy + 1) * fx * fy;
      if (invert ? v < threshold : v > threshold) { gray[gy * gw + gx] = 0; ink++; } else gray[gy * gw + gx] = 255;
    }
  }
  return { gray, width: gw, height: gh, ink: ink / (gw * gh) };
}

/**
 * Pairs each required name with a DIFFERENT skill row. Without this, "Flameblast"
 * would match the "Vaal Flameblast" row and the rule would pass with a single skill.
 * Returns the names left without a match.
 */
function unmatched(names, skills) {
  const free = skills.slice();
  const missing = [];
  // longer names first: the most specific one picks its row before the others
  for (const name of names.slice().sort((x, y) => y.length - x.length)) {
    let best = -1, bestScore = 0;
    free.forEach((s, i) => {
      if (!sameText(s, name)) return;
      const score = similarity(s, name);
      if (best < 0 || score > bestScore) { best = i; bestScore = score; }
    });
    if (best < 0) missing.push(name); else free.splice(best, 1);
  }
  return missing;
}

const TIERS = ['great', 'good', 'check', 'ok']; // best to worst

/**
 * Evaluates a mercenary against the rules.
 * Rule: { type, tier?, all?: [required skills], any?: [at least one], none?: [must not have], note? }
 * tier: "great", "good" (default), "check" (good, but check something) or "ok".
 * Returns { verdict: tier | 'partial' | 'unlisted', rule?, missing?, forbidden?, needAny? }.
 * When more than one rule passes, the best tier wins.
 */
function evaluate(type, skills, rules) {
  const sameType = rules.filter((r) => sameText(type, r.type));
  if (sameType.length === 0) return { verdict: 'unlisted' };
  const has = (name) => skills.some((s) => sameText(s, name));
  let passed = null, closest = null;
  for (const rule of sameType) {
    const tier = TIERS.includes(rule.tier) ? rule.tier : 'good';
    const missing = unmatched(rule.all || [], skills);
    const anyOk = !rule.any || rule.any.length === 0 || rule.any.some(has);
    const forbidden = (rule.none || []).filter(has);
    if (missing.length === 0 && anyOk && forbidden.length === 0) {
      if (!passed || TIERS.indexOf(tier) < TIERS.indexOf(passed.verdict)) passed = { verdict: tier, rule };
      continue;
    }
    const result = { verdict: 'partial', rule, missing, forbidden, needAny: anyOk ? [] : rule.any };
    const cost = (r) => r.missing.length + r.forbidden.length + (r.needAny.length ? 1 : 0);
    if (!closest || cost(result) < cost(closest)) closest = result;
  }
  return passed || closest;
}

// Does the rule depend on skills? If not, the type alone decides, without reading the skills.
const needsSkills = (rule) => Boolean((rule.all && rule.all.length) || (rule.any && rule.any.length) || (rule.none && rule.none.length));

module.exports = { layout, cropForOcr, textBands, shiftLayout, evaluate, needsSkills, sameText, similarity };
