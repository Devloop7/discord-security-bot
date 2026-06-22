// src/core/access.js — unified command authorization for the slash-command dispatcher.
//
// canRun() layers checks in priority order:
//   1. guild owner            → always allowed (so they can never lock themselves out)
//   2. per-command `disabled` → blocked for everyone else
//   3. per-command denied role → blocked (overrides staff)
//   4. per-command allowed role → allowed (additive grant, even to non-staff)
//   5. bypassModGate commands → allowed by default (public)
//   6. ManageGuild permission → allowed
//   7. staff roles (guildConfig.staffRoleIds ∪ permissions.staffLevels.mod/admin ∪ config.mods.roleId)
//   8. otherwise              → blocked
//
// With no `permissions` config this reduces to the original gate
// (owner / ManageGuild / staff role), so existing servers see no behaviour change.
'use strict';

const { PermissionFlagsBits } = require('discord.js');
const guildConfig = require('./guildConfig');
const config = require('../../config');

function roleIdsOf(member) {
  return member.roles?.cache ? [...member.roles.cache.keys()] : [];
}

// Returns { ok: true } or { ok: false, reason }.
function canRun(member, commandName, guildId, opts = {}) {
  if (!member) return { ok: false, reason: 'No member context.' };
  if (member.guild && member.id === member.guild.ownerId) return { ok: true };

  const gc = guildConfig.get(guildId);
  const perms = gc.permissions || {};
  const ov = (perms.commandOverrides && perms.commandOverrides[commandName]) || {};
  const roleIds = roleIdsOf(member);

  if (ov.disabled) return { ok: false, reason: 'That command is disabled in this server.' };
  if (Array.isArray(ov.deniedRoleIds) && ov.deniedRoleIds.some((id) => roleIds.includes(id))) {
    return { ok: false, reason: 'You are not allowed to use that command.' };
  }
  if (Array.isArray(ov.allowedRoleIds) && ov.allowedRoleIds.some((id) => roleIds.includes(id))) {
    return { ok: true };
  }

  // Public commands: allowed unless explicitly disabled/denied above.
  if (opts.bypassModGate) return { ok: true };

  if (member.permissions?.has?.(PermissionFlagsBits.ManageGuild)) return { ok: true };

  const staffRoleIds = [
    ...(gc.staffRoleIds || []),
    ...((perms.staffLevels && perms.staffLevels.mod) || []),
    ...((perms.staffLevels && perms.staffLevels.admin) || []),
    ...(config.mods && config.mods.roleId ? [config.mods.roleId] : []),
  ];
  if (staffRoleIds.some((id) => roleIds.includes(id))) return { ok: true };

  return { ok: false, reason: 'You are not allowed to use that command.' };
}

module.exports = { canRun };
