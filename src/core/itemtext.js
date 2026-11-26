'use strict';
// The text the game puts in the clipboard for the item under the mouse (Ctrl+C), e.g.:
//
//   Item Class: Skill Gems
//   Rarity: Gem
//   Shield Charge
//   --------
//   ...
//
// Returns the gem name, or null when the text is not a gem.
function gemName(text) {
  if (typeof text !== 'string') return null;
  const lines = text.split(/\r?\n/).map((l) => l.trim());
  const i = lines.findIndex((l) => /^rarity:\s*gem$/i.test(l));
  if (i < 0) return null;
  const name = lines.slice(i + 1).find((l) => l && !/^-+$/.test(l));
  return name ? name.replace(/^superior\s+/i, '') : null;
}

module.exports = { gemName };
