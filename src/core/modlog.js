// src/core/modlog.js — standardized, branded moderation-log embeds. Never throws.
const { EmbedBuilder } = require('discord.js');
const config = require('../../config');
const guildConfig = require('./guildConfig');
const { brandFooter, COLORS } = require('../ui/theme');
const logger = require('./logger');

/**
 * log(guild, { title, description, color, ping, fields })
 * Posts a consistent, branded embed to the configured mod-log channel.
 */
async function log(guild, { title, description, color = COLORS.warning, ping = false, fields } = {}) {
  try {
    const gc = guildConfig.get(guild.id);
    const channelId = gc.modLogChannelId || config.modLogChannelId;
    const alertRoleId = gc.alertRoleId || config.alertRoleId;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setFooter(brandFooter(guild))
      .setTimestamp();
    if (title) embed.setTitle(title);
    if (description) embed.setDescription(description);
    if (Array.isArray(fields) && fields.length) embed.addFields(fields);

    const content = ping && alertRoleId ? `<@&${alertRoleId}>` : undefined;
    await channel.send({ content, embeds: [embed] });
  } catch (err) {
    logger.error('[modlog] failed:', err.message);
  }
}

module.exports = { log };
