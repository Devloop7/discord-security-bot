// src/core/modlog.js
const { EmbedBuilder } = require('discord.js');
const config = require('../../config');
const guildConfig = require('./guildConfig');
const logger = require('./logger');

// Sends a standardized embed to the mod-log channel. Never throws.
async function log(guild, { title, description, color = 0xE67E22, ping = false }) {
  try {
    const gc = guildConfig.get(guild.id);
    const channelId = gc.modLogChannelId || config.modLogChannelId;
    const alertRoleId = gc.alertRoleId || config.alertRoleId;
    const channel = guild.channels.cache.get(channelId);
    if (!channel) return;
    const embed = new EmbedBuilder()
      .setTitle(title)
      .setDescription(description)
      .setColor(color)
      .setTimestamp();
    const content = ping && alertRoleId ? `<@&${alertRoleId}>` : undefined;
    await channel.send({ content, embeds: [embed] });
  } catch (err) {
    logger.error('[modlog] failed:', err.message);
  }
}

module.exports = { log };
