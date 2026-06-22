// src/logging/config.js — logging event catalog + pure gating/resolution helpers.
//
// guildConfig.logging shape:
//   { channelId: string|null,            // master log channel (null => logging OFF)
//     events: { <key>: boolean },         // per-event toggle; absent => ON (when master set)
//     channelOverrides: { <key>: string } // optional per-event channel
//   }
// Behaviour: once a master channel is set, every category logs UNLESS explicitly
// toggled off (events[key] === false). A per-event override channel takes priority.
'use strict';

// Canonical catalog. `key` is used in config + the /logging choices; `label` is human text.
const EVENTS = [
  { key: 'messageDelete', label: 'Message deleted' },
  { key: 'messageEdit', label: 'Message edited' },
  { key: 'messageBulkDelete', label: 'Bulk message delete' },
  { key: 'channelCreate', label: 'Channel created' },
  { key: 'channelDelete', label: 'Channel deleted' },
  { key: 'channelUpdate', label: 'Channel updated' },
  { key: 'roleCreate', label: 'Role created' },
  { key: 'roleDelete', label: 'Role deleted' },
  { key: 'roleUpdate', label: 'Role updated' },
  { key: 'memberJoin', label: 'Member joined' },
  { key: 'memberLeave', label: 'Member left' },
  { key: 'memberBan', label: 'Member banned' },
  { key: 'memberUnban', label: 'Member unbanned' },
  { key: 'memberTimeout', label: 'Member timed out' },
  { key: 'nicknameChange', label: 'Nickname changed' },
  { key: 'roleChange', label: 'Member roles changed' },
  { key: 'voiceActivity', label: 'Voice channel activity' },
  { key: 'inviteCreate', label: 'Invite created' },
  { key: 'emojiChange', label: 'Emoji added/removed/renamed' },
  { key: 'stickerChange', label: 'Sticker added/removed/renamed' },
];

const KEYS = EVENTS.map((e) => e.key);

// A category logs when a master channel exists and it isn't explicitly disabled.
function isEnabled(cfg, key) {
  if (!cfg || !cfg.channelId) return false;
  return cfg.events?.[key] !== false;
}

// Per-event override channel wins, else the master channel.
function resolveChannelId(cfg, key) {
  if (!cfg) return null;
  return (cfg.channelOverrides && cfg.channelOverrides[key]) || cfg.channelId || null;
}

module.exports = { EVENTS, KEYS, isEnabled, resolveChannelId };
