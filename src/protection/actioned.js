// src/protection/actioned.js — ensures a single message isn't punished by two filters.
const seen = new Map(); // messageId -> timestamp
function claim(messageId) {
  const now = Date.now();
  for (const [k, t] of seen) if (now - t > 60_000) seen.delete(k); // prune >60s old
  if (seen.has(messageId)) return false; // another filter already handled it
  seen.set(messageId, now);
  return true;
}
module.exports = { claim };
