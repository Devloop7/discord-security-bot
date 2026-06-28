// src/vouch/store.js — persistence + queries for the shop review (vouch) system.
//
// Customers leave ONE review per guild: a 1–5 star rating + a comment + optional proof.
// Each review gets a monotonic Vouch ID (Nº) from a per-guild counter that never
// decreases — removing a review does not recycle its number.
//
// reviews.json shape: { "<guildId>": { seq: <number>, list: [ { id, from, rating, comment, proof, ts } ] } }
// Legacy shape (a bare array) is read transparently and migrated on the next write.
'use strict';

const store = require('../core/store');

const FILE = 'reviews.json';

function db() { return store.read(FILE, {}); }

// Normalize either the new { seq, list } shape or a legacy array into { seq, list }.
function norm(v) {
  if (Array.isArray(v)) return { seq: v.length, list: v };
  if (v && typeof v === 'object') return { seq: Number(v.seq) || 0, list: Array.isArray(v.list) ? v.list : [] };
  return { seq: 0, list: [] };
}
function listFor(guildId) { return norm(db()[guildId]).list; }

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
// Timestamp of a member's most recent review (0 if they've never reviewed).
function lastReviewTs(guildId, fromId) {
  return listFor(guildId).reduce((m, r) => (r.from === fromId && r.ts > m ? r.ts : m), 0);
}
// Milliseconds until this member may review again (0 = allowed now).
function cooldownRemaining(guildId, fromId, cooldownMs, now = Date.now()) {
  if (!cooldownMs || cooldownMs <= 0) return 0;
  const last = lastReviewTs(guildId, fromId);
  return last ? Math.max(0, cooldownMs - (now - last)) : 0;
}
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

// ── mutations (async; per-member cooldown enforced inside the serialized write) ─
// Returns { ok, id, count, average } or { error, retryAt? }.
async function addReview(guildId, fromId, { rating, comment, proof }, cooldownMs = 0, ts = Date.now()) {
  const r = Number(rating);
  if (!Number.isInteger(r) || r < 1 || r > 5) return { error: 'Rating must be between 1 and 5 stars.' };
  let result;
  await store.mutate(FILE, (data) => {
    const g = norm(data[guildId]);
    if (cooldownMs > 0) {
      const last = g.list.reduce((m, x) => (x.from === fromId && x.ts > m ? x.ts : m), 0);
      if (last && ts - last < cooldownMs) {
        data[guildId] = g; // persist the normalized shape even on rejection
        result = { error: 'cooldown', retryAt: last + cooldownMs };
        return;
      }
    }
    g.seq += 1;
    g.list.push({
      id: g.seq,
      from: fromId,
      rating: r,
      comment: comment ? String(comment).slice(0, 1000) : null,
      proof: proof ? String(proof).slice(0, 500) : null,
      ts,
    });
    data[guildId] = g;
    result = { ok: true, id: g.seq, count: g.list.length, average: avgOf(g.list) };
  }, {});
  return result;
}

async function removeReview(guildId, fromId) {
  let removed = false;
  let n = 0;
  await store.mutate(FILE, (data) => {
    const g = norm(data[guildId]);
    const before = g.list.length;
    g.list = g.list.filter((rv) => rv.from !== fromId);
    removed = g.list.length !== before;
    n = g.list.length;
    data[guildId] = g; // keep seq (Vouch IDs stay monotonic)
  }, {});
  return { removed, count: n };
}

module.exports = {
  FILE, avgOf, distOf,
  lastReviewTs, cooldownRemaining, count, average, distribution, recent, stats,
  addReview, removeReview,
};
