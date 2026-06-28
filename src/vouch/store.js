// src/vouch/store.js — persistence + queries for the shop review (vouch) system.
//
// Customers leave ONE review per guild: a 1–5 star rating + a comment + optional proof.
// reviews.json shape: { "<guildId>": [ { from, rating, comment, proof, ts } ] }
'use strict';

const store = require('../core/store');

const FILE = 'reviews.json';

function db() { return store.read(FILE, {}); }
function listFor(guildId) { return db()[guildId] || []; }

// ── pure helpers (unit-tested) ───────────────────────────────────────────────
function avgOf(list) {
  if (!list.length) return 0;
  const sum = list.reduce((a, r) => a + (Number(r.rating) || 0), 0);
  return Math.round((sum / list.length) * 10) / 10; // 1 decimal place
}
function distOf(list) {
  const d = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const r of list) if (d[r.rating] !== undefined) d[r.rating] += 1;
  return d;
}

// ── queries ──────────────────────────────────────────────────────────────────
function hasReviewed(guildId, fromId) { return listFor(guildId).some((r) => r.from === fromId); }
function count(guildId) { return listFor(guildId).length; }
function average(guildId) { return avgOf(listFor(guildId)); }
function distribution(guildId) { return distOf(listFor(guildId)); }
function recent(guildId, n = 5) {
  return [...listFor(guildId)].sort((a, b) => b.ts - a.ts).slice(0, n);
}
function stats(guildId) {
  const list = listFor(guildId);
  return { count: list.length, average: avgOf(list), distribution: distOf(list) };
}

// ── mutations (async; one-per-person enforced inside the serialized write) ───
async function addReview(guildId, fromId, { rating, comment, proof }, ts = Date.now()) {
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) return { error: 'Rating must be between 1 and 5 stars.' };
  let result;
  await store.mutate(FILE, (data) => {
    const list = (data[guildId] = data[guildId] || []);
    if (list.some((x) => x.from === fromId)) {
      result = { error: 'You have already left a review.' };
      return;
    }
    list.push({
      from: fromId,
      rating: r,
      comment: comment ? String(comment).slice(0, 1000) : null,
      proof: proof ? String(proof).slice(0, 500) : null,
      ts,
    });
    result = { ok: true, count: list.length, average: avgOf(list) };
  }, {});
  return result;
}

async function removeReview(guildId, fromId) {
  let removed = false;
  let n = 0;
  await store.mutate(FILE, (data) => {
    const list = data[guildId];
    if (!list) return;
    const before = list.length;
    data[guildId] = list.filter((r) => r.from !== fromId);
    removed = data[guildId].length !== before;
    n = data[guildId].length;
    if (data[guildId].length === 0) delete data[guildId];
  }, {});
  return { removed, count: n };
}

module.exports = {
  FILE, avgOf, distOf,
  hasReviewed, count, average, distribution, recent, stats,
  addReview, removeReview,
};
