// src/protection/antinuke.js
const { Events, AuditLogEvent, PermissionFlagsBits } = require('discord.js');
const RateWindow = require('../core/ratewindow');
const { isTrusted } = require('../core/whitelist');
const { fetchExecutor } = require('../core/auditlog');
const modlog = require('../core/modlog');
const config = require('../../config');
const logger = require('../core/logger');

const DANGEROUS = [
  PermissionFlagsBits.Administrator,
  PermissionFlagsBits.BanMembers,
  PermissionFlagsBits.KickMembers,
  PermissionFlagsBits.ManageGuild,
  PermissionFlagsBits.ManageRoles,
  PermissionFlagsBits.ManageChannels,
  PermissionFlagsBits.ManageWebhooks,
];

function register(client) {
  const window = new RateWindow(config.antinuke.perSeconds * 1000);

  async function handleAction(guild, executorId, label) {
    if (!executorId) return;
    const member = await guild.members.fetch(executorId).catch(() => null);
    if (!member || isTrusted(member) || member.id === client.user.id) return;

    const count = window.record(executorId);
    if (count < config.antinuke.maxActions) return;
    window.reset(executorId);

    // Strip roles first (stops further damage), then ban per config.
    await member.roles.set([], 'Anti-nuke: destructive action burst').catch(() => {});
    let outcome = 'roles stripped';
    if (config.antinuke.punishment === 'ban' && member.bannable) {
      await member.ban({ reason: 'Anti-nuke: nuke attempt' }).catch(() => {});
      outcome = 'roles stripped + BANNED';
    }

    await modlog.log(guild, {
      title: '🛡️ ANTI-NUKE TRIGGERED',
      description: `**User:** ${member.user.tag} (${member.id})\n**Trigger:** ${label} ×${count} in ${config.antinuke.perSeconds}s\n**Action:** ${outcome}`,
      color: 0xE74C3C, ping: true,
    });
  }

  client.on(Events.ChannelDelete, async (ch) => {
    const r = await fetchExecutor(ch.guild, AuditLogEvent.ChannelDelete, ch.id);
    if (r) handleAction(ch.guild, r.executorId, 'channel delete');
  });
  client.on(Events.ChannelCreate, async (ch) => {
    const r = await fetchExecutor(ch.guild, AuditLogEvent.ChannelCreate, ch.id);
    if (r) handleAction(ch.guild, r.executorId, 'channel create');
  });
  client.on(Events.GuildRoleDelete, async (role) => {
    const r = await fetchExecutor(role.guild, AuditLogEvent.RoleDelete, role.id);
    if (r) handleAction(role.guild, r.executorId, 'role delete');
  });
  client.on(Events.GuildBanAdd, async (ban) => {
    const r = await fetchExecutor(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id);
    if (r) handleAction(ban.guild, r.executorId, 'member ban');
  });
  client.on(Events.GuildMemberRemove, async (member) => {
    const r = await fetchExecutor(member.guild, AuditLogEvent.MemberKick, member.id);
    if (r) handleAction(member.guild, r.executorId, 'member kick');
  });

  // Permission-grant watch: revert dangerous permission additions to a role.
  client.on(Events.GuildRoleUpdate, async (oldRole, newRole) => {
    try {
      const gainedDangerous = DANGEROUS.some(
        (p) => !oldRole.permissions.has(p) && newRole.permissions.has(p),
      );
      if (!gainedDangerous) return;
      const r = await fetchExecutor(newRole.guild, AuditLogEvent.RoleUpdate, newRole.id);
      const member = r?.executorId ? await newRole.guild.members.fetch(r.executorId).catch(() => null) : null;
      if (member && (isTrusted(member) || member.id === client.user.id)) return;

      await newRole.setPermissions(oldRole.permissions, 'Anti-nuke: reverted dangerous permission grant').catch(() => {});
      await modlog.log(newRole.guild, {
        title: '🛡️ Dangerous permission grant reverted',
        description: `**Role:** ${newRole.name}\n**By:** ${member ? member.user.tag : 'unknown'}`,
        color: 0xF1C40F, ping: true,
      });
      if (member) handleAction(newRole.guild, member.id, 'permission grant');
    } catch (err) {
      logger.error('[antinuke:roleupdate]', err.message);
    }
  });
}

module.exports = { register };
