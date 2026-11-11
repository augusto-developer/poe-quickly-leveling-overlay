'use strict';
// Fuzzy search used in the settings window (gems and areas).
// Higher score = better result. 0 = no match.
(function (root) {
  const fold = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '');

  // Edit distance with a small cap, to tolerate typos.
  function editDistance(a, b, max) {
    if (Math.abs(a.length - b.length) > max) return max + 1;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
      const cur = [i];
      let rowMin = i;
      for (let j = 1; j <= b.length; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (cur[j] < rowMin) rowMin = cur[j];
      }
      if (rowMin > max) return max + 1;
      prev = cur;
    }
    return prev[b.length];
  }

  function score(query, name) {
    const q = fold(query).trim();
    const n = fold(name);
    if (!q) return 1;
    if (n === q) return 1000;
    if (n.startsWith(q)) return 900 - n.length;
    const words = n.split(' ');
    if (words.some((w) => w.startsWith(q))) return 800 - n.length;
    // initials: "cwdt" -> Cast when Damage Taken
    const initials = words.map((w) => w[0]).join('');
    if (q.length >= 2 && initials.startsWith(q)) return 760 - n.length;
    // every typed word starts some word of the name: "fre pul" -> Freezing Pulse
    const qWords = q.split(' ').filter(Boolean);
    if (qWords.length > 1 && qWords.every((qw) => words.some((w) => w.startsWith(qw)))) return 740 - n.length;
    if (n.includes(q)) return 700 - n.length;
    // letters in order, with gaps: "frzpls" -> Freezing Pulse
    let i = 0, gaps = 0, last = -1;
    for (let j = 0; j < n.length && i < q.length; j++) {
      if (n[j] === q[i]) { if (last >= 0) gaps += j - last - 1; last = j; i++; }
    }
    if (i === q.length && q.length >= 3 && gaps <= q.length * 2) return 500 - gaps * 4 - n.length;
    // typo in one of the words: "freazing" -> Freezing
    if (q.length >= 4) {
      const max = q.length >= 7 ? 2 : 1;
      for (const w of words) {
        const d = editDistance(q, w.slice(0, Math.max(q.length, Math.min(w.length, q.length + 1))), max);
        if (d <= max) return 400 - d * 50 - n.length;
      }
    }
    return 0;
  }

  // Returns the items sorted best to worst, dropping the ones that do not match.
  function rank(query, items, getName) {
    const out = [];
    for (const item of items) {
      const s = score(query, getName(item));
      if (s > 0) out.push([s, item]);
    }
    out.sort((a, b) => b[0] - a[0] || getName(a[1]).localeCompare(getName(b[1])));
    return out.map((x) => x[1]);
  }

  const api = { score, rank };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.GemSearch = api;
})(typeof window !== 'undefined' ? window : globalThis);
