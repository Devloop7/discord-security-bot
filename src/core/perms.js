// src/core/perms.js — shared staff permission check for bypassModGate commands.
const { PermissionFlagsBits } = require('discord.js');
const guildConfig = require('./guildConfig');
const config = require('../../config');

function isStaff(member, guildId) {
  if (!member) return false;
  if (member.permissions?.has?.(PermissionFlagsBits.ManageGuild)) return true;
  const ids = [...(guildConfig.get(guildId).staffRoleIds || [])];
  if (config.mods && config.mods.roleId) ids.push(config.mods.roleId);
  return ids.length > 0 && member.roles?.cache?.some((r) => ids.includes(r.id));
}
module.exports = { isStaff };
