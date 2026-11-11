'use strict';
// Hotkey: reads the mercenary window that is open in the game and says whether the
// mercenary is worth recruiting, by the rules in mercs.json. The answer is a mark in the
// middle of the screen; only a great one also makes a sound.
const { config } = require('../config');
const { debug } = require('../session');
const gamedata = require('../gamedata');
const { capture } = require('../platform/capture');
const ocr = require('../platform/ocr');
const sounds = require('../platform/sounds');
const toast = require('../windows/toast');
const mercs = require('../../core/mercs');

const isLevel = (text) => /l\s*v\s*[l1i|!]/i.test(text); // "Lvl" is enough: the digits are sometimes misread

async function analyzeMerc() {
  const startedAt = Date.now();
  const rules = gamedata.mercRules();
  const frame = await capture();
  let L = mercs.layout(frame.w, frame.h, config.mercLayout);

  // The "Lvl 69" field confirms the window is open and where we expect it.
  let level = await ocr.readBox(frame, L.level);
  if (!isLevel(level)) {
    // Not at the expected height: look for the "Lvl NN" row above and below, in the same
    // column, and shift the whole layout to where it was found.
    const [lx0, ly0, lx1, ly1] = L.level;
    const bands = mercs.textBands(frame, lx0, lx1, 0, frame.h * 0.5).slice(0, 10);
    for (const band of bands) {
      const text = await ocr.readBox(frame, [lx0, band.y0 - 7, lx1, band.y1 + 7]);
      if (!isLevel(text)) continue;
      const dy = Math.round((band.y0 + band.y1) / 2 - (ly0 + ly1) / 2);
      debug(`[merc] window found ${dy} px away from the expected height`);
      L = mercs.shiftLayout(L, dy);
      level = text;
      break;
    }
  }
  if (!isLevel(level)) {
    debug('[merc] window not found, level field read:', JSON.stringify(level));
    return toast.show('none', 'Open the NPC window and press the hotkey again.');
  }
  const type = await ocr.readBox(frame, L.type);
  const sameType = rules.filter((r) => mercs.sameText(type, r.type));

  // Only reads the skills when some rule for this type depends on them.
  const skills = [];
  if (sameType.some(mercs.needsSkills)) {
    for (const box of L.skills) {
      const text = await ocr.readBox(frame, box, 115); // higher contrast cut-off reads the skill names cleanly
      if (text.replace(/[^a-z]/gi, '').length >= 3) skills.push(text);
    }
  }
  const result = mercs.evaluate(type, skills, rules);

  // What is wrong, when the type is listed but the skills do not match.
  const why = [];
  if (result.verdict === 'partial') {
    if (result.missing.length) why.push('Missing: ' + result.missing.join(', '));
    if (result.needAny.length) why.push('Needs one of: ' + result.needAny.join(', '));
    if (result.forbidden.length) why.push('Has unwanted: ' + result.forbidden.join(', '));
  }
  if (result.verdict === 'great') sounds.play('great', result.rule.sound);
  toast.show(result.verdict, why.length ? `${type}. ${why.join(' | ')}` : type);
  debug(`[merc] ${type} -> ${result.verdict} (${Date.now() - startedAt} ms)`, skills);
}

module.exports = { analyzeMerc };
