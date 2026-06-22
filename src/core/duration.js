// src/core/duration.js — parse a human duration that also supports weeks.
// escalate.parseDuration only handles m/h/d (and automod depends on it), so the
// moderation commands use this longer-range parser instead.
// Returns milliseconds, or 0 for invalid/empty input.
const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

function parseDuration(str) {
  const m = /^(\d+)\s*([mhdw])$/i.exec(String(str ?? '').trim());
  return m ? Number(m[1]) * UNIT_MS[m[2].toLowerCase()] : 0;
}

module.exports = { parseDuration, UNIT_MS };
