'use strict';
// Decodes a Path of Building export code and extracts its passive trees.
const zlib = require('zlib');

function attributes(tag) {
  const out = {};
  for (const m of tag.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) out[m[1]] = m[2];
  return out;
}

// Turns XML entities back into characters (&lt; &amp; &#10; and so on).
function decodeEntities(s) {
  const named = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, code) => {
    if (code[0] !== '#') return named[code.toLowerCase()] ?? whole;
    const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) && n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : whole;
  });
}

// The text of the Notes tab of the build, without PoB's colour codes (^1 to ^9 and ^xRRGGBB).
function readNotes(xml) {
  const m = /<Notes>([\s\S]*?)<\/Notes>/.exec(xml);
  if (!m) return '';
  return decodeEntities(m[1])
    .replace(/\^x[0-9a-f]{6}/gi, '')
    .replace(/\^\d/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * A PoB code is the build XML, zlib-compressed and base64url-encoded.
 * Returns { specs: [{ title, treeVersion, classId, ascendClassId, nodes: [ids] }], active, notes }.
 * Throws an Error with a readable message when the text is not a PoB code.
 */
function decodePob(code) {
  const text = String(code || '').trim();
  if (!text) throw new Error('Paste a Path of Building code first.');
  if (/^https?:\/\//i.test(text)) throw new Error('That is a link. Paste the build code itself (in PoB: Import/Export, Generate).');

  let xml;
  try {
    const base64 = text.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    xml = zlib.inflateSync(Buffer.from(base64, 'base64')).toString('utf8');
  } catch {
    throw new Error('This does not look like a Path of Building code.');
  }

  const tree = /<Tree\b[^>]*>/.exec(xml);
  const active = tree ? Number(attributes(tree[0]).activeSpec || 1) - 1 : 0;
  const specs = [];
  for (const m of xml.matchAll(/<Spec\b[^>]*>/g)) {
    const a = attributes(m[0]);
    specs.push({
      title: a.title || '',
      treeVersion: a.treeVersion || '',
      classId: Number(a.classId || 0),
      ascendClassId: Number(a.ascendClassId || 0),
      nodes: (a.nodes || '').split(',').map((s) => s.trim()).filter(Boolean),
    });
  }
  if (specs.length === 0) throw new Error('The code was read, but it has no passive tree in it.');
  return { specs, active: Math.min(Math.max(active, 0), specs.length - 1), notes: readNotes(xml) };
}

module.exports = { decodePob, readNotes };
