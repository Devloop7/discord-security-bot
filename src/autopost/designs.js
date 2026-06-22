// src/autopost/designs.js — saved embed "designs" for scheduled posts.
// Stored per guild in autopost-designs.json: { "<guildId>": { "<name>": embedJson } }.
'use strict';

const store = require('../core/store');

const FILE = 'autopost-designs.json';

function all() { return store.read(FILE, {}); }
function list(guildId) { return Object.keys(all()[guildId] || {}); }
function get(guildId, name) { return (all()[guildId] || {})[name] || null; }

function save(guildId, name, embed) {
  return store.mutate(FILE, (d) => {
    (d[guildId] = d[guildId] || {})[name] = embed;
    return d[guildId][name];
  }, {});
}

function remove(guildId, name) {
  return store.mutate(FILE, (d) => {
    if (d[guildId]) delete d[guildId][name];
  }, {});
}

module.exports = { FILE, list, get, save, remove };
