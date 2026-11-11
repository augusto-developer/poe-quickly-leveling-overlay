'use strict';

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\"]/g, '.');

/**
 * Builds the text for the vendor "Highlight Items" field, in the form "a|b|c".
 * If it goes over the character limit, it shortens the longest names (keeps only the
 * start of each name). A shortened name may highlight an extra gem, which is harmless.
 */
function buildRegex(names, limit = 250) {
  const parts = [...new Set(names.map((n) => escape(n.trim().toLowerCase())))].filter(Boolean);
  if (parts.length === 0) return '';
  const join = (list) => `"${list.join('|')}"`;

  let maxLen = Math.max(...parts.map((p) => p.length));
  let out = join(parts);
  while (out.length > limit && maxLen > 4) {
    maxLen--;
    out = join(parts.map((p) => p.slice(0, maxLen).trimEnd()));
  }
  if (out.length <= limit) return out;

  // Even at 4 letters per name it did not fit: use as many gems as fit.
  const kept = [];
  for (const p of parts) {
    const short = p.slice(0, 4);
    if (join([...kept, short]).length > limit) break;
    kept.push(short);
  }
  return join(kept);
}

module.exports = { buildRegex };
