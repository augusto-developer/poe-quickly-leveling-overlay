'use strict';
// Area and gem names are compared without caring about case or the kind of apostrophe.
const norm = (s) => s.replace(/’/g, "'").trim().toLowerCase();

module.exports = { norm };
