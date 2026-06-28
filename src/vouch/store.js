// src/vouch/store.js — persistence + queries for the vouch (reputation) system.
//
// Each member accrues vouches FROM other members. One vouch per (giver → target)
// is allowed ever (enforced inside the write, race-safe), keeping counts honest.
//
// vouches.json shape: { "<guildId>": { "<targetId>": [ { from, comment, ts } ] } }
// (The vouch-feed channel id lives in guildConfig.vouch.channelId, not here.)
'use strict';

const store = require('../core/store');

const FILE = 'vouches.json';

function db() { return store.read(FILE, {}); }
function listFor(guildId, targetId) {
  const g = db()[guildId];
  return (g && g[targetId]) || [];
}

// ── queries (sync reads) ─────────────────────────────────────────────────────
function hasVouched(guildId, fromId, targetId) {
  return listFor(guildId, targetId).some((v) => v.from === fromId);
}
function countFor(guildId, targetId) { return listFor(guildId, targetId).length; }
function recentFor(guildId, targetId, n = 5) {
  return [...listFor(guildId, targetId)].sort((a, b) => b.ts - a.ts).slice(0, n);
}
function leaderboard(guildId, n = 10) {
  const g = db()[guildId] || {};
  return Object.entries(g)
    .map(([targetId, list]) => ({ targetId, count: list.length }))
    .sort((a, b) => b.count - a.count)
    .slice(0, n);
}

// ── mutations (async; check happens inside the serialized write) ─────────────
// Returns { ok:true, count } or { error } if the giver already vouched the target.
async function addVouch(guildId, fromId, targetId, comment, ts = Date.now()) {
  let result;
  await store.mutate(FILE, (data) => {
    const g = (data[guildId] = data[guildId] || {});
    const list = (g[targetId] = g[targetId] || []);
    if (list.some((v) => v.from === fromId)) {
      result = { error: 'You have already vouched for this member.' };
      return;
    }
    list.push({ from: fromId, comment: comment ? String(comment).slice(0, 500) : null, ts });
    result = { ok: true, count: list.length };
  }, {});
  return result;
}

// Remove the vouch a specific giver left for a target (staff anti-abuse). Returns { removed, count }.
async function removeVouch(guildId, fromId, targetId) {
  let removed = false;
  let count = 0;
  await store.mutate(FILE, (data) => {
    const g = data[guildId];
    if (!g || !g[targetId]) return;
    const before = g[targetId].length;
    g[targetId] = g[targetId].filter((v) => v.from !== fromId);
    removed = g[targetId].length !== before;
    count = g[targetId].length;
    if (g[targetId].length === 0) delete g[targetId];
  }, {});
  return { removed, count };
}

module.exports = { FILE, hasVouched, countFor, recentFor, addVouch, removeVouch, leaderboard };
