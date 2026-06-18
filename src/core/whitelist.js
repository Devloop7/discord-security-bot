// src/core/whitelist.js
const config = require('../../config');

// ANTI-NUKE trust: ONLY the server owner + explicitly listed users. Admins are
// NOT trusted by default — a nuke usually comes from a compromised admin.
function isTrusted(member) {
  if (!member) return false;
  if (member.id === member.guild?.ownerId) return true;
  return config.trustedUsers.includes(member.id);
}

// LINK permission: trusted roles or allowed channels may post links.
function canPostLinks(member, channelId) {
  if (config.link.allowedChannels.includes(channelId)) return true;
  return member.roles.cache.some((r) => config.link.allowedRoles.includes(r.id));
}

module.exports = { isTrusted, canPostLinks };
