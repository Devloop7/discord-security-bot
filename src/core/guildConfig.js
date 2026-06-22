// src/core/guildConfig.js — per-guild settings (one JSON file keyed by guildId).
const store = require('./store');
const FILE = 'guild-settings.json';

const DEFAULTS = {
  modLogChannelId: null, alertRoleId: null, staffRoleIds: [],
  welcome: { enabled: false, channelId: null, leaveChannelId: null, text: 'Welcome {user}!', leaveText: '{username} left.', card: false, background: null, autoRoleIds: [] },
  invites: { enabled: false, logChannelId: null, fakeAgeDays: 7, rewards: [] },
  leveling: { enabled: false, announceChannelId: null, rate: 1, cooldownSec: 60, noXpChannels: [], levelRoles: [] },
  logging: { channelId: null, events: {} },
  automod: { caps: false, emojiSpam: false, dupText: false },
  reactionRoles: {}, autoresponders: [],
  suggestions: { channelId: null },
};

function all() { return store.read(FILE, {}); }

function isPlainObject(v) {
  return v && typeof v === 'object' && !Array.isArray(v);
}
// Recursively merge `patch` onto `base` (arrays and scalars are replaced wholesale).
function deepMerge(base, patch) {
  const out = { ...base };
  for (const key of Object.keys(patch || {})) {
    out[key] = isPlainObject(base?.[key]) && isPlainObject(patch[key])
      ? deepMerge(base[key], patch[key])
      : patch[key];
  }
  return out;
}

function get(guildId) {
  return deepMerge(structuredClone(DEFAULTS), all()[guildId] || {});
}
function set(guildId, patch) {
  return store.mutate(FILE, (d) => {
    const base = deepMerge(structuredClone(DEFAULTS), d[guildId] || {});
    d[guildId] = deepMerge(base, patch);
    return d[guildId];
  });
}
module.exports = { get, set, deepMerge, DEFAULTS };
