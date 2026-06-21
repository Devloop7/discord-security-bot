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
};

function all() { return store.read(FILE, {}); }
function get(guildId) { return { ...structuredClone(DEFAULTS), ...(all()[guildId] || {}) }; }
function set(guildId, patch) {
  return store.mutate(FILE, (d) => { d[guildId] = { ...DEFAULTS, ...(d[guildId] || {}), ...patch }; return d[guildId]; });
}
module.exports = { get, set, DEFAULTS };
