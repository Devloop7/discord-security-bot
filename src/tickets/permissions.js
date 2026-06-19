const { PermissionFlagsBits } = require('discord.js');
const { getConfig } = require('../core/ticketStore');

// Staff = has Manage Channels, or has the configured staff role.
function isStaff(member, guildId) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.ManageChannels)) return true;
  const staffRoleId = getConfig(guildId).staffRoleId;
  return !!staffRoleId && member.roles.cache.has(staffRoleId);
}
function canManageTicket(member, guildId) { return isStaff(member, guildId); }
function canCloseTicket(member, guildId, ticket) {
  return isStaff(member, guildId) || (ticket && member?.id === ticket.userId);
}
module.exports = { isStaff, canManageTicket, canCloseTicket };
