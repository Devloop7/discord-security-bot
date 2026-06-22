// src/invites/tracker.js — invite-tracking persistence + the pure invite-diff.
//
// The live per-guild invite-use cache (code -> uses) is held in memory by
// src/invites/index.js (it needs the client). This module owns:
//   • findUsedInvite() — the pure "which code's uses went up?" diff (unit-tested)
//   • the persisted running totals in invites.json
//
// invites.json shape:
//   { "<guildId>": {
//       counts:   { "<inviterId>": { real, fake, left } },
//       joinedBy: { "<memberId>": { inviterId, fake } }   // so a leave decrements the right bucket
//   } }
'use strict';

const store = require('./../core/store');
const FILE = 'invites.json';

// ── pure diff ─────────────────────────────────────────────────────────────────
// oldMap/newMap are plain objects { code: uses }. Returns the first code whose use
// count increased (the invite the joining member used), or null if undeterminable
// (vanity URL, an already-deleted single-use invite, or a tie we can't resolve).
function findUsedInvite(oldMap, newMap) {
  for (const code of Object.keys(newMap || {})) {
    const prev = (oldMap && oldMap[code]) || 0;
    if (newMap[code] > prev) return code;
  }
  return null;
}

// ── store ────────────────────────────────────────────────────────────────────
function db() { return store.read(FILE, {}); }
function getGuild(guildId) { return db()[guildId] || { counts: {}, joinedBy: {} }; }

function ensure(data, guildId, inviterId) {
  data[guildId] = data[guildId] || { counts: {}, joinedBy: {} };
  if (inviterId) {
    data[guildId].counts[inviterId] = data[guildId].counts[inviterId] || { real: 0, fake: 0, left: 0 };
  }
  return data[guildId];
}

// Record a join attributed to inviterId. isFake => counts toward 'fake' not 'real'.
function recordJoin(guildId, inviterId, memberId, isFake) {
  return store.mutate(FILE, (data) => {
    const g = ensure(data, guildId, inviterId);
    if (isFake) g.counts[inviterId].fake += 1; else g.counts[inviterId].real += 1;
    g.joinedBy[memberId] = { inviterId, fake: !!isFake };
    return g.counts[inviterId];
  }, {});
}

// Record a leave: decrement the inviter's bucket and bump 'left'. No-op if unknown.
function recordLeave(guildId, memberId) {
  return store.mutate(FILE, (data) => {
    const g = data[guildId];
    if (!g || !g.joinedBy || !g.joinedBy[memberId]) return null;
    const { inviterId, fake } = g.joinedBy[memberId];
    const c = (g.counts[inviterId] = g.counts[inviterId] || { real: 0, fake: 0, left: 0 });
    if (fake) c.fake = Math.max(0, c.fake - 1); else c.real = Math.max(0, c.real - 1);
    c.left += 1;
    delete g.joinedBy[memberId];
    return c;
  }, {});
}

function getStats(guildId, inviterId) {
  return getGuild(guildId).counts[inviterId] || { real: 0, fake: 0, left: 0 };
}

// inviterId -> total credited invites (real + fake), highest first.
function leaderboard(guildId) {
  const counts = getGuild(guildId).counts;
  return Object.entries(counts)
    .map(([id, c]) => ({ inviterId: id, real: c.real, fake: c.fake, left: c.left, total: c.real + c.fake }))
    .sort((a, b) => b.total - a.total);
}

function getInviter(guildId, memberId) {
  const j = getGuild(guildId).joinedBy[memberId];
  return j ? j.inviterId : null;
}

module.exports = { FILE, findUsedInvite, recordJoin, recordLeave, getStats, leaderboard, getInviter, getGuild };
