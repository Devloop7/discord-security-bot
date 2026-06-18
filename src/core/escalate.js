// src/core/escalate.js
const UNIT_MS = { m: 60_000, h: 3_600_000, d: 86_400_000 };

function parseDuration(str) {
  const m = /^(\d+)([mhd])$/.exec(String(str).trim());
  return m ? Number(m[1]) * UNIT_MS[m[2]] : 0;
}

// offenseCount is 1-based; clamps to the last configured step.
function nextTimeout(offenseCount, steps) {
  if (!steps.length) return 0;
  const idx = Math.min(Math.max(offenseCount, 1), steps.length) - 1;
  return parseDuration(steps[idx]);
}

module.exports = { parseDuration, nextTimeout };
