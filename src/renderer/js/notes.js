'use strict';
// Shows the Notes tab of the imported PoB build and follows a new import.
const box = document.getElementById('text');
function show(text) {
  box.textContent = text || 'This build has no notes. Import a build with notes in the tree window.';
  box.classList.toggle('empty', !text);
}
let size = 14;
const resize = (d) => { size = Math.min(22, Math.max(11, size + d)); document.body.style.fontSize = size + 'px'; };
document.getElementById('smaller').addEventListener('click', () => resize(-1));
document.getElementById('bigger').addEventListener('click', () => resize(1));
window.notesApi.get().then(show);
window.notesApi.onChange(show);
