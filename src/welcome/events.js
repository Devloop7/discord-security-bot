// src/welcome/events.js — GuildMemberAdd/Remove handlers: welcome/goodbye text + auto-role.
// Register with client via register(client). TEXT only in this build (no image card).
'use strict';

const { Events } = require('discord.js');
const guildConfig = require('../core/guildConfig');
const { baseEmbed, COLORS, EMOJI } = require('../ui/theme');
const logger = require('../core/logger');

/**
 * Substitute message tokens.
 *  {user}     → member mention (falls back to username if no member)
 *  {username} → member.user.username
 *  {server}   → guild.name
 *  {count}    → guild.memberCount
 * Safe with partial members (uses optional chaining + fallbacks).
 */
function substitute(text, { member, guild }) {
  const user = member?.user || member;
  const username = user?.username || 'member';
  const mention = member?.id ? `<@${member.id}>` : username;
  return String(text ?? '')
    .replace(/\{user\}/g, mention)
    .replace(/\{username\}/g, username)
    .replace(/\{server\}/g, guild?.name ?? 'the server')
    .replace(/\{count\}/g, String(guild?.memberCount ?? ''));
}

async function resolveChannel(guild, channelId) {
  if (!channelId) return null;
  return (
    guild.channels.cache.get(channelId) ||
    (await guild.channels.fetch(channelId).catch(() => null))
  );
}

function register(client) {
  // ── Member joins ───────────────────────────────────────────────────────────
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      const guild = member.guild;
      const cfg = guildConfig.get(guild.id).welcome;
      if (!cfg.enabled) return;

      // Welcome message (branded embed + a real ping in the content).
      if (cfg.channelId && cfg.text) {
        const ch = await resolveChannel(guild, cfg.channelId);
        if (ch && typeof ch.send === 'function') {
          try {
            const avatar = member.user?.displayAvatarURL?.({ size: 256 });
            const embed = baseEmbed(guild, { color: COLORS.brand })
              .setAuthor({ name: `Welcome to ${guild.name}`, iconURL: guild.iconURL?.({ size: 128 }) || undefined })
              .setTitle(`${EMOJI.wave}  Welcome, ${member.user?.username || 'friend'}!`)
              .setDescription(substitute(cfg.text, { member, guild }))
              .addFields({ name: `${EMOJI.owner} Member`, value: `#${guild.memberCount}`, inline: true });
            if (avatar) embed.setThumbnail(avatar);
            await ch.send({
              content: `<@${member.id}>`,
              embeds: [embed],
              allowedMentions: { users: [member.id] },
            });
          } catch (e) {
            logger.error('[welcome:add:send]', e.message);
          }
        }
      }

      // Auto-roles — assign each, wrap individually so one failure doesn't block the rest.
      for (const roleId of cfg.autoRoleIds || []) {
        try {
          await member.roles.add(roleId);
        } catch (e) {
          logger.error('[welcome:add:autorole]', `${roleId}: ${e.message}`);
        }
      }
    } catch (e) {
      logger.error('[welcome:add]', e.message);
    }
  });

  // ── Member leaves ────────────────────────────────────────────────────────────
  client.on(Events.GuildMemberRemove, async (member) => {
    try {
      const guild = member.guild;
      const cfg = guildConfig.get(guild.id).welcome;
      if (!cfg.enabled) return;
      if (!cfg.leaveChannelId || !cfg.leaveText) return;

      const ch = await resolveChannel(guild, cfg.leaveChannelId);
      if (ch && typeof ch.send === 'function') {
        // member may be partial on remove — substitute handles fallbacks.
        try {
          const avatar = member.user?.displayAvatarURL?.({ size: 256 });
          const embed = baseEmbed(guild, { color: COLORS.muted })
            .setTitle(`${EMOJI.wave}  Goodbye`)
            .setDescription(substitute(cfg.leaveText, { member, guild }));
          if (avatar) embed.setThumbnail(avatar);
          await ch.send({ embeds: [embed], allowedMentions: { parse: [] } });
        } catch (e) {
          logger.error('[welcome:remove:send]', e.message);
        }
      }
    } catch (e) {
      logger.error('[welcome:remove]', e.message);
    }
  });
}

module.exports = { register, substitute };
